// Exact mutable-body/lifecycle differential and bounded allocation evidence. CPU only; no runtime hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';

const root = new URL('../', import.meta.url), ref = '9e9416b';
const baselineSHA256 = '4fd509cf56f04fbc6f52571521327e2b3e74767ec960faa547c29191398c69a1';
const history = gitHistory(root, ref), differential = optionalSourceTest(history.skip);
const before = history.read('js/sf-dynamic-bodies.js');
const after = readFileSync(new URL('js/sf-dynamic-bodies.js', root), 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');
if (history.available) assert.equal(hash(before), baselineSHA256);
function load(source, name, MapType = Map, inspect = false) {
  if (inspect) {
    const marker = 'return { begin, add, commit, dynamicBodiesNear, bodyVersion: () => version, stats };';
    assert.equal(source.split(marker).length, 2);
    source = source.replace(marker, 'return { begin, add, commit, dynamicBodiesNear, bodyVersion: () => version, stats, '
      + '_storage: () => ({ cells, spare, spareCount, activeCells }) };');
  }
  const window = { NYC: {} };
  new Function('window', 'Map', source + `\n//# sourceURL=dynamic-grid-${name}.js`)(window, MapType);
  return window.NYC;
}
const B = history.available ? load(before, 'baseline') : null, A = load(after, 'candidate');
const actor = (id, x = 8, z = 8) => ({ id, x, z, headingY: 0, halfWidthMetres: .5, halfLengthMetres: 1,
  minY: 2, maxY: 4, velocityX: 0, velocityZ: 0 });
function sameState(pair) {
  assert.deepEqual(pair[1].stats, pair[0].stats);
  assert.equal(pair[1].bodyVersion(), pair[0].bodyVersion());
}
function call(pair, name, ...args) {
  for (const index of pair) assert.equal(index[name](...args), undefined);
  sameState(pair);
}
function query(pair, x, z, radius, prefix = []) {
  const out = pair.map(index => {
    const list = prefix.slice(); assert.equal(index.dynamicBodiesNear(x, z, radius, list), undefined); return list;
  });
  sameState(pair);
  assert.equal(out[1].length, out[0].length);
  for (let i = 0; i < out[0].length; i++) assert.equal(out[1][i], out[0][i], `ordered identity ${i}`);
  return out[1];
}

differential('pooling: exact 9e9416b source; only the dynamic grid ownership/query loop changes', t => {
  const outside = source => source.replace(/function createSfDynamicBodyIndex\(cellSize = 16\) \{[^]*?\n\}/, '/* grid */');
  assert.equal(outside(after), outside(before));
  assert.deepEqual(Object.keys(A.createSfDynamicBodyIndex()), Object.keys(B.createSfDynamicBodyIndex()));
  t.diagnostic(JSON.stringify({ ref, baselineSHA256, currentSHA256: hash(after) }));
});

differential('pooling: begin/add/commit visibility, mutable identities, duplicates and caller prefixes match exactly', () => {
  const pair = [B, A].map(api => api.createSfDynamicBodyIndex());
  const a = actor('same-id'), b = actor('same-id'), wide = { ...actor('wide', 0, 0), halfWidthMetres: 32, halfLengthMetres: 32 };
  query(pair, 8, 8, 0); call(pair, 'commit'); // Empty commit and add without a begin are public behavior.
  for (const body of [a, wide, b, a]) call(pair, 'add', body);
  const held = query(pair, 8, 8, 50, ['prefix', a]);
  assert.equal(held.filter(v => v === a).length, 2, 'caller prefix is not part of query dedup');
  assert.ok(held.includes(b), 'equal IDs do not deduplicate distinct objects');
  call(pair, 'commit'); call(pair, 'commit');
  a.x = 400; b.halfWidthMetres = 100; wide.headingY = .75; // Query reads current bodies, not frozen hulls.
  query(pair, 8, 8, 0); query(pair, 400, 8, 1); // Membership stays in the cells from add().
  call(pair, 'add', a); query(pair, 400, 8, 0); call(pair, 'commit');
  call(pair, 'begin'); assert.deepEqual(query(pair, 8, 8, 50), []);
  assert.ok(held.includes(b), 'previous output arrays stay independently owned');
  call(pair, 'add', b); query(pair, 8, 8, 0); // Additions are visible before commit.
  call(pair, 'begin'); call(pair, 'begin'); call(pair, 'commit');
  query(pair, 8, 8, 100);
  for (const args of [[NaN, 0, 1], [0, Infinity, 1], [0, 0, NaN], [0, 0, Infinity], [0, 0, -1], [-0, 0, -0]]) {
    query(pair, ...args, ['untouched']);
  }
  for (const body of [{ ...a, headingY: NaN }, { ...b, x: NaN }, { ...a, halfLengthMetres: -100 }]) call(pair, 'add', body);
  call(pair, 'commit'); query(pair, 8, 8, 1);
});

differential('pooling: moving/empty epochs, mixed numeric/text boundaries and changing hulls match 9e9416b', t => {
  let checks = 0;
  for (const size of [.125, 16, 31.5]) {
    const pair = [B, A].map(api => api.createSfDynamicBodyIndex(size));
    const bodies = Array.from({ length: 96 }, (_, i) => actor(i));
    const cells = [-16385, -16384, -16383, -1, -0, 0, 1, 16383, 16384, 16385, -(2 ** 31), 2 ** 31];
    for (let epoch = 0; epoch < 96; epoch++) {
      call(pair, 'begin');
      if (epoch % 17 !== 16) for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i], drift = epoch % 9 * .19;
        b.x = (cells[(i + Math.floor(epoch / 9)) % cells.length] + .5 + drift) * size;
        b.z = (cells[(i * 7 + Math.floor(epoch / 7)) % cells.length] + .5 - drift) * size;
        b.headingY = i * .17 + epoch * .03;
        b.halfWidthMetres = size * (i % 5 === 0 ? 2 : .1); b.halfLengthMetres = size * (i % 7 === 0 ? 3 : .2);
        call(pair, 'add', b); if (i % 11 === 0) call(pair, 'add', b);
        if (i % 23 === 0) { query(pair, b.x, b.z, size * .5); checks++; }
      }
      call(pair, 'commit');
      for (let i = 0; i < bodies.length; i += 7) {
        const b = bodies[i]; query(pair, b.x, b.z, i % 3 === 0 ? 0 : size * 2, [b]); checks++;
      }
    }
  }
  t.diagnostic(JSON.stringify({ epochs: 288, orderedIdentityQueryChecks: checks }));
});

