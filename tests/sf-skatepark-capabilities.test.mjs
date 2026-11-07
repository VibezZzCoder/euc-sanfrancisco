// CPU-only selected-support/shell contracts adapted from reviewed NYC 7cf4ce7.
// No renderer, browser, GPU, global park bounds or production test hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { EucController, createPose } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { WHEEL, TERRAIN } from '../js/euc/data/tuning.js';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const poly = (x0 = -2, z0 = -2, x1 = 2, z1 = 2) => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }
];
const tagged = { feature: 'un-plaza:quarter', transition: true, restartsAtRest: true };
const top = (height = 34, extra = {}) => ({ poly: poly(), top: height, surface: 'pavement', ...extra });
const sample = () => ({ normal: {}, base: { normal: {} } });
function field(height = 30, dx = 0, dz = 0) {
  const x0 = -80, z0 = -80, step = 2, nx = 81, nz = 81;
  return { x0, z0, step, nx, nz, waterLevel: 0,
    heights: Float64Array.from({ length: nx * nz }, (_, i) => height + dx * (x0 + i % nx * step) + dz * (z0 + Math.floor(i / nx) * step)) };
}
const sampler = (options = {}) => new SfTerrainSampler({ terrain: field(), waterAt: () => false, ...options });
const geometrySource = readFileSync(new URL('../js/sf-ride-geometry.js', import.meta.url), 'utf8');
function registry() {
  const window = { NYC: {} };
  new Function('window', geometrySource)(window);
  return window.NYC;
}
function mesh(pos, matrix) {
  return { geometry: { attributes: { position: { count: pos.length / 3,
    getX: i => pos[i * 3], getY: i => pos[i * 3 + 1], getZ: i => pos[i * 3 + 2] } } },
  matrixWorld: matrix && { elements: matrix } };
}
function flags(s, x, z, y, transition, rest = transition) {
  assert.equal(s.transitionAt(x, z, y), transition, `transition at ${x},${y},${z}`);
  assert.equal(s.restartsAtRest(x, z, y), rest, `rest at ${x},${y},${z}`);
}

test('actual upward facets resolve slope metadata without changing support geometry, height or normal', () => {
  const N = registry(), R = N.RideGeometry;
  const pos = [0, 40, 0, 0, 40, 2, 2, 42, 0, // upward slope
    2, 42, 0, 2, 42, 2, 4, 42, 0, // level deck
    0, 40, 0, 2, 42, 0, 0, 40, 2, // underside
    0, 40, 0, 0, 42, 0, 0, 40, 2]; // vertical face
  const capabilities = { ...tagged, transition: 'slope' }, options = { capabilities, source: 'reviewed-profile', layered: true };
  const records = R.addTriangles(pos, null, 'brick', options);
  assert.equal(records.length, 2);
  assert.equal(records[0].capabilities.transition, true); assert.equal(records[1].capabilities.transition, false);
  assert.equal(records[0].source, options.source); assert.notEqual(records[0].capabilities, capabilities);
  assert.notEqual(records[0].capabilities, records[1].capabilities); assert.equal(capabilities.transition, 'slope');
  const plain = registry().RideGeometry.addTriangles(pos, null, 'brick', { layered: true });
  assert.deepEqual(records.map(({ capabilities, source, ...r }) => r), plain);
  const s = sampler({ city: N }), control = sampler({ tops: plain });
  for (const [x, z, y, transition] of [[0.5, 0.5, 40.5, true], [2.5, 0.5, 42, false]]) {
    flags(s, x, z, y, transition, true);
    const a = s.sampleGround(x, z, sample(), y), b = control.sampleGround(x, z, sample(), y);
    assert.equal(a.height, y); assert.equal(a.height, b.height); assert.deepEqual(a.normal, b.normal);
  }
  const flat = R.addTop(poly(10, 10, 12, 12), 45, 'wood', options);
  assert.equal(flat.capabilities.transition, false, 'a level explicit top has no transition slope');
  const sloped = R.addTop(poly(14, 10, 16, 12), 46, 'wood', { ...options, plane: { x: 14, y: 45, z: 10, dx: 0.5, dz: 0 } });
  assert.equal(sloped.capabilities.transition, true);
});

