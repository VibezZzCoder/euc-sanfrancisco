// Packed draped ride tops (phone startup memory) are exactly the records addTriangles registers. CPU-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SfSupportStore } from '../js/sf-support-store.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

// Packed facets are referenced, not copied, so compare every query a sampler can make, facet by facet.
const KEYS = ['surface', 'layered', 'shore', 'replacesTerrain', 'water', 'occludes', 'rideIgnore', 'minReferenceY', 'maxReferenceY', 'ceilingOffset'];
function sameQueries(x, y) {
  assert.equal(y.length, x.length);
  for (const k of ['facets', 'vertices', 'rings', 'planes', 'metadataTemplates', 'sparseMetadataEntries']) assert.equal(y.stats[k], x.stats[k], k);
  assert.deepEqual(y.metadata, x.metadata);
  for (let id = 0; id < x.length; id++) {
    const bx = x.getBounds(id, {}), by = y.getBounds(id, {});
    assert.deepEqual(by, bx, `bounds ${id}`);
    assert.deepEqual(y.get(id), x.get(id), `view ${id}`); // includes NaN and signed zero (JSON would erase them)
    assert.ok(Object.isFrozen(y.get(id)) && Object.isFrozen(y.get(id).poly) && Object.isFrozen(y.get(id).poly[0]));
    assert.deepEqual(y.plane(id, {}), x.plane(id, {}), `plane ${id}`);
    for (const key of KEYS) assert.ok(Object.is(y.property(id, key), x.property(id, key)), `${key} ${id}`);
    const cx = (bx.minX + bx.maxX) / 2, cz = (bx.minZ + bx.maxZ) / 2;
    for (const [px, pz] of [[cx, cz], [bx.minX, bx.minZ], [bx.maxX, cz], [cx + 1e-9, bx.maxZ], [bx.minX - 0.5, cz]]) {
      assert.ok(Object.is(y.heightAt(id, px, pz), x.heightAt(id, px, pz)), `height ${id}`);
      for (const boundary of [true, false]) assert.equal(y.contains(id, px, pz, boundary), x.contains(id, px, pz, boundary), `contains ${id}`);
    }
  }
}

function registry() {
  const context = vm.createContext({ window: { NYC: {} } });
  vm.runInContext(readFileSync(new URL('../js/sf-ride-geometry.js', import.meta.url), 'utf8'), context);
  return context.window.NYC;
}

function sameRecords(expected, batch) {
  assert.equal(batch.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const record = batch.record(i);
    assert.deepEqual(Object.keys(record), Object.keys(expected[i]), `key order ${i}`);
    assert.deepEqual(structuredClone(record), structuredClone(expected[i]), `record ${i}`);
    assert.ok(Object.is(batch.top[i], expected[i].top), `legacy indexed top read ${i}`);
  }
}

// Independent old-layout fixture: explicit len/top/anchor arrays, including a plane anchor outside
// the polygon's vertex slots. No new compact accessors are involved in constructing/reading it.
function oldBatch(records) {
  const n = records.length, b = { packedTops: true, length: n, template: {}, len: new Uint8Array(n), ids: new Int32Array(n * 4),
    top: new Float64Array(n), anchor: new Int32Array(n).fill(-1), slope: new Float64Array(n * 2) }, pos = [];
  for (const key of ['surface', 'layered', 'shore', 'replacesTerrain']) if (key in records[0]) b.template[key] = records[0][key];
  for (let i = 0; i < n; i++) {
    const t = records[i]; b.len[i] = t.poly.length; b.top[i] = t.top;
    for (let k = 0; k < t.poly.length; k++) {
      b.ids[i * 4 + k] = pos.length / 3; pos.push(t.poly[k].x, 0, t.poly[k].z);
    }
    if (t.plane) {
      const p = t.plane; b.anchor[i] = pos.length / 3; pos.push(p.x, p.y, p.z);
      b.slope[i * 2] = p.dx; b.slope[i * 2 + 1] = p.dz;
    }
  }
  b.vertices = pos.length / 3; b.pos = new Float64Array(pos);
  return b;
}

const batchBytes = b => [b.pos, b.facet, b.len, b.ids, b.top, b.anchor, b.slope].reduce((n, a) => n + (a?.byteLength ?? 0), 0);

