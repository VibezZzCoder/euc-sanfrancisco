// Execute the complete production host with native physics/pose/trick/input dependencies.
// Only rendering/appearance services are substituted; no copied scheduler or production test hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as physics from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { SIMULATION, INPUT } from '../js/euc/data/tuning.js';
import * as roster from '../js/euc-roster.js';
import { RiderPreparation, yieldRiderStage } from '../js/rider-preparation.js';
import { RiderTricks } from '../js/euc-tricks.js';
import * as nearSolids from '../js/euc/app/nearSolids.js';
import * as recovery from '../js/euc-recovery.js';

const STEP = 1 / 120;
const raw = readFileSync(new URL('../js/euc-rider.js', import.meta.url), 'utf8');
const source = raw.replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '').replace(/^export /gm, '');
const noop = () => {};
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
}
function fixture() {
  const calls = [], alphas = [];
  const bindings = {
    ...physics, ...roster, ...nearSolids, ...recovery, NEUTRAL_ACTIONS, SIMULATION, INPUT,
    THREE: { Vector3 }, RiderPreparation, yieldRiderStage, RiderTricks,
    lerpPose(a, b, alpha, out) { alphas.push(alpha); return physics.lerpPose(a, b, alpha, out); },
    createRidingRig: () => ({ group: { traverse: noop, removeFromParent: noop }, apply: noop, dispose: noop,
      setNearSolids: noop, setTrickPose: noop, setTuckPose: noop }),
    riderLook: noop, machineLook: noop, prepareAppearance: async () => undefined, releaseAppearanceCaches: noop,
    getCity: () => ({ cityUniforms: { uInteriorGlow: { value: 0 } } }),
    EUC_HEADLIGHT: {}, headlightBeamScale: () => 0, placeEucHeadlight: noop,
    createEucHeadlight: () => ({ position: new Vector3(), target: { position: new Vector3() } }),
  };
  const create = new Function(...Object.keys(bindings), `${source}\nreturn createEucEntity;`)(...Object.values(bindings));
  const sampler = { sampleGround(x, z, out) {
    Object.assign(out, { height: 0, surface: 'pavement', offCourse: false });
    Object.assign(out.normal, { x: 0, y: 1, z: 0 }); return out;
  }, raycast: () => null };
  const entity = create({ add: noop, remove: noop }, sampler, { x: 0, y: 0, z: 0 });
  const nativeStep = entity.controller.step.bind(entity.controller);
  entity.controller.step = (dt, actions) => { calls.push({ dt, ...actions }); nativeStep(dt, actions); };
  return { entity, calls, alphas };
}
const close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test('late callbacks retain fractional time, six-step cap, finite interpolation and no debt', () => {
  const { entity, calls, alphas } = fixture();
  entity.update(STEP * 0.6, {});
  for (const dt of [0.05, 0.051, 2, Number.MAX_VALUE]) {
    const before = calls.length;
    entity.update(dt, { forward: 1 });
    assert.equal(calls.length - before, 6);
    close(alphas.at(-1), 0.6);
  }
  const count = calls.length;
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined]) entity.update(dt, {});
  assert.equal(calls.length, count);
  close(alphas.at(-1), 0.6);
  entity.update(STEP * 0.4, {});
  assert.equal(calls.length, count + 1); close(alphas.at(-1), 0);
  assert.ok(calls.every(c => c.dt === STEP));
});

test('fixed-step boundary rounding stays bounded and buffered hops expire in simulation time', () => {
  for (const fraction of [0, 0.001, 0.5, 0.999999, 1, 1.000001]) {
    const { entity, calls, alphas } = fixture();
    entity.update(STEP * fraction, {});
    assert.equal(calls.length, Math.floor(fraction));
    assert.ok(alphas.at(-1) >= 0 && alphas.at(-1) < 1);
    close(calls.length + alphas.at(-1), fraction);
  }
  const { entity, calls } = fixture();
  let canHop = false;
  Object.defineProperty(entity.controller, 'canAcceptHop', { get: () => canHop });
  Object.defineProperty(entity.controller, 'canAcceptSpin', { get: () => false });
  entity.update(STEP * 0.2, { hopPressed: true });
  for (let i = 0; i < Math.ceil(INPUT.actionBufferSeconds / STEP) + 2; i++) entity.update(STEP, {});
  canHop = true; entity.update(STEP, {});
  assert.ok(calls.every(c => !c.hop), 'expired buffered input is not replayed after catch-up');
});

