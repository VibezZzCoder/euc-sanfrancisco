// CPU-only inscribed-body regression / matched cost controls, actual current site recipes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { baselineBodySource } from './helpers/sf-skatepark-body-baseline.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const dataURL = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const resolve = text => text.replaceAll("from 'three/webgpu'", `from '${new URL('../vendor/three/build/three.webgpu.js', import.meta.url).href}'`)
  .replaceAll("from 'three/tsl'", `from '${new URL('../vendor/three/build/three.tsl.js', import.meta.url).href}'`);
const source = read('../js/sf-skatepark-geometry.js'), siteSource = read('../js/sf-skateparks.js');
const sha = s => createHash('sha256').update(s).digest('hex');
const observed = text => resolve(text.replace('function inscribedBodies(', 'function partitionBody(')) + `
  export const facetCalls = [];
  function inscribedBodies(q, base, bodies, options) {
    const start = bodies.length;
    partitionBody(q, base, bodies, options);
    facetCalls.push({q, base, bodies: bodies.slice(start)});
  }
  export { partitionBody };`;
const baselineSource = source.replace(/function inscribedBodies\([\s\S]*?\n}\n/, baselineBodySource + '\n');
const candidate = await import(dataURL(observed(source))), baseline = await import(dataURL(observed(baselineSource)));
let sitesModule = resolve(siteSource).replace("from './sf-skatepark-geometry.js'", `from '${dataURL(resolve(source))}'`);
for (const path of ['sf-terrain-sampler.js', 'euc-recovery.js'])
  sitesModule = sitesModule.replace(`from './${path}'`, `from '${new URL('../js/' + path, import.meta.url).href}'`);
const { SF_SKATEPARKS } = await import(dataURL(sitesModule));
const finish = Number(/const FINISH = ([\d.]+);/.exec(siteSource)?.[1]);
assert.ok(Number.isFinite(finish));
const world = (f, u, s, h = 0) => ({ x: f.x + u * Math.cos(f.theta) + s * Math.sin(f.theta),
  z: f.z - u * Math.sin(f.theta) + s * Math.cos(f.theta), y: f.y + f.du * u + f.ds * s + h });
const frames = SF_SKATEPARKS.flatMap(site => site.pads.map(p => {
  const centre = world({ ...site.frame, y: 0, du: 0, ds: 0 }, p.u, p.s);
  return { id: site.id + '-' + p.id, park: site.id, ...centre, theta: site.frame.theta,
    y: p.plane.y + finish, du: p.plane.du, ds: p.plane.ds, features: p.features };
}));
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const xz = p => ({ x: p[0], y: p[1], z: p[2] });
const area = poly => Math.abs(poly.reduce((s, p, i) => s + cross(poly[0], p, poly[(i + 1) % poly.length]), 0)) / 2;
const inside = (poly, p) => poly.every((a, i) => cross(a, poly[(i + 1) % poly.length], p) <= 1e-8);
const height = (tri, p) => {
  const [a, b, c] = tri, den = cross(a, b, c);
  return a.y + (b.y - a.y) * cross(a, p, c) / den + (c.y - a.y) * cross(a, b, p) / den;
};
function fixture(kit, f) {
  const city = {}, scene = new THREE.Scene();
  vm.runInNewContext(read('../js/sf-ride-geometry.js'), { window: { NYC: city } });
  kit.facetCalls.length = 0;
  const result = kit.buildSkateparkFeatures(scene, f, city), facets = kit.facetCalls.splice(0);
  const floor = result.floorEnvelope.plane;
  const ground = (x, z) => floor.y + floor.dx * (x - floor.x) + floor.dz * (z - floor.z);
  const terrain = { originX: f.x - 100, originZ: f.z - 100, cell: 100, w: 3, h: 3, waterLevel: 0,
    heights: Array.from({ length: 9 }, (_, i) => ground(f.x - 100 + i % 3 * 100, f.z - 100 + Math.floor(i / 3) * 100)) };
  const sampler = new SfTerrainSampler({ city, terrain, waterAt: () => false });
  const drawn = result.group.children.map(m => sha(Buffer.from(m.geometry.attributes.position.array.buffer)));
  result.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return { result, city, facets, sampler, drawn };
}

