// Focused packed ownership/lifetime contracts. CPU-only; no renderer or test hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SfSupportStore } from '../js/sf-support-store.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

const poly = (x, z, width = 2) => [{ x, z }, { x: x + width, z }, { x: x + width, z: z + width }, { x, z: z + width }];
const sample = () => ({ normal: {} });
const terrain = { x0: -100, z0: -100, step: 200, nx: 2, nz: 2, heights: [10, 10, 10, 10], waterLevel: 0 };
const makeSampler = options => new SfTerrainSampler({ terrain, waterAt: () => false, ...options });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
function registry() {
  const context = vm.createContext({ window: { NYC: {} } });
  vm.runInContext(readFileSync(new URL('../js/sf-ride-geometry.js', import.meta.url), 'utf8'), context);
  return context.window.NYC;
}

test('packed doubles preserve high-coordinate arithmetic, arbitrary vertex counts, planes and rare diagnostics', () => {
  const x = 2 ** 29 + 0.123456789, z = -(2 ** 28) + 0.23456789;
  const diagnostic = Symbol('source'), detail = { builder: 'retained shallow diagnostic value' };
  const ring = Array.from({ length: 21 }, (_, i) => ({ x: x + Math.cos(i / 21 * Math.PI * 2) * 3,
    z: z + Math.sin(i / 21 * Math.PI * 2) * 3 }));
  ring[0].vertexSource = 42;
  const t = { poly: ring, top: 73.12345678912345, surface: 'brick', layered: true, shore: false, water: true, occludes: true,
    minReferenceY: -Infinity, maxReferenceY: Infinity, ceilingOffset: 0,
    plane: { x, y: 72.98765432198765, z, dx: 0.21345678912345, dz: -0.76543219876543, method: 'measured' },
    [diagnostic]: detail, oddDiagnostic: -0 };
  const store = new SfSupportStore([[t]], { cacheSize: 1 });
  const px = x + 0.1323567, pz = z - 0.382987;
  const expected = t.plane.y + t.plane.dx * (px - t.plane.x) + t.plane.dz * (pz - t.plane.z);
  assert.equal(store.heightAt(0, px, pz), expected);
  assert.equal(store.contains(0, px, pz), true);
  const copy = store.get(0);
  for (const k of Reflect.ownKeys(t)) assert.deepEqual(copy[k], t[k]);
  assert.notEqual(copy.poly, t.poly); assert.notEqual(copy.poly[0], t.poly[0]); assert.notEqual(copy.plane, t.plane);
  assert.equal(copy[diagnostic], detail); assert.ok(Object.is(copy.oddDiagnostic, -0));
  assert.equal(store.values.constructor, Float64Array);
  assert.equal(store.stats.vertices, 21); assert.equal(store.stats.sparseMetadataEntries, 1);
  const s = makeSampler({ tops: [t] });
  assert.equal(s.sampleGround(px, pz, sample(), expected + 0.1).height, expected);
  assert.equal(s.sampleGround(px, pz, sample(), expected + 0.1).water, true);
  near(s.raycast({ x: px, y: expected + 3, z: pz }, { x: 0, y: -1, z: 0 }, 5), 3);
  t.poly[0].x = 0; t.plane.dx = 100; t.top = 500;
  assert.equal(store.heightAt(0, px, pz), expected); assert.equal(copy.top, 73.12345678912345);
});

test('concave top rings, explicit outer and holes remain exact for samples and rays', () => {
  const concave = [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: 2, z: 4 },
    { x: 2, z: -2 }, { x: -2, z: -2 }, { x: -2, z: 4 }, { x: -4, z: 4 }];
  const hole = poly(-3.8, -3.8, 1);
  const top = { poly: concave, outer: concave, holes: [hole], top: 12, surface: 'wood' };
  const s = makeSampler({ tops: [top] });
  assert.equal(s.sampleGround(0, 0, sample()).height, 10, 'concavity was filled');
  assert.equal(s.sampleGround(-3.3, -3.3, sample()).height, 10, 'hole was filled');
  assert.equal(s.sampleGround(3, 0, sample()).height, 12);
  assert.equal(s.sampleGround(2, 0, sample()).height, 12, 'outer boundary must be included');
  assert.equal(s.sampleGround(-3.8, -3.3, sample()).height, 12, 'hole boundary must be included');
  assert.equal(s.raycast({ x: 0, y: 15, z: 0 }, { x: 0, y: -1, z: 0 }, 10), 5);
  assert.equal(s.raycast({ x: -3.3, y: 15, z: -3.3 }, { x: 0, y: -1, z: 0 }, 10), 5);
  assert.equal(s.raycast({ x: 3, y: 15, z: 0 }, { x: 0, y: -1, z: 0 }, 10), 3);
  const copy = s.sampleGround(3, 0, sample()).support;
  assert.deepEqual(copy.poly, concave); assert.deepEqual(copy.outer, concave); assert.deepEqual(copy.holes, [hole]);
});

