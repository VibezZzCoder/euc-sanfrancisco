import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfFlightQueries } from '../js/sf-nemesis-flight.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

function sampler({ block = () => false, ray = () => null, obstacle = () => null } = {}) {
  return {
    sampleGround(x, z, out, referenceY) {
      // Two stacked floors: selecting the upper deck for a rider in the bore is wrong.
      out.height = referenceY < 10 ? 2 : 20;
      out.offCourse = false; out.water = false; out.registered = true;
      return out;
    },
    isVolumeClear: body => !block(body),
    raycast: ray,
    raycastObstacle: obstacle,
  };
}

test('ground queries select the requested floor and return independent scalar snapshots', () => {
  const q = createSfFlightQueries(sampler());
  const lower = q.supportAt(0, 0, 3);
  assert.equal(q.supportAt(0, 0, 21).height, 20);
  assert.equal(lower.height, 2);
  assert.equal(q.supportAt(0, 0, Infinity), null);
});

test('sight uses the full three-dimensional segment and respects a blocking roof', () => {
  const q = createSfFlightQueries(sampler({ ray: (o, d, max) =>
    d.y > 0 && o.y < 8 && o.y + d.y * max > 8 ? (8 - o.y) / d.y : null }));
  assert.equal(q.clearLine({ x: 0, y: 3, z: 0 }, { x: 4, y: 4, z: 0 }), true);
  assert.equal(q.clearLine({ x: 0, y: 3, z: 0 }, { x: 0, y: 12, z: 0 }), false);
  assert.equal(q.clearLine({ x: NaN, y: 3, z: 0 }, { x: 0, y: 3, z: 0 }), false);
});

test('flight rejects body overlap, rising terrain and excessive travel without changing its inputs', () => {
  const q = createSfFlightQueries(sampler({ block: b => b.x > 1 && b.x < 2 }));
  const a = { x: 0, y: 3, z: 0 }, b = { x: 3, y: 3, z: 0 };
  assert.equal(q.clearFlight(a, b), false);
  assert.deepEqual(a, { x: 0, y: 3, z: 0 });
  assert.deepEqual(b, { x: 3, y: 3, z: 0 });
  assert.equal(q.clearFlight(a, { x: 0, y: 1, z: 0 }), false);
  assert.equal(q.clearFlight(a, { x: 100, y: 3, z: 0 }), false);
});

test('a thin wall between volume samples still blocks the swept flight', () => {
  const q = createSfFlightQueries(sampler({ ray: (o, d, max) =>
    d.x > 0 && o.x < 0.25 && o.x + d.x * max >= 0.25 ? (0.25 - o.x) / d.x : null }));
  assert.equal(q.clearFlight({ x: 0, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }, { step: 2 }), false);
  assert.equal(q.clearFlight({ x: 0, y: 3, z: 0 }, { x: -1, y: 3, z: 0 }), true);
});

test('a physical wall that does not occlude sight still blocks flight', () => {
  const q = createSfFlightQueries(sampler({ obstacle: (o, d, max) =>
    d.x > 0 && o.x < 0.25 && o.x + d.x * max >= 0.25 ? (0.25 - o.x) / d.x : null }));
  assert.equal(q.clearLine({ x: 0, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }), true);
  assert.equal(q.clearFlight({ x: 0, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }, { step: 2 }), false);
});

test('a low tunnel admits a short flight but refuses a rising body into its roof', () => {
  const q = createSfFlightQueries(sampler({ block: b => b.maxY > 6 }));
  assert.equal(q.clearFlight({ x: 0, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }), true);
  assert.equal(q.clearFlight({ x: 0, y: 3, z: 0 }, { x: 1, y: 4, z: 0 }), false);
});

