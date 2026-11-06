// CPU-only actual tree construction/differential checks. No renderer, browser or GPU device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as THREE from '../vendor/three/build/three.webgpu.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('js/trees.js');
const baselineRef = '32039e3456255f67f9399565c5210c265203ca58';
const baselineHash = 'e7469a28e37ab4817495dcb6bc191c81f631c59805d724b17cbf671bd46b4fc4';
const hash = text => createHash('sha256').update(text).digest('hex');
const baseline = process.env.SF_TREE_BASELINE
  ? readFileSync(process.env.SF_TREE_BASELINE, 'utf8')
  : gitHistory(root, baselineRef).read('js/trees.js');
if (baseline !== null) assert.equal(hash(baseline), baselineHash, 'use the exact pre-hierarchy SF source');
const differential = { skip: baseline === null && 'set SF_TREE_BASELINE to the pinned trees.js in Git-free exports' };
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const noop = () => {};
const pixels = new Uint8ClampedArray(1024 * 1024 * 4);
const context = {
  fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, bezierCurveTo: noop,
  closePath: noop, arc: noop, fill: noop, stroke: noop, getImageData: () => ({ data: pixels })
};
const document = { createElement: () => ({ getContext: () => context }) };

function field(code, sites, { math = Math, terrain = { loaded: false }, hook = noop } = {}) {
  // Only canvas rasterization and material construction are stubbed. Run real geometry, matrices,
  // trunk registration, hook, selector and repack in the host realm (no VM-intrinsic timing overhead).
  const window = { NYC: { THREE, Terrain: terrain, createTreeMaterial: () => new THREE.MeshBasicMaterial() } };
  new Function('window', read('js/sf-ride-geometry.js'))(window);
  new Function('window', 'document', 'Math', code)(window, document, math);
  const scene = new THREE.Scene();
  scene.onBeforeRender = hook;
  const result = window.NYC.createTreeField(scene, sites);
  scene.add(result.group);
  return { ...result, scene, bodies: window.NYC.ride };
}
function dispose(f) {
  for (const mesh of f.meshes) { mesh.dispose(); mesh.geometry.dispose(); }
  f.material.dispose(); f.atlas.texture.dispose(); f.scene.clear();
}
function fixture(n = 1200) {
  return Array.from({ length: n }, (_, i) => ({
    x: (i % 37 - 18) * 63.7 + (i * 17 % 43) / 10,
    z: (Math.floor(i / 37) - n / 74) * 62.3 + (i * 29 % 31) / 10,
    y: [-0.3, 0.15, 8, 65, 350][i % 5], scale: 0.4 + (i % 17) / 10,
    species: i % 6, tier: Math.floor(i / 7) % 3,
    yaw: (i % 23) * 0.3, sx: 0.6 + (i % 5) * 0.3, sz: 0.8 + (i % 7) * 0.1
  }));
}
function sameDraws(a, b) {
  assert.equal(a.meshes.length, 30); assert.equal(b.meshes.length, 30);
  for (let i = 0; i < a.meshes.length; i++) {
    const x = a.meshes[i], y = b.meshes[i];
    assert.equal(x.name, y.name); assert.equal(x.count, y.count); assert.equal(x.visible, y.visible);
    assert.equal(x.instanceMatrix.count, y.instanceMatrix.count);
    assert.equal(x.castShadow, true); assert.equal(x.receiveShadow, true); assert.equal(x.frustumCulled, false);
    assert.equal(x.parent, a.group, 'CPU cells do not add render groups');
    for (const [aa, bb, size] of [[x.instanceMatrix, y.instanceMatrix, 16],
      [x.geometry.attributes.aTreeData, y.geometry.attributes.aTreeData, 4]]) {
      assert.deepEqual(bytes(aa.array.subarray(0, x.count * size)), bytes(bb.array.subarray(0, y.count * size)), x.name);
      assert.deepEqual(aa.updateRanges, bb.updateRanges, `${x.name} upload ranges`);
      assert.equal(aa.version, bb.version, `${x.name} dirty version`);
    }
  }
}
function compare(a, b, p) { assert.equal(a.update(p), b.update(p), `changed at ${p.toArray()}`); sameDraws(a, b); }
function counter() {
  let count = 0;
  const math = Object.create(Math);
  math.sqrt = x => { count++; return Math.sqrt(x); };
  return { math, reset: () => { count = 0; }, get: () => count };
}

