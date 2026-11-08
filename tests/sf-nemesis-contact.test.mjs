import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfPaddleContact } from '../js/sf-nemesis-contact.js';
import { createChaseDirector } from '../js/nemesis-chase.js';
import { createSfFlightQueries } from '../js/sf-nemesis-flight.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

const rider = { x: 0, bottom: 0, z: 0 };
const face = x => ({ x, y: 1, z: 0 });
const interval = { from: 0, to: 1 };
function setup(clearLine = () => true) {
  const director = createChaseDirector({ random: () => 0 });
  director.soon(); director.update(0.1, { riding: true });
  const contact = createSfPaddleContact({ clearLine }, director);
  return { director, contact };
}

test('only accepted controller contact counts, and only once per swing', () => {
  const { director, contact } = setup();
  let calls = 0, allow = false;
  const controller = { crashed: false, hardKnock() { calls++; return allow; } };
  const frame = x => contact.frame({ face: face(x), rider, interval, controller, placementSerial: 1 });
  assert.equal(frame(-1), false);
  assert.equal(frame(1), false);
  assert.equal(director.state.knockdowns, 0);
  allow = true;
  assert.equal(frame(-1), true);
  assert.equal(director.state.knockdowns, 1);
  director.state.recovery = 0;
  assert.equal(frame(1), false);
  assert.equal(calls, 2);
});

test('roof or wall separating face from rider vetoes a geometric hit', () => {
  const { director, contact } = setup(() => false);
  let calls = 0;
  const controller = { hardKnock() { calls++; return true; } };
  contact.frame({ face: face(-1), rider, interval, controller });
  assert.equal(contact.frame({ face: face(1), rider, interval, controller }), false);
  assert.equal(calls, 0);
  assert.equal(director.state.knockdowns, 0);
});

test('layer check is made at the swept contact time, not just frame endpoints', () => {
  const samples = [];
  const { contact } = setup((a, b) => { samples.push([a.x, b.x]); return false; });
  const controller = { hardKnock() { throw new Error('blocked contact'); } };
  contact.frame({ face: face(-1), rider, interval, controller });
  assert.equal(contact.frame({ face: face(1), rider, interval, controller }), false);
  assert.deepEqual(samples, [[0, 0]]);
});

test('real SF tunnel roof vetoes a drawn-face sweep across its upper floor', () => {
  const square = [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }];
  const terrain = { originX: -16, originZ: -16, cell: 2, w: 17, h: 17,
    heights: new Float64Array(17 * 17).fill(13.2), waterLevel: 0 };
  const queries = createSfFlightQueries(new SfTerrainSampler({ terrain, waterAt: () => false,
    tops: [{ poly: square, top: 8, surface: 'pavement', replacesTerrain: true,
      ceilingOffset: 5.2, maxReferenceY: 13.2 }] }));
  const director = createChaseDirector({ random: () => 0 });
  director.soon(); director.update(0.1, { riding: true });
  const contact = createSfPaddleContact(queries, director);
  let calls = 0;
  const controller = { hardKnock() { calls++; return true; } };
  const upperRider = { x: 0, z: 0, bottom: 13.2 };
  contact.frame({ face: { x: -1, y: 13.12, z: 0 }, rider: upperRider, interval, controller });
  assert.equal(contact.frame({ face: { x: 1, y: 13.12, z: 0 }, rider: upperRider, interval, controller }), false);
  assert.equal(calls, 0);
  assert.equal(director.state.knockdowns, 0);
});

test('placement, freeze and discontinuous rider movement invalidate contact history', () => {
  const { contact } = setup();
  let calls = 0;
  const controller = { hardKnock() { calls++; return true; } };
  const frame = (x, serial, enabled = true, target = rider) =>
    contact.frame({ face: face(x), rider: target, interval, controller, placementSerial: serial, enabled });
  frame(-1, 1);
  assert.equal(frame(1, 2), false);
  frame(-1, 2, false);
  assert.equal(frame(1, 2), false);
  assert.equal(frame(-1, 2, true, { x: 20, bottom: 0, z: 0 }), false);
  assert.equal(frame(1, 2), false);
  assert.equal(calls, 0);
});

test('inactive strike frames and crashed riders cannot trigger a knock', () => {
  const { contact } = setup();
  let calls = 0;
  const controller = { crashed: true, hardKnock() { calls++; return true; } };
  contact.frame({ face: face(-1), rider, interval, controller });
  assert.equal(contact.frame({ face: face(1), rider, interval, controller }), false);
  controller.crashed = false;
  assert.equal(contact.frame({ face: face(-1), rider, interval: { from: 1, to: 0 }, controller }), false);
  assert.equal(calls, 0);
});
