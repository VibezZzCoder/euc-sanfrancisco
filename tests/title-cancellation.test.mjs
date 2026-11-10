import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/title-screen.js', import.meta.url), 'utf8');
const { TitleScreen } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function screenFixture(prepare) {
  const screen = Object.create(TitleScreen.prototype);
  let cancellations = 0, starts = 0;
  Object.assign(screen, {
    isOpen: true, started: false, preparing: false, startSerial: 0,
    rideButton: { disabled: false, focus() {} }, pickerButton: { disabled: false },
    retryButton: { hidden: true, focus() {} }, cancelButton: { hidden: true, focus() {} },
    status: { textContent: '' }, canInteract: () => true, resetInput() {},
    onPrepareStart: prepare, onCancelStart() { cancellations++; }, finishStart() { starts++; },
  });
  return { screen, get cancellations() { return cancellations; }, get starts() { return starts; } };
}

test('idle lifecycle cancellation leaves status alone while still invoking cleanup', () => {
  const h = screenFixture();
  h.screen.cancelPreparation();
  h.screen.cancelPreparation();
  assert.equal(h.screen.status.textContent, '');
  assert.equal(h.cancellations, 2);
});

test('active cancellation reports it and a late preparation cannot start riding', async () => {
  let resolve;
  const h = screenFixture(() => new Promise(done => { resolve = done; }));
  h.screen.start();
  assert.equal(h.screen.preparing, true);
  h.screen.cancelPreparation();
  assert.equal(h.screen.status.textContent, 'Preparation cancelled. Ride when ready.');
  assert.equal(h.screen.rideButton.disabled, false);
  assert.equal(h.screen.cancelButton.hidden, true);
  resolve();
  await Promise.resolve();
  assert.equal(h.starts, 0);
});

test('cancelling the retry state after a failed preparation reports cancellation', async () => {
  const h = screenFixture(() => Promise.reject(new Error('test failure')));
  h.screen.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.screen.retryButton.hidden, false);
  h.screen.cancelPreparation();
  assert.equal(h.screen.status.textContent, 'Preparation cancelled. Ride when ready.');
  assert.equal(h.screen.retryButton.hidden, true);
});
