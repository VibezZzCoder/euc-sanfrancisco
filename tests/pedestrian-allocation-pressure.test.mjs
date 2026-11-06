// Private pinned-checkpoint differential. CPU only: real local Three math, no renderer/device.
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import trafficHarness from './helpers/traffic-harness.cjs';

const root = new URL('../', import.meta.url);
const checkpoint = 'fc9826b2872320bca7f08ac19d7141d3bbc31683';
const history = gitHistory(root, checkpoint);
const test = optionalSourceTest(history.skip);
const original = file => history.read(file);
const baseline = original('js/pedestrians.js');
const current = readFileSync(new URL('js/pedestrians.js', root), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
if (history.available) assert.equal(sha(baseline), 'a0463e6e291d601e8376cdf33fa9be0bb74fbc641b6daf2f5aba6563433e6019',
  'pinned pedestrian oracle');
function load(source, label = 'current', extra = {}) {
  // Contextified Math calls distort this project's CPU/allocation measurements.
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  context.window = { NYC: { THREE, TSL: {}, Addons: {} } };
  Object.assign(context, extra);
  vm.runInContext(source, context, { filename: `sf-pedestrian-${label}.js` });
  return { ...context.window.NYC, context };
}
function rng(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function options(random) {
  return { seed: random() * 300, female: random() < .5, scale: .75 + random() * .5,
    girth: .85 + random() * .35, hair: random(), armSwing: .7 + random() * .6, stride: .8 + random() * .4 };
}
function state(rig) {
  // Realm-normalized deep comparison retains NaN/signed zero. Also compare the exact Float32 bytes.
  return { fields: structuredClone({ ...rig }),
    pose: Buffer.from(new Uint8Array(rig.pose.buffer, rig.pose.byteOffset, rig.pose.byteLength)) };
}
function equalRig(a, b, label) {
  assert.deepEqual(state(b), state(a), label);
}
const floor = (owner, x, z) => (owner?.floor || 0) + x * .13 - z * .29 + (z >= 3 ? .15 : 0);

test('allocation changes retain all non-update code, including geometry, shader, crowd/PBO and bicycle pose', () => {
  const outside = source => [source.slice(0, source.indexOf('  update(dt, x, z, heading,')),
    source.slice(source.indexOf('\n  setPelvisRotation() {'))];
  assert.deepEqual(outside(current), outside(baseline));
  assert.notEqual(current, baseline, 'differential must compare different sources');
});

test('seeded complete gait/pose state and ground-call order match across every update branch', t => {
  const before = load(baseline, 'paths-before'), after = load(current, 'paths-after');
  const random = rng(0x753a9127), a = [], b = [];
  const calls = [[], []], methods = [Object.create(null), Object.create(null)], contactMasks = new Set();
  for (const [variant, api] of [before, after].entries()) {
    for (const name of ['reset', 'solve', 'footAnkle', 'hipOffset', 'solveLeg']) {
      const method = api.PersonRig.prototype[name];
      api.PersonRig.prototype[name] = function (...args) {
        methods[variant][name] = (methods[variant][name] || 0) + 1;
        if (name === 'hipOffset' && args[0] === 0) contactMasks.add(
          (this.feet[0].contact > .97 ? 1 : 0) | (this.feet[1].contact > .97 ? 2 : 0));
        return method.apply(this, args);
      };
    }
  }
  const ground = variant => (owner, x, z) => {
    calls[variant].push([owner.id, x, z]);
    return floor(owner, x, z);
  };
  const grounds = [ground(0), ground(1)];
  for (let i = 0; i < 24; i++) {
    const o = options(random);
    a.push(new before.PersonRig(o)); b.push(new after.PersonRig(o));
  }
  let hidden = 0, airborne = 0, running = 0, changedPose = 0;
  for (let frame = 0; frame < 660; frame++) {
    const dt = [1 / 60, 1 / 60, 1 / 30, 1 / 120, 0, -1, .2][frame % 7];
    for (let i = 0; i < a.length; i++) {
      const section = Math.floor(frame / 60), step = frame % 60, owner = { id: i, floor: i % 3 * 40 };
      // Stops, starting, walk/run/sprint, backwards, in-place turns, landings and >3 m relocation.
      const speed = [0, 1.3, 3.2, 8, 0, -2, 1.5, 1.5, .01, 0, 2][section];
      const x = frame ? a[i].x + Math.sin(i * .4) * speed / 60 : i * 2;
      const z = frame ? a[i].z + Math.cos(i * .4) * speed / 60 + (section === 7 && step === 0 ? 10 : 0) : 0;
      const heading = section === 4 ? step * .2 : i * .4 + (section === 5 ? Math.PI : Math.sin(frame / 30) * .8);
      const air = section === 6 ? Math.max(0, Math.sin(step / 59 * Math.PI)) * .8 : 0;
      const visible = frame % 50 >= 35 || i % 3 === 0;
      const oldPose = a[i].pose.slice();
      const args = [dt, x, z, heading];
      a[i].update(...args, grounds[0], owner, air, visible);
      b[i].update(...args, grounds[1], owner, air, visible);
      equalRig(a[i], b[i], `frame ${frame}, person ${i}`);
      assert.deepEqual(calls[1], calls[0], 'same terrain samples/order/owner');
      calls[0].length = calls[1].length = 0;
      if (!visible) hidden++;
      if (air > .03) airborne++;
      if (a[i].run > .9) running++;
      if (!Buffer.from(oldPose.buffer).equals(Buffer.from(a[i].pose.buffer))) changedPose++;
      assert.ok(a[i].pose.every(Number.isFinite));
    }
  }
  assert.deepEqual(methods[1], methods[0], 'identical reset/solve/foot/IK cadence');
  assert.deepEqual([...contactMasks].sort(), [0, 1, 2, 3], 'all left/right hard-contact combinations');
  assert.ok(hidden > 0 && airborne > 0 && running > 0 && changedPose > 0);
  t.diagnostic(JSON.stringify({ updates: 660 * 24, hidden, airborne, running, changedPose, methods: methods[1] }));
});

test('nested mixed-dt rig updates preserve outer coefficient copies and all callback/pose results', () => {
  function run(source) {
    const { PersonRig } = load(source, 'nested');
    const a = new PersonRig(), b = new PersonRig({ female: true, seed: .13 });
    a.reset(0, 0, 0, floor); b.reset(2, 1, .4, floor);
    const calls = [], states = [];
    const ground = (owner, x, z) => {
      calls.push([owner, x, z]);
      b.update(1 / 37, b.x + .01, b.z + .02, -.3, floor, null, 0, false);
      return floor(null, x, z);
    };
    for (let f = 0; f < 120; f++) {
      a.update(1 / 60, a.x + .01, a.z + .03, .2, ground, 'outer', f % 13 === 0 ? .3 : 0);
      states.push([state(a), state(b)]);
    }
    return { calls, states };
  }
  assert.deepEqual(run(current), run(baseline));
});

test('signed zero, clamp endpoints and nonfinite terrain retain exact numerical propagation', () => {
  for (const ground of [() => -0, () => NaN, () => Infinity, floor]) {
    const a = new (load(baseline).PersonRig)(), b = new (load(current).PersonRig)();
    for (const dt of [-0, 1e-4, .1, Infinity, NaN]) {
      a.reset(-0, 0, -0, ground); b.reset(-0, 0, -0, ground);
      a.update(dt, -.01, -.02, -0, ground); b.update(dt, -.01, -.02, -0, ground);
      equalRig(a, b, `dt ${dt}`);
    }
  }
});

test('walking/bicycle/reset transitions match all 15 bones and head outputs with transformed parents', () => {
  const before = load(baseline, 'bike-before'), after = load(current, 'bike-after'), random = rng(7123);
  const parent = new THREE.Group(), bike = new THREE.Group(); parent.add(bike);
  parent.position.set(14, 83, -32); parent.rotation.set(.1, -.7, -.14); parent.scale.set(1.1, .9, 1.2);
  for (let i = 0; i < 8; i++) {
    const o = options(random), a = new before.PersonRig(o), b = new after.PersonRig(o);
    for (let f = 0; f < 120; f++) {
      bike.position.set(f * .04, Math.sin(f * .05) * .2, -f * .1);
      bike.rotation.set(Math.sin(f * .1) * .2, f * .02, Math.cos(f * .1) * .1);
      const settings = { seat: { y: .85, z: -.15 }, bars: { y: 1.05, z: .5 }, bracket: { y: .3, z: .02 },
        ...(f % 2 ? { gripHalf: .17 + i * .01, crankLength: .15 + i * .005 } : {}) };
      if (f % 30 < 20) {
        a.ride(bike, f * .17, settings); b.ride(bike, f * .17, settings);
      } else {
        a.update(1 / 60, f * .02, .1, .3, floor); b.update(1 / 60, f * .02, .1, .3, floor);
      }
      equalRig(a, b, `bicycle ${i}, frame ${f}`);
      assert.ok(a.pose.every(Number.isFinite));
    }
  }
});

test('seeded real-data traffic keeps actor/RNG/social/body facts with actual rigs at native renderPed cadence', t => {
  // Freeze concurrent owners' files at the checkpoint. Test-only enable just renderPed in the cheap traffic harness;
  // vehicle rendering remains stubbed. Real rigs replace constructor-option capture stubs before the first update.
  const traffic = original('js/traffic.js');
  const social = original('js/sf-dynamic-bodies.js').replace('  const rand = random ||', '  const baseRand = random ||')
    .replace('  const cells = new Map();', `  const rand = () => { const value = baseRand();
      N.__socialRandom.push(value); return value; };
  const cells = new Map();`);
  assert.notEqual(social, original('js/sf-dynamic-bodies.js'));
  const patched = `window.NYC.__socialRandom = []; window.NYC.__random = [];
    { const random = Math.random; Math.random = () => { const value = random();
      window.NYC.__random.push(value); return value; }; }
    window.NYC.PersonRig = class { constructor(options) { this.options = options; } reset() {} };\n` +
    traffic.replace('if (!headless) renderPed(p, dt);', 'renderPed(p, dt);');
  function world(source) {
    const result = trafficHarness.loadTraffic({ seed: 9127, trafficSource: patched, dynamicSource: social });
    const { PersonRig } = load(source, 'traffic');
    for (const p of result.system.peds) p.rig = new PersonRig(p.rig.options);
    return result;
  }
  const a = world(baseline), b = world(current);
  const scalar = object => Object.fromEntries(Object.entries(object).filter(([, v]) => v === null ||
    ['number', 'boolean', 'string', 'undefined'].includes(typeof v)));
  function facts({ system, NYC }) {
    return structuredClone({ random: NYC.__random, socialRandom: NYC.__socialRandom,
      vehicles: [...system.cars, ...system.buses].map(v => [scalar(v), v.edge?.id, v.move?.to.id, v.move?.turn, scalar(v.dynamicBody)]),
      peds: system.peds.map(p => [scalar(p), p.node?.id, scalar(p.dynamicBody), state(p.rig),
        p.conversation && [system.peds.indexOf(p.conversation.a), system.peds.indexOf(p.conversation.b), p.conversation.remaining]]) });
  }
  let posed = 0, socialDraws = 0;
  for (let f = 0; f < 72; f++) {
    const focus = f < 48 ? { x: -330, z: -560 } : { x: -900, z: 500 };
    const dt = f % 17 === 0 ? 0 : .05;
    a.system.update(dt, f * .5, focus); b.system.update(dt, f * .5, focus);
    assert.deepEqual(facts(b), facts(a), `traffic frame ${f}`);
    posed += b.system.peds.filter(p => p.placed && p.rig.time !== p.rig.seed * 7.3).length;
    socialDraws = b.NYC.__socialRandom.length;
  }
  assert.equal(b.system.peds.length, 340); assert.ok(posed > 0 && socialDraws > 0);
  t.diagnostic(JSON.stringify({ trafficFrames: 72, population: 340, posedPersonFrames: posed,
    routeRandomDraws: b.NYC.__random.length, socialDraws }));
});

test('combined current traffic/body/real gait replay matches fc9826b with visible/hidden poses and reactions', async t => {
  const read = file => readFileSync(new URL(file, root), 'utf8');
  const paths = ['js/traffic.js', 'js/sf-dynamic-bodies.js', 'js/pedestrians.js'];
  const sources = [Object.fromEntries(paths.map(file => [file, original(file)])),
    Object.fromEntries(paths.map(file => [file, read(file)]))];
  const hashes = sources.map(source => Object.fromEntries(paths.map(file => [file, sha(source[file])])));
  const threeURL = new URL('vendor/three/build/three.webgpu.js', root).href;
  const addon = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js').replace("from 'three'", `from '${threeURL}'`);
  const Addons = await import(`data:text/javascript;base64,${Buffer.from(addon).toString('base64')}`);
  const replaceOne = (source, from, to) => {
    assert.equal(source.split(from).length, 2, `unique replay seam: ${from}`);
    return source.replace(from, to);
  };
  function world(source) {
    // Observers preserve the original internal social RNG and route RNG implementations and record every result.
    const dynamic = replaceOne(source['js/sf-dynamic-bodies.js'], '  const rand = random ||', '  const rawRand = random ||');
    const social = `window.NYC.__replay = { random: [], socialRandom: [], updates: [], solves: [], resets: [], drawn: [] };\n` +
      replaceOne(dynamic, '  const cells = new Map();', `  const rand = () => {
        const value = rawRand(); N.__replay.socialRandom.push(value); return value;
      };
  const cells = new Map();`);
    // Load the selected *complete real pedestrian source* before traffic destructures PersonRig. Only GPU crowd
    // submission is replaced by a draw-packet recorder; rig construction/reset/update/solve are all real from birth.
    const prelude = source['js/pedestrians.js'] + `\n{
      const N = window.NYC, audit = N.__replay, random = Math.random;
      Math.random = () => { const value = random(); audit.random.push(value); return value; };
      for (const name of ['update', 'solve', 'reset']) {
        const method = N.PersonRig.prototype[name];
        N.PersonRig.prototype[name] = function (...args) {
          const entry = name === 'update' ? [this.seed, ...args.slice(0, 4), args[6], args[7]] : null;
          if (entry) audit.updates.push(entry);
          else audit[name === 'solve' ? 'solves' : 'resets'].push(this.seed);
          const timeBefore = this.time, result = method.apply(this, args);
          if (entry) entry.push(timeBefore, this.time);
          return result;
        };
      }
      N.PersonCrowd = class {
        meshes = [new N.THREE.Group()];
        begin() {} end() {}
        add(rig, distance) { audit.drawn.push([rig.seed, distance]); }
      };
    }\n`;
    const traffic = prelude + replaceOne(source['js/traffic.js'],
      'if (!headless) renderPed(p, dt);', 'renderPed(p, dt);');
    const result = trafficHarness.loadTraffic({ seed: 9127, actors: { THREE, Addons },
      trafficSource: traffic, dynamicSource: social });
    result.camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 1500);
    assert.ok(result.system.peds.every(p => p.rig instanceof result.NYC.PersonRig), 'no gait stubs');
    return result;
  }
  const variants = sources.map(world), [before, after] = variants;
  const scalar = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value === null ||
    !['object', 'function'].includes(typeof value)));
  function facts({ system, NYC }) {
    const actors = [...system.cars, ...system.buses, ...system.peds], ids = new Map(actors.map((actor, i) => [actor, i]));
    const actor = a => ({ scalars: scalar(a), edge: a.edge?.id, next: a.next?.id, move: a.move && [a.move.to.id, a.move.turn],
      commit: a.commit?.id, conn: a.conn ? scalar(a.conn) : null, trail: a.trail ? scalar(a.trail) : null, node: a.node?.id,
      body: { ...scalar(a.dynamicBody), source: ids.get(a.dynamicBody.source), impact: typeof a.dynamicBody.onEucImpact,
        crashProfile: a.dynamicBody.crashProfile?.map(part => ({ ...part })) },
      conversation: a.conversation && [ids.get(a.conversation.a), ids.get(a.conversation.b), a.conversation.remaining],
      rig: a.rig && state(a.rig) });
    return structuredClone({ actors: actors.map(actor), epoch: system.bodyVersion(), stats: { ...system.bodyQueryStats },
      nodes: system.network.nodes.map(n => [n.id, [...n.box], [...n.crossing], n.walkers.map(p => ids.get(p)), n.curb.map(p => ids.get(p))]),
      occupancy: system.network.edges.map(e => e.occ.map(list => list.map(o => [ids.get(o.v), o.s]))),
      audit: NYC.__replay });
  }
  const totals = { frames: 420, fleet: 66, population: 340, zeroDtFrames: 0, focusJumps: 0,
    gaitUpdates: 0, visible: 0, hidden: 0, solves: 0, resets: 0, drawPackets: 0, hiddenAdvanced: 0,
    visibilityTransitions: 0, pairStarts: 0, conversationPersonFrames: 0, impactAccepted: 0,
    cooldownRejected: 0, impactConversationEnds: 0, shovePersonFrames: 0, dodgePersonFrames: 0,
    dodgeReturned: false, shoveReturned: false, bodyQueries: 0 };
  const seenPairs = new WeakSet(), visibility = new Map();
  let fixture = null, impactFrame = -1, elapsed = 0;
  assert.deepEqual(facts(after), facts(before), 'initial complete worlds');
  for (let frame = 0; frame < totals.frames; frame++) {
    // Sweep the existing elapsed-clock consumers faster than the motion dt, like the older isolated traffic
    // differential. This supplies bounded deterministic social/signal coverage without changing a probability/RNG.
    const dt = [.05, .05, .05, 0][frame % 4]; elapsed += dt * 4;
    if (dt === 0) totals.zeroDtFrames++;
    const focus = frame < 360 ? { x: -330, z: -560 } : frame < 400 ? { x: -900, z: 500 } : { x: -330, z: -560 };
    if (frame === 360 || frame === 400) totals.focusJumps++;
    if (frame === 20) {
      // Deterministic same-track peer setup on a real clear SF sidewalk; retain all actors and both real RNGs.
      // The native social update must actually choose a meeting; no fabricated conversation/probability override.
      const { system, NYC } = before;
      const candidates = system.peds.map((p, i) => ({ p, i })).filter(({ p }) => p.placed && !p.node && p.t > 8 && p.t < p.len - 8
        && Math.hypot(p.x - focus.x, p.z - focus.z) < 250
        && system.network.walkable(p.x - 2, p.x + 2, p.z - 2, p.z + 2)
        && NYC.blockAt(p.x, p.z) === NYC.blockAt(p.x + p.ux * 1.2, p.z + p.uz * 1.2));
      assert.ok(candidates.length >= 2, 'real clear-track social and dodge candidates');
      const p = candidates[0], dodger = candidates[1];
      const peer = system.peds.findIndex((q, i) => q.placed && !q.node && i !== p.i && i !== dodger.i);
      assert.ok(peer >= 0);
      fixture = { social: p.i, peer, dodge: dodger.i };
      for (const { system, NYC } of variants) {
        const p = system.peds[fixture.social], q = system.peds[peer], d = system.peds[fixture.dodge];
        for (const person of [p, q, d]) {
          person.interruptConversation(person); NYC.resetSfPedestrianReaction(person);
          person.pause = person.v = person.speed = person.socialTime = 0;
        }
        for (const key of ['ax', 'az', 'ux', 'uz', 'len', 'node', 'side', 'line', 'dir']) q[key] = p[key];
        q.t = p.t + 1.2; q.x = q.ax + q.ux * q.t; q.z = q.az + q.uz * q.t;
      }
      assert.deepEqual(facts(after), facts(before), 'identical controlled interaction setup');
    }
    if (fixture && frame >= 100 && frame < 240 && impactFrame < 0 && before.system.peds[fixture.social].conversation) {
      for (const { system } of variants) {
        const p = system.peds[fixture.social], body = p.dynamicBody, pair = p.conversation;
        assert.ok(body.onEucImpact.call(body, 4, .4, -.8), 'real impact callback accepts');
        assert.equal(body.onEucImpact.call(body, 4, .4, -.8), false, 'cooldown rejects repeat');
        assert.equal(pair.a.conversation, null); assert.equal(pair.b.conversation, null);
      }
      impactFrame = frame; totals.impactAccepted++; totals.cooldownRejected++; totals.impactConversationEnds++;
      assert.deepEqual(facts(after), facts(before), 'impact/interrupt boundary before ordinary traffic update');
    }
    for (const { system, NYC, camera } of variants) {
      const audit = NYC.__replay;
      for (const key of ['updates', 'solves', 'resets', 'drawn']) audit[key].length = 0;
      const angle = Math.floor(frame / 24) * Math.PI / 2;
      const tx = focus.x + Math.sin(angle) * 100, tz = focus.z + Math.cos(angle) * 100;
      camera.position.set(focus.x, NYC.Terrain.groundAt(focus.x, focus.z) + 12, focus.z);
      camera.lookAt(tx, NYC.Terrain.groundAt(tx, tz) + 1, tz);
      let player = null;
      if (fixture && frame >= 40 && frame < 70) {
        const p = system.peds[fixture.dodge], x = p.ax + p.ux * p.t - p.ux * p.dir * 2,
          z = p.az + p.uz * p.t - p.uz * p.dir * 2;
        player = { position: { x, y: NYC.Terrain.groundAt(x, z) + NYC.CURB_H, z },
          velocityX: p.ux * p.dir * 5, velocityZ: p.uz * p.dir * 5 };
      }
      system.update(dt, elapsed, focus, player, 'euc', camera);
    }
    // Verify ordered body queries with real car/bus/patrol crash profiles and caller-owned append semantics.
    const points = [[focus.x, focus.z, 30], [focus.x + 16, focus.z - 16, 0],
      [before.system.peds.find(p => p.placed).x, before.system.peds.find(p => p.placed).z, 2]];
    for (const [x, z, radius] of points) {
      const results = variants.map(({ system }) => {
        const actors = [...system.cars, ...system.buses, ...system.peds], ids = new Map(actors.map((a, i) => [a.dynamicBody, i]));
        const out = ['prefix']; system.dynamicBodiesNear(x, z, radius, out);
        assert.equal(out[0], 'prefix');
        assert.ok(out.slice(1).every(body => ids.has(body)), 'queried records belong to current actors');
        return out.slice(1).map(body => ids.get(body));
      });
      assert.deepEqual(results[1], results[0], `ordered query frame ${frame}`); totals.bodyQueries++;
    }
    assert.deepEqual(facts(after), facts(before), `combined frame ${frame}`);
    const { system, NYC } = after, audit = NYC.__replay;
    totals.gaitUpdates += audit.updates.length; totals.solves += audit.solves.length;
    totals.resets += audit.resets.length; totals.drawPackets += audit.drawn.length;
    for (const [seed, , , , , , draw, timeBefore, timeAfter] of audit.updates) {
      totals[draw ? 'visible' : 'hidden']++;
      if (!draw && timeAfter !== timeBefore) totals.hiddenAdvanced++;
      if (visibility.has(seed) && visibility.get(seed) !== draw) totals.visibilityTransitions++;
      visibility.set(seed, draw);
    }
    for (const p of system.peds) {
      if (p.conversation) {
        totals.conversationPersonFrames++;
        if (!seenPairs.has(p.conversation)) { seenPairs.add(p.conversation); totals.pairStarts++; }
      }
      if (p.bumpOX || p.bumpOZ) totals.shovePersonFrames++;
      if (p.dodge) totals.dodgePersonFrames++;
      assert.ok(p.rig.pose.every(Number.isFinite), 'finite real gait output');
    }
    if (frame === 160) assert.ok(totals.pairStarts > 0, 'controlled real-track pair must start naturally');
    if (fixture && frame === 120) totals.dodgeReturned = system.peds[fixture.dodge].dodge === 0;
    if (impactFrame >= 0 && frame > impactFrame && frame < 360) {
      const p = system.peds[fixture.social];
      totals.shoveReturned ||= p.bumpCooldown === 0 && p.bumpOX === 0 && p.bumpOZ === 0;
    }
    assert.equal(system.cars.length + system.buses.length, totals.fleet); assert.equal(system.peds.length, totals.population);
    assert.ok(system.cars.some(v => v.dynamicBody.crashProfile?.length > 1), 'real vehicle slice profiles');
  }
  totals.routeRandomDraws = after.NYC.__replay.random.length; totals.socialRandomDraws = after.NYC.__replay.socialRandom.length;
  totals.finalBodyEpoch = after.system.bodyVersion();
  t.diagnostic(JSON.stringify({ totals, impactFrame, baselineSHA256: hashes[0], currentSHA256: hashes[1],
    scope: 'CPU real-data city/vehicle profiles/real gait; controlled impact callback, not controller admission; no GPU submissions' }));
  for (const key of ['visible', 'hidden', 'hiddenAdvanced', 'visibilityTransitions', 'pairStarts', 'conversationPersonFrames',
    'impactAccepted', 'cooldownRejected', 'impactConversationEnds', 'shovePersonFrames', 'dodgePersonFrames'])
    assert.ok(totals[key] > 0, `positive coverage: ${key}`);
  assert.equal(totals.dodgeReturned, true); assert.equal(totals.shoveReturned, true);
  assert.equal(totals.visible, totals.drawPackets);
  for (const file of paths) assert.equal(sha(read(file)), hashes[1][file], `current source stayed frozen: ${file}`);
});

