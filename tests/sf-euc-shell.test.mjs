// Focused integration contracts, no renderer, workers, decoding or all-rider painting.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createPlayerState, PLAYER_STATE_KEY, PLAYER_STATE_VERSION } from '../js/player-state.js';
import { createViewPreferences, VIEW_STATE_KEY, SF_TIME_IDS } from '../js/view-preferences.js';
import { createFramePacer, createFrameRatePreference, FRAME_RATE_KEY } from '../js/frame-rate.js';
import { createRenderResolutionPreference, RENDER_RESOLUTION_KEY } from '../js/render-resolution.js';
import { createGraphicsQualityPreference, GRAPHICS_QUALITY_KEY } from '../js/graphics-quality.js';
import { SOUND_STATE_KEY } from '../js/audio-system.js';
import { getSfSpawn } from '../js/city-api.js';
import { CityAudioSources } from '../js/audio-sources.js';
import { CityAcoustics } from '../js/audio-acoustics.js';

const source = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const playable = id => ['cool-rider', 'trollina'].includes(id);
const pose = { x: -140, y: 156.25, z: 1700, heading: -0.7 };
function storage(entries = []) {
  const data = new Map(entries), writes = [];
  return { data, writes, getItem: key => data.get(key) ?? null,
    setItem(key, value) { writes.push([key, value]); data.set(key, value); } };
}

test('six save domains are isolated from NYC and each other', () => {
  const keys = [PLAYER_STATE_KEY, VIEW_STATE_KEY, FRAME_RATE_KEY, RENDER_RESOLUTION_KEY, SOUND_STATE_KEY, GRAPHICS_QUALITY_KEY];
  assert.equal(new Set(keys).size, 6);
  for (const key of keys) assert.ok(key.startsWith('euc-sanfrancisco-'));
  const store = storage([['euc-newyork-player-state', JSON.stringify({ version: 2, rider: 'trollina', euc: pose })],
    ['euc-newyork-graphics-quality', 'low']]);
  assert.equal(createPlayerState({ isPlayableRider: playable, getStorage: () => store }).rider, null);
  assert.equal(createGraphicsQualityPreference(() => store).value, 'high');
  assert.deepEqual(store.writes, []);
});

test('SF saves require finite XYZ and explicit Ride authorization, retaining refused/unknown bytes', () => {
  for (const euc of [pose, { ...pose, y: -2 }, { ...pose, y: 0 }]) {
    const raw = JSON.stringify({ version: PLAYER_STATE_VERSION, rider: 'trollina', euc });
    const store = storage([[PLAYER_STATE_KEY, raw]]);
    const state = createPlayerState({ isPlayableRider: playable, getStorage: () => store });
    assert.deepEqual(state.pose, euc);
    for (const result of [false, undefined, {}, Promise.resolve(true)]) assert.equal(state.restore(() => result), false);
    assert.equal(state.restore(() => true), true);
    assert.equal(state.save(pose, 'cool-rider'), false);
    assert.equal(store.data.get(PLAYER_STATE_KEY), raw);
    state.authorize();
    assert.equal(state.save(pose, 'cop'), false);
    assert.equal(state.save({ x: 1, z: 2, heading: 0 }, 'cool-rider'), false);
    assert.equal(state.save(pose, 'cool-rider'), true);
    assert.deepEqual(JSON.parse(store.data.get(PLAYER_STATE_KEY)), { version: PLAYER_STATE_VERSION, rider: 'cool-rider', euc: pose });
  }
  for (const record of [
    { version: 2, rider: 'cool-rider', euc: pose },
    { version: PLAYER_STATE_VERSION, rider: 'cool-rider', entities: { euc: pose } },
    ...[undefined, null, '0', Infinity].map(y => ({ version: PLAYER_STATE_VERSION, rider: 'cool-rider', euc: { ...pose, y } })),
    { version: PLAYER_STATE_VERSION, rider: 'cop', euc: pose }
  ]) {
    const raw = JSON.stringify(record), store = storage([[PLAYER_STATE_KEY, raw]]);
    const state = createPlayerState({ isPlayableRider: playable, getStorage: () => store });
    assert.equal(state.pose, null);
    assert.deepEqual(store.writes, []);
  }
});

