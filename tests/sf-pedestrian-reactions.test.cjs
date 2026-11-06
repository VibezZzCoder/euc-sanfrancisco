// Native CPU contact + actual traffic wiring, no browser/GPU or generated-source changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTraffic } = require('./helpers/traffic-harness.cjs');
let createEucDynamicWorld, EucController, NEUTRAL_ACTIONS, NYC, system, pedestrian;
const focus = { x: -330, y: 0, z: -560 };
test.before(async () => {
  ({ createEucDynamicWorld } = await import('../js/euc-dynamic.js'));
  ({ EucController } = await import('../js/euc/simulation/EucController.js'));
  ({ NEUTRAL_ACTIONS } = await import('../js/euc/input/actions.js'));
  ({ NYC, system } = loadTraffic({ seed: 9127 }));
  system.update(0.05, 0.05, focus);
  pedestrian = system.peds.find(p => p.placed && !p.node);
});
function fixture({ speed = 6, floor = 0, miss = 0 } = {}) {
  const p = pedestrian;
  NYC.resetSfPedestrianReaction(p);
  p.pause = 0; p.v = 0;
  const body = p.dynamicBody;
  body.headingY = 0; body.velocityX = body.velocityZ = 0;
  const world = createEucDynamicWorld({ bodiesNear(x, z, r, out) { out.push(body); } });
  const y = body.minY + floor;
  const sampler = {
    sampleGround(x, z, out) { out.height = y; Object.assign(out.normal, { x: 0, y: 1, z: 0 }); out.surface = 'pavement'; out.offCourse = false; return out; },
    raycast() { return null; }
  };
  const spawn = { position: { x: body.x + miss, y, z: body.z - body.halfLengthMetres - 0.52 }, headingY: 0 };
  const rider = new EucController(sampler, { spawn, dynamicWorld: world });
  rider.reset(spawn, speed);
  return { p, body, world, rider, sampler };
}
function step(f) { f.rider.step(1 / 120, NEUTRAL_ACTIONS); f.world.publishContacts(f.rider); }

test('native mounted impact charges once after admission and shoves the walker away, then pauses', () => {
  const f = fixture();
  f.rider.step(1 / 120, NEUTRAL_ACTIONS);
  assert.ok(f.world.stats.contacts > 0);
  assert.ok(f.rider.dynamicIntent && f.rider.dynamicImpactSpeed > 3.5);
  assert.ok(f.rider.crashed, 'native rider obstacle crash remains authoritative');
  assert.equal(f.p.bumped, 0, 'resolveMotion has no actor side effects');
  f.world.publishContacts(f.rider);
  assert.equal(f.p.bumped, 1);
  assert.ok(f.p.bumpVZ > 0 && f.p.bumpVX === 0);
  assert.equal(f.p.pause, 2.2);
  f.world.publishContacts(f.rider);
  assert.equal(f.p.bumped, 1, 'same committed step cannot publish twice');
  for (let i = 0; i < 5; i++) step(f);
  assert.equal(f.p.bumped, 1, 'catch-up/contact hold cannot retrigger');
});

test('low-speed contact, same-XZ different floor, near miss and stationary rider do not shove', () => {
  for (const options of [{ speed: 0 }, { speed: 1 }, { floor: -10 }, { floor: 10 }, { miss: 1.2 }]) {
    const f = fixture(options);
    for (let i = 0; i < 4; i++) step(f);
    assert.equal(f.p.bumped, 0, JSON.stringify(options));
  }
});

test('admitted upper mounted-body overlap and non-crashing bump also react through native steps', () => {
  const upper = fixture({ floor: -1 });
  step(upper);
  assert.ok(upper.rider.y < upper.body.minY, 'wheel is below the walker feet; mounted hull still overlaps vertically');
  assert.equal(upper.p.bumped, 1);
  const slow = fixture({ speed: 2 });
  for (let i = 0; i < 3; i++) step(slow);
  assert.equal(slow.p.bumped, 1);
  assert.equal(slow.rider.crashed, false, 'reaction does not lower the native crash threshold');
});

