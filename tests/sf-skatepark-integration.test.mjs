// Focused CPU integration: actual Three paint buffers, published park arrivals and
// native static/dynamic placement owners. No renderer, browser or data regeneration.
// MIT, © 2026 VibezZzCoder. Retain ../LICENSE / ../NOTICE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { isCertifiedCompactSupport } from '../js/sf-support-store.js';
import * as physics from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { SIMULATION, INPUT } from '../js/euc/data/tuning.js';
import * as roster from '../js/euc-roster.js';
import { RiderPreparation, yieldRiderStage } from '../js/rider-preparation.js';
import { RiderTricks } from '../js/euc-tricks.js';
import * as nearSolids from '../js/euc/app/nearSolids.js';
import * as recovery from '../js/euc-recovery.js';
import { createEucDynamicWorld } from '../js/euc-dynamic.js';
import { createSkateparksWorld, worldPoint } from './helpers/sf-skateparks-world.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = name => read(`js/${name}.js`);
const moduleURL = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const threeURL = new URL('vendor/three/build/three.webgpu.js', root).href;
// Resolve browser import-map URLs only; use the unchanged production builders.
const geometryURL = moduleURL(source('sf-skatepark-geometry').replace("from 'three/webgpu'", `from '${threeURL}'`)
  .replace("from 'three/tsl'", `from '${new URL('../vendor/three/build/three.tsl.js', import.meta.url).href}'`));
const parkSource = source('sf-skateparks');
const { SF_SKATEPARKS, buildSFSkateparks, skateparkPaintIntervals } = await import(moduleURL(parkSource
  .replace("from 'three/webgpu'", `from '${threeURL}'`)
  .replace("from './sf-skatepark-geometry.js'", `from '${geometryURL}'`)
  .replace("from './sf-terrain-sampler.js'", `from '${new URL('js/sf-terrain-sampler.js', root).href}'`)
  .replace("from './euc-recovery.js'", `from '${new URL('js/euc-recovery.js', root).href}'`)));
const zion = SF_SKATEPARKS.find(s => s.id === 'zion');
const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon,
  `${actual} != ${expected} (±${epsilon})`);
const json = value => JSON.parse(JSON.stringify(value));
function disposeScene(scene, region) {
  region?.disposeTerrainCache();
  const resources = new Set();
  scene.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  for (const resource of resources) resource.dispose();
  scene.clear();
}