test('mesh transforms determine the capability plane; global mesh tags do not create implicit bar bodies', () => {
  const N = registry(), R = N.RideGeometry, pos = [0, 0, 0, 0, 0, 2, 2, 0, 0];
  // World y = 40 + 0.5*xLocal + 1.2*zLocal, translated to x=20/z=30.
  const m = [1, 0.5, 0, 0, 0, 1, 0, 0, 0, 1.2, 1, 0, 20, 40, 30, 1];
  const result = R.addMesh(mesh(pos, m), 'pavement', { wheelSweep: true, capabilities: { ...tagged, transition: 'slope' } });
  assert.equal(result.tops.length, 1); assert.equal(N.ride.solids.length, 0);
  near(result.tops[0].plane.dx, 0.5); near(result.tops[0].plane.dz, 1.2);
  const s = sampler({ city: N }), g = s.sampleGround(20.5, 30.5, sample(), 40.85);
  near(g.height, 40.85); near(g.normal.y, 1 / Math.hypot(0.5, 1, 1.2));
  flags(s, 20.5, 30.5, 40.85, true);
});

test('coplanar merges retain metadata but near-coplanar slope-threshold crossings stay separate', () => {
  const options = { capabilities: { ...tagged, transition: 'slope' } };
  const R = registry().RideGeometry;
  const joined = R.addTriangles([0, 40, 0, 0, 40, 2, 2, 42, 0, 2, 42, 2], [0, 1, 2, 2, 1, 3], 'pavement', options);
  assert.equal(joined.length, 1); assert.equal(joined[0].poly.length, 4); assert.equal(joined[0].capabilities.transition, true);
  const lo = 0.999e-6, hi = 1.001e-6;
  const separate = registry().RideGeometry.addTriangles([0, 0, 0, 0, 0, 1, 1, lo, 0, 1, hi, 1], [0, 1, 2, 2, 1, 3], 'pavement', options);
  assert.equal(separate.length, 2);
  assert.deepEqual(separate.map(t => t.capabilities.transition), [false, true]);
});

test('capabilities require finite coordinates/reference Y and strict booleans within existing support reach', () => {
  const s = sampler({ tops: [top(34, { capabilities: tagged })] });
  flags(s, 0, 0, 34, true);
  for (const y of [undefined, NaN, Infinity, -Infinity, 33.399, 34.601, 0, 100]) flags(s, 0, 0, y, false);
  for (const bad of [undefined, NaN, Infinity, -Infinity]) {
    flags(s, bad, 0, 34, false); flags(s, 0, bad, 34, false);
  }
  assert.equal(s.restartsAtRest(), false);
  flags(s, 0, 0, 33.41, true); flags(s, 0, 0, 34.59, true);
  const narrow = sampler({ supportReach: 0.2, tops: [top(34, { capabilities: tagged })] });
  flags(narrow, 0, 0, 34.19, true); flags(narrow, 0, 0, 34.201, false);
  flags(sampler({ tops: [top(34, { capabilities: { transition: 'slope', restartsAtRest: 1 } })] }), 0, 0, 34, false);
  assert.equal(s.supportCapabilityAt('feature', 0, 0, 34), false);
});

test('stacked registered floors select independently; road/overhead references never borrow a park flag', () => {
  const s = sampler({ tops: [top(34, { capabilities: tagged, layered: true }), top(38, { layered: true })] });
  for (const y of [30, 38, 34, 30, 34, 38]) {
    assert.equal(s.sampleGround(0, 0, sample(), y).height, y);
    flags(s, 0, 0, y, y === 34);
  }
  const aboveOnly = sampler({ tops: [top(38, { layered: true, capabilities: tagged })] });
  flags(aboveOnly, 0, 0, 30, false); flags(aboveOnly, 0, 0, 38, true);
  assert.equal(aboveOnly.sampleGround(0, 0, sample(), 30).height, 30);
});

test('selected untagged facets, source-order ties and unregistered support overrides cannot inherit capabilities', () => {
  const feature = top(34, { capabilities: tagged });
  for (const other of [top(34.2), top(34)]) {
    flags(sampler({ tops: [feature, other] }), 0, 0, 34, false);
    if (other.top === 34) flags(sampler({ tops: [other, feature] }), 0, 0, 34, true);
  }
  const box = { centre: { x: 0, y: 33.3, z: 0 }, halfExtents: { x: 1, y: 1, z: 1 },
    rotationY: 0, surface: 'wood', support: true, capabilities: tagged };
  const prism = { outer: poly(-1, -1, 1, 1), minY: 32, maxY: 34.3, support: true, capabilities: tagged };
  for (const options of [{ boxes: [box] }, { prisms: [prism] }]) {
    const s = sampler({ tops: [feature], ...options }), g = s.sampleGround(0, 0, sample(), 34.3);
    near(g.height, 34.3); assert.equal(g.registered, false); flags(s, 0, 0, 34.3, false);
  }
  flags(sampler({ tops: [feature], boxes: [{ ...box, support: false }], prisms: [{ ...prism, support: false }] }), 0, 0, 34, true);
  flags(sampler({ terrain: field(34.2), tops: [feature] }), 0, 0, 34, false, false);
});