test('view merges cross-tab choices, uses SF time IDs and blocked storage keeps settings usable', () => {
  const store = storage(), options = { cameraIds: ['chase', 'pov'], getStorage: () => store };
  const a = createViewPreferences(options), b = createViewPreferences(options);
  assert.deepEqual(SF_TIME_IDS, ['golden', 'midday', 'twilight', 'midnight']);
  assert.deepEqual(store.writes, []);
  a.setCamera('pov'); b.setTime('twilight');
  assert.deepEqual(JSON.parse(store.data.get(VIEW_STATE_KEY)), { version: 1, camera: 'pov', time: 'twilight' });
  b.setTime('night');
  assert.equal(b.time, 'twilight');
  const blocked = () => { throw Error('blocked'); };
  const player = createPlayerState({ isPlayableRider: playable, getStorage: blocked });
  player.authorize(); assert.equal(player.save(pose, 'trollina'), false);
  const view = createViewPreferences({ ...options, getStorage: blocked });
  view.setCamera('pov'); view.setTime('midnight');
  assert.equal(view.camera, 'pov'); assert.equal(view.time, 'midnight');
  const fps = createFrameRatePreference(blocked), resolution = createRenderResolutionPreference(blocked);
  assert.equal(fps.set('30'), true); assert.equal(fps.value, '30');
  assert.equal(resolution.set('50'), true); assert.equal(resolution.scale, 0.5);
});

test('FPS cap retains phase on fractional refresh, and discards stalls/resume debt', () => {
  for (const hz of [59.94, 120, 144]) for (const choice of ['auto', '120', '60', '30']) {
    const pacer = createFramePacer(choice);
    let count = 0;
    for (let i = 0; i <= hz * 10; i++) {
      if (pacer.shouldRender(Math.round((i * 1000 / hz + Math.sin(i) * 0.1) * 10) / 10)) count++;
    }
    const expected = (choice === 'auto' ? hz : Math.min(hz, Number(choice))) * 10;
    assert.ok(Math.abs(count - expected) <= 2, `${hz}/${choice}: ${count}`);
    assert.equal(pacer.shouldRender(100000), true);
    pacer.reset(); assert.equal(pacer.shouldRender(100001), true);
    assert.equal(pacer.shouldRender(NaN), false);
  }
});

test('Market spawn keeps actual city coordinates and elevation; missing terrain fails explicitly', () => {
  const arrival = { x: -12, z: 8, heading: 2.4 };
  const city = { TELEPORT_LOCATIONS: { market: arrival }, Terrain: { loaded: true, groundAt: () => 19.7 } };
  assert.deepEqual(getSfSpawn(city), { ...arrival, y: 19.7, referenceY: 19.7 });
  city.Terrain.loaded = false;
  assert.throws(() => getSfSpawn(city), /Load SF terrain/);
  assert.throws(() => getSfSpawn({}), /Market Street/);
});

function events() {
  const listeners = new Map();
  return { addEventListener(type, fn) { const list = listeners.get(type) ?? []; list.push(fn); listeners.set(type, list); },
    dispatch(type, event) { for (const fn of listeners.get(type) ?? []) fn(event); } };
}

function controllers() {
  const window = events(), document = { ...events(), hidden: false, activeElement: null };
  const city = { isTypingInField: e => e.target?.tagName === 'INPUT' };
  const code = source('controllers').replace(/^import[^;]+;\s*/gm, '')
    .replace('export { ThirdPersonControllerManager };', 'globalThis.Manager = ThirdPersonControllerManager;');
  const context = { window, document, getCity: () => city, isTypingInField: city.isTypingInField };
  vm.runInNewContext(code, context);
  const manager = Object.create(context.Manager.prototype);
  manager.inputEnabled = true;
  manager.keys = {};
  manager.entities = { euc: { clearInput() {} } };
  manager.bindKeyboard();
  return { manager, key(type, code, extra = {}) { window.dispatch(type, { code, target: { tagName: 'BODY' }, ...extra }); } };
}