test('six-species geometry, ordered transforms/data, capacities and independent trunk registrations match SF baseline', differential, () => {
  assert.equal(source.slice(0, source.indexOf('// 5. TREE FIELD')), baseline.slice(0, baseline.indexOf('// 5. TREE FIELD')));
  const sites = fixture(), originalSites = JSON.stringify(sites);
  const a = field(source, sites), b = field(baseline, sites);
  assert.equal(JSON.stringify(a.stats), JSON.stringify(b.stats));
  assert.equal(JSON.stringify(a.bodies), JSON.stringify(b.bodies));
  sameDraws(a, b);
  for (let i = 0; i < a.meshes.length; i++) {
    const x = a.meshes[i], y = b.meshes[i];
    for (const key of Object.keys(x.geometry.attributes)) {
      assert.deepEqual(bytes(x.geometry.attributes[key].array), bytes(y.geometry.attributes[key].array), `${x.name}/${key}`);
    }
    assert.deepEqual(bytes(x.geometry.index.array), bytes(y.geometry.index.array));
  }
  const bodyHash = hash(JSON.stringify(a.bodies));
  for (let i = 0; i < 100; i++) compare(a, b, vec(Math.sin(i * 0.4) * 1500, [3, 39, 40, 44, 100, 700][i % 6], -2500 + i * 65));
  for (const f of [a, b]) for (const m of f.meshes) m.instanceMatrix = new THREE.StorageInstancedBufferAttribute(m.instanceMatrix.array, 16);
  for (let i = 0; i < 40; i++) compare(a, b, vec(700 - i * 40, i % 2 ? 12 : 120, -200 + i * 32));
  compare(a, b, vec(30000, 100, 30000));
  assert.equal(hash(JSON.stringify(a.bodies)), bodyHash, 'view selection never changes physics');
  assert.equal(JSON.stringify(sites), originalSites);
  dispose(a); dispose(b);
});

const floatBits = new DataView(new ArrayBuffer(8));
function adjacent(x, direction) {
  floatBits.setFloat64(0, x);
  floatBits.setBigUint64(0, floatBits.getBigUint64(0) + BigInt(direction));
  return floatBits.getFloat64(0);
}
test('exact LOD/cutoff edges, adjacent doubles and hysteresis reversals match for every tier and low/aloft policy', differential, () => {
  for (const tier of [0, 1, 2]) {
    // The hash's nonzero Y salt matters even at x=z=0. Cancel its scale jitter so the Float32 crown is (0,6,0).
    const seed = Math.sin(1.3 * 311.7) * 43758.5453;
    const scale = 1 / (0.9 + (seed - Math.floor(seed)) * 0.2);
    const sites = [{ x: 0, z: 0, y: 0, scale, species: tier + 3, tier }];
    const a = field(source, sites), b = field(baseline, sites);
    for (const y of [6, 40]) {
      const cutoff = y < 40 ? [1150, 1150, 950][tier] : [3000, 1600, 950][tier];
      for (const edge of [105, 420, cutoff]) for (const delta of [-6, 0, 6]) {
        const d = edge + delta;
        for (const distance of [adjacent(d, -1), d, adjacent(d, 1)]) {
          const x = Math.sqrt(distance * distance - (y - 6) ** 2);
          for (const start of [0, edge - 20, edge + 20, 5000]) {
            compare(a, b, vec(-start, y, 0));
            compare(a, b, vec(x, y, 0));
          }
        }
      }
    }
    const level = () => a.meshes.find(m => m.visible && m.count)?.name.match(/lod(\d)/)[1];
    compare(a, b, vec(0, 6, 0)); assert.equal(level(), '0');
    compare(a, b, vec(-110, 6, 0)); assert.equal(level(), '0', 'outward hysteresis holds');
    compare(a, b, vec(111, 6, 0)); assert.equal(level(), '1', 'exact outward edge changes');
    compare(a, b, vec(-100, 6, 0)); assert.equal(level(), '1', 'inward hysteresis holds');
    compare(a, b, vec(99, 6, 0)); assert.equal(level(), '0', 'exact inward edge changes');
    dispose(a); dispose(b);
  }
});