// A Drape-like indexed Float32 mesh: a sloped/flat grid with shared vertices (merge candidates), a few
// down-facing and degenerate faces, duplicate coincident vertices (interning), a crease and high coordinates.
function mesh(seed) {
  let s = seed;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 2 ** 32;
  const n = 18, pos = [], idx = [], base = 4100.25 + seed;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = base + i * 1.5, z = -2730.5 + j * 1.5;
    const y = j > 12 ? 13 : i < 9 ? 12 + 0.07 * i + 0.03 * j : 12.63 + 0.03 * j + (rnd() < 0.15 ? rnd() * 0.01 : 0);
    pos.push(x, y, z);
  }
  const v = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    if (rnd() < 0.5) idx.push(a, d, c, a, c, b); else idx.push(a, d, b, b, d, c);
  }
  const dup = pos.length / 3; pos.push(pos[0], pos[1], pos[2]); idx.push(dup, v(0, 1), v(1, 1)); // coincident copy
  idx.push(v(2, 2), v(3, 2), v(2, 3));                     // down-facing (skipped)
  idx.push(v(4, 4), v(4, 4), v(5, 5));                     // degenerate (skipped)
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

test('packed facets materialize exactly as addTriangles records, in order, with merges and planes', () => {
  for (const seed of [1, 7, 42]) {
    const { pos, idx } = mesh(seed);
    const a = registry(), b = registry();
    a.RideGeometry.addTriangles(pos, idx, 'grass', { replacesTerrain: true });
    const batch = b.RideGeometry.addTriangles(pos, idx, 'grass', { replacesTerrain: true, packed: true });
    assert.equal(b.ride.tops.length, 1, 'one registry entry per packed call');
    assert.equal(b.ride.tops[0], batch);
    const expanded = b.RideGeometry.expandTops(b.ride.tops);
    assert.ok(a.ride.tops.some(t => t.poly.length === 4), 'fixture exercises merges');
    assert.ok(a.ride.tops.some(t => t.plane) && a.ride.tops.some(t => !t.plane), 'fixture has sloped and flat facets');
    assert.equal(expanded.length, a.ride.tops.length);
    for (let i = 0; i < expanded.length; i++) {
      assert.deepEqual(Object.keys(expanded[i]), Object.keys(a.ride.tops[i]), `key order ${i}`);
      assert.deepEqual(JSON.parse(JSON.stringify(expanded[i])), JSON.parse(JSON.stringify(a.ride.tops[i])), `record ${i}`);
    }
  }
});

test('the support store answers every query for a referenced batch exactly as for its plain records', () => {
  const { pos, idx } = mesh(3), a = registry(), b = registry();
  const before = { poly: [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 3 }], top: 4, surface: 'wood', layered: true, shore: false };
  const after = { poly: [{ x: 5, z: 1 }, { x: 7, z: 1 }, { x: 7, z: 3 }], top: 2, surface: 'pavement', layered: false, shore: false, replacesTerrain: true };
  a.RideGeometry.addTriangles(pos, idx, 'pavement', { replacesTerrain: true });
  b.RideGeometry.addTriangles(pos, idx, 'pavement', { replacesTerrain: true, packed: true });
  const x = new SfSupportStore([[before, ...a.ride.tops, after]]), y = new SfSupportStore([[before, ...b.ride.tops, after]]);
  sameQueries(x, y);
  assert.equal(y.length, a.ride.tops.length + 2);
  assert.equal(y.stats.packedFacets, a.ride.tops.length); assert.equal(y.stats.packedBatches, 1);
  assert.equal(y.values.length, x.values.length - a.ride.tops.reduce((n, t) => n + 5 + (t.plane ? 5 : 0) + t.poly.length * 2, 0),
    'packed facets are referenced, not copied into values');
});

test('packed batches reject options they cannot reproduce and register nothing when empty', () => {
  const N = registry(), pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const option of [{ doubleSided: true }, { capabilities: {} }, { merge: false }, { plane: {} }, { minReferenceY: 1 }, { source: 'x' }]) {
    assert.throws(() => N.RideGeometry.addTriangles(pos, null, 'pavement', { packed: true, ...option }), /do not support/);
  }
  N.RideGeometry.addTriangles(pos, null, 'pavement', { packed: true, replacesTerrain: true }); // down-facing only
  assert.equal(N.ride.tops.length, 0);
});

