import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { createBookingDirector } from '../js/booking.js';
import { createChaseDirector } from '../js/nemesis-chase.js';
import { createSfBookingPlacement } from '../js/sf-booking-placement.js';
import { createEucDynamicWorld } from '../js/euc-dynamic.js';
import { findPlacementTarget, placementDepartureClear } from '../js/euc-recovery.js';

const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
function functionSource(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `host seam missing: ${start}`);
  return source.slice(a, b);
}

test('host keeps committed checkpoint during capture and saves actual pose only on successful exit', () => {
  const booking = createBookingDirector(), chase = createChaseDirector({ random: () => 0 });
  chase.state.phase = 'captured'; booking.start('Rider', 4);
  const entity = { position: { x: 12, y: 3, z: 22 }, heading: 1, riderId: 'rider' };
  const saved = [], calls = [], originalClearance = { minX: 1, maxX: 2, minZ: 3, maxZ: 4 };
  let clearance = originalClearance;
  let allowed = false;
  const manager = { getActiveEntity: () => entity, resetInput: () => calls.push('reset'),
    teleportActiveTo(x, z, heading, y, policy) {
      assert.deepEqual(policy, { exact: true, departure: 1.2 });
      if (!allowed) return { succeeded: false };
      Object.assign(entity.position, { x, y: y + 0.1, z }); entity.heading = heading;
      return { ...entity.position, succeeded: true };
    } };
  const placement = createSfBookingPlacement({ manager, booking, chase,
    intake: [{ x: 1, y: 2, z: 3, heading: 0 }], release: [{ x: 4, y: 5, z: 6, heading: 1 }] });
  const context = vm.createContext({ booking, placement, controllerManager: manager,
    playerState: { save: (pose, rider) => saved.push({ pose: { ...pose }, rider }) },
    trafficSystem: { setPresentationClearance: area => { clearance = area; calls.push('clearance'); } },
    nemesis: { hide: () => calls.push('hide') },
    bookingScene: { end: () => calls.push('end') }, cameraSystem: {
      setCinematic: () => calls.push('camera-clear'), resetForTeleport: () => calls.push('camera-reset') },
    touchControls: { reset() {} }, gamepadControls: { reset() {} }, selectCamera() {},
    bookingScreen: { update: () => calls.push('screen') }, syncLifecycle: () => calls.push('sync'),
    container: { focus: () => calls.push('focus') }, dirtyView: false, bookingClearancePending: true });
  vm.runInContext(functionSource('function savePlayerState()', '  const cameraSystem ='), context);
  vm.runInContext(functionSource('function finishBooking()', '    bookingScreen = new BookingScreen'), context);
  context.savePlayerState();
  assert.equal(saved.length, 0);
  assert.equal(context.finishBooking(), false);
  assert.equal(saved.length, 0); assert.equal(booking.active, true); assert.equal(chase.state.phase, 'captured');
  assert.equal(clearance, originalClearance, 'refused release must retain the staged clearance');
  assert.equal(context.bookingClearancePending, true);
  allowed = true;
  assert.equal(context.finishBooking(), true);
  assert.equal(booking.active, false); assert.equal(chase.state.phase, 'waiting');
  assert.equal(clearance, null);
  assert.equal(context.bookingClearancePending, false);
  assert.ok(calls.indexOf('clearance') < calls.indexOf('end'));
  assert.equal(chase.state.wait, 45, 'hide must not replace the release cooldown');
  assert.ok(calls.includes('hide'), 'skip before intake explicitly retires the still-active officer');
  assert.deepEqual(saved[0], { pose: { x: 4, y: 5.1, z: 6, heading: 1 }, rider: 'rider' });
  assert.ok(calls.indexOf('screen') < calls.indexOf('focus'));
});