test('mixed-tier cells, signed cell corners and large elevation spread retain all boundary decisions', differential, () => {
  const sites = [];
  for (const origin of [-400, -200, 0, 200]) for (const x of [0.001, 199.999]) for (const z of [0.001, 199.999]) {
    for (const tier of [0, 1, 2]) sites.push({ x: origin + x, z: origin + z + tier * 0.0001,
      y: tier === 1 ? 350 : 0.15, scale: tier + 0.5, species: (sites.length % 6), tier });
  }
  const a = field(source, sites), b = field(baseline, sites);
  for (const y of [3, 39.999, 40, 42, 350, 3100]) {
    for (const d of [5000, 3010, 2990, 1610, 1590, 1160, 1140, 960, 940, 430, 410, 115, 95, 0]) {
      compare(a, b, vec(d * Math.SQRT1_2, y, d * Math.SQRT1_2));
      compare(a, b, vec(-d * Math.SQRT1_2, y, -d * Math.SQRT1_2));
    }
  }
  dispose(a); dispose(b);
});

test('SF 10m/terrain-height gate retains the last admitted camera, including exact gate edges', differential, () => {
  const c = counter(), terrain = { loaded: true, groundAt: () => 150 };
  const a = field(source, fixture(60), { math: c.math, terrain }), b = field(baseline, fixture(60), { terrain });
  compare(a, b, vec(0, 200, 0));
  c.reset(); compare(a, b, vec(9.999999, 200, 0)); assert.equal(c.get(), 0);
  c.reset(); compare(a, b, vec(10, 200, 0)); assert.ok(c.get() > 0, '50m above terrain still uses 10m gate');
  c.reset(); compare(a, b, vec(19, 200, 0)); assert.equal(c.get(), 0);
  c.reset(); compare(a, b, vec(20, 200, 0)); assert.ok(c.get() > 0);
  terrain.groundAt = () => 0;
  c.reset(); compare(a, b, vec(59.999999, 200, 0)); assert.equal(c.get(), 0);
  c.reset(); compare(a, b, vec(60, 200, 0)); assert.ok(c.get() > 0, '40m airborne gate');
  terrain.loaded = false;
  terrain.groundAt = () => assert.fail('unloaded terrain is not sampled');
  c.reset(); compare(a, b, vec(99.999999, 200, 0)); assert.equal(c.get(), 0);
  c.reset(); compare(a, b, vec(100, 200, 0)); assert.ok(c.get() > 0);
  dispose(a); dispose(b);
});

test('render hook remains the sole view owner, chains prior hook, uses world position and ignores shadow/array cameras', differential, () => {
  const calls = [], c = counter();
  const hook = function (...args) { calls.push({ receiver: this, args }); };
  const a = field(source, fixture(120), { hook, math: c.math }), b = field(baseline, fixture(120));
  const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  parent.position.set(700, 90, -200); camera.position.set(21, 5, 19); parent.add(camera); parent.updateMatrixWorld(true);
  const renderer = {}, target = {};
  a.scene.onBeforeRender(renderer, a.scene, camera, target);
  b.scene.onBeforeRender(renderer, b.scene, camera, target);
  sameDraws(a, b);
  assert.equal(calls[0].receiver, a.scene); assert.deepEqual(calls[0].args, [renderer, a.scene, camera, target]);
  c.reset(); a.update(camera.getWorldPosition(new THREE.Vector3())); assert.equal(c.get(), 0, 'hook already selected the world view');
  for (const shadow of [new THREE.OrthographicCamera(), new THREE.ArrayCamera()]) {
    shadow.position.set(30000, 1000, 30000); shadow.updateMatrixWorld(true);
    c.reset(); a.scene.onBeforeRender(renderer, a.scene, shadow, target); assert.equal(c.get(), 0);
    sameDraws(a, b);
  }
  assert.equal(calls.length, 3, 'previous hook still sees every pass');
  dispose(a); dispose(b);
});