test('a packed run shares one batch across addMesh calls (incl. mirrored instances) and splits when order requires', async () => {
  const THREE = await import('../vendor/three/build/three.core.js');
  const geos = [new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.CylinderGeometry(0.14, 0.17, 0.62, 10).toNonIndexed()];
  const matrices = [
    new THREE.Matrix4().compose(new THREE.Vector3(1234.5, 17.25, -812.75), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7), new THREE.Vector3(0.3, 0.16, 0.65)),
    new THREE.Matrix4().compose(new THREE.Vector3(-40.125, 3.5, 99.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -2.1), new THREE.Vector3(-1, 1, 1)), // mirrored
    new THREE.Matrix4().makeTranslation(5, 0.5, 5)
  ];
  const a = registry(), b = registry(), run = b.RideGeometry.packedRun();
  const register = (N, packed) => {
    for (const geometry of geos) for (const [i, matrixWorld] of matrices.entries()) {
      N.RideGeometry.addMesh({ geometry, matrixWorld }, 'pavement', { layered: true, sides: { sliceHeight: 0.16, maxSlices: 8 }, ...(packed ? { packed } : {}) });
      if (i === 1 && geometry === geos[1]) N.RideGeometry.addTop([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }], 3, 'wood'); // interleaved entry
    }
  };
  register(a, null); register(b, run); run.close();
  const batches = b.ride.tops.filter(t => t.packedTops);
  assert.equal(batches.length, 2, 'one batch before and one after the interleaved plain top');
  assert.ok(batches.every(t => t.pos.constructor.name === 'Float64Array'), 'addMesh doubles keep their element type');
  const expanded = b.RideGeometry.expandTops(b.ride.tops);
  assert.equal(expanded.length, a.ride.tops.length);
  for (let i = 0; i < expanded.length; i++) {
    assert.deepEqual(Object.keys(expanded[i]), Object.keys(a.ride.tops[i]), `key order ${i}`);
    assert.deepEqual(JSON.parse(JSON.stringify(expanded[i])), JSON.parse(JSON.stringify(a.ride.tops[i])), `record ${i}`);
  }
  assert.deepEqual(b.ride.prisms.length, a.ride.prisms.length, 'side prisms unchanged');
  sameQueries(new SfSupportStore([a.ride.tops]), new SfSupportStore([b.ride.tops]));
  assert.throws(() => b.RideGeometry.addMesh({ geometry: geos[0], matrixWorld: matrices[0] }, 'pavement', { layered: true, packed: run }), /closed/);
});

test('compact tops retain discarded duplicate-edge maxima, signed zeros and accepted NaNs exactly', () => {
  for (const ArrayType of [Float32Array, Float64Array]) for (const [base, duplicate, corner] of [
    [0, 1e-9, 0], [-0, +0, -0], [2, NaN, 2], [2, 2, NaN], [2, 2 + 1e-9, 2 + 2e-9], [-0, -0, -0]
  ]) {
    // First A/B/C followed by C'/B'/D. Merge identity is XZ, not XYZ; C'/B' disappear from the quad.
    const pos = new ArrayType([0, base, 0, 0, base, 2, 2, base, 0,
      2, duplicate, 0, 0, duplicate, 2, 2, corner, 2]);
    const a = registry(), b = registry();
    a.RideGeometry.addTriangles(pos, null, 'wood', { layered: true });
    const batch = b.RideGeometry.addTriangles(pos, null, 'wood', { layered: true, packed: true });
    assert.equal(a.ride.tops.length, 1); assert.equal(a.ride.tops[0].poly.length, 4);
    sameRecords(a.ride.tops, batch);
    sameQueries(new SfSupportStore([a.ride.tops]), new SfSupportStore([[batch]], { cacheSize: 0 }));
    const ys = Array.from({ length: batch.countAt(0) }, (_, k) => batch.pos[batch.ids[k] * 3 + 1]);
    const needsOverride = Number.isNaN(a.ride.tops[0].top) || !ys.some(y => Object.is(y, a.ride.tops[0].top));
    assert.equal(batch.topOverrides?.size ?? 0, needsOverride ? 1 : 0);
    if (needsOverride) assert.ok(Object.is(batch.topOverrides.get(0), a.ride.tops[0].top));
  }
});