test('pooling: reuse retains backing but begin releases every body reference; history and spare storage stay bounded', () => {
  const index = load(after, 'ownership', Map, true).createSfDynamicBodyIndex(), n = 128;
  const bodies = Array.from({ length: n }, (_, i) => actor(i, i * 32 + 8, 8));
  let previousCells = 0;
  for (let epoch = 0; epoch < 400; epoch++) {
    index.begin();
    const { cells, spare, spareCount } = index._storage();
    for (const bucket of [...cells.values(), ...spare.slice(0, spareCount)]) {
      assert.equal(bucket.count, 0);
      assert.ok(bucket.bodies.every(b => b === null), 'no old body survives begin in retained capacity');
    }
    for (let i = spareCount; i < spare.length; i++) assert.equal(spare[i], null, 'taken spare slots release their buckets');
    for (let i = 0; i < n; i++) {
      bodies[i].x = epoch * 8192 + i * 32 + 8; index.add(bodies[i]);
    }
    index.commit();
    assert.ok(cells.size <= previousCells + n); previousCells = n;
    const remaining = index._storage().spareCount;
    assert.ok(remaining <= 256);
    for (const bucket of spare.slice(0, remaining)) {
      assert.equal(bucket.key, null); assert.ok(bucket.bodies.length <= 128);
    }
  }
  index.begin(); index.begin(); index.commit();
  const storage = index._storage();
  assert.equal(storage.cells.size, 0); assert.equal(index.stats.cells, 0);
  assert.ok(storage.spareCount <= 256); assert.ok(storage.spare.length <= 256);
  assert.ok(storage.spare.slice(0, storage.spareCount).reduce((n, b) => n + b.bodies.length, 0) <= 32768);

  const reuse = load(after, 'reuse', Map, true).createSfDynamicBodyIndex();
  const body = actor('reuse'); reuse.add(body);
  const bucket = [...reuse._storage().cells.values()][0], backing = bucket.bodies;
  for (let i = 0; i < 64; i++) {
    reuse.begin(); assert.equal(backing[0], null); reuse.add(body); reuse.commit();
    assert.equal([...reuse._storage().cells.values()][0], bucket); assert.equal(bucket.bodies, backing);
    assert.equal(backing.length, 1);
  }
});

