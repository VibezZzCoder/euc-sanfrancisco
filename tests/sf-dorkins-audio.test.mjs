import test from 'node:test';
import assert from 'node:assert/strict';
import { CityAudioSystem } from '../js/audio-system.js';
import { COP_SAMPLE_FILES, sirenTargets } from '../js/nemesis-audio.js';

test('chaser audio follows camera pan and consumes silent events at a pause', () => {
  const calls = [];
  const view = { x: 10, z: 0, sting: 1 };
  const audio = Object.create(CityAudioSystem.prototype);
  audio.context = { currentTime: 42 };
  audio.chaser = { audioView: view };
  audio.cop = { update: (v, t) => calls.push(['update', v.pan, t]), reset: v => calls.push(['reset', v.sting]) };
  const camera = { position: { x: 0, z: 0 }, matrixWorld: { elements: [1, 0, 0] } };
  audio.updateChaser(camera, true);
  audio.updateChaser(camera, false);
  assert.deepEqual(calls, [['update', 1, 42], ['reset', 1]]);
  assert.equal(sirenTargets(100).gain, 0);
  assert.ok(sirenTargets(8).gain > sirenTargets(40).gain);
  assert.deepEqual(Object.values(COP_SAMPLE_FILES), ['siren_far_loop.wav', 'siren_close_loop.wav']);
});

test('removing a chaser disposes its audio and cannot reattach after teardown', () => {
  const audio = Object.create(CityAudioSystem.prototype);
  let count = 0;
  audio.disposed = false;
  audio.chaser = { audioView: {} };
  audio.cop = { dispose: () => count++ };
  audio.setChaser(null);
  assert.equal(count, 1);
  assert.equal(audio.cop, null);
  assert.equal(audio.chaser, null);
  audio.disposed = true;
  audio.setChaser({ audioView: {} });
  assert.equal(audio.chaser, null);
});