test('capabilities follow exact polygons/holes, dry registered support and existing bounded replacement rules', () => {
  const triangle = top(34, { poly: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }], capabilities: tagged });
  const s = sampler({ tops: [triangle] });
  flags(s, 1, 1, 34, true); flags(s, 3, 3, 34, false);
  const holed = sampler({ tops: [top(34, { capabilities: tagged, holes: [poly(-1, -1, 1, 1)] })] });
  flags(holed, 0, 0, 34, false); flags(holed, 1.5, 0, 34, true);
  flags(sampler({ tops: [top(34, { capabilities: tagged, water: true })] }), 0, 0, 34, false);
  const water = height => new SfTerrainSampler({ terrain: field(0), tops: [top(height, { capabilities: tagged })] });
  flags(water(0.01), 0, 0, 0.01, false); flags(water(4), 0, 0, 4, true);
  const replacement = sampler({ terrain: field(80), tops: [top(10, { capabilities: tagged,
    replacesTerrain: true, minReferenceY: 9, maxReferenceY: 10.3 })] });
  flags(replacement, 0, 0, 10, true); flags(replacement, 0, 0, 10.4, false); flags(replacement, 0, 0, 80, false);
  assert.equal(replacement.sampleGround(0, 0, sample(), 80).height, 80);
});

test('packed support metadata and ID-only capability index survive registry handoff and zero-cache queries', () => {
  const N = registry(), R = N.RideGeometry;
  const t = R.addTop(poly(), 35, 'brick', { capabilities: { ...tagged, transition: 'slope' },
    plane: { x: 0, y: 34, z: 0, dx: 0.5, dz: 0 }, source: 'un-plaza:actual-top' });
  const s = sampler({ city: N, topViewCacheSize: 0 });
  assert.equal(s.topStore.cacheStats.misses, 0, 'index construction must not materialize packed facets');
  assert.equal(s.capabilityIndex.items.store, s.topStore);
  assert.ok(s.capabilityIndex.items.ids instanceof Uint32Array);
  assert.deepEqual([...s.capabilityIndex.items.ids], [0]);
  assert.equal(s.releaseConstructionRegistry(N.ride), true);
  assert.equal(N.ride.tops.length, 0); assert.ok(Object.isFrozen(N.ride));
  t.poly = []; t.top = 100; t.plane.dx = 100;
  for (let i = 0; i < 8; i++) {
    flags(s, 0.5, 0, 34.25, true);
    const g = s.sampleGround(0.5, 0, sample(), 34.25);
    assert.equal(g.support.capabilities.feature, tagged.feature); assert.equal(g.support.source, 'un-plaza:actual-top');
    assert.equal(g.height, 34.25); assert.notEqual(g.support, t);
  }
  assert.equal(s.topStore.cacheStats.records, 0);
});

test('sparse capability rejection avoids all ordinary support work for distant/empty/wrong-floor probes', () => {
  const tops = Array.from({ length: 4096 }, (_, i) => top(30, { poly: poly(i * 16, 100, i * 16 + 1, 101) }));
  const triangle = [{ x: 1000000, z: 1000000 }, { x: 1000002, z: 1000000 }, { x: 1000000, z: 1000002 }];
  tops.push(top(34, { poly: triangle, capabilities: tagged }), top(34, { poly: poly(-1000001, -1000001, -1000000, -1000000), capabilities: tagged }));
  const s = sampler({ tops });
  assert.equal(s.capabilityIndex.stats.items, 2); assert.ok(s.capabilityIndex.stats.references <= 128);
  assert.equal(s.topStore.cacheStats.misses, 0);
  s.sampleGround = s.cityGround = s.topIndex.query = () => { throw Error('negative capability query did ordinary support work'); };
  for (let i = 0; i < 10000; i++) flags(s, 5, -1000 - i / 10, 30, false);
  flags(s, 1000003, 1000000, 34, false); // same sparse bucket, outside facet bounds
  flags(s, 1000001.5, 1000001.5, 34, false); // bounds only, outside actual triangle
  flags(s, 1000000.5, 1000000.5, 34.601, false);
  assert.equal(s.topStore.cacheStats.misses, 0);
});