test('reference bounds preserve absent/undefined/null/Infinity/NaN values and own-key presence', () => {
  const entries = [{}, { maxReferenceY: undefined }, { maxReferenceY: null }, { maxReferenceY: Infinity },
    { maxReferenceY: NaN }, { minReferenceY: -Infinity, ceilingOffset: -0, plane: null, outer: null, holes: undefined }];
  for (const metadata of entries) {
    const t = { poly: poly(0, 0), top: 12, ...metadata }, s = makeSampler({ tops: [t] });
    const copy = s.topStore.get(0);
    for (const k of ['minReferenceY', 'maxReferenceY', 'ceilingOffset', 'plane', 'outer', 'holes']) {
      assert.equal(Object.hasOwn(copy, k), Object.hasOwn(t, k), `${k} presence changed`);
      assert.ok(Object.is(copy[k], t[k]), `${k} value changed`);
    }
    // An explicit unbounded numeric maximum still excludes referenceY=Infinity;
    // an absent or undefined maximum does not. This is the existing selection rule.
    const expected = Object.hasOwn(metadata, 'maxReferenceY') && metadata.maxReferenceY !== undefined
      && (metadata.maxReferenceY === null || metadata.maxReferenceY === Infinity) ? 10 : 12;
    assert.equal(s.sampleGround(1, 1, sample(), Infinity).height, expected);
  }
});

test('source-order selected/replacement ties and identity dedup survive sparse levels', () => {
  const a = { poly: poly(-10000, -10000, 20000), top: 12, sourceId: 'first', surface: 'wood' };
  const b = { poly: poly(-1, -1), top: 12, sourceId: 'last', surface: 'brick' };
  const ride = { tops: [a, b, a], solids: [], prisms: [] };
  const s = makeSampler({ ride, tops: [b, a] });
  assert.equal(s.stats.tops, 2); assert.equal(s.sampleGround(0, 0, sample(), 12).support.sourceId, 'last');
  const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  assert.deepEqual(s.topIndex.query(bounds), [0, 1]);
  const r = makeSampler({ terrain: { ...terrain, heights: [30, 30, 30, 30] },
    tops: [{ ...a, replacesTerrain: true }, { ...b, replacesTerrain: true }] });
  assert.equal(r.sampleGround(0, 0, sample(), 12).support.sourceId, 'first');
});

test('sloping bore ceilings retain exact contact/volume behavior and never retain a second facet subset', () => {
  const t = { poly: poly(-10, -10, 20), top: 11, plane: { x: 0, y: 11, z: 0, dx: 0.3, dz: 0.2 },
    surface: 'pavement', replacesTerrain: true, layered: true, ceilingOffset: 5.2, maxReferenceY: 16.2 };
  const s = makeSampler({ terrain: { ...terrain, heights: [30, 30, 30, 30] }, tops: [t] });
  assert.equal(s.sampleGround(0, 0, sample(), 12).height, 11);
  assert.equal(s.sampleGround(0, 0, sample(), 30).height, 30);
  near(s.raycastObstacle({ x: 0, y: 12, z: 0 }, { x: 0, y: 1, z: 0 }, 10), 4.2);
  near(s.raycast({ x: 0, y: 12, z: 0 }, { x: 0, y: 1, z: 0 }, 10), 4.2);
  assert.equal(s.isVolumeClear({ x: 0, z: 0, headingY: 0, halfWidthMetres: 0.3, halfLengthMetres: 0.3,
    minY: 11.1, maxY: 17, floorY: 11 }), false);
  assert.ok(s.topStore.ceilingIds instanceof Uint32Array); assert.deepEqual([...s.topStore.ceilingIds], [0]);
  assert.equal(s.ceilingIndex.items.store, s.topStore);
  assert.equal(Object.hasOwn(s, 'ceilingTops'), false); assert.equal(s.topStore.cacheStats.records, 1);
});