test('independent device holds, subframe edges and touch cancellation retain native input semantics', () => {
  const { manager: m, key } = controllers();
  m.setTouchInput('forward', 0.4); m.setGamepadInput('forward', 0.7);
  key('keydown', 'KeyW'); key('keydown', 'ArrowUp'); key('keyup', 'KeyW');
  assert.equal(m.keys.forward, true);
  key('keyup', 'ArrowUp', { target: { tagName: 'INPUT' } }); assert.equal(m.keys.forward, 0.7);
  m.clearGamepadInput(); assert.equal(m.keys.forward, 0.4);
  key('keydown', 'Space'); key('keyup', 'Space');
  m.setTouchInput('up', true); m.setTouchInput('up', false);
  m.cancelTouchInput(); assert.equal(m.keys.hopPressed, true, 'keyboard tap survived touch resize cancellation');
  let frame;
  m.entities.euc.update = (_dt, keys) => { frame = { ...keys }; };
  m.update(0.016); assert.equal(frame.up, true); assert.equal(frame.hopPressed, true);
  m.update(0.016); assert.equal(frame.up, false); assert.equal(frame.hopPressed, false);
  m.resetInput(); key('keydown', 'Space', { repeat: true }); assert.equal(m.keys.up, false);
});

test('checked placement forwards exact SF XYZ layer, refuses without resetting input and returns XYZ status', () => {
  const { manager: m } = controllers();
  const calls = [], pos = { x: 12, y: 104, z: -4 };
  let allowed = false, resets = 0;
  m.resetInput = () => { resets++; };
  m.entities.euc = { position: pos, heading: 1.3, placeAt(...args) { calls.push(args); return allowed; } };
  m.eucSampler = { findPlacementTarget(query) { calls.push(query); return { x: query.x, y: 107.3, z: query.z }; } };
  let result = m.teleportActiveTo(-25000, 17000, 0.7, 107.3);
  assert.equal(result.succeeded, false); assert.equal(resets, 0);
  assert.equal(calls[0].x, -25000); assert.equal(calls[0].referenceY, 107.3);
  assert.equal(calls[1][3], 107.3); assert.equal(calls[1][4].requireClear, true);
  allowed = true; result = m.teleportActiveTo(-25000, 17000, 0.7, 107.3);
  assert.equal(result.succeeded, true); assert.equal(resets, 1); assert.equal(result.y, 104);
});

test('a transiently occupied teleport spot tries nearby checked spots on the same layer, bounded', () => {
  const { manager: m } = controllers();
  const places = [], pos = { x: 0, y: 0, z: 0 };
  let accept = 2;
  m.resetInput = () => {};
  m.entities.euc = { position: pos, heading: 0, placeAt(...args) { places.push(args); return places.length === accept; } };
  m.eucSampler = { findPlacementTarget: (q) => ({ x: q.x, y: q.referenceY, z: q.z }) };
  let result = m.teleportActiveTo(100, 200, 0.5, 30);
  assert.equal(result.succeeded, true);
  assert.deepEqual(places[0].slice(0, 4), [100, 200, 0.5, 30], 'exact checked spot first');
  assert.ok(Math.abs(Math.hypot(places[1][0] - 100, places[1][1] - 200) - 4) < 1e-9, 'then the nearest ring');
  assert.equal(places[1][2], 0.5); assert.equal(places[1][3], 30); assert.equal(places[1][4].requireClear, true);
  places.length = 0; accept = -1;
  result = m.teleportActiveTo(100, 200, 0.5, 30);
  assert.equal(result.succeeded, false); assert.equal(places.length, 8, 'bounded refusals, then report failure');
});

