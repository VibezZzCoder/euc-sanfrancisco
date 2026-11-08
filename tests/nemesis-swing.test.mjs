import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwing, sweptHit, SWING } from '../js/nemesis-swing.js';

test('wind-up is harmless and only the actual active interval admits contact', () => {
  const swing = createSwing(); swing.start();
  assert.equal(swing.update(0.5), null);
  assert.ok(swing.contact.from > swing.contact.to);
  assert.equal(swing.update(0.3), 'strike');
  assert.ok(swing.contact.from > 0 && swing.contact.from < swing.contact.to);
  assert.equal(swing.update(0.1), null);
  assert.equal(swing.phase, 'recover');
  assert.ok(swing.contact.from <= swing.contact.to, 'last active slice survives phase transition');
});

test('swept contact respects moving and airborne riders and the active frame slice', () => {
  const rider = { x: 0, z: 0, bottom: 0 };
  assert.equal(sweptHit(-2, 0.5, 0, 2, 0.5, 0, rider), true);
  assert.equal(sweptHit(-2, 0.5, 0, 2, 0.5, 0, { ...rider, bottom: 2 }), false);
  assert.equal(sweptHit(-2, 0.5, 0, 2, 0.5, 0, rider, SWING, rider, { from: 0, to: 0.2 }), false);
  assert.equal(sweptHit(-2, 0.5, 0, 2, 0.5, 0, { x: 3, z: 0, bottom: 0 }, SWING,
    { x: -3, z: 0, bottom: 0 }), true);
});
