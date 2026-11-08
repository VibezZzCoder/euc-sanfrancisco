// Deferred camera-threshold regional LOD versus the synchronous 4c44b7f path. Three CPU objects only; no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';

const root = new URL('../', import.meta.url);
const ref = '4c44b7f908e46662c7441b05b0e9046f42cb5731';
const history = gitHistory(root, ref);
const baselineTest = optionalSourceTest(history.skip);
const before = history.read('js/region.js');
const after = readFileSync(new URL('js/region.js', root), 'utf8');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const section = (s, start, end) => {
  const a = s.indexOf(start), b = s.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `source anchors: ${start}`);
  return s.slice(a, b);
};

function same(a, b, label) {
  assert.deepEqual(Object.keys(b.attributes), Object.keys(a.attributes), label);
  for (const name of [...Object.keys(a.attributes), 'index']) {
    const x = name === 'index' ? a.index : a.attributes[name], y = name === 'index' ? b.index : b.attributes[name];
    for (const key of ['itemSize', 'normalized', 'count', 'version', 'usage', 'gpuType']) assert.equal(y[key], x[key], `${label} ${name}:${key}`);
    assert.equal(y.array.constructor, x.array.constructor, `${label} ${name}`);
    assert.ok(bytes(y.array).equals(bytes(x.array)), `${label} ${name} bytes`);
    assert.equal(y.array.byteLength, y.array.buffer.byteLength, 'exact-sized owned output');
  }
  for (const key of ['boundingSphere', 'boundingBox', 'groups', 'drawRange']) assert.deepEqual(b[key], a[key], `${label} ${key}`);
}

// 4x3 city tiles of 512 m (64 m cells), one tile over the tiny core (cut path), one seam tile and a horizon tile.
function fixture(source, { budget = null, log = null, fault = null } = {}) {
  class Tracked extends THREE.BufferGeometry {
    constructor() { super(); this.disposals = 0; this.addEventListener('dispose', () => { this.disposals++; }); log?.push(this); }
  }
  class FaultAttribute extends THREE.Float32BufferAttribute {
    constructor(...args) { if (fault?.armed) { fault.armed = false; throw Error('controlled CPU attribute fault'); } super(...args); }
  }
  const three = { ...THREE, BufferGeometry: Tracked, Float32BufferAttribute: FaultAttribute };
  const Terrain = { loaded: true, originX: 0, originZ: 0, w: 3, h: 3, cell: 2, waterLevel: -10, patches: [],
    coreTransition: { patches: [], outer: { x0: 900, z0: 600, x1: 1000, z1: 700 } } };
  const city = { x0: -1000, z0: -500, x1: 1048, z1: 1036, step: 64, w: 33, h: 25,
    heights: Float32Array.from({ length: 33 * 25 }, (_, i) => (i % 7 === 3 ? -20 : 3 + (i % 33) * 1.7 + Math.floor(i / 33) * .9 + Math.sin(i) * 2)),
    tiles: [] };
  for (let tz = 0; tz < 3; tz++) for (let tx = 0; tx < 4; tx++) city.tiles.push({ x: -1000 + tx * 512, z: -500 + tz * 512, w: 9, h: 9, size: 512 });
  const horizon = { ...city, x0: 9000, z0: 9000, x1: 9512, z1: 9512, w: 9, h: 9, heights: new Float32Array(81).fill(40),
    tiles: [{ x: 9000, z: 9000, w: 9, h: 9, size: 512 }] };
  const data = { city, horizon, mask: new Uint8Array(256), roads: new Float32Array(), buildings: [], trees: new Float32Array(),
    manifest: { mask: { originX: -1000, originZ: -500, w: 16, h: 16 }, waterLevel: -10,
      ferries: [{ name: 'CPU ferry', speed: 4, pts: [[-16, -16], [48, 48]] }], cargo: [[200, 200]] } };
  const window = { NYC: { THREE: three, TSL, Terrain, DATA: { fullRegion: data }, cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } } };
  new Function('window', 'location', source)(window, { search: '' });
  const scene = new THREE.Scene(), region = window.NYC.buildSFRegion(scene);
  if (budget !== null) region.setLodBudget(budget);
  const ground = region.group.children.filter(m => m.name === 'SFRegionTerrain' || m.name === 'SFHorizonTerrain');
  return { scene, region, ground };
}
const TILES = [];
for (let tz = 0; tz < 3; tz++) for (let tx = 0; tx < 4; tx++) TILES.push({ x: -1000 + tx * 512, z: -500 + tz * 512 });
const at = (cx, cz) => ({ position: { x: cx, z: cz } });
// [camera x, camera z, rider x, rider z]: remote rider (all camera-threshold), rider-near tiles, revisits.
const STOPS = [[9000, 0, 20000, 20000], [4800, 0, 20000, 20000], [2200, 0, 20000, 20000], [0, 0, 20000, 20000],
  [0, 0, -900, -400], [9000, 0, -900, -400], [5200, 300, 20000, 20000], [1200, 900, 1000, 900], [9000, 9000, 20000, 20000],
  [2600, -200, 20000, 20000], [0, 0, 0, 0]];
