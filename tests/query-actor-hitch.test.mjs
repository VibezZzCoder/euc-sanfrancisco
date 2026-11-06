// Private checkpoint differential: no browser, renderer, installs or generated edits.
// Requires the local pre-hitch checkpoint, deliberately not a moving HEAD baseline.
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import trafficHarness from './helpers/traffic-harness.cjs';

const root = new URL('../', import.meta.url);
const history = gitHistory(root, '2ff1a7c');
const test = optionalSourceTest(history.skip);
const baseline = file => history.read(file);
const originalSampler = baseline('js/sf-terrain-sampler.js')?.replace(/from '(\.\/[^']+)'/g,
  (_, path) => `from '${new URL(path, new URL('js/', root)).href}'`);
const Before = history.available
  ? (await import(`data:text/javascript;base64,${Buffer.from(originalSampler).toString('base64')}`)).SfTerrainSampler : null;
const originalActors = baseline('js/sf-dynamic-bodies.js');
const currentActors = readFileSync(new URL('js/sf-dynamic-bodies.js', root), 'utf8');
function actorAPI(source) {
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  context.window = { NYC: {} };
  vm.runInContext(source, context);
  return context.window.NYC;
}
const ring = (x, z, w) => [{ x, z }, { x: x + w, z }, { x: x + w, z: z + w }, { x, z: z + w }];
function fixture(Type) {
  const tops = Array.from({ length: 2048 }, (_, i) => {
    const x = (i % 64 - 32) * 2, z = (Math.floor(i / 64) - 16) * 2;
    return { poly: ring(x, z, 2), top: 10.15, surface: 'brick', sourceId: i,
      plane: { x, y: 10.15, z, dx: 0.3, dz: -0.1 } };
  });
  tops.push({ poly: ring(-10000, -10000, 20000), top: 9, sourceId: 'wide' },
    { poly: ring(0, 0, 6), holes: [ring(2, 2, 2)], top: 12, sourceId: 'hole' },
    { poly: ring(0, 0, 6), holes: [ring(2, 2, 2)], top: 12, sourceId: 'last-tie' },
    { poly: ring(-8, -8, 4), top: 8, replacesTerrain: true, ceilingOffset: 3, maxReferenceY: 11, sourceId: 'first-bore' },
    { poly: ring(-8, -8, 4), top: 8, replacesTerrain: true, ceilingOffset: 3, maxReferenceY: 11, sourceId: 'second-bore' });
  return new Type({ terrain: { x0: -100, z0: -100, step: 200, nx: 2, nz: 2, heights: [10, 10, 10, 10] },
    waterAt: () => false, tops, topViewCacheSize: 2,
    boxes: [{ centre: { x: 5, y: 12, z: 5 }, halfExtents: { x: 0.4, y: 2, z: 0.8 }, rotationY: 0.3, surface: 'pavement' }],
    prisms: [{ poly: ring(-4, 0, 4), holes: [ring(-3, 1, 2)], minY: 10, maxY: 15 }] });
}
const sample = () => ({ normal: {}, base: { normal: {} } });
const rect = (x, z, w = 0) => ({ minX: x, maxX: x + w, minZ: z, maxZ: z + w });

test('cached static buckets preserve exact ordered IDs across cells, scales, misses and stamp wrap', () => {
  const a = fixture(Before), b = fixture(SfTerrainSampler);
  const queries = [rect(1, 1), rect(1.1, 1.1), rect(7.99, 7.99, .02), rect(-8, -8), rect(-.01, -.01),
    rect(90, 90), rect(90.5, 90.5), rect(-20000, -20000, 40000), rect(2 ** 29, -(2 ** 29)), rect(0, 0, 0.4)];
  for (const name of ['topIndex', 'fieldIndex', 'boxIndex', 'prismIndex', 'ceilingIndex']) {
    const held = b[name].query(queries[0]), copy = held.slice();
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 2) a[name].serial = b[name].serial = 0xfffffffe;
      for (const q of queries) {
        const out = [999];
        assert.equal(b[name].query(q, out), out);
        assert.deepEqual(out, a[name].query(q), name);
      }
    }
    assert.deepEqual(held, copy, 'independently held query output');
  }
});