// The small sf-region-cache / sf-regional-surfaces fixture, translated to Zion.
// Only one 256m tile, one building/trunk/ferry/cargo ship; never draw the whole city.
function regionalPaint(roads, paintIntervals) {
  const x = zion.frame.x - 128, z = zion.frame.z - 128;
  const Terrain = { loaded: true, originX: x + 240, originZ: z + 240, w: 3, h: 3, cell: 2,
    waterLevel: -10, heights: new Float32Array(9).fill(84), patches: [] };
  const C = { x0: x, z0: z, x1: x + 256, z1: z + 256, step: 8, w: 33, h: 33,
    heights: Float32Array.from({ length: 1089 }, (_, i) => 82 + (i % 33) * .05 + Math.floor(i / 33) * .02),
    tiles: [{ x, z, w: 33, h: 33, size: 256 }] };
  const data = { city: C, horizon: { ...C, x0: x + 2000, z0: z + 2000, tiles: [] }, roads,
    mask: new Uint8Array(4096).fill(1), trees: new Float32Array([x + 200, 84, z + 200, 10]),
    buildings: [{ header: { originX: x, originZ: z }, records: new Int32Array([100, 100, 800, 900, 40, 60, 5000]) }],
    manifest: { mask: { originX: x, originZ: z, w: 64, h: 64 }, waterLevel: -10,
      ferries: [{ name: 'fixture ferry', speed: 4, pts: [[x, z], [x + 256, z + 256]] }], cargo: [[x + 200, z + 200]] } };
  const network = Object.freeze({ edges: Object.freeze([{ id: 7, sx: x, sz: z, dx: 1, dz: 0, len: 100 }]) });
  const actors = Object.freeze({ network, cars: Object.freeze([{ edge: network.edges[0], speed: 4 }]),
    peds: Object.freeze([{ edge: network.edges[0], placed: true }]) });
  const N = { THREE, TSL, Terrain, DATA: { fullRegion: data }, roadNetwork: network, trafficSystem: actors,
    cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } };
  const window = { NYC: N }, before = structuredClone({ data, Terrain, network, actors });
  new Function('window', source('sf-ride-geometry'))(window);
  new Function('window', 'location', source('region'))(window, { search: '' });
  const scene = new THREE.Scene(), region = N.buildSFRegion(scene, paintIntervals ? { paintIntervals } : undefined);
  assert.deepEqual({ data, Terrain, network, actors }, before, 'paint construction must not mutate source/actor inputs');
  assert.equal(N.roadNetwork, network); assert.equal(N.trafficSystem, actors); assert.equal(actors.cars[0].edge, network.edges[0]);
  return { N, scene, region, before };
}
function nonPaintState({ scene, region, N }) {
  const meshes = [];
  scene.traverse(o => {
    if (!o.isMesh || o.name.startsWith('SFRegionRoadPaint:')) return;
    meshes.push({ name: o.name, position: o.position.toArray(), scale: o.scale.toArray(), rotation: o.rotation.toArray(),
      visible: o.visible, count: o.count,
      attributes: Object.fromEntries(Object.entries(o.geometry.attributes).map(([key, a]) => [key, Array.from(a.array)])),
      index: o.geometry.index ? Array.from(o.geometry.index.array) : null,
      instances: o.instanceMatrix ? Array.from(o.instanceMatrix.array) : null });
  });
  return { meshes, ride: json(N.ride), stats: json(region.stats()), data: structuredClone(N.DATA), terrain: structuredClone(N.Terrain) };
}
function paintStrips(fixture) {
  const strips = [];
  fixture.scene.traverse(o => {
    if (!o.name.startsWith('SFRegionRoadPaint:')) return;
    const { position, uv } = o.geometry.attributes;
    assert.equal(position.count % 6, 0);
    for (let i = 0; i < position.count; i += 6) strips.push(Array.from({ length: 6 }, (_, j) => ({
      x: position.getX(i + j), y: position.getY(i + j), z: position.getZ(i + j),
      u: uv.getX(i + j), v: uv.getY(i + j) })));
  });
  return strips;
}
function retainedIntervals(strips) {
  const intervals = strips.map(vertices => [vertices[0].u * 8, vertices[2].u * 8]).sort((a, b) => a[0] - b[0]);
  const joined = [];
  for (const [a, b] of intervals) {
    assert.ok(b > a, 'no reversed or zero-length paint strip');
    if (joined.length && Math.abs(joined.at(-1)[1] - a) < 1e-4) joined.at(-1)[1] = b;
    else joined.push([a, b]);
  }
  return joined;
}
function intervalsNear(actual, expected) {
  assert.equal(actual.length, expected.length, `retained intervals: ${JSON.stringify(actual)}`);
  actual.forEach((p, i) => p.forEach((v, j) => near(v, expected[i][j], .00002)));
}
function checkPaintGeometry(strips, road) {
  const [ax, az, bx, bz] = road, length = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / length, dz = (bz - az) / length;
  for (const vertices of strips) {
    for (const p of vertices) {
      near((p.x - ax) * dx + (p.z - az) * dz, p.u * 8, .0006, 'UV phase is original segment distance');
      near(-(p.x - ax) * dz + (p.z - az) * dx, (p.v * 2 - 1) * .12, .0006);
      const u = (p.x - zion.frame.x + 128) / 8, v = (p.z - zion.frame.z + 128) / 8;
      // This fixture is an affine heightfield: paint must stay .08m above it after clipping.
      if (u >= 0 && u <= 32 && v >= 0 && v <= 32) near(p.y, 82 + u * .05 + v * .02 + .08, .00002);
    }
    near(Math.hypot(vertices[0].x - vertices[1].x, vertices[0].z - vertices[1].z), .24, .0006);
  }
}
const line = (u0, s0, u1, s1, frame = zion.frame) => {
  const a = worldPoint(frame, u0, s0), b = worldPoint(frame, u1, s1); return [a.x, a.z, b.x, b.z];
};