test('city audio uses SF logical heights, including below-zero roads and hills, with optional city systems', () => {
  const previous = globalThis.window;
  globalThis.window = { NYC: { Terrain: { groundAt: () => 125 }, CURB_H: 0.15,
    signalGroupPhase: () => 'green', walkSignal: () => true } };
  try {
    const car = { edge: { to: { signal: true, groupCount: 2 }, axisIndex: 0 }, x: 0, y: 125, z: 0, speed: 4, acc: 0, driver: { a: 1.6 }, bodyType: 'sedan', yaw: 0, yawOffset: 0 };
    const highway = { x: 0, y: -3, z: 0, v: 4, acc: 0, kind: 'sedan', yaw: 0 };
    const ped = { placed: true, x: 1, z: 1, v: 0, rig: { seed: 0.5, phase: 0 } };
    const trafficSystem = { cars: [car], peds: [ped], pedestrianGroundY: () => 125.15 };
    const sources = new CityAudioSources({ trafficSystem,
      highwayTraffic: { cars: [highway] } });
    const high = sources.collect({ x: 0, y: 126, z: 0 }, 1);
    assert.equal(high.motors.find(s => s.id === car).y, 125.7);
    assert.equal(high.people[0].y, 125.15); assert.equal(high.people[0].leftY, 125.15);
    delete trafficSystem.pedestrianGroundY;
    ped.dynamicBody = { minY: 128.4 };
    assert.equal(sources.collect({ x: 0, y: 126, z: 0 }, 1).people[0].y, 128.4);
    assert.equal(sources.collect({ x: 0, y: -2, z: 0 }, 1).motors.find(s => s.id === highway).y, -2.3);
    assert.equal(new CityAudioSources({}).collect({ x: 0, y: 0, z: 0 }, 0).motors.length, 0);
  } finally { globalThis.window = previous; }
});

test('SF acoustic outlines preserve concave courtyards and true building elevation', () => {
  const building = { minX: 0, maxX: 10, minZ: 0, maxZ: 10, minY: 120, maxY: 150,
    polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 10 }, { x: 0, z: 10 }] };
  const acoustics = new CityAcoustics({ nearColliders: () => [building] });
  acoustics.update({ x: -5, y: 125, z: 5 }, 0);
  assert.equal(acoustics.obstruction({ x: 12, y: 125, z: 5 }, { x: 3, y: 125, z: 5 }), 0, 'courtyard is not a solid rectangle');
  assert.ok(acoustics.obstruction({ x: 12, y: 125, z: 5 }, { x: -5, y: 125, z: 5 }) > 0.3);
  assert.equal(acoustics.obstruction({ x: 12, y: 110, z: 5 }, { x: -5, y: 110, z: 5 }), 0, 'below-base tunnel stays clear');
});

function mapPrototype() {
  const window = { NYC: { GEO: {}, ROADS: [], NYC_LANDMARKS: [], getLocationLabel: () => 'SF',
    TELEPORT_LOCATIONS: { market: { x: 1, z: 2, heading: 0 } } } };
  const document = { hidden: false, hasFocus: () => true };
  vm.runInNewContext(source('sf-map'), { window, document });
  const map = Object.create(window.NYC.NYCMapSystem.prototype);
  Object.assign(map, { waypoint: { x: 3, z: 4 }, elActionStatus: { textContent: '' },
    // This fixture bypasses the constructor; provide its view-cache memberships.
    fullStaticPlaced: [], fullStaticPins: [],
    layoutStatus() {}, renderFullMap() {} });
  return map;
}

test('map does not turn scenery/undefined/refused arrivals into success or redirect a raw click to Market', () => {
  const map = mapPrototype(), previous = map.waypoint, calls = [];
  for (const response of [undefined, false, {}, { succeeded: false }, Promise.resolve({ succeeded: true })]) {
    map.onTeleport = (...args) => { calls.push(args); return response; };
    assert.equal(map.teleportToPoint({ x: 15000, z: -9000 }), false);
    assert.equal(map.waypoint, previous);
    assert.match(map.elActionStatus.textContent, /no safe EUC arrival/);
    assert.deepEqual(calls.at(-1).slice(0, 4), [15000, -9000, undefined, undefined]);
    assert.deepEqual({ ...calls.at(-1)[4] }, { departure: 0, exact: false });
  }
  const landmark = { name: 'Overlook', arrival: { x: 17, z: 29, heading: -1, referenceY: 280 } };
  map.onTeleport = (...args) => { calls.push(args); return { succeeded: true, x: 18, y: 280, z: 30 }; };
  assert.equal(map.teleportToPoint({ x: 100, z: 200 }, landmark), true);
  assert.deepEqual(calls.at(-1).slice(0, 4), [17, 29, -1, 280]);
  assert.deepEqual({ ...calls.at(-1)[4] }, { departure: 0, exact: false });
  assert.equal(map.waypoint.x, 18); assert.equal(map.waypoint.name, 'Overlook');
});

