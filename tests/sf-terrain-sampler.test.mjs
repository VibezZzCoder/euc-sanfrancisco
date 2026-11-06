// Deterministic geometry/placement tests. No THREE, DOM, browser or downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SfTerrainSampler, boxesFromCityColliders } from '../js/sf-terrain-sampler.js';
import { findPlacementTarget, placementDepartureClear, findRecoveryTarget } from '../js/euc-recovery.js';
import { PlanTerrainSampler } from '../js/euc/simulation/planSampler.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import { CrashRagdoll } from '../js/euc/simulation/ragdoll.js';
import { WHEEL, TERRAIN } from '../js/euc/data/tuning.js';
import { contactBoxFace, contactCapsuleOverlapsBox, contactOrientedBoxContact } from '../js/euc/shared/ragdollContact.js';

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const poly = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const sample = () => ({ normal: {}, base: { normal: {} } });
const pose = (x, y, z, headingY = 0) => ({ x, y, z, headingY });
function field(height = 10, dx = 0, dz = 0, { x0 = -30, z0 = -30, cell = 2, w = 31, h = 31 } = {}) {
  return { originX: x0, originZ: z0, cell, w, h, waterLevel: 0,
    heights: Float64Array.from({ length: w * h }, (_, k) => height + dx * (x0 + k % w * cell) + dz * (z0 + Math.floor(k / w) * cell)) };
}
const sampler = (options = {}) => new SfTerrainSampler({ terrain: field(), waterAt: () => false, ...options });
const body = (x = 0, y = 10, z = 0) => ({ x, z, headingY: 0, halfWidthMetres: 0.35, halfLengthMetres: 0.5, minY: y + 0.03, maxY: y + 1.9 });

test('explicit city dependency seam, core NAVD88, normals and caller-owned base', () => {
  const city = { Terrain: field(124, 0.6, -0.25), ride: { tops: [], solids: [], prisms: [] }, DATA: {} };
  const s = new SfTerrainSampler({ city });
  const out = sample();
  assert.equal(s.sampleGround(3, -2, out, 126), out);
  near(out.height, 126.3); near(out.normal.x, -0.6 / Math.hypot(0.6, 1, 0.25));
  near(out.normal.z, 0.25 / Math.hypot(0.6, 1, 0.25)); near(out.base.height, out.height);
  const old = { ...out.normal }; s.sampleGround(0, 0, sample(), 124); assert.deepEqual(out.normal, old);
});

test('dry below-datum terrain remains negative with a land mask; water is never a lid', () => {
  const s = new SfTerrainSampler({ terrain: field(-2), data: { groundMask: {
    header: { originX: -30, originZ: -30, cell: 60, w: 1, h: 1, classes: ['asphalt'] }, mask: [0] } } });
  near(s.sampleGround(0, 0, sample(), -2).height, -2);
  assert.equal(s.isWater(0, 0, -2), false);
  near(findPlacementTarget(s, { x: 0, z: 0, referenceY: -2 }).y, -2);
  const bay = new SfTerrainSampler({ terrain: field(0) });
  near(bay.sampleGround(0, 0, sample(), 0).height, -4);
  assert.equal(bay.isWater(0, 0, 0), true);
});

test('saddle uses the drawn 00,01,10 diagonal on both sides, not bilinear or 00,11', () => {
  const s = sampler({ terrain: { originX: 0, originZ: 0, cell: 2, w: 2, h: 2, heights: [0, 2, 4, 20] } });
  const a = s.sampleGround(0.5, 0.5, sample()); near(a.height, 1.5);
  near(a.normal.x, -1 / Math.sqrt(6)); near(a.normal.z, -2 / Math.sqrt(6));
  const b = s.sampleGround(1.5, 1.5, sample()); near(b.height, 11.5);
  near(b.normal.x, -8 / Math.sqrt(146)); near(b.normal.z, -9 / Math.sqrt(146));
  near(s.raycast({ x: 0.5, y: 30, z: 0.5 }, { x: 0, y: -3, z: 0 }, 40), 28.5);
  near(s.raycast({ x: 1.5, y: 30, z: 1.5 }, { x: 0, y: -1, z: 0 }, 40), 18.5);
});

test('camera ray finds narrow exact support facets between terrain grid crossings', () => {
  const s = sampler({ terrain: field(10), tops: [{ poly: poly(1.45, -0.05, 1.55, 0.05), top: 11.5, surface: 'wood' }] });
  near(s.raycast({ x: 0, y: 13, z: 0 }, { x: 1, y: -1, z: 0 }, 10), 1.5 * Math.SQRT2);
  near(s.raycast({ x: 0, y: 13, z: 0.1 }, { x: 1, y: -1, z: 0 }, 10), 3 * Math.SQRT2);
  assert.equal(s.raycastObstacle({ x: 0, y: 13, z: 0 }, { x: 1, y: -1, z: 0 }, 10), null);
});

test('oblique camera terrain ray solves the same anti-diagonal triangle profile as support', () => {
  const s = sampler({ terrain: { originX: 0, originZ: 0, cell: 2, w: 2, h: 2, heights: [0, 2, 4, 20] } });
  // x=z=0.25+t/sqrt(6), y=8-2t/sqrt(6). On the second
  // triangle, terrain y=17*x-14, hence t=17.75*sqrt(6)/19.
  const distance = 17.75 * Math.sqrt(6) / 19;
  near(s.raycast({ x: 0.25, y: 8, z: 0.25 }, { x: 1, y: -2, z: 1 }, 10), distance);
});