test('real unstaged booking Skip hides the active rendered officer and audio while keeping cooldown', async () => {
  const url = path => new URL(path, import.meta.url).href;
  const runtime = readFileSync(new URL('../js/sf-nemesis.js', import.meta.url), 'utf8')
    .replace("from 'three/webgpu'", `from '${url('../vendor/three/build/three.webgpu.js')}'`)
    .replace("from 'three/tsl'", `from '${url('../vendor/three/build/three.tsl.js')}'`)
    .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${url('../js/' + path.slice(2))}'`);
  const sceneSource = readFileSync(new URL('../js/booking-scene.js', import.meta.url), 'utf8')
    .replace("from 'three/webgpu'", `from '${url('../vendor/three/build/three.webgpu.js')}'`)
    .replace("from './booking.js'", `from '${url('../js/booking.js')}'`);
  const { createSfNemesis } = await import(`data:text/javascript;base64,${Buffer.from(runtime).toString('base64')}`);
  const { createBookingScene } = await import(`data:text/javascript;base64,${Buffer.from(sceneSource).toString('base64')}`);
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 2, 0); camera.lookAt(0, 2, 1); camera.updateMatrixWorld(true);
    const player = { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0,
      controller: { crashed: false, placementSerial: 0, hardKnock: () => true } };
    const sampler = { sampleGround(x, z, out) { Object.assign(out, { height: 0, offCourse: false }); return out; },
      raycast: () => null, raycastObstacle: () => null, isVolumeClear: () => true };
    const cop = createSfNemesis({ scene, sampler, network: { edges: [], edgeY: () => 0 }, getPlayer: () => player, camera });
    cop.ambushSoon(); cop.update(0.05, true); cop.update(0.05, true); cop.director.state.phase = 'captured';
    const rig = scene.getObjectByName('nemesis-hover-wheel');
    assert.equal(rig.visible, true); assert.equal(cop.audioView.present, true);
    const stage = createBookingScene(scene, { x: 0, y: 0, z: 0, heading: 0 }, cop);
    stage.update(0, { phase: 'captured' }, 1); // scene has never staged the officer
    const booking = createBookingDirector(); booking.start('Rider', 4);
    const manager = { teleportActiveTo: () => ({ succeeded: true }), resetInput() {} };
    const placement = createSfBookingPlacement({ manager, booking, chase: cop.director,
      intake: [{ x: 1, y: 0, z: 1, heading: 0 }], release: [{ x: 2, y: 0, z: 2, heading: 0 }] });
    const clearanceWrites = [];
    const context = vm.createContext({ placement, booking, bookingScene: stage, nemesis: cop,
      trafficSystem: { setPresentationClearance: area => clearanceWrites.push(area) },
      cameraSystem: { setCinematic() {}, resetForTeleport() {} }, controllerManager: manager,
      touchControls: { reset() {} }, gamepadControls: { reset() {} }, selectCamera() {},
      bookingScreen: { update() {} }, syncLifecycle() {}, container: { focus() {} }, savePlayerState() {}, dirtyView: false,
      bookingClearancePending: true });
    vm.runInContext(functionSource('function finishBooking()', '    bookingScreen = new BookingScreen'), context);
    assert.equal(context.finishBooking(), true);
    assert.deepEqual(clearanceWrites, [null], 'unstaged Skip also clears presentation state');
    assert.equal(context.bookingClearancePending, false);
    assert.equal(rig.visible, false); assert.equal(cop.audioView.present, false);
    assert.equal(cop.director.state.phase, 'waiting');
    assert.ok(cop.director.state.wait >= 45 && cop.director.state.wait <= 100);
    stage.dispose(); cop.dispose();
  } finally { globalThis.document = previousDocument; }
});

test('host refuses the temporary desk stage for blocked volumes, moving actors or wrong floor', () => {
  let height = 5.89, clear = true, fullVolumeClear = true, vacant = true;
  const hulls = [], volumes = [];
  const sampler = { sampleGround: () => ({ height, offCourse: false }),
    findPlacementTarget: request => { hulls.push(request.hull); return clear ? { y: height } : null; },
    isVolumeClear: body => { volumes.push(body); return fullVolumeClear; } };
  const context = vm.createContext({ BOOKING_DESK: { x: -286.649, y: 5.89, z: 1535.154, heading: 0.78335 },
    controllerManager: { eucSampler: sampler }, dynamicWorld: { canPlace: () => vacant } });
  vm.runInContext(functionSource('function stagingClear()', '    function finishBooking()'), context);
  assert.equal(context.stagingClear(), true);
  clear = false; assert.equal(context.stagingClear(), false); clear = true;
  fullVolumeClear = false; assert.equal(context.stagingClear(), false); fullVolumeClear = true;
  vacant = false; assert.equal(context.stagingClear(), false); vacant = true;
  height = 10; assert.equal(context.stagingClear(), false);
  assert.equal(hulls[0].halfWidthMetres, 2.15); assert.equal(hulls[0].halfLengthMetres, 1.475);
  assert.equal(hulls[0].heightMetres, 2.4);
  assert.ok(Math.abs(volumes[0].minY - 5.29) < 1e-9);
});

test('presentation clearance starts only after checked transfer and persists until accepted release', () => {
  const desk = { x: -286.649, y: 5.89, z: 1535.154, heading: 0.78335 };
  const events = [], writes = [];
  let stageClear = false, transferAccepted = false, releaseAccepted = false, clearance = null;
  const context = vm.createContext({ BOOKING_DESK: desk, bookingScreen: { update() {} },
    stagingClear: () => { events.push('stage'); return stageClear; },
    placement: { transfer: () => { events.push('transfer'); return transferAccepted ? { succeeded: true } : null; },
      release: () => { events.push('release'); return releaseAccepted ? { succeeded: true } : null; } },
    trafficSystem: { setPresentationClearance(area) { events.push('clearance'); clearance = area; writes.push(area); } },
    booking: { state: { phase: 'captured' } }, bookingScene: { end: () => events.push('end') },
    nemesis: { hide: () => events.push('hide') }, cameraSystem: { setCinematic() {}, resetForTeleport() {} },
    controllerManager: { resetInput() {} }, touchControls: { reset() {} }, gamepadControls: { reset() {} },
    selectCamera() {}, syncLifecycle() {}, container: { focus() {} }, savePlayerState() {}, dirtyView: false,
    bookingClearancePending: true });
  vm.runInContext(functionSource('bookingScreen.transfer = () => {', '  }\n\n  function startBooking()'), context);
  vm.runInContext(functionSource('function finishBooking()', '    bookingScreen = new BookingScreen'), context);

  assert.equal(context.bookingScreen.transfer(), false);
  assert.deepEqual(events, ['stage']); assert.equal(writes.length, 0);
  stageClear = true; events.length = 0;
  assert.equal(context.bookingScreen.transfer(), false);
  assert.deepEqual(events, ['stage', 'transfer']); assert.equal(writes.length, 0);
  transferAccepted = true; events.length = 0;
  assert.equal(context.bookingScreen.transfer(), true);
  assert.deepEqual(events, ['stage', 'transfer', 'clearance']); assert.equal(writes.length, 1);

  // Independently rotate all four envelope corners; the actual AABB must contain
  // them with the full 0.8 m silhouette pad on every world-space side.
  const c = Math.cos(desk.heading), s = Math.sin(desk.heading), corners = [];
  for (const u of [-0.24 - 2.15, -0.24 + 2.15]) for (const v of [-0.825 - 1.475, -0.825 + 1.475]) {
    corners.push({ x: desk.x + c * u + s * v, z: desk.z - s * u + c * v });
  }
  const expected = { minX: Math.min(...corners.map(p => p.x)) - 0.8,
    maxX: Math.max(...corners.map(p => p.x)) + 0.8,
    minZ: Math.min(...corners.map(p => p.z)) - 0.8, maxZ: Math.max(...corners.map(p => p.z)) + 0.8 };
  for (const key of Object.keys(expected)) assert.ok(Math.abs(clearance[key] - expected[key]) < 1e-9, key);
  const stagedClearance = clearance;
  events.length = 0;
  assert.equal(context.finishBooking(), false);
  assert.equal(clearance, stagedClearance); assert.equal(writes.length, 1);
  assert.equal(context.bookingClearancePending, true);
  assert.deepEqual(events, ['release']);
  releaseAccepted = true; events.length = 0;
  assert.equal(context.finishBooking(), true);
  assert.equal(clearance, null); assert.equal(writes.length, 2);
  assert.equal(context.bookingClearancePending, false);
  assert.deepEqual(events.slice(0, 4), ['release', 'clearance', 'end', 'hide']);
});

