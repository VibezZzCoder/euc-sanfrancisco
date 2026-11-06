// CPU-only controls: actual SF sampler + generated controller, no renderer/DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { EUC_DYNAMIC_HULL } from '../js/euc-dynamic.js';

const STEP = 1 / 120;
const ride = { ...NEUTRAL_ACTIONS, throttle: 0.5 };
const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const top = (height, options = {}) => ({ poly: rect(-10, -30, 10, 30), top: height, surface: 'pavement', layered: true, ...options });
function world({ height = 0, kind = 'waterEdge', waterLevel = 0, ...options } = {}) {
  return new SfTerrainSampler({
    terrain: { originX: -40, originZ: -40, cell: 80, w: 2, h: 2, heights: [height, height, height, height], waterLevel },
    data: { groundMask: { header: { originX: -40, originZ: -40, cell: 80, w: 1, h: 1, classes: [kind] }, mask: [0] } },
    ...options,
  });
}
const ground = (s, y, x = 0, z = 0) => s.sampleGround(x, z, { normal: {} }, y);
const spawn = { position: { x: 0, y: 2, z: -8 }, headingY: 0 };
function waterfront(dynamicWorld) {
  const s = world({ tops: [top(2, { poly: rect(-10, -30, 10, 0), shore: true })] });
  const c = new EucController(s, { spawn, dynamicWorld });
  assert.equal(c.reset(spawn, 5), true);
  return { s, c };
}
function fallIntoWater(s, c) {
  for (let i = 0; i < 1200; i++) {
    c.step(STEP, ride);
    const p = c.snapshot().position;
    if (s.needsWaterRecovery(p.x, p.z, p.y)) return p;
  }
  assert.fail('native riding did not reach submerged water');
}

test('mask AND support elevation: wet bay, dry shore band, coarse regional water over raised ground, negative dry land', () => {
  for (const kind of ['waterEdge', 'water']) {
    const wet = world({ kind });
    assert.equal(ground(wet, 0).height, -4, 'water must not become an ocean-surface lid');
    assert.equal(ground(wet, 0).offCourse, true, 'wet floor must not enter native safe history');
    assert.equal(wet.needsWaterRecovery(0, 0, 5), false, 'airborne over water is not immersed');
    assert.equal(wet.needsWaterRecovery(0, 0, -0.24), false);
    assert.equal(wet.needsWaterRecovery(0, 0, -0.25), true);
    assert.equal(wet.findPlacementTarget({ x: 0, z: 0, referenceY: -4 }), null);
    const dry = world({ kind, height: 1.5 });
    assert.equal(ground(dry, 1.5).height, 1.5);
    assert.equal(dry.isWater(0, 0, 1.5), false);
  }
  const lowDry = world({ kind: 'asphalt', height: -3 });
  assert.equal(lowDry.needsWaterRecovery(0, 0, -3), false);
  assert.ok(lowDry.findPlacementTarget({ x: 0, z: 0, referenceY: -3 }));
  const raisedDatum = world({ height: 10, waterLevel: 10 });
  assert.equal(raisedDatum.needsWaterRecovery(0, 0, 9.75), true);
  assert.equal(raisedDatum.needsWaterRecovery(0, 0, 10.1), false);
});

test('stacked bridge/pier support stays dry; falling below the deck remains water', () => {
  const s = world({ tops: [top(0.1, { shore: true }), top(12)] });
  for (const y of [0.1, 12]) {
    assert.equal(ground(s, y).height, y);
    assert.equal(s.isWater(0, 0, y), false);
    assert.ok(s.findPlacementTarget({ x: 0, z: 0, referenceY: y }));
  }
  assert.equal(s.needsWaterRecovery(0, 0, -1), true);
  assert.equal(ground(s, -1).height, -4);
});

test('native bridge, low pier and below-datum dry land riding do not trigger water recovery', () => {
  for (const [s, y] of [
    [world({ tops: [top(12)] }), 12],
    [world({ tops: [top(0.1, { shore: true })] }), 0.1],
    [world({ height: -3, kind: 'asphalt' }), -3],
    [world({ height: 2, kind: 'water' }), 2],
  ]) {
    const c = new EucController(s, { spawn: { position: { x: 0, y, z: -8 }, headingY: 0 } });
    const serial = c.placementSerial;
    for (let i = 0; i < 240; i++) c.step(STEP, ride);
    assert.ok(c.snapshot().position.z > -7);
    assert.equal(c.snapshot().position.y, y);
    assert.equal(c.placementSerial, serial);
  }
});

test('ordinary submerged top/box/prism cannot relabel the bay as dry; explicit body deck remains dry', () => {
  for (const y of [-2, 2]) for (const shape of ['tops', 'boxes', 'prisms']) {
    const options = shape === 'tops' ? { tops: [top(y)] }
      : shape === 'boxes' ? { boxes: [{ centre: { x: 0, y: y - 0.5, z: 0 }, halfExtents: { x: 10, y: 0.5, z: 10 }, support: true, surface: 'wood' }] }
        : { prisms: [{ outer: rect(-10, -10, 10, 10), minY: y - 1, maxY: y, support: true }] };
    const s = world(options);
    assert.equal(ground(s, y).height, y);
    assert.equal(s.isWater(0, 0, y), y < 0, `${shape} at ${y}`);
    assert.equal(s.needsWaterRecovery(0, 0, y), y < 0);
    assert.equal(s.isOffLimits(0, 0, y), y < 0);
  }
});