test('regional paint callback is optional and cannot change terrain, structures, scenery or actor graph inputs', () => {
  const roads = new Float64Array(line(0, -60, 0, 60));
  const baseline = regionalPaint(roads), identity = regionalPaint(roads, (_ax, _az, _dx, _dz, a, b) => [[a, b]]);
  const clipped = regionalPaint(roads, skateparkPaintIntervals);
  try {
    assert.deepEqual(paintStrips(identity), paintStrips(baseline), 'optional callback preserves legacy paint byte-for-byte');
    assert.deepEqual(nonPaintState(clipped), nonPaintState(baseline));
    assert.deepEqual(paintStrips(clipped), paintStrips(baseline), 'grass relocation retains every original paint triangle');
    for (const f of [baseline, clipped]) f.region.update({ position: { ...zion.frame, y: 100 } }, 2, zion.frame);
    assert.deepEqual(nonPaintState(clipped), nonPaintState(baseline), 'LOD/culling/ferry/cargo behavior is independent of paint cuts');
  } finally { for (const f of [baseline, identity, clipped]) disposeScene(f.scene, f.region); }
});

// Identity callback is deliberate: neither changed park bounds nor a future paint
// segment is permission to erase a road. Full production vertex/UV checks below.
for (const [name, road, expected] of [
  ['longitudinal', line(0, -60, 0, 60), [[0, 120]]],
  ['transverse', line(-35, 0, 35, 0), [[0, 70]]],
  ['reversed longitudinal', line(0, 60, 0, -60), [[0, 120]]],
  ['court edge', line(19.115, -60, 19.115, 60), [[0, 120]]],
  ['inside candidate bounds', line(0, -10, 0, 10), [[0, 20]]],
  ['unrelated UN plaza paint', line(0, -30, 0, 30, SF_SKATEPARKS[0].frame), [[0, 60]]]
]) test(`actual regional paint: ${name}; exact retained boundaries, width and unrestarted UV phase`, () => {
  const baseline = regionalPaint(new Float64Array(road)), clipped = regionalPaint(new Float64Array(road), skateparkPaintIntervals);
  try {
    const before = paintStrips(baseline), after = paintStrips(clipped);
    assert.ok(before.length > 0, 'control really constructs paint');
    intervalsNear(retainedIntervals(before), [[0, Math.hypot(road[2] - road[0], road[3] - road[1])]]);
    intervalsNear(retainedIntervals(after), expected);
    checkPaintGeometry(after, road);
    if (expected.length === 1) assert.deepEqual(after, before, 'paint outside Zion stays byte-identical');
  } finally { disposeScene(baseline.scene, baseline.region); disposeScene(clipped.scene, clipped.region); }
});

test('committed Waller and adjoining road linework retain all original paint after grass-side relocation', () => {
  const manifest = JSON.parse(read('data/region/manifest.json'));
  const bytes = readFileSync(new URL(manifest.roads.url, root)), offset = 8 + bytes.readUInt32LE(4);
  const roads = new Float32Array(bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + bytes.byteLength));
  let removed = 0, retained = 0;
  for (const id of [16307, 16308, 16309, 8921, 8922]) {
    const road = roads.slice(id * 4, id * 4 + 4);
    const baseline = regionalPaint(road), clipped = regionalPaint(road, skateparkPaintIntervals);
    try {
      const before = paintStrips(baseline), after = paintStrips(clipped);
      assert.ok(before.length > 0, `source segment ${id} control has paint`);
      checkPaintGeometry(after, road);
      const total = strips => retainedIntervals(strips).reduce((sum, [a, b]) => sum + b - a, 0);
      assert.deepEqual(after, before, `every road ${id} must retain every paint triangle`);
      removed += total(before) - total(after);
      retained += total(after);
    } finally { disposeScene(baseline.scene, baseline.region); disposeScene(clipped.scene, clipped.region); }
  }
  assert.equal(removed, 0, `road cut length ${removed}m`);
  assert.ok(retained > 50, 'outside and adjoining paint is retained');
});