function auditFacet(call) {
  const { q, base, bodies } = call;
  const facets = [[0, 1, 2], [0, 2, 3]].map(ids => ({ roof: ids.map(i => xz(q[i])), floor: ids.map(i => xz(base[i])), bodies: [] }));
  for (const body of bodies) {
    const facet = facets.find(f => body.outer.every(p => inside(f.roof, p)));
    assert.ok(facet, 'whole convex body stays inside one actual Float32 roof/base triangle');
    facet.bodies.push(body);
    const roof = body.outer.map(p => height(facet.roof, p)), floor = body.outer.map(p => height(facet.floor, p));
    assert.ok(Math.max(...roof) - Math.min(...roof) <= .06, 'actual roof variation <=6cm');
    assert.ok(Math.max(...floor) - Math.min(...floor) <= .03, 'actual floor variation <=3cm');
    assert.ok(body.maxY <= Math.min(...roof) + 1e-10, 'roof never protrudes');
    assert.ok(body.minY >= Math.max(...floor) - 1e-10, 'base never protrudes');
    assert.ok(Math.max(...roof) - body.maxY <= .06, 'roof deficit including guard <=6cm');
    assert.ok(body.minY - Math.min(...floor) <= .03, 'base deficit including guard <=3cm');
    assert.ok(body.maxY > body.minY);
    for (let i = 0; i < body.outer.length; i++) assert.ok(cross(body.outer[i], body.outer[(i + 1) % body.outer.length], body.outer[(i + 2) % body.outer.length]) <= 1e-8, 'convex winding retained');
  }
  for (const f of facets) {
    const actualArea = area(f.roof), coveredArea = f.bodies.reduce((n, b) => n + area(b.outer), 0);
    assert.ok(coveredArea <= actualArea + 1e-7, 'no overlapping partition inflation');
    const thickness = Math.min(...f.roof.map((p, i) => p.y - f.floor[i].y));
    if (thickness > .090002) assert.ok(Math.abs(coveredArea - actualArea) < 1e-7, 'complete footprint coverage for nonvanishing solids');
    // Thin ramp toes may omit cells without vertical overlap. All points that have
    // a guaranteed .03-floor/.06-roof core must still be physically represented.
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12 - i; j++) {
      const p = { x: f.roof[0].x + (f.roof[1].x - f.roof[0].x) * i / 12 + (f.roof[2].x - f.roof[0].x) * j / 12,
        z: f.roof[0].z + (f.roof[1].z - f.roof[0].z) * i / 12 + (f.roof[2].z - f.roof[0].z) * j / 12 };
      const lo = height(f.floor, p) + .030001, hi = height(f.roof, p) - .060001;
      if (hi > lo) assert.ok(f.bodies.some(b => inside(b.outer, p) && b.minY <= lo && b.maxY >= hi), 'no missing guaranteed interior at contour/diagonal/side seams');
    }
  }
}

test('actual UN/Zion facets retain strict inscribed precision, core coverage and all-direction side rays', t => {
  let facets = 0, rays = 0;
  for (const frame of frames) {
    const f = fixture(candidate, frame);
    for (const call of f.facets) {
      auditFacet(call); facets += 2;
      // Independent side-edge rays, including both oblique approach senses. Interior
      // profile joints are harmless: the same hit distance applies to their filled union.
      for (let edge = 0; edge < 4; edge++) for (const fraction of [.17, .5, .83]) {
        const a = xz(call.q[edge]), b = xz(call.q[(edge + 1) % 4]), ba = xz(call.base[edge]), bb = xz(call.base[(edge + 1) % 4]);
        const p = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
        const low = ba.y + (bb.y - ba.y) * fraction, high = a.y + (b.y - a.y) * fraction;
        if (high - low < .12) continue;
        const len = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
        for (const angle of [-Math.PI / 6, 0, Math.PI / 6]) {
          const dir = { x: nx * Math.cos(angle) - nz * Math.sin(angle), y: 0, z: nz * Math.cos(angle) + nx * Math.sin(angle) };
          const origin = { x: p.x - dir.x * .2, y: (low + .03 + high - .06) / 2, z: p.z - dir.z * .2 };
          const hit = f.sampler.raycastObstacle(origin, dir, .4);
          // Internal profile joints or neighbouring rail posts may be reached earlier.
          assert.ok(hit !== null && hit <= .200001, `${frame.id} missing side edge=${edge} angle=${angle}`);
          rays++;
        }
      }
    }
  }
  t.diagnostic(JSON.stringify({ facets, sideRays: rays, scope: 'actual feature fixtures on measured affine pad floors; native site tests cover full committed support' }));
});

