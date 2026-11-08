import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_RULES, BOOKING_TEXT, createBookingDirector } from '../js/booking.js';

test('booking freezes and retries transfer until a checked arrival is acknowledged', () => {
  const booking = createBookingDirector();
  assert.equal(booking.start('Trollina', 4), true);
  assert.equal(booking.start('other', 4), false);
  assert.equal(booking.update(100, false), null);
  assert.equal(booking.state.age, 0);
  assert.equal(booking.update(BOOKING_RULES.transferSeconds), 'transfer');
  assert.equal(booking.update(0.49), null);
  assert.equal(booking.update(0.02), 'transfer');
  assert.equal(booking.arrive(), true);
  assert.equal(booking.arrive(), false);
  assert.equal(booking.update(BOOKING_RULES.intakeSeconds), 'signature');
  assert.equal(booking.update(BOOKING_RULES.signatureSeconds), 'released');
  assert.equal(booking.active, true, 'release awaits host acceptance');
  assert.equal(booking.finish(), true);
  assert.equal(booking.active, false);
  assert.match(BOOKING_TEXT.captured.reply, /County Jail/);
});