const drain = (item, stop, elapsed) => {
  let calls = 0;
  while (item.region.pendingTerrain() > 0) {
    const shown = item.ground.map(m => m.geometry), pending = item.region.pendingTerrain();
    item.region.update(at(stop[0], stop[1]), elapsed, { x: stop[2], z: stop[3] }); calls++;
    const changed = item.ground.filter((m, k) => m.geometry !== shown[k]).length;
    if (item.region.pendingTerrain()) assert.equal(changed, 0, 'no deferred tile is drawn before its whole batch completes');
    else assert.equal(changed, pending, 'the complete deferred batch publishes in one update');
    assert.ok(calls < 64, 'bounded drain');
  }
  return calls;
};

test('regional deferred LOD: geometry builder, normals and loader bytes are unchanged from the synchronous checkpoint', { skip: history.skip }, () => {
  for (const [start, end] of [['  function geometry(', '  for(const [g,far]'], ['function decodeRegionRLE', 'function buildSFRegion('],
    ['  for(const [g,far]of[[C,false],[H,true]])', '  let last=-Infinity']])
    assert.equal(section(after, start, end), section(before, start, end), start);
  assert.match(after, /const stride=item\.seam\|\|rd<250\|\|d<1600\?1:d<4500\?2:4;selectStride\(item,stride,rd<250\);/);
});

baselineTest('regional deferred LOD: budget 0 is the exact synchronous path after every update, with identical cache sizes', () => {
  const logA = [], logB = [];
  const a = fixture(before, { log: logA }), b = fixture(after, { log: logB });
  STOPS.forEach((stop, i) => {
    for (const item of [a, b]) item.region.update(at(stop[0], stop[1]), i + 1, { x: stop[2], z: stop[3] });
    assert.equal(b.region.pendingTerrain(), 0);
    a.ground.forEach((mesh, k) => same(mesh.geometry, b.ground[k].geometry, `sync stop ${i} tile ${k}`));
  });
  assert.equal(logB.length, logA.length, 'same number of constructed geometries');
});

baselineTest('regional deferred LOD: drained outputs are byte-identical to synchronous publication; rider-near/seam tiles never wait', t => {
  for (const budget of [1e-9, 4, 1e9]) {
    const logA = [], logB = [];
    const a = fixture(before, { log: logA }), b = fixture(after, { budget, log: logB });
    let deferredBatches = 0, drainCalls = 0;
    STOPS.forEach((stop, i) => {
      const shown = b.ground.map(m => m.geometry);
      for (const item of [a, b]) item.region.update(at(stop[0], stop[1]), i + 1, { x: stop[2], z: stop[3] });
      // Immediately published tiles (rider protection, seam, cached revisits) already equal the synchronous output.
      const pending = b.region.pendingTerrain();
      b.ground.forEach((mesh, k) => {
        const tile = TILES[k], rd = tile ? Math.hypot(Math.max(tile.x - stop[2], 0, stop[2] - tile.x - 512), Math.max(tile.z - stop[3], 0, stop[3] - tile.z - 512)) : Infinity;
        const seam = tile && tile.x === 1048 - 512 && tile.z === 524;
        if (mesh.geometry !== shown[k] || rd < 250 || seam || !pending) same(a.ground[k].geometry, mesh.geometry, `immediate stop ${i} tile ${k}`);
      });
      if (pending) deferredBatches++;
      drainCalls += drain(b, stop, i + 1);
      a.ground.forEach((mesh, k) => same(mesh.geometry, b.ground[k].geometry, `drained budget ${budget} stop ${i} tile ${k}`));
    });
    assert.ok(deferredBatches >= 3, 'camera-threshold builds were actually deferred');
    if (budget === 1e-9) assert.ok(drainCalls > deferredBatches, 'tiny budget spreads a batch across updates');
    assert.equal(logB.length, logA.length, 'without re-planning, deferred construction builds exactly the synchronous variants');
    assert.ok(logB.every(g => g.disposals === 0), 'no published/cached geometry is disposed while live');
    t.diagnostic(JSON.stringify({ budget, deferredBatches, drainCalls, geometries: logB.length }));
  }
});