test('terminal stop clears presentation and spawn protection synchronously before draining', async () => {
  const beforeNemesis = source.indexOf('  if (nemesis) {', source.indexOf('  titleScreen = new TitleScreen'));
  const start = source.lastIndexOf('  stopRuntime = async () => {', beforeNemesis);
  const end = source.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start);
  const stopSource = source.slice(start, end + '\n  };'.length);
  const events = [];
  let unblock;
  const drain = new Promise(resolve => { unblock = resolve; });
  const context = vm.createContext({ stopRuntime: null,
    bookingScreen: { dispose: () => events.push('screen') },
    trafficSystem: { setPresentationClearance: area => events.push(['clearance', area]) },
    clearBookingSpawnProtection: () => events.push('spawn'),
    controllerManager: { setInputEnabled() {}, dispose: () => events.push('controller') },
    gamepadControls: { setEnabled() {} }, touchControls: { setEnabled() {} },
    gameMenu: { dispose() {} }, titleScreen: { dispose() {} }, cameraSystem: { _clearPointers() {} },
    mapSystem: { isFullMapOpen: false, enabled: true }, setGameUIEnabled() {}, audioSystem: { dispose() {} },
    riderSelection: { dispose: () => { events.push('drain'); return drain; } }, compileWork: Promise.resolve() });
  vm.runInContext(stopSource, context);
  const done = context.stopRuntime();
  assert.deepEqual(events, ['screen', ['clearance', null], 'spawn', 'drain']);
  unblock(); await done;
  assert.deepEqual(events, ['screen', ['clearance', null], 'spawn', 'drain', 'controller']);
});

test('remote placement checks elevation and departure before installing spawn protection', () => {
  const calls = [], intake = { x: 1, z: 2 }, release = { x: 4, z: 5 };
  let previewY = 5, accepted = false;
  const manager = { findTeleportPosition: (...args) => { calls.push(['preview', ...args]); return { y: previewY }; },
    teleportActiveTo: (...args) => { calls.push(['commit', ...args]); return { succeeded: accepted }; } };
  const context = vm.createContext({ BOOKING_INTAKE: intake, BOOKING_DESK: { x: 1, z: 2 },
    controllerManager: manager, bookingSpawnProtected: false, bookingProtectedExit: null,
    trafficSystem: { setSpawnExclusions: exclusions => calls.push(['protect', exclusions]) } });
  vm.runInContext(functionSource('function checkedBookingTeleport(x, z, heading, y, policy)', '    const checkedManager ='), context);
  previewY = 9;
  assert.equal(context.checkedBookingTeleport(1, 2, 0, 5, { exact: true, departure: 1.2 }), null);
  assert.deepEqual(calls.map(c => c[0]), ['preview']);
  previewY = 5;
  assert.equal(context.checkedBookingTeleport(1, 2, 0, 5, { exact: true, departure: 1.2 }).succeeded, false);
  assert.equal(context.bookingSpawnProtected, false);
  accepted = true; calls.length = 0;
  assert.equal(context.checkedBookingTeleport(1, 2, 0, 5, { exact: true, departure: 1.2 }).succeeded, true);
  assert.equal(calls[0][5].departure, 0); assert.equal(calls[1][5].departure, 0);
  assert.equal(calls[2][0], 'protect'); assert.equal(context.bookingSpawnProtected, true);
  calls.length = 0;
  assert.equal(context.checkedBookingTeleport(release.x, release.z, 0, 5, { exact: true, departure: 0 }).succeeded, true);
  assert.equal(calls[0][5].departure, 1.2); assert.equal(calls[1][5].departure, 1.2);
  assert.equal(calls[2][1][1].x, release.x); assert.equal(calls[2][1][1].z, release.z);
  assert.equal(context.bookingProtectedExit.x, release.x); assert.equal(context.bookingProtectedExit.z, release.z);
});