test('inherited steep SF terrain/road normals and checked recovery stay ordinary despite nearby park metadata', () => {
  for (const dz of [0.75, -0.75, 1.2]) {
    const terrain = field(60, 0.2, dz);
    const s = sampler({ terrain, tops: [top(70, { poly: poly(10, 10, 12, 12), capabilities: tagged })] });
    const road = top(61, { plane: { x: 0, y: 61, z: 0, dx: 0.2, dz }, layered: true });
    const roadSampler = sampler({ terrain, tops: [road] });
    flags(s, 0, 0, 60, false); flags(roadSampler, 0, 0, 61, false);
    const g = s.sampleGround(0, 0, sample(), 60), r = roadSampler.sampleGround(0, 0, sample(), 61);
    assert.equal(g.height, 60); assert.equal(r.height, 61);
    for (const axis of ['x', 'y', 'z']) near(g.normal[axis], r.normal[axis], 1e-12);
    near(g.normal.y, 1 / Math.hypot(0.2, 1, dz));
    assert.ok(s.findPlacementTarget({ x: 0, z: 0, referenceY: 60, registeredSurfaceOnly: true }));
    const recovered = s.findRecoveryTarget({ fallen: { x: 0, y: 60.5, z: 0 }, safePoints: [] }, () => true);
    assert.ok(recovered); near(recovered.y, 60);
  }
});

test('unflagged SF hill fixed-step riding remains identical with optional contracts absent', () => {
  const terrain = field(60, 0, 0.75), a = sampler({ terrain }), b = sampler({ terrain });
  b.transitionAt = b.restartsAtRest = b.raycastWheelObstacle = undefined;
  const spawn = { position: { x: 0, y: 58.5, z: -2 }, headingY: 0 };
  const first = new EucController(a, { spawn }), second = new EucController(b, { spawn });
  const firstPose = createPose(), secondPose = createPose();
  for (let tick = 0; tick < 420; tick++) {
    const input = { ...NEUTRAL_ACTIONS, throttle: tick < 150 ? 0.35 : 0, hop: tick === 40, steer: tick > 80 && tick < 120 ? 0.2 : 0 };
    if (tick === 180) { first.hardKnock(0, 1); second.hardKnock(0, 1); }
    if (tick === 360) { first.recover(); second.recover(); }
    first.step(1 / 120, input); second.step(1 / 120, input);
    first.writePose(firstPose); second.writePose(secondPose);
    assert.deepEqual(first.snapshot(), second.snapshot(), `hill snapshot tick ${tick}`);
    assert.deepEqual(firstPose, secondPose, `hill pose tick ${tick}`);
  }
  assert.equal(first.wallTurnCount, 0); assert.equal(first.comeBackAirCount, 0);
});

test('local restart policy never bypasses checked body, dynamic occupancy or departure clearance', () => {
  const feature = top(30, { capabilities: { feature: 'zion:deck', restartsAtRest: true } });
  const request = { fallen: { x: 0, y: 30.5, z: 0 }, safePoints: [], headingY: 0 };
  const s = sampler({ tops: [feature] });
  flags(s, 0, 0, 30, false, true);
  assert.ok(s.findRecoveryTarget(request, () => true)); assert.equal(s.findRecoveryTarget(request, () => false), null);
  const roof = { centre: { x: 0, y: 31, z: 0 }, halfExtents: { x: 5, y: 0.1, z: 5 }, rotationY: 0, support: false };
  const blocked = sampler({ tops: [feature], boxes: [roof] });
  flags(blocked, 0, 0, 30, false, true);
  assert.equal(blocked.findPlacementTarget({ x: 0, z: 0, referenceY: 30 }), null);
  assert.equal(blocked.findRecoveryTarget(request, () => true), null);
});

const floor = 30;
const bar = { centre: { x: 0, y: floor + 0.42, z: 0 }, halfExtents: { x: 0.045, y: 0.045, z: 2 },
  rotationY: 0, surface: 'pavement', support: false, wheelSweep: true };