test('queried but uncommitted prepared step and rejected native prefix never react', () => {
  const f = fixture();
  const token = f.rider.prepareStep(1 / 120, NEUTRAL_ACTIONS);
  f.rider.resolvePreparedStep(token);
  f.world.publishContacts(f.rider);
  assert.equal(f.p.bumped, 0, 'working controller is not the admitted controller');
  f.rider.holdPreparedStep(token);
  f.rider.commitPreparedStep(token);
  f.world.publishContacts(f.rider);
  assert.equal(f.p.bumped, 0, 'held/rejected transaction is not an impact');

  const g = fixture();
  // Native prefix veto: the target is initially clear, but the clipped prefix has no wheel clearance.
  g.sampler.raycastObstacle = () => 0;
  const result = g.rider.resolveDynamicCandidate(0, 0.1, 1 / 120, false, 0);
  assert.equal(result.fraction, 0);
  assert.equal(g.rider.dynamicIntent, null);
  assert.ok(g.world.stats.contacts > 0, 'a real dynamic candidate was found before native rejection');
  g.world.publishContacts(g.rider);
  assert.equal(g.p.bumped, 0);
});

test('actual traffic update advances reaction, rebuilds finite elevated body and preserves population/routes', () => {
  const f = fixture(); step(f);
  const p = f.p, track = [p.ax, p.az, p.ux, p.uz, p.len], count = system.peds.length;
  // Freeze normal progression; reaction still runs through the real traffic update and body index.
  p.speed = 0;
  system.update(0.05, 0.1, focus);
  assert.ok(p.bumpOZ > 0);
  assert.equal(p.dynamicBody.x, p.x); assert.equal(p.dynamicBody.z, p.z);
  assert.ok(Number.isFinite(p.dynamicBody.minY) && p.dynamicBody.minY !== 0);
  assert.equal(p.dynamicBody.minY, NYC.Terrain.groundAt(p.x, p.z) + NYC.CURB_H);
  assert.deepEqual([p.ax, p.az, p.ux, p.uz, p.len], track);
  assert.equal(system.peds.length, count);
  const before = [p.x, p.z, p.bumpCooldown, p.bumpOX, p.bumpOZ];
  system.update(0, 0.1, focus);
  assert.deepEqual([p.x, p.z, p.bumpCooldown, p.bumpOX, p.bumpOZ], before, 'frozen traffic freezes reaction');
});

test('bounded reaction returns exactly to track, rearms after cooldown and resets on recycle', () => {
  const p = { placed: true, pause: 0, v: 1, x: 0, z: 0 };
  NYC.resetSfPedestrianReaction(p);
  const body = { source: p, onEucImpact: NYC.reactSfPedestrian };
  assert.ok(body.onEucImpact(20, 0, 1));
  const ground = (p, x, z) => 85 + z * 0.35;
  for (let i = 0; i < 100; i++) {
    p.x = p.z = 0; p.pause = Math.max(0, p.pause - 0.05);
    NYC.stepSfPedestrianReaction(p, 0.05, ground, () => true);
    assert.ok(Math.hypot(p.x, p.z) <= 0.75);
    assert.ok(Number.isFinite(ground(p, p.x, p.z)));
  }
  assert.equal(p.bumpOX, 0); assert.equal(p.bumpOZ, 0); assert.equal(p.bumpCooldown, 0);
  assert.ok(body.onEucImpact(3, 1, 0));
  assert.equal(p.bumped, 2);
  NYC.resetSfPedestrianReaction(p);
  assert.deepEqual([p.bumpOX, p.bumpOZ, p.bumpVX, p.bumpVZ, p.bumpCooldown, p.bumped], [0, 0, 0, 0, 0, 0]);
  // Exercise the actual successful spawnPed reset too (same source actor reused).
  pedestrian.placed = false; pedestrian.bumpCooldown = 3; pedestrian.bumpOX = 0.5; pedestrian.bumped = 9;
  system.update(0, 0.1, focus);
  assert.ok(pedestrian.placed);
  assert.equal(pedestrian.bumpOX, 0); assert.equal(pedestrian.bumpCooldown, 0); assert.equal(pedestrian.bumped, 0);
});