test('real SF sampler preserves a tunnel floor under an upper street and rejects the tunnel roof', () => {
  const square = [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }];
  const terrain = { originX: -16, originZ: -16, cell: 2, w: 17, h: 17,
    heights: new Float64Array(17 * 17).fill(16), waterLevel: 0 };
  const actual = new SfTerrainSampler({ terrain, waterAt: () => false,
    tops: [{ poly: square, top: 8, surface: 'pavement', replacesTerrain: true,
      ceilingOffset: 5.2, maxReferenceY: 13.2 }] });
  const q = createSfFlightQueries(actual);
  assert.equal(q.supportAt(0, 0, 9).height, 8);
  assert.equal(q.supportAt(0, 0, 17).height, 16);
  assert.equal(q.clearFlight({ x: 0, y: 9, z: 0 }, { x: 1, y: 9, z: 0 }), true);
  assert.equal(q.clearFlight({ x: 0, y: 10, z: 0 }, { x: 0, y: 12, z: 0 }), false);
  assert.equal(q.clearLine({ x: 0, y: 9, z: 0 }, { x: 0, y: 17, z: 0 }), false);
});

test('stationary and moving footprints reject uphill-corner terrain penetration', () => {
  const w = 17, cell = 2, originX = -16, originZ = -16;
  const heights = new Float64Array(w * w);
  for (let z = 0; z < w; z++) for (let x = 0; x < w; x++) heights[z*w+x] = 20 + 0.4*(originX+x*cell);
  const q = createSfFlightQueries(new SfTerrainSampler({ terrain: { originX, originZ, cell, w, h: w, heights, waterLevel: -100 }, waterAt: () => false }));
  const low = { x: 0, y: 20.1, z: 0 }, safe = { x: 0, y: 20.25, z: 0 };
  assert.equal(q.supportAt(0, 0, 20.1).height, 20);
  assert.equal(q.clearFlight(low, low), false, 'uphill corner is at 20.16');
  assert.equal(q.clearFlight(safe, safe), true);
  assert.equal(q.clearFlight(safe, { x: 1, y: 20.65, z: 0 }), true);
  assert.equal(q.clearFlight(safe, { x: 1, y: 20.5, z: 0 }), false);
});

test('sloped tunnel selects the lower layer at every corner and respects its ceiling', () => {
  const poly = [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }];
  const terrain = { originX: -16, originZ: -16, cell: 2, w: 17, h: 17,
    heights: new Float64Array(17*17).fill(20), waterLevel: 0 };
  const q = createSfFlightQueries(new SfTerrainSampler({ terrain, waterAt: () => false, tops: [{ poly, top: 8,
    plane: { x: 0, y: 8, z: 0, dx: 0.4, dz: 0 }, surface: 'pavement', replacesTerrain: true,
    ceilingOffset: 5.2 }] }));
  assert.equal(q.clearFlight({ x: 0, y: 8.1, z: 0 }, { x: 0, y: 8.1, z: 0 }), false);
  assert.equal(q.clearFlight({ x: 0, y: 8.25, z: 0 }, { x: 1, y: 8.65, z: 0 }), true);
  assert.equal(q.clearFlight({ x: 0, y: 9, z: 0 }, { x: 0, y: 11.2, z: 0 }), false);
});

test('explicit corner references retain a very steep tunnel floor beyond sampler reach', () => {
  const poly = [{ x: -3, z: -3 }, { x: 3, z: -3 }, { x: 3, z: 3 }, { x: -3, z: 3 }];
  const terrain = { originX: -8, originZ: -8, cell: 2, w: 9, h: 9,
    heights: new Float64Array(81).fill(30), waterLevel: 0 };
  const q = createSfFlightQueries(new SfTerrainSampler({ terrain, waterAt: () => false, tops: [{ poly, top: 8,
    plane: { x: 0, y: 8, z: 0, dx: 2, dz: 0 }, surface: 'pavement', replacesTerrain: true, ceilingOffset: 5.2 }] }));
  assert.equal(q.clearFlight({ x: 0, y: 8.1, z: 0 }, { x: 0, y: 8.1, z: 0 }), false);
  assert.equal(q.clearFlight({ x: 0, y: 8.9, z: 0 }, { x: 0, y: 8.9, z: 0 }), true);
});