const railSampler = (tag = true) => sampler({ boxes: [{ ...bar, wheelSweep: tag }],
  tops: [top(floor, { poly: poly(-20, -20, 20, 20) }), top(floor + 0.465, { poly: poly(-0.045, -2, 0.045, 2) })] });

test('explicit actual bar tags survive addBox/addMesh bodies and city collider conversion, without implicit support', () => {
  const N = registry(), R = N.RideGeometry;
  const direct = R.addBox(bar.centre, bar.halfExtents, 0, { wheelSweep: true, source: 'un-plaza:bar' });
  const result = R.addMesh(mesh([0, 0, 0, 0, 0, 1, 1, 0, 0]), 'wood', { tops: false,
    bodies: [{ ...bar, centre: { ...bar.centre, x: 10 }, source: 'zion:bar' }] });
  assert.equal(direct.wheelSweep, true); assert.equal(direct.source, 'un-plaza:bar');
  assert.equal(result.solids[0].wheelSweep, true); assert.equal(result.solids[0].source, 'zion:bar');
  assert.ok(N.ride.solids.every(b => b.support === false)); assert.equal(N.ride.tops.length, 0);
  const converted = sampler({ colliders: [{ minX: -0.045, maxX: 0.045, minZ: -2, maxZ: 2,
    minY: floor + 0.375, maxY: floor + 0.465, wheelSweep: true }] });
  near(converted.raycastWheelObstacle({ x: -1, y: floor + 0.216001, z: 0 }, { x: 1, y: 0, z: 0 }, 2), 0.955);
});

test('tagged shell sweep is separate from ordinary rays, camera, support, standing volumes and ragdoll records', () => {
  const s = railSampler(), origin = { x: -1, y: floor + 0.216001, z: 0 }, dir = { x: 1, y: 0, z: 0 };
  assert.equal(s.raycastObstacle(origin, dir, 2), null); assert.equal(s.raycast(origin, dir, 2), null);
  near(s.raycastWheelObstacle(origin, dir, 2), 0.955);
  assert.equal(s.raycastWheelObstacle({ ...origin, y: floor + 1 }, dir, 2), null);
  assert.equal(railSampler(false).raycastWheelObstacle(origin, dir, 2), null);
  assert.equal(s.colliderCount, 1); assert.equal(s.stats.boxes, 1);
  const actual = s.boxRecords[0].collider, derived = s.wheelBoxes.colliders[0].collider;
  const reach = WHEEL.shellHeight - WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
  near(actual.centre.y, bar.centre.y); near(actual.halfExtents.y, bar.halfExtents.y);
  near(derived.centre.y - derived.halfExtents.y, actual.centre.y - actual.halfExtents.y - reach);
  assert.equal(s.sampleGround(0, 0, sample(), floor).height, floor + 0.465, 'actual registered bar cap, never its shell envelope');
  flags(s, 0, 0, floor + 0.465, false);
  const volume = { x: 0, z: 0, headingY: 0, halfWidthMetres: 0.02, halfLengthMetres: 0.02,
    minY: floor + 0.05, maxY: floor + 0.3, floorY: floor };
  assert.equal(s.isVolumeClear(volume), true); assert.equal(s.isVolumeClear({ ...volume, maxY: floor + 0.43 }), false);
  const q = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: floor + 0.2, maxY: floor + 0.3,
    recordOffset: 0, capacity: 2, records: new Float64Array(18) };
  s.raycastObstacle(origin, dir, 2, 0, undefined, undefined, undefined, q);
  assert.equal(q.count, 0, 'derived shell must not enter ragdoll broad phase');
  q.maxY = floor + 0.5;
  s.raycastObstacle(origin, dir, 2, 0, undefined, undefined, undefined, q);
  assert.equal(q.count, 1); assert.equal(q.records[2], bar.centre.y); assert.equal(q.records[5], bar.halfExtents.y);
});

