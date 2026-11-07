// CPU-only arrival policy controls. Execute production manager/entity placement and native
// controller, SF sampler and dynamic OBB admission; substitute visual/appearance services only.
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
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { createEucDynamicWorld } from '../js/euc-dynamic.js';

const read = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const noop = () => {};
const policy = Object.freeze({ departure: 1.2, exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
}
const city = { cityUniforms: { uInteriorGlow: { value: 0 } } };
const bindings = {
  ...physics, ...roster, ...nearSolids, ...recovery, NEUTRAL_ACTIONS, SIMULATION, INPUT,
  THREE: { Vector3 }, RiderPreparation, yieldRiderStage, RiderTricks,
  createRidingRig: () => ({ group: { traverse: noop, removeFromParent: noop }, apply: noop, dispose: noop,
    setNearSolids: noop, setTrickPose: noop, setTuckPose: noop }),
  riderLook: noop, machineLook: noop, prepareAppearance: noop, releaseAppearanceCaches: noop,
  getCity: () => city, EUC_HEADLIGHT: {}, headlightBeamScale: () => 0, placeEucHeadlight: noop,
  createEucHeadlight: () => ({ position: new Vector3(), target: { position: new Vector3() } }),
};
const riderSource = read('euc-rider').replace(/^import .*;\n/gm, '')
  .replace(/^export \{.*\};\n/gm, '').replace(/^export /gm, '');
const createEucEntity = new Function(...Object.keys(bindings), `${riderSource}\nreturn createEucEntity;`)(...Object.values(bindings));
const managerSource = read('controllers').replace(/^import[^;]+;\s*/gm, '')
  .replace('export { ThirdPersonControllerManager };', 'return ThirdPersonControllerManager;');
const events = { addEventListener: noop, removeEventListener: noop };
const Manager = new Function('createEucEntity', 'getCity', 'SfTerrainSampler', 'window', 'document', managerSource)
  (createEucEntity, () => city, SfTerrainSampler, events, { ...events, hidden: false });

function sampler({ dx = 0, dz = 0, ...options } = {}) {
  return new SfTerrainSampler({ terrain: { originX: -512, originZ: -512, cell: 1024, w: 2, h: 2, waterLevel: 0,
    heights: [-512, 512].flatMap(z => [-512, 512].map(x => 10 + x * dx + z * dz)) },
  waterAt: () => false, ...options });
}
const obstacle = (x, z, hx = 0.2, hz = 0.2) => ({ centre: { x, y: 11, z },
  halfExtents: { x: hx, y: 1, z: hz }, rotationY: 0, surface: 'pavement', support: false });
const occupant = (x, z, y = 10) => ({ x, z, headingY: 0, halfWidthMetres: 0.2, halfLengthMetres: 0.1,
  minY: y, maxY: y + 1.9, velocityX: 0, velocityZ: 0, kind: 'person' });

function fixture(t, { support = sampler(), bodies = [], spawn = { x: -8, z: -8, heading: 0 } } = {}) {
  const admissions = [], notices = [], candidates = [], placements = [];
  const dynamicWorld = createEucDynamicWorld({ bodiesNear(_x, _z, _r, out) { out.push(...bodies); } });
  const canPlace = dynamicWorld.canPlace, didPlace = dynamicWorld.didPlace;
  dynamicWorld.canPlace = request => {
    admissions.push({ reason: request.reason, ...request.body });
    return canPlace(request);
  };
  dynamicWorld.didPlace = request => { notices.push(request.reason); return didPlace(request); };
  const y = support.sampleGround(spawn.x, spawn.z, { normal: {} }, Infinity).height;
  const manager = new Manager({ add: noop, remove: noop }, [], { sampler: support, spawn: { ...spawn, y }, dynamicWorld });
  t.after(() => manager.dispose());
  const entity = manager.entities.euc, find = support.findPlacementTarget.bind(support), place = entity.placeAt.bind(entity);
  support.findPlacementTarget = request => { candidates.push({ ...request }); return find(request); };
  entity.placeAt = (...args) => { placements.push(args); return place(...args); };
  assert.ok(entity.controller instanceof physics.EucController, 'native controller owns placement');
  // Leave nonzero native motion, held input, a queued press and an event to expose failed-placement mutation.
  manager.setTouchInput('forward', 0.4);
  manager.update(0.05);
  manager.setTouchInput('up', true);
  entity.events.push({ type: 'arrival-test' });
  admissions.length = notices.length = candidates.length = placements.length = 0;
  return { manager, entity, support, dynamicWorld, admissions, notices, candidates, placements };
}

function state({ manager, entity }) {
  return structuredClone({ controller: entity.controller.snapshot(), serial: entity.controller.placementSerial,
    revision: entity.controller.stateRevision, position: { ...entity.position }, heading: entity.heading, speed: entity.speed,
    pose: entity.pose, events: entity.events, keys: manager.keys,
    tapped: Array.from(manager._tapped, ([action, sources]) => [action, Array.from(sources)]) });
}
function refused(f, before, result) {
  assert.deepEqual(result, { ...before.position, succeeded: false });
  assert.deepEqual(state(f), before, 'refusal preserves native state, interpolation, queued events and input');
  assert.deepEqual(f.notices, [], 'no committed placement notification');
}
function onlyExact(f, x = 0, z = 0) {
  assert.equal(f.candidates.length, 1, 'no four-metre ring or farther fallback');
  assert.deepEqual([f.candidates[0].x, f.candidates[0].z], [x, z]);
  assert.ok(f.candidates[0].registeredSurfaceOnly);
}

test('valid standing pose with a static wall in front refuses exact 1.2 m departure atomically', t => {
  const f = fixture(t, { support: sampler({ boxes: [obstacle(0, 0.92, 1, 0.01)] }) });
  assert.ok(recovery.findPlacementTarget(f.support, { x: 0, z: 0, headingY: 0, referenceY: 10 }));
  assert.ok(recovery.findPlacementTarget(f.support, { x: 4, z: 0, headingY: 0, referenceY: 10 }), 'nearby ring is otherwise usable');
  const before = state(f);
  refused(f, before, f.manager.teleportActiveTo(0, 0, 0, 10, policy));
  onlyExact(f);
  assert.equal(f.placements.length, 1, 'native placeAt performs the departure preflight');
  assert.deepEqual(f.placements[0], [0, 0, 0, 10, { requireClear: true, departure: 1.2 }]);
});

test('static obstruction at the exact point refuses without offering a clear ring', t => {
  const f = fixture(t, { support: sampler({ boxes: [obstacle(0, 0)] }) });
  assert.ok(recovery.findPlacementTarget(f.support, { x: 4, z: 0, headingY: 0, referenceY: 10 }));
  const before = state(f);
  refused(f, before, f.manager.teleportActiveTo(0, 0, 0, 10, policy));
  onlyExact(f);
  assert.equal(f.placements.length, 0);
  f.candidates.length = 0;
  assert.equal(f.manager.findTeleportPosition(0, 0, 0, 10, policy), null);
  onlyExact(f);
});

test('live occupancy at an otherwise valid exact point refuses without a 4 m ring', t => {
  const f = fixture(t, { bodies: [occupant(0, 0)] }), before = state(f);
  refused(f, before, f.manager.teleportActiveTo(0, 0, 0, 10, policy));
  onlyExact(f);
  assert.equal(f.placements.length, 1);
  assert.equal(f.admissions.length, 1);
  assert.equal(f.admissions[0].reason, 'recover');
  assert.deepEqual([f.admissions[0].x, f.admissions[0].z], [0, 0]);
});

test('live occupancy only in front refuses exact departure before native reset', t => {
  const f = fixture(t, { bodies: [occupant(0, 1.2)] }), before = state(f);
  refused(f, before, f.manager.teleportActiveTo(0, 0, 0, 10, policy));
  onlyExact(f);
  assert.ok(f.admissions.length > 1, 'standing admission passed before a forward sample refused');
  assert.equal(f.admissions[0].z, 0);
  assert.ok(f.admissions.at(-1).z > 0 && f.admissions.at(-1).z <= 1.2);
  assert.ok(f.admissions.every(q => q.reason === 'recover'), 'reset is never reached');
});

test('clear exact arrival succeeds with native slope-following departure and reset/input discontinuity', t => {
  const f = fixture(t, { support: sampler({ dx: 0.2, dz: 0.15 }) });
  const x = 2, z = 3, heading = Math.PI / 2, y = f.support.sampleGround(x, z, { normal: {} }, Infinity).height;
  const serial = f.entity.controller.placementSerial;
  const result = f.manager.teleportActiveTo(x, z, heading, y, policy);
  assert.deepEqual(result, { x, y, z, succeeded: true });
  onlyExact(f, x, z);
  assert.deepEqual({ ...f.entity.position }, { x, y, z });
  assert.equal(f.entity.heading, heading); assert.equal(f.entity.speed, 0);
  assert.equal(f.entity.controller.placementSerial, serial + 1);
  assert.deepEqual(f.notices, ['reset']);
  assert.deepEqual(f.entity.events, []);
  assert.ok(Object.values(f.manager.keys).every(v => v === false));
  assert.equal(f.manager._tapped.size, 0);
  const departure = f.admissions.filter(q => q.reason === 'recover');
  assert.equal(departure.length, 7, 'origin plus six bounded 0.2 m forward samples');
  near(departure.at(-1).x, x + 1.2); near(departure.at(-1).z, z);
  near(departure.at(-1).minY, y + 0.24);
  assert.equal(f.entity.pose.x, x); assert.equal(f.entity.pose.y, y); assert.equal(f.entity.pose.z, z);
  f.entity.update(0, {});
  assert.deepEqual({ ...f.entity.position }, { x, y, z }, 'interpolation does not fly back from the former position');
});

test('same XZ occupancy on another floor does not veto a clear exact arrival', t => {
  const f = fixture(t, { bodies: [occupant(0, 0, 20)] });
  assert.deepEqual(f.manager.teleportActiveTo(0, 0, 0, 10, policy), { x: 0, y: 10, z: 0, succeeded: true });
  onlyExact(f);
});

test('omitted or zero departure preserves legacy standing placement beside a forward wall', t => {
  for (const options of [undefined, { exact: true }, { exact: true, departure: 0 }]) {
    const f = fixture(t, { support: sampler({ boxes: [obstacle(0, 0.92, 1, 0.01)] }) });
    assert.deepEqual(f.manager.teleportActiveTo(0, 0, 0, 10, options), { x: 0, y: 10, z: 0, succeeded: true });
    onlyExact(f);
    assert.equal(f.placements[0][4].departure, 0);
    assert.equal(f.admissions.filter(q => q.reason === 'recover').length, 1);
  }
});

test('finite short departure checks only the requested distance', t => {
  const f = fixture(t, { support: sampler({ boxes: [obstacle(0, 0.92, 1, 0.01)] }) });
  assert.deepEqual(f.manager.teleportActiveTo(0, 0, 0, 10, { exact: true, departure: 0.1 }),
    { x: 0, y: 10, z: 0, succeeded: true });
  onlyExact(f);
  assert.equal(f.placements[0][4].departure, 0.1);
  assert.deepEqual(f.admissions.filter(q => q.reason === 'recover').map(q => q.z), [0, 0.1]);
});

test('legacy static/dynamic refusal still searches the nearest four-metre ring on the same layer', t => {
  for (const setup of [{ support: sampler({ boxes: [obstacle(0, 0)] }) }, { bodies: [occupant(0, 0)] }]) {
    const f = fixture(t, setup);
    assert.deepEqual(f.manager.teleportActiveTo(0, 0, 0, 10), { x: 4, y: 10, z: 0, succeeded: true });
    assert.deepEqual(f.candidates.map(q => [q.x, q.z, q.referenceY]), [[0, 0, 10], [4, 0, 10]]);
    assert.ok(f.placements.every(p => p[4].requireClear && p[4].departure === 0));
  }
});

test('legacy live refusal retains the eight-placement attempt cap', t => {
  const body = { ...occupant(0, 0), halfWidthMetres: 260, halfLengthMetres: 260 };
  const f = fixture(t, { bodies: [body] }), before = state(f);
  refused(f, before, f.manager.teleportActiveTo(0, 0, 0, 10));
  assert.equal(f.placements.length, 8); assert.equal(f.candidates.length, 8);
  assert.ok(f.candidates.slice(1).every(q => Math.abs(Math.hypot(q.x, q.z) - 4) < 1e-9));
});

test('legacy static search retains 32 ordered samples per 4 m ring through the 256 m bound', () => {
  const support = sampler({ boxes: [obstacle(0, 0, 260, 260)] }), queries = [];
  const manager = Object.create(Manager.prototype), find = support.findPlacementTarget.bind(support);
  manager.eucSampler = support;
  support.findPlacementTarget = request => { queries.push({ ...request }); return find(request); };
  assert.deepEqual([...manager.teleportCandidates(0, 0, 0, 10)], []);
  assert.equal(queries.length, 1 + 64 * 32);
  assert.deepEqual([queries[0].x, queries[0].z], [0, 0]);
  for (let ring = 1; ring <= 64; ring++) for (let i = 0; i < 32; i++) {
    const q = queries[1 + (ring - 1) * 32 + i], angle = i * Math.PI / 16;
    near(q.x, Math.cos(angle) * ring * 4); near(q.z, Math.sin(angle) * ring * 4);
    assert.equal(q.headingY, 0); assert.equal(q.referenceY, 10);
  }
});

test('non-finite, negative, over-bound and nonnumeric departures fail closed before any query or fallback', t => {
  const f = fixture(t), before = state(f);
  for (const departure of [NaN, Infinity, -Infinity, -0.001, 1.200001, Number.MAX_VALUE, '1.2', null, true, {}, 1n, Symbol('departure')]) {
    for (const exact of [true, false]) {
      const invalid = { departure, exact };
      assert.deepEqual([...f.manager.teleportCandidates(0, 0, 0, 10, invalid)], []);
      assert.equal(f.manager.findTeleportPosition(0, 0, 0, 10, invalid), null);
      refused(f, before, f.manager.teleportActiveTo(0, 0, 0, 10, invalid));
    }
  }
  assert.deepEqual(f.candidates, []); assert.deepEqual(f.placements, []); assert.deepEqual(f.admissions, []);
});

test('fifth-argument exact policy also bounds the public static preview and candidate generator', t => {
  const f = fixture(t);
  const expected = { x: 0, y: 10, z: 0, headingY: 0 };
  assert.deepEqual([...f.manager.teleportCandidates(0, 0, 0, 10, policy)], [expected]);
  onlyExact(f);
  f.candidates.length = 0;
  assert.deepEqual(f.manager.findTeleportPosition(0, 0, 0, 10, policy), expected);
  onlyExact(f);
  assert.deepEqual(f.placements, []); assert.deepEqual(f.admissions, []);
});
