// Sparse support-index construction contracts — MIT, © 2026 VibezZzCoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

// Obtain the internal type through its normal owner; no runtime test export.
const SparseIndex = new SfTerrainSampler({ terrain: { x0: 0, z0: 0, step: 1, nx: 2, nz: 2,
  heights: [1, 1, 1, 1] } }).fieldIndex.constructor;
const rect = (x, z, w = 0, h = w) => ({ minX: x, maxX: x + w, minZ: z, maxZ: z + h });
const overlap = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const decode = k => typeof k === 'string' ? k : `${Math.floor(k / 32768) - 16384},${k % 32768 - 16384}`;

// Independent object-list oracle: no replay buffer, CSR, memo or production key function.
function expectedBuckets(items, cell) {
  const levels = [];
  items.forEach((b, id) => {
    let level = 0, size = cell, xs, zs;
    do {
      xs = [Math.floor(b.minX / size), Math.floor(b.maxX / size)];
      zs = [Math.floor(b.minZ / size), Math.floor(b.maxZ / size)];
      if ((xs[1] - xs[0] + 1) * (zs[1] - zs[0] + 1) <= 64) break;
      size *= 2; level++;
    } while (true);
    const map = levels[level] ??= new Map();
    for (let x = xs[0]; x <= xs[1]; x++) for (let z = zs[0]; z <= zs[1]; z++) {
      const key = `${x},${z}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(id);
    }
  });
  return levels;
}

function assertBuckets(index, items, cell) {
  const expected = expectedBuckets(items, cell);
  assert.equal(index.levels.length, expected.length);
  let references = 0;
  for (let level = 0; level < expected.length; level++) {
    const data = index.levels[level], map = expected[level];
    assert.equal(!!data, !!map);
    if (!data) continue;
    assert.deepEqual([...data.grid.keys()].map(decode), [...map.keys()]);
    assert.deepEqual([...data.grid.values()], Array.from({ length: map.size }, (_, i) => i));
    assert.equal(data.starts.length, map.size + 1);
    let bucket = 0;
    for (const ids of map.values()) {
      assert.deepEqual([...data.items.subarray(data.starts[bucket], data.starts[bucket + 1])], ids);
      references += ids.length; bucket++;
    }
    assert.equal(data.starts[map.size], data.items.length);
    assert.equal(Object.hasOwn(data, 'cursor'), false);
    assert.equal(Object.hasOwn(data, 'counts'), false);
  }
  assert.equal(index.references, references);
}

function fixtures() {
  const items = [rect(-0, -0), rect(-8, -8, 64, 0), rect(-8, -8, 8 * 64, 0),
    rect(-8, -8, 8 * 65, 0), rect(-.001, -.001, .002), rect(0, 0, 1), rect(0, 0, 1),
    rect(-1e7, -1e7, 2e7), rect(1e8, -1e8, .25)];
  for (const x of [-16385, -16384, -16383, 16383, 16384, 16385]) items.push(rect(x * 8, -x * 8, .125));
  let seed = 81471;
  const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32;
  for (let i = 0; i < 600; i++) items.push(rect((random() - .5) * 3e6, (random() - .5) * 3e6,
    i % 4 ? random() * 8 : random() * 1e5, i % 5 ? random() * 8 : random() * 1e5));
  return items;
}

test('CSR matches independent bucket lists across scale transitions, signed cells and distant text keys', () => {
  const items = fixtures();
  for (const cell of [8, 16, 256]) assertBuckets(new SparseIndex(items, cell), items, cell);
  const index = new SparseIndex(items, 8);
  assert.ok([...index.levels[0].grid.keys()].some(k => typeof k === 'string'));
  assert.ok([...index.levels[0].grid.keys()].some(k => typeof k === 'number'));
});

test('all query modes, duplicate bounds and stamp rollover match brute-force source-order filtering', () => {
  const items = fixtures(), index = new SparseIndex(items, 8);
  const queries = [rect(0, 0), rect(-.01, -.01, .02), rect(-16, -16, 32), rect(4e8, 4e8),
    rect(-2e8, -2e8, 4e8), ...items.filter((_, i) => i % 17 === 0)];
  const held = index.query(queries[0]), copy = held.slice();
  for (let pass = 0; pass < 3; pass++) {
    if (pass === 2) index.serial = 0xfffffffe;
    for (const q of queries) {
      const out = [999];
      assert.equal(index.query(q, out), out);
      assert.deepEqual(out, items.flatMap((b, id) => overlap(q, b) ? [id] : []));
    }
  }
  assert.deepEqual(held, copy);
});

test('shared getBounds view is read twice in source order; bucket zero and interleaved scales remain exact', () => {
  const items = [rect(0, 0), rect(-1e5, -1e5, 2e5), rect(0, 0), rect(1e7, 1e7, 2), rect(0, 0)];
  const reads = [], store = { length: items.length, getBounds(id, out) {
    reads.push(id); return Object.assign(out, items[id]);
  } };
  const index = new SparseIndex(store, 8);
  assert.deepEqual(reads, [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assertBuckets(index, items, 8);
  assert.deepEqual(index.query(rect(0, 0)), [0, 1, 2, 4]);
  // Query bounds filtering remains live, even when the one-cell memo is reused.
  items[0].minX = items[0].maxX = 1;
  assert.deepEqual(index.query(rect(0, 0)), [1, 2, 4]);
});

test('empty indexes retain no buckets and caller-owned outputs stay valid', () => {
  const index = new SparseIndex([], 8), out = [3];
  assertBuckets(index, [], 8);
  assert.deepEqual(index.stats, { items: 0, buckets: 0, references: 0, typedBytes: 0 });
  assert.equal(index.query(rect(0, 0), out), out);
  assert.deepEqual(out, []);
});