test('ordinary nearer/tied hits retain metadata; wheel-only sparse lookup rejects remote sites', () => {
  const wall = { centre: { x: -1, y: floor + 1, z: 0 }, halfExtents: { x: 0.1, y: 1, z: 1 }, rotationY: 0, surface: 'wood' };
  const s = sampler({ boxes: [wall, bar] }), origin = { x: -2, y: floor + 0.216001, z: 0 }, dir = { x: 1, y: 0, z: 0 };
  const ordinary = { normal: {}, inside: false }, wheel = { normal: {}, inside: false };
  near(s.raycastObstacle(origin, dir, 3, 0, undefined, ordinary), 0.9);
  near(s.raycastWheelObstacle(origin, dir, 3, 0, undefined, wheel), 0.9);
  assert.deepEqual(wheel, ordinary);
  const tied = sampler({ boxes: [wall, { ...bar, centre: { ...bar.centre, x: -1.055 } }] });
  tied.raycastObstacle(origin, dir, 3, 0, undefined, ordinary);
  tied.raycastWheelObstacle(origin, dir, 3, 0, undefined, wheel);
  assert.deepEqual(wheel, ordinary);
  const distant = sampler({ boxes: [-1000000, 1000000].map(x => ({ ...bar, centre: { ...bar.centre, x, z: x } })) });
  assert.ok(distant.wheelIndex.stats.references <= 128); assert.equal(distant.wheelBoxes.gridStarts.length, 2);
  distant.wheelBoxes.raycastObstacle = () => { throw Error('remote shell query reached native narrow phase'); };
  assert.equal(distant.raycastWheelObstacle(origin, dir, 3), null);
});

test('wheel sweep retains fixed lateral axis, actual yaw and invalid-query rejection', () => {
  // Preserve native effectiveSweep: only compact bodies widen. Long beams do not.
  const s = sampler({ boxes: [{ ...bar, halfExtents: { ...bar.halfExtents, z: 0.15 } }] });
  const origin = { x: -1, y: floor + 0.216001, z: 0.25 }, dir = { x: 1, y: 0, z: 0 }, out = { normal: {} };
  assert.equal(s.raycastWheelObstacle(origin, dir, 2), null);
  near(s.raycastWheelObstacle(origin, dir, 2, 0.2, { x: 0, z: 1 }, out), 0.955);
  assert.deepEqual(out.normal, { x: -1, y: 0, z: 0 });
  assert.equal(s.raycastWheelObstacle(origin, dir, 2, 0.2, { x: 1, z: 0 }), null);
  assert.equal(railSampler().raycastWheelObstacle({ ...origin, z: 2.1 }, dir, 2, 0.2, { x: 0, z: 1 }), null);
  const angle = 0.7, c = Math.cos(angle), sn = Math.sin(angle), yawed = sampler({ boxes: [{ ...bar, rotationY: angle }] });
  near(yawed.raycastWheelObstacle({ x: -c, y: origin.y, z: sn }, { x: c, y: 0, z: -sn }, 2), 0.955);
  for (const [o, d, max] of [[origin, dir, Infinity], [origin, dir, NaN], [origin, dir, 0],
    [origin, { x: 0, y: 0, z: 0 }, 2], [{ ...origin, x: NaN }, dir, 2]]) {
    assert.equal(s.raycastWheelObstacle(o, d, max), null);
  }
});

for (const direction of [-1, 1]) test(`native SF controller stops outside an elevated tagged rail from side ${direction}`, () => {
  const c = new EucController(railSampler(), { spawn: { position: { x: -direction * 2, y: floor, z: 0 }, headingY: direction * Math.PI / 2 } });
  for (let i = 0; i < 720 && !c.crashed; i++) c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: 0.2 });
  const p = c.snapshot().position;
  assert.ok(direction * p.x <= -0.27, `wheel edge overlaps beam: ${p.x}`);
});

test('parallel standoff and timed charged hop preserve the finite actual rail envelope', () => {
  const standing = new EucController(railSampler(), { spawn: { position: { x: -0.2, y: floor, z: 0 }, headingY: 0 } });
  for (let i = 0; i < 120; i++) standing.step(1 / 120, NEUTRAL_ACTIONS);
  assert.ok(-standing.snapshot().position.x >= 0.28);
  const c = new EucController(railSampler(), { spawn: { position: { x: -8, y: floor, z: 0 }, headingY: Math.PI / 2 } });
  let hopped = false;
  for (let i = 0; i < 600 && !c.crashed; i++) {
    const hop = !hopped && c.snapshot().position.x > -1.8 && c.canAcceptHop;
    if (hop) hopped = true;
    c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: 0.35, crouch: !hopped, hop, hopHeld: hop });
    if (c.snapshot().position.x > 1) break;
  }
  assert.ok(hopped); assert.equal(c.crashed, false); assert.ok(c.snapshot().position.x > 1);
});
