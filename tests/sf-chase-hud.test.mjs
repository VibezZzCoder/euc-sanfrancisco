import test from 'node:test';
import assert from 'node:assert/strict';
import { SfChaseHud } from '../js/sf-chase-hud.js';
import { chaseHudView, createChaseDirector } from '../js/nemesis-chase.js';

test('HUD presents real chase warning, distance, escape progress and reset', () => {
  const nodes = Object.fromEntries(['banner', '', '-text', '-meter', '-heat', '-heat-text']
    .map(suffix => [`hud-chase${suffix && suffix !== 'banner' ? suffix : suffix === 'banner' ? '-banner' : ''}`,
      { hidden: true, dataset: {}, style: {}, textContent: '' }]));
  const hud = new SfChaseHud({ getElementById: id => nodes[id] });
  const director = createChaseDirector({ random: () => 0 });
  director.soon(); director.update(0.1, { riding: true });
  hud.update(chaseHudView(director.state, 54));
  assert.match(nodes['hud-chase-banner'].textContent, /after you/);
  assert.equal(nodes['hud-chase'].hidden, false);
  director.state.acquired = true; director.state.sees = true;
  assert.equal(director.knockedDown(), true);
  hud.update(chaseHudView(director.state, 23));
  assert.match(nodes['hud-chase-banner'].textContent, /1\/3/);
  assert.equal(nodes['hud-chase-heat'].dataset.level, '1');
  assert.match(nodes['hud-chase-heat-text'].textContent, /1\/3/);
  director.state.recovery = 0; director.state.sees = false;
  director.state.unseen = 6; director.state.far = 3;
  hud.update(chaseHudView(director.state, 160));
  assert.equal(nodes['hud-chase-meter'].style.width, '50%');
  director.state.phase = 'waiting'; director.state.lastEvent = null;
  hud.update(chaseHudView(director.state, Infinity));
  assert.equal(nodes['hud-chase'].hidden, true);
  assert.equal(nodes['hud-chase-banner'].hidden, true);
});
