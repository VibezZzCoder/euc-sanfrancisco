import test from 'node:test';
import assert from 'node:assert/strict';
import { CHASE_RULES, createChaseDirector, chaseHudView } from '../js/nemesis-chase.js';

test('three accepted hits warn; fourth captures until an explicit release', () => {
  const d = createChaseDirector({ random: () => 0 });
  d.soon();
  assert.equal(d.update(0.1, { riding: true }), 'ambush');
  d.update(0.1, { riding: true, sees: true, distance: 5 });
  for (let i = 1; i <= 4; i++) {
    assert.equal(d.knockedDown(), true);
    assert.equal(d.state.knockdowns, i);
    assert.equal(d.state.phase, i === 4 ? 'captured' : 'chasing');
    if (i < 4) {
      assert.equal(d.knockedDown(), false, 'recovery grace rejects duplicate contact');
      d.update(CHASE_RULES.recoverySeconds, { riding: true, sees: true, distance: 5 });
    }
  }
  assert.equal(d.update(100, { riding: true }), null);
  assert.equal(d.state.phase, 'captured');
  assert.equal(d.release(), true);
  assert.equal(d.state.knockdowns, 0);
  assert.equal(d.state.wait, CHASE_RULES.againMin);
});

test('escape requires both loss of sight and sustained separation; crashes reset progress', () => {
  const d = createChaseDirector({ random: () => 0 });
  d.soon(); d.update(0.1, { riding: true });
  d.update(0.1, { riding: true, sees: true, distance: 10 });
  d.update(12, { riding: true, sees: false, distance: 20 });
  assert.equal(d.state.phase, 'chasing');
  d.update(5, { riding: true, sees: false, distance: 200 });
  assert.equal(d.state.phase, 'chasing');
  d.observePlayer({ crashed: true });
  assert.equal(d.state.far, 0);
  d.update(3, { riding: true, sees: false, distance: 200 });
  assert.equal(d.update(9, { riding: true, sees: false, distance: 200 }), 'escaped');
});

test('freezing does not advance clocks and recovery retains warnings', () => {
  const d = createChaseDirector({ random: () => 0 });
  d.soon(); d.update(0.1, { riding: true });
  d.update(0.1, { riding: true, sees: true, distance: 5 });
  d.knockedDown();
  const time = d.state.chaseTime;
  d.update(100, { riding: false });
  assert.equal(d.state.chaseTime, time);
  d.observePlayer({ recovered: true, displaced: true });
  assert.equal(d.state.knockdowns, 1);
  assert.equal(d.state.recovery, CHASE_RULES.recoverySeconds);
  assert.equal(chaseHudView(d.state, 10).heat, 1);
});