test('all merged anchor slots preserve high-coordinate Float64 planes and sub-threshold flat tops', () => {
  for (const dx of [0.17345678912345, 4e-13]) for (const edge of [0, 1, 2]) {
    const x0 = 2 ** 29 + 0.125, z0 = -(2 ** 28) + 0.25, y0 = 0.125;
    const p = (x, z) => [x0 + x, y0 + dx * x + (dx > 1e-12 ? 0.08345678912345 * z : 0), z0 + z];
    const tri = [p(0, 0), p(0, 2), p(2, 0)], q = [p(-2, 0), p(2, 2), p(2, -2)][edge];
    const pos = new Float64Array([...tri.flat(), ...tri[(edge + 1) % 3], ...tri[edge], ...q]);
    const a = registry(), b = registry();
    a.RideGeometry.addTriangles(pos, null, 'brick');
    const batch = b.RideGeometry.addTriangles(pos, null, 'brick', { packed: true });
    assert.equal(batch.length, 1); assert.equal(batch.countAt(0), 4);
    if (dx > 1e-12) assert.equal(((batch.facet[0] >>> 1) & 7) - 1, [0, 3, 2][edge]);
    else assert.equal(batch.anchorAt(0), -1, 'sub-threshold slope remains a flat top');
    sameRecords(a.ride.tops, batch);
    sameQueries(new SfSupportStore([a.ride.tops]), new SfSupportStore([[batch]]));
  }
});

test('adversarial rejected facets, crease thresholds and flip winding match ordinary registration', () => {
  for (const flipWinding of [false, true]) for (const ArrayType of [Float32Array, Float64Array]) {
    const pos = new ArrayType([
      0, 1, 0, 0, 1, 2, 2, 1, 0, // flat upward
      2, 1 + 4e-9, 0, 0, 1 + 4e-9, 2, 2, 1, 2, // near coplanar duplicate edge
      10, 1, 0, 10, 1, 2, 12, 1 + 3e-8, 0,
      12, 1 + 3e-8, 0, 10, 1, 2, 12, 1 + 9e-8, 2, // crease, must not merge in Float64
      20, 1, 0, 22, 1, 0, 20, 1, 2, // underside (accepted only when flipped)
      30, 1, 0, 30, 1, 0, 32, 1, 2, // degenerate
      40, 1, 0, 40, 2, 0, 40, 3, 2, // vertical
      NaN, 1, 0, 50, 1, 2, 52, 1, 0,
      60, 1, 0, 60, Infinity, 2, 62, 1, 0,
      70, 1, 0, 70, 1, 2, 72, NaN, 0,
      80, 1, 0, 80, 1, 2, Infinity, 1, 0,
      90, 1, 0, 90, 1, 1e-6, 90 + 1e-6, 1, 0 // below projected area threshold
    ]);
    const options = { flipWinding, replacesTerrain: false, layered: true, shore: true }, a = registry(), b = registry();
    a.RideGeometry.addTriangles(pos, null, 'grass', options);
    const batch = b.RideGeometry.addTriangles(pos, null, 'grass', { ...options, packed: true });
    sameRecords(a.ride.tops, batch);
    sameQueries(new SfSupportStore([a.ride.tops]), new SfSupportStore([b.ride.tops]));
  }
});

test('old and compact packed formats coexist, preserve source IDs, dedup and tagged park capabilities', () => {
  const a = registry(), b = registry(), pos = new Float64Array([0, 12, 0, 0, 12, 2, 2, 12, 0, 2, 12, 2]);
  a.RideGeometry.addTriangles(pos, new Uint32Array([0, 1, 2, 2, 1, 3]), 'brick', { layered: true });
  const compact = b.RideGeometry.addTriangles(pos, new Uint32Array([0, 1, 2, 2, 1, 3]), 'brick', { layered: true, packed: true });
  const plain = structuredClone(a.ride.tops), legacy = oldBatch(plain);
  const unusual = [{ ...plain[0], top: -0 }, { ...plain[0], top: 12.5,
    plane: { x: 2 ** 29 + 0.125, y: 12.125, z: -(2 ** 28), dx: 0.12345678912345, dz: -0.2 } }];
  sameQueries(new SfSupportStore([unusual]), new SfSupportStore([[oldBatch(unusual)]]));
  const park = { ...plain[0], source: 'un-plaza:exact-face', capabilities: { feature: 'un-plaza:halfpipe', transition: true, restartsAtRest: true } };
  const terrain = { x0: -10, z0: -10, step: 20, nx: 2, nz: 2, heights: [0, 0, 0, 0], waterLevel: -10 };
  for (const order of [[legacy, compact, park], [legacy, park, compact], [park, legacy, compact]]) {
    const expected = order.map(t => t === park ? park : { ...plain[0] });
    const x = new SfSupportStore([expected]), y = new SfSupportStore([order, order]);
    sameQueries(x, y);
    assert.equal(y.length, 3); assert.equal(y.stats.packedFacets, 2); assert.equal(y.stats.sparseMetadataEntries, 1);
    assert.equal(y.stats.packedBytes, y.batchOf.byteLength + batchBytes(compact) + batchBytes(legacy));
    const s = new SfTerrainSampler({ terrain, tops: order, waterAt: () => false });
    assert.equal(s.stats.tops, 3);
    assert.deepEqual([...s.capabilityIndex.items.ids], [order.indexOf(park)], 'global IDs, not compact-local indices');
    const selectedPark = order.at(-1) === park;
    assert.equal(s.transitionAt(0.5, 0.5, 12), selectedPark);
    assert.equal(s.restartsAtRest(0.5, 0.5, 12), selectedPark);
    assert.equal(s.sampleGround(0.5, 0.5, { normal: {} }, 12).support.source, selectedPark ? park.source : undefined);
  }
});