test('held support and plane outputs survive cache eviction, reentrant queries and later samples', () => {
  const tops = Array.from({ length: 12 }, (_, i) => ({ poly: poly(i * 4, 0), top: 12 + i,
    plane: { x: i * 4, y: 12 + i, z: 0, dx: 0.2 + i / 10, dz: -0.1 }, surface: 'wood', sourceId: i }));
  let s, nested = false;
  const held = [];
  const grade = { floorAt() {
    if (!nested) {
      nested = true;
      for (let i = 1; i < tops.length; i++) held.push(s.sampleGround(i * 4 + 0.5, 0.5, sample(), 25));
      nested = false;
    }
    return null;
  } };
  s = makeSampler({ tops, topViewCacheSize: 1, grade });
  const outer = s.sampleGround(0.5, 0.5, sample(), 25), before = structuredClone(outer);
  assert.equal(outer.support.sourceId, 0); assert.equal(outer.plane, outer.support.plane);
  const old = held.map(g => structuredClone(g));
  for (let i = 0; i < 40; i++) s.sampleGround(4.5, 0.5, sample(), 25);
  assert.deepEqual(outer, before);
  for (let i = 0; i < old.length; i++) assert.deepEqual(held[i], old[i]);
  assert.equal(s.topStore.cacheStats.records, 1);
  assert.throws(() => { outer.plane.dx = 200; }, TypeError);
  assert.throws(() => { outer.support.poly[0].x = 200; }, TypeError);
  const noCache = new SfSupportStore([tops], { cacheSize: 0 });
  assert.deepEqual(noCache.get(0), noCache.get(0)); assert.notEqual(noCache.get(0), noCache.get(0));
  assert.equal(noCache.cacheStats.records, 0);
});

test('ignored poisoned geometry is never accessed, including with repeated identities', () => {
  const poison = { rideIgnore: true, get poly() { throw Error('poison poly'); }, get plane() { throw Error('poison plane'); },
    get maxReferenceY() { throw Error('poison metadata'); } };
  const s = makeSampler({ tops: [poison], ride: { tops: [poison], solids: [], prisms: [] } });
  assert.equal(s.stats.tops, 0); assert.equal(s.topStore.stats.typedBytes, 4);
  assert.equal(s.sampleGround(0, 0, sample()).height, 10);
});

test('explicit successful handoff releases only memberships, seals late writes and retains shared body identity', () => {
  const N = registry(), R = N.RideGeometry;
  const t = R.addTop(poly(0, 0), 12, 'wood');
  const b = R.addBox({ x: 10, y: 12, z: 0 }, { x: 1, y: 2, z: 1 });
  const p = R.addPrism(poly(20, 0), 10, 15);
  // Shared geometry remains intact after releasing the membership of a top.
  p.outer = t.poly;
  const arrays = [N.ride.tops, N.ride.solids, N.ride.prisms];
  const s = makeSampler({ city: N, colliders: [b, p], boxes: [b], prisms: [p] });
  assert.equal(N.ride.tops.length, 1); assert.equal(s.stats.duplicateBodies, 4);
  assert.equal(s.boxRecords[0].collider, b); assert.equal(s.prisms[0].source, p);
  assert.equal(s.releaseConstructionRegistry(N.ride), true);
  assert.deepEqual(arrays.map(a => a.length), [0, 0, 0]);
  assert.ok(arrays.every(Object.isFrozen)); assert.ok(Object.isFrozen(N.ride));
  assert.equal(p.outer.length, 4); assert.equal(t.poly.length, 4); assert.equal(b.centre.x, 10);
  assert.equal(Object.isFrozen(p.outer), false); assert.equal(Object.isFrozen(b), false);
  assert.equal(s.sampleGround(1, 1, sample(), 12).height, 12);
  near(s.raycastObstacle({ x: 8, y: 12, z: 0 }, { x: 1, y: 0, z: 0 }, 4), 1);
  assert.equal(s.releaseConstructionRegistry(N.ride), false);
  assert.throws(() => R.addTop(poly(0, 0), 12), /extensible|read only|readonly/i);
  assert.throws(() => R.addBox({ x: 0, y: 12, z: 0 }, { x: 1, y: 1, z: 1 }), /extensible|read only|readonly/i);
  assert.throws(() => R.addPrism(poly(0, 0), 10, 12), /extensible|read only|readonly/i);
  assert.throws(() => N.ride.tops.push(t), { name: 'TypeError' });
  assert.equal(Object.hasOwn(s, 'city'), false, 'sampler retained a city -> ride alias');
});

