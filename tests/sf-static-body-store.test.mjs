// Frozen b802a51 differential tests. CPU-only; first mismatch is bounded, never a full city diff.
// SF_STATIC_BOX_FULL=1 enables committed regional corpus; SF_STATIC_BOX_MEASURE=1 adds isolated GC/cost runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SfStaticBoxStore } from '../js/sf-static-body-store.js';
import { SfTerrainSampler, FrozenSampler, baselineAvailable, REF, ROOT, sourceHashes,
  same, regionalBoxes, options, probesFor, probe } from './helpers/sf-static-box-fixture.mjs';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';

const skip = !baselineAvailable && 'private b802a51 baseline unavailable';
const ring = (x, z) => [{ x, z }, { x: x + 2, z }, { x: x + 2, z: z + 2 }, { x, z: z + 2 }];
function boxes(n = 768) {
  return Array.from({ length: n }, (_, i) => ({ centre: { x: (i % 32) * 12 - 192, y: 11 + i % 9, z: Math.floor(i / 32) * 12 - 144 },
    halfExtents: { x: i % 5 ? .1 + (i % 17) / 8 : 4, y: .2 + (i % 7) / 7, z: i % 3 ? .09 : 3 },
    rotationY: i % 7 ? (i % 200) * .132312323 : -0, surface: i % 3 ? 'pavement' : 'wood',
    support: i % 11 === 0, occludes: i % 13 ? undefined : false, wheelSweep: i % 19 === 0,
    source: { id: i }, diagnostic: -0 }));
}

test('prepared Float64 payload, flags and collider/metadata identities match frozen preparation', { skip }, () => {
  const input = boxes();
  input.push({ centre: { x: -0, y: -0, z: -0 }, halfExtents: { x: Number.MIN_VALUE, y: 1, z: Number.MIN_VALUE }, rotationY: -0, surface: 'wood' });
  input.push({ centre: { x: 2 ** 29 + .123456789, y: 130.123456789, z: -(2 ** 28) + .7654321 },
    halfExtents: { x: .12345678912345, y: .23456789123456, z: .34567891234567 }, rotationY: .123456789, surface: 'wood' });
  const before = new FrozenSampler(options({ boxes: input })), after = new SfTerrainSampler(options({ boxes: input }));
  assert.equal(after.boxStore.cache.size, 0, 'index construction must not materialize views');
  const { staticBoxStore, ...stats } = after.stats; same(before.stats, stats, 'all old stats');
  assert.equal(staticBoxStore.typedBytes, input.length * 49);
  for (let i = 0; i < input.length; i++) {
    same(before.boxRecords[i], after.boxRecords[i], `prepared ${i}`);
    assert.equal(after.boxRecords[i].collider, input[i]);
    assert.equal(after.boxRecords[i].collider.centre, input[i].centre);
    assert.equal(after.boxRecords[i].collider.source, input[i].source);
  }
  assert.equal(after.boxStore.cache.size, 256);
  same(before.boxIndex.stats, after.boxIndex.stats, 'index stats');
  for (let l = 0; l < before.boxIndex.levels.length; l++) {
    const a = before.boxIndex.levels[l], b = after.boxIndex.levels[l];
    if (!a) { assert.equal(b, a); continue; }
    same([...a.grid], [...b.grid], 'bucket insertion order');
    same(a.starts, b.starts, 'CSR starts'); same(a.items, b.items, 'CSR source ids');
  }
});

test('native/diagnostic array readers, getters, reflection, eviction and captured views stay valid', () => {
  const input = boxes(7), store = new SfStaticBoxStore(input, { cacheSize: 1 }), r = store.records;
  assert.ok(Array.isArray(r)); assert.equal(r.length, 7);
  const escaped = r[0], copy = { ...escaped };
  for (const record of r) assert.equal(record.collider, input[record.collider.source.id]);
  assert.notEqual(r[0], escaped); same(copy, escaped, 'escaped view');
  assert.equal(r[0].collider, escaped.collider);
  assert.equal(r.filter(b => b.collider.source.id % 2 === 0).length, 4);
  assert.equal(r.find(b => b.collider.source.id === 3).collider, input[3]);
  assert.ok(r.every(b => b.collider.centre)); assert.ok(r.some(b => b.collider.source.id === 6));
  same(r.map(b => b.collider), input); same(r.slice(-2).map(b => b.collider), input.slice(-2));
  assert.equal(r.at(-1).collider, input.at(-1));
  assert.equal([...r.entries()][5][1].collider, input[5]);
  let count = 0; r.forEach((b, i, array) => { assert.equal(array, r); assert.equal(b.collider, input[i]); count++; });
  assert.equal(count, 7); assert.equal(Object.keys(r).length, 7);
  assert.equal(Object.getOwnPropertyDescriptor(r, '0').value.collider, input[0]);
  assert.equal(r[-1], undefined); assert.equal(r['01'], undefined); assert.equal(r[7], undefined);
  assert.throws(() => r.push(input[0]), TypeError); assert.throws(() => { r.length = 0; }, TypeError);
  assert.equal(input.length, 7); assert.equal(store.cache.size, 1);
  for (const cacheSize of [0, NaN, Infinity]) {
    const s = new SfStaticBoxStore(input, { cacheSize }); for (const record of s.records) assert.ok(record.collider);
    assert.ok(s.cache.size <= 256); if (cacheSize === 0) assert.equal(s.cache.size, 0);
  }
});