test('65536-vertex batches stay narrow; a growing run promotes before index 65536 and retains exact output', () => {
  const count = 21845, pos = new Float64Array(65536 * 3), idx = new Uint32Array(count * 3 + 3);
  for (let i = 0; i < count; i++) {
    pos.set([i * 4, 1, 0, i * 4, 1, 1, i * 4 + 1, 1.125, 0], i * 9);
    idx.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3);
  }
  pos.set([-1, 2, -1], 65535 * 3); idx.set([1, 0, 65535], count * 3);
  const a = registry(), b = registry(), run = b.RideGeometry.packedRun();
  a.RideGeometry.addTriangles(pos, idx, 'brick');
  const batch = b.RideGeometry.addTriangles(pos, idx, 'brick', { packed: run });
  assert.equal(batch.vertices, 65536); assert.equal(batch.ids.BYTES_PER_ELEMENT, 2);
  assert.ok(batch.ids.includes(65535), 'maximum Uint16 index is represented');
  const extra = new Float64Array([100000, -0, 0, 100000, -0, 1, 100001, -0, 0]);
  a.RideGeometry.addTriangles(extra, null, 'brick');
  assert.equal(b.RideGeometry.addTriangles(extra, null, 'brick', { packed: run }), batch);
  run.close();
  assert.equal(batch.vertices, 65539); assert.equal(batch.ids.BYTES_PER_ELEMENT, 4);
  assert.ok(batch.ids.includes(65538), 'wide indices do not wrap');
  sameRecords(a.ride.tops, batch);
  sameQueries(new SfSupportStore([a.ride.tops], { cacheSize: 1 }), new SfSupportStore([[batch]], { cacheSize: 1 }));
  assert.equal(batchBytes(batch), batch.pos.byteLength + batch.length * 33);
  assert.equal(batch.length * 45 + batch.pos.byteLength - batchBytes(batch), batch.length * 12);
  const empty = new b.RideGeometry.PackedTops(Float64Array, {});
  for (const [f, v] of [[2 ** 31, 0], [0, 2 ** 31], [NaN, 0], [0, 1.5], [-1, 0]]) {
    assert.throws(() => empty.reserve(f, v), /construction index bounds/);
  }
});

test('trimmed common facets save exactly 20 typed bytes each without ordinary top/anchor arrays', () => {
  const n = 4096, pos = new Float64Array(n * 9), N = registry();
  for (let i = 0; i < n; i++) pos.set([i * 4, 1, 0, i * 4, 1, 1, i * 4 + 1, 1.125, 0], i * 9);
  const batch = N.RideGeometry.addTriangles(pos, null, 'brick', { packed: true });
  assert.equal(batch.length, n); assert.equal(batch.ids.BYTES_PER_ELEMENT, 2);
  assert.equal(batch.topOverrides, null); assert.equal(batch.len, undefined); assert.equal(batch.anchor, undefined);
  assert.equal(ArrayBuffer.isView(batch.top), false); assert.equal(batch.top.length, n);
  for (const key of [-1, n, '01', '-0', 'no-such-top', Symbol.iterator]) assert.equal(batch.top[key], undefined);
  assert.throws(() => { batch.top[0] = 99; }, TypeError);
  const before = batch.pos.byteLength + n * 45, after = batchBytes(batch);
  assert.equal(before - after, n * 20);
  const store = new SfSupportStore([[batch]]);
  assert.equal(store.stats.packedBytes, after + store.batchOf.byteLength);
  assert.equal(store.cacheStats.misses, 0, 'indexing must not materialize facets');
  console.info(`Compact packed payload: ${n} facets/${batch.vertices} vertices; ${before} -> ${after} bytes; saved ${before - after} bytes`);
});