test('default fixtures remain reusable and a stale/foreign registry cannot be handed off', () => {
  const N = registry(), R = N.RideGeometry;
  R.addTop(poly(0, 0), 12);
  const s = makeSampler({ city: N });
  R.addBox({ x: 0, y: 13, z: 0 }, { x: 0.2, y: 1, z: 0.2 });
  assert.throws(() => s.releaseConstructionRegistry(N.ride), /changed/);
  assert.equal(N.ride.tops.length, 1); assert.equal(N.ride.solids.length, 1);
  const second = makeSampler({ city: N }); assert.equal(second.stats.boxes, 1);
  const foreign = { tops: [], solids: [], prisms: [] };
  assert.throws(() => second.releaseConstructionRegistry(foreign), /not captured/);
  assert.equal(second.releaseConstructionRegistry(N.ride), true);
  assert.equal(s.sampleGround(1, 1, sample(), 12).height, 12);
});

test('65536 mixed facets retain exact numeric payloads and bounded record caches without prepared wrappers', () => {
  const n = 65536;
  const tops = Array.from({ length: n }, (_, i) => {
    const ring = poly(i * 8, 0, 1);
    if (!(i & 1)) ring.pop();
    return { poly: ring, top: 12, surface: 'pavement', layered: false, shore: false,
      ...(!(i & 1) ? { plane: { x: i * 8, y: 12, z: 0, dx: 0.25, dz: -0.1 } } : {}) };
  });
  const s = makeSampler({ tops, topViewCacheSize: 32 }), store = s.topStore;
  assert.equal(s.stats.tops, n); assert.equal(store.stats.vertices, n / 2 * 7);
  assert.equal(store.stats.planes, n / 2); assert.equal(store.stats.rings, n);
  assert.equal(store.stats.metadataTemplates, 1); assert.equal(store.stats.sparseMetadataEntries, 0);
  assert.equal(store.stats.typedBytes, 8126468);
  assert.equal(store.cacheStats.records, 0); assert.equal(store.cacheStats.misses, 0, 'index construction materialized records');
  assert.equal(s.topIndex.items, store); assert.equal(Object.hasOwn(s, 'tops'), false);
  for (let i = 0; i < n; i += 64) {
    const g = s.sampleGround(i * 8 + 0.75, 0.25, sample(), 13);
    assert.equal(g.height, 12 + 0.25 * 0.75 - 0.1 * 0.25);
  }
  assert.deepEqual(store.cacheStats, { records: 32, limit: 32, misses: 1024, highWater: 32 });
  assert.equal(tops.length, n, 'default construction consumed caller inputs');
  console.info(`Packed stress: ${store.stats.facets} facets; ${store.stats.vertices} vertices; ${store.stats.typedBytes} payload bytes; `
    + `${store.stats.metadataTemplates} shared metadata; ${store.stats.sparseMetadataEntries} sparse extras; ${store.cacheStats.records}/${store.cacheStats.limit} cached records`);
});

test('unique optional numeric metadata remains packed rather than allocating one metadata object per facet', () => {
  const n = 1024;
  const tops = Array.from({ length: n }, (_, i) => ({ poly: poly(i * 8, 0), top: 12, surface: 'wood',
    minReferenceY: -100 - i * 0.123456789, maxReferenceY: 100 + i * 0.987654321, ceilingOffset: 5.2 + i * 0.000123456789 }));
  const store = new SfSupportStore([tops], { cacheSize: 2 });
  assert.equal(store.stats.metadataTemplates, 1); assert.equal(store.stats.sparseMetadataEntries, 0);
  assert.equal(store.stats.typedBytes, 143364); assert.equal(store.ceilingIds.length, n);
  for (const i of [0, 15, 511, n - 1]) {
    const view = store.get(i);
    for (const k of ['minReferenceY', 'maxReferenceY', 'ceilingOffset']) {
      assert.equal(store.property(i, k), tops[i][k]); assert.equal(view[k], tops[i][k]);
    }
  }
  assert.equal(store.cacheStats.records, 2);
});