baselineTest('regional deferred LOD: re-planned targets discard private results once, never draw them, and still converge exactly', () => {
  const logA = [], logB = [];
  const a = fixture(before, { log: logA }), b = fixture(after, { budget: 1e-9, log: logB });
  const plan = [[2200, 0, 20000, 20000], [4800, 0, 20000, 20000], [0, 0, 20000, 20000], [0, 0, -900, -400], [9000, 0, 20000, 20000]];
  plan.forEach((stop, i) => {
    a.region.update(at(stop[0], stop[1]), i + 1, { x: stop[2], z: stop[3] });
    b.region.update(at(stop[0], stop[1]), i + 1, { x: stop[2], z: stop[3] });
    // One budgeted step only, then a new selection before the batch completes.
    if (b.region.pendingTerrain()) b.region.update(at(stop[0], stop[1]), i + 1, { x: stop[2], z: stop[3] });
  });
  const last = plan.at(-1);
  drain(b, last, plan.length);
  a.ground.forEach((mesh, k) => same(mesh.geometry, b.ground[k].geometry, `re-planned tile ${k}`));
  const attachedOrCached = new Set(b.ground.map(m => m.geometry));
  const discarded = logB.filter(g => g.disposals > 0);
  assert.ok(discarded.length > 0, 'fixture exercised discarded private results');
  for (const g of discarded) { assert.equal(g.disposals, 1); assert.ok(!attachedOrCached.has(g)); }
  assert.ok(logB.length - discarded.length <= logA.length, 'retained variants never exceed the synchronous cache');
  // Terminal teardown cancels pending private work exactly once and never resurrects work.
  b.region.update(at(2200, 0), 100, { x: 20000, z: 20000 });
  b.region.update(at(4800, 0), 101, { x: 20000, z: 20000 });
  b.region.update(at(4800, 0), 101, { x: 20000, z: 20000 });
  const count = logB.length;
  b.region.disposeTerrainCache(); b.region.disposeTerrainCache();
  assert.equal(b.region.pendingTerrain(), 0);
  b.region.update(at(0, 0), 200, { x: 0, z: 0 });
  assert.equal(logB.length, count, 'no construction after terminal teardown');
  const scene = new Set(); b.region.group.traverse(o => { if (o.geometry) scene.add(o.geometry); });
  const owned = logB.filter(g => !g.attributes.aFarPart); // the far-tree template is a shared source, never a terrain variant
  assert.ok(owned.every(g => g.disposals === (scene.has(g) ? 0 : 1)), 'every non-attached geometry disposed exactly once');
});

test('regional deferred LOD: a failed deferred build publishes nothing, retries, and setLodBudget(0) flushes synchronously', () => {
  const fault = { armed: false }, log = [];
  const b = fixture(after, { budget: 1e-9, fault, log });
  b.region.update(at(2200, 0), 1, { x: 20000, z: 20000 });
  assert.ok(b.region.pendingTerrain() > 1);
  const shown = b.ground.map(m => m.geometry);
  fault.armed = true;
  assert.throws(() => b.region.update(at(2200, 0), 1, { x: 20000, z: 20000 }), /controlled CPU/);
  assert.deepEqual(b.ground.map(m => m.geometry), shown, 'failed private build changes nothing drawn');
  b.region.update(at(2200, 0), 1, { x: 20000, z: 20000 });
  b.region.setLodBudget(0);
  assert.equal(b.region.pendingTerrain(), 0, 'switching to synchronous mode completes and publishes the batch');
  const s = fixture(after, {});
  s.region.update(at(2200, 0), 1, { x: 20000, z: 20000 });
  s.ground.forEach((mesh, k) => same(mesh.geometry, b.ground[k].geometry, `flushed tile ${k}`));
});