test('bounded sidewalk exits try the next checked candidate and preserve active booking if all fail', () => {
  const constants = source.slice(source.indexOf('const BOOKING_DESK ='), source.indexOf('export async function initApp'));
  const { desk, intake, sites } = vm.runInNewContext(`${constants}\n({ desk: BOOKING_DESK, intake: BOOKING_INTAKE, sites: BOOKING_RELEASE_SITES })`);
  assert.equal(sites.length, 5);
  const origin = sites[0], sin = Math.sin(origin.heading), cos = Math.cos(origin.heading);
  for (const [index, site] of sites.entries()) {
    const dx = site.x - origin.x, dz = site.z - origin.z;
    assert.equal(site.y, origin.y); assert.equal(site.heading, origin.heading);
    assert.ok(Math.abs(dx * cos - dz * sin) < 1e-10, `candidate ${index} stays on sidewalk heading`);
    assert.ok(Math.hypot(dx, dz) <= 3.61);
  }
  for (const staged of [false, true]) {
    const booking = createBookingDirector(), chase = createChaseDirector({ random: () => 0 });
    booking.start('Rider', 4); if (staged) booking.arrive(); chase.state.phase = 'captured';
    const attempts = [], previews = [], exclusions = [], calls = [], clearanceWrites = [];
    const entity = { position: { x: 90, y: 12, z: 80 }, heading: 0, riderId: 'rider' };
    let allowedX = null;
    const manager = {
      getActiveEntity: () => entity,
      findTeleportPosition(x, z, heading, y, policy) { previews.push({ x, z, heading, y, ...policy }); return { y }; },
      teleportActiveTo(x, z, heading, y, policy) {
        attempts.push({ x, z, heading, y, ...policy });
        if (x !== allowedX) return { succeeded: false };
        Object.assign(entity.position, { x, y: y + 0.01, z }); entity.heading = heading;
        return { x, y: entity.position.y, z, succeeded: true };
      }, resetInput: () => calls.push('reset'),
    };
    const context = vm.createContext({ booking, BOOKING_DESK: desk, BOOKING_INTAKE: intake,
      controllerManager: manager, bookingSpawnProtected: staged, bookingProtectedExit: staged ? { x: intake.x, z: intake.z } : null,
      trafficSystem: { setSpawnExclusions: value => exclusions.push(value),
        setPresentationClearance: value => clearanceWrites.push(value) },
      bookingScene: { end: () => calls.push('end') }, nemesis: { director: chase, hide: () => calls.push('hide') },
      cameraSystem: { setCinematic() {}, resetForTeleport() {} }, touchControls: { reset() {} },
      gamepadControls: { reset() {} }, selectCamera() {}, bookingScreen: { update: () => calls.push('screen') },
      syncLifecycle() {}, container: { focus() {} }, savePlayerState: () => calls.push(['save', { ...entity.position }]),
      dirtyView: false, bookingClearancePending: true });
    vm.runInContext(functionSource('function checkedBookingTeleport(x, z, heading, y, policy)', '    const checkedManager ='), context);
    context.placement = createSfBookingPlacement({ manager: { teleportActiveTo: (...args) => context.checkedBookingTeleport(...args) },
      booking, chase, intake: [intake], release: sites });
    vm.runInContext(functionSource('function finishBooking()', '    bookingScreen = new BookingScreen'), context);
    assert.equal(context.finishBooking(), false);
    assert.equal(attempts.length, sites.length); assert.equal(previews.length, sites.length);
    assert.equal(booking.active, true); assert.equal(chase.state.phase, 'captured');
    assert.equal(exclusions.length, 0); assert.equal(calls.length, 0);
    assert.equal(clearanceWrites.length, 0, 'all refused exits retain any existing stage');
    assert.equal(context.bookingClearancePending, true);
    assert.equal(context.bookingSpawnProtected, staged);
    if (staged) assert.equal(context.bookingProtectedExit.x, intake.x);
    attempts.length = previews.length = 0; allowedX = sites[1].x;
    assert.equal(context.finishBooking(), true);
    assert.deepEqual(attempts.map(p => p.x), [sites[0].x, sites[1].x]);
    for (const call of [...previews, ...attempts]) {
      assert.equal(call.exact, true); assert.equal(call.departure, 1.2);
      assert.equal(call.heading, origin.heading); assert.equal(call.y, origin.y);
    }
    assert.equal(exclusions.length, 1); assert.equal(exclusions[0][1].x, sites[1].x);
    assert.deepEqual(clearanceWrites, [null]);
    assert.equal(context.bookingClearancePending, false);
    assert.equal(exclusions[0][1].z, sites[1].z); assert.equal(context.bookingProtectedExit.x, sites[1].x);
    assert.equal(booking.active, false); assert.equal(chase.state.phase, 'waiting');
    assert.equal(calls.filter(v => Array.isArray(v) && v[0] === 'save')[0][1].y, origin.y + 0.01);
  }
});

test('public app inspection object does not expose booking or nemesis controllers', () => {
  const start = source.indexOf('window.__NYC_APP = {'), end = source.indexOf('\n\n', start);
  assert.ok(start >= 0 && end > start);
  const api = source.slice(start, end);
  assert.doesNotMatch(api, /\b(?:nemesis|booking|bookingScene)\b/);
  assert.match(api, /controllerManager, cameraSystem/);
});

