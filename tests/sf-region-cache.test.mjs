// Exercise actual regional cache switches/dispose events with Three CPU objects; no renderer/device/browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';

const read = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
function build({ absent = false, disabled = false } = {}) {
  const Terrain = { loaded: true, originX: 0, originZ: 0, w: 3, h: 3, cell: 2, waterLevel: -10,
    patches: [{ rect: true, x0: 24, z0: 24, nx: 3, nz: 3, step: 2, h: new Float32Array(9).fill(2) }] };
  const C = { x0: -16, z0: -16, x1: 48, z1: 48, step: 8, w: 9, h: 9,
    heights: Float32Array.from({ length: 81 }, (_, i) => 2 + (i % 9) * 0.5 + Math.floor(i / 9) * 0.2),
    tiles: [{ x: -16, z: -16, w: 9, h: 9, size: 64 }] };
  const H = { ...C, x0: 2000, z0: 2000, x1: 2064, z1: 2064, tiles: [{ x: 2000, z: 2000, w: 9, h: 9, size: 64 }] };
  const data = { city: C, horizon: H, mask: new Uint8Array(256), roads: new Float32Array(),
    manifest: { mask: { originX: -16, originZ: -16, w: 16, h: 16 }, waterLevel: -10,
      ferries: [{ name: 'CPU fixture ferry', speed: 4, pts: [[-16, -16], [48, 48]] }], cargo: [[200, 200]] },
    buildings: [{ header: { originX: 0, originZ: 0 }, records: new Int32Array([100, 100, 100, 200, 40, 60, 5000]) }],
    trees: new Float32Array([20, 2, 20, 10]) };
  const window = { NYC: { THREE, TSL, Terrain, DATA: absent ? {} : { fullRegion: data },
    cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } } };
  new Function('window', read('sf-ride-geometry'))(window);
  new Function('window', 'location', read('region'))(window, { search: disabled ? '?region=0' : '' });
  const scene = new THREE.Scene(), region = window.NYC.buildSFRegion(scene);
  return { region, scene, ride: window.NYC.ride, data };
}
const countDisposals = geometry => {
  let n = 0; geometry.addEventListener('dispose', () => { n++; }); return () => n;
};
function sceneDispose(scene) {
  const geometries = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
  for (const geometry of geometries) geometry.dispose();
}

test('regional cached strides remain reusable without eviction; detached variants dispose exactly once in either teardown order', () => {
  for (const sceneFirst of [false, true]) {
    const { region, scene, ride, data } = build();
    const ground = region.group.children.find(m => m.name === 'SFRegionTerrain');
    const horizon = region.group.children.find(m => m.name === 'SFHorizonTerrain');
    const bodySnapshot = JSON.stringify(ride), heights = data.city.heights.slice();
    const coarse = ground.geometry, coarseDisposals = countDisposals(coarse);
    region.update({ position: { x: 3000, z: 16 } }, 1, { x: 10000, z: 10000 });
    const mid = ground.geometry, midDisposals = countDisposals(mid);
    region.update({ position: { x: 16, z: 16 } }, 2, { x: 10000, z: 10000 });
    const fine = ground.geometry, fineDisposals = countDisposals(fine), horizonDisposals = countDisposals(horizon.geometry);
    assert.notEqual(coarse, mid); assert.notEqual(mid, fine);
    assert.ok(fine.index.count > mid.index.count && mid.index.count > coarse.index.count);
    region.update({ position: { x: 6000, z: 16 } }, 3, { x: 10000, z: 10000 });
    assert.equal(ground.geometry, coarse, 'returning to a visited stride reuses its original geometry');
    region.update({ position: { x: 3000, z: 16 } }, 4, { x: 10000, z: 10000 });
    assert.equal(ground.geometry, mid);
    region.update({ position: { x: 6000, z: 16 } }, 5, { x: 16, z: 16 });
    assert.equal(ground.geometry, fine, 'rider-near profile remains fine even with remote camera');
    assert.deepEqual([coarseDisposals(), midDisposals(), fineDisposals(), horizonDisposals()], [0, 0, 0, 0]);
    if (sceneFirst) sceneDispose(scene);
    region.disposeTerrainCache();
    assert.deepEqual([coarseDisposals(), midDisposals(), fineDisposals(), horizonDisposals()],
      [1, 1, Number(sceneFirst), Number(sceneFirst)], 'cache owner excludes current scene-owned geometry');
    region.disposeTerrainCache();
    const before = region.group.children.map(m => ({ geometry: m.geometry, position: m.position.clone(), visible: m.visible }));
    region.setQuality(0, 0);
    region.update({ position: { x: 6000, z: 6000 } }, 100, { x: 10000, z: 10000 });
    region.group.children.forEach((m, i) => {
      assert.equal(m.geometry, before[i].geometry, 'terminal update cannot recreate cached geometry');
      assert.deepEqual(m.position, before[i].position, 'terminal update cannot advance boats/cargo');
      assert.equal(m.visible, before[i].visible);
    });
    if (!sceneFirst) sceneDispose(scene);
    assert.deepEqual([coarseDisposals(), midDisposals(), fineDisposals(), horizonDisposals()], [1, 1, 1, 1]);
    assert.equal(JSON.stringify(ride), bodySnapshot, 'resource teardown never mutates physics');
    assert.deepEqual(data.city.heights, heights, 'DEM remains independently owned');
    scene.clear();
  }
});

test('region cache teardown before any LOD switch leaves attached geometry to scene owner', () => {
  const { region, scene } = build(), geometries = [];
  scene.traverse(o => { if (o.name === 'SFRegionTerrain' || o.name === 'SFHorizonTerrain') geometries.push(o.geometry); });
  const counts = geometries.map(countDisposals);
  region.disposeTerrainCache(); region.disposeTerrainCache();
  assert.ok(counts.every(count => count() === 0));
  sceneDispose(scene); assert.ok(counts.every(count => count() === 1));
  scene.clear();
});

test('absent/disabled region exposes safe no-op cache teardown', () => {
  for (const options of [{ absent: true }, { disabled: true }]) {
    const { region, scene } = build(options);
    region.disposeTerrainCache(); region.disposeTerrainCache(); region.update();
    assert.deepEqual(region.stats(), {}); assert.equal(scene.children.length, 0);
  }
});
