// CPU-only committed SF world + production Three/registry/sampler/native controller.
// No browser, synthetic replacement terrain, renderer or geographic regeneration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { placementDepartureClear } from '../js/euc-recovery.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { EUC_DYNAMIC_HULL, createEucDynamicWorld } from '../js/euc-dynamic.js';
import { WHEEL, TERRAIN } from '../js/euc/data/tuning.js';
import { createSkateparksWorld, SITE_FITS, SITE_PINS, worldPoint, localPoint, rectangle, boundsOf,
  pointInPolygon, polygonDistance, inspectFootprint, regionalRoadReservations, nativeFloorAccess, fitSupportPlane } from './helpers/sf-skateparks-world.mjs';

// Resolve only the browser import-map/relative module URLs; all implementation
// bytes and the actual vendored Three identity remain production's own.
const url = path => new URL(path, import.meta.url).href;
const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const kitURL = dataModule(readFileSync(new URL('../js/sf-skatepark-geometry.js', import.meta.url), 'utf8')
  .replace("from 'three/tsl'", `from '${url('../vendor/three/build/three.tsl.js')}'`)
  .replace("from 'three/webgpu'", `from '${url('../vendor/three/build/three.webgpu.js')}'`));
const runtimeSource = readFileSync(new URL('../js/sf-skateparks.js', import.meta.url), 'utf8');
const { SF_SKATEPARKS, buildSFSkateparks } = await import(dataModule(runtimeSource
  .replace("from 'three/webgpu'", `from '${url('../vendor/three/build/three.webgpu.js')}'`)
  .replace("from './sf-terrain-sampler.js'", `from '${url('../js/sf-terrain-sampler.js')}'`)
  .replace("from './euc-recovery.js'", `from '${url('../js/euc-recovery.js')}'`)
  .replace("from './sf-skatepark-geometry.js'", `from '${kitURL}'`)));
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b} (±${epsilon})`);
const sha = value => createHash('sha256').update(ArrayBuffer.isView(value)
  ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : JSON.stringify(value)).digest('hex');
function sourceBuffers(w) {
  const N = w.N, arrays = [N.Terrain.heights, N.DATA.terrain.q, N.DATA.groundMask.mask, N.DATA.buildings.table, N.DATA.buildings.verts,
    N.DATA.fullRegion.mask, N.DATA.fullRegion.trees, N.DATA.fullRegion.roads,
    ...N.DATA.fullRegion.buildings.map(b => b.records), N.DATA.fullRegion.city.heights, N.DATA.fullRegion.horizon.heights,
    ...N.Terrain.patches.map(p => p.heights ?? p.h), ...w.draped.flatMap(d => [d.positions, d.indices])];
  return arrays.filter(ArrayBuffer.isView).map(sha);
}
function triangle(call, offset) {
  return [0, 1, 2].map(i => {
    const k = (call.indices ? call.indices[offset + i] : offset + i) * 3, p = call.positions;
    return { x: p[k], y: p[k + 1], z: p[k + 2] };
  });
}
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function heightAt(tri, p) {
  const [a, b, c] = tri, area = cross(a, b, c), u = cross(a, p, c) / area, v = cross(a, b, p) / area;
  return u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7 ? a.y + u * (b.y - a.y) + v * (c.y - a.y) : null;
}
const floorBuckets = new WeakMap();
function drawFloor(call, spec, p) {
  const local = localPoint(spec.frame, p.x, p.z), cell = spec.court.cell, ns = spec.court.length / cell;
  const i = Math.floor((local.u + spec.court.width / 2) / cell), j = Math.floor((local.v + spec.court.length / 2) / cell);
  let buckets = floorBuckets.get(call);
  if (!buckets) {
    buckets = new Map(); floorBuckets.set(call, buckets);
    for (let k = 0; k < call.indices.length; k += 3) {
      const tri = triangle(call, k), p = tri.map(p => localPoint(spec.frame, p.x, p.z));
      const a0 = Math.floor((Math.min(...p.map(p => p.u)) + spec.court.width / 2) / cell), a1 = Math.floor((Math.max(...p.map(p => p.u)) + spec.court.width / 2) / cell);
      const b0 = Math.floor((Math.min(...p.map(p => p.v)) + spec.court.length / 2) / cell), b1 = Math.floor((Math.max(...p.map(p => p.v)) + spec.court.length / 2) / cell);
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
        const key = a * (ns + 3) + b; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(tri);
      }
    }
  }
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
    for (const tri of buckets.get(a * (ns + 3) + b) ?? []) { const y = heightAt(tri, p); if (y !== null) return y; }
  }
  return null;
}
function clear(w, poly) {
  const result = inspectFootprint(w, poly);
  for (const [kind, checks] of Object.entries(result)) assert.equal(checks.conflicts.length, 0, `${kind}: ${checks.conflicts.map(o => o.id)}`);
  return result;
}

const fixture = (async () => {
  const w = await createSkateparksWorld(), scene = new THREE.Scene(), calls = [], N = w.N;
  const before = { buffers: sourceBuffers(w), tops: N.ride.tops.length, solids: N.ride.solids.length, prisms: N.ride.prisms.length,
    topHash: sha(N.ride.tops), scenery: sha([w.trees, w.buildings, w.roads, w.pedestrianBands, w.regionRoads]), keys: Object.keys(N).sort(),
    depression: structuredClone(w.sampler.sampleGround(-1052, 994, { normal: {} }, 9)) };
  const add = N.RideGeometry.addTriangles;
  N.RideGeometry.addTriangles = (positions, indices, surface, options) => {
    const records = add(positions, indices, surface, options); calls.push({ positions, indices, surface, options, records }); return records;
  };
  let sites;
  try { sites = buildSFSkateparks(scene, N); } finally { N.RideGeometry.addTriangles = add; }
  const sampler = new SfTerrainSampler({ city: N });
  return { w, scene, calls, before, sites, sampler };
})();

test('specs are independent runtime data with exact studied frames/pads and modest donor adaptations', () => {
  assert.doesNotMatch(runtimeSource, /(?:from\s+|import\s*\()['"].*(?:tests|helpers|\/tmp\/)/);
  for (const [i, key] of ['un', 'zion'].entries()) {
    const s = SF_SKATEPARKS[i], f = SITE_FITS[key];
    assert.deepEqual(s.frame, { x: f.x, z: f.z, theta: f.theta });
    for (const k of ['width', 'length', 'spine', 'apron']) assert.equal(s.court[k], f[k]);
    assert.deepEqual(s.pads.map(p => ({ u: p.u, v: p.s, width: p.width, length: p.length })), [...f.pads]);
    assert.match(s.adaptation, /original game layout, not a surveyed replica/);
    for (const p of s.pads) {
      assert.ok(p.features.length >= 1 && p.features.length <= 3);
      assert.ok(Math.abs(p.u) - p.width / 2 - s.court.apron >= s.court.spine / 2);
      for (const r of p.features) if (r.kind === 'profile') assert.ok(r.points.at(-1)[0] - r.points[0][0] <= p.length);
    }
  }
  assert.ok(SF_SKATEPARKS[0].aliases.includes('United Nations Plaza')); assert.ok(SF_SKATEPARKS[1].aliases.includes('Waller'));
  assert.deepEqual(SF_SKATEPARKS[0].pads[0].features[0].points.map(p => p[1]), [0, .4, .4, 0]);
  for (const [id, height] of [['roller-low', .45], ['roller', .65]]) {
    const r = SF_SKATEPARKS[1].pads.find(p => p.id === id).features[0]; near(r.points.at(-1)[0] - r.points[0][0], 8); near(Math.max(...r.points.map(p => p[1])), height);
  }
  const q = SF_SKATEPARKS[1].pads.find(p => p.id === 'quarter').features[0].points;
  near(q.at(-2)[0] - q.at(-3)[0], 3.3); near(q.at(-1)[0] - q.at(-2)[0], 4.8); near(q.at(-2)[1], 1.2);
});

test('actual court/apron/bypass/approach envelopes clear trees, buildings, full pedestrian bands and roads; pin-centred control fails', async t => {
  const { w, sites } = await fixture;
  for (const [i, key] of ['un', 'zion'].entries()) {
    const spec = SF_SKATEPARKS[i], s = sites[i], c = clear(w, s.court.polygon);
    for (const p of s.pads) clear(w, rectangle(p.frame, p.width + 2 * s.court.apron, p.length + 2 * s.court.apron));
    clear(w, rectangle(s.frame, s.court.spine, s.court.length));
    const access = key === 'un' ? [-56, 56] : [-42, 42];
    clear(w, rectangle({ ...worldPoint(s.frame, 0, (access[0] + access[1]) / 2), theta: s.frame.theta }, s.court.spine, access[1] - access[0]));
    for (const f of s.features) for (const poly of f.footprints) {
      clear(w, poly);
      for (const p of poly) { const l = localPoint(s.frame, p.x, p.z); assert.ok(Math.abs(l.u) >= s.court.spine / 2); }
    }
    for (const [j, feature] of s.features.entries()) for (const other of s.features.slice(j + 1)) {
      for (const a of feature.footprints) for (const b of other.footprints)
        assert.ok(polygonDistance(a, b) > .5, `${feature.feature} overlaps/blocks ${other.feature}`);
    }
    if (key === 'un') {
      assert.ok(c.trees.nearest[0].distance > .19); assert.ok(c.pedestrians.nearest[0].distance > 1.2); assert.ok(c.roads.nearest[0].distance > 5.7);
    } else {
      const distance = Math.min(...regionalRoadReservations(w).map(r => polygonDistance(s.court.polygon, r.poly)));
      assert.ok(distance > .89); t.diagnostic(`Zion conservative ALL-road reservation clearance: ${distance}m`);
      clear(w, s.access.polygon);
      for (let u = -s.court.width / 2; u <= s.court.width / 2; u++) for (let v = -s.court.length / 2; v <= s.court.length / 2; v++) {
        const p = worldPoint(s.frame, u, v); assert.equal(w.sampler.sampleGround(p.x, p.z, { normal: {} }).surface, 'grass');
      }
    }
    assert.deepEqual(spec.pin, SITE_PINS[key]);
  }
  const rejected = inspectFootprint(w, rectangle({ ...SITE_PINS.un, theta: 0 }, 18, 34));
  assert.deepEqual(rejected.trees.conflicts.map(o => o.id).sort(), ['core:2272', 'core:5449']);
  assert.ok(rejected.pedestrians.conflicts.some(o => o.id === 'edge:2198:-1'));
});

test('construction preserves source DEM/curb/data buffers, existing registry entries and fixed UN depression', async () => {
  const { w, before, sampler, sites } = await fixture;
  assert.deepEqual(sourceBuffers(w), before.buffers); assert.equal(sha(w.N.ride.tops.slice(0, before.tops)), before.topHash);
  assert.equal(sha([w.trees, w.buildings, w.roads, w.pedestrianBands, w.regionRoads]), before.scenery);
  const out = sampler.sampleGround(-1052, 994, { normal: {} }, 9);
  near(out.height, before.depression.height, 1e-12); assert.ok(out.height < 8.7); assert.deepEqual(out.normal, before.depression.normal);
  assert.equal(sampler.transitionAt(-1052, 994, out.height), false); assert.equal(sampler.restartsAtRest(-1052, 994, out.height), false);
  assert.ok(!pointInPolygon(sites[0].court.polygon, { x: -1052, z: 994 }));
});

test('actual Float32 court drawing and registered triangles agree exactly, with no court-sized physical body', async () => {
  const { w, scene, calls, before } = await fixture;
  assert.equal(scene.children.length, 2);
  const meshes = new Map(); scene.traverse(o => { if (o.isMesh) meshes.set(o.name, o); });
  const drawn = new Set();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const call = { positions: o.geometry.attributes.position.array, indices: o.geometry.index?.array };
    const count = call.indices?.length ?? call.positions.length / 3;
    for (let i = 0; i < count; i += 3) drawn.add(triangle(call, i).flatMap(p => [p.x, p.y, p.z]).join(','));
  });
  for (const call of calls) {
    const count = call.indices?.length ?? call.positions.length / 3;
    for (let i = 0; i < count; i += 3) assert.ok(drawn.has(triangle(call, i).flatMap(p => [p.x, p.y, p.z]).join(',')), 'registered floor/feature facet exists in actual drawing');
  }
  for (const spec of SF_SKATEPARKS) {
    const call = calls.find(c => c.options.source === `skatepark:${spec.id}:floor`), mesh = meshes.get('sfSkatepark.floor:' + spec.id);
    assert.equal(mesh.geometry.attributes.position.array, call.positions); assert.equal(mesh.geometry.index.array, call.indices);
    assert.ok(call.positions instanceof Float32Array); assert.equal(call.options.merge, false);
    assert.equal(call.options.capabilities.transition, undefined); assert.equal(call.options.capabilities.restartsAtRest, true);
    assert.equal(call.records.length, call.indices.length / 3);
    for (let i = 0; i < call.indices.length; i += 3) {
      const tri = triangle(call, i), top = call.records[i / 3]; assert.ok(cross(...tri) < 0);
      assert.equal(top.poly.length, 3); assert.equal(top.capabilities.transition, false);
      for (const p of tri) {
        assert.ok(top.poly.some(q => q.x === p.x && q.z === p.z));
        const y = top.plane ? top.plane.y + top.plane.dx * (p.x - top.plane.x) + top.plane.dz * (p.z - top.plane.z) : top.top;
        near(y, p.y, 1e-10);
      }
    }
    const normals = mesh.geometry.attributes.normal.array;
    for (let i = 0; i < normals.length; i += 3) near(Math.hypot(...normals.subarray(i, i + 3)), 1, 1e-6);
    assert.ok(mesh.material.isMeshStandardNodeMaterial); assert.equal(mesh.material.map, null);
  }
  for (const b of [...w.N.ride.solids.slice(before.solids), ...w.N.ride.prisms.slice(before.prisms)]) {
    assert.equal(b.support, false); assert.doesNotMatch(b.source, /:floor$/);
  }
});

test('floor seam/lift limits are measured against exact original support, including mid-cell edges and the unchanged spine grade', async t => {
  const { w, calls, sites, sampler } = await fixture, out = { normal: {} };
  for (let index = 0; index < sites.length; index++) {
    const spec = SF_SKATEPARKS[index], site = sites[index], call = calls.find(c => c.options.source === `skatepark:${site.id}:floor`);
    let min = Infinity, max = -Infinity, seam = 0, spine = 0, minPoint;
    const check = (u, s) => {
      const p = worldPoint(spec.frame, u, s), y = drawFloor(call, spec, p); assert.notEqual(y, null, 'court has a drawing hole');
      w.sampler.sampleGround(p.x, p.z, out, spec.sourceHeight.referenceY);
      const delta = y - out.height; if (delta < min) minPoint = { u, s, ...p }; min = Math.min(min, delta); max = Math.max(max, delta);
      if (Math.abs(u) < site.court.spine / 2 - .1) spine = Math.max(spine, Math.abs(delta));
    };
    for (let u = -site.court.width / 2 + .031; u < site.court.width / 2; u += .25)
      for (let s = -site.court.length / 2 + .047; s < site.court.length / 2; s += .25) check(u, s);
    // Final Float32 boundary edges, not ideal double-precision rectangle corners.
    const edge = (a, b) => {
      const p = i => ({ x: call.positions[i * 3], y: call.positions[i * 3 + 1], z: call.positions[i * 3 + 2] });
      a = p(a); b = p(b);
      for (let j = 0; j <= 10; j++) {
        const t = j / 10, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
        w.sampler.sampleGround(x, z, out, spec.sourceHeight.referenceY); seam = Math.max(seam, Math.abs(y - out.height));
      }
    };
    for (let k = 0; k < call.indices.length; k += 3) for (let n = 0; n < 3; n++) {
      const a = call.indices[k + n], b = call.indices[k + (n + 1) % 3];
      const p = localPoint(spec.frame, call.positions[a * 3], call.positions[a * 3 + 2]), q = localPoint(spec.frame, call.positions[b * 3], call.positions[b * 3 + 2]);
      const along = (axis, half) => Math.abs(Math.abs(p[axis]) - half) < .0004 && Math.abs(Math.abs(q[axis]) - half) < .0004 && p[axis] * q[axis] > 0;
      if (along('u', site.court.width / 2) || along('v', site.court.length / 2)) edge(a, b);
    }
    t.diagnostic(JSON.stringify({ site: site.id, interiorLift: [min, max], minPoint, maxBoundarySeam: seam, maxSpineLift: spine, floor: site.floor }));
    assert.ok(min > -.00005, `${site.id} buried floor: ${min}`); assert.ok(max < (site.id === 'zion' ? .5 : .12), `${site.id} excessive fill: ${max}`);
    assert.ok(seam < .00005, `${site.id} edge seam: ${seam}`); assert.ok(spine < .0081, `${site.id} spine flattened: ${spine}`);
    const p = worldPoint(spec.frame, 0, 0); sampler.sampleGround(p.x, p.z, out, spec.sourceHeight.referenceY);
    assert.equal(out.support.source, `skatepark:${site.id}:floor`); assert.equal(sampler.transitionAt(p.x, p.z, out.height), false);
    assert.equal(sampler.restartsAtRest(p.x, p.z, out.height), true);
  }
});

// Independent source critical points: native terrain triangle vertices, clipped
// source facet edges, footprint intersections + offset grid + feature breakpoints.
function criticalPoints(w, frame, width, length, sourceTopCount) {
  const poly = rectangle(frame, width, length), box = boundsOf(poly), points = [];
  const add = p => { if (pointInPolygon(poly, p)) points.push(p); };
  const facet = tri => {
    const b = boundsOf(tri); if (b.minX > box.maxX || b.maxX < box.minX || b.minZ > box.maxZ || b.maxZ < box.minZ) return;
    tri.forEach(add);
    for (let i = 0; i < tri.length; i++) for (let j = 0; j < poly.length; j++) {
      const a = tri[i], b = tri[(i + 1) % tri.length], c = poly[j], d = poly[(j + 1) % poly.length];
      const dx = b.x - a.x, dz = b.z - a.z, ex = d.x - c.x, ez = d.z - c.z, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / den, s = ((c.x - a.x) * dz - (c.z - a.z) * dx) / den;
      if (t >= 0 && t <= 1 && s >= 0 && s <= 1) add({ x: a.x + t * dx, z: a.z + t * dz });
    }
  };
  const T = w.N.Terrain, fields = [{ x0: T.originX, z0: T.originZ, nx: T.w, nz: T.h, step: T.cell }, ...T.patches];
  for (const f of fields) for (let j = Math.max(0, Math.floor((box.minZ - f.z0) / f.step)); j <= Math.min(f.nz - 2, Math.floor((box.maxZ - f.z0) / f.step)); j++)
    for (let i = Math.max(0, Math.floor((box.minX - f.x0) / f.step)); i <= Math.min(f.nx - 2, Math.floor((box.maxX - f.x0) / f.step)); i++) {
      const a = { x: f.x0 + i * f.step, z: f.z0 + j * f.step }, b = { x: a.x + f.step, z: a.z }, c = { x: a.x, z: a.z + f.step }, d = { x: b.x, z: c.z };
      facet([a, c, b]); facet([b, c, d]);
    }
  // Before-build raw source entries only (the candidate must never validate itself).
  for (const top of w.N.ride.tops.slice(0, sourceTopCount)) facet(top.poly);
  for (let u = -width / 2; u <= width / 2 + 1e-8; u += .25) for (let s = -length / 2; s <= length / 2 + 1e-8; s += .25) add(worldPoint(frame, u, s));
  return points;
}

test('all measured pad planes and actual feature breakpoints stay above committed source; bases meet the actual Float32 floor', async t => {
  const { w, before, sites, calls } = await fixture, out = { normal: {} };
  const sourceWorld = { ...w, N: { ...w.N, ride: { ...w.N.ride, tops: w.N.ride.tops.slice(0, before.tops) } } };
  for (let index = 0; index < sites.length; index++) {
    const spec = SF_SKATEPARKS[index], site = sites[index], floor = calls.find(c => c.options.source === `skatepark:${site.id}:floor`);
    let minClearance = Infinity, maxBaseError = 0, count = 0;
    for (let i = 0; i < site.pads.length; i++) {
      const p = site.pads[i], r = spec.pads[i].features[0];
      const fit = fitSupportPlane(sourceWorld, p.frame, p.width, p.length, { spacing: .25 });
      near(p.plane.y, fit.y + .008, 1e-9); near(p.plane.du, fit.du, 1e-12); near(p.plane.ds, fit.dv, 1e-12);
      const points = criticalPoints(w, p.frame, p.width, p.length, before.tops);
      if (r.kind === 'profile') for (const [s] of r.points) for (const u of [r.u0, 0, r.u1]) points.push(worldPoint(p.frame, u, s));
      for (const q of points) {
        const l = localPoint(p.frame, q.x, q.z), plane = p.plane.y + p.plane.du * l.u + p.plane.ds * l.v;
        w.sampler.sampleGround(q.x, q.z, out, spec.sourceHeight.referenceY);
        minClearance = Math.min(minClearance, plane - out.height); count++;
        const drawn = drawFloor(floor, spec, q); assert.notEqual(drawn, null);
        maxBaseError = Math.max(maxBaseError, Math.abs(drawn - plane));
      }
      for (const call of calls.filter(c => c.options.source.startsWith(`skatepark:${site.id}-${p.id}-`))) {
        for (let k = 0; k < call.positions.length; k += 3) {
          const q = { x: call.positions[k], z: call.positions[k + 2] }, y = call.positions[k + 1];
          w.sampler.sampleGround(q.x, q.z, out, spec.sourceHeight.referenceY); assert.ok(y > out.height + .02, 'actual feature top buried in source');
        }
      }
    }
    assert.ok(minClearance > .02, `${site.id} source clearance ${minClearance}`); assert.ok(maxBaseError < .00005, `${site.id} base/floor mismatch ${maxBaseError}`);
    t.diagnostic(JSON.stringify({ site: site.id, criticalPoints: count, minPadClearance: minClearance, maxBaseFloorError: maxBaseError }));
  }
});

for (const index of [0, 1]) test(`native ${index ? 'Zion' : 'UN'} all-pad traversal in BOTH directions on actual new floors/features`, async t => {
  const { w, sites, sampler } = await fixture, site = sites[index], results = [];
  for (const route of site.routes) for (const reverse of [false, true]) {
    const result = nativeFloorAccess({ ...w, sampler }, route.frame, { u: route.u,
      start: reverse ? route.end : route.start, end: reverse ? route.start : route.end, targetSpeed: route.targetSpeed, throttle: .42, maxSeconds: 35 });
    results.push({ route: route.id, reverse, ...result, scope: 'authored floors/features + committed support; separate source obstacle reservations, no dynamic actors' });
    assert.equal(result.crashed, false, `${site.id}/${route.id}/${reverse}: ${JSON.stringify(result)}`);
    assert.equal(result.reached, true, `${site.id}/${route.id}/${reverse}: ${JSON.stringify(result)}`);
    assert.ok(result.maxCrossTrack < .002);
  }
  t.diagnostic(JSON.stringify(results));
});

for (const [index, start, end] of [[0, -56, 56], [0, 56, -56], [1, -42, 42], [1, 42, -42]])
  test(`native continuous spine entrance/exit ${index ? 'Zion' : 'UN'} ${start}→${end}`, async t => {
    const { w, sites, sampler } = await fixture;
    const result = nativeFloorAccess({ ...w, sampler }, sites[index].frame, { start, end, throttle: .65, maxSeconds: 50 });
    t.diagnostic(JSON.stringify({ ...result, scope: 'new conforming spine + original outside support; no dynamic actors' }));
    assert.equal(result.crashed, false); assert.equal(result.reached, true); assert.equal(result.airSteps, 0); assert.ok(result.maxContactError < .00001);
  });

for (const [index, u, start, end] of [[0, -5.75, -46, -7], [1, -11, -34, 34]])
  test(`native linked ${index ? 'Zion roller/tabletop/roller/bank' : 'UN bank/roller/double-bank'} line without intervening resets`, async t => {
    const { w, sites, sampler } = await fixture;
    for (const reverse of [false, true]) {
      const result = nativeFloorAccess({ ...w, sampler }, sites[index].frame, { u, start: reverse ? end : start,
        end: reverse ? start : end, throttle: .65, targetSpeed: 3, maxSeconds: 40 });
      t.diagnostic(JSON.stringify({ reverse, ...result }));
      assert.equal(result.crashed, false); assert.equal(result.reached, true); assert.ok(result.maxCrossTrack < .002);
    }
  });

const quarterPlacement = { registeredSurfaceOnly: true, hull: EUC_DYNAMIC_HULL,
  maxStepUp: WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor };

test('grass-side Zion has a native road → access path → spine journey in both directions', async t => {
  const { w, sites, sampler } = await fixture, site = sites[1], route = site.access.route;
  const a = SF_SKATEPARKS[1].access;
  for (let u = a.u0; u <= a.u1; u += .5) for (let s = a.s - a.width / 2; s <= a.s + a.width / 2; s += .5) {
    const p = worldPoint(site.frame, u, s), original = w.sampler.sampleGround(p.x, p.z, { normal: {} });
    assert.equal(original.surface, 'grass', 'the access finish must stop on grass before Waller pavement');
  }
  for (const reverse of [false, true]) {
    const result = nativeFloorAccess({ ...w, sampler }, route.frame, { start: reverse ? route.end : route.start,
      end: reverse ? route.start : route.end, throttle: .42, targetSpeed: 3, maxSeconds: 30 });
    t.diagnostic(JSON.stringify({ reverse, ...result }));
    assert.equal(result.crashed, false); assert.equal(result.reached, true); assert.equal(result.airSteps, 0);
    assert.ok(result.maxContactError < .00001);
  }
});

for (const index of [0, 1]) test(`${index ? 'Zion' : 'UN'} half-pipe bottom has one drawn/selected court owner and no coplanar feature bridge`, async t => {
  const { sites, sampler, scene, calls } = await fixture, site = sites[index], pad = site.pads.find(p => p.id === 'half-pipe');
  const routes = site.featureRoutes.filter(r => r.id === 'half-pipe:shuttle');
  assert.equal(routes.length, 1);
  const route = routes[0], group = scene.getObjectByName('SFSkateparkFeatures:' + site.id + '-half-pipe');
  assert.ok(group); assert.equal(site.features.filter(f => f.pad === 'half-pipe').length, 1);
  const recipe = SF_SKATEPARKS[index].pads.find(p => p.id === 'half-pipe').features[0];
  const gap = rectangle(pad.frame, recipe.u1 - recipe.u0 - .02, 2 * route.flatHalfLength - .02);
  let drawnTriangles = 0, registeredTriangles = 0;
  group.traverse(o => {
    if (!o.isMesh) return;
    const call = { positions: o.geometry.attributes.position.array, indices: o.geometry.index?.array };
    const count = call.indices?.length ?? call.positions.length / 3;
    for (let k = 0; k < count; k += 3) {
      const tri = triangle(call, k); drawnTriangles++;
      assert.ok(polygonDistance(tri, gap) > 0, 'no drawn feature face crosses the open flat bottom');
    }
  });
  for (const call of calls.filter(c => c.options.source === 'skatepark:' + route.feature)) {
    for (let k = 0; k < call.positions.length / 3; k += 3) {
      registeredTriangles++;
      assert.ok(polygonDistance(triangle(call, k), gap) > 0, 'no registered feature face crosses the open flat bottom');
    }
  }
  assert.equal(registeredTriangles, (recipe.points.length - 2) * 2, 'exactly one two-triangle bridge removed');
  for (const u of [recipe.u0 + .1, 0, recipe.u1 - .1]) for (const s of [-route.flatHalfLength + .1, 0, route.flatHalfLength - .1]) {
    const p = worldPoint(pad.frame, u, s), y = pad.plane.y + pad.plane.du * u + pad.plane.ds * s;
    const g = sampler.sampleGround(p.x, p.z, { normal: {} }, y);
    assert.equal(g.support.source, `skatepark:${site.id}:floor`);
    near(g.height, y, .00005);
    assert.equal(sampler.transitionAt(p.x, p.z, g.height), false);
    assert.equal(sampler.restartsAtRest(p.x, p.z, g.height), true);
  }
  t.diagnostic(JSON.stringify({ site: site.id, drawnHalfPipeTriangles: drawnTriangles, registeredHalfPipeTriangles: registeredTriangles,
    featureSummary: site.featureSummary }));
});

for (const index of [0, 1]) test(`${index ? 'Zion' : 'UN'} opposing quarters permit continuous native half-pipe returns`, async t => {
  const { sites, sampler } = await fixture, site = sites[index], pad = site.pads.find(p => p.id === 'half-pipe');
  const route = site.featureRoutes.find(r => r.id === 'half-pipe:shuttle');
  const recipe = SF_SKATEPARKS[index].pads.find(p => p.id === 'half-pipe').features[0];
  for (const segment of [4, recipe.points.length - 6]) {
    const a = recipe.points[segment], b = recipe.points[segment + 1], s = (a[0] + b[0]) / 2;
    const p = worldPoint(pad.frame, 0, s), y = pad.plane.y + pad.plane.ds * s + (a[1] + b[1]) / 2;
    assert.equal(sampler.transitionAt(p.x, p.z, y), true);
    assert.equal(sampler.transitionAt(p.x, p.z, y + 4), false, 'curved geometry cannot confer capabilities on a different floor');
  }
  const point = worldPoint(pad.frame, 0, 0), ground = sampler.sampleGround(point.x, point.z, { normal: {} }, pad.plane.y);
  assert.equal(ground.support.source, `skatepark:${site.id}:floor`, 'court alone owns the half-pipe flat bottom');
  assert.equal(sampler.transitionAt(point.x, point.z, ground.height), false, 'half-pipe flat bottom is not a slope switch');
  const target = sampler.findPlacementTarget({ ...point, headingY: pad.frame.theta, referenceY: ground.height, registeredSurfaceOnly: true });
  assert.ok(target); assert.equal(placementDepartureClear(sampler, target, { departure: 1.2, registeredSurfaceOnly: true }), true);
  const controller = new EucController(sampler, { spawn: { position: target, headingY: target.headingY } });
  let min = Infinity, max = -Infinity, maxU = 0, crossings = 0, side = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 4800 && !controller.crashed; i++) {
    const state = controller.snapshot();
    const onCurve = sampler.transitionAt(state.position.x, state.position.z, state.position.y);
    // UN's low quarters use held forward input; Zion uses release/coast on the
    // taller curved faces. These are native rider inputs, never pose/velocity edits.
    controller.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: (!index || !onCurve) && Math.abs(state.speed) < 4.5 ? .38 : 0 });
    const p = controller.snapshot(), l = localPoint(pad.frame, p.position.x, p.position.z);
    min = Math.min(min, l.v); max = Math.max(max, l.v); maxU = Math.max(maxU, Math.abs(l.u));
    minY = Math.min(minY, p.position.y); maxY = Math.max(maxY, p.position.y);
    const next = l.v > route.flatHalfLength + .2 ? 1 : l.v < -route.flatHalfLength - .2 ? -1 : 0;
    if (next && next !== side) { crossings++; side = next; }
  }
  const state = controller.snapshot();
  t.diagnostic(JSON.stringify({ site: site.id, min, max, maxU, crossings, minY, maxY, crashed: controller.crashed,
    wallTurns: state.wallTurns, comeBackAirs: state.comeBackAirs, end: state.position }));
  assert.equal(controller.crashed, false); assert.ok(crossings >= 3, 'reach both opposing curved faces and return without resetting');
  assert.ok(maxY - minY > .6); assert.ok(maxU < (index ? 4 : 2), 'native return stays on actual half-pipe width');
  assert.ok(Math.max(Math.abs(min), Math.abs(max)) < pad.length / 2, 'returns stay between the two outer banks');
});
function quarterAdmission(sampler, pad, s, headingY, height = 0) {
  const p = worldPoint(pad.frame, 0, s), referenceY = pad.plane.y + pad.plane.ds * s + height;
  const ground = sampler.sampleGround(p.x, p.z, { normal: {} }, referenceY);
  const request = { ...quarterPlacement, ...p, headingY, referenceY: ground.height };
  const target = sampler.findPlacementTarget(request);
  return { request, source: ground.support?.source, target,
    departure: !!target && placementDepartureClear(sampler, target, { ...quarterPlacement, departure: 1.2 }) };
}
function nativeQuarterRoute(sampler, pad, route, height = 0) {
  const direction = Math.sign(route.end - route.start), headingY = route.frame.theta + (direction < 0 ? Math.PI : 0);
  const admission = quarterAdmission(sampler, pad, route.start, headingY, height);
  assert.ok(admission.target, 'native quarter setup requires a checked standing target');
  assert.equal(admission.departure, true, 'native quarter setup requires full departure admission');
  const dynamicWorld = createEucDynamicWorld({ bodiesNear() {} });
  assert.deepEqual(dynamicWorld.hull, EUC_DYNAMIC_HULL);
  const controller = new EucController(sampler, { dynamicWorld, spawn: {
    position: { x: admission.target.x, y: admission.target.y, z: admission.target.z }, headingY } });
  near(controller.tuning.maxStepUp, quarterPlacement.maxStepUp, 1e-12);
  let reached = false, steps = 0, airSteps = 0, minHeight = Infinity, maxHeight = -Infinity, maxContactError = 0;
  const ground = { normal: {} };
  while (steps < 1800 && !controller.crashed) {
    // Native input/120Hz simulation ONLY after the admitted initial spawn.
    controller.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: route.throttle }); steps++;
    const state = controller.snapshot();
    sampler.sampleGround(state.position.x, state.position.z, ground, state.position.y);
    minHeight = Math.min(minHeight, state.position.y); maxHeight = Math.max(maxHeight, state.position.y);
    maxContactError = Math.max(maxContactError, Math.abs(state.position.y - ground.height));
    if (!state.grounded) airSteps++;
    if (direction * (localPoint(pad.frame, state.position.x, state.position.z).v - route.end) >= 0) { reached = true; break; }
  }
  return { admission, reached, crashed: controller.crashed, steps, seconds: steps / 120, minHeight, maxHeight,
    airSteps, maxContactError, end: controller.snapshot().position };
}

test('quarter route admission uses the actual default hull and full 1.2m departure, including rejected close-runup control', async t => {
  const { sites, sampler } = await fixture, site = sites[1], pad = site.pads.find(p => p.id === 'quarter'), points = SF_SKATEPARKS[1].pads.find(p => p.id === 'quarter').features[0].points;
  const access = site.featureRoutes.find(r => r.id === 'quarter:bank-to-deck'), exit = site.featureRoutes.find(r => r.id === 'quarter:deck-return');
  const rejected = quarterAdmission(sampler, pad, points.at(-1)[0] + 1.5, pad.frame.theta + Math.PI);
  assert.ok(rejected.target, 'the former run-up is a valid standing target');
  assert.equal(rejected.departure, false, 'standing alone must not be mistaken for departure admission');
  const candidate = quarterAdmission(sampler, pad, points.at(-1)[0] + 3, pad.frame.theta + Math.PI);
  const published = quarterAdmission(sampler, pad, access.start, access.frame.theta + Math.PI);
  const deck = quarterAdmission(sampler, pad, exit.start, exit.frame.theta, points.at(-2)[1]);
  t.diagnostic(JSON.stringify({ hull: EUC_DYNAMIC_HULL, maxStepUp: quarterPlacement.maxStepUp, rejected, candidate, published, deck }));
  assert.ok(candidate.target); assert.equal(candidate.departure, true, 'three-metre run-up clears actual preflight');
  assert.ok(published.target); assert.equal(published.departure, true, 'published bank approach must clear actual preflight');
  assert.ok(deck.target); assert.equal(deck.departure, true, 'actual lip deck clears departure toward the bank');
  near(deck.target.y, pad.plane.y + pad.plane.ds * exit.start + points.at(-2)[1], .00002);
  assert.equal(deck.source, 'skatepark:zion-quarter-quarter-return');
  const localStart = localPoint(site.frame, published.target.x, published.target.z);
  assert.ok(Math.abs(localStart.u) + EUC_DYNAMIC_HULL.halfWidthMetres + .15 < site.court.width / 2);
  assert.ok(localStart.v + EUC_DYNAMIC_HULL.halfLengthMetres + .15 < site.court.length / 2, 'whole starting hull stays inside court');
  // Omitted hull/step settings use the same real defaults, never a reduced test hull.
  assert.equal(placementDepartureClear(sampler, published.target, { departure: 1.2, registeredSurfaceOnly: true }), true);
  assert.equal(placementDepartureClear(sampler, deck.target, { departure: 1.2, registeredSurfaceOnly: true }), true);
});

test('quarter slopes stay local; open lip deck has a native bank return and checked safe recovery', async t => {
  const { sites, sampler } = await fixture, site = sites[1], pad = site.pads.find(p => p.id === 'quarter'), spec = SF_SKATEPARKS[1].pads.find(p => p.id === 'quarter'), points = spec.features[0].points;
  const deckStart = points.at(-3)[0], deckEnd = points.at(-2)[0], deckMid = (deckStart + deckEnd) / 2;
  const yAt = (u, s, h = 0) => pad.plane.y + pad.plane.du * u + pad.plane.ds * s + h;
  for (const [s, h, flag] of [[(points[2][0] + points[3][0]) / 2, (points[2][1] + points[3][1]) / 2, true],
    [deckMid, points.at(-2)[1], false], [(deckEnd + points.at(-1)[0]) / 2, .6, true]]) {
    const p = worldPoint(pad.frame, 0, s), y = yAt(0, s, h);
    assert.equal(sampler.transitionAt(p.x, p.z, y), flag); assert.equal(sampler.restartsAtRest(p.x, p.z, y), true);
  }
  const access = site.featureRoutes.find(r => r.id === 'quarter:bank-to-deck'), exit = site.featureRoutes.find(r => r.id === 'quarter:deck-return');
  const result = nativeQuarterRoute(sampler, pad, access);
  assert.equal(result.crashed, false); assert.equal(result.reached, true); assert.ok(result.maxHeight > pad.plane.y + 1);
  const p = worldPoint(pad.frame, 0, deckMid), ground = sampler.sampleGround(p.x, p.z, { normal: {} }, yAt(0, deckMid, 1.2));
  const recovered = sampler.findRecoveryTarget({ fallen: { ...p, y: ground.height + .5 }, headingY: pad.frame.theta + Math.PI, safePoints: [] }, () => true);
  assert.ok(recovered); assert.ok(recovered.y > pad.plane.y + 1);
  assert.equal(sampler.findRecoveryTarget({ fallen: { ...p, y: ground.height + .5 }, safePoints: [] }, () => false), null);
  const returnToCourt = nativeQuarterRoute(sampler, pad, exit, points.at(-2)[1]);
  assert.equal(returnToCourt.crashed, false); assert.equal(returnToCourt.reached, true);
  t.diagnostic(JSON.stringify({ bankToDeck: result, recovered, returnToCourt: { ...returnToCourt, scope: 'native open deck to authored return bank/court' } }));
});

test('separate spine arrivals use actual new floors and finite Y; authoritative placement/departure/recovery recheck succeeds', async t => {
  const { sites, sampler } = await fixture;
  for (const site of sites) {
    const p = site.arrival, local = localPoint(site.frame, p.x, p.z); near(local.u, 0, 1e-9);
    assert.ok(Number.isFinite(p.referenceY)); near(p.referenceY, p.y); assert.notDeepEqual({ x: p.x, z: p.z }, site.pin);
    const g = sampler.sampleGround(p.x, p.z, { normal: {} }, p.referenceY); near(g.height, p.y, 1e-9); assert.equal(g.support.source, `skatepark:${site.id}:floor`);
    const checked = sampler.findPlacementTarget(p); assert.ok(checked); near(checked.y, p.y);
    assert.equal(placementDepartureClear(sampler, checked, p), true);
    const recovery = sampler.findRecoveryTarget({ fallen: { x: p.x, z: p.z, y: p.y + .5 }, headingY: p.headingY, safePoints: [] }, () => true);
    assert.ok(recovery); near(recovery.y, p.y, .01);
    const controller = new EucController(sampler, { spawn: { position: { x: p.x, y: p.y, z: p.z }, headingY: p.headingY } });
    controller.hardKnock(0, 1); assert.equal(controller.crashed, true);
    let gotUp = false;
    for (let i = 0; i < 1200 && !gotUp; i++) { controller.step(1 / 120, NEUTRAL_ACTIONS); gotUp = controller.recover(); }
    assert.equal(gotUp, true, 'native crash/get-up uses checked new-floor recovery'); assert.equal(controller.crashed, false);
    near(controller.snapshot().speed, 0, 1e-9);
    t.diagnostic(JSON.stringify({ site: site.id, bounds: boundsOf(site.court.polygon), arrival: p,
      maxPadSlope: Math.max(...site.pads.map(p => Math.hypot(p.plane.du, p.plane.ds))), geometry: site.featureSummary }));
  }
});

test('published metadata retains no raw support/sampler/scene graphs; scene traversal owns all disposable resources', async () => {
  const { w, sites, scene, before, sampler } = await fixture;
  assert.equal(w.N.SF_SKATEPARKS, sites); assert.ok(JSON.stringify(sites).length < 48000);
  assert.deepEqual(Object.keys(w.N).filter(k => !before.keys.includes(k)), ['SF_SKATEPARKS']);
  const visit = o => {
    if (o === null || typeof o !== 'object') { assert.notEqual(typeof o, 'function'); return; }
    assert.equal(ArrayBuffer.isView(o), false); assert.ok(Array.isArray(o) || Object.getPrototypeOf(o) === Object.prototype);
    assert.ok(!(o instanceof SfTerrainSampler)); assert.ok(!o.isObject3D);
    for (const [key, value] of Object.entries(o)) { assert.ok(!['topStore', 'tops', 'terrain', 'sampler', 'support', 'scene', 'group', 'sourceFloor'].includes(key)); visit(value); }
  };
  visit(sites);
  let geometries = 0, materials = 0;
  scene.traverse(o => {
    if (o.geometry) { geometries++; o.geometry.dispose(); }
    if (o.material) { materials++; assert.ok(!o.material.map); o.material.dispose(); }
  });
  assert.equal(geometries, sites.reduce((sum, s) => sum + s.featureSummary.meshes, 0)); assert.equal(materials, geometries);
  assert.equal(sampler.releaseConstructionRegistry(w.N.ride), true); assert.equal(w.N.ride.tops.length, 0);
  for (const s of sites) { const p = s.arrival; assert.ok(sampler.findPlacementTarget(p)); }
  assert.throws(() => buildSFSkateparks(scene, w.N), /precede authoritative sampler/);
});