test('deterministic refresh/jitter/stall streams conserve admitted time and match native fixed-step physics', () => {
  for (const hz of [30, 59.94, 60, 90, 120, 144, 240]) {
    const { entity, calls, alphas } = fixture();
    let time = 0;
    for (let i = 0; i < 800; i++) {
      const dt = i % 37 === 0 ? 0.05 : (1 + Math.sin(i * 17) * 0.18) / hz;
      time += Math.min(dt, 0.05);
      const before = calls.length;
      entity.update(dt, { forward: 0.35 });
      assert.ok(calls.length - before <= 6);
      assert.ok(alphas.at(-1) >= 0 && alphas.at(-1) < 1);
      close(calls.length * STEP + alphas.at(-1) * STEP, time);
    }
    const reference = fixture().entity.controller;
    for (const call of calls) reference.step(STEP, call);
    assert.deepEqual(entity.controller.snapshot(), reference.snapshot());
  }
});

test('substep buffered hop is claimed once; clearInput requires fresh edge and catch-up uses current axes', () => {
  const { entity, calls } = fixture();
  entity.update(STEP * 0.5, { up: true });
  assert.equal(calls.length, 0);
  entity.update(0.05, { up: true, forward: 0.7, right: 0.2 });
  assert.equal(calls.filter(c => c.hop).length, 1);
  assert.ok(calls.every(c => c.throttle === 0.7 && c.steer === 0.2));
  entity.clearInput({ up: true });
  entity.update(0.05, { up: true, backward: 0.4 });
  assert.ok(calls.slice(-6).every(c => !c.hop && c.throttle === -0.4));
  const fresh = fixture();
  fresh.entity.update(STEP * 0.4, { hopPressed: true });
  fresh.entity.clearInput({ up: true });
  fresh.entity.update(STEP * 0.6, { up: true });
  assert.equal(fresh.calls.at(-1).hop, false);
  fresh.entity.update(STEP, {});
  fresh.entity.update(STEP, { up: true });
  assert.equal(fresh.calls.at(-1).hop, true);
});

test('failed placement preserves remainder; successful placement and rider commit reset it; disposal stops stepping', async () => {
  const { entity, calls, alphas } = fixture();
  entity.update(STEP * 0.7, {});
  assert.equal(entity.placeAt(NaN, 0), false);
  entity.update(0, {}); close(alphas.at(-1), 0.7);
  assert.equal(entity.placeAt(5, 5), true);
  entity.update(STEP * 0.4, {}); assert.equal(calls.length, 0); close(alphas.at(-1), 0.4);
  const candidate = await entity.prepareRider('cool-rider', { compile: async () => {} });
  assert.equal(candidate.commit(), true);
  entity.update(STEP * 0.4, {}); assert.equal(calls.length, 0); close(alphas.at(-1), 0.4);
  await entity.dispose(); entity.update(10, { up: true }); assert.equal(calls.length, 0);
});

test('recovery retry/placement discontinuity uses production host edge handling without interpolated teleport', () => {
  const { entity, alphas } = fixture();
  const c = entity.controller;
  // Isolate recovery admission: controller outcome is controlled, host update/pose/edge code is unchanged.
  let crashed = true, attempts = 0;
  Object.defineProperty(c, 'crashed', { get: () => crashed });
  c.step = () => {};
  c.recover = () => {
    if (++attempts === 2) { crashed = false; c.reset({ position: { x: 30, y: 0, z: 0 }, headingY: 0 }); }
  };
  entity.update(STEP * 0.5, { resetPressed: true });
  assert.equal(attempts, 0);
  entity.update(0.05, {});
  assert.equal(attempts, 2); close(alphas.at(-1), 0.5);
  assert.equal(entity.position.x, 30);
  assert.equal(entity.drainEvents().filter(e => e.type === 'recover').length, 1);
});