test('pooling: occupancy spikes are never truncated and oversized inactive/historical backing is released', () => {
  const index = load(after, 'spike', Map, true).createSfDynamicBodyIndex();
  const bodies = Array.from({ length: 4096 }, (_, i) => actor(i));
  bodies.forEach(index.add); index.commit();
  const out = []; index.dynamicBodiesNear(8, 8, 0, out);
  assert.equal(out.length, bodies.length); for (let i = 0; i < out.length; i++) assert.equal(out[i], bodies[i]);
  const bucket = [...index._storage().cells.values()][0], large = bucket.bodies;
  index.begin(); assert.ok(large.every(b => b === null)); index.add(bodies[0]); index.commit();
  index.begin(); assert.notEqual(bucket.bodies, large, 'a still-active tiny cell cannot pin its old crowd capacity');
  assert.equal(bucket.bodies.length, 0);
  bodies.forEach(index.add); index.commit(); index.begin(); index.begin(); index.commit();
  assert.equal(index._storage().cells.size, 0);
  assert.equal(index._storage().spareCount, 0, 'oversized empty arrays do not enter the spare pool');
});

function runner(api) {
  const count = 60 + 6 + 340 + 461 + 24, bodies = Array.from({ length: count }, (_, i) => actor(i));
  const index = api.createSfDynamicBodyIndex(), out = [];
  return frames => {
    let checksum = 0;
    for (let epoch = 0; epoch < frames; epoch++) {
      const frame = epoch % 96; index.begin();
      for (let i = 0; i < count; i++) {
        const b = bodies[i]; b.x = (i % 31 - 15) * 24 + frame * .37; b.z = (Math.floor(i / 31) - 14) * 24 - frame * .29;
        b.headingY = i * .17 + frame * .03;
        b.halfLengthMetres = i >= count - 24 ? 11.5 : i >= 60 && i < 66 ? 6 : 2.3;
        index.add(b);
      }
      index.commit();
      for (let i = 0; i < count; i += 53) {
        out.length = 0; index.dynamicBodiesNear(bodies[i].x, bodies[i].z, 8, out);
        checksum += out.length * 31 + index.stats.candidates;
      }
    }
    return checksum;
  };
}
function counted(source) {
  const counts = { set: 0, clear: 0, delete: 0 };
  class CountedMap extends Map {
    set(k, v) { counts.set++; return super.set(k, v); }
    clear() { counts.clear++; return super.clear(); }
    delete(k) { counts.delete++; return super.delete(k); }
  }
  return { run: runner(load(source, 'counts', CountedMap)), counts };
}
differential('pooling: moving-fleet counters demonstrate reduced Map entry churn with identical query checksums', t => {
  const old = counted(before), now = counted(after), frames = 512;
  assert.equal(now.run(frames), old.run(frames));
  assert.equal(old.counts.clear, frames); assert.equal(now.counts.clear, 0);
  assert.ok(now.counts.set < old.counts.set / 4);
  t.diagnostic(JSON.stringify({ frames, bodiesPerFrame: 891, queriesPerFrame: 17, baseline: old.counts, current: now.counts,
    scope: 'executed native Map-operation counters, not byte or timing measurements' }));
});

differential('pooling allocation sample: unmodified source, moving bodies, natural GC, no timing/FPS claim', {
  skip: process.env.SF_DYNAMIC_GRID_ALLOC !== '1'
}, async t => {
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  const results = [];
  try {
    for (const [name, api] of [['baseline', B], ['candidate', A]]) {
      const run = runner(api); run(96);
      await post('HeapProfiler.startSampling', { samplingInterval: 4096,
        includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const checksum = run(1024);
      const { profile } = await post('HeapProfiler.stopSampling');
      const sites = { begin: 0, add: 0, commit: 0, dynamicBodiesNear: 0 }, sum = node => node.selfSize + node.children.reduce((n, c) => n + sum(c), 0);
      const visit = node => {
        // V8's sampler may omit URLs on new Function frames. This synchronous workload calls
        // only one variant's uniquely named grid methods; accept those empty-URL frames too.
        if ((node.callFrame.url === `dynamic-grid-${name}.js` || node.callFrame.url === '') && Object.hasOwn(sites, node.callFrame.functionName)) {
          sites[node.callFrame.functionName] += sum(node); return;
        }
        for (const child of node.children) visit(child);
      };
      visit(profile.head);
      results.push({ name, checksum, sampledBytes: sites, gridTotal: Object.values(sites).reduce((a, b) => a + b, 0) });
    }
  } finally { session.disconnect(); }
  assert.equal(results[1].checksum, results[0].checksum);
  assert.ok(results.every(r => r.gridTotal > 0), 'sampling captured the actual grid functions');
  t.diagnostic(JSON.stringify({ node: process.version, frames: 1024, bodiesPerFrame: 891, queriesPerFrame: 17,
    baselineSHA256, currentSHA256: hash(after), results,
    scope: 'cumulative sampled allocations including collected objects, method-name fallback for empty V8 URLs; Node synthetic workload, not retained/RSS/browser/iPhone memory or FPS; sampling is statistical' }));
});