test('core has priority, then ordered region patches, with sparse million-metre separation', () => {
  const terrain = field(15);
  terrain.patches = [
    { x0: 1000000, z0: -1000000, step: 8, nx: 2, nz: 2, h: [80, 88, 96, 104], rect: true },
    { x0: -100, z0: -100, step: 200, nx: 2, nz: 2, h: [3, 3, 3, 3], rect: true }
  ];
  const s = sampler({ terrain });
  near(s.sampleGround(0, 0, sample()).height, 15);
  near(s.sampleGround(70, 70, sample()).height, 3);
  near(s.sampleGround(1000004, -999996, sample()).height, 92);
  assert.ok(s.stats.indexReferences < 100);
  assert.equal(s.sampleGround(500000, 0, sample()).offCourse, true);
});

test('15 cm registered sidewalk preserves the native step-up limit and slope plane', () => {
  const s = sampler({ terrain: field(12, 0.2, 0.1), tops: [{ poly: poly(0, -20, 20, 20), top: 12.15,
    plane: { x: 0, y: 12.15, z: 0, dx: 0.2, dz: 0.1 }, surface: 'pavement' }] });
  const lo = s.sampleGround(-0.001, 0, sample(), 12), hi = s.sampleGround(0.001, 0, sample(), 12);
  near(hi.height - lo.height, 0.1504);
  assert.ok(0.15 < WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor);
  near(hi.normal.x, lo.normal.x); near(hi.normal.z, lo.normal.z);
  assert.equal(s.raycastObstacle({ x: -1, y: 12.4, z: 0 }, { x: 1, y: 0, z: 0 }, 3), null);
});

test('native controller traverses a registered 15 cm kerb without a hidden wall', () => {
  const s = sampler({ terrain: field(10), tops: [{ poly: poly(-20, 0, 20, 20), top: 10.15, surface: 'pavement' }] });
  const controller = new EucController(s, { spawn: { position: { x: 0, y: 10, z: -2 }, headingY: 0 } });
  const actions = { throttle: 0.45, steer: 0, crouch: false, hop: false, hopHeld: false, swing: false, reset: false };
  for (let i = 0; i < 420; i++) controller.step(1 / 120, actions);
  const result = controller.snapshot().position;
  assert.ok(result.z > 1, `kerb blocked controller at z=${result.z}`);
  near(result.y, 10.15, 0.03);
});

test('actual positive/negative building bases and roofs; polygon precedence over OBB bounds', () => {
  const converted = boxesFromCityColliders([
    { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: -12, maxY: -3 },
    { minY: 80, maxY: 140, obb: { cx: 4, cz: 0, hx: 1, hz: 2, cs: 0, sn: 1 } },
    { polygon: poly(8, -1, 9, 1), minY: 60, maxY: 132, obb: { cx: 8, cz: 0, hx: 3, hz: 3, cs: 1, sn: 0 } }
  ]);
  assert.equal(converted.length, 2); assert.equal(converted.prisms.length, 1);
  near(converted[0].centre.y, -7.5); near(converted[0].halfExtents.y, 4.5);
  near(converted[1].centre.y, 110); near(converted[1].halfExtents.y, 30);
  const s = sampler({ colliders: [{ polygon: poly(-2, -2, 2, 2), minY: 80, maxY: 140 }] });
  assert.equal(s.raycastObstacle({ x: -4, y: 79, z: 0 }, { x: 1, y: 0, z: 0 }, 10), null);
  near(s.raycastObstacle({ x: -4, y: 100, z: 0 }, { x: 1, y: 0, z: 0 }, 10), 2);
  near(s.sampleGround(0, 0, sample(), Infinity).height, 10); // solid caps are not registered roofs
});

test('sparse native narrow phase preserves yawed-box sweep, normal, inside exit and ragdoll records', () => {
  const boxes = [{ centre: { x: 2, y: 12, z: 0 }, halfExtents: { x: 0.1, y: 1, z: 0.1 }, rotationY: 0.4, surface: 'wood' }];
  const s = sampler({ boxes });
  const native = new PlanTerrainSampler({ segments: [], solids: boxes, hazards: [], surround: { height: 0, surface: 'pavement' },
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 2, rows: 2, heights: [0, 0, 0, 0], surfaces: ['pavement'] } });
  for (const origin of [{ x: 0, y: 12, z: 0.2 }, { x: 2, y: 12, z: 0 }, { x: 3, y: 10, z: 0 }]) {
    const a = { normal: {}, inside: false }, b = { normal: {}, inside: false };
    assert.equal(s.raycastObstacle(origin, { x: 1, y: 0, z: 0 }, 3, 0.26, undefined, a), native.raycastObstacle(origin, { x: 1, y: 0, z: 0 }, 3, 0.26, undefined, b));
    assert.deepEqual(a, b);
  }
  const out = { normal: {}, inside: false };
  s.raycastObstacle({ x: 2, y: 12, z: 0 }, { x: 1, y: 0, z: 0 }, 2, 0, undefined, out);
  const certificate = { colliderIndex: out.colliderIndex, normal: out.normal, faceOffset: out.faceOffset, slack: 0.01 };
  const dir = { ...out.normal };
  assert.equal(s.raycastObstacle({ x: 2, y: 12, z: 0 }, dir, 1, 0.08, undefined, undefined, certificate), null);
  const q = { minX: 1, maxX: 3, minY: 11, maxY: 13, minZ: -1, maxZ: 1, capacity: 4, recordOffset: 9, records: new Float64Array(45) };
  s.raycastObstacle({ x: 0, y: 12, z: 0 }, { x: 1, y: 0, z: 0 }, 3, 0, undefined, undefined, undefined, q);
  assert.equal(q.count, 1); assert.equal(q.fulfilled, true); near(q.records[10], 2); near(q.records[11], 12);
});