function destinationCity() {
  const N = {}, context = vm.createContext({ window: { NYC: N } });
  for (const name of ['sf-geodata', 'sf-places', 'city-config', 'sf-destinations']) vm.runInContext(source(name), context);
  return N;
}
let parksPromise;
function parks() {
  return parksPromise ??= (async () => {
    const N = destinationCity(), beforeTerrain = N.SF_DESTINATIONS.filter(d => ['un-plaza', 'zion'].includes(d.id)).map(d => d.arrival);
    const world = await createSkateparksWorld({ buildNetwork: false });
    Object.assign(N, { THREE, TSL, Terrain: world.N.Terrain, DATA: world.N.DATA, ride: world.N.ride, RideGeometry: world.N.RideGeometry,
      cityUniforms: { uInteriorGlow: { value: 0 } } });
    const beforePublish = N.SF_DESTINATIONS.filter(d => ['un-plaza', 'zion'].includes(d.id)).map(d => d.arrival);
    const existing = () => json({ destinations: N.SF_DESTINATIONS.filter(d => !['un-plaza', 'zion'].includes(d.id)),
      pins: N.NYC_LANDMARKS.filter(d => !['un-plaza', 'zion'].includes(d.id)),
      teleports: Object.fromEntries(Object.entries(N.TELEPORT_LOCATIONS).filter(([id]) => !['un-plaza', 'zion'].includes(id))) });
    const original = existing(), scene = new THREE.Scene(), sites = buildSFSkateparks(scene, N);
    const sampler = new SfTerrainSampler({ city: N });
    disposeScene(scene);
    return { N, sites, sampler, beforeTerrain, beforePublish, original, after: existing() };
  })();
}

test('park destinations have no guessed arrival before construction; published actual floors feed independent pins and toolbar poses', async () => {
  const { N, sites, sampler, beforeTerrain, beforePublish, original, after } = await parks();
  assert.deepEqual(Array.from(beforeTerrain), [undefined, undefined]); assert.deepEqual(Array.from(beforePublish), [undefined, undefined]);
  assert.deepEqual(after, original, 'publishing parks must retain every existing destination/pin/toolbar record');
  assert.equal(new Set(N.SF_DESTINATIONS.map(d => d.id)).size, N.SF_DESTINATIONS.length);
  assert.equal(new Set(N.NYC_LANDMARKS.map(d => d.id)).size, N.NYC_LANDMARKS.length);
  for (const site of sites) {
    const destinations = N.SF_DESTINATIONS.filter(d => d.id === site.id), pins = N.NYC_LANDMARKS.filter(p => p.id === site.id);
    assert.equal(destinations.length, 1); assert.equal(pins.length, 1);
    const d = destinations[0], p = d.arrival, toolbar = N.TELEPORT_LOCATIONS[site.id];
    assert.ok([p.x, p.y, p.z, p.heading, p.referenceY].every(Number.isFinite));
    for (const key of ['x', 'y', 'z', 'heading', 'referenceY', 'exact', 'departure']) assert.equal(p[key], site.arrival[key]);
    assert.deepEqual(json(d.pin), site.pin); assert.deepEqual({ x: pins[0].x, z: pins[0].z }, site.pin);
    assert.notDeepEqual({ x: p.x, z: p.z }, site.pin, 'research pin is not silently relocated to the spine stand');
    assert.deepEqual(json(pins[0].arrival), json(p));
    assert.deepEqual([toolbar.x, toolbar.y, toolbar.z, toolbar.heading], [p.x, p.y, p.z, p.heading]);
    for (const arrival of [site.arrival, p, pins[0].arrival, toolbar]) {
      assert.equal(arrival.exact, true); assert.equal(arrival.departure, 1.2);
    }
    assert.equal(p.registeredSurfaceOnly, true); assert.equal(p.requireClear, true); assert.equal(p.requiresValidation, true);
    assert.notEqual(d.status, 'passed');
    const ground = sampler.sampleGround(p.x, p.z, { normal: {} }, p.referenceY);
    near(ground.height, p.y, 1e-9); assert.equal(ground.support.source, `skatepark:${site.id}:floor`);
    assert.deepEqual(N.getSFDestinationArrival(site.id, sampler), { x: p.x, y: p.y, z: p.z, headingY: p.heading });
    assert.equal(N.getSFDestinationArrival(site.id), null, 'metadata alone cannot approve placement');
  }
});

