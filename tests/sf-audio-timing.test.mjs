// Actual constructor/update/reset/pool lifecycle with scalar Web Audio substitutes; no browser or decoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CityAudioSystem } from '../js/audio-system.js';

const saved = new Map();
const handlers = new Map();
test.before(() => {
  for (const [key, value] of Object.entries({
    document: { hidden: false, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener() {} },
    navigator: { hardwareConcurrency: 8 }, matchMedia: () => ({ matches: false }),
    AudioContext: class {}, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener() {},
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
});
test.after(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function fixture() {
  let drained = 0, samples = 0, writes = 0, disposed = 0, riderUpdates = 0;
  const intervals = [], dopplers = [];
  const queue = [];
  const rider = { type: 'euc', drainEvents() { drained++; return queue.splice(0); } };
  const controllerManager = { getActiveEntity: () => rider, getGroundHeight: () => 0 };
  const audio = new CityAudioSystem({ controllerManager });
  const param = { cancelScheduledValues() {}, setValueAtTime() {}, setTargetAtTime() {} };
  const context = { currentTime: 0, state: 'running',
    listener: { setPosition() { writes++; }, setOrientation() {} },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.state = 'running'; return Promise.resolve(); }, close: async () => {} };
  const node = { gain: param, frequency: param, disconnect() {} };
  Object.assign(audio, { context, ready: true, master: node, reflections: node, reflectionFilter: node,
    acoustics: { update() {}, enclosure: 0 }, wind: { update() {}, dispose() {} },
    euc: { reset() {}, update() { riderUpdates++; }, dispose() {} }, emit: () => false });
  const source = { id: {}, x: 10, y: 0, z: 0, speed: 1, load: 0, seed: 0.2, range: 160, blocked: true };
  const slot = { voice: { update(params) { dopplers.push(params.doppler); }, dispose() { disposed++; } },
    emitter: { input: node, update(s) { return s.x; }, dispose() { disposed++; } },
    x: 10, y: 0, z: 0, fresh: true };
  audio.motors.set(source.id, slot);
  let includeMotor = true;
  audio.sources = { collect() { samples++; return { motors: includeMotor ? [source] : [], sirens: [], people: [], signals: [], traffic: 0 }; } };
  const nativePool = audio.updatePool;
  audio.updatePool = function(pool, candidates, limit, now, dt, siren) {
    if (!siren) intervals.push(dt);
    // Lifecycle reset removes the synthetic voice. This fixture does not create new audio nodes.
    return nativePool.call(this, pool, candidates.filter(s => pool.has(s.id)), limit, now, dt, siren);
  };
  const camera = { position: { x: 0, y: 1, z: 0 }, updateMatrixWorld() {},
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const tick = dt => { context.currentTime += Number.isFinite(dt) ? Math.max(0, dt) : 0; audio.update(dt, context.currentTime, camera); };
  return { audio, context, tick, camera, source, queue, intervals, dopplers,
    retire: () => { includeMotor = false; }, stats: () => ({ drained, samples, writes, disposed, riderUpdates }) };
}

test('ambient phase retains cadence while sample elapsed never counts the phase twice (including Doppler/stopped time)', () => {
  const f = fixture();
  f.tick(0.06); f.tick(0.06);
  close(f.intervals[0], 0.12); close(f.audio.accumulator, 0.02);
  f.source.x += 0.12;
  f.tick(0.06); f.tick(0.06);
  close(f.intervals[1], 0.12); close(f.audio.accumulator, 0.04);
  close(f.dopplers[1], 343 / 344);
  close(f.audio.state(f.source, 0).stopped, 0.24);
  // Avoid rounding onto the original strict phase gate's lower side at exactly 0.3 s.
  f.tick(0.061);
  assert.equal(f.stats().samples, 3); close(f.intervals[2], 0.061);
  assert.equal(f.stats().riderUpdates, 5, 'rider events still run every callback');
});

test('deterministic 30–240 Hz/jitter cadence matches original admission; delivered time plus pending interval conserves input', () => {
  for (const hz of [30, 59.94, 60, 90, 120, 144, 240]) {
    const f = fixture();
    let phase = 0, samples = 0, total = 0;
    for (let i = 0; i < 1600; i++) {
      const dt = Math.min(0.05, (1 + Math.sin(i * 11) * 0.2) / hz);
      phase += dt; total += dt;
      if (phase >= 0.1) { samples++; phase %= 0.1; }
      f.tick(dt);
      assert.equal(f.stats().samples, samples);
      close(f.audio.accumulator, phase);
      close(f.intervals.reduce((a, b) => a + b, 0) + f.audio.intervalElapsed, total);
    }
  }
});

test('oversized/invalid intervals clamp elapsed, sample current state once and leave no listener/event backlog', () => {
  const f = fixture();
  f.tick(0.06); f.tick(0.06);
  f.tick(1.037);
  assert.equal(f.stats().samples, 2); close(f.intervals.at(-1), 0.25);
  assert.equal(f.stats().writes, 2);
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined]) f.tick(dt);
  assert.equal(f.stats().samples, 2);
  f.tick(0.05);
  assert.equal(f.stats().samples, 3); close(f.intervals.at(-1), 0.05);
  f.retire(); f.tick(0.1); assert.equal(f.audio.motors.size, 1);
  f.tick(10); assert.equal(f.audio.motors.size, 0); assert.equal(f.stats().disposed, 2);
  assert.equal(f.stats().samples, 5, 'no catch-up loop for a long stall');
});

test('pause/mute/visibility/pagehide/context interruption/reset drop both clocks, listeners and silent rider events', async () => {
  for (const boundary of ['pause', 'mute', 'visibility', 'pagehide', 'interruption', 'reset']) {
    const f = fixture();
    f.tick(0.12); f.tick(0.04);
    f.queue.push({ type: 'crash' });
    if (boundary === 'pause') f.audio.setPaused(true);
    if (boundary === 'mute') f.audio.setEnabled(false);
    if (boundary === 'visibility') { document.hidden = true; handlers.get('visibilitychange')(); }
    if (boundary === 'pagehide') handlers.get('pagehide')();
    if (boundary === 'interruption') { f.context.state = 'interrupted'; f.tick(1); }
    if (boundary === 'reset') f.audio.reset();
    assert.equal(f.audio.accumulator, 0, boundary); assert.equal(f.audio.intervalElapsed, 0, boundary);
    assert.equal(f.audio.haveListener, false); assert.equal(f.audio.motors.size, 0);
    assert.equal(f.queue.length, 0); assert.equal(f.stats().disposed, 2);
    if (boundary !== 'reset') f.tick(3);
    assert.equal(f.stats().samples, 1);
    document.hidden = false; f.audio.paused = f.audio.pageHidden = false; f.audio.enabled = true;
    f.context.state = 'running';
    // Let pending suspend reconciliation finish before testing the resumed interval.
    await Promise.resolve();
    f.tick(0.05); assert.equal(f.stats().samples, 1);
    f.tick(0.05); assert.equal(f.stats().samples, 2); close(f.intervals.at(-1), 0.1);
  }
});

test('teleport reset snaps one current listener sample and clears both clocks; dispose cannot resume updates', () => {
  const f = fixture();
  f.tick(0.12); f.camera.position.x = 100; f.tick(0.12);
  assert.equal(f.stats().samples, 2); assert.equal(f.stats().disposed, 2);
  assert.equal(f.audio.listener.x, 100); assert.equal(f.audio.accumulator, 0); assert.equal(f.audio.intervalElapsed, 0);
  f.tick(0.05); assert.equal(f.stats().samples, 2);
  f.audio.dispose(); f.tick(1); assert.equal(f.stats().samples, 2); assert.equal(f.queue.length, 0);
});

test('installed context callback resets on interruption/suspension without animation; teardown removes it before close', () => {
  // Run production initialize() with only synthesis/bank creation replaced to avoid fetch/decode.
  const text = readFileSync(new URL('../js/audio-system.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export const SOUND_STATE_KEY', 'const SOUND_STATE_KEY')
    .replace('export { CityAudioSystem };', 'return CityAudioSystem;');
  const noop = () => {};
  const deps = { createSynthResources: () => ({}), createEventResources: () => ({}),
    createWindVoice: () => ({ dispose() {} }), setControlRate: noop, EucAudio: class { reset() {} dispose() {} } };
  const Instrumented = new Function(...Object.keys(deps), text)(...Object.values(deps));
  const original = globalThis.AudioContext;
  const node = () => {
    const n = { connect(target) { return target; }, disconnect() {} };
    for (const key of ['gain', 'threshold', 'knee', 'ratio', 'attack', 'release', 'frequency', 'Q']) {
      n[key] = { value: 0, cancelScheduledValues: noop, setValueAtTime: noop };
    }
    return n;
  };
  let closeCalls = 0;
  globalThis.AudioContext = class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.listener = {}; }
    createGain = node; createDynamicsCompressor = node; createConvolver = node; createBiquadFilter = node;
    close() {
      assert.equal(this.onstatechange, null, 'handler must be removed before close is invoked');
      closeCalls++;
      this.state = 'closed';
      return Promise.resolve();
    }
  };
  try {
    const f = fixture();
    f.audio.context = null;
    Instrumented.prototype.initialize.call(f.audio);
    const context = f.audio.context, installedHandler = context.onstatechange;
    assert.equal(typeof installedHandler, 'function');
    for (const state of ['interrupted', 'suspended']) {
      f.audio.accumulator = 0.04; f.audio.intervalElapsed = 0.04; f.audio.haveListener = true;
      f.queue.push({ type: 'crash' });
      context.state = state; context.onstatechange();
      assert.equal(f.audio.accumulator, 0, state); assert.equal(f.audio.intervalElapsed, 0, state);
      assert.equal(f.audio.haveListener, false); assert.equal(f.audio.motors.size, 0);
      assert.equal(f.queue.length, 0, 'state event drains stale rider events without a frame');
      context.state = 'running'; context.onstatechange();
      assert.equal(f.audio.intervalElapsed, 0);
      assert.equal(context.onstatechange, installedHandler);
    }
    f.audio.dispose();
    assert.equal(context.onstatechange, null); assert.equal(context.state, 'closed');
    assert.equal(closeCalls, 1);
    f.audio.dispose(); assert.equal(closeCalls, 1, 'repeated teardown does not close again');
  } finally { globalThis.AudioContext = original; }
});