const courtyard = [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: 2, z: 4 }, { x: 2, z: -2 },
  { x: -2, z: -2 }, { x: -2, z: 4 }, { x: -4, z: 4 }];
test('concave courtyard is open for sweeps, camera rays and standing volumes', () => {
  const s = sampler({ colliders: [{ polygon: courtyard, minY: 10, maxY: 30 }] });
  assert.equal(s.raycastObstacle({ x: 0, y: 11, z: 5 }, { x: 0, y: 0, z: -1 }, 6), null);
  const out = { normal: {}, inside: false };
  near(s.raycastObstacle({ x: 0, y: 11, z: 5 }, { x: 0, y: 0, z: -1 }, 10, 0.3, { x: 1, z: 0 }, out), 7);
  assert.deepEqual(out.normal, { x: 0, y: 0, z: 1 });
  assert.equal(out.inside, false); near(out.faceOffset, -2);
  assert.equal(s.raycast({ x: 0, y: 11, z: 5 }, { x: 0, y: 0, z: -1 }, 6), null);
  assert.equal(s.isVolumeClear(body(0, 10, 0)), true);
  assert.equal(s.isVolumeClear(body(2.1, 10, 0)), false);
  assert.ok(findPlacementTarget(s, { x: 0, z: 0, referenceY: 10 }));
});

test('polygon sweep catches a wing with fixed lateral axis while a point ray remains clear', () => {
  const s = sampler({ prisms: [{ outer: poly(0, 0, 2, 2), minY: 10, maxY: 15 }] });
  const o = { x: -2, y: 11, z: -0.2 }, d = { x: 1, y: 0, z: 0 }, out = { normal: {}, inside: false };
  assert.equal(s.raycastObstacle(o, d, 5), null);
  near(s.raycastObstacle(o, d, 5, 0.3, { x: 0, z: 1 }, out), 2);
  assert.deepEqual(out.normal, { x: -1, y: 0, z: 0 });
});

test('polygon inside exit validates real finite face, rejects reentry, other walls and forged certificate', () => {
  const s = sampler({ colliders: [{ polygon: courtyard, minY: 10, maxY: 30 }] });
  const origin = { x: 2.1, y: 11, z: 1 }, out = { normal: {}, inside: false };
  near(s.raycastObstacle(origin, { x: -1, y: 0, z: 0 }, 6, 0, undefined, out), 0);
  assert.equal(out.inside, true); assert.deepEqual(out.normal, { x: -1, y: 0, z: 0 }); near(out.faceOffset, -2);
  const c = { colliderIndex: out.colliderIndex, normal: out.normal, faceOffset: out.faceOffset, slack: 0.01 };
  assert.equal(s.raycastObstacle(origin, { x: -1, y: 0, z: 0 }, 1, 0.08, undefined, undefined, c), null);
  assert.equal(s.raycastObstacle(origin, { x: -1, y: 0, z: 0 }, 6, 0.08, undefined, undefined, c), 0); // other wing
  assert.equal(s.raycastObstacle(origin, { x: -1, y: 0, z: 0 }, 1, 0.08, undefined, undefined, { ...c, faceOffset: -3 }), 0);
  const blocked = sampler({ colliders: [{ polygon: courtyard, minY: 10, maxY: 30 }],
    prisms: [{ outer: poly(1.5, 0.8, 1.7, 1.2), minY: 10, maxY: 20 }] });
  assert.equal(blocked.raycastObstacle(origin, { x: -1, y: 0, z: 0 }, 1, 0.08, undefined, undefined, c), 0);
});

test('polygon holes remain open, including bodies entirely inside a courtyard hole', () => {
  const s = sampler({ prisms: [{ outer: poly(-5, -5, 5, 5), holes: [poly(-2, -2, 2, 2)], minY: 10, maxY: 20 }] });
  assert.equal(s.isVolumeClear(body()), true);
  near(s.raycastObstacle({ x: 0, y: 11, z: 0 }, { x: 1, y: 0, z: 0 }, 6), 2);
  assert.equal(s.raycastObstacle({ x: 0, y: 11, z: 0 }, { x: 0, y: 1, z: 0 }, 15), null);
});