test('startup stand-ins/precompile visibility and first real rebuild preserve SF behavior, including empty fields', differential, () => {
  assert.equal(source.slice(source.indexOf('  // Follow the view camera')), baseline.slice(baseline.indexOf('  // Follow the view camera')),
    'hook, startup, warm-up stand-ins and public return contract are unchanged');
  for (const sites of [[], [{ x: 12000, y: 0, z: 20, scale: 1, species: 5 }]]) {
    const a = field(source, sites), b = field(baseline, sites);
    sameDraws(a, b);
    assert.ok(a.meshes.every(m => m.visible && m.count === 1));
    assert.ok(a.meshes.every(m => m.instanceMatrix.array.slice(0, 16).every(x => x === 0)));
    const jobs = []; a.scene.traverseVisible(o => { if (o.isInstancedMesh) jobs.push(o); });
    assert.deepEqual(jobs, a.meshes, 'all thirty existing pools remain available to precompile');
    compare(a, b, vec(1, 10, 140));
    assert.ok(a.meshes.every(m => m.visible && m.count === 1), 'substep does not retire baseline stand-ins');
    compare(a, b, vec(12000, 6, 20));
    compare(a, b, vec(30000, 100, 30000));
    if (sites.length) assert.ok(a.meshes.every(m => !m.visible && m.count === 0));
    else assert.ok(a.meshes.every(m => m.visible && m.count === 1), 'empty-field baseline stand-ins remain unchanged');
    dispose(a); dispose(b);
  }
});

test('global pools retain camera/shadow projection and hierarchy skips safe cells but scans boundary cells', () => {
  const sites = Array.from({ length: 600 }, (_, i) => ({
    x: (Math.floor(i / 50) % 4 - 2) * 200 + 50 + (i % 50) * 0.01,
    z: (Math.floor(i / 200) - 1) * 200 + 50 + (i % 50) * 0.01,
    scale: 1, species: i % 6, tier: i % 3
  }));
  const c = counter(), f = field(source, sites, { math: c.math });
  if (baseline) {
    const controlCounter = counter(), control = field(baseline, sites, { math: controlCounter.math });
    control.update(vec(20000, 80, 20000)); controlCounter.reset();
    assert.equal(control.update(vec(20020, 80, 20000)), false);
    assert.equal(controlCounter.get(), 600, 'negative performance control: original scans every tree');
    dispose(control);
  }
  f.update(vec(20000, 80, 20000)); c.reset();
  assert.equal(f.update(vec(20020, 80, 20000)), false); assert.equal(c.get(), 12, 'one distance per hidden cell');
  c.reset(); assert.equal(f.update(vec(50, 6, 50)), true); assert.equal(c.get(), 12, 'uniform visible bands');
  c.reset(); assert.equal(f.update(vec(55, 6, 50)), false); assert.equal(c.get(), 0, 'sub-10m gate');
  c.reset(); f.update(vec(155, 6, 50)); assert.ok(c.get() > 12, 'boundary cells retain per-tree distances');
  const cpu = { sortObjects: false, _projectObject: THREE.WebGPURenderer.prototype._projectObject };
  for (const camera of [new THREE.PerspectiveCamera(), new THREE.OrthographicCamera()]) {
    camera.position.set(100000, 100000, 100000);
    const submitted = [];
    for (const mesh of f.meshes) mesh.intersectsFrustum = () => assert.fail('CPU cell bounds never reject drawn canopy/shadows');
    cpu._projectObject(f.group, camera, 0, { push: mesh => submitted.push(mesh) }, null);
    assert.deepEqual(submitted, f.meshes.filter(m => m.visible && m.count));
  }
  dispose(f);
});