// Committed regional grids: synchronous checkpoint versus deferred teleport arrivals (Golden Gate / Twin Peaks).
baselineTest('regional deferred LOD: committed-data teleports converge to byte-identical synchronous terrain at every stop', t => {
  const read = path => readFileSync(new URL(path, root));
  const manifest = JSON.parse(read('data/region/manifest.json'));
  const bin = path => { const b = read(path), n = b.readUInt32LE(4);
    return { header: JSON.parse(b.toString('utf8', 8, 8 + n)), data: b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length) }; };
  const grid = tier => {
    const heights = new Float32Array(tier.w * tier.h).fill(manifest.waterLevel), tiles = [];
    for (const file of tier.files) {
      const { header: h, data } = bin(file.url), q = new Uint16Array(data);
      const ix = Math.round((h.originX - tier.x0) / tier.step), iz = Math.round((h.originZ - tier.z0) / tier.step);
      for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) heights[(iz + j) * tier.w + ix + i] = h.minH + q[j * h.w + i] * h.scale;
      tiles.push({ x: h.originX, z: h.originZ, w: h.w, h: h.h, size: tier.size });
    }
    return { ...tier, heights, tiles };
  };
  const city = grid(manifest.city), horizon = grid(manifest.horizon), h = bin('data/terrain-core.bin').header;
  const geodata = { NYC: {} }; new Function('window', readFileSync(new URL('js/sf-geodata.js', root), 'utf8'))(geodata);
  const patches = Object.values(geodata.NYC.GEO.landmarks).filter(s => s.detail && s.detail.step < city.step)
    .map(({ detail: d }) => ({ rect: true, x0: d.x0, z0: d.z0, nx: d.nx, nz: d.nz, step: d.step }));
  const make = (source, budget) => {
    const Terrain = { loaded: true, originX: h.originX, originZ: h.originZ, w: h.w, h: h.h, cell: h.cell, waterLevel: manifest.waterLevel, patches };
    const data = { city, horizon, mask: new Uint8Array(16), roads: new Float32Array(), buildings: [], trees: new Float32Array(),
      manifest: { ...manifest, mask: { originX: 0, originZ: 0, w: 4, h: 4 }, ferries: [], cargo: [] } };
    const window = { NYC: { THREE, TSL, Terrain, DATA: { fullRegion: data }, cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } } };
    new Function('window', 'location', source)(window, { search: '' });
    const region = window.NYC.buildSFRegion(new THREE.Scene());
    if (budget) region.setLodBudget(budget);
    return { region, ground: region.group.children.filter(m => m.name === 'SFRegionTerrain') };
  };
  const a = make(before, 0), b = make(after, 4);
  const stops = [[0, 0], [-6562.9, -2145.8], [-4010.9, 3876.6], [-6562.9, -2145.8], [-11000, 9000], [0, 0]];
  const report = [];
  stops.forEach(([x, z], i) => {
    for (const item of [a, b]) item.region.update(at(x, z), i + 1, { x, z });
    const pending = b.region.pendingTerrain(), started = performance.now();
    const calls = drain(b, [x, z, x, z], i + 1);
    a.ground.forEach((mesh, k) => same(mesh.geometry, b.ground[k].geometry, `committed stop ${i} tile ${k}`));
    report.push({ stop: [x, z], deferred: pending, drainCalls: calls, drainMs: +(performance.now() - started).toFixed(1) });
  });
  assert.ok(report[1].deferred > 0 && report[2].deferred > 0, 'cold Golden Gate and Twin Peaks arrivals defer camera-threshold tiles');
  t.diagnostic(JSON.stringify(report));
});