test('real SF placement and moving-body checks reject an occupied primary and admit the clear secondary', () => {
  const constants = source.slice(source.indexOf('const BOOKING_DESK ='), source.indexOf('export async function initApp'));
  const { desk, intake, sites } = vm.runInNewContext(`${constants}\n({ desk: BOOKING_DESK, intake: BOOKING_INTAKE, sites: BOOKING_RELEASE_SITES })`);
  const ground = (x, z, out) => { Object.assign(out, { height: sites[0].y, surface: 'pavement', offCourse: false });
    Object.assign(out.normal, { x: 0, y: 1, z: 0 }); return out; };
  const sampler = { sampleGround: ground, cityGround: ground, isOffLimits: () => false, isWater: () => false,
    isVolumeClear: () => true, raycastObstacle: () => null };
  let occupied = [sites[0]];
  const world = createEucDynamicWorld({ bodiesNear(x, z, radius, out) {
    for (const site of occupied) out.push({ x: site.x, z: site.z, headingY: site.heading,
      halfWidthMetres: 0.3, halfLengthMetres: 0.3, minY: site.y, maxY: site.y + 1.8,
      velocityX: 0, velocityZ: 0, kind: 'person' });
  } });
  let committed = null;
  const target = (x, z, heading, y) => findPlacementTarget(sampler, { x, z, headingY: heading, referenceY: y, registeredSurfaceOnly: true });
  const manager = {
    findTeleportPosition(x, z, heading, y) { return target(x, z, heading, y); },
    teleportActiveTo(x, z, heading, y, policy) {
      const p = target(x, z, heading, y);
      const clear = p && placementDepartureClear(sampler, p, { departure: policy.departure, registeredSurfaceOnly: true }, q =>
        world.canPlace({ reason: 'recover', body: { x: q.x, z: q.z, headingY: heading,
          halfWidthMetres: 0.35, halfLengthMetres: 0.5, minY: q.y, maxY: q.y + 1.9, floorY: q.y } }));
      if (!clear) return { succeeded: false };
      committed = { x: p.x, y: p.y, z: p.z }; return { ...committed, succeeded: true };
    },
  };
  const booking = createBookingDirector(), chase = createChaseDirector({ random: () => 0 });
  booking.start('Rider', 4); chase.state.phase = 'captured';
  const context = vm.createContext({ BOOKING_DESK: desk, BOOKING_INTAKE: intake, controllerManager: manager,
    bookingSpawnProtected: false, bookingProtectedExit: null, trafficSystem: { setSpawnExclusions() {} } });
  vm.runInContext(functionSource('function checkedBookingTeleport(x, z, heading, y, policy)', '    const checkedManager ='), context);
  const placement = createSfBookingPlacement({ manager: { teleportActiveTo: (...args) => context.checkedBookingTeleport(...args) },
    booking, chase, intake: [intake], release: sites });
  const result = placement.release();
  assert.equal(result.succeeded, true); assert.equal(committed.x, sites[1].x); assert.equal(committed.z, sites[1].z);
  assert.equal(chase.state.phase, 'waiting');
  booking.start('Rider', 4); chase.state.phase = 'captured'; occupied = sites; committed = null;
  assert.equal(placement.release(), null); assert.equal(committed, null);
  assert.equal(booking.state.phase, 'captured'); assert.equal(chase.state.phase, 'captured');
});

test('real traffic protects accepted jail sites on a remote focus jump without removing the pool', () => {
  const { loadTraffic } = createRequire(import.meta.url)('./helpers/traffic-harness.cjs');
  const { system } = loadTraffic({ seed: 3921 });
  const oldFocus = { x: -330, y: 0, z: -560 };
  const desk = { x: -286.649, z: 1535.154, radius: 6 };
  // A secondary exit, not the original survey point, owns the accepted exclusion.
  const exit = { x: -275.715 + Math.sin(0.78335) * 1.8, z: 1544.136 + Math.cos(0.78335) * 1.8, radius: 4 };
  system.update(0.05, 0.05, oldFocus, null, 'euc', null);
  const cars = [...system.cars, ...system.buses], peds = system.peds;
  const counts = [cars.filter(a => a.edge).length, peds.filter(a => a.placed).length];
  const positions = () => [...cars, ...peds].map(a => [a.x, a.z, a.edge, a.placed]);
  const before = positions();
  system.setSpawnExclusions([{ ...desk, radius: 10000 }]);
  system.update(0, 0.05, desk, null, 'euc', null);
  assert.deepEqual(positions(), before, 'failed spawn attempts keep every existing actor at its original position');
  system.update(0, 0.05, oldFocus, null, 'euc', null);
  const exclusions = [desk, exit];
  system.setSpawnExclusions(exclusions);
  exclusions[0] = { x: 0, z: 0, radius: 0 }; // API owns its copy
  system.update(0, 0.05, desk, null, 'euc', null);
  assert.ok(cars.filter(a => a.edge).length >= counts[0]);
  assert.ok(peds.filter(a => a.placed).length >= counts[1]);
  for (const v of cars.filter(a => a.edge)) for (const c of [desk, exit]) {
    assert.ok(Math.hypot(v.x - c.x, v.z - c.z) >= c.radius + Math.hypot(v.half, v.halfWidth) + 1);
  }
  for (const p of peds.filter(a => a.placed)) for (const c of [desk, exit]) {
    assert.ok(Math.hypot(p.x - c.x, p.z - c.z) >= c.radius + 1);
  }
  assert.throws(() => system.setSpawnExclusions([{ x: NaN, z: 0, radius: 1 }]));
  system.setSpawnExclusions();
});