function mapFor(N) {
  // Search/pin/owner callbacks only: no DOM constructor or geographic canvas drawing.
  class Path2D { moveTo() {} lineTo() {} }
  const context = { window: { NYC: N }, Path2D };
  vm.runInNewContext(source('sf-map'), context);
  const map = Object.create(N.NYCMapSystem.prototype);
  Object.assign(map, { viewZoom: .2, waypoint: { x: 1, z: 2, name: 'previous' },
    elActionStatus: { textContent: '' }, layoutStatus() {}, renderFullMap() {} });
  return map;
}
test('map aliases find exactly one original geographic pin without invoking placement', async () => {
  const { N, sites } = await parks(), map = mapFor(N);
  map.onTeleport = () => assert.fail('search must not move a rider');
  for (const site of sites) for (const query of [site.name, ...site.aliases]) {
    const previous = map.waypoint;
    map.search(`  ${query.toUpperCase()}  `);
    assert.deepEqual(Array.from(map.searchResults, p => p.id), [site.id], query);
    assert.equal(map.viewCenterX, site.pin.x); assert.equal(map.viewCenterZ, site.pin.z); assert.equal(map.waypoint, previous);
  }
});

test('each park has one native toolbar action resolving to its own destination', async () => {
  const { N } = await parks(), html = read('index.html');
  const actions = [...html.matchAll(/<button\b[^>]*\bdata-teleport=["']([^"']+)["'][^>]*>/g)].map(m => m[1]);
  assert.equal(new Set(actions).size, actions.length, 'no duplicate toolbar destination actions');
  for (const id of ['un-plaza', 'zion']) {
    assert.equal(actions.filter(key => key === id).length, 1, `${id} native toolbar action`);
    assert.ok(N.TELEPORT_LOCATIONS[id]);
  }
});

// Same CPU host pattern as sf-rider-timing: replace visual/appearance services only.
// Placement, the manager, native controller, sampler and dynamic OBB admission stay real.
const noop = () => {};
function managerFor(N, sampler, spawn, dynamicWorld) {
  const bindings = { ...physics, ...roster, ...nearSolids, ...recovery, THREE, NEUTRAL_ACTIONS, SIMULATION, INPUT,
    RiderPreparation, yieldRiderStage, RiderTricks, getCity: () => N,
    createRidingRig: () => ({ group: new THREE.Group(), apply: noop, dispose: noop,
      setNearSolids: noop, setTrickPose: noop, setTuckPose: noop }),
    riderLook: noop, machineLook: noop, prepareAppearance: noop, releaseAppearanceCaches: noop,
    EUC_HEADLIGHT: {}, headlightBeamScale: () => 0, placeEucHeadlight: noop, createEucHeadlight: () => new THREE.SpotLight() };
  const riderSource = source('euc-rider').replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '').replace(/^export /gm, '');
  const createEucEntity = new Function(...Object.keys(bindings), riderSource + '\nreturn createEucEntity;')(...Object.values(bindings));
  const events = { addEventListener: noop, removeEventListener: noop };
  const managerSource = source('controllers').replace(/^import[^;]+;\s*/gm, '')
    .replace('export { ThirdPersonControllerManager };', 'return ThirdPersonControllerManager;');
  const Manager = new Function('createEucEntity', 'getCity', 'SfTerrainSampler', 'isCertifiedCompactSupport', 'window', 'document', managerSource)
    (createEucEntity, () => N, SfTerrainSampler, isCertifiedCompactSupport, events, { ...events, hidden: false });
  return new Manager(new THREE.Scene(), [], { sampler, spawn, dynamicWorld });
}