test('ground, holes, tie winners, sweep widths and inside-exit metadata match checkpoint exactly', () => {
  const a = fixture(Before), b = fixture(SfTerrainSampler);
  const points = [[1, 1], [3, 3], [2, 3], [6, 6], [-6, -6], [-.01, 0], [8, 8], [10000, 10000]];
  for (const [x, z] of points) for (const y of [8, 10, 12, 16, Infinity]) {
    assert.deepEqual(b.sampleGround(x, z, sample(), y), a.sampleGround(x, z, sample(), y));
  }
  assert.equal(b.sampleGround(1, 1, sample(), 12).support.sourceId, 'last-tie');
  assert.equal(b.sampleGround(-6, -6, sample(), 8).support.sourceId, 'first-bore');
  for (const [x, z] of points) for (const width of [0, .25, .8]) for (const direction of [
    { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: .3, y: .1, z: 1 }
  ]) {
    const origin = { x, y: 12, z }, oa = { normal: {}, inside: false }, ob = { normal: {}, inside: false };
    assert.equal(b.raycastObstacle(origin, direction, 8, width, undefined, ob),
      a.raycastObstacle(origin, direction, 8, width, undefined, oa));
    assert.deepEqual(ob, oa);
    assert.equal(b.raycast(origin, direction, 8), a.raycast(origin, direction, 8));
  }
});

test('nested water/grade callbacks and eviction leave held support/plane views immutable', () => {
  function run(Type) {
    const s = fixture(Type), held = s.sampleGround(1, 1, sample(), 12), saved = structuredClone(held);
    let nesting = false, calls = 0;
    const enter = () => {
      if (!nesting) {
        nesting = true; calls++;
        for (const [x, z] of [[20, 20], [-6, -6], [3, 3]]) s.sampleGround(x, z, sample(), 12);
        nesting = false;
      }
    };
    s.waterAt = () => { enter(); return false; };
    s.grade = { floorAt() { enter(); return null; } };
    const result = s.sampleGround(1, 1, sample(), 12);
    assert.deepEqual(held, saved);
    assert.ok(Object.isFrozen(held.support));
    assert.ok(Object.isFrozen(held.support.poly));
    assert.ok(Object.isFrozen(result.plane) || result.plane === null);
    return { result: structuredClone(result), calls };
  }
  assert.deepEqual(run(SfTerrainSampler), run(Before));
});

