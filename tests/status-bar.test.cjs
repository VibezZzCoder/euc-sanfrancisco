const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const firstScript = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/);

function harness(withViewport = true) {
  assert.ok(firstScript, 'snap-back runs as the first head script');
  const handlers = {}, viewportHandlers = {}, timers = [];
  const document = { activeElement: null };
  const window = {
    scrollX: 0, scrollY: 0, calls: [],
    addEventListener: (type, callback) => { handlers[type] = callback; },
    scrollTo(x, y) { this.calls.push([x, y]); this.scrollX = x; this.scrollY = y; },
  };
  if (withViewport) window.visualViewport = { addEventListener: (type, callback) => { viewportHandlers[type] = callback; } };
  vm.runInNewContext(firstScript[1], { window, document, setTimeout: callback => timers.push(callback) });
  return { window, document, handlers, viewportHandlers, timers };
}

test('all viewport lifecycle events restore an unexpected nonzero document offset', () => {
  const h = harness();
  for (const type of ['load', 'pageshow', 'resize', 'orientationchange', 'scroll']) {
    h.window.scrollY = -62;
    h.handlers[type]();
    assert.equal(h.window.scrollY, 0, type);
  }
  for (const type of ['resize', 'scroll']) {
    h.window.scrollX = 17;
    h.viewportHandlers[type]();
    assert.equal(h.window.scrollX, 0, `visualViewport ${type}`);
  }
  const previousCalls = h.window.calls.length;
  h.handlers.scroll();
  assert.equal(h.window.calls.length, previousCalls, 'already aligned does not scroll again');
  assert.doesNotThrow(() => harness(false).handlers.resize());
});

test('editing keeps the keyboard offset until focus leaves', () => {
  const h = harness();
  for (const activeElement of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
    h.document.activeElement = activeElement;
    h.window.scrollY = -62;
    h.handlers.scroll();
    assert.equal(h.window.scrollY, -62, activeElement.tagName);
  }
  h.handlers.focusout();
  h.document.activeElement = { tagName: 'INPUT' };
  h.timers.shift()();
  assert.equal(h.window.scrollY, -62, 'moving focus between editors remains protected');
  h.handlers.focusout();
  h.document.activeElement = { tagName: 'BUTTON' };
  h.timers.shift()();
  assert.equal(h.window.scrollY, 0, 'focusout recovers after editing ends');
});