test('source ownership and explicit registry handoff preserve reusable inputs, dedupe and getter counts', { skip }, () => {
  const box = boxes(1)[0], prism = { outer: ring(4, 4), minY: 10, maxY: 20, surface: 'wood' };
  const ride = { tops: [], solids: [box], prisms: [prism] }, geometry = box.centre;
  const input = options({ boxes: [box], colliders: [box, box], prisms: [prism], ride });
  const before = new FrozenSampler(input), after = new SfTerrainSampler(input);
  same(before.stats.duplicateBodies, after.stats.duplicateBodies);
  assert.equal(after.native.colliders, after.boxRecords);
  assert.equal(after.native.colliderCount, before.native.colliderCount);
  assert.equal(after.colliderCount, before.colliderCount);
  assert.notEqual(after.boxStore.sources, ride.solids, 'only assembled membership is transferred');
  const b = after.boxRecords[0].collider;
  assert.equal(after.releaseConstructionRegistry(ride), true);
  assert.equal(after.releaseConstructionRegistry(ride), false);
  assert.ok(Object.isFrozen(ride.solids) && !Object.isFrozen(b));
  assert.equal(b, box); assert.equal(b.centre, geometry); assert.equal(after.prisms[0].source, prism);
  same(before.raycastObstacle({ x: 4, y: 12, z: 0 }, { x: 0, y: 0, z: 1 }, 10),
    after.raycastObstacle({ x: 4, y: 12, z: 0 }, { x: 0, y: 0, z: 1 }, 10));
});

test('frozen differential: sparse rays, support, wheel-only bars, camera, volume, inside exits and ragdolls', { skip }, () => {
  const input = boxes(), prisms = [
    { outer: ring(400, 400), holes: [ring(400.5, 400.5).map(p => ({ x: 400 + (p.x - 400) / 2, z: 400 + (p.z - 400) / 2 }))], minY: 10, maxY: 20, support: true },
    { outer: [{ x: 420, z: 400 }, { x: 424, z: 400 }, { x: 424, z: 404 }, { x: 422, z: 402 }, { x: 420, z: 404 }], minY: 9, maxY: 17 }
  ];
  const setup = options({ boxes: input, prisms }), a = new FrozenSampler(setup), b = new SfTerrainSampler(setup);
  const points = probesFor(input, input.length);
  points.push(...[400.1, 401, 420, 422].map(x => ({ origin: { x: x - 3, y: 12, z: 401 }, direction: { x: 1, y: 0, z: 0 },
    distance: 8, centre: { x, y: 12, z: 401 }, headingY: 0 })));
  for (let i = 0; i < points.length; i++) same(probe(a, points[i], i), probe(b, points[i], i), `query ${i}`);
  // Revisit after more than one cacheful, retaining exact native ids and support references.
  for (let i = points.length - 1; i >= 0; i -= 7) same(probe(a, points[i], i), probe(b, points[i], i), `return ${i}`);
  for (let i = 0; i < input.length; i += 11) {
    const p = input[i].centre;
    const ga = a.sampleGround(p.x, p.z, { normal: {} }), gb = b.sampleGround(p.x, p.z, { normal: {} });
    same(ga, gb); assert.equal(ga.support, gb.support, 'explicit box support is original collider');
  }
});