function uiFor(N, manager, map) {
  // Execute the actual main.js owner and toolbar binding, including the fifth
  // argument. Binding map directly to the manager would miss a dropped host policy.
  const main = source('main'), start = main.indexOf('  function teleportTo('), end = main.indexOf('  const mapSystem =', start);
  assert.ok(start >= 0 && end > start, 'bounded production teleport owner');
  const requests = [], effects = [], nativeTeleport = manager.teleportActiveTo.bind(manager);
  manager.teleportActiveTo = (...args) => { requests.push(args); return nativeTeleport(...args); };
  const owner = new Function('controllerManager', 'mapSystem', 'city', 'touchControls', 'gamepadControls', 'cameraSystem', 'selectCamera',
    'let dirtyView = false;\n' + main.slice(start, end) + '\nreturn { teleportTo, get dirtyView() { return dirtyView; } };')
    (manager, map, N, { reset: () => effects.push('touch') }, { reset: () => effects.push('gamepad') },
      { resetForTeleport: () => effects.push('camera') }, () => effects.push('select-camera'));
  map.onTeleport = owner.teleportTo;
  const buttons = [...read('index.html').matchAll(/<button\b[^>]*\bdata-teleport=["']([^"']+)["'][^>]*>/g)]
    .map(m => ({ dataset: { teleport: m[1] } }));
  const handlers = new Map(), toolbarStart = main.indexOf("  for (const button of document.querySelectorAll('[data-teleport]'))"),
    toolbarEnd = main.indexOf('  const fogSelect', toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart, 'bounded production toolbar binding');
  new Function('document', 'listen', 'city', 'teleportTo', 'closePopovers', main.slice(toolbarStart, toolbarEnd))
    ({ querySelectorAll(selector) { assert.equal(selector, '[data-teleport]'); return buttons; } },
      (button, event, callback) => { assert.equal(event, 'click'); handlers.set(button.dataset.teleport, callback); },
      N, owner.teleportTo, () => effects.push('close-popovers'));
  return { owner, requests, effects, clickToolbar(id) {
    const handler = handlers.get(id); assert.ok(handler, `${id} native toolbar binding`); handler();
  } };
}
function placementState(manager, map) {
  const entity = manager.entities.euc;
  return structuredClone({ controller: entity.controller.snapshot(), serial: entity.controller.placementSerial,
    revision: entity.controller.stateRevision, position: entity.position.toArray(), heading: entity.heading, speed: entity.speed,
    pose: entity.pose, events: entity.events, keys: manager.keys,
    tapped: Array.from(manager._tapped, ([action, sources]) => [action, Array.from(sources)]), waypoint: map.waypoint });
}
function primeRider(manager) {
  manager.setTouchInput('forward', .4); manager.update(.05); manager.setTouchInput('up', true);
  manager.entities.euc.events.push({ type: 'pending-arrival-test' });
}
function forwardPoint(arrival, distance) {
  return worldPoint({ x: arrival.x, z: arrival.z, theta: arrival.heading }, 0, distance);
}
function departureWall(arrival) {
  const p = forwardPoint(arrival, .92);
  return { centre: { ...p, y: arrival.y + 1 }, halfExtents: { x: 1, y: 1, z: .01 },
    rotationY: arrival.heading, support: false };
}
function assertParkRequest(request, arrival) {
  assert.deepEqual(request.slice(0, 4), [arrival.x, arrival.z, arrival.heading, arrival.y]);
  assert.deepEqual(json(request[4]), { departure: 1.2, exact: true }, 'UI and main must preserve the explicit park policy');
}