test('generator-owned ragdoll dispatch preserves exact concavity, capsule contacts and trunk planes', () => {
  const s = sampler({ prisms: [{ outer: courtyard, minY: 10, maxY: 30 }] });
  const q = { minX: -3, maxX: 3, minY: 10, maxY: 13, minZ: -3, maxZ: 3, capacity: 16, recordOffset: 0, records: new Float64Array(144) };
  s.raycastObstacle({ x: 0, y: 11, z: 0 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.ok(q.count >= 3); assert.equal(q.fulfilled, true); assert.equal(q.overflow, false); assert.equal(q.prisms.length, 1);
  assert.deepEqual(q.prisms[0].outer, courtyard);
  const frame = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), out = new Float64Array(7), scratch = new Float64Array(12);
  let wingHits = 0;
  for (let i = 0; i < q.count; i++) {
    const at = i * 9;
    assert.equal(contactCapsuleOverlapsBox(0, 11, 0, 0, 12, 0, 0.2, q.records, at, scratch, out), false);
    assert.equal(contactOrientedBoxContact(0, 11, 0, frame, 0, -0.3, 0.3, -0.4, 0.4, -0.2, 0.2, q.records, at, scratch, out), false);
    if (contactCapsuleOverlapsBox(1.9, 11, 0, 2.1, 12, 0, 0.15, q.records, at, scratch, out)) wingHits++;
    for (let face = 0; face < 6; face++) {
      contactBoxFace(q.records, at, face, out); near(Math.hypot(out[0], out[1], out[2]), 1);
    }
  }
  assert.ok(wingHits > 0);
  q.minX = 100; q.maxX = 101; q.minZ = 100; q.maxZ = 101;
  s.raycastObstacle({ x: 100, y: 11, z: 100 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.equal(q.prisms.length, 0); assert.equal(q.fulfilled, true);
  assert.equal(q.records.sfContacts.size, 0, 'stale polygon metadata survived slice reuse');
});

test('slanted polygon ragdoll SAT and capsule reject empty AABB corners, retain holes and report overflow', () => {
  const triangle = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }];
  const s = sampler({ prisms: [{ outer: triangle, minY: 10, maxY: 20 }] });
  const records = new Float64Array(144);
  const q = { minX: -1, maxX: 5, minY: 10, maxY: 14, minZ: -1, maxZ: 5, capacity: 8, recordOffset: 0, records };
  s.raycastObstacle({ x: 0, y: 11, z: 0 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.equal(q.count, 1);
  const frame = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), scratch = new Float64Array(12), out = new Float64Array(7);
  assert.equal(contactCapsuleOverlapsBox(3, 11, 3, 3, 12, 3, 0.1, records, 0, scratch, out), false);
  assert.equal(contactOrientedBoxContact(3, 11, 3, frame, 0, -0.1, 0.1, -0.4, 0.4, -0.1, 0.1, records, 0, scratch, out), false);
  assert.equal(contactOrientedBoxContact(1.95, 11, 1.95, frame, 0, -0.1, 0.1, -0.4, 0.4, -0.1, 0.1, records, 0, scratch, out), true);
  near(out[0], Math.SQRT1_2); near(out[2], Math.SQRT1_2);
  near(records.sfContacts.get(0).support(Math.SQRT1_2, 0, Math.SQRT1_2), 4 * Math.SQRT1_2);
  const hole = sampler({ prisms: [{ outer: poly(-5, -5, 5, 5), holes: [poly(-2, -2, 2, 2)], minY: 10, maxY: 20 }] });
  hole.raycastObstacle({ x: 0, y: 11, z: 0 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  for (let i = 0; i < q.count; i++) assert.equal(contactCapsuleOverlapsBox(0, 11, 0, 0, 12, 0, 0.2, records, i * 9, scratch, out), false);
  q.capacity = 1;
  hole.raycastObstacle({ x: 0, y: 11, z: 0 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.equal(q.count, 1); assert.equal(q.overflow, true);
});

test('native ragdoll trunk separation uses the slanted face support, with independent limb slices', () => {
  const s = sampler({ prisms: [{ outer: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }], minY: 10, maxY: 20 }] });
  const rag = new CrashRagdoll();
  for (let i = 0; i < 7; i++) { rag.positions[i * 3] = 1.95; rag.positions[i * 3 + 1] = 11 + i * 0.1; rag.positions[i * 3 + 2] = 1.95; }
  const q = { minX: 1, maxX: 3, minY: 10, maxY: 14, minZ: 1, maxZ: 3,
    capacity: 16, recordOffset: 0, records: rag.limbBoxes };
  s.raycastObstacle({ x: 1.95, y: 11, z: 1.95 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  rag.limbBoxCounts[0] = q.count;
  assert.equal(rag.collectTrunkContacts(), true);
  assert.ok(rag.trunkSeparationCount > 0);
  for (let i = 0; i < rag.trunkSeparationCount; i++) {
    const at = i * 5, n = rag.trunkSeparations;
    near(n[at], Math.SQRT1_2); near(n[at + 2], Math.SQRT1_2);
    near(n[at + 3], 4 * Math.SQRT1_2); // a broad-phase AABB would incorrectly give 8/sqrt(2)
  }
  const first = rag.limbBoxes.sfContacts.get(0);
  q.recordOffset = 144;
  s.raycastObstacle({ x: 1.95, y: 11, z: 1.95 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.equal(rag.limbBoxes.sfContacts.get(0), first);
  assert.ok(rag.limbBoxes.sfContacts.get(144));
  q.minX = 100; q.maxX = 101; q.minZ = 100; q.maxZ = 101;
  s.raycastObstacle({ x: 100, y: 11, z: 100 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.equal(rag.limbBoxes.sfContacts.get(0), first);
  assert.equal(rag.limbBoxes.sfContacts.has(144), false);
});

function tunnel() {
  const floors = [{ kind: 'tunnel', x0: 0, z0: -10, dx: 0, dz: 1, rx: 1, rz: 0, t0: 0, t1: 20, L: -3, R: 3,
    ys: Array.from({ length: 11 }, (_, i) => 10 + i * 0.2) }];
  return { floors };
}

test('tunnel replaces overlying hill for explicit bore references but preserves the street above', () => {
  const s = sampler({ terrain: field(30), grade: tunnel() });
  near(s.sampleGround(0, 0, sample(), 11).height, 11);
  near(s.sampleGround(0, 0, sample(), 15).height, 11); // whole bore, not the old 2.5 m band
  near(s.sampleGround(0, 0, sample(), 30).height, 30);
  near(s.sampleGround(0, 0, sample(), Infinity).height, 30);
  near(s.sampleGround(0, 0, sample(), 11).normal.z, -0.1 / Math.hypot(1, 0.1));
  assert.equal(s.raycastObstacle({ x: 0, y: 12, z: -8 }, { x: 0, y: 0, z: 1 }, 16), null); // hill isn't a horizontal wall
  near(s.raycast({ x: 0, y: 12, z: 0 }, { x: 0, y: -1, z: 0 }, 20), 1);
  near(s.raycast({ x: 0, y: 12, z: 0 }, { x: 0, y: 1, z: 0 }, 20), 4.2);
  near(s.raycastObstacle({ x: 0, y: 12, z: 0 }, { x: 0, y: 1, z: 0 }, 20), 4.2);
  assert.ok(findPlacementTarget(s, { x: 0, z: 0, referenceY: 11 }));
});

test('legacy explicit floorAt/roofAt works without consulting a mutable global level.y', () => {
  const grade = { floorAt: (_x, _z, y) => y < 15 ? 8 : null, roofAt: (_x, _z, y) => y < 15 ? 13.2 : Infinity };
  const s = sampler({ terrain: field(26), grade, city: { level: { y: 999 } } });
  near(s.sampleGround(0, 0, sample(), 9).height, 8);
  near(s.sampleGround(0, 0, sample(), 26).height, 26);
  assert.equal(s.isVolumeClear({ ...body(0, 8, 0), maxY: 14 }), false);
  near(s.raycast({ x: 0, y: 9, z: 0 }, { x: 0, y: 1, z: 0 }, 10), 4.2);
});

test('stacked dry decks over water select the referenced floor and never pull upward', () => {
  const s = new SfTerrainSampler({ terrain: field(0), ride: { tops: [
    { poly: poly(-8, -8, 8, 8), top: 4, surface: 'wood', shore: true, layered: true },
    { poly: poly(-6, -6, 6, 6), top: 12, surface: 'pavement', layered: true }
  ], solids: [{ centre: { x: 0, y: 11.8, z: 0 }, halfExtents: { x: 6, y: 0.2, z: 6 }, rotationY: 0, support: false }], prisms: [] } });
  near(s.sampleGround(0, 0, sample(), 4).height, 4);
  near(s.sampleGround(0, 0, sample(), 12).height, 12);
  near(s.sampleGround(0, 0, sample(), 0).height, -4);
  assert.equal(s.isWater(0, 0, 4), false); assert.equal(s.isWater(0, 0, 12), false); assert.equal(s.isWater(0, 0, 0), true);
  near(findPlacementTarget(s, { x: 0, z: 0, referenceY: 4 }).y, 4);
  near(findPlacementTarget(s, { x: 0, z: 0, referenceY: Infinity }).y, 12);
  assert.equal(findPlacementTarget(s, { x: 7.8, z: 0, referenceY: 4 }), null); // footprint over dry deck edge
});

test('steep unchanged hills permit footprint support, full departure and fallen-floor recovery', () => {
  for (const dz of [0.75, -0.75, 1.2]) {
    const s = sampler({ terrain: field(60, 0.2, dz) });
    const target = findPlacementTarget(s, { x: 0, z: 0, referenceY: 60, registeredSurfaceOnly: true });
    assert.ok(target, `slope ${dz} incorrectly refused`);
    assert.ok(s.sampleGround(0, 0, sample()).normal.y < 0.9);
    assert.equal(placementDepartureClear(s, target, { departure: 1.2 }), true);
    const p = findRecoveryTarget(s, { fallen: { x: 0, y: 60.5, z: 0 }, safePoints: [], headingY: 0 }, () => true);
    assert.ok(p); near(p.y, 60);
    assert.equal(s.raycastObstacle({ x: 0, y: 60.3, z: 0 }, { x: 0, y: dz, z: 1 }, 5), null);
  }
});

test('overhead body, solid wall, unsafe edge and moving occupancy refuse arrival observationally', () => {
  const overhead = sampler({ boxes: [{ centre: { x: 0, y: 11.5, z: 0 }, halfExtents: { x: 2, y: 0.1, z: 2 }, rotationY: 0, support: false }] });
  assert.equal(findPlacementTarget(overhead, { x: 0, z: 0, referenceY: 10 }), null);
  const lowBore = sampler({ terrain: field(30), grade: { floors: tunnel().floors, boreHeight: 1.8 } });
  assert.equal(findPlacementTarget(lowBore, { x: 0, z: 0, referenceY: 11 }), null);
  const s = sampler(), target = findPlacementTarget(s, { x: 0, z: 0, referenceY: 10 });
  const before = JSON.stringify(target); let calls = 0;
  assert.equal(placementDepartureClear(s, target, { departure: 1.2 }, p => { calls++; return p.z < 0.5; }), false);
  assert.equal(JSON.stringify(target), before); assert.ok(calls > 1);
  assert.equal(findRecoveryTarget(s, { fallen: { x: 0, y: 10.5, z: 0 }, safePoints: [] }, () => false), null);
  assert.equal(findPlacementTarget(s, { x: NaN, z: 0 }), null);
  assert.equal(findPlacementTarget(s, { x: 10000, z: 0 }), null);
});

test('departure rejects abrupt layer jumps and cannot pass a thin intervening wall', () => {
  const wall = sampler({ colliders: [{ minX: -5, maxX: 5, minZ: 0.91, maxZ: 0.93, minY: 10, maxY: 20 }] });
  const p = findPlacementTarget(wall, { x: 0, z: 0, referenceY: 10 }); assert.ok(p);
  assert.equal(placementDepartureClear(wall, p, { departure: 1.2 }), false);
  const jump = sampler({ tops: [{ poly: poly(-20, 0.8, 20, 20), top: 10.55, surface: 'pavement' }] });
  assert.equal(placementDepartureClear(jump, pose(0, 10, 0), { departure: 1.2 }), false);
});

test('sparse indexes retain local precision far apart, without dense world allocation', () => {
  const boxes = [-1000000, 1000000].map(x => ({ centre: { x, y: 12, z: -1000000 },
    halfExtents: { x: 0.2, y: 1, z: 0.2 }, rotationY: 0, surface: 'pavement' }));
  const s = sampler({ boxes });
  assert.ok(s.stats.indexReferences < 100);
  assert.equal(s.native.gridStarts.length, 2);
  near(s.raycastObstacle({ x: 999999, y: 12, z: -1000000 }, { x: 1, y: 0, z: 0 }, 3), 0.8);
  assert.equal(s.raycastObstacle({ x: 0, y: 12, z: 0 }, { x: 1, y: 0, z: 0 }, 3), null);
});

test('rideIgnore filters before every conversion and leaves registered passage openings clear', () => {
  const poison = { rideIgnore: true, get outer() { throw Error('ignored polygon read'); },
    get centre() { throw Error('ignored box read'); }, get poly() { throw Error('ignored top read'); } };
  const main = { minX: 5, maxX: 7, minZ: -1, maxZ: 1, minY: 10, maxY: 40 };
  const coarse = { rideIgnore: true, minX: -5, maxX: 5, minZ: -10, maxZ: 10, minY: 10, maxY: 50,
    obb: { cx: 0, cz: 0, hx: 5, hz: 10, cs: 1, sn: 0 } };
  const converted = boxesFromCityColliders([poison, coarse, main]);
  assert.equal(converted.length, 1); assert.equal(converted.prisms.length, 0);
  const posts = [-2, 2].map(x => ({ centre: { x, y: 12, z: 0 }, halfExtents: { x: 0.15, y: 2, z: 0.15 },
    rotationY: 0, surface: 'pavement', support: false }));
  const s = sampler({ colliders: [poison, coarse, main], boxes: [poison], prisms: [poison], tops: [poison],
    ride: { tops: [poison], solids: [poison, ...posts], prisms: [poison] } });
  assert.equal(s.stats.boxes, 3); assert.equal(s.stats.prisms, 0); assert.equal(s.stats.tops, 0);
  assert.equal(s.raycastObstacle({ x: 0, y: 11, z: -3 }, { x: 0, y: 0, z: 1 }, 6), null);
  assert.equal(s.raycast({ x: 0, y: 11, z: -3 }, { x: 0, y: 0, z: 1 }, 6), null);
  assert.equal(s.isVolumeClear(body()), true);
  assert.ok(findPlacementTarget(s, { x: 0, z: 0, referenceY: 10 }));
  near(s.raycastObstacle({ x: 3, y: 11, z: 0 }, { x: 1, y: 0, z: 0 }, 5), 2);
  near(s.sampleGround(6, 0, sample(), Infinity).height, 10);
});

function registryContext(extra = {}) {
  const c = vm.createContext({ window: { NYC: { ...extra } }, console: { info() {} } });
  const load = name => vm.runInContext(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), c);
  load('sf-ride-geometry');
  return { N: c.window.NYC, load };
}

test('real shared registry planes/options and distinct main/foundation bodies remain compatible', () => {
  const { N } = registryContext({ Terrain: field(45, 0.3, 0.2) }), R = N.RideGeometry;
  R.addTop(poly(-3, -3, 3, 3), 46.65, 'brick', { layered: true, shore: true, replacesTerrain: true,
    minReferenceY: 44, maxReferenceY: 52, plane: { x: 0, y: 45.15, z: 0, dx: 0.3, dz: 0.2 } });
  const foundation = R.addBox({ x: 10, y: 44.5, z: 0 }, { x: 1, y: 0.5, z: 1 }, 0);
  const main = { minY: 45, maxY: 90, obb: { cx: 10, cz: 0, hx: 1, hz: 1, cs: 1, sn: 0 } };
  const s = new SfTerrainSampler({ city: N, colliders: [main, main], boxes: [foundation], waterAt: () => false });
  const g = s.sampleGround(1, 1, sample(), 45.5);
  near(g.height, 45.65); assert.equal(g.surface, 'brick'); assert.equal(g.registered, true);
  assert.equal(g.support.shore, true); assert.equal(g.support.layered, true);
  near(g.normal.x, -0.3 / Math.hypot(1, 0.3, 0.2));
  assert.equal(s.stats.boxes, 2); assert.equal(s.stats.duplicateBodies, 2);
  assert.equal(s.boxRecords[1].collider, foundation, 'normalized native registry body was cloned');
  near(s.raycastObstacle({ x: 8, y: 44.5, z: 0 }, { x: 1, y: 0, z: 0 }, 5), 1);
  near(s.raycastObstacle({ x: 8, y: 70, z: 0 }, { x: 1, y: 0, z: 0 }, 5), 1);
  near(s.sampleGround(1, 1, sample(), 52).height, 45.5); // bounded replacement is no longer selected
});

test('optional grade floor records use evenly distributed stations across non-integer spans', () => {
  const ys = [10, 10.465, 11.395, 11.86, 12.79, 13.255], length = 9.3;
  const floor = { kind: 'tunnel', x0: 0, z0: -10, dx: 0, dz: 1, rx: 1, rz: 0, t0: 0, t1: length, L: -3, R: 3, ys };
  const s = sampler({ terrain: field(30), grade: { floors: [floor] } });
  for (let i = 0; i + 1 < ys.length; i++) {
    const t = length * (i + 0.5) / (ys.length - 1), y = (ys[i] + ys[i + 1]) / 2;
    const g = s.sampleGround(0, -10 + t, sample(), y);
    near(g.height, y);
    const gradient = (ys[i + 1] - ys[i]) / (length / (ys.length - 1));
    near(g.normal.z, -gradient / Math.hypot(1, gradient));
  }
});

test('actual grade registry supports sloped bore recovery and ceiling contact without public floors', () => {
  class Group { children = []; add(...items) { this.children.push(...items); } }
  class BufferGeometry { attributes = {}; setAttribute(k, v) { this.attributes[k] = v; } computeVertexNormals() {} computeBoundingSphere() {} }
  class BufferAttribute { constructor(array, itemSize) { Object.assign(this, { array, itemSize }); } }
  class Mesh { constructor(geometry, material) { Object.assign(this, { geometry, material }); } }
  class Material { constructor(o) { Object.assign(this, o); } }
  const Terrain = { ...field(30), groundAt: () => 30, heightAt: () => 30 };
  const { N, load } = registryContext({ THREE: { Group, BufferGeometry, BufferAttribute, Mesh, DoubleSide: 2,
    MeshStandardNodeMaterial: Material, MeshBasicNodeMaterial: Material }, Terrain, GEO: { roadGraph: {} },
    createRoadSurfaceMaterial: () => new Material({}), createMarbleAshlarMaterial: () => new Material({}),
    boreY: (_b, arc) => 10 + 0.6 * arc, edgeArc: (_e, arc) => arc });
  load('grade-separation');
  const edge = { x0: 0, z0: -10, sx: 0, sz: -10, dx: 0, dz: 1, rx: -1, rz: 0, span: 9.3, lanes: [0],
    name: 'fixture bore', bore: { kind: 'tunnel', a0: 0, a1: 1, p0: 0, p1: 1 } };
  N.GradeSeparation = N.buildGradeSeparation(new Group(), { edges: [edge] });
  assert.equal(N.GradeSeparation.floors, undefined, 'fixture must exercise the actual published registry contract');
  assert.ok(N.ride.tops.some(t => t.replacesTerrain), 'network right vector must preserve upward floor winding');
  assert.ok(N.GradeSeparation.colliders.length > 0 && N.GradeSeparation.colliders.every(c => c.rideIgnore === true));
  const s = new SfTerrainSampler({ city: N, colliders: N.GradeSeparation.colliders, waterAt: () => false });
  const z = -5.35, y = 10 + 0.6 * 4.65;
  // dc2108c bounded the registry's replacement band to protect crossing streets. Unlike the optional synthetic
  // grade.floors adapter above, the published registry must not replace terrain throughout the whole 5.2 m bore.
  for (const offset of [0, 0.5, 2]) {
    near(N.GradeSeparation.floorAt(0, z, y + offset), y);
    const ground = s.sampleGround(0, z, sample(), y + offset);
    near(ground.height, y); near(ground.normal.z, -0.6 / Math.hypot(1, 0.6));
    assert.equal(ground.support.replacesTerrain, true, 'must select the registered bore facet');
  }
  assert.equal(N.GradeSeparation.floorAt(0, z, y + 4), null, 'above the bounded bore reference band');
  near(s.sampleGround(0, z, sample(), y + 4).height, 30);
  near(s.sampleGround(0, z, sample(), 30).height, 30);
  const target = findPlacementTarget(s, { x: 0, z, referenceY: y, registeredSurfaceOnly: true });
  assert.ok(target, 'supporting slope slabs incorrectly counted as body penetration');
  assert.equal(placementDepartureClear(s, target, { departure: 1.2 }), true);
  const recovered = findRecoveryTarget(s, { fallen: { x: 0, z, y: y + 0.5 }, safePoints: [] }, () => true);
  assert.ok(recovered); near(recovered.y, y);
  near(s.raycastObstacle({ x: 0, z, y: y + 1 }, { x: 0, y: 1, z: 0 }, 10), 4.2, 0.025);
  assert.equal(s.legacyGradeRays, false, 'registered ceilings should not run a duplicate approximate API march');
  const overhead = N.RideGeometry.addBox({ x: 0, y: y + 1.5, z }, { x: 0.3, y: 0.1, z: 0.3 }, 0);
  const blocked = new SfTerrainSampler({ city: N, colliders: N.GradeSeparation.colliders, waterAt: () => false });
  assert.ok(overhead); assert.equal(findPlacementTarget(blocked, { x: 0, z, referenceY: y }), null);
});

test('construction uses compact sparse references, shared native boxes and lazy regional prism data without truncation', () => {
  const n = 4096, m = 2048;
  const boxes = Array.from({ length: n }, (_, i) => ({ centre: { x: i * 32, y: 12, z: 0 },
    halfExtents: { x: 0.2, y: 1, z: 0.2 }, rotationY: 0, surface: 'pavement', support: false }));
  const prisms = Array.from({ length: m }, (_, i) => ({ outer: Array.from({ length: 8 }, (_, j) =>
    ({ x: i * 32 + Math.sin(j * Math.PI / 4) * 0.2, z: 32 + Math.cos(j * Math.PI / 4) * 0.2 })),
  minY: 10, maxY: 15, surface: 'wood', support: false }));
  const tops = Array.from({ length: m }, (_, i) => ({ poly: poly(i * 32, 64, i * 32 + 1, 65), top: 10.15, surface: 'pavement' }));
  const s = sampler({ colliders: boxes.slice(0, 16), boxes, prisms, tops, ride: { solids: boxes, prisms, tops } });
  assert.equal(s.stats.boxes, n); assert.equal(s.stats.prisms, m); assert.equal(s.stats.tops, m);
  assert.equal(s.stats.duplicateBodies, n + m + 16);
  assert.equal(s.native.colliders, s.boxRecords); assert.equal(s.native.gridStarts.length, 2);
  assert.equal(s.boxRecords[n - 1].collider, boxes[n - 1]);
  assert.ok(s.prisms.every(p => p._edges === null && p.contactPieces === null));
  assert.ok(s.stats.indexReferences <= 64 * (n + m * 2 + 1));
  for (const index of [s.boxIndex, s.prismIndex, s.topIndex]) {
    for (const data of index.levels) if (data) {
      assert.ok(data.starts instanceof Uint32Array && data.items instanceof Uint32Array);
      assert.equal(typeof data.grid.values().next().value, 'number');
    }
  }
  near(s.raycastObstacle({ x: (n - 1) * 32 - 1, y: 12, z: 0 }, { x: 1, y: 0, z: 0 }, 3), 0.8);
  near(s.raycastObstacle({ x: -1, y: 12, z: 32 }, { x: 1, y: 0, z: 0 }, 3), 0.8);
  assert.ok(s.prisms[0]._edges); assert.equal(s.prisms[m - 1]._edges, null);
  assert.equal(s.prisms[0].contactPieces, null, 'point ray must not allocate ragdoll decomposition');
  const q = { minX: -1, maxX: (n - 1) * 32 + 1, minZ: -1, maxZ: 1, minY: 10, maxY: 13,
    recordOffset: 0, capacity: n, records: new Float64Array(n * 9) };
  s.raycastObstacle({ x: -1, y: 12, z: 0 }, { x: 1, y: 0, z: 0 }, 0.1, 0, undefined, undefined, undefined, q);
  assert.equal(q.count, n); assert.equal(q.overflow, false); assert.equal(q.records[(n - 1) * 9], n - 1);
});

test('explicit body supports survive the body-only ground fast path without granting registered roofs', () => {
  const s = sampler({ boxes: [{ centre: { x: 0, y: 11, z: 0 }, halfExtents: { x: 2, y: 1, z: 2 },
    rotationY: 0, surface: 'wood', support: true }],
  prisms: [{ outer: poly(4, -2, 8, 2), minY: 10, maxY: 12, surface: 'brick', support: true }] });
  const a = s.sampleGround(0, 0, sample(), 12), b = s.sampleGround(6, 0, sample(), 12);
  near(a.height, 12); near(a.base.height, 10); assert.equal(a.surface, 'wood'); assert.equal(a.registered, false);
  near(b.height, 12); near(b.base.height, 10); assert.equal(b.surface, 'brick'); assert.equal(b.registered, false);
  assert.equal(findPlacementTarget(s, { x: 0, z: 0, referenceY: 12, registeredSurfaceOnly: true }), null);
});

test('slope-relative standing volume still catches downhill bodies below the centre foot elevation', () => {
  const rock = top => ({ centre: { x: 0, y: top - 0.1, z: -0.4 }, halfExtents: { x: 0.1, y: 0.1, z: 0.05 },
    rotationY: 0, surface: 'pavement', support: false });
  const terrain = field(10, 0, 1);
  const below = sampler({ terrain, boxes: [rock(9.5)] });
  const protruding = sampler({ terrain, boxes: [rock(9.8)] });
  assert.ok(findPlacementTarget(below, { x: 0, z: 0, referenceY: 10 }));
  assert.equal(findPlacementTarget(protruding, { x: 0, z: 0, referenceY: 10 }), null);
});