test('spawn protection survives the old-camera frame and is retired after destination recycling or another teleport', () => {
  let clears = 0;
  const context = vm.createContext({ bookingSpawnProtected: true, booking: { active: false },
    bookingProtectedExit: { x: 4, z: 0 }, cameraSystem: { currentPos: { x: -99, z: 0 } },
    trafficSystem: { setSpawnExclusions: () => clears++ } });
  vm.runInContext(functionSource('function clearBookingSpawnProtection()', '  function listen('), context);
  context.retireBookingSpawnProtection({ position: { x: 4, z: 0 } });
  assert.equal(clears, 0, 'primary is near the camera, but the selected secondary exit is not');
  context.booking.active = true; context.cameraSystem.currentPos.x = 4;
  context.retireBookingSpawnProtection({ position: { x: 4, z: 0 } });
  assert.equal(clears, 0);
  context.booking.active = false;
  context.retireBookingSpawnProtection({ position: { x: 4, z: 0 } });
  assert.equal(clears, 1); assert.equal(context.bookingSpawnProtected, false); assert.equal(context.bookingProtectedExit, null);
  context.bookingSpawnProtected = true; context.bookingProtectedExit = { x: 4, z: 0 }; context.cameraSystem.currentPos.x = 500;
  context.retireBookingSpawnProtection({ position: { x: 500, z: 0 } });
  assert.equal(clears, 2); assert.equal(context.bookingSpawnProtected, false);
  context.bookingSpawnProtected = true; context.bookingProtectedExit = { x: 4, z: 0 };
  context.clearBookingSpawnProtection(); context.clearBookingSpawnProtection();
  assert.equal(clears, 3, 'teardown clears once'); assert.equal(context.bookingProtectedExit, null);
});

test('host gates capture before periodic saving and includes booking in paced rendering', () => {
  const loop = source.slice(source.indexOf('renderer.setAnimationLoop(now =>'));
  const rider = loop.indexOf('controllerManager.update(dt, elapsed)');
  const chaser = loop.indexOf('nemesis.update(dt, riding)');
  const capture = loop.indexOf('startBooking(); current = owner(); riding = false;');
  const save = loop.indexOf('if (riding && now >= nextPlayerSave)');
  assert.ok(rider >= 0 && rider < chaser && chaser < capture && capture < save);
  assert.match(loop, /current === 'booking'\)\s*&& framePacer\.shouldRender\(now\)/);
  assert.match(loop, /bookingSuspended \? 0 : dt/);
  assert.match(loop, /if \(bookingDt > 0\)/);
  assert.match(source, /bookingScreen\?\.dispose\(\); \/\/ synchronous/);
});

test('first staged view waits through suspended and zero-dt callbacks for a successful actor update', () => {
  const loopStart = source.indexOf('renderer.setAnimationLoop(now =>');
  const start = source.indexOf("      if (current === 'booking') {", loopStart);
  const end = source.indexOf('      mapSystem.update();', start);
  const renderStart = source.indexOf('      const renderFrame = ', end);
  const renderEnd = source.indexOf(';\n', renderStart);
  assert.ok(loopStart >= 0 && start > loopStart && end > start && renderStart > end && renderEnd > renderStart);
  const updateSource = source.slice(start, end);
  const renderSource = source.slice(renderStart, renderEnd + 1).replace('const renderFrame =', 'globalThis.renderFrame =');
  const events = [];
  let hasClearance = false, transfer = true, throwTraffic = false, pacerCalls = 0;
  const context = vm.createContext({ current: 'booking', riding: false, title: false, now: 1, dt: 0.016,
    bookingSuspended: false, bookingClearancePending: false, dirtyView: false, warmedUp: true, elapsed: 0,
    entity: {}, streetDetails: { signalClock: { value: 0 } },
    cameraSystem: { currentPos: {}, camera: { aspect: 1 }, resetForTeleport: () => events.push('camera-reset'),
      setCinematic() {}, update() {} },
    controllerManager: { getActiveEntity: () => ({}) },
    trafficSystem: { update: () => {
      events.push(hasClearance ? 'traffic-cleared' : 'traffic-old');
      if (throwTraffic) throw new Error('actor update failed');
    } },
    highwayTraffic: { update() {} }, transit: { update() {} },
    booking: { update: () => { if (!transfer) return null; transfer = false; return 'transfer'; }, state: { phase: 'intake' } },
    bookingScreen: { transfer: () => { events.push('transfer'); hasClearance = true; return true; }, update() {} },
    bookingScene: { update: () => ({}) }, framePacer: { shouldRender: () => { pacerCalls++; return true; } },
    document: { querySelector: () => ({}) } });
  vm.runInContext(updateSource, context);
  assert.deepEqual(events, ['traffic-old', 'transfer', 'camera-reset']);
  assert.equal(context.bookingClearancePending, true); assert.equal(context.dirtyView, true);
  vm.runInContext(renderSource, context);
  assert.equal(context.renderFrame, false, 'old pedestrian draw buffers cannot be submitted');
  assert.equal(pacerCalls, 0);

  context.bookingSuspended = true; events.length = 0;
  vm.runInContext(updateSource, context); vm.runInContext(renderSource, context);
  assert.deepEqual(events, []); assert.equal(context.bookingClearancePending, true); assert.equal(context.renderFrame, false);
  context.bookingSuspended = false; context.dt = 0;
  vm.runInContext(updateSource, context); vm.runInContext(renderSource, context);
  assert.deepEqual(events, []); assert.equal(context.bookingClearancePending, true); assert.equal(context.renderFrame, false);

  context.dt = 0.016; throwTraffic = true;
  assert.throws(() => vm.runInContext(updateSource, context), /actor update failed/);
  assert.equal(context.bookingClearancePending, true, 'an incomplete actor update cannot admit rendering');
  throwTraffic = false; events.length = 0;
  vm.runInContext(updateSource, context); vm.runInContext(renderSource, context);
  assert.deepEqual(events, ['traffic-cleared']);
  assert.equal(context.bookingClearancePending, false); assert.equal(context.renderFrame, true);
  assert.equal(pacerCalls, 1);
});