for (const id of ['un-plaza', 'zion']) test(`${id} map arrival obeys actual static and dynamic host refusal atomically`, async () => {
  const { N, sites, sampler } = await parks(), arrival = sites.find(s => s.id === id).arrival;
  const spawn = sites.find(s => s.id !== id).arrival, pin = N.NYC_LANDMARKS.find(p => p.id === id);
  // Local obstruction only: a lost exact flag would incorrectly allow a clear
  // four-metre fallback, so an oversized search-enclosing body cannot hide the bug.
  const box = { centre: { x: arrival.x, y: arrival.y + 1, z: arrival.z },
    halfExtents: { x: .2, y: 1, z: .2 }, rotationY: arrival.heading, support: false };
  const blocked = new SfTerrainSampler({ terrain: N.Terrain, data: N.DATA, ride: N.ride, boxes: [box] });
  assert.equal(N.getSFDestinationArrival(id, blocked), null);
  const body = { x: arrival.x, z: arrival.z, headingY: arrival.heading, halfWidthMetres: .2, halfLengthMetres: .1,
    minY: arrival.y, maxY: arrival.y + 1.9, velocityX: 0, velocityZ: 0, kind: 'person' };
  let queries = 0;
  const dynamicWorld = createEucDynamicWorld({ bodiesNear(_x, _z, _r, out) { queries++; out.push(body); } });
  for (const [label, support, moving] of [['static', blocked, undefined], ['dynamic', sampler, dynamicWorld]]) {
    const manager = managerFor(N, support, spawn, moving), map = mapFor(N), entity = manager.entities.euc;
    const ui = uiFor(N, manager, map);
    primeRider(manager);
    const before = placementState(manager, map), previous = map.waypoint;
    try {
      assert.equal(map.teleportToPoint(pin, pin), false, label);
      assertParkRequest(ui.requests[0], arrival);
      assert.deepEqual(placementState(manager, map), before); assert.equal(map.waypoint, previous);
      assert.deepEqual(ui.effects, []); assert.equal(ui.owner.dirtyView, false);
      assert.match(map.elActionStatus.textContent, /no safe EUC arrival/);
      if (moving) {
        assert.ok(queries > 0, 'native dynamic occupancy callback was actually queried');
        body.minY = arrival.y + 10; body.maxY = arrival.y + 13; // Same XZ on another floor cannot veto arrival.
        assert.equal(map.teleportToPoint(pin, pin), true);
        assert.deepEqual(entity.position.toArray(), [arrival.x, arrival.y, arrival.z]);
        assert.equal(entity.heading, arrival.heading); assert.equal(manager.keys.forward, false);
        assert.equal(entity.controller.placementSerial, before.serial + 1);
        assertParkRequest(ui.requests[1], arrival); assert.equal(ui.owner.dirtyView, true);
        assert.deepEqual({ x: map.waypoint.x, z: map.waypoint.z }, { x: arrival.x, z: arrival.z });
      }
    } finally { await manager.dispose(); disposeScene(manager.scene); }
  }
});

for (const id of ['un-plaza', 'zion']) test(`${id} real map and toolbar owners refuse a clear stand with blocked departure atomically`, async () => {
  const { N, sites, sampler } = await parks(), arrival = sites.find(s => s.id === id).arrival;
  const spawn = sites.find(s => s.id !== id).arrival, pin = N.NYC_LANDMARKS.find(p => p.id === id);
  for (const kind of ['static', 'dynamic']) for (const entry of ['map', 'toolbar']) {
    const support = kind === 'static' ? new SfTerrainSampler({ terrain: N.Terrain, data: N.DATA, ride: N.ride,
      boxes: [departureWall(arrival)] }) : sampler;
    const ahead = forwardPoint(arrival, 1.2), admissions = [];
    const occupant = { ...ahead, headingY: arrival.heading, halfWidthMetres: .2, halfLengthMetres: .1,
      minY: arrival.y, maxY: arrival.y + 1.9, velocityX: 0, velocityZ: 0, kind: 'person' };
    const dynamicWorld = createEucDynamicWorld({ bodiesNear(_x, _z, _r, out) { if (kind === 'dynamic') out.push(occupant); } });
    const nativeCanPlace = dynamicWorld.canPlace;
    dynamicWorld.canPlace = request => {
      const allowed = nativeCanPlace(request);
      admissions.push({ reason: request.reason, x: request.body.x, z: request.body.z, allowed }); return allowed;
    };
    const manager = managerFor(N, support, spawn, dynamicWorld), map = mapFor(N), ui = uiFor(N, manager, map);
    const stand = support.findPlacementTarget(arrival);
    assert.ok(stand, `${kind}/${entry}: the exact standing footprint is clear`);
    const nearby = worldPoint({ x: arrival.x, z: arrival.z, theta: arrival.heading }, 4, 0);
    assert.ok(support.findPlacementTarget({ ...arrival, ...nearby }), 'a clear ring must not mask exact-site refusal');
    primeRider(manager); admissions.length = 0;
    const before = placementState(manager, map), previous = map.waypoint;
    try {
      if (entry === 'map') assert.equal(map.teleportToPoint(pin, pin), false, `${kind}/${entry}`);
      else ui.clickToolbar(id);
      assert.equal(ui.requests.length, 1); assertParkRequest(ui.requests[0], arrival);
      assert.deepEqual(placementState(manager, map), before, `${kind}/${entry}: refusal changes no rider/input/event/waypoint state`);
      assert.equal(map.waypoint, previous); assert.equal(ui.owner.dirtyView, false);
      assert.deepEqual(ui.effects, entry === 'toolbar' ? ['close-popovers'] : []);
      assert.equal(admissions[0].reason, 'recover'); assert.equal(admissions[0].allowed, true, 'live standing admission really passed');
      assert.ok(admissions.every(q => q.reason === 'recover'), 'departure failure never reaches native reset');
      if (kind === 'dynamic') {
        const veto = admissions.find(q => !q.allowed);
        assert.ok(veto, 'real dynamic OBB admission vetoes a forward sample');
        const distance = Math.hypot(veto.x - arrival.x, veto.z - arrival.z);
        assert.ok(distance > 0 && distance <= 1.200001);
      } else assert.equal(recovery.placementDepartureClear(support, stand, arrival), false, 'physical wall blocks only the departure');
    } finally { await manager.dispose(); disposeScene(manager.scene); }
  }
});