test('explicit-site counters remove gait-array iteration and per-update hard arrays (not V8 object counts)', t => {
  function run(source) {
    const count = { iterators: 0, iteratorValues: 0, indexedValues: 0, hardArrays: 0 };
    const sites = {
      easing(values) {
        return new Proxy(values, { get(target, key) {
          if (key === Symbol.iterator) return () => {
            count.iterators++; const iterator = values[Symbol.iterator]();
            return { next() { count.iteratorValues++; return iterator.next(); }, return() { return { done: true }; } };
          };
          if (/^[0-5]$/.test(String(key))) count.indexedValues++;
          return Reflect.get(target, key);
        } });
      },
      hard(values) { count.hardArrays++; return values; }
    };
    const code = source.replaceAll('= gaitEase(dt);', '= allocationSites.easing(gaitEase(dt));')
      .replace('const hard = [Infinity, Infinity];', 'const hard = allocationSites.hard([Infinity, Infinity]);');
    const { PersonRig } = load(code, 'site-counts', { allocationSites: sites });
    const rigs = Array.from({ length: 16 }, () => { const r = new PersonRig(); r.reset(0, 0, 0, floor); return r; });
    for (let f = 0; f < 120; f++) for (const r of rigs) r.update(1 / 60, 0, (f + 1) * .02, 0, floor, null, 0, false);
    return { count, states: rigs.map(state) };
  }
  const a = run(baseline), b = run(current);
  assert.deepEqual(b.states, a.states);
  assert.deepEqual(a.count, { iterators: 1920, iteratorValues: 11520, indexedValues: 0, hardArrays: 1920 });
  assert.deepEqual(b.count, { iterators: 0, iteratorValues: 0, indexedValues: 11520, hardArrays: 0 });
  t.diagnostic(JSON.stringify({ baseline: a.count, current: b.count }));
});

