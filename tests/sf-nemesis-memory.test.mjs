import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfPursuitMemory } from '../js/sf-nemesis-memory.js';

test('pursuit memory never inspects or follows a hidden rider and snapshots cannot mutate it', () => {
  const memory = createSfPursuitMemory();
  const seen = { x: 4, y: 10, z: 8, heading: Math.PI / 2 };
  assert.equal(memory.observe(seen, true), true);
  seen.x = 900;
  const hidden = new Proxy({}, { get() { throw new Error('read hidden position'); } });
  assert.equal(memory.observe(hidden, false), false);
  const snapshot = memory.lastSeen();
  assert.equal(snapshot.x, 4);
  snapshot.x = 300;
  assert.equal(memory.lastSeen().x, 4);
  assert.equal(memory.observe({ x: NaN, y: 3, z: 0, heading: 0 }, true), false);
  assert.equal(memory.lastSeen().x, 4);
  memory.clear();
  assert.equal(memory.lastSeen(), null);
});

test('search anchors use the last observed elevation and reject water or another layer', () => {
  const memory = createSfPursuitMemory();
  memory.observe({ x: 0, y: 9, z: 0, heading: Math.PI / 2 }, true);
  const references = [];
  const q = { supportAt(x, z, y) {
    references.push(y);
    return { height: x > 20 ? 20 : 8, water: x > 5 && x < 20, offCourse: false };
  } };
  assert.deepEqual(memory.searchAnchors(q), [{ x: 0, y: 8, z: 0 }]);
  assert.deepEqual(references, [9, 9, 8, 8, 9, 8, 8]);
  assert.deepEqual(memory.searchAnchors(q, [NaN, -1, 100]), []);
});

test('search follows a steep continuous hill but rejects an abrupt upper deck', () => {
  const memory = createSfPursuitMemory();
  memory.observe({ x: 0, y: 10, z: 0, heading: Math.PI / 2 }, true);
  const anchors = memory.searchAnchors({ supportAt(x) {
    return { height: 10 + x * 0.4 + (x > 18 ? 10 : 0) };
  } });
  assert.deepEqual(anchors.map(p => Math.round(p.y * 10)), [100, 148]);
});
