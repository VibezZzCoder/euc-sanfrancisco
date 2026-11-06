// Fresh-input guards must cover links as well as buttons. Native activation/layout is verified in Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameMenu } from '../js/game-menu.js';

test('menu links admit only fresh Enter; stale, repeated, modified and cross-view presses are blocked', () => {
  const previous = globalThis.document;
  const link = { tagName: 'A', matches: selector => selector === 'a[href]' };
  globalThis.document = { activeElement: link, hidden: false };
  const menu = Object.assign(Object.create(GameMenu.prototype), { view: 'pause', keys: new Set(),
    blocked: new Set(), activation: new Map(), root: { contains: target => target === link } });
  const key = (type, code, extra = {}) => {
    const event = { type, code, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {}, ...extra };
    menu.key(event); return event.defaultPrevented === true;
  };
  try {
    assert.equal(key('keydown', 'Enter'), false);
    assert.equal(key('keydown', 'Enter', { repeat: true }), true);
    assert.equal(key('keyup', 'Enter'), false);
    assert.equal(key('keydown', 'Space'), true, 'links retain Enter activation, not button-only Space');
    key('keyup', 'Space');
    assert.equal(key('keydown', 'Enter', { ctrlKey: true }), true);
    key('keyup', 'Enter');
    menu.blocked.add('Enter');
    assert.equal(key('keydown', 'Enter'), true);
    assert.equal(key('keyup', 'Enter'), true);
    assert.equal(key('keydown', 'Enter'), false, 'release rearms activation');
    menu.activation.clear(); // same reset used when a menu view changes
    assert.equal(key('keyup', 'Enter'), true);
    globalThis.document.activeElement = { tagName: 'BUTTON', disabled: true };
    assert.equal(key('keydown', 'Enter'), true, 'disabled buttons remain blocked');
  } finally { globalThis.document = previous; }
});