test('map pad requires neutral before cursor/pan/zoom and activates a native control only once', () => {
  const map = mapPrototype(), calls = [];
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) };
  const button = { focus() { calls.push('focus'); }, click() { calls.push('click'); } };
  Object.assign(map, { fullCanvas: canvas, isFullMapOpen: true, inputDevice: 'gamepad', gamepadNeedsNeutral: true,
    gamepadCursor: { x: 400, y: 250 }, viewCenterX: 0, viewCenterZ: 0, viewZoom: 1,
    showGamepadCursor() {}, setInputDevice(device) { this.inputDevice = device; }, updateHoverInfo() {},
    modal: { contains: () => true }, canFocus: () => true });
  // Execute the production method in a dedicated context with controllable hit tests.
  const context = { window: { NYC: { GEO: {}, ROADS: [], NYC_LANDMARKS: [] } },
    document: { hidden: false, hasFocus: () => true, elementFromPoint: () => ({ closest: () => button }) } };
  vm.runInNewContext(source('sf-map'), context);
  const apply = context.window.NYC.NYCMapSystem.prototype.applyGamepadInput;
  apply.call(map, { actions: { activate: true }, movement: { x: 1 } }, 0.05);
  assert.deepEqual(calls, []); assert.equal(map.gamepadCursor.x, 400);
  apply.call(map, { neutral: true }, 0);
  apply.call(map, { movement: { x: 1 }, look: { x: 1 }, zoom: 1, actions: { activate: true } }, 0.05);
  assert.equal(map.gamepadCursor.x, 424); assert.equal(map.viewCenterX, 24);
  assert.ok(map.viewZoom > 1); assert.deepEqual(calls, ['focus', 'click']);
  map.touchPointers = new Set([1]); map.cancelPan = () => calls.push('cancelPan');
  map.cancelGestures();
  assert.equal(map.gamepadNeedsNeutral, true); assert.equal(map.touchPointers.size, 0); assert.equal(map.cancelTouchClick, true);
});

test('map modal restores pre-existing inertness and the keyboard invoker', () => {
  const map = mapPrototype(), calls = [], invoker = { focus() { calls.push('invoker'); } };
  const body = {}, siblingA = { inert: true }, siblingB = { inert: false };
  const parent = { parentElement: body };
  const modal = { parentElement: parent, classList: { toggle() {} },
    showModal() { calls.push('show'); }, close() { calls.push('close'); }, focus() { calls.push('modal'); } };
  parent.children = [modal, siblingA, siblingB]; body.children = [parent];
  const context = { window: { NYC: { GEO: {}, ROADS: [], NYC_LANDMARKS: [] } },
    document: { body, activeElement: invoker, getElementById: () => null, querySelectorAll: () => [] } };
  vm.runInNewContext(source('sf-map'), context);
  Object.assign(map, { modal, inertBackground: [], isFullMapOpen: false, resetGamepadInput() {},
    cancelGestures() {}, resizeFullCanvas() {}, searchHighlight: '', canFocus: el => el === invoker,
    controllerManager: { getActiveEntity: () => ({ position: { x: 1, z: 2 } }) } });
  const toggle = context.window.NYC.NYCMapSystem.prototype.toggleFullMap;
  toggle.call(map, true);
  assert.equal(siblingA.inert, true); assert.equal(siblingB.inert, true);
  toggle.call(map, true); assert.equal(map.inertBackground.length, 2, 'idempotent open');
  toggle.call(map, false);
  assert.equal(siblingA.inert, true); assert.equal(siblingB.inert, false);
  assert.deepEqual(calls, ['show', 'modal', 'close', 'invoker']);
});
