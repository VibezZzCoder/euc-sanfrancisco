import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingScreen } from '../js/booking.js';

class Target {
  constructor() { this.listeners = new Map(); this.dataset = {}; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  focus() {}
  append() {}
}

test('disposing an open booking closes the modal and releases every listener before Retry', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const win = new Target(), doc = new Target(), root = new Target();
  const elements = new Map();
  for (const id of ['#booking-heading', '#booking-skip', '#booking-release', '.booking-pad-hint', '.booking-heading']) {
    elements.set(id, new Target());
  }
  root.querySelector = selector => elements.get(selector);
  root.prepend = () => {};
  root.open = true;
  root.close = () => { root.open = false; };
  const classes = new Set(['booking-open']);
  doc.body = { classList: { remove: value => classes.delete(value) } };
  globalThis.window = win;
  globalThis.document = doc;
  try {
    let released = 0;
    const screen = new BookingScreen({ root, onRelease: () => { released++; return true; } });
    screen.phase = 'captured';
    screen.keysDown.add('KeyW');
    screen.dispose();
    screen.dispose();
    assert.equal(root.open, false, 'modal cannot block Retry focus');
    assert.equal(classes.has('booking-open'), false);
    for (const target of [win, doc, root, ...elements.values()]) {
      for (const listeners of target.listeners.values()) assert.equal(listeners.size, 0);
    }
    elements.get('#booking-skip').dispatch('click');
    assert.equal(released, 0);
    assert.equal(screen.keysDown.size, 0);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('booking pad requires neutral, selection and a separate confirm edge', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const win = new Target(), doc = new Target(), root = new Target();
  const elements = new Map();
  for (const id of ['#booking-heading', '#booking-skip', '#booking-release', '.booking-pad-hint', '.booking-heading']) {
    const element = new Target();
    element.focus = () => { doc.activeElement = element; };
    element.click = () => element.dispatch('click');
    elements.set(id, element);
  }
  root.querySelector = selector => elements.get(selector);
  root.prepend = () => {}; root.open = false;
  doc.body = { classList: { remove() {} } };
  doc.hidden = false; doc.hasFocus = () => true;
  const pad = { connected: true, mapping: 'standard', index: 0, id: 'pad',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  globalThis.window = win; globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  try {
    let releases = 0;
    const screen = new BookingScreen({ root, onRelease: () => { releases++; return true; } });
    screen.phase = 'captured';
    doc.activeElement = elements.get('#booking-heading');
    pad.buttons[0].pressed = true;
    screen.updateGamepad(); screen.updateGamepad();
    assert.equal(releases, 0, 'held confirmation cannot activate');
    pad.buttons[0].pressed = false; screen.updateGamepad();
    pad.buttons[15].pressed = true; pad.buttons[0].pressed = true; screen.updateGamepad();
    assert.equal(doc.activeElement, elements.get('#booking-skip'));
    assert.equal(releases, 0, 'selection and confirmation cannot share a sample');
    screen.updateGamepad(); assert.equal(releases, 0, 'held A is not a fresh edge');
    pad.buttons[15].pressed = false; pad.buttons[0].pressed = false; screen.updateGamepad();
    pad.buttons[0].pressed = true; screen.updateGamepad();
    assert.equal(releases, 1);
    screen.dispose();
  } finally {
    globalThis.window = previousWindow; globalThis.document = previousDocument;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('suspension blocks activation and restores the previous modal focus', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const win = new Target(), doc = new Target(), root = new Target();
  const elements = new Map();
  for (const id of ['#booking-heading', '#booking-skip', '#booking-release', '.booking-pad-hint', '.booking-heading']) {
    const element = new Target(); element.focus = () => { doc.activeElement = element; }; elements.set(id, element);
  }
  root.querySelector = selector => elements.get(selector);
  root.prepend = () => {}; root.open = false;
  root.contains = element => [...elements.values()].includes(element);
  doc.body = { classList: { remove() {} } };
  globalThis.window = win; globalThis.document = doc;
  try {
    let releases = 0;
    const screen = new BookingScreen({ root, onRelease: () => { releases++; return true; } });
    screen.phase = 'signature';
    doc.activeElement = screen.skip;
    screen.setSuspended(true);
    assert.equal(root.dataset.suspended, 'true');
    doc.activeElement = {};
    screen.finish(); assert.equal(releases, 0);
    screen.setSuspended(false);
    assert.equal(root.dataset.suspended, 'false');
    assert.equal(doc.activeElement, screen.skip);
    screen.finish(); assert.equal(releases, 1);
    screen.dispose();
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