test('committed SF planting matches baseline; optional bounded actual-field CPU benchmark', differential, t => {
  const window = { NYC: {} };
  for (const f of ['sf-geodata', 'city-config', 'terrain']) new Function('window', read(`js/${f}.js`))(window);
  const bin = readFileSync(new URL('data/terrain-core.bin', root)), n = bin.readUInt32LE(4);
  const header = JSON.parse(bin.toString('utf8', 8, 8 + n));
  const q = new Uint16Array(bin.buffer.slice(bin.byteOffset + 8 + n, bin.byteOffset + bin.length));
  const terrain = window.NYC.Terrain; terrain.load(header, q);
  const planting = read('js/sf-street-details.js');
  const sites = new Function('window', 'blockAt', 'groundAt', 'CURB_H',
    planting.slice(planting.indexOf('  const SPECIES_OF'), planting.indexOf('  const treeField =')) + '\nreturn sites;')(
    window, window.NYC.blockAt, (x, z) => terrain.groundAt(x, z), window.NYC.CURB_H);
  assert.equal(sites.length, 22886);
  const cells = new Set(sites.map(s => `${Math.floor(s.x / 200)},${Math.floor(s.z / 200)}`)).size;
  assert.equal(cells, 410);
  const a = field(source, sites, { terrain }), b = field(baseline, sites, { terrain });
  assert.equal(a.bodies.prisms.length, 45772);
  assert.equal(hash(JSON.stringify(a.bodies)), hash(JSON.stringify(b.bodies)));
  const paths = {
    continuousCore: Array.from({ length: 120 }, (_, i) => { const x = -600 + i * 12; return vec(x, terrain.groundAt(x, -200) + 8, -200); }),
    coreJumps: Array.from({ length: 120 }, (_, i) => { const s = sites[i * 127 % sites.length]; return vec(s.x + i % 3 * 11, [s.y + 8, 39.999, 40, 120, 400][i % 5], s.z); }),
    hidden: Array.from({ length: 120 }, (_, i) => vec(20000 + i * 30, 100, 20000))
  };
  for (const path of Object.values(paths)) for (const p of path) compare(a, b, p);
  t.diagnostic(JSON.stringify({ sites: sites.length, cells, bodyPrisms: a.bodies.prisms.length,
    equivalentViews: Object.values(paths).reduce((n, p) => n + p.length, 0), sfBaselineSHA256: baselineHash, currentSHA256: hash(source) }));
  if (process.env.SF_TREE_BENCH === '1') {
    const median = values => { const a = values.slice().sort((x, y) => x - y); return (a[2] + a[3]) / 2; };
    for (const [name, path] of Object.entries(paths)) {
      const times = [[], []];
      for (let round = 0; round < 8; round++) for (const k of round % 2 ? [1, 0] : [0, 1]) {
        const f = [b, a][k]; f.update(vec(-30000, 20, -30000));
        const start = performance.now(); for (const p of path) f.update(p);
        const elapsed = (performance.now() - start) / path.length;
        if (round >= 2) times[k].push(elapsed);
      }
      t.diagnostic(JSON.stringify({ path: name, viewsPerBlock: path.length, measuredBlocks: 6,
        baselineMsPerUpdate: median(times[0]), hierarchyMsPerUpdate: median(times[1]), blocksMsPerUpdate: times,
        scope: 'Node CPU selector+repack; normal Math, no counters in timed windows; not native riding/FPS/GPU evidence' }));
    }
  }
  dispose(a); dispose(b);
});
