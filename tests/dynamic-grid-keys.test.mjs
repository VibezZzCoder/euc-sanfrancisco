// Current-checkpoint differential, CPU only. Optional private history is not shipped in curated exports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';

const root = new URL('../', import.meta.url);
const ref = '9028c5b';
const baselineSHA256 = 'd7f93b6a025ff0d33286101cbe2f89a8c48e79b3a435771590f02a3a9ff020e7';
const history = gitHistory(root, ref), test = optionalSourceTest(history.skip);
const before = history.read('js/sf-dynamic-bodies.js');
const after = readFileSync(new URL('js/sf-dynamic-bodies.js', root), 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');
// An available but wrong/broken source must fail, never silently skip or become the oracle.
if (history.available) assert.equal(hash(before), baselineSHA256);
function load(source, MapType) {
  const window = { NYC: {} };
  if (MapType) new Function('window', 'Map', source)(window, MapType);
  else new Function('window', source)(window);
  return window.NYC;
}
const B = history.available ? load(before) : null, A = load(after);
const actor = (id, x, z, halfWidthMetres = .7, halfLengthMetres = 2.3, headingY = 0) => ({
  id, x, z, headingY, halfWidthMetres, halfLengthMetres, minY: 70, maxY: 72,
  velocityX: 0, velocityZ: 0, visible: false
});
function pair(cellSize = 16, baseline = B, candidate = A) {
  return [baseline.createSfDynamicBodyIndex(cellSize), candidate.createSfDynamicBodyIndex(cellSize)];
}
function sameState(indexes) {
  assert.deepEqual(indexes[1].stats, indexes[0].stats);
  assert.equal(indexes[1].bodyVersion(), indexes[0].bodyVersion());
}
function publish(indexes, bodies) {
  const version = indexes[0].bodyVersion();
  for (const index of indexes) {
    index.begin();
    assert.equal(index.bodyVersion(), version, 'begin does not publish an epoch');
    assert.equal(index.stats.bodies, 0);
    for (const body of bodies) index.add(body);
    assert.equal(index.stats.bodies, bodies.length, 'every supplied actor is counted');
    assert.equal(index.bodyVersion(), version, 'adding actors does not publish an epoch');
    index.commit();
    assert.equal(index.bodyVersion(), version + 1);
  }
  sameState(indexes);
}
function query(indexes, x, z, radius, prefix = []) {
  const results = indexes.map(index => {
    const out = prefix.slice(), version = index.bodyVersion();
    assert.equal(index.dynamicBodiesNear(x, z, radius, out), undefined);
    assert.equal(index.bodyVersion(), version, 'queries never advance publication');
    for (let i = 0; i < prefix.length; i++) assert.equal(out[i], prefix[i]);
    return out;
  });
  sameState(indexes);
  assert.equal(results[1].length, results[0].length);
  for (let i = 0; i < results[0].length; i++) assert.equal(results[1][i], results[0][i], 'ordered body identities');
  return results[1];
}
function inspect(source) {
  const maps = [], calls = { numberGet: 0, stringGet: 0, numberSet: 0, stringSet: 0 };
  class ObservedMap extends Map {
    constructor() { super(); maps.push(this); }
    get(key) { calls[`${typeof key}Get`]++; return super.get(key); }
    set(key, value) { calls[`${typeof key}Set`]++; return super.set(key, value); }
  }
  return { api: load(source, ObservedMap), maps, calls };
}
const textCell = key => typeof key === 'string' ? key
  : `${Math.floor(key / 32768) - 16384},${key % 32768 - 16384}`;
const adjacentView = new DataView(new ArrayBuffer(8));
function adjacent(value, up) {
  if (value === 0) return up ? Number.MIN_VALUE : -Number.MIN_VALUE;
  adjacentView.setFloat64(0, value);
  let bits = adjacentView.getBigUint64(0);
  bits += (value > 0) === up ? 1n : -1n;
  adjacentView.setBigUint64(0, bits);
  return adjacentView.getFloat64(0);
}

test('grid keys: exact 9028c5b source is pinned; changes stay in grid keys and grid ownership', () => {
  assert.equal(hash(before), baselineSHA256);
  const start = after.indexOf('// Grid keys:'), end = after.indexOf('function createSfDynamicBodyIndex(');
  assert.ok(start >= 0 && end > start);
  const restored = (after.slice(0, start) + after.slice(end))
    .replace('const key = bodyCellKey(ix, iz);', 'const key = `${ix},${iz}`;')
    .replace('cells.get(bodyCellKey(ix, iz))', 'cells.get(`${ix},${iz}`)');
  // Grid pooling is separately pinned/differentially checked against 9e9416b in dynamic-grid-pooling.
  const withoutGrid = source => source.replace(/function createSfDynamicBodyIndex\(cellSize = 16\) \{[^]*?\n\}/, '/* grid */');
  assert.equal(withoutGrid(restored), withoutGrid(before), 'shape/writer/reaction/social code remains source-exact');
});

test('grid keys: signed packing boundaries, extreme cells and mixed text/number buckets preserve membership and insertion order', () => {
  const old = inspect(before), now = inspect(after), indexes = pair(16, old.api, now.api);
  const cells = [-16385, -16384, -16383, -1, -0, 0, 1, 16383, 16384, 16385,
    -32768, 32768, -(2 ** 31), 2 ** 31, -(2 ** 48), 2 ** 48];
  const bodies = [];
  for (const x of cells) for (const z of cells) bodies.push(actor(bodies.length, (x + .5) * 16, (z + .5) * 16, .125, .125));
  bodies.push(actor(bodies.length, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, .125, .125));
  const saved = structuredClone(bodies);
  publish(indexes, bodies);
  const baselineMap = old.maps[0], candidateMap = now.maps[0];
  assert.ok([...candidateMap.keys()].some(key => typeof key === 'number'));
  assert.ok([...candidateMap.keys()].some(key => typeof key === 'string'));
  assert.deepEqual([...candidateMap.keys()].map(textCell), [...baselineMap.keys()]);
  for (const [key, bucket] of candidateMap) {
    if (typeof key === 'number') assert.ok(Number.isInteger(key) && key >= 0 && key <= 2 ** 30 - 1);
    const bodies = Array.isArray(bucket) ? bucket : bucket.bodies.slice(0, bucket.count);
    assert.deepEqual(bodies, baselineMap.get(textCell(key)), 'no packed/text alias or bucket insertion change');
  }
  for (const body of bodies) assert.ok(query(indexes, body.x, body.z, 0).includes(body));
  // These queries cross packed/text seams in both signs and both axes within a single query.
  for (const edge of [-16384 * 16, 16384 * 16]) {
    for (const z of [8, edge]) query(indexes, edge, z, 17);
    query(indexes, 8, edge, 17);
  }
  assert.deepEqual(bodies, saved, 'indexing/querying never mutates actors');
});

test('grid keys: adjacent boundary doubles, custom cell sizes, exact hull radii and invalid queries match', () => {
  for (const size of [.125, 1, 16, 31.5]) {
    const indexes = pair(size), bodies = [];
    for (const cell of [-16384, -16383, -1, 0, 1, 16383, 16384]) {
      const edge = cell * size;
      for (const x of [adjacent(edge, false), edge, adjacent(edge, true)]) {
        bodies.push(actor(bodies.length, x, -x, size * .1, size * .3, bodies.length * .37));
      }
    }
    publish(indexes, bodies);
    for (const body of bodies) for (const radius of [0, size * .1, size, size * 2]) query(indexes, body.x, body.z, radius);
    for (const [x, z, radius] of [[NaN, 0, 1], [0, NaN, 1], [Infinity, 0, 1], [0, -Infinity, 1],
      [0, 0, NaN], [0, 0, Infinity], [0, 0, -1]]) {
      const prefix = [bodies[0], 'existing'];
      assert.deepEqual(query(indexes, x, z, radius, prefix), prefix);
      assert.equal(indexes[1].stats.queryCells, 0); assert.equal(indexes[1].stats.candidates, 0);
    }
    const exact = actor('exact radius', 0, 0, 1, 2);
    publish(indexes, [exact]);
    assert.deepEqual(query(indexes, 2, 0, 1), [exact]);
    assert.deepEqual(query(indexes, 2, 0, adjacent(1, false)), []);
    assert.deepEqual(query(indexes, -0, 0, -0), [exact]);
  }
});

test('grid keys: traversal order, caller prefixes, multi-cell/repeated-body dedup and begin/add/commit visibility remain exact', () => {
  const indexes = pair(), late = actor('late cell', 20, 20, 1, 1), wide = actor('wide', 0, 0, 32, 32);
  const negative = actor('negative', -16, -16, .25, .25), middle = actor('middle', 15, 15, .25, .25);
  const prefix = [{ caller: true }, wide, late];
  publish(indexes, [late, wide, negative, middle, wide]);
  assert.deepEqual(query(indexes, 0, 0, 60, prefix), [...prefix, wide, negative, middle, late]);
  assert.equal(indexes[1].stats.bodies, 5); assert.equal(indexes[1].stats.candidates, 4);
  assert.equal(indexes[1].stats.queryCells, 64);
  query(indexes, 0, 0, 60, prefix); // Per-query dedup must reset, without removing existing output entries.
  const held = query(indexes, 0, 0, 60), version = indexes[0].bodyVersion();
  for (const index of indexes) index.begin();
  assert.deepEqual(query(indexes, 0, 0, 60, prefix), prefix, 'begin clears old buckets immediately');
  for (const index of indexes) index.add(late);
  assert.deepEqual(query(indexes, late.x, late.z, 0), [late], 'uncommitted additions have the original visibility');
  for (const index of indexes) { assert.equal(index.bodyVersion(), version); index.commit(); }
  sameState(indexes);
  assert.deepEqual(held, [wide, negative, middle, late], 'previous result arrays remain independently held');
  publish(indexes, []);
  assert.deepEqual(query(indexes, 0, 0, 60), []);
  assert.equal(indexes[1].stats.cells, 0);
  publish(indexes, [middle, negative, wide, late]);
  assert.deepEqual(query(indexes, 0, 0, 60), [negative, wide, middle, late], 'recycled buckets retain only the new per-cell insertion order');
});

// Synthetic longitudinal slices exercise the actual production pose writer, not a replacement hull formula.
function slices(length, width, height) {
  const count = Math.ceil(length / .5), step = length / count;
  return Array.from({ length: count }, (_, i) => ({ z: -length / 2 + (i + .5) * step,
    halfLengthMetres: step / 2, halfWidthMetres: width, minY: .03, maxY: height - (i % 3) * .1 }));
}
test('grid keys: full synthetic fleet, posed long actors, moving/empty epochs and remote nose queries stay physical', () => {
  const indexes = pair(), profiles = [slices(4.6, .95, 1.7), slices(12, 1.3, 3.3), slices(23, 1.45, 3.7)];
  const count = 60 + 6 + 340 + 461 + 24;
  const bodies = Array.from({ length: count }, (_, i) => actor(i, 0, 0));
  let queries = 0;
  for (let epoch = 0; epoch < 48; epoch++) {
    for (let i = 0; i < count; i++) {
      const b = bodies[i], remote = i % 7 === 0 ? 400000 : i % 11 === 0 ? -400000 : 0;
      const x = remote + (i % 31 - 15) * 16 + epoch * .37;
      const z = -remote + (Math.floor(i / 31) - 14) * 16 - epoch * .29;
      if (i >= 66 && i < 406) {
        Object.assign(b, { x, z, headingY: i * .17 + epoch * .03, halfWidthMetres: .3, halfLengthMetres: .28,
          minY: 20 + i * .1, maxY: 21.75 + i * .1, velocityX: .8, velocityZ: -.6 });
      } else {
        const kind = i >= count - 24 ? 2 : i >= 60 && i < 66 ? 1 : 0;
        const args = [profiles[kind], x, 80 + epoch + i * .01, z, i * .13 + epoch * .03,
          epoch % 13 === 0 ? Math.PI / 2 : Math.sin(i + epoch * .1) * .5, Math.cos(i * .1) * .07, 3.2, -4.1];
        const expected = {};
        B.writeSfVehicleBody(expected, ...args); A.writeSfVehicleBody(b, ...args);
        assert.deepEqual({ ...b, id: undefined, visible: undefined }, { ...expected, id: undefined, visible: undefined });
      }
    }
    const admitted = epoch % 17 === 16 ? [] : bodies;
    publish(indexes, admitted);
    for (let i = epoch % 7; i < count; i += 23) {
      const b = bodies[i], c = Math.cos(b.headingY), s = Math.sin(b.headingY);
      const noseX = b.x + s * b.halfLengthMetres * .99, noseZ = b.z + c * b.halfLengthMetres * .99;
      const result = query(indexes, noseX, noseZ, .05, ['caller prefix']); queries++;
      assert.equal(result.includes(b), admitted.length > 0, 'remote/hidden actors remain available out to their posed nose');
      query(indexes, b.x + c * (b.halfWidthMetres + .1), b.z - s * (b.halfWidthMetres + .1), .1); queries++;
    }
    query(indexes, 2 ** 40, -(2 ** 40), 16); queries++;
  }
  assert.ok(queries > 3500);
});

let workload;
function gridWorkload() {
  if (workload) return workload;
  let seed = 735991;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const count = 60 + 6 + 340 + 461 + 24, frames = 64, queryCount = 16;
  const templates = Array.from({ length: count }, (_, i) => {
    const pedestrian = i >= 66 && i < 406, rail = i >= count - 24, highway = i >= 406 && !rail;
    return { ...actor(i, (random() - .5) * (highway ? 5000 : 900), (random() - .5) * (highway ? 8000 : 900),
      pedestrian ? .3 : rail ? 1.45 : 1, pedestrian ? .28 : rail ? 11.5 : i < 66 && i >= 60 ? 6 : 2.3, random() * Math.PI * 2),
      speed: pedestrian ? 1.3 : rail ? 7 : 9 + random() * 6 };
  });
  const poses = new Float64Array(frames * count * 3), points = new Float64Array(frames * queryCount * 3);
  for (let frame = 0; frame < frames; frame++) {
    for (let i = 0; i < count; i++) {
      const b = templates[i], at = (frame * count + i) * 3, t = frame / 30;
      poses[at] = b.x + Math.sin(b.headingY) * b.speed * t;
      poses[at + 1] = b.z + Math.cos(b.headingY) * b.speed * t;
      poses[at + 2] = b.headingY + Math.sin(frame * .02 + i) * .04;
    }
    for (let q = 0; q < queryCount; q++) {
      const source = (frame * count + (q * 53 + frame * 7) % count) * 3, at = (frame * queryCount + q) * 3;
      points[at] = poses[source] + (q % 3 - 1) * 2;
      points[at + 1] = poses[source + 1] + (q % 5 - 2) * 2;
      points[at + 2] = [0, 2, 8, 18][q % 4];
    }
  }
  return workload = { templates, poses, points, frames, count, queryCount };
}
function runner(api) {
  const { templates, poses, points, frames, count, queryCount } = gridWorkload();
  const bodies = templates.map(b => ({ ...b })), index = api.createSfDynamicBodyIndex(), out = [];
  return epochs => {
    let checksum = 0;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const frame = epoch % frames;
      index.begin();
      for (let i = 0; i < count; i++) {
        const at = (frame * count + i) * 3, body = bodies[i];
        body.x = poses[at]; body.z = poses[at + 1]; body.headingY = poses[at + 2];
        index.add(body);
      }
      index.commit();
      for (let q = 0; q < queryCount; q++) {
        const at = (frame * queryCount + q) * 3;
        out.length = 0;
        index.dynamicBodiesNear(points[at], points[at + 1], points[at + 2], out);
        checksum += out.length * 31 + index.stats.candidates;
      }
    }
    return checksum;
  };
}