test('bounded low dry tunnel wins over water and hill, but cannot dry the water outside its bore', () => {
  for (const height of [0, 30]) {
    const s = world({ height, tops: [top(-3, { replacesTerrain: true, ceilingOffset: 5.2 })] });
    assert.equal(ground(s, -3).height, -3);
    assert.equal(s.needsWaterRecovery(0, 0, -3), false);
    assert.ok(s.findPlacementTarget({ x: 0, z: 0, referenceY: -3 }));
    const c = new EucController(s, { spawn: { position: { x: 0, y: -3, z: -8 }, headingY: 0 } });
    const serial = c.placementSerial;
    for (let i = 0; i < 240; i++) c.step(STEP, ride);
    assert.ok(c.snapshot().position.z > -7);
    assert.equal(c.placementSerial, serial, 'low dry riding must not recover');
    assert.equal(s.needsWaterRecovery(15, 0, -3), height === 0);
    assert.equal(ground(s, 30).height, height === 0 ? -4 : 30);
  }
});

test('native riding off a pier falls below water, then returns to rechecked dry history at rest', () => {
  const { s, c } = waterfront();
  const serial = c.placementSerial;
  const wet = fallIntoWater(s, c);
  assert.ok(wet.y < 0 && wet.y > -4, 'recover before riding along the submerged floor');
  const safe = c.snapshot().safePosition;
  assert.ok(safe.z < 0 && safe.y === 2);
  c.step(STEP, ride);
  const result = c.snapshot();
  assert.equal(c.placementSerial, serial + 1);
  assert.equal(result.position.y, 2);
  assert.ok(result.position.z < 0);
  assert.equal(result.speed, 0);
  assert.ok(s.findPlacementTarget({ x: result.position.x, z: result.position.z, referenceY: result.position.y }));
  assert.equal(c.crashed, false);
});

test('blocked dynamic recovery holds position under throttle/hop and retries boundedly, then recovers', () => {
  let blocked = false, attempts = 0, notices = 0;
  const dynamicWorld = { hull: EUC_DYNAMIC_HULL, canPlace: () => !blocked, didPlace: () => notices++ };
  const { s, c } = waterfront(dynamicWorld);
  const original = s.findRecoveryTarget.bind(s);
  s.findRecoveryTarget = (...args) => { attempts++; return original(...args); };
  const wet = fallIntoWater(s, c), serial = c.placementSerial, safe = c.snapshot().safePosition;
  const beforeNotices = notices;
  blocked = true;
  for (let i = 0; i < 120; i++) c.step(STEP, { ...ride, throttle: 1, steer: 1, hop: true, reset: true });
  assert.deepEqual(c.snapshot().position, wet);
  assert.deepEqual(c.snapshot().safePosition, safe);
  assert.equal(c.placementSerial, serial);
  assert.equal(notices, beforeNotices, 'failed admission must not notify placement');
  assert.ok(attempts >= 4 && attempts <= 6, `retry count ${attempts} in one simulated second`);
  blocked = false;
  for (let i = 0; i < 30 && c.placementSerial === serial; i++) c.step(STEP, ride);
  assert.equal(c.placementSerial, serial + 1);
  assert.equal(c.snapshot().speed, 0);
  assert.equal(notices, beforeNotices + 1);
});

test('water recovery refuses static overheads, wet history and disconnected local escapes', () => {
  const dry = top(2, { poly: rect(-10, -30, 10, -2) });
  const blocked = world({ tops: [dry], boxes: [{ centre: { x: 0, y: 3.5, z: -16 }, halfExtents: { x: 10, y: 0.1, z: 14 }, support: false }] });
  const request = { fallen: { x: 0, y: -1, z: 5 }, safePoints: [{ x: 0, y: 2, z: -8, headingY: 0 }], headingY: 0 };
  assert.equal(blocked.findRecoveryTarget(request), null);
  const s = world({ tops: [dry] });
  assert.equal(s.findRecoveryTarget({ ...request, safePoints: [{ x: 0, y: -4, z: 5, headingY: 0 }] }), null);
  // A point on the edge lacks a dry standing footprint: local offsets must not
  // teleport across that invalid origin, even though dry ground exists nearby.
  assert.equal(s.findRecoveryTarget({ ...request, safePoints: [{ x: 0, y: 2, z: -2.1, headingY: 0 }] }), null);
  assert.ok(s.findRecoveryTarget(request));
});

test('prepared water recovery is observational until commit and rechecks moving occupancy', () => {
  let blocked = false;
  const { s, c } = waterfront({ hull: EUC_DYNAMIC_HULL, canPlace: () => !blocked });
  const wet = fallIntoWater(s, c), serial = c.placementSerial;
  const token = c.prepareStep(STEP, ride);
  assert.deepEqual(c.snapshot().position, wet);
  assert.equal(c.placementSerial, serial);
  blocked = true;
  c.resolvePreparedStep(token);
  c.commitPreparedStep(token);
  assert.deepEqual(c.snapshot().position, wet);
  assert.equal(c.placementSerial, serial);
  blocked = false;
  for (let i = 0; i < 30 && c.placementSerial === serial; i++) {
    const next = c.prepareStep(STEP, ride);
    c.resolvePreparedStep(next);
    c.commitPreparedStep(next);
  }
  assert.equal(c.placementSerial, serial + 1);
  assert.equal(c.snapshot().position.y, 2);
  assert.equal(c.snapshot().speed, 0);
});