test('optional warmed Node allocation sampling, uninstrumented source, ABBA order', {
  skip: process.env.SF_PEDESTRIAN_ALLOCATIONS !== '1' && 'Set SF_PEDESTRIAN_ALLOCATIONS=1; diagnostic only'
}, async t => {
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
    (error, value) => error ? reject(error) : resolve(value)));
  const results = [];
  try {
    await post('HeapProfiler.enable');
    for (const [round, variant] of ['baseline', 'current', 'current', 'baseline'].entries()) {
      const source = variant === 'baseline' ? baseline : current;
      const label = `sample-${round}-${variant}`, { PersonRig } = load(source, label);
      const rigs = Array.from({ length: 340 }, (_, i) => {
        const r = new PersonRig({ seed: i / 340, female: !!(i % 2) });
        r.reset(i, 0, 0, floor); return r;
      });
      const run = start => {
        for (let f = start; f < start + 600; f++) for (let i = 0; i < rigs.length; i++)
          rigs[i].update(1 / 60, i, f * .02, .02, floor, null, 0, i % 5 === 0);
      };
      run(0);
      await post('HeapProfiler.startSampling', { samplingInterval: 32768,
        includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
      // No forced GC, observers, state snapshots or source-counter wrappers inside the measured workload.
      run(600);
      const { profile } = await post('HeapProfiler.stopSampling');
      let allSelf = 0, fileSelf = 0, updateSelf = 0;
      const visit = node => {
        allSelf += node.selfSize;
        if (node.callFrame.url.endsWith(`sf-pedestrian-${label}.js`)) {
          fileSelf += node.selfSize;
          if (node.callFrame.functionName === 'update') updateSelf += node.selfSize;
        }
        for (const child of node.children) visit(child);
      };
      visit(profile.head);
      results.push({ round, variant, updates: 600 * 340, allSelf, fileSelf, updateSelf, samples: profile.samples.length,
        sourceSha256: sha(source), profileSha256: sha(JSON.stringify(profile)) });
      assert.ok(allSelf > 0 && profile.samples.length > 0, 'profiler collected real samples');
    }
  } finally { session.disconnect(); }
  t.diagnostic(JSON.stringify({ node: process.version, v8: process.versions.v8, interval: 32768, results }));
});