test('reaction rejects invalid impulses, obstructed offsets and nonfinite/different-layer ground', () => {
  for (const [ground, clear] of [[() => NaN, () => true], [(p, x, z) => z ? 30 : 0, () => true], [() => 80, () => false]]) {
    const p = { placed: true, pause: 0, v: 0, x: 0, z: 0 };
    NYC.resetSfPedestrianReaction(p);
    const body = { source: p, onEucImpact: NYC.reactSfPedestrian };
    assert.equal(body.onEucImpact(NaN, 0, 1), false);
    assert.equal(body.onEucImpact(3, 0, 0), false);
    assert.ok(body.onEucImpact(3, 0, 1));
    NYC.stepSfPedestrianReaction(p, 0.05, ground, clear);
    assert.equal(p.x, 0); assert.equal(p.z, 0);
    assert.equal(p.bumpOX, 0); assert.equal(p.bumpOZ, 0);
  }
});

function walker(x = 0, z = 0) {
  const p = { placed: true, x, z, ux: 0, uz: 1, dir: 1, v: 1, pause: 0, t: 10, len: 30, floor: 80,
    socialTime: 0, conversation: null };
  NYC.resetSfPedestrianReaction(p);
  return p;
}
const slopeGround = (p, x, z) => p.floor + z * 0.35;
const approaching = { active: true, x: 0, z: -2, minY: 79.3, vx: 0, vz: 5 };

test('oncoming same-floor rider causes bounded sidestep on a hill, then exact return without an impact', () => {
  const p = walker();
  for (let i = 0; i < 20; i++) {
    p.x = p.z = 0;
    NYC.dodgeSfPedestrian(p, 0.05, approaching, slopeGround, () => true);
    assert.ok(Math.abs(p.dodge) <= 0.6);
  }
  assert.equal(Math.abs(p.x), 0.6); assert.equal(p.z, 0); assert.equal(p.bumped, 0);
  const frozen = [p.x, p.z, p.dodge];
  NYC.dodgeSfPedestrian(p, 0, { active: false }, slopeGround, () => true);
  assert.deepEqual([p.x, p.z, p.dodge], frozen);
  for (let i = 0; i < 20; i++) {
    p.x = p.z = 0;
    NYC.dodgeSfPedestrian(p, 0.05, { active: false }, slopeGround, () => true);
  }
  assert.equal(p.x, 0); assert.equal(p.z, 0); assert.equal(p.dodge, 0);
});

test('dodge excludes other floors, separating/remote riders, occluded approaches and blocked side destinations', () => {
  for (const rider of [{ ...approaching, minY: 89.3 }, { ...approaching, minY: 69.3 },
    { ...approaching, vz: -5 }, { ...approaching, x: 5 }, { ...approaching, minY: NaN }]) {
    const p = walker();
    NYC.dodgeSfPedestrian(p, 0.05, rider, slopeGround, () => true);
    assert.equal(p.dodge, 0); assert.equal(p.bumped, 0);
  }
  for (const clear of [() => false, (ax, az, bx) => bx === 0]) {
    const p = walker();
    NYC.dodgeSfPedestrian(p, 0.05, approaching, slopeGround, clear);
    assert.equal(p.dodge, 0); assert.equal(p.x, 0);
  }
  const p = walker();
  const discontinuous = (p, x, z) => slopeGround(p, x, z) + (x ? 10 : 0);
  NYC.dodgeSfPedestrian(p, 0.05, approaching, discontinuous, () => true);
  assert.equal(p.dodge, 0);
  const waiting = walker();
  NYC.dodgeSfPedestrian(waiting, 0.05, { active: true, x: 0, z: 0.5, minY: 80.175, vx: 0, vz: 0 }, slopeGround, () => true);
  assert.ok(waiting.dodge); assert.equal(waiting.v, 0); assert.equal(waiting.pause, 0.6);
  assert.equal(waiting.bumped, 0, 'standing awareness cannot manufacture a complaint/impact');
});

function socialFixture({ clear = () => true, blockAt = () => sharedBlock, ground = slopeGround } = {}) {
  const social = NYC.createSfPedestrianSocial({ clear, blockAt, ground, random: () => 0 });
  const p = walker(0, 0), q = walker(1, 0);
  for (const person of [p, q]) person.interruptConversation = (who) => social.interrupt(who, 10);
  return { social, p, q };
}
const sharedBlock = {};