test('booking CSS gives both focused gamepad actions a visible outline independent of focus-visible', () => {
  const css = readFileSync(new URL('../css/booking.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  const focusRule = rules.find(([, selectors, declarations]) => selectors.includes('.booking-skip:focus-visible')
    && /outline\s*:\s*3px\s+solid/i.test(declarations));
  assert.ok(focusRule, 'shared visible focus rule is present');
  const selectors = focusRule[1];
  for (const action of ['skip', 'release']) {
    assert.match(selectors, new RegExp(`body\\[data-input=['"]gamepad['"]\\]\\s+\\.booking-overlay\\s+\\.booking-${action}:focus\\s*(?:,|$)`));
    assert.match(selectors, new RegExp(`\\.booking-${action}:focus-visible`));
  }
  assert.match(focusRule[2], /outline-offset\s*:\s*3px/i);
});

test('same booking suspension controls clock, audio and CSS, including blur without owner change', () => {
  const booking = createBookingDirector(); booking.start('Rider', 4); booking.arrive();
  const paused = [], flags = [];
  const context = vm.createContext({ booking, owner: () => 'booking', lastOwner: 'booking',
    bookingSuspended: false, windowFocused: true, document: { hasFocus: () => true },
    bookingScreen: { setSuspended: value => flags.push(value) }, audioSystem: { setPaused: value => paused.push(value) },
    lifecycleReady: true, resetFrameClock() {} });
  vm.runInContext(functionSource('function syncLifecycle()', '  function compileRider('), context);
  context.windowFocused = false;
  context.syncLifecycle();
  assert.equal(context.bookingSuspended, true); assert.equal(paused.at(-1), true); assert.equal(flags.at(-1), true);
  booking.update(context.bookingSuspended ? 0 : 2);
  assert.equal(booking.state.age, 0);
  context.windowFocused = true; context.syncLifecycle();
  assert.equal(context.bookingSuspended, false); assert.equal(paused.at(-1), false); assert.equal(flags.at(-1), false);
  booking.update(context.bookingSuspended ? 0 : 1);
  assert.equal(booking.state.age, 1);
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /data-suspended='true'\]\[data-signing='true'\][^}]+animation-play-state:\s*paused/);
});

test('refused remote transfer and Skip leave seeded real actor positions and RNG untouched, then retry succeeds', () => {
  const require = createRequire(import.meta.url);
  const { loadTraffic, available } = require('./helpers/traffic-harness.cjs');
  assert.ok(available, 'SF traffic fixture needs committed terrain');
  const { system, context: trafficContext } = loadTraffic({ seed: 3921 });
  const focus = { x: -330, y: 0, z: -560 };
  system.update(0.05, 0.05, focus, null, 'euc', null);
  const actors = [...system.cars, ...system.buses, ...system.peds];
  const snapshot = () => actors.map(a => [a.x, a.y, a.z, !!a.placed, !!a.edge]);
  const before = snapshot();
  let draws = 0;
  const random = trafficContext.Math.random;
  trafficContext.Math.random = () => { draws++; return random(); };
  const booking = createBookingDirector(), chase = createChaseDirector({ random: () => 0 });
  chase.state.phase = 'captured'; booking.start('Rider', 4);
  const desk = { x: -286.649, y: 5.89, z: 1535.154, heading: 0.78335 };
  const intake = { x: -285.59, y: 5.89, z: 1536.22, heading: 3.92 };
  const release = { x: -275.715, y: 5.988, z: 1544.136, heading: 0.78335 };
  let placementCalls = 0;
  let blocked = true;
  const controllerManager = { eucSampler: { findPlacementTarget: () => ({ y: desk.y }),
    sampleGround: () => ({ height: desk.y }), isVolumeClear: () => true },
    findTeleportPosition(x, z, heading, y) { placementCalls++; return { y }; },
    teleportActiveTo() { placementCalls++; return { succeeded: !blocked }; }, getActiveEntity: () => ({ position: { x: 0, y: 0, z: 0 } }) };
  const context = vm.createContext({ BOOKING_DESK: desk, BOOKING_RELEASE: release, bookingSpawnProtected: false, bookingProtectedExit: null, trafficSystem: system,
    BOOKING_INTAKE: intake, controllerManager, dynamicWorld: { canPlace: () => !blocked }, booking, nemesis: { director: chase, hide() {} },
    bookingScene: { end() {} }, cameraSystem: { setCinematic() {}, resetForTeleport() {} }, touchControls: { reset() {} },
    gamepadControls: { reset() {} }, selectCamera() {}, bookingScreen: { update() {} }, syncLifecycle() {},
    container: { focus() {} }, savePlayerState() {}, dirtyView: false, bookingClearancePending: false });
  vm.runInContext(functionSource('function checkedBookingTeleport(x, z, heading, y, policy)', '    const checkedManager ='), context);
  vm.runInContext(functionSource('function stagingClear()', '    function finishBooking()'), context);
  context.placement = createSfBookingPlacement({ manager: { teleportActiveTo: (...args) => context.checkedBookingTeleport(...args) },
    booking, chase, intake: [intake], release: [release] });
  vm.runInContext(functionSource('function finishBooking()', '    bookingScreen = new BookingScreen'), context);
  assert.equal(context.stagingClear(), false);
  assert.equal(context.placement.transfer(), null);
  assert.equal(context.finishBooking(), false);
  assert.equal(booking.state.phase, 'captured'); assert.equal(chase.state.phase, 'captured');
  assert.equal(placementCalls, 4); assert.equal(draws, 0); assert.deepEqual(snapshot(), before);
  blocked = false;
  assert.equal(context.stagingClear(), true);
  assert.ok(context.placement.transfer()?.succeeded);
  assert.equal(booking.state.phase, 'intake');
  assert.equal(draws, 0); assert.deepEqual(snapshot(), before, 'accepted handoff does not pre-update traffic');
  system.update(0, 0.05, desk, null, 'euc', null); // negative control: old host behavior
  assert.ok(snapshot().some((actor, i) => actor[0] !== before[i][0] || actor[2] !== before[i][2]));
  assert.ok(draws > 0, 'negative control exposes the destructive remote refresh');
});