function socialRun(source) {
  const api = actorAPI(source), block = {}, other = {}, rail = { rail: true };
  let groundCalls = 0, randomCalls = 0, seed = 9127, pairs = 0;
  const random = () => { randomCalls++; return ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const peds = Array.from({ length: 340 }, (_, id) => ({ id, placed: true, x: id % 34 * .55, z: Math.floor(id / 34) * .55,
    ux: 0, uz: 1, dir: 1, v: 1, pause: 0, t: 10, len: 30, floor: id % 17 === 0 ? 95 : 80,
    socialTime: 0, conversation: null, bumpCooldown: 0, dodge: 0, node: id % 29 === 0 ? {} : null }));
  const social = api.createSfPedestrianSocial({ random,
    ground(p, x, z) { groundCalls++; return p.id % 31 === 0 ? NaN : p.floor + x * .3 - z * .1; },
    blockAt(x) { return x > 17 ? rail : x > 8 ? other : block; },
    clear(ax, az, bx) { return !(ax < 4 && bx > 4 || ax > 4 && bx < 4); } });
  const frames = [];
  for (let tick = 0; tick < 50; tick++) {
    const clock = tick * .5, dt = tick % 11 === 0 ? 0 : .5;
    if (tick === 10) social.reset(peds[3], clock);
    if (tick === 20) social.interrupt(peds.find(p => p.conversation) || peds[0], clock);
    social.update(peds, dt, clock);
    pairs += peds.filter(p => p.conversation?.a === p).length;
    frames.push(peds.map(p => [p.v, p.socialTime, p.conversation?.a.id, p.conversation?.b.id, p.conversation?.remaining]));
  }
  return { frames, groundCalls, randomCalls, seed, pairs };
}

test('social prefilters preserve pairing/timers/RNG with slopes, layers, invalid ground and interruptions', t => {
  const a = socialRun(originalActors), b = socialRun(currentActors);
  assert.deepEqual(b.frames, a.frames);
  assert.equal(b.randomCalls, a.randomCalls); assert.equal(b.seed, a.seed);
  assert.ok(b.pairs > 0); assert.ok(b.groundCalls < a.groundCalls);
  t.diagnostic(JSON.stringify({ socialGroundCalls: [a.groundCalls, b.groundCalls], randomCalls: b.randomCalls, pairFrames: b.pairs }));
});

test('actual-data seeded traffic keeps every actor route/body and decision through ordinary updates and focus jumps', () => {
  const { loadTraffic } = trafficHarness;
  const old = loadTraffic({ seed: 9127, dynamicSource: originalActors }).system;
  const now = loadTraffic({ seed: 9127 }).system;
  const facts = s => ({
    vehicles: [...s.cars, ...s.buses].map(v => [v.edge?.id, v.lane, v.s, v.speed, v.x, v.y, v.z, v.move?.to.id, v.move?.turn,
      v.out, v.claimed, v.yielding, v.stopDone, v.dynamicBody]),
    peds: s.peds.map(p => [p.placed, p.x, p.z, p.t, p.dir, p.v, p.pause, p.socialTime, p.bumped, p.bumpCooldown,
      p.conversation && s.peds.indexOf(p.conversation.a), p.conversation && s.peds.indexOf(p.conversation.b),
      p.conversation?.remaining, p.dynamicBody.minY, p.dynamicBody.velocityX, p.dynamicBody.velocityZ])
  });
  for (let i = 0; i < 48; i++) {
    const focus = i < 32 ? { x: -330, z: -560 } : { x: -900, z: 500 };
    const dt = i % 13 === 0 ? 0 : .05;
    old.update(dt, i * .5, focus); now.update(dt, i * .5, focus);
    assert.deepEqual(structuredClone(facts(now)), structuredClone(facts(old)), `frame ${i}`);
  }
});

test('bounded repeated short-query evidence (counts deterministic; CPU timings diagnostic only)', t => {
  const a = fixture(Before).topIndex, b = fixture(SfTerrainSampler).topIndex;
  const queries = Array.from({ length: 48 }, (_, i) => rect(1 + i / 100, 1 + i / 200, .1));
  function count(index) {
    let lookups = 0;
    const restores = [];
    for (const data of index.levels) if (data) {
      const get = data.grid.get;
      data.grid.get = function (k) { lookups++; return get.call(this, k); };
      restores.push(() => { delete data.grid.get; });
    }
    const out = [];
    for (let i = 0; i < 4800; i++) index.query(queries[i % 48], out);
    for (const restore of restores) restore();
    return lookups;
  }
  const lookups = [count(a), count(b)];
  assert.ok(lookups[1] < lookups[0]);
  function bench(index) {
    const out = []; let checksum = 0;
    const start = performance.now();
    for (let i = 0; i < 24000; i++) { index.query(queries[i % 48], out); checksum += out.length; }
    return { ms: performance.now() - start, checksum };
  }
  bench(a); bench(b);
  const times = [[], []];
  for (let i = 0; i < 5; i++) {
    const first = i % 2 ? b : a, second = i % 2 ? a : b;
    const x = bench(first), y = bench(second);
    assert.equal(x.checksum, y.checksum);
    times[i % 2].push(x.ms); times[1 - i % 2].push(y.ms);
  }
  t.diagnostic(JSON.stringify({ fixtureFacets: a.items.length, queriesPerTiming: 24000, singleCellKeyLookups4800: lookups,
    baselineMs: times[0], currentMs: times[1] }));
});