test('same-island conversations pair/stop, freeze, expire, rearm and end on admitted impact/recycle', () => {
  const { social, p, q } = socialFixture();
  social.update([p, q], 0.05, 10);
  const pair = p.conversation;
  assert.ok(pair && q.conversation === pair); assert.equal(p.v, 0); assert.equal(q.v, 0);
  assert.equal(pair.remaining, 6);
  social.update([p, q], 0, 10); assert.equal(pair.remaining, 6);
  social.update([p, q], 6, 16);
  assert.equal(p.conversation, null); assert.equal(q.conversation, null); assert.equal(p.socialTime, 46);
  social.update([p, q], 0.05, 47); assert.ok(p.conversation);
  assert.ok(NYC.reactSfPedestrian.call({ source: p }, 4, 0, 1));
  assert.equal(p.conversation, null); assert.equal(q.conversation, null);
  p.bumpCooldown = p.pause = 0; p.socialTime = q.socialTime = 0;
  social.update([p, q], 0.05, 50); assert.ok(p.conversation);
  social.reset(q, 50);
  assert.equal(p.conversation, null); assert.equal(q.conversation, null); assert.equal(q.socialTime, 55);
});

test('meetings exclude crossings, ends, different islands/floors, invalid terrain and blocked corridors; dodge interrupts', () => {
  const cases = [
    { change: q => { q.node = {}; } }, { change: q => { q.t = 2; } }, { change: q => { q.floor += 10; } },
    { options: { blockAt: x => x ? {} : sharedBlock } }, { options: { clear: () => false } },
    { options: { ground: p => p.x ? NaN : 80 } }
  ];
  for (const { change, options } of cases) {
    const { social, p, q } = socialFixture(options);
    change?.(q); social.update([p, q], 0.05, 10);
    assert.equal(p.conversation, null); assert.equal(q.conversation, null);
  }
  const { social, p, q } = socialFixture();
  social.update([p, q], 0.05, 10);
  NYC.dodgeSfPedestrian(p, 0.05, approaching, slopeGround, () => true);
  assert.equal(p.conversation, null); assert.equal(q.conversation, null); assert.equal(p.bumped, 0);
});

test('traffic honors conversation pause and resumes the same track after pair ends', () => {
  const p = pedestrian;
  p.v = 0; p.speed = 1.3; p.pause = 0; p.bumpCooldown = p.dodge = 0;
  const partner = { placed: true, conversation: null, socialTime: 0 };
  const pair = { a: p, b: partner, remaining: 3 };
  p.conversation = partner.conversation = pair;
  const t = p.t;
  system.update(0.05, 0.2, focus);
  assert.equal(p.t, t); assert.equal(p.v, 0);
  p.interruptConversation(p);
  system.update(0.05, 0.25, focus);
  assert.ok(p.v > 0); assert.notEqual(p.t, t); assert.equal(partner.conversation, null);
});

test('actual traffic reads the oncoming player, applies dodge before body snapshot and returns on the same track', () => {
  const p = system.peds.find(p => p.placed && !p.node && p.t > 6 && p.t < p.len - 6
    && system.network.walkable(p.x - 0.8, p.x + 0.8, p.z - 0.8, p.z + 0.8));
  assert.ok(p);
  NYC.resetSfPedestrianReaction(p); p.interruptConversation(p);
  p.pause = p.v = p.speed = 0;
  const before = { x: p.x, z: p.z, t: p.t };
  const x = p.x - p.ux * p.dir * 2, z = p.z - p.uz * p.dir * 2;
  const player = { position: { x, y: NYC.Terrain.groundAt(x, z) + NYC.CURB_H, z },
    velocityX: p.ux * p.dir * 5, velocityZ: p.uz * p.dir * 5 };
  system.update(0.05, 0.3, focus, player);
  assert.ok(p.dodge, 'production update connects same-floor player awareness');
  assert.equal(p.bumped, 0); assert.equal(p.t, before.t);
  assert.equal(p.dynamicBody.x, p.x); assert.equal(p.dynamicBody.z, p.z);
  assert.equal(p.velocityX, (p.x - before.x) / 0.05);
  assert.equal(p.velocityZ, (p.z - before.z) / 0.05);
  for (let i = 1; i <= 12; i++) system.update(0.05, 0.3 + i * 0.05, focus);
  assert.equal(p.dodge, 0); assert.equal(p.x, p.ax + p.ux * p.t); assert.equal(p.z, p.az + p.uz * p.t);
  assert.equal(system.peds.length, 340);
});