test('conservative desk envelope contains every actual prop throughout the paper tear', async () => {
  const sceneSource = readFileSync(new URL('../js/booking-scene.js', import.meta.url), 'utf8')
    .replace("from 'three/webgpu'", `from '${new URL('../vendor/three/build/three.webgpu.js', import.meta.url).href}'`)
    .replace("from './booking.js'", `from '${new URL('../js/booking.js', import.meta.url).href}'`);
  const { createBookingScene } = await import(`data:text/javascript;base64,${Buffer.from(sceneSource).toString('base64')}`);
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try {
    const scene = new THREE.Scene(), stage = createBookingScene(scene, { x: 0, y: 0, z: 0, heading: 0 });
    for (let i = 0; i <= 100; i++) {
      stage.update(0.01, { phase: 'signature', age: 2.4 + 1.4 * i / 100 }, 1);
      stage.group.updateMatrixWorld(true);
      stage.group.traverse(object => {
        if (!object.isMesh || !object.visible) return;
        const box = new THREE.Box3().setFromObject(object);
        assert.ok(box.min.x >= -2.39 - 1e-6 && box.max.x <= 1.91 + 1e-6, `${object.name} X ${box.min.x}/${box.max.x}`);
        assert.ok(box.min.z >= -0.65 - 1e-6 && box.max.z <= 0.65 + 1e-6, `${object.name} Z ${box.min.z}/${box.max.z}`);
        assert.ok(box.min.y >= -0.01 - 1e-6 && box.max.y <= 2.15 + 1e-6, `${object.name} Y ${box.min.y}/${box.max.y}`);
      });
    }
    stage.dispose();
  } finally { globalThis.document = previousDocument; }
});

test('officer stage envelope contains the real visible posed rig and writing paddle', async () => {
  const url = path => new URL(path, import.meta.url).href;
  const runtime = readFileSync(new URL('../js/sf-nemesis.js', import.meta.url), 'utf8')
    .replace("from 'three/webgpu'", `from '${url('../vendor/three/build/three.webgpu.js')}'`)
    .replace("from 'three/tsl'", `from '${url('../vendor/three/build/three.tsl.js')}'`)
    .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${url('../js/' + path.slice(2))}'`);
  const { createSfNemesis } = await import(`data:text/javascript;base64,${Buffer.from(runtime).toString('base64')}`);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const player = { position: { x: 0, y: 0, z: 1.5 }, heading: Math.PI, speed: 0, controller: {} };
  const sampler = { sampleGround(x, z, out) { Object.assign(out, { height: 0, offCourse: false }); return out; },
    raycast: () => null, raycastObstacle: () => null, isVolumeClear: () => true };
  const cop = createSfNemesis({ scene, sampler, network: { edges: [], edgeY: () => 0 }, getPlayer: () => player, camera });
  cop.beginBooking(0, 0, -1.4, 0);
  const rig = scene.getObjectByName('nemesis-hover-wheel');
  for (let i = 0; i <= 140; i++) {
    cop.presentBooking(0.01, { x: -0.24, y: 1.03, z: 0, age: 1 + i * 0.01, writing: true, light: { x: 1, y: 2, z: 0 } });
    rig.updateMatrixWorld(true);
    rig.traverseVisible(object => {
      if (!object.isMesh) return;
      const box = new THREE.Box3().setFromObject(object, true);
      assert.ok(box.min.x >= -2.39 && box.max.x <= 1.91, `${object.name} X ${box.min.x}/${box.max.x}`);
      assert.ok(box.min.z >= -2.30 && box.max.z <= 0.65, `${object.name} Z ${box.min.z}/${box.max.z}`);
      assert.ok(box.min.y >= -0.6 && box.max.y <= 2.4, `${object.name} Y ${box.min.y}/${box.max.y}`);
    });
  }
  cop.dispose();
});
