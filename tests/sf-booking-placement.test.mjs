import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingDirector } from '../js/booking.js';
import { createChaseDirector } from '../js/nemesis-chase.js';
import { createSfBookingPlacement } from '../js/sf-booking-placement.js';

const intake = [{ x: 1, y: 2, z: 3, heading: 0.5 }];
const release = [{ x: 4, y: 5, z: 6, heading: 0.7 }, { x: 7, y: 8, z: 9, heading: 0.8 }];
function setup(accepted = () => false) {
  const booking = createBookingDirector(), chase = createChaseDirector({ random: () => 0 });
  chase.soon(); chase.update(1, { riding: true });
  for (let i = 0; i < 4; i++) { chase.state.recovery = 0; chase.knockedDown(); }
  booking.start('test', chase.state.knockdowns);
  const calls = [];
  const manager = { teleportActiveTo(...args) {
    calls.push(args);
    return { x: args[0], y: args[3], z: args[1], succeeded: accepted(args) };
  } };
  return { booking, chase, calls, placement: createSfBookingPlacement({ manager, booking, chase, intake, release }) };
}

test('failed intake and release do not clear capture or booking', () => {
  const { booking, chase, calls, placement } = setup();
  assert.equal(placement.transfer(), null);
  assert.equal(placement.release(), null);
  assert.equal(booking.state.phase, 'captured');
  assert.equal(chase.state.phase, 'captured');
  assert.equal(calls.length, 3);
  for (const call of calls) assert.deepEqual(call[4], { exact: true, departure: 1.2 });
});

test('checked transfer advances intake and successful release clears capture once', () => {
  const { booking, chase, calls, placement } = setup(args => args[0] === 1 || args[0] === 7);
  assert.deepEqual(placement.transfer(), { x: 1, y: 2, z: 3, succeeded: true });
  assert.equal(booking.state.phase, 'intake');
  assert.deepEqual(placement.release(), { x: 7, y: 8, z: 9, succeeded: true });
  assert.equal(booking.state.phase, 'idle');
  assert.equal(chase.state.phase, 'waiting');
  assert.equal(placement.release(), null);
  assert.deepEqual(calls.map(c => c[0]), [1, 4, 7]);
});

test('skip can release before intake only after a checked outside placement', () => {
  const { booking, chase, placement } = setup(args => args[0] === 4);
  assert.equal(placement.release().succeeded, true);
  assert.equal(booking.state.phase, 'idle');
  assert.equal(chase.state.phase, 'waiting');
});