test('ordinary map clicks and non-exact destinations retain zero-departure legacy standing semantics through main', async () => {
  const { N, sites } = await parks(), arrival = sites[0].arrival, spawn = sites[1].arrival;
  const support = new SfTerrainSampler({ terrain: N.Terrain, data: N.DATA, ride: N.ride, boxes: [departureWall(arrival)] });
  const manager = managerFor(N, support, spawn), map = mapFor(N), ui = uiFor(N, manager, map);
  const point = { x: arrival.x, z: arrival.z, heading: arrival.heading, referenceY: arrival.y };
  const standing = support.findPlacementTarget(arrival);
  assert.ok(standing); assert.equal(recovery.placementDepartureClear(support, standing, arrival), false);
  try {
    for (const exact of [undefined, false, 'true', 1]) {
      const destination = { ...point, departure: 1.2, ...(exact === undefined ? {} : { exact }) };
      // A bare click and an ordinary authored proposal both have no explicit exact:true.
      const serial = manager.entities.euc.controller.placementSerial;
      assert.equal(map.teleportToPoint(destination), true, `raw map click exact=${String(exact)}`);
      assert.equal(map.teleportToPoint(point, { name: 'ordinary destination', arrival: destination }), true);
      for (const request of ui.requests.slice(-2)) assert.deepEqual(json(request[4]), { departure: 0, exact: false });
      assert.deepEqual(manager.entities.euc.position.toArray(), [arrival.x, arrival.y, arrival.z]);
      assert.equal(manager.entities.euc.controller.placementSerial, serial + 2);
    }
  } finally { await manager.dispose(); disposeScene(manager.scene); }
});

test('startup finalizes street/actor inputs and restores patched curbs before parks, then captures/releases the sampler registry', () => {
  const main = source('main');
  assert.match(main, /import\s*\{[^}]*buildSFSkateparks[^}]*skateparkPaintIntervals[^}]*\}\s*from\s*['"]\.\/sf-skateparks\.js['"]/);
  assert.match(main, /buildSFRegion\(scene,\s*\{\s*paintIntervals:\s*skateparkPaintIntervals\s*\}\)/);
  const calls = [/city\.buildRoadNetwork\(/, /city\.createTrafficSystem\(/, /cityGrid\.finishCurbSurfaces\(/,
    /finally\s*\{\s*city\.Terrain\.patchesEnabled\s*=\s*patchesEnabled/, /\bbuildSFSkateparks\(scene,\s*city\)/,
    /new ThirdPersonControllerManager\(/, /\.releaseConstructionRegistry\(city\.ride\)/];
  const positions = calls.map(pattern => { const m = pattern.exec(main); assert.ok(m, String(pattern)); return m.index; });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'parks must see final support and precede authoritative sampler/handoff');
  assert.equal([...main.matchAll(/\bbuildSFSkateparks\(scene,\s*city\)/g)].length, 1, 'one startup construction owner');
});