test('parallel, opposite-gradient, Float32 noncoplanar and near-zero-slope facets keep coverage without a Cartesian explosion', () => {
  for (const theta of [0, .43, -1.4924571485356748]) for (const [du, ds, slope] of [[.176, 0, 0], [.176, -.011, .25], [-.176, .011, -.25], [.03, -.03, .03], [0, 0, 0], [1e-8, 1e-8, 1e-8]]) {
    const frame = { x: -4583.35, z: 2237.2, y: 83.14, theta, du, ds };
    const corners = [[-4, -3], [-4, 3], [4, 3], [4, -3]];
    const at = (u, s, h) => { const p = world(frame, u, s, h); return [Math.fround(p.x), Math.fround(p.y), Math.fround(p.z)]; };
    const q = corners.map(([u, s]) => at(u, s, 2 + slope * s)), base = corners.map(([u, s]) => at(u, s, 0)), bodies = [];
    candidate.partitionBody(q, base, bodies, {}); auditFacet({ q, base, bodies });
    if (slope === 0) assert.ok(bodies.length < 160, 'parallel planes scale with height range, not two-axis product');
  }
  const q = [[0, 0, 0], [0, 1e8, 1], [1, 1e8, 1], [1, 0, 0]], base = q.map(p => [p[0], p[1] - 1, p[2]]);
  assert.throws(() => candidate.partitionBody(q, base, [], {}), /subdivision exceeds/, 'pathological construction is bounded');
});

test('native actual UN bench blocks all four sides and oblique approaches without entering its solid', () => {
  const frame = frames.find(f => f.id === 'un-plaza-bench'), f = fixture(candidate, frame), recipe = frame.features[0];
  for (const axis of ['u', 's']) for (const sign of [-1, 1]) for (const angle of [-.35, 0, .35]) {
    const u = axis === 'u' ? (sign < 0 ? recipe.u0 : recipe.u1) + sign * 2 : (recipe.u0 + recipe.u1) / 2;
    const s = axis === 's' ? (sign < 0 ? recipe.s0 : recipe.s1) + sign * 2 : (recipe.s0 + recipe.s1) / 2;
    const heading = frame.theta + (axis === 'u' ? -sign * Math.PI / 2 : sign > 0 ? Math.PI : 0) + angle;
    const controller = new EucController(f.sampler, { spawn: { position: world(frame, u, s), headingY: heading } });
    let blocked = false;
    for (let tick = 0; tick < 720 && !controller.crashed; tick++) {
      controller.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: .2 });
      const state = controller.snapshot(); blocked ||= state.blocked;
      assert.ok(f.facets.every(call => call.bodies.every(b => !inside(b.outer, state.position) || state.position.y >= b.maxY || state.position.y + .216 <= b.minY)), 'native core cannot penetrate the filled side');
      if (blocked) break;
    }
    assert.ok(blocked, `native bench contact ${axis}/${sign}/${angle}`);
  }
});

