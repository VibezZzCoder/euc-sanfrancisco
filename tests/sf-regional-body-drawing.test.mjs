// Actual Three CPU scene/geometry/instance output vs e5753c8. No renderer, browser or device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { original, read, baselineAvailable, SfTerrainSampler, FrozenSampler } from './helpers/sf-regional-body-fixture.mjs';

function fixture(variant) {
  const Terrain = { loaded: true, originX: 0, originZ: 0, w: 3, h: 3, cell: 2, waterLevel: -10,
    patches: [{ rect: true, x0: 24, z0: 24, nx: 3, nz: 3, step: 2, h: new Float32Array(9).fill(2) }] };
  const C = { x0: -16, z0: -16, x1: 48, z1: 48, step: 8, w: 9, h: 9,
    heights: Float32Array.from({ length: 81 }, (_, i) => 2 + (i % 9) * .5 + Math.floor(i / 9) * .2),
    tiles: [{ x: -16, z: -16, w: 9, h: 9, size: 64 }] };
  const H = { ...C, x0: 2000, z0: 2000, x1: 2064, z1: 2064, tiles: [{ x: 2000, z: 2000, w: 9, h: 9, size: 64 }] };
  const data = { city: C, horizon: H, mask: new Uint8Array(256), roads: new Float32Array([-12, 12, 45, 12, 12, -12, 12, 45]),
    manifest: { mask: { originX: -16, originZ: -16, w: 16, h: 16 }, waterLevel: -10,
      ferries: [{ name: 'CPU fixture ferry', speed: 4, pts: [[-16, -16], [48, 48]] }], cargo: [[200, 200]] },
    buildings: [{ header: { originX: 0, originZ: 0 }, records: new Int32Array([100, 100, 100, 200, 40, 60, 5000,
      12050, 100, 100, 250, 90, 80, -3000]) }], trees: new Float32Array([20, 2, 20, 10, 1300, 40, -20, 8]) };
  const N = { THREE, TSL, Terrain, DATA: { fullRegion: data }, cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } };
  for (const name of ['sf-ride-geometry', 'region']) new Function('window', 'location', variant === 'baseline' ? original(`js/${name}.js`) : read(`js/${name}.js`).toString())({ NYC: N }, { search: '' });
  const scene = new THREE.Scene(), region = N.buildSFRegion(scene);
  const s = new (variant === 'baseline' ? FrozenSampler : SfTerrainSampler)({ city: N });
  s.releaseConstructionRegistry(N.ride);
  return { scene, region, s };
}
function state(f) {
  const h = createHash('sha256'), number = Buffer.alloc(8); let meshes = 0, bytes = 0;
  const add = v => { if (typeof v === 'number') { number.writeDoubleLE(v); h.update(number); } else h.update(String(v) + ';'); };
  f.scene.traverse(o => {
    add(o.name); add(o.type); add(o.visible); add(o.castShadow); add(o.receiveShadow);
    for (const a of [o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()]) for (const n of a) add(n);
    if (!o.geometry) return;
    meshes++; add(o.count); add(o.geometry.drawRange.start); add(o.geometry.drawRange.count);
    for (const [name, a] of Object.entries({ ...o.geometry.attributes, index: o.geometry.index, instances: o.instanceMatrix, colors: o.instanceColor })) {
      add(name); if (!a) continue; add(a.itemSize); add(a.count); add(a.normalized); add(a.array.constructor.name);
      const b = Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength); bytes += b.length; h.update(b);
    }
  });
  return { sha256: h.digest('hex'), meshes, bytes, stats: f.region.stats() };
}
function dispose(f) {
  f.region.disposeTerrainCache(); const resources = new Set();
  f.scene.traverse(o => { if (o.geometry) resources.add(o.geometry); for (const m of [].concat(o.material ?? [])) resources.add(m); });
  for (const r of resources) r.dispose(); f.scene.clear();
}
test('regional drawing, instance buffers, animation/LOD return and independent render ownership remain byte-exact',
  { skip: !baselineAvailable && 'private e5753c8 baseline unavailable' }, t => {
    const a = fixture('baseline'), b = fixture('candidate');
    try {
      const samples = [];
      assert.equal(b.s.stats.staticBoxStore.regionalBoxes, 2); assert.equal(b.s.stats.regionalPrismStore.regionalPrisms, 2);
      for (const [i, x] of [3000, 16, 6000, 3000, 16].entries()) {
        for (const f of [a, b]) f.region.update({ position: { x, y: 80, z: 16 } }, i + 1, { x: 10000, z: 10000 });
        const expected = state(a), actual = state(b);
        assert.equal(actual.sha256, expected.sha256, `exact output at update ${i}`);
        assert.equal(actual.bytes, expected.bytes); assert.deepEqual(actual.stats, expected.stats); samples.push(actual);
      }
      assert.ok(samples[1].bytes > samples[2].bytes, 'fine/coarse terrain actually changes');
      t.diagnostic(JSON.stringify({ samples }));
    } finally { dispose(a); dispose(b); }
  });