test('frozen native controller riding/crash/reset and checked placement/recovery remain exact', { skip }, () => {
  const wall = { centre: { x: 0, y: 11, z: 8 }, halfExtents: { x: 3, y: 1, z: .05 }, rotationY: .1, surface: 'pavement' };
  const a = new FrozenSampler(options({ boxes: [wall] })), b = new SfTerrainSampler(options({ boxes: [wall] }));
  const make = s => new EucController(s, { spawn: { position: { x: 0, y: 10, z: 0 }, headingY: 0 } });
  const ca = make(a), cb = make(b); let crashed = false;
  for (let i = 0; i < 1440; i++) {
    const actions = { ...NEUTRAL_ACTIONS, throttle: i < 720 ? .5 : 0, reset: i === 960 };
    ca.step(1 / 120, actions); cb.step(1 / 120, actions); crashed ||= ca.crashed;
    same(ca.snapshot(), cb.snapshot(), `native step ${i}`);
  }
  assert.ok(crashed, 'fixture reaches the wall');
  for (const x of [-4, 0, 4]) {
    same(a.findPlacementTarget({ x, z: 8, referenceY: 10 }), b.findPlacementTarget({ x, z: 8, referenceY: 10 }), 'placement');
    const request = { fallen: { x, y: 10, z: 8 }, safePoints: [{ x: -4, y: 10, z: 0 }], headingY: 0 };
    same(a.findRecoveryTarget(request, () => true), b.findRecoveryTarget(request, () => true), 'recovery');
  }
});

test('all committed regional building boxes: exact ordered records/indexes, bounded caches and native probes',
  { skip: skip || process.env.SF_STATIC_BOX_FULL !== '1', timeout: 120000 }, t => {
    const fixture = regionalBoxes(), a = new FrozenSampler(options({ ride: fixture.ride })), b = new SfTerrainSampler(options({ ride: fixture.ride }));
    const points = probesFor(fixture.ride.solids, 512);
    assert.equal(a.colliderCount, fixture.expectedCount, 'complete regional building census from manifest');
    assert.equal(a.colliderCount, b.colliderCount);
    assert.equal(b.boxStore.cache.size, 0);
    for (let i = 0; i < a.boxRecords.length; i++) same(a.boxRecords[i], b.boxRecords[i], `regional box ${i}`);
    const { staticBoxStore, ...stats } = b.stats; same(a.stats, stats, 'full stats');
    for (let l = 0; l < a.boxIndex.levels.length; l++) {
      const x = a.boxIndex.levels[l], y = b.boxIndex.levels[l];
      if (!x) { assert.equal(y, x); continue; }
      same([...x.grid], [...y.grid], 'full bucket order'); same(x.starts, y.starts, 'full CSR starts'); same(x.items, y.items, 'full CSR ids');
    }
    b.releaseConstructionRegistry(fixture.ride);
    for (let i = 0; i < points.length; i++) same(probe(a, points[i], i), probe(b, points[i], i), `regional query ${i}`);
    assert.equal(b.boxStore.cache.size, 256);
    t.diagnostic(JSON.stringify({ ref: REF, sourceHashes, files: fixture.files, dataHash: fixture.dataHash,
      boxes: b.colliderCount, stats: b.stats.staticBoxStore, queries: points.length,
      scope: 'All regional building box registration, no renderer/core city/tree bodies/actors' }));
  });

test('optional isolated regional-source heap and query-cost measurements',
  { skip: skip || process.env.SF_STATIC_BOX_MEASURE !== '1', timeout: 120000 }, t => {
    const reports = ['baseline', 'candidate'].map(variant => JSON.parse(execFileSync(process.execPath,
      ['--max-old-space-size=4096', '--expose-gc', new URL('./helpers/sf-static-box-fixture.mjs', import.meta.url).pathname, '--measure', variant],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024, timeout: 100000 })));
    const [a, b] = reports;
    same(a.fixture, b.fixture, 'measured corpus');
    same(a.timing.map(v => v.checksum), b.timing.map(v => v.checksum), 'benchmark query checksum');
    same(a.warmTiming.map(v => v.checksum), b.warmTiming.map(v => v.checksum), 'warm benchmark query checksum');
    t.diagnostic(JSON.stringify({ reports, heapSaved: a.retained.heapUsed - b.retained.heapUsed,
      addedArrayBufferBytes: b.retained.arrayBuffers - a.retained.arrayBuffers,
      netSaved: a.retained.heapUsed + a.retained.arrayBuffers - b.retained.heapUsed - b.retained.arrayBuffers,
      caution: 'Separate Node process post-GC categories; not phone/browser/process memory, peak, or whole-frame timing.' }, null, 2));
  });
