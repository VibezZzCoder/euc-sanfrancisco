// CPU-only address, ownership and query differentials for the opt-in Light store.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const geometry = readFileSync(new URL('../js/sf-ride-geometry.js', import.meta.url), 'utf8');
// Match boot order: the native classic factory exists before the module captures
// its verifier. Each test starts a fresh session on this one factory.
const previousWindow = globalThis.window, sharedCity = {};
globalThis.window = { NYC: sharedCity };
new Function('window', geometry)(globalThis.window);
const { SfSupportStore, isCertifiedCompactSupport } = await import('../js/sf-support-store.js');
const { SfTerrainSampler } = await import('../js/sf-terrain-sampler.js');
let FrozenSupportStore;
try {
  const source = execFileSync('git', ['show', '8c7bb79:js/sf-support-store.js'],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  ({ SfSupportStore: FrozenSupportStore } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
} catch { /* Curated exports need not retain the private development revision. */ }
after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
const terrain = { x0: -1000, z0: -1000, step: 2000, nx: 2, nz: 2, heights: [0, 0, 0, 0], waterLevel: -20 };
const ring = x => [{ x, z: 0 }, { x, z: 2 }, { x: x + 2, z: 2 }, { x: x + 2, z: 0 }];
function world() {
  const city = sharedCity;
  city.ride.tops.length = 0; city.ride.solids.length = 0; city.ride.prisms.length = 0;
  const certificate = city.RideGeometry.beginCompactSupport();
  assert.ok(certificate);
  return { city, certificate, R: city.RideGeometry };
}
function ordinary(R, x, options = {}) {
  return R.addTop(ring(x), 10, 'wood', { layered: true, ...options });
}
function batch(R, x, count, options = {}) {
  const pos = new Float64Array(count * 9);
  for (let i = 0; i < count; i++) {
    const p = x + i * 4, y = 10 + (i % 5) / 16;
    pos.set([p, y, 0, p, y, 2, p + 2, y + (i % 2 ? 0.25 : 0), 0], i * 9);
  }
  return R.addTriangles(pos, null, 'brick', { packed: true, ...options });
}
function stores(city, certificate, cacheSize = 2) {
  return [new SfSupportStore([city.ride.tops], { cacheSize }),
    new SfSupportStore([city.ride.tops], { cacheSize }, certificate)];
}
const compactConfig = (compact, certificate) => compact ? certificate : null;
function sameAddresses(raw, compact) {
  assert.equal(compact.length, raw.length);
  for (let id = 0; id < raw.length; id++) {
    assert.equal(compact.tagAt(id), raw.tags[id], `tag ${id}`);
    assert.equal(compact.offsetAt(id), raw.offsets[id], `offset ${id}`);
    assert.equal(compact.batchAt(id), raw.batchOf?.[id], `batch ${id}`);
  }
  assert.equal(compact.offsetAt(raw.length), raw.offsets[raw.length]);
}
function sameQueries(raw, compact) {
  sameAddresses(raw, compact);
  assert.deepEqual(compact.metadata, raw.metadata);
  for (const key of ['facets', 'vertices', 'rings', 'planes', 'metadataTemplates', 'sparseMetadataEntries', 'packedFacets', 'packedBatches']) {
    assert.equal(compact.stats[key], raw.stats[key], key);
  }
  for (let id = 0; id < raw.length; id++) {
    const bounds = raw.getBounds(id, {}), x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
    assert.deepEqual(compact.getBounds(id, {}), bounds, `bounds ${id}`);
    assert.deepEqual(compact.plane(id, {}), raw.plane(id, {}), `plane ${id}`);
    assert.ok(Object.is(compact.heightAt(id, x, z), raw.heightAt(id, x, z)), `height ${id}`);
    for (const [px, pz] of [[x, z], [bounds.minX, bounds.minZ], [bounds.maxX + 1, z]]) {
      for (const edge of [false, true]) assert.equal(compact.contains(id, px, pz, edge), raw.contains(id, px, pz, edge));
    }
    assert.deepEqual(compact.get(id), raw.get(id), `view ${id}`);
    for (const key of ['surface', 'layered', 'shore', 'replacesTerrain', 'maxReferenceY', 'capabilities', 'source']) {
      assert.ok(Object.is(compact.property(id, key), raw.property(id, key)), `${key} ${id}`);
    }
  }
}

test('packed global ID zero matches raw across fused queries and immutable views', () => {
  const { city, certificate, R } = world();
  const packed = R.addTriangles(new Float64Array([0, 12, 0, 0, 12, 2, 2, 12.5, 0]), null, 'brick',
    { packed: true, layered: true, replacesTerrain: true });
  ordinary(R, 10);
  const [raw, compact] = stores(city, certificate, 1);
  try {
    assert.ok(compact.addresses, 'fixture must exercise compact addressing');
    assert.equal(compact.batchAt(0), 0); assert.equal(compact.offsetAt(0), 0);
    assert.ok((raw.tags[0] & 0x80000000) !== 0, 'global zero is a packed facet');
    assert.ok((raw.tags[0] & 1) !== 0, 'global zero has a captured plane');
    assert.equal(packed.countAt(0), 3); assert.ok(packed.anchorAt(0) >= 0);
    sameQueries(raw, compact);
    for (const id of [0, -0]) {
      assert.deepEqual(compact.getBounds(id, {}), raw.getBounds(id, {}));
      assert.deepEqual(compact.plane(id, {}), raw.plane(id, {}));
      assert.ok(Object.is(compact.heightAt(id, 0.5, 0.5), raw.heightAt(id, 0.5, 0.5)));
      for (const boundary of [true, false]) for (const [x, z] of [[0.5, 0.5], [0, 0], [3, 3]]) {
        assert.equal(compact.contains(id, x, z, boundary), raw.contains(id, x, z, boundary));
      }
      for (const key of ['surface', 'layered', 'shore', 'replacesTerrain', 'maxReferenceY']) {
        assert.ok(Object.is(compact.property(id, key), raw.property(id, key)), key);
      }
      assert.deepEqual(compact.get(id), raw.get(id));
      assert.deepEqual(compact.packedView(id, raw.tags[0]), raw.packedView(id, raw.tags[0]));
    }
    const held = compact.get(0), snapshot = structuredClone(held), rawHeld = raw.get(0), rawSnapshot = structuredClone(rawHeld),
      capturedTag = compact.tagAt(0);
    packed.facet[0] ^= 1; packed.slope[0] = -0;
    compact.get(1); raw.get(1); // Evict ID zero in both stores after the referenced geometry changes.
    assert.deepEqual(held, snapshot); assert.ok(Object.isFrozen(held) && Object.isFrozen(held.poly[0]));
    assert.deepEqual(rawHeld, rawSnapshot);
    assert.equal(compact.tagAt(0), capturedTag); assert.equal(compact.tagAt(0), raw.tags[0]);
    assert.notEqual(compact.get(0), held); assert.notEqual(raw.get(0), rawHeld);
    assert.deepEqual(compact.get(0), raw.get(0));
    assert.deepEqual(compact.plane(0, {}), raw.plane(0, {}));
  } finally { certificate.release(); }
});

test('compact ordinary extended rings and numeric height bounds preserve layers and capabilities', () => {
  const { city, certificate, R } = world();
  const outer = [{ x: -5, z: -5 }, { x: -5, z: 5 }, { x: 5, z: 5 }, { x: 5, z: -5 }];
  const hole = [{ x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }];
  const polygon = Array.from({ length: 20 }, (_, i) => ({ x: 8 * Math.cos(i * Math.PI / 10), z: 8 * Math.sin(i * Math.PI / 10) }));
  R.addTop(outer, 8, 'brick', { layered: true, maxReferenceY: 10.5, source: 'lower-layer' });
  const upper = R.addTop(polygon, 12, 'wood', { layered: true, minReferenceY: 11, maxReferenceY: 17,
    plane: { x: 0, y: 12, z: 0, dx: 0.125, dz: -0.0625 },
    capabilities: { transition: true, restartsAtRest: true }, source: 'upper-layer' });
  upper.ceilingOffset = 3.5; upper.outer = outer; upper.holes = [hole];
  batch(R, 100, 1); // Ensure the sampler selects its compact representation.
  const input = { city, terrain, waterAt: () => false, topViewCacheSize: 1 };
  const raw = new SfTerrainSampler(input), compact = new SfTerrainSampler({ ...input, tops: certificate.emptyTops }, certificate);
  try {
    const a = raw.topStore, b = compact.topStore;
    assert.ok(b.addresses, 'ordinary facets must be queried through the compact store');
    assert.equal((a.tags[1] >>> 6) & 15, 15, '20 vertices use the extended polygon count');
    sameQueries(a, b);
    assert.deepEqual([...a.ceilingIds], [1]); assert.deepEqual([...b.ceilingIds], [1]);
    const view = b.get(1);
    assert.deepEqual(view.poly, upper.poly); assert.deepEqual(view.outer, upper.outer); assert.deepEqual(view.holes, upper.holes);
    assert.equal(view.capabilities, upper.capabilities);
    for (const [key, value] of [['minReferenceY', 11], ['maxReferenceY', 17], ['ceilingOffset', 3.5]]) {
      assert.ok(Object.hasOwn(view, key)); assert.ok(Object.is(view[key], value));
      assert.ok(Object.is(b.property(1, key), a.property(1, key))); assert.ok(Object.is(b.property(1, key), value));
    }
    for (const [x, z, boundary, expected] of [[0.25, 0.25, true, true], [1.5, 1.5, true, false],
      [6, 0, true, false], [1, 1.5, true, true], [1, 1.5, false, false]]) {
      assert.equal(a.contains(1, x, z, boundary), expected);
      assert.equal(b.contains(1, x, z, boundary), expected);
    }
    for (const [x, z, reference, expected, source] of [[0.25, 0.25, 9, 8, 'lower-layer'],
      [0.25, 0.25, 12.25, 12.015625, 'upper-layer'], [0.25, 0.25, 10.75, 0, terrain],
      [0.25, 0.25, 15.75, 0, terrain], [1.5, 1.5, 12.25, 0, terrain]]) {
      const before = raw.sampleGround(x, z, { normal: {} }, reference);
      const after = compact.sampleGround(x, z, { normal: {} }, reference);
      assert.deepEqual(after, before); assert.equal(after.height, expected); assert.equal(after.support?.source, source);
    }
    for (const sampler of [raw, compact]) {
      assert.equal(sampler.transitionAt(0.25, 0.25, 12.25), true);
      assert.equal(sampler.restartsAtRest(0.25, 0.25, 12.25), true);
      assert.equal(sampler.transitionAt(0.25, 0.25, 9), false);
      assert.equal(sampler.transitionAt(1.5, 1.5, 12.25), false);
      assert.equal(sampler.transitionAt(0.25, 0.25, 15.75), false);
      assert.equal(sampler.raycastObstacle({ x: 0, y: 13, z: 0 }, { x: 0, y: 1, z: 0 }, 10), 2.5);
    }
  } finally { certificate.release(); }
});

test('compact sampler and store reentry retain held views through cache eviction', () => {
  const { city, certificate, R } = world();
  for (let i = 0; i < 8; i++) R.addTop(ring(i * 4), 12 + i, 'wood', { layered: true, source: `ordinary-${i}`,
    plane: { x: i * 4, y: 12 + i, z: 0, dx: 0.2 + i / 10, dz: -0.1 } });
  const packed = batch(R, 100, 2, { layered: true }), packedId = 8;
  const input = { city, terrain, waterAt: () => false, topViewCacheSize: 1 };
  function makeSampler(compact) {
    let sampler, nested = false, entered = 0;
    const held = [];
    const grade = { floorAt() {
      if (nested || entered) return null;
      nested = true; entered++;
      try {
        for (let i = 1; i < 8; i++) {
          held.push(sampler.sampleGround(i * 4 + 0.5, 0.5, { normal: {} }, 25));
          sampler.topStore.get(i);
        }
      } finally { nested = false; }
      return null;
    } };
    sampler = new SfTerrainSampler({ ...input, grade, ...(compact ? { tops: certificate.emptyTops } : {}) }, compact ? certificate : null);
    return { sampler, held, entered: () => entered };
  }
  const raw = makeSampler(false), compact = makeSampler(true), position = Object.getOwnPropertyDescriptor(packed, 'pos');
  let onPosition = null;
  Object.defineProperty(packed, 'pos', { configurable: true, enumerable: true, get() {
    if (onPosition) { const callback = onPosition; onPosition = null; callback(); }
    return position.value;
  } });
  try {
    assert.ok(compact.sampler.topStore.addresses, 'reentrant checks must use the compact store');
    function exercise(harness) {
      const { sampler, held } = harness, store = sampler.topStore;
      const outer = sampler.sampleGround(0.5, 0.5, { normal: {} }, 25), outerSnapshot = structuredClone(outer);
      assert.equal(harness.entered(), 1); assert.equal(held.length, 7);
      assert.equal(outer.support.source, 'ordinary-0'); assert.equal(outer.plane, outer.support.plane);
      const nestedSnapshots = held.map(value => structuredClone(value));
      store.cache.clear();
      const nestedViews = []; let sourceCallbacks = 0;
      onPosition = () => { sourceCallbacks++; nestedViews.push(store.get(0), store.get(1)); };
      const packedView = store.get(packedId), packedSnapshot = structuredClone(packedView);
      assert.equal(sourceCallbacks, 1); assert.equal(nestedViews.length, 2);
      const viewSnapshots = nestedViews.map(value => structuredClone(value));
      let minX, setterCalls = 0, nestedSample;
      const bounds = { set minX(value) {
        minX = value; setterCalls++; store.get(2);
        nestedSample = sampler.sampleGround(12.5, 0.5, { normal: {} }, 25);
      } };
      assert.equal(store.getBounds(packedId, bounds), bounds); assert.equal(setterCalls, 1);
      assert.equal(nestedSample.support.source, 'ordinary-3');
      for (let i = 0; i < 24; i++) { store.get(i % 8); sampler.sampleGround(4.5, 0.5, { normal: {} }, 25); }
      assert.deepEqual(outer, outerSnapshot); assert.deepEqual(packedView, packedSnapshot);
      held.forEach((value, i) => assert.deepEqual(value, nestedSnapshots[i]));
      nestedViews.forEach((value, i) => assert.deepEqual(value, viewSnapshots[i]));
      assert.equal(store.cacheStats.records, 1); assert.equal(store.cacheStats.limit, 1);
      assert.ok(Object.isFrozen(outer.support) && Object.isFrozen(outer.plane) && Object.isFrozen(packedView.poly[0]));
      assert.throws(() => { outer.plane.dx = 200; }, TypeError);
      assert.throws(() => { packedView.poly[0].x = 200; }, TypeError);
      return { outer, held, packedView, nestedViews, nestedSample,
        bounds: { minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ } };
    }
    assert.deepEqual(exercise(compact), exercise(raw));
  } finally {
    onPosition = null; Object.defineProperty(packed, 'pos', position); certificate.release();
  }
});

test('paged snapshots preserve interleaving, boundary IDs, ordinary extras and retained views', () => {
  const { city, certificate, R } = world();
  const capability = { feature: 'un-plaza', transition: true }, symbol = Symbol('diagnostic');
  const first = ordinary(R, -20, { capabilities: capability, source: 'park' });
  first.maxReferenceY = undefined; first[symbol] = capability; first.poly[0].annotation = -0;
  for (let i = 0; i < 127; i++) ordinary(R, -1000 - i * 4);
  const a = batch(R, 0, 129, { replacesTerrain: true });
  ordinary(R, 1000); const b = batch(R, 1100, 132, { layered: true }); ordinary(R, 1700);
  const quad = R.addTriangles(new Float64Array([2000, 10, 0, 2000, 10, 2, 2002, 10.25, 0, 2002, 10.25, 2]),
    new Uint16Array([0, 1, 2, 2, 1, 3]), 'brick', { packed: true });
  assert.equal(quad.countAt(0), 4); assert.ok(quad.anchorAt(0) >= 0);
  city.ride.tops.push(first); // first-identity dedup, without changing global order
  const [raw, compact] = stores(city, certificate);
  assert.ok(raw.tags instanceof Uint32Array && raw.offsets instanceof Uint32Array && raw.batchOf instanceof Uint16Array);
  assert.ok(compact.addresses); assert.equal(compact.tags, null); assert.equal(compact.offsets, null);
  sameQueries(raw, compact);
  assert.equal(compact.property(0, 'capabilities'), first.capabilities);
  assert.equal(compact.get(0).capabilities, first.capabilities);
  assert.equal(compact.get(0)[symbol], capability);
  assert.ok(Object.hasOwn(compact.get(0), 'maxReferenceY'));
  assert.ok(Object.is(compact.get(0).poly[0].annotation, -0));
  assert.equal(compact.extras.size, raw.extras.size);
  assert.equal(compact.addresses.locator[127], 255, 'the last ordinary ordinal of a full page is representable');
  const packedId = 128, held = compact.get(packedId), heldCopy = structuredClone(held), snapshot = compact.tagAt(packedId);
  // Mutating referenced geometry changes live geometry as in the raw store, but
  // must never rewrite the first-pass tag snapshot or an escaped cached view.
  a.facet[0] ^= 1; b.facet[0] ^= 1;
  assert.equal(compact.tagAt(packedId), snapshot); assert.equal(compact.tagAt(packedId), raw.tags[packedId]);
  for (let id = packedId + 1; id < packedId + 11; id++) compact.get(id);
  assert.deepEqual(held, heldCopy); assert.ok(Object.isFrozen(held.poly[0]));
  assert.deepEqual(compact.get(packedId), raw.get(packedId));
  sameAddresses(raw, compact);
  certificate.release();
});

test('numeric queries match every mixed-page ID after live packed geometry and metadata mutation', () => {
  const { city, certificate, R } = world();
  for (let i = 0; i < 127; i++) ordinary(R, -1000 - i * 4);
  const firstBatch = batch(R, 0, 130, { layered: true }); // IDs 127..256
  const tagged = ordinary(R, 700, { capabilities: { transition: true, restartsAtRest: true }, source: 'tagged' });
  batch(R, 800, 125); // IDs 258..382
  ordinary(R, 1400); // ID 383
  batch(R, 1500, 130); // IDs 384..513
  ordinary(R, 2100);
  const [raw, compact] = stores(city, certificate, 2);
  assert.ok(compact.addresses); assert.equal(compact.length, 515);
  sameQueries(raw, compact); // includes both sides of every 128-ID boundary
  const packedId = 128, tagSnapshot = raw.tags[packedId], held = compact.get(packedId), saved = structuredClone(held);
  const vertex = firstBatch.ids[4] * 3;
  firstBatch.facet[1] ^= 1; // live polygon count changes, captured tag does not
  firstBatch.slope[2] = -0; firstBatch.pos[vertex] = -0; firstBatch.pos[vertex + 1] = -0;
  firstBatch.template.surface = 'changed after construction';
  tagged.capabilities.transition = false;
  for (const id of [0, 127, 129, 256, 257, 383, 384, 512, 514]) compact.get(id);
  assert.deepEqual(held, saved, 'evicted views retain independently owned geometry');
  assert.equal(compact.tagAt(packedId), tagSnapshot);
  assert.ok(Object.is(compact.plane(packedId, {}).dx, -0));
  assert.equal(compact.property(packedId, 'surface'), raw.property(packedId, 'surface'));
  assert.equal(compact.property(257, 'capabilities'), tagged.capabilities);
  assert.equal(compact.property(257, 'capabilities').transition, false);
  sameQueries(raw, compact);
  assert.deepEqual(compact.getBounds(-0, {}), raw.getBounds(-0, {}));
  assert.ok(Object.is(compact.heightAt(-0, 0, 0), raw.heightAt(-0, 0, 0)));
  certificate.release();
});

test('sampler indices, source-order ties, capability identity and rays match the raw store', () => {
  const { city, certificate, R } = world();
  for (let i = 0; i < 126; i++) ordinary(R, -900 + i * 4);
  ordinary(R, 0, { capabilities: { transition: true }, source: 'first' });
  batch(R, 0, 2);
  const last = ordinary(R, 0, { capabilities: { transition: true, restartsAtRest: true }, source: 'last' });
  const input = { city, terrain, waterAt: () => false, topViewCacheSize: 1 };
  const raw = new SfTerrainSampler(input), compact = new SfTerrainSampler({ ...input, tops: certificate.emptyTops }, certificate);
  assert.ok(compact.topStore.addresses);
  assert.equal(raw.topStore.addresses, null);
  const query = { minX: 0.5, maxX: 0.5, minZ: 0.5, maxZ: 0.5 };
  assert.deepEqual(compact.topIndex.query(query), raw.topIndex.query(query));
  assert.deepEqual([...compact.capabilityIndex.items.ids], [...raw.capabilityIndex.items.ids]);
  const a = raw.sampleGround(0.5, 0.5, { normal: {} }, 10), b = compact.sampleGround(0.5, 0.5, { normal: {} }, 10);
  assert.deepEqual(b, a); assert.equal(b.support.source, 'last');
  assert.equal(b.support.capabilities, last.capabilities);
  assert.equal(raw.transitionAt(0.5, 0.5, 10), true); assert.equal(compact.transitionAt(0.5, 0.5, 10), true);
  assert.equal(raw.restartsAtRest(0.5, 0.5, 10), true); assert.equal(compact.restartsAtRest(0.5, 0.5, 10), true);
  assert.deepEqual([...compact.capabilityIndex.items.ids], [126, 129], 'tagged IDs straddle a page boundary');
  last.capabilities.transition = false;
  assert.equal(raw.transitionAt(0.5, 0.5, 10), false); assert.equal(compact.transitionAt(0.5, 0.5, 10), false);
  assert.equal(compact.raycast({ x: 0.5, y: 15, z: 0.5 }, { x: 0, y: -1, z: 0 }, 20),
    raw.raycast({ x: 0.5, y: 15, z: 0.5 }, { x: 0, y: -1, z: 0 }, 20));
  const explicit = new SfTerrainSampler({ ...input, tops: [] }, certificate);
  assert.equal(explicit.topStore.addresses, null, 'an explicit external list is not certified');
  certificate.release();
});

test('default public constructors do not read newly named option getters', () => {
  const storeOptions = { cacheSize: 0, get compactCertificate() { throw Error('unexpected store option read'); },
    get compactEmptyLists() { throw Error('unexpected store option read'); } };
  const store = new SfSupportStore([[]], storeOptions);
  assert.ok(store.tags instanceof Uint32Array); assert.ok(store.offsets instanceof Uint32Array);
  const input = { terrain, get compactSupport() { throw Error('unexpected sampler option read'); } };
  const sampler = new SfTerrainSampler(input);
  assert.ok(sampler.topStore.tags instanceof Uint32Array);
});

test('compact stores remain SfSupportStore instances; custom subclasses keep raw ownership', () => {
  const { city, certificate, R } = world();
  ordinary(R, 0); batch(R, 20, 1);
  const [raw, compact] = stores(city, certificate, 0);
  class CustomStore extends SfSupportStore { marker() { return 'custom'; } }
  const custom = new CustomStore([city.ride.tops], {}, certificate);
  try {
    assert.equal(Object.getPrototypeOf(raw), SfSupportStore.prototype);
    assert.ok(compact instanceof SfSupportStore); assert.equal(compact.constructor, SfSupportStore);
    assert.ok(custom instanceof CustomStore && custom instanceof SfSupportStore); assert.equal(custom.marker(), 'custom');
    assert.equal(custom.addresses, null); assert.ok(custom.tags instanceof Uint32Array);
    assert.ok(custom.offsets instanceof Uint32Array && custom.batchOf instanceof Uint16Array);
    sameAddresses(raw, custom);
  } finally { certificate.release(); }
});

test('raw height and plane retain separate tag getter reads in original order', () => {
  const { city, certificate, R } = world();
  ordinary(R, 0, { plane: { x: 0, y: 10, z: 0, dx: 0.5, dz: 0.25 } });
  const packed = batch(R, 20, 2); packed.facet[0] = (packed.facet[0] & ~14) | 2;
  city.ride.tops.push({ poly: ring(100), top: 10, surface: 'wood' }); // uncertified: forces genuine opt-in fallback
  for (const mode of ['default', 'forged-fallback', 'native-fallback']) {
    const token = mode === 'native-fallback' ? certificate : mode === 'forged-fallback' ? { certificate } : null;
    const store = new SfSupportStore([city.ride.tops], {}, token);
    assert.equal(store.addresses, null);
    const words = store.tags, originalOffsets = store.offsets, originalValues = store.values,
      originalBatches = store.batches, originalBatchOf = store.batchOf;
    const tags = words.slice(), noPlane = words.slice(); noPlane[0] &= ~1;
    const referenced = words.slice(); referenced[0] |= 0x80000000;
    const trace = []; let calls = 0, snapshots = [noPlane, tags];
    Object.defineProperty(store, 'tags', { get() { trace.push('tags'); return snapshots[Math.min(calls++, 1)]; } });
    Object.defineProperty(store, 'offsets', { get() { trace.push('offsets'); return originalOffsets; } });
    Object.defineProperty(store, 'values', { get() { trace.push('values'); return originalValues; } });
    Object.defineProperty(store, 'batches', { get() { trace.push('batches'); return originalBatches; } });
    Object.defineProperty(store, 'batchOf', { get() { trace.push('batchOf'); return originalBatchOf; } });
    for (const name of ['tagAt', 'offsetAt', 'batchAt', 'addresses']) {
      Object.defineProperty(store, name, { get() { throw Error(`unexpected ${name} dispatch`); } });
    }
    assert.equal(store.heightAt(0, 1, 1), 10.75);
    assert.deepEqual(trace, ['tags', 'offsets', 'values', 'tags']);
    trace.length = 0; calls = 0; snapshots = [tags, referenced];
    assert.deepEqual(store.plane(0, {}), { x: 20, y: 10, z: 0, dx: 0, dz: 0 });
    assert.deepEqual(trace, ['tags', 'tags', 'batches', 'batchOf', 'offsets']);
  }
  certificate.release();
});

test('all raw query paths preserve frozen-baseline accessor order, including proxy receivers',
  { skip: !FrozenSupportStore && 'private frozen baseline unavailable' }, () => {
    const { city, certificate, R } = world();
    ordinary(R, 0, { plane: { x: 0, y: 10, z: 0, dx: 0.5, dz: 0.25 }, source: 'ordinary' });
    const packed = batch(R, 20, 2); packed.facet[0] = (packed.facet[0] & ~14) | 2;
    const foreign = { poly: ring(100), top: 10, surface: 'wood' };
    city.ride.tops.push(foreign);
    assert.equal(isCertifiedCompactSupport(certificate), true);
    assert.equal(certificate.owns(city.ride.tops[0]), 'ordinary');
    assert.equal(certificate.owns(packed), 'packed');
    assert.equal(certificate.owns(foreign), null);
    const calls = [
      ['getBounds', 0], ['getBounds', 1], ['property', 0], ['property', 1], ['plane', 0], ['plane', 1],
      ['heightAt', 0], ['heightAt', 1], ['contains', 0], ['contains', 1], ['get', 0], ['get', 1], ['packedView', 1]
    ];
    function run(Type, method, id, receiverProxy, fallback) {
      const store = new Type([city.ride.tops], {}, fallback ? certificate : null), trace = [], arrays = {};
      if (Type === SfSupportStore) assert.equal(store.addresses, null, fallback ? 'genuine token must fall back' : 'default remains raw');
      for (const key of ['tags', 'offsets', 'batchOf', 'values', 'batches', 'extras', 'metadata']) arrays[key] = store[key];
      for (const key of Object.keys(arrays)) Object.defineProperty(store, key, { get() { trace.push(key); return arrays[key]; } });
      for (const key of ['tagAt', 'offsetAt', 'batchAt', 'addresses']) {
        Object.defineProperty(store, key, { get() { throw Error(`unexpected ${key} dispatch`); } });
      }
      const receiver = receiverProxy ? new Proxy(store, { get(target, key, self) {
        trace.push(`receiver:${String(key)}`); return Reflect.get(target, key, self);
      } }) : store;
      let value, output;
      try {
        if (method === 'getBounds' || method === 'plane') { output = {}; value = receiver[method](id, output); }
        else if (method === 'property') value = receiver.property(id, 'surface');
        else if (method === 'heightAt' || method === 'contains') value = receiver[method](id, 1, 1);
        else if (method === 'packedView') value = receiver.packedView(id, arrays.tags[id]);
        else value = receiver.get(id);
      } catch (error) { value = { name: error.name, message: error.message }; }
      return { trace, value, output };
    }
    for (const [method, id] of calls) for (const proxy of [false, true]) for (const fallback of [false, true]) {
      assert.deepEqual(run(SfSupportStore, method, id, proxy, fallback),
        run(FrozenSupportStore, method, id, proxy, false), `${method}/${id}/proxy=${proxy}/fallback=${fallback}`);
    }
    certificate.release();
  });

test('raw and genuine-token fallback construction do not access Array.prototype.reduce', () => {
  const { city, certificate, R } = world();
  batch(R, 0, 1);
  city.ride.tops.push({ poly: ring(100), top: 10, surface: 'wood' });
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'reduce');
  let reads = 0, raw, fallback;
  try {
    Object.defineProperty(Array.prototype, 'reduce', { configurable: true, get() { reads++; throw Error('unexpected reduce access'); } });
    raw = new SfSupportStore([city.ride.tops]);
    fallback = new SfSupportStore([city.ride.tops], {}, certificate);
  } finally { Object.defineProperty(Array.prototype, 'reduce', descriptor); certificate.release(); }
  assert.equal(reads, 0);
  assert.equal(raw.addresses, null); assert.equal(fallback.addresses, null);
  assert.deepEqual([...fallback.tags], [...raw.tags]);
  assert.deepEqual([...fallback.offsets], [...raw.offsets]);
});

test('raw construction keeps the frozen Uint32 source-tag growth and allocation sequence',
  { skip: !FrozenSupportStore && 'private frozen baseline unavailable' }, () => {
    const inputs = Array.from({ length: 2051 }, (_, i) => ({ poly: ring(i * 4), top: 10, surface: 'wood' }));
    const OriginalUint32 = globalThis.Uint32Array; let allocations;
    class TrackedUint32 extends OriginalUint32 {
      constructor(...args) { super(...args); if (typeof args[0] === 'number') allocations.push(args[0]); }
    }
    function run(Type, token) {
      allocations = [];
      const store = new Type([inputs], {}, token);
      return { allocations: [...allocations], facets: store.length, typedBytes: store.stats.typedBytes };
    }
    try {
      globalThis.Uint32Array = TrackedUint32;
      const baseline = run(FrozenSupportStore, null);
      assert.deepEqual(run(SfSupportStore, null), baseline);
      assert.deepEqual(run(SfSupportStore, { certificate: { owns() { throw Error('forged'); } } }), baseline);
      assert.deepEqual(baseline.allocations.slice(0, 3), [1024, 2048, 4096]);
    } finally { globalThis.Uint32Array = OriginalUint32; }
  });

test('compact unvalidated queries use the same typed-array index coercion as raw queries', () => {
  const { city, certificate, R } = world();
  ordinary(R, 0, { plane: { x: 0, y: 10, z: 0, dx: 0.5, dz: 0.25 }, source: 'first' });
  const packed = batch(R, 20, 2); packed.facet[0] = (packed.facet[0] & ~14) | 2;
  const [raw, compact] = stores(city, certificate, 0); assert.ok(compact.addresses);
  const identifiers = [0, -0, 1, 3, -1, 1.5, NaN, Infinity, -Infinity, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff, 2 ** 53,
    0n, 1n, 3n, -1n, 2n ** 100n,
    '0', '1', '3', '-0', '01', '1.0', '-1', 'NaN', 'Infinity', 'length', 'byteLength', 'byteOffset',
    'buffer', 'constructor', '__proto__', 'BYTES_PER_ELEMENT', 'set', undefined, null, true, false,
    Symbol.iterator, Symbol.toStringTag, Symbol.toPrimitive, Symbol('missing')];
  function invoke(store, method, id) {
    const out = {};
    try {
      let value;
      if (method === 'getBounds' || method === 'plane') value = store[method](id, out);
      else if (method === 'property') value = store.property(id, 'surface');
      else value = store[method](id, 1, 1);
      return { value, out };
    } catch (error) { return { name: error.name, message: error.message, out }; }
  }
  for (const id of identifiers) for (const method of ['getBounds', 'heightAt', 'plane', 'contains', 'property']) {
    assert.deepEqual(invoke(compact, method, id), invoke(raw, method, id), `${method}/${String(id)}`);
  }
  for (const id of [0n, 1n, '0', { toString: () => '0' }]) {
    assert.throws(() => compact.get(id), RangeError); assert.throws(() => raw.get(id), RangeError);
  }
  assert.ok(Object.is(compact.offsetAt(-0), raw.offsets[-0]));
  assert.equal(compact.offsetAt(BigInt(compact.length)), raw.offsets[raw.length]);
  certificate.release();
});

test('each compact lookup coerces a side-effectful key once per original array read', () => {
  const { city, certificate, R } = world();
  ordinary(R, 0, { plane: { x: 0, y: 10, z: 0, dx: 0.5, dz: 0.25 } });
  const packed = batch(R, 20, 2); packed.facet[0] = (packed.facet[0] & ~14) | 2;
  const [raw, compact] = stores(city, certificate, 0);
  const scenarios = [
    ['getBounds', [0n, 1n]], ['getBounds', [1n, 1n, 0n]],
    ['plane', [0n, 1n, 1n, 1n]], ['heightAt', [0n, 0n, 1n]],
    ['heightAt', [1n, 1n, 1n]], ['contains', [1n, 1n, 1n]],
    ['property', [0n, 1n]], ['getBounds', [Symbol.iterator, '0']],
    ['heightAt', [0n, '01', 1n]]
  ];
  function run(store, method, values) {
    const trace = [], id = { [Symbol.toPrimitive](hint) {
      trace.push(hint); return values[Math.min(trace.length - 1, values.length - 1)];
    } }, out = {};
    try {
      const value = method === 'getBounds' || method === 'plane' ? store[method](id, out)
        : method === 'property' ? store.property(id, 'surface') : store[method](id, 1, 1);
      return { trace, value, out };
    } catch (error) { return { trace, name: error.name, message: error.message, out }; }
  }
  for (const [method, values] of scenarios) assert.deepEqual(run(compact, method, values), run(raw, method, values), method);
  certificate.release();
});

test('fused numeric queries preserve original store and packed-source getter order', () => {
  const { city, certificate, R } = world();
  ordinary(R, 0, { plane: { x: 0, y: 10, z: 0, dx: 0.5, dz: 0.25 }, source: 'ordinary' });
  const source = batch(R, 20, 1); source.facet[0] |= 2;
  const [raw, compact] = stores(city, certificate, 0), trace = [], facet = source.facet, initial = facet[0], packedTag = raw.tags[1];
  for (const key of ['facet', 'ids', 'pos', 'slope', 'top']) {
    const value = source[key];
    Object.defineProperty(source, key, { configurable: true, get() { trace.push(`source.${key}`); return value; } });
  }
  for (const store of [raw, compact]) for (const key of ['values', 'batches', 'metadata', 'extras']) {
    const value = store[key];
    Object.defineProperty(store, key, { configurable: true, get() {
      trace.push(`store.${key}`);
      if (key === 'batches') facet[0] ^= 1; // Mutate externally owned geometry during the lookup.
      return value;
    } });
  }
  function run(store, method, id) {
    facet[0] = initial; trace.length = 0;
    const out = {}, x = id === 0 ? 0.5 : 20.5;
    let value;
    try {
      if (method === 'getBounds' || method === 'plane') value = store[method](id, out);
      else if (method === 'property') value = store.property(id, 'surface');
      else if (method === 'heightAt' || method === 'contains') value = store[method](id, x, 0.5);
      else if (method === 'packedView') value = store.packedView(id, packedTag);
      else value = store.get(id);
      return { value, out, trace: [...trace] };
    } catch (error) { return { name: error.name, message: error.message, trace: [...trace] }; }
  }
  try {
    for (const method of ['getBounds', 'heightAt', 'plane', 'contains', 'property', 'get']) for (const id of [0, 1]) {
      assert.deepEqual(run(compact, method, id), run(raw, method, id), `${method}/${id}`);
    }
    assert.deepEqual(run(compact, 'packedView', 1), run(raw, 'packedView', 1));
  } finally { certificate.release(); }
});

test('fused numeric queries preserve signed-zero IDs, coordinates and planes', () => {
  const { city, certificate, R } = world();
  R.addTop([{ x: -0, z: -0 }, { x: -0, z: 2 }, { x: 2, z: 2 }, { x: 2, z: -0 }], -0, 'wood',
    { plane: { x: -0, y: -0, z: -0, dx: -0, dz: -0 } });
  batch(R, 20, 1);
  const [raw, compact] = stores(city, certificate, 0);
  try {
    const a = raw.plane(-0, {}), b = compact.plane(-0, {});
    assert.deepEqual(b, a);
    for (const key of ['x', 'y', 'z', 'dx', 'dz']) assert.ok(Object.is(b[key], -0), key);
    assert.deepEqual(compact.getBounds(-0, {}), raw.getBounds(-0, {}));
    assert.ok(Object.is(compact.heightAt(-0, -0, -0), raw.heightAt(-0, -0, -0)));
    assert.equal(compact.contains(-0, 0.5, 0.5), raw.contains(-0, 0.5, 0.5));
    assert.equal(compact.property(-0, 'surface'), raw.property(-0, 'surface'));
    assert.deepEqual(compact.get(-0), raw.get(-0));
  } finally { certificate.release(); }
});

test('packed source getter failures propagate with the raw query order', () => {
  const { city, certificate, R } = world();
  ordinary(R, 0); const source = batch(R, 20, 1); source.facet[0] |= 2;
  const [raw, compact] = stores(city, certificate, 0), trace = [];
  Object.defineProperty(source, 'facet', { configurable: true, get() { trace.push('facet'); throw Error('source facet failure'); } });
  const run = (store, method) => {
    trace.length = 0;
    try {
      if (method === 'getBounds' || method === 'plane') store[method](1, {});
      else if (method === 'get') store.get(1);
      else store[method](1, 20.5, 0.5);
      return { trace: [...trace], error: null };
    } catch (error) { return { trace: [...trace], name: error.name, message: error.message }; }
  };
  try {
    for (const method of ['getBounds', 'heightAt', 'plane', 'contains', 'get']) {
      const expected = run(raw, method); assert.ok(expected.trace.length > 0, method);
      assert.deepEqual(run(compact, method), expected, method);
    }
    trace.length = 0;
    assert.equal(compact.property(1, 'surface'), raw.property(1, 'surface'));
    assert.deepEqual(trace, [], 'metadata lookup does not read geometry');
  } finally { certificate.release(); }
});

test('forged, proxy, revoked and foreign certificates always take raw path without probing them', () => {
  const { city, certificate, R } = world(), trace = [];
  batch(R, 0, 1);
  const forged = new Proxy({}, { get() { throw Error('forged getter'); },
    getOwnPropertyDescriptor() { throw Error('forged descriptor'); }, getPrototypeOf() { throw Error('forged prototype'); } });
  const wrapper = { get certificate() { throw Error('wrapper getter'); }, get tops() { throw Error('tops getter'); },
    owns() { throw Error('forged owns'); } };
  const imposter = { certificate: { tops: city.ride.tops, owns() { throw Error('forged owns'); } } };
  const wrapped = new Proxy(certificate, { get() { throw Error('wrapped token getter'); } });
  const tokens = [forged, wrapper, imposter, Object.create(certificate), wrapped, { certificate }, 42, 'token'];
  assert.equal(isCertifiedCompactSupport(certificate), true);
  for (const token of tokens) {
    assert.equal(isCertifiedCompactSupport(token), false);
    function* input() { trace.push('iterator'); yield* city.ride.tops; }
    const store = new SfSupportStore([input()], {}, token);
    assert.equal(store.addresses, null); assert.ok(store.tags instanceof Uint32Array);
  }
  assert.equal(trace.length, tokens.length);
  const foreignCity = {}; new Function('window', geometry)({ NYC: foreignCity });
  const foreign = foreignCity.RideGeometry.beginCompactSupport();
  assert.equal(isCertifiedCompactSupport(foreign), false);
  assert.equal(new SfSupportStore([city.ride.tops], {}, foreign).addresses, null);
  foreign.release(); certificate.release();
  assert.equal(isCertifiedCompactSupport(certificate), false);
  assert.equal(new SfSupportStore([city.ride.tops], {}, certificate).addresses, null);
});

test('a forged wrapper cannot re-read getter-bearing legacy input during fallback', () => {
  function run(forged) {
    const trace = [];
    const legacy = { get packedTops() { trace.push('packed'); return true; },
      get length() { trace.push('length'); return 1; }, template: { surface: 'wood' }, len: new Uint8Array([3]),
      pos: new Float64Array([0, 10, 0, 0, 10, 2, 2, 10, 0]), ids: new Uint16Array([0, 1, 2, 0]),
      top: new Float64Array([10]), anchor: new Int32Array([-1]), slope: new Float64Array(2) };
    function* input() { trace.push('iterator'); yield legacy; }
    const lists = [input()], token = forged ? { certificate: { tops: lists[0], owns() { throw Error('forged owns'); } } } : null;
    const store = new SfSupportStore(lists, {}, token);
    assert.equal(store.addresses, null);
    return { trace, tags: [...store.tags], offsets: [...store.offsets], batchOf: [...store.batchOf] };
  }
  assert.deepEqual(run(true), run(false));
});

test('the captured native verifier is unaffected by later replacement of the global city', () => {
  const { city, certificate, R } = world(); batch(R, 0, 1);
  const old = globalThis.window.NYC;
  globalThis.window.NYC = { get RideGeometry() { throw Error('unexpected global lookup'); } };
  try {
    assert.equal(isCertifiedCompactSupport(certificate), true);
    assert.ok(new SfSupportStore([city.ride.tops], {}, certificate).addresses);
    const forged = new Proxy({}, { get() { throw Error('unexpected token lookup'); } });
    assert.equal(new SfSupportStore([city.ride.tops], {}, forged).addresses, null);
  } finally { globalThis.window.NYC = old; certificate.release(); }
});

test('the token brand does not depend on later WeakSet prototype replacement', () => {
  const { city, certificate, R } = world(); batch(R, 0, 1);
  const original = WeakSet.prototype.has, forged = new Proxy({}, { get() { throw Error('forged getter'); } });
  try {
    WeakSet.prototype.has = () => true;
    assert.equal(isCertifiedCompactSupport(forged), false);
    assert.ok(new SfSupportStore([city.ride.tops], {}, certificate).addresses);
    assert.equal(new SfSupportStore([city.ride.tops], {}, forged).addresses, null);
  } finally { WeakSet.prototype.has = original; certificate.release(); }
});

test('an early module import without the native factory safely stays raw', async () => {
  const previous = globalThis.window;
  globalThis.window = {};
  let EarlyStore;
  try { ({ SfSupportStore: EarlyStore } = await import('../js/sf-support-store.js?early-compact-proof')); }
  finally { globalThis.window = previous; }
  const { city, certificate, R } = world(); batch(R, 0, 1);
  const result = new EarlyStore([city.ride.tops], {}, certificate);
  assert.equal(result.addresses, null); assert.ok(result.tags instanceof Uint32Array);
  certificate.release();
});

test('manager releases a genuine session with an injected sampler and on construction failures', () => {
  const { city, certificate } = world(), events = [];
  const source = readFileSync(new URL('../js/controllers.js', import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '')
    .replace('export { ThirdPersonControllerManager };', 'globalThis.Manager = ThirdPersonControllerManager;');
  let failSampler = false, failEntity = false;
  const context = { isCertifiedCompactSupport, getCity: () => city, getSfSpawn: () => ({}),
    isTypingInField: () => false, window: { addEventListener() {} }, document: { addEventListener() {} },
    SfTerrainSampler: class { constructor() { events.push('sampler'); if (failSampler) throw Error('sampler failed'); } },
    createEucEntity(_scene, sampler) { events.push('entity'); if (failEntity) throw Error('entity failed'); return { sampler }; } };
  vm.runInNewContext(source, context);
  const injected = {}, manager = new context.Manager({}, [], { ride: city.ride, sampler: injected, spawn: {} }, certificate);
  assert.equal(manager.eucSampler, injected); assert.deepEqual(events, ['entity']);
  assert.equal(isCertifiedCompactSupport(certificate), false);
  let next = city.RideGeometry.beginCompactSupport(); assert.ok(next);
  failSampler = true;
  assert.throws(() => new context.Manager({}, [], { ride: city.ride, spawn: {} }, next), /sampler failed/);
  assert.equal(isCertifiedCompactSupport(next), false);
  next = city.RideGeometry.beginCompactSupport(); assert.ok(next);
  failSampler = false; failEntity = true;
  assert.throws(() => new context.Manager({}, [], { ride: city.ride, sampler: injected, spawn: {} }, next), /entity failed/);
  assert.equal(isCertifiedCompactSupport(next), false);
  const forged = new Proxy({}, { get() { throw Error('forged token getter'); } });
  failEntity = false;
  assert.equal(new context.Manager({}, [], { ride: city.ride, sampler: injected, spawn: {} }, forged).eucSampler, injected);
  next = city.RideGeometry.beginCompactSupport(); assert.ok(next); next.release();
});

test('Light startup stop releases the session and permits a fresh attempt; Full starts none', () => {
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const begin = source.indexOf('  const compactSupport = worldTier.light'), end = source.indexOf("  startup.phase('city');", begin);
  assert.ok(begin >= 0 && end > begin);
  const block = source.slice(begin, end);
  const boot = readFileSync(new URL('../js/boot.js', import.meta.url), 'utf8');
  const { city, certificate } = world(); certificate.release();
  function startupShell() {
    const nodes = new Map(), document = { body: { dataset: {} }, activeElement: null, hidden: false,
      querySelector: () => ({ content: 'test' }), getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { textContent: '', classList: { add() {}, remove() {} }, setAttribute() {},
          addEventListener() {}, focus() { document.activeElement = this; } });
        return nodes.get(id);
      } };
    const context = { document, performance: { now: () => 0 }, console: { error() {}, warn() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      MutationObserver: class { observe() {} }, addEventListener() {}, removeEventListener() {},
      setInterval: () => 1, clearInterval() {}, requestAnimationFrame() {} };
    context.window = context;
    const cut = boot.indexOf('  // The static failure shell'); assert.ok(cut > 0);
    vm.runInNewContext(boot.slice(0, cut) + 'globalThis.api = startup; })();', context);
    return context.api;
  }
  const start = (light, startup) => vm.runInNewContext(`${block}\ncompactSupport`, { worldTier: { light }, city, startup });
  const full = startupShell(); assert.equal(start(false, full), null);
  const first = startupShell(), token = start(true, first); assert.ok(isCertifiedCompactSupport(token));
  assert.equal(first.fail(Error('startup interrupted')), true); assert.equal(first.fail(Error('again')), false);
  assert.equal(isCertifiedCompactSupport(token), false);
  const retry = startupShell(), retryToken = start(true, retry); assert.ok(isCertifiedCompactSupport(retryToken));
  retryToken.release(); retry.fail(Error('stopped after manager')); // manager + boot stop are idempotent
  const again = startupShell(), last = start(true, again); assert.ok(isCertifiedCompactSupport(last)); again.fail(Error('stop'));
});

test('32 batches per page and 256 batches are representable; 33 and 257 fall back', () => {
  for (const [number, facets, expected] of [[32, 1, true], [33, 1, false], [256, 4, true], [257, 4, false]]) {
    const { city, certificate, R } = world();
    for (let i = 0; i < number; i++) batch(R, i * 100, facets);
    const [raw, candidate] = stores(city, certificate, 0);
    assert.equal(!!candidate.addresses, expected, `${number} batches, ${facets} facets`);
    sameAddresses(raw, candidate);
    if (!expected) assert.ok(candidate.tags instanceof Uint32Array && candidate.offsets instanceof Uint32Array);
    certificate.release();
  }
});

test('foreign iterables, getters, old batches and empty ranges fall back without replay', () => {
  function run(compact) {
    const { city, certificate, R } = world(), trace = [];
    batch(R, 0, 1);
    const external = { get rideIgnore() { trace.push('ignore'); return false; },
      get poly() { trace.push('poly'); return ring(20); }, get top() { trace.push('top'); return 10; },
      get surface() { trace.push('surface'); return 'wood'; } };
    function* input() { trace.push('iterator'); yield external; }
    const result = new SfSupportStore([city.ride.tops, input()], {}, compactConfig(compact, certificate));
    assert.equal(result.addresses, null); assert.equal(trace.filter(x => x === 'iterator').length, 1);
    certificate.release(); return { trace, tags: [...result.tags], offsets: [...result.offsets], values: [...result.values] };
  }
  assert.deepEqual(run(true), run(false));
  const { city, certificate, R } = world();
  const legacy = { packedTops: true, length: 1, template: { surface: 'wood' }, len: new Uint8Array([3]),
    pos: new Float64Array([0, 10, 0, 0, 10, 2, 2, 10, 0, 9, 11, 9]), ids: new Uint16Array([0, 1, 2, 0]),
    top: new Float64Array([10]), anchor: new Int32Array([3]), slope: new Float64Array([0.25, -0.5]) };
  city.ride.tops.push(legacy);
  const [raw, candidate] = stores(city, certificate); assert.equal(candidate.addresses, null); sameQueries(raw, candidate);
  assert.deepEqual(candidate.plane(0, {}), { x: 9, y: 11, z: 9, dx: 0.25, dz: -0.5 });
  city.ride.tops.length = 0; city.ride.tops.push(new R.PackedTops(Float64Array, {}));
  const [emptyRaw, emptyCandidate] = stores(city, certificate);
  assert.equal(emptyCandidate.addresses, null); sameAddresses(emptyRaw, emptyCandidate);
  certificate.release();
});

test('a native batch made empty before construction and an empty registry stay raw', () => {
  const { city, certificate, R } = world(), b = batch(R, 0, 1);
  b.length = 0;
  const [raw, candidate] = stores(city, certificate);
  assert.equal(candidate.addresses, null); sameAddresses(raw, candidate);
  city.ride.tops.length = 0;
  const [empty, emptyCandidate] = stores(city, certificate);
  assert.equal(emptyCandidate.addresses, null); sameAddresses(empty, emptyCandidate);
  certificate.release();
});

test('unexpected native packed shapes and sparse template properties take the raw path', () => {
  for (const change of [
    b => { b.template.replacesTerrain = undefined; },
    b => { Object.defineProperty(b.template, 'layered', { value: false, enumerable: false }); },
    b => { b.template.extra = 'annotation'; },
    b => { b.topOverrides = new Map(); },
    b => { b.facet = new Proxy(b.facet, {}); },
    b => { b.top = new Float64Array([10]); }
  ]) {
    const { city, certificate, R } = world(); const b = batch(R, 0, 1); change(b);
    // A proxy typed array is an unsupported shape whose native indexed access
    // may throw; compare the outcome without swallowing a construction error.
    const build = config => {
      try { const store = new SfSupportStore([city.ride.tops], {}, config); return { store }; }
      catch (error) { return { name: error.name, message: error.message }; }
    };
    const raw = build(null), candidate = build(certificate);
    if (raw.store) {
      assert.ok(candidate.store); assert.equal(candidate.store.addresses, null); sameQueries(raw.store, candidate.store);
    } else assert.deepEqual(candidate, raw);
    certificate.release();
  }
});

test('a getter on a certified record or packed template is not replayed during fallback', () => {
  for (const target of ['ordinary', 'template', 'length']) {
    function run(compact) {
      const { city, certificate, R } = world(), trace = [];
      const top = ordinary(R, 0), b = batch(R, 20, 1);
      if (target === 'ordinary') Object.defineProperty(top, 'surface', { enumerable: true, get() { trace.push('surface'); return 'wood'; } });
      if (target === 'template') Object.defineProperty(b.template, 'layered', { enumerable: true, get() { trace.push('layered'); return false; } });
      if (target === 'length') Object.defineProperty(b, 'length', { enumerable: true, get() { trace.push('length'); return 1; } });
      const store = new SfSupportStore([city.ride.tops], {}, compactConfig(compact, certificate));
      assert.equal(store.addresses, null);
      const result = { trace, tags: [...store.tags], offsets: [...store.offsets], values: [...store.values] };
      certificate.release(); return result;
    }
    assert.deepEqual(run(true), run(false), target);
  }
});

test('certification never invokes an unexpected typed-array or buffer getter', () => {
  for (const target of ['length', 'resizable']) {
    function run(compact) {
      const { city, certificate, R } = world(), trace = [], b = batch(R, 0, 1);
      if (target === 'length') Object.defineProperty(b.facet, 'length', { get() { trace.push('length'); return 1; } });
      else Object.defineProperty(b.facet.buffer, 'resizable', { get() { trace.push('resizable'); return false; } });
      const store = new SfSupportStore([city.ride.tops], {}, compactConfig(compact, certificate));
      assert.equal(store.addresses, null); certificate.release();
      return { trace, tags: [...store.tags], offsets: [...store.offsets] };
    }
    const raw = run(false), candidate = run(true);
    assert.deepEqual(candidate, raw); assert.deepEqual(candidate.trace, []);
  }
});

test('support construction errors still propagate without a second getter evaluation', () => {
  function run(compact) {
    const { city, certificate, R } = world(), trace = [], b = batch(R, 0, 1);
    Object.defineProperty(b.template, 'surface', { enumerable: true, get() { trace.push('surface'); throw Error('expected source failure'); } });
    assert.throws(() => new SfSupportStore([city.ride.tops], {}, compactConfig(compact, certificate)), /expected source failure/);
    certificate.release(); return trace;
  }
  assert.deepEqual(run(true), run(false)); assert.deepEqual(run(true), ['surface']);
});

test('fallback after a nested getter mutates a later batch retains the written prefix and getter timing', () => {
  function run(compact) {
    const { city, certificate, R } = world(), trace = [];
    batch(R, 0, 2); const top = ordinary(R, 100), later = batch(R, 200, 4);
    const point = top.poly[0], x = point.x;
    Object.defineProperty(point, 'x', { enumerable: true, configurable: true, get() {
      trace.push('x'); later.length = 2; return x;
    } });
    const store = new SfSupportStore([city.ride.tops], {}, compactConfig(compact, certificate));
    assert.equal(store.addresses, null);
    const result = { trace, tags: [...store.tags], offsets: [...store.offsets], batchOf: [...store.batchOf],
      values: [...store.values], stats: store.stats };
    certificate.release(); return result;
  }
  assert.deepEqual(run(true), run(false));
});

test('packed first-pass tag bits survive later facet mutation during construction', () => {
  function run(compact) {
    const { city, certificate, R } = world(), trace = [];
    const top = ordinary(R, 100), later = batch(R, 200, 2);
    const point = top.poly[0], x = point.x;
    Object.defineProperty(point, 'x', { enumerable: true, configurable: true, get() {
      trace.push('x'); later.facet[0] |= 1; return x;
    } });
    const store = new SfSupportStore([city.ride.tops], {}, compactConfig(compact, certificate));
    const result = { trace, tags: Array.from({ length: store.length }, (_, i) => store.tagAt(i)),
      offsets: Array.from({ length: store.length + 1 }, (_, i) => store.offsetAt(i)), planes: store.stats.planes,
      vertices: store.stats.vertices, compact: !!store.addresses };
    certificate.release(); return result;
  }
  const raw = run(false), candidate = run(true);
  assert.equal(candidate.compact, true); delete candidate.compact; delete raw.compact;
  assert.deepEqual(candidate, raw);
  assert.equal((candidate.tags[1] >>> 6) & 15, 3, 'tag is the original snapshot, not the later quad flag');
});

test('packed metadata is snapshotted at the original second-pass time', () => {
  function run(compact) {
    const { city, certificate, R } = world(), trace = [];
    const top = ordinary(R, 0), later = batch(R, 20, 1);
    const point = top.poly[0], x = point.x;
    Object.defineProperty(point, 'x', { enumerable: true, configurable: true, get() {
      trace.push('x'); later.template.surface = 'grass'; return x;
    } });
    const store = new SfSupportStore([city.ride.tops], {}, compactConfig(compact, certificate));
    const result = { trace, surface: store.property(1, 'surface'), tag: store.tagAt(1), compact: !!store.addresses };
    certificate.release(); return result;
  }
  const raw = run(false), candidate = run(true);
  assert.equal(candidate.compact, true); delete candidate.compact; delete raw.compact;
  assert.deepEqual(candidate, raw); assert.equal(candidate.surface, 'grass');
});