test('matched actual fixtures: counts, unchanged support/drawing/rails and CPU query cost', t => {
  const counts = {}, timing = { baseline: [], candidate: [] }, pairs = [];
  const differences = { rays: 0, changed: 0, baselineOnly: 0, candidateOnly: 0, maxFloorSkin: 0, maxRoofSkin: 0 };
  for (const frame of frames) {
    const a = fixture(baseline, frame), b = fixture(candidate, frame);
    assert.deepEqual(b.drawn, a.drawn, 'drawing buffers unchanged');
    // Each registry lives in its own VM realm; compare exact data, not realm prototypes.
    assert.deepEqual(structuredClone(b.city.ride.tops), structuredClone(a.city.ride.tops), 'registered support/capabilities unchanged');
    assert.deepEqual(structuredClone(b.city.ride.solids), structuredClone(a.city.ride.solids), 'rail OBBs unchanged');
    const totals = counts[frame.park] ??= { baseline: 0, candidate: 0, pads: [] };
    totals.baseline += a.result.counts.bodies; totals.candidate += b.result.counts.bodies;
    totals.pads.push({ id: frame.id, baseline: a.result.counts.bodies, candidate: b.result.counts.bodies });
    const queries = [];
    for (const call of b.facets) for (const ids of [[0, 1, 2], [0, 2, 3]]) {
      const tri = ids.map(i => xz(call.q[i])), centre = { x: tri.reduce((s, p) => s + p.x / 3, 0), z: tri.reduce((s, p) => s + p.z / 3, 0) };
      for (const lift of [-.15, .15]) for (let angle = 0; angle < 8; angle++) queries.push({ origin: { ...centre, y: height(tri, centre) + lift },
        dir: { x: Math.sin(angle * Math.PI / 4), y: 0, z: Math.cos(angle * Math.PI / 4) } });
    }
    // Exact partitions need not have identical rays inside the permitted roof/base
    // skin. Any lost or delayed baseline hit MUST be in that skin, never the core.
    const facetsAt = p => b.facets.flatMap(call => [[0, 1, 2], [0, 2, 3]].map(ids => ({ roof: ids.map(i => xz(call.q[i])), floor: ids.map(i => xz(call.base[i])) })))
      .filter(f => inside(f.roof, p));
    for (const { origin, dir } of queries) {
      differences.rays++;
      const oldHit = a.sampler.raycastObstacle(origin, dir, 1.2), newHit = b.sampler.raycastObstacle(origin, dir, 1.2);
      if (oldHit === newHit || (oldHit !== null && newHit !== null && Math.abs(oldHit - newHit) < 1e-7)) continue;
      differences.changed++;
      if (oldHit !== null && newHit === null) differences.baselineOnly++;
      if (oldHit === null && newHit !== null) differences.candidateOnly++;
      if (oldHit !== null && (newHit === null || newHit > oldHit + 1e-7)) {
        const p = { x: origin.x + dir.x * oldHit, z: origin.z + dir.z * oldHit };
        const facets = facetsAt(p); assert.ok(facets.length, 'changed ray belongs to a changed prism, not unchanged rails');
        assert.ok(facets.every(f => origin.y - height(f.floor, p) <= .030001 || height(f.roof, p) - origin.y <= .060001),
          `lost/delayed hit must be in permitted skin: ${frame.id} ${JSON.stringify({origin, dir, oldHit, newHit})}`);
        for (const f of facets) {
          const floorSkin = origin.y - height(f.floor, p), roofSkin = height(f.roof, p) - origin.y;
          if (floorSkin <= .030001) differences.maxFloorSkin = Math.max(differences.maxFloorSkin, floorSkin);
          if (roofSkin <= .060001) differences.maxRoofSkin = Math.max(differences.maxRoofSkin, roofSkin);
        }
      }
    }
    pairs.push({ a, b, queries });
  }
  assert.equal(counts.zion.baseline, 14653, 'frozen pre-partition fixture control');
  assert.equal(counts['un-plaza'].baseline, 1626);
  assert.ok(counts.zion.candidate < counts.zion.baseline / 2, 'substantial actual Zion reduction');
  assert.ok(counts['un-plaza'].candidate <= counts['un-plaza'].baseline);
  const run = key => {
    let hits = 0; const start = performance.now();
    for (let repeat = 0; repeat < 3; repeat++) for (const pair of pairs) for (const { origin, dir } of pair.queries)
      if (pair[key].sampler.raycastObstacle(origin, dir, 1.2) !== null) hits++;
    return { ms: performance.now() - start, hits };
  };
  // Opt-in timed repetitions keep normal geometry checks lightweight.
  if (process.env.SF_BODY_BENCH === '1') {
    run('a'); run('b'); // untimed warm-up; alternating order thereafter
    for (let i = 0; i < 6; i++) for (const key of i % 2 ? ['b', 'a'] : ['a', 'b']) timing[key === 'a' ? 'baseline' : 'candidate'].push(run(key));
  }
  t.diagnostic('BODY_PARTITION_MEASUREMENT ' + JSON.stringify({ sourceSHA256: sha(source), siteSHA256: sha(siteSource), counts,
    differences, queriesPerSample: 3 * pairs.reduce((n, p) => n + p.queries.length, 0), timing,
    scope: 'Node native raycastObstacle, same actual features and measured pad planes; no renderer, browser, full-city timing or FPS claim. Timing is diagnostic, not a flaky hard assertion.' }));
});