test('grid keys: counters confirm equal lookups, numeric ordinary keys and fewer retained-cell insertions', t => {
  const old = inspect(before), now = inspect(after);
  const checksums = [runner(old.api)(64), runner(now.api)(64)];
  assert.equal(checksums[1], checksums[0]);
  assert.equal(old.calls.stringGet, now.calls.numberGet);
  assert.ok(now.calls.numberSet < old.calls.stringSet, 'pooling retains live cell entries between rebuilds');
  assert.equal(old.calls.numberGet + old.calls.numberSet + now.calls.stringGet + now.calls.stringSet, 0);
  assert.ok(old.calls.stringGet > 64 * gridWorkload().count);
  t.diagnostic(JSON.stringify({ epochs: 64, actorsPerEpoch: gridWorkload().count, baseline: old.calls, current: now.calls,
    scope: 'Map key-type/operation counts outside timing; not allocated V8 bytes or retained memory' }));
});

test('grid keys benchmark: exact native baseline/current, alternating warmed full-population publication and query blocks', {
  skip: process.env.SF_DYNAMIC_GRID_BENCH !== '1'
}, t => {
  // Native builtins and unmodified source, with no observed Map, assertions or counters in timed loops.
  const runs = [runner(B), runner(A)], epochs = 512, samples = [[], []];
  for (let warmup = 0; warmup < 2; warmup++) for (const i of warmup % 2 ? [1, 0] : [0, 1]) runs[i](128);
  let checksum;
  for (let round = 0; round < 8; round++) for (const i of round % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now(), result = runs[i](epochs), ms = performance.now() - start;
    if (checksum === undefined) checksum = result;
    assert.equal(result, checksum, 'identical work/results in every measured block');
    samples[i].push(ms);
  }
  const median = values => { const sorted = values.slice().sort((a, b) => a - b); return (sorted[3] + sorted[4]) / 2; };
  const medians = samples.map(median);
  t.diagnostic(JSON.stringify({ node: process.version, baselineRef: ref, baselineSHA256, currentSHA256: hash(after),
    actorsPerEpoch: gridWorkload().count, queriesPerEpoch: gridWorkload().queryCount, epochsPerBlock: epochs,
    measuredBlocksPerVariant: 8, actorAddsPerVariant: epochs * 8 * gridWorkload().count,
    queriesPerVariant: epochs * 8 * gridWorkload().queryCount, checksum,
    baselineMs: samples[0], currentMs: samples[1], medianMs: medians,
    medianChangePercent: (medians[1] / medians[0] - 1) * 100,
    scope: 'Node host-realm CPU wall time with natural GC; synthetic stable 60 cars/6 buses/340 walkers/461 highway/24 rail bodies, precomputed moving poses and local queries; no browser, GPU, allocation-byte or whole-frame claim' }));
});
