// CPU-only actual vendored Three + construction registry + sampler. No renderer/browser/GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
import { WHEEL, TERRAIN } from '../js/euc/data/tuning.js';

// Production keeps the browser import map; tests resolve its sole import to the exact vendor.
const source = readFileSync(new URL('../js/sf-skatepark-geometry.js', import.meta.url), 'utf8')
  .replace("from 'three/tsl'", `from '${new URL('../vendor/three/build/three.tsl.js', import.meta.url).href}'`);
const vendor = new URL('../vendor/three/build/three.webgpu.js', import.meta.url).href;
const kit = await import('data:text/javascript;base64,' + Buffer.from(source.replace("from 'three/webgpu'", `from '${vendor}'`)).toString('base64'));
const { buildSkateparkFeatures, createJeffersonRecipes, createPier62Recipes } = kit;
const near = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b} (±${e})`);
const frame = features => ({ id: 'test-un', x: -1987.2, z: 2034.7, y: 68.25, theta: .43, du: .021, ds: -.013, features });
const world = (site, u, s, h = 0) => ({ x: site.x + u * Math.cos(site.theta) + s * Math.sin(site.theta),
  y: site.y + (site.du ?? 0) * u + (site.ds ?? 0) * s + h, z: site.z - u * Math.sin(site.theta) + s * Math.cos(site.theta) });
const cross = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const triAt = (positions, i) => Array.from({ length: 3 }, (_, k) => ({ x: positions[i + k * 3], y: positions[i + k * 3 + 1], z: positions[i + k * 3 + 2] }));
function inside(poly, p, epsilon = 1e-9) {
  return poly.every((a, i) => cross(a, poly[(i + 1) % poly.length], p) <= epsilon) ||
    poly.every((a, i) => cross(a, poly[(i + 1) % poly.length], p) >= -epsilon);
}
function triangleHeight(tri, p) {
  const [a, b, c] = tri, determinant = cross(a, b, c);
  return a.y + (b.y - a.y) * cross(a, p, c) / determinant + (c.y - a.y) * cross(a, b, p) / determinant;
}
function fixture(site) {
  const city = {}, scene = new THREE.Scene(), calls = { tops: [], bodies: [], boxes: [] };
  vm.runInNewContext(readFileSync(new URL('../js/sf-ride-geometry.js', import.meta.url), 'utf8'), { window: { NYC: city } });
  const R = city.RideGeometry, addTriangles = R.addTriangles, addPrism = R.addPrism, addBox = R.addBox;
  R.addTriangles = (positions, indices, surface, options) => {
    const records = addTriangles(positions, indices, surface, options);
    calls.tops.push({ positions, indices, surface, options, records }); return records;
  };
  R.addPrism = (outer, minY, maxY, options) => {
    calls.bodies.push({ kind: 'prism', outer, minY, maxY, options }); return addPrism(outer, minY, maxY, options);
  };
  R.addBox = (centre, halfExtents, rotationY, options) => {
    const record = addBox(centre, halfExtents, rotationY, options);
    const body = { kind: 'box', centre, halfExtents, rotationY, options, record,
      outer: R.boxPoly(centre, halfExtents, rotationY), minY: centre.y - halfExtents.y, maxY: centre.y + halfExtents.y };
    calls.boxes.push(body); calls.bodies.push(body); return record;
  };
  const result = buildSkateparkFeatures(scene, site, city);
  const plane = result.floorEnvelope?.plane;
  const ground = (x, z) => plane ? plane.y + plane.dx * (x - plane.x) + plane.dz * (z - plane.z) : site.y;
  const terrain = { originX: site.x - 100, originZ: site.z - 100, cell: 100, w: 3, h: 3, waterLevel: 0,
    heights: Array.from({ length: 9 }, (_, k) => ground(site.x - 100 + k % 3 * 100, site.z - 100 + Math.floor(k / 3) * 100)) };
  const sampler = new SfTerrainSampler({ city, terrain, waterAt: () => false });
  return { city, scene, calls, result, sampler };
}
function dispose(result) {
  result.group?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
}
function triangles(calls) {
  return calls.tops.flatMap(call => [0, 9].map(i => ({ tri: triAt(call.positions, i), call })));
}

test('empty site bypasses scene/registry entirely; malformed recipes publish nothing', () => {
  const scene = new THREE.Scene(), site = frame([]), saved = structuredClone(site);
  const result = buildSkateparkFeatures(scene, site, {});
  assert.deepEqual(result, { group: null, features: [], floorEnvelope: null, counts: { topTriangles: 0, bodies: 0, meshes: 0 } });
  assert.equal(scene.children.length, 0); assert.deepEqual(site, saved);
  let registrations = 0;
  const city = { RideGeometry: { addTriangles() { registrations++; }, addPrism() { registrations++; }, addBox() { registrations++; } } };
  const good = createJeffersonRecipes().manualPad;
  for (const bad of [
    { ...good, kind: 'unknown' }, { ...good, height: NaN }, { ...good, u1: good.u0 }, { ...good, s1: good.s0 },
    { ...good, material: 'missing' }, { id: 'bad', kind: 'profile', u0: 0, u1: 1, points: [[0, 0], [0, 1]] },
    { id: 'bad', kind: 'profile', u0: 0, u1: 1, points: [[0, 0], [1, -1]] },
    { id: 'bad', kind: 'rail', points: [[0, 0, 1], [0, 0, 2]] },
    { ...createJeffersonRecipes().flatRail, posts: [{ u: 0, s: 0, height: .5, size: 0 }] }
  ]) assert.throws(() => buildSkateparkFeatures(scene, frame([good, bad]), city), TypeError);
  assert.throws(() => buildSkateparkFeatures(scene, frame([good, good]), city), TypeError);
  assert.equal(registrations, 0); assert.equal(scene.children.length, 0);
  const collapsed = frame([{ ...good, u0: 0, u1: 1e-10 }]);
  assert.throws(() => buildSkateparkFeatures(scene, collapsed, city), RangeError);
  assert.equal(registrations, 0); assert.equal(scene.children.length, 0);
});

test('tilted rotated profile drawing, exact Float32 facets, normals and capabilities agree', () => {
  const recipe = createJeffersonRecipes().doubleBank, site = frame([recipe]), saved = structuredClone(site);
  const { calls, city, result, sampler } = fixture(site);
  try {
    assert.deepEqual(site, saved);
    assert.equal(calls.tops.length, 3); assert.equal(city.ride.tops.length, 6);
    const drawn = new Set();
    for (const mesh of result.group.children) {
      assert.equal(mesh.material.isMeshStandardNodeMaterial, true);
      assert.match(mesh.material.name, /^sfSkatepark\.(concrete|slate|sides|metal)$/);
      assert.deepEqual(mesh.position.toArray(), [0, 0, 0]); assert.deepEqual(mesh.rotation.toArray().slice(0, 3), [0, 0, 0]);
      const positions = mesh.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 9) drawn.add(Array.from(positions.subarray(i, i + 9)).join(','));
      const normals = mesh.geometry.attributes.normal.array;
      for (let i = 0; i < normals.length; i += 3) near(Math.hypot(...normals.subarray(i, i + 3)), 1, 1e-6);
    }
    for (const [index, call] of calls.tops.entries()) {
      assert.ok(call.positions instanceof Float32Array); assert.equal(call.indices, null);
      assert.equal(call.surface, 'pavement'); assert.equal(call.options.merge, false);
      assert.equal(call.options.capabilities.feature, 'test-un-double-bank');
      assert.equal(call.options.capabilities.restartsAtRest, true);
      assert.equal(call.options.capabilities.transition, index === 1 ? undefined : 'slope', 'flat platform is not a transition despite site tilt');
      for (let i = 0; i < 18; i += 9) {
        assert.ok(drawn.has(Array.from(call.positions.subarray(i, i + 9)).join(',')), 'support triangle is the actual drawn triangle');
        const tri = triAt(call.positions, i), record = call.records[i / 9];
        assert.equal(record.poly.length, 3);
        for (const p of tri) {
          assert.ok(record.poly.some(q => q.x === p.x && q.z === p.z));
          const y = record.plane ? record.plane.y + record.plane.dx * (p.x - record.plane.x) + record.plane.dz * (p.z - record.plane.z) : record.top;
          near(y, p.y, 1e-10);
        }
        const centre = { x: tri.reduce((n, p) => n + p.x / 3, 0), z: tri.reduce((n, p) => n + p.z / 3, 0) };
        const expected = tri.reduce((n, p) => n + p.y / 3, 0), out = { normal: {}, base: { normal: {} } };
        sampler.sampleGround(centre.x, centre.z, out, expected);
        near(out.height, expected, 1e-9);
        const dx = record.plane.dx, dz = record.plane.dz, k = 1 / Math.hypot(dx, 1, dz);
        near(out.normal.x, -dx * k); near(out.normal.y, k); near(out.normal.z, -dz * k);
      }
    }
    const expected = world(site, recipe.u0, recipe.points[0][0], recipe.points[0][1]);
    assert.deepEqual(Array.from(calls.tops[0].positions.subarray(0, 3)), [Math.fround(expected.x), Math.fround(expected.y), Math.fround(expected.z)]);
    assert.equal(result.features.length, 1); assert.equal(result.features[0].footprints.length, 1);
    assert.ok(result.features[0].maxY > site.y + .55);
    assert.equal(result.floorEnvelope.polygons.length, 1);
    const p = world(site, 1.3, -2.1);
    const plane = result.floorEnvelope.plane;
    near(plane.y + plane.dx * (p.x - plane.x) + plane.dz * (p.z - plane.z), p.y);
  } finally { dispose(result); }
});

test('base-height profile bridges emit no drawing/support/body while keeping one combined feature envelope', () => {
  for (const base of [0, .25]) {
    const recipe = { id: 'paired', kind: 'profile', u0: -2, u1: 2, base,
      points: [[-4, base], [-3, base + .5], [-2, base], [2, base], [3, base + .5], [4, base]], smooth: true };
    const site = frame([recipe]), { calls, result } = fixture(site);
    const centre = world(site, 0, 0, base);
    try {
      assert.equal(calls.tops.length, 4); assert.equal(result.counts.topTriangles, 8);
      assert.equal(result.features.length, 1); assert.equal(result.features[0].feature, 'test-un-paired');
      assert.ok(inside(result.features[0].footprints[0], centre), 'combined metadata spans both halves');
      for (const mesh of result.group.children) {
        const p = mesh.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 9) {
          const tri = triAt(p, i);
          if (Math.abs(cross(...tri)) > 1e-8) assert.equal(inside(tri, centre), false, 'no drawn top/base bridge');
        }
      }
      for (const { tri } of triangles(calls)) assert.equal(inside(tri, centre), false, 'no registered bridge');
      for (const body of calls.bodies) assert.equal(inside(body.outer, centre), false, 'no bridge body');
      for (const { tri } of triangles(calls)) {
        const p = { x: tri.reduce((s, p) => s + p.x / 3, 0), z: tri.reduce((s, p) => s + p.z / 3, 0) };
        assert.ok(inside(result.features[0].footprints[0], p), 'surviving halves keep full metadata bounds');
      }
    } finally { dispose(result); }
  }
});

test('all profile and tilted pad bodies are inscribed, <=6 cm below roofs, <=3 cm floor-plane variation', () => {
  for (const recipe of [createJeffersonRecipes().doubleBank, createJeffersonRecipes().quarter, createPier62Recipes().roller,
    { id: 'tilted-pad', kind: 'pad', u0: -4, u1: 4, s0: -3, s1: 3, height: .24 }]) {
    const site = frame([recipe]), { calls, result } = fixture(site), topTriangles = triangles(calls);
    try {
      const bottomTriangles = result.group.children.flatMap(mesh => {
        const out = [], p = mesh.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 9) {
          const tri = triAt(p, i);
          if (cross(...tri) > 1e-12) out.push(tri); // actual downward-facing drawn base facets
        }
        return out;
      });
      assert.ok(calls.bodies.length > 2, 'tilted bodies are subdivided in both plane directions');
      for (const b of calls.bodies) {
        assert.equal(b.options.support, false); assert.equal(b.options.wheelSweep, undefined);
        assert.ok(b.minY < b.maxY);
        const matching = topTriangles.filter(t => b.outer.every(p => inside(t.tri, p, 1e-8)));
        assert.ok(matching.length, 'entire body cell is inside one actual Float32 top triangle');
        const roof = matching[0].tri, plane = result.floorEnvelope.plane;
        const drawnBase = bottomTriangles.find(tri => b.outer.every(p => inside(tri, p, 1e-8)));
        assert.ok(drawnBase, 'body cell lies in an actual drawn base facet');
        const floorY = p => plane.y + plane.dx * (p.x - plane.x) + plane.dz * (p.z - plane.z);
        const floors = b.outer.map(p => triangleHeight(drawnBase, p));
        assert.ok(Math.max(...floors) - Math.min(...floors) <= .03000001, 'floor variation bounded, not one large tilted-pad lid');
        for (const p of b.outer) {
          const topY = triangleHeight(roof, p);
          assert.ok(b.maxY <= topY + 1e-9, `body roof protrudes: ${b.maxY} > ${topY}`);
          assert.ok(topY - b.maxY <= .06002, `side missing over 6 cm: ${topY - b.maxY}`);
          assert.ok(b.minY >= floorY(p) - .00002, 'body bottom is inside Float32 drawn base');
          assert.ok(b.minY >= triangleHeight(drawnBase, p) - 1e-9, 'body bottom does not protrude below actual base');
        }
      }
      assert.ok(calls.bodies.every(b => b.maxY < result.features[0].maxY), 'horizontal body roofs never become support lids');
    } finally { dispose(result); }
  }
});

test('central bypass has no invented park-sized drawing, support or body', () => {
  const recipe = createJeffersonRecipes().doubleBank;
  const site = frame([{ ...recipe, id: 'left', u0: -11, u1: -3 }, { ...recipe, id: 'right', u0: 3, u1: 11 }]);
  const { result, calls, sampler } = fixture(site);
  try {
    for (const s of [0, 2, 4, 6, 9]) {
      const p = world(site, 0, s);
      assert.ok(calls.bodies.every(b => !inside(b.outer, p)));
      assert.ok(triangles(calls).every(t => !inside(t.tri, p)));
      assert.ok(result.features.every(f => f.footprints.every(poly => !inside(poly, p))));
      const out = { normal: {}, base: { normal: {} } }; sampler.sampleGround(p.x, p.z, out, p.y);
      near(out.height, p.y);
      assert.equal(sampler.raycastObstacle({ ...p, y: p.y + .2 }, { x: 0, y: 0, z: 1 }, 2), null);
    }
    assert.equal(result.floorEnvelope.polygons.length, 2, 'metadata preserves disjoint footprints');
  } finally { dispose(result); }
});

test('elevated bars use tagged actual BOX bodies, posts stay prisms and ordinary rays remain thin at SF Y', () => {
  const rail = createJeffersonRecipes().flatRail, site = frame([rail]);
  const { result, calls, sampler } = fixture(site);
  try {
    assert.equal(result.group.children.length, 1); assert.equal(result.group.children[0].material.name, 'sfSkatepark.metal');
    assert.equal(calls.tops.length, 3, 'one bar and two real post tops');
    const bars = calls.bodies.filter(b => b.options.wheelSweep), posts = calls.bodies.filter(b => !b.options.wheelSweep);
    assert.ok(bars.length > 0); assert.ok(posts.length > 0);
    assert.equal(bars.length, calls.boxes.length);
    assert.ok(bars.every(b => b.kind === 'box' && b.record.wheelSweep === true && b.record.support === false));
    assert.ok(posts.every(b => b.kind === 'prism'));
    assert.equal(sampler.stats.boxes, bars.length); assert.ok(sampler.wheelBoxes);
    assert.ok(bars.every(b => b.options.source.endsWith(':bar'))); assert.ok(posts.every(b => b.options.source.endsWith(':post')));
    assert.ok(calls.bodies.every(b => b.minY > 67 && b.maxY > 68), 'no accidental NYC sea-level rails');
    const drawn = result.group.children[0].geometry.attributes.position.array;
    for (const call of calls.tops) for (const value of call.positions) assert.ok(Number.isFinite(value));
    for (let i = 0; i < drawn.length; i += 3) assert.ok(drawn[i + 1] > 67);
    const across = { x: Math.cos(site.theta), y: 0, z: -Math.sin(site.theta) };
    const at = (u, s, h) => world(site, u, s, h);
    const under = at(-1, 2, .15), mid = at(-1, 2, rail.points[0][2] - rail.thickness / 2);
    assert.equal(sampler.raycastObstacle(under, across, 2), null, 'empty air under bar between posts is not a broad solid');
    const hit = sampler.raycastObstacle(mid, across, 2);
    assert.ok(hit !== null); near(hit, 1 - rail.width / 2, .0005);
    const above = at(-1, 2, .6);
    assert.equal(sampler.raycastObstacle(above, across, 2), null, 'ordinary rays do not use wheel volume expansion');
    const postRay = at(-1, .3, .15);
    assert.ok(sampler.raycastObstacle(postRay, across, 2) !== null, 'real rail post is physical');
    for (const bar of bars) for (const p of bar.outer) {
      const top = triangles(calls).find(t => t.call.options.source.endsWith(':bar') && inside(t.tri, p, 1e-8));
      assert.ok(top); assert.ok(bar.maxY <= triangleHeight(top.tri, p) + 1e-8);
      assert.ok(bar.minY >= triangleHeight(top.tri, p) - rail.thickness - .00002);
    }
  } finally { dispose(result); }
});

function intersection(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, q = { x: c.x - a.x, z: c.z - a.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-14) return null;
  const t = (q.x * s.z - q.z * s.x) / den, u = (q.x * r.z - q.z * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, z: a.z + t * r.z } : null;
}

test('tilted sloping rail OBB cells are inscribed in actual Float32 upper/lower facets, never triangle AABBs', () => {
  const recipes = [createJeffersonRecipes().flatRail, createJeffersonRecipes().handrail, createPier62Recipes().flatRail,
    { id: 'diagonal', kind: 'rail', points: [[-.3, 1, .8], [2.1, 6, 1.4]], width: .08, thickness: .08 }];
  for (const recipe of recipes) for (const pose of [{}, { x: 5678.75, z: -16384.1, y: 154.8, theta: -1.1, du: -.033, ds: .017 }]) {
    const site = { ...frame([recipe]), ...pose }, { result, calls, sampler } = fixture(site);
    try {
      assert.ok(calls.boxes.length > 0);
      const topCalls = calls.tops.filter(t => t.options.source.endsWith(':bar'));
      const positions = result.group.children[0].geometry.attributes.position.array, bottoms = [];
      for (let i = 0; i < positions.length; i += 9) {
        const tri = triAt(positions, i); if (cross(...tri) > 1e-12) bottoms.push(tri);
      }
      for (const b of calls.boxes) {
        const call = topCalls.find(t => {
          const q = [...triAt(t.positions, 0), triAt(t.positions, 9)[2]];
          return b.outer.every(p => inside(q, p, 1e-8));
        });
        assert.ok(call, 'all OBB corners stay inside the actual beam, not a triangle bounding rectangle');
        const top = [triAt(call.positions, 0), triAt(call.positions, 9)];
        const base = top.map(tri => bottoms.find(bottom => tri.every(p => bottom.some(q => q.x === p.x && q.z === p.z))));
        assert.ok(base.every(Boolean));
        const points = b.outer.slice(), a = top[0][0], c = top[0][2];
        for (let i = 0; i < b.outer.length; i++) {
          const p = intersection(b.outer[i], b.outer[(i + 1) % b.outer.length], a, c); if (p) points.push(p);
        }
        const heights = points.map(p => {
          const i = top.findIndex(tri => inside(tri, p, 1e-8)); assert.notEqual(i, -1);
          return { top: triangleHeight(top[i], p), base: triangleHeight(base[i], p) };
        });
        const roof = heights.map(p => p.top), floor = heights.map(p => p.base);
        const thickness = Math.min(...heights.map(p => p.top - p.base));
        assert.ok(b.maxY <= Math.min(...roof) + 1e-9, 'box roof never protrudes above the actual top');
        assert.ok(b.minY >= Math.max(...floor) - 1e-9, 'box bottom never protrudes below the actual lower face');
        assert.ok(Math.max(...roof) - Math.min(...roof) < thickness / 2);
        assert.ok(Math.max(...floor) - Math.min(...floor) < thickness / 2);
        assert.ok(Math.max(...roof) - Math.min(...roof) <= .06);
        assert.ok(Math.max(...floor) - Math.min(...floor) <= .03);
        assert.ok(Math.max(...roof) - b.maxY < thickness / 2);
        assert.ok(b.minY - Math.min(...floor) < thickness / 2);
        // Its long axis follows this actual bar's endpoint midpoints even after site yaw.
        const q0 = top[0][0], q1 = top[0][1], q2 = top[0][2], q3 = top[1][2];
        const dx = (q1.x + q2.x - q0.x - q3.x) / 2, dz = (q1.z + q2.z - q0.z - q3.z) / 2;
        near(Math.sin(b.rotationY), dx / Math.hypot(dx, dz), 1e-10);
        near(Math.cos(b.rotationY), dz / Math.hypot(dx, dz), 1e-10);
        const actual = sampler.boxRecords.find(r => r.collider.centre.x === b.centre.x && r.collider.centre.z === b.centre.z).collider;
        near(actual.halfExtents.y, b.halfExtents.y, 1e-12); near(actual.centre.y, b.centre.y, 1e-12);
      }
    } finally { dispose(result); }
  }
});

test('built recipe reaches native bidirectional wheel-shell query while ordinary rays stay below thin bars', () => {
  const rail = createJeffersonRecipes().flatRail, site = frame([rail]), { result, sampler, calls } = fixture(site);
  try {
    const pedal = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor + 1e-6;
    const across = { x: Math.cos(site.theta), y: 0, z: -Math.sin(site.theta) };
    for (const side of [-1, 1]) {
      const origin = world(site, -side, 2, pedal), dir = { x: side * across.x, y: 0, z: side * across.z };
      assert.equal(sampler.raycastObstacle(origin, dir, 2), null);
      assert.equal(sampler.raycast(origin, dir, 2), null);
      const shell = sampler.raycastWheelObstacle(origin, dir, 2);
      assert.ok(shell !== null); near(shell, 1 - rail.width / 2, .0005);
      assert.equal(sampler.raycastWheelObstacle({ ...origin, y: origin.y + 1 }, dir, 2), null);
    }
    // Ordinary standing/clearance volumes below the real bar keep actual physical bounds.
    const p = world(site, 0, 2);
    assert.equal(sampler.isVolumeClear({ x: p.x, z: p.z, headingY: site.theta, halfWidthMetres: .02, halfLengthMetres: .02,
      minY: p.y + .05, maxY: p.y + .3, floorY: p.y }), true);
    const untagged = new SfTerrainSampler({ terrain: sampler.terrain, waterAt: () => false,
      boxes: calls.boxes.map(b => ({ ...b.record, wheelSweep: false })) });
    assert.equal(untagged.raycastWheelObstacle(world(site, -1, 2, pedal), across, 2), null);
  } finally { dispose(result); }
});

test('axis-aligned native controller stops outside built tilted recipe from both sides and clears it with a charged hop', () => {
  const rail = createJeffersonRecipes().flatRail, site = { ...frame([rail]), theta: 0 }, { result, sampler } = fixture(site);
  const localU = p => (p.x - site.x) * Math.cos(site.theta) - (p.z - site.z) * Math.sin(site.theta);
  try {
    for (const direction of [-1, 1]) {
      const c = new EucController(sampler, { spawn: { position: world(site, -direction * 2, 2), headingY: site.theta + direction * Math.PI / 2 } });
      for (let i = 0; i < 720 && !c.crashed; i++) c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: .2 });
      const u = localU(c.snapshot().position);
      assert.ok(direction * u > -1, 'controller reaches the actual rail approach');
      assert.ok(direction * u <= -.27, `wheel shell overlaps beam from side ${direction}: ${u}`);
    }
    const c = new EucController(sampler, { spawn: { position: world(site, -8, 2), headingY: site.theta + Math.PI / 2 } });
    let hopped = false;
    for (let i = 0; i < 600 && !c.crashed; i++) {
      const hop = !hopped && localU(c.snapshot().position) > -1.8 && c.canAcceptHop;
      if (hop) hopped = true;
      c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: .35, crouch: !hopped, hop, hopHeld: hop });
      if (localU(c.snapshot().position) > 1) break;
    }
    assert.ok(hopped); assert.equal(c.crashed, false); assert.ok(localU(c.snapshot().position) > 1);
  } finally { dispose(result); }
});

test('oblique native controller stopping matches a donor-style thin OBB control', () => {
  // Native world-axis sliding can stop closer at oblique yaw than its cardinal
  // wheel-radius threshold. This comparison records that boundary rather than
  // inflating the kit's ordinary bar geometry to hide controller behavior.
  const rail = createJeffersonRecipes().flatRail, site = frame([rail]), { result, sampler } = fixture(site);
  const localU = p => (p.x - site.x) * Math.cos(site.theta) - (p.z - site.z) * Math.sin(site.theta);
  const centre = world(site, 0, 2, rail.points[0][2] - rail.thickness / 2);
  const control = new SfTerrainSampler({ terrain: sampler.terrain, waterAt: () => false, boxes: [{ centre,
    halfExtents: { x: rail.width / 2, y: rail.thickness / 2, z: 2 }, rotationY: site.theta, support: false, wheelSweep: true }] });
  try {
    for (const direction of [-1, 1]) {
      const stopped = [];
      for (const terrain of [sampler, control]) {
        const c = new EucController(terrain, { spawn: { position: world(site, -direction * 2, 2), headingY: site.theta + direction * Math.PI / 2 } });
        for (let i = 0; i < 720 && !c.crashed; i++) c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: .2 });
        assert.equal(c.crashed, false);
        stopped.push(localU(c.snapshot().position));
      }
      near(stopped[0], stopped[1], .0005); // only the drawn Float32 corner insetting may differ
      assert.ok(direction * stopped[0] < -rail.width / 2, 'the native controller stays outside the actual thin bar');
    }
  } finally { dispose(result); }
});

test('actual UN rail native queries, blocking, hops and submitted-view contracts', { timeout: 30000 }, async t => {
  // Read the parent's real small site specs without constructing a city, floor,
  // actors or renderer. The compact affine floor continues the measured pad plane;
  // this is NOT validation of the whole court, apron, browser rig or all eleven looks.
  const siteSource = readFileSync(new URL('../js/sf-skateparks.js', import.meta.url), 'utf8');
  const featureURL = 'data:text/javascript;base64,' + Buffer.from(source.replace("from 'three/webgpu'", `from '${vendor}'`)).toString('base64');
  let siteModule = siteSource.replace("from 'three/webgpu'", `from '${vendor}'`)
    .replace("from './sf-skatepark-geometry.js'", `from '${featureURL}'`);
  for (const file of ['sf-terrain-sampler.js', 'euc-recovery.js']) {
    siteModule = siteModule.replace(`from './${file}'`, `from '${new URL('../js/' + file, import.meta.url).href}'`);
  }
  const { SF_SKATEPARKS } = await import('data:text/javascript;base64,' + Buffer.from(siteModule).toString('base64'));
  const un = SF_SKATEPARKS.find(s => s.id === 'un-plaza'), pad = un?.pads.find(p => p.id === 'rail');
  assert.ok(pad, 'actual UN rail pad exists');
  const finish = Number(/const FINISH = ([\d.]+);/.exec(siteSource)?.[1]);
  assert.ok(Number.isFinite(finish), 'use the actual builder finish, not an estimated floor offset');
  const cs = Math.cos(un.frame.theta), sn = Math.sin(un.frame.theta);
  const site = { id: 'un-plaza-rail', x: un.frame.x + pad.u * cs + pad.s * sn,
    z: un.frame.z - pad.u * sn + pad.s * cs, theta: un.frame.theta,
    y: pad.plane.y + finish, du: pad.plane.du, ds: pad.plane.ds, features: pad.features };
  assert.equal(site.features.length, 1); assert.equal(site.features[0].kind, 'rail');
  const actual = fixture(site), rail = site.features[0], bars = actual.calls.boxes.filter(b => b.options.wheelSweep);
  assert.ok(actual.calls.boxes.some(b => b.record.wheelSweep === true));
  const physics = await import('../js/euc/simulation/EucController.js');
  const local = (f, p) => ({ u: (p.x - f.x) * Math.cos(f.theta) - (p.z - f.z) * Math.sin(f.theta),
    s: (p.x - f.x) * Math.sin(f.theta) + (p.z - f.z) * Math.cos(f.theta) });
  const samples = [];
  try {
    await t.test('wheel-only shell rays preserve actual thin ordinary bars, support and under-bar air', () => {
      const sampler = actual.sampler, across = { x: cs, y: 0, z: -sn };
      for (const direction of [-1, 1]) {
        const origin = world(site, -direction, 0, WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor + 1e-6);
        const ray = { x: direction * across.x, y: 0, z: direction * across.z };
        assert.equal(sampler.raycastObstacle(origin, ray, 2), null);
        assert.equal(sampler.raycast(origin, ray, 2), null);
        near(sampler.raycastWheelObstacle(origin, ray, 2), 1 - rail.width / 2, .0005);
        // Aim at actual bar elevation, not a ray following a different origin's floor Y.
        const thin = { ...origin, y: world(site, 0, 0, rail.points[0][2] - rail.thickness / 2).y };
        near(sampler.raycastObstacle(thin, ray, 2), 1 - rail.width / 2, .0005);
      }
      const call = actual.calls.tops.find(t => t.options.source.endsWith(':bar')), tri = triAt(call.positions, 0);
      const cap = { x: tri.reduce((sum, p) => sum + p.x / 3, 0), z: tri.reduce((sum, p) => sum + p.z / 3, 0) };
      const expected = tri.reduce((sum, p) => sum + p.y / 3, 0), sample = { normal: {} };
      sampler.sampleGround(cap.x, cap.z, sample, expected); near(sample.height, expected, 1e-8);
      const under = world(site, 0, 0);
      assert.equal(sampler.isVolumeClear({ x: under.x, z: under.z, headingY: site.theta,
        halfWidthMetres: .02, halfLengthMetres: .02, minY: under.y + .05, maxY: under.y + .3, floorY: under.y }), true);
    });
    // This is a native blocking/contact contract, NOT an arbitrary-heading .27m
    // envelope certificate. The original strict cardinal test above stays intact.
    for (const throttle of [.2, .5]) for (const direction of [-1, 1]) {
      for (const degrees of [0, -30, 30]) await t.test(`native core blocks: throttle=${throttle} direction=${direction} angle=${degrees}`, () => {
        const angle = degrees * Math.PI / 180;
        const c = new EucController(actual.sampler, { spawn: { position: world(site, -direction * 2, direction * 2 * Math.tan(angle)),
          headingY: site.theta + direction * Math.PI / 2 + angle } });
        let first = null, minimum = Infinity, final;
        const pose = physics.createPose();
        for (let tick = 0; tick < 720; tick++) {
          const before = c.snapshot(); c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle });
          const state = c.snapshot(), p = local(site, state.position);
          if (state.blocked && first === null) first = tick;
          if (Math.abs(p.s) <= 2) {
            assert.ok(-direction * p.u > 0, 'grounded controller core must not cross the finite bar centreline');
            assert.ok(bars.every(b => !inside(b.outer, state.position, 1e-10)), 'controller core must not enter an actual thin bar footprint');
            if (-direction * p.u < minimum) { minimum = -direction * p.u; c.writePose(pose); }
          }
          final = { ...p, crashed: c.crashed, speed: state.speed };
          if (c.crashed) {
            assert.equal(state.crashCause, 'obstacle'); assert.ok(state.blocked);
            const origin = { ...before.position, y: world(site, 0, p.s, rail.points[0][2] - rail.thickness / 2).y };
            assert.ok(actual.sampler.raycastObstacle(origin, { x: direction * cs, y: 0, z: -direction * sn }, 1) !== null,
              'a permitted obstacle crash must have an actual thin physical bar within contact reach');
            break;
          }
          if (first !== null && tick >= first + 120) break;
        }
        assert.notEqual(first, null, 'native blocking must engage'); assert.ok(minimum < 1, 'rider reaches the bar approach');
        samples.push({ throttle, direction, degrees, minimum, final, pose });
      });
    }
    for (const direction of [-1, 1]) await t.test(`charged hop clears actual rail direction=${direction}`, () => {
      const c = new EucController(actual.sampler, { spawn: { position: world(site, -direction * 8, 0), headingY: site.theta + direction * Math.PI / 2 } });
      let hopped = false, launched = false, crossing = null;
      for (let tick = 0; tick < 600 && !c.crashed; tick++) {
        const before = c.snapshot(), beforeU = local(site, before.position).u;
        const hop = !hopped && direction * beforeU > -1.8 && c.canAcceptHop;
        if (hop) hopped = true;
        c.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: .35, crouch: !hopped, hop, hopHeld: hop });
        const state = c.snapshot(), u = local(site, state.position).u;
        launched ||= state.hops > 0;
        if (!crossing && direction * u >= 0) {
          crossing = { tick, speed: state.speed, airHeight: state.airHeight };
        }
        if (direction * u > 1) break;
      }
      assert.ok(hopped && launched); assert.equal(c.crashed, false); assert.ok(direction * local(site, c.snapshot().position).u > 1);
      assert.ok(crossing && crossing.airHeight > 0);
    });
    await t.test('real prepareView executes generated near-solids and selected rig without physical mutation', async view => {
      // Same injected-host pattern as the existing SF entity tests. Physics,
      // appearance, rig, near-solid helper and prepareView are all production;
      // only lighting/city-uniform services are CPU stand-ins (no renderer/GPU).
      const [roster, preparation, tricks, clearance, recovery, tuning, rigModule, appearanceModule, looks, machines] = await Promise.all([
        import('../js/euc-roster.js'), import('../js/rider-preparation.js'), import('../js/euc-tricks.js'),
        import('../js/euc/app/nearSolids.js'), import('../js/euc-recovery.js'), import('../js/euc/data/tuning.js'),
        import('../js/euc/render/ridingRig.js'), import('../js/euc/render/appearanceLoader.js'),
        import('../js/euc/render/riderLook.js'), import('../js/euc/render/machineLook.js')
      ]);
      const measured = [];
      const bindings = { ...physics, ...roster, ...preparation, ...tricks, ...clearance, ...recovery, ...tuning, THREE, NEUTRAL_ACTIONS,
        ...rigModule, ...looks, ...machines, ...appearanceModule,
        getCity: () => ({ cityUniforms: { uInteriorGlow: { value: 0 } } }), EUC_HEADLIGHT: {},
        headlightBeamScale: () => 0, placeEucHeadlight() {},
        createEucHeadlight: () => Object.assign(new THREE.Object3D(), { target: new THREE.Object3D() }),
        measureNearSolids(sampler, pose, out, radius) {
          const result = clearance.measureNearSolids(sampler, pose, out, radius);
          measured.push({ radius, lift: out.lift, along: out.along, finiteFaces: out.faces.filter(Number.isFinite).length });
          return result;
        } };
      const entitySource = readFileSync(new URL('../js/euc-rider.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export \{.*\};\n/gm, '').replace(/^export /gm, '');
      const create = new Function(...Object.keys(bindings), entitySource + '\nreturn createEucEntity;')(...Object.values(bindings));
      const appearance = await appearanceModule.prepareAppearance('cool-rider', { prepaint: false });
      const p = world(site, -2, 0), entity = create(new THREE.Scene(), actual.sampler, { ...p, heading: site.theta + Math.PI / 2, appearance });
      const ordinary = actual.sampler.raycastObstacle, wheel = actual.sampler.raycastWheelObstacle;
      let ordinaryCasts = 0;
      actual.sampler.raycastObstacle = function (...args) { ordinaryCasts++; assert.equal(args[3], 0); return ordinary.apply(this, args); };
      actual.sampler.raycastWheelObstacle = () => { throw Error('prepareView must not use the wheel-only shell envelope'); };
      const observations = [];
      try {
        for (const [index, sample] of samples.entries()) {
          physics.copyPose(sample.pose, entity.pose);
          entity.rig.setNearSolids(0, [], 0, 0); entity.rig.apply(entity.pose);
          const before = structuredClone(entity.controller.snapshot()), poseBefore = structuredClone(entity.pose), casts = ordinaryCasts;
          entity.prepareView(1000 + index * 1000 / 60);
          assert.deepEqual(entity.controller.snapshot(), before); assert.deepEqual(entity.pose, poseBefore);
          assert.equal(ordinaryCasts - casts, tuning.NEAR_SOLID.bandHeights.length * tuning.NEAR_SOLID.directions);
          assert.equal(measured.at(-1).radius, entity.rig.visualTyreRadius);
          assert.ok(entity.rig.group.position.toArray().every(Number.isFinite));
          assert.ok(entity.rig.nearPush.every(Number.isFinite));
          observations.push({ throttle: sample.throttle, direction: sample.direction, degrees: sample.degrees,
            ...measured.at(-1), push: [...entity.rig.nearPush] });
        }
        view.diagnostic('CPU_PREPARE_VIEW_OBSERVATION ' + JSON.stringify({ observations, bands: tuning.NEAR_SOLID.bandHeights,
          scope: 'production submitted-view pipeline exercised with a real Cool Rider rig; no full-vertex/pixel clearance certificate; actual angle behavior remains browser/manual owner playtest' }));
      } finally {
        actual.sampler.raycastObstacle = ordinary; actual.sampler.raycastWheelObstacle = wheel;
        await entity.dispose(); appearanceModule.releaseAppearanceCaches();
      }
    });
    t.diagnostic('Native blocking accepted only for these bounded inputs; arbitrary-heading .27m/render-envelope acceptance is not asserted.');
  } finally { dispose(actual.result); }
});

test('smooth recipes retain NYC averaged profile normals through tilted yaw', () => {
  const recipe = createJeffersonRecipes().quarter, site = frame([recipe]), { result } = fixture(site);
  try {
    const normals = result.group.children.find(m => m.material.name.endsWith('.concrete')).geometry.attributes.normal.array;
    const slope = i => (recipe.points[i + 1][1] - recipe.points[i][1]) / (recipe.points[i + 1][0] - recipe.points[i][0]);
    const m = (slope(0) + slope(1)) / 2, nu = -site.du, ns = -site.ds - m, k = 1 / Math.hypot(nu, 1, ns);
    const expected = [(nu * Math.cos(site.theta) + ns * Math.sin(site.theta)) * k, k, (-nu * Math.sin(site.theta) + ns * Math.cos(site.theta)) * k];
    for (let i = 0; i < 3; i++) near(normals[3 + i], expected[i], 1e-7);
    // End of first segment == start of second segment; no rendered normal seam.
    assert.deepEqual(Array.from(normals.subarray(3, 6)), Array.from(normals.subarray(18, 21)));
  } finally { dispose(result); }
});

test('zero-tilt defaults and a ground-level bar do not create transition or wheel-sweep policies', () => {
  const site = { id: 'level', x: 1200, z: -1800, y: 93, theta: -.78, features: [
    { id: 'bar', kind: 'rail', points: [[0, 0, .08], [2, 0, .08]], width: .08, thickness: .08 },
    { id: 'deck', kind: 'pad', u0: -2, u1: -1, s0: 0, s1: 1, height: .3 }
  ] };
  const { calls, result } = fixture(site);
  try {
    assert.ok(calls.bodies.length > 0);
    assert.ok(calls.bodies.every(b => !b.options.wheelSweep));
    assert.ok(calls.tops.every(t => t.options.capabilities.transition === undefined));
    near(result.floorEnvelope.minY, 93); near(result.floorEnvelope.maxY, 93);
    assert.ok(calls.tops.every(t => Array.from(t.positions).every(Number.isFinite)));
  } finally { dispose(result); }
});

test('factories are fresh independent feature recipes with donor dimensions, not relocated courses', () => {
  const j = createJeffersonRecipes(), p = createPier62Recipes();
  assert.equal(j.doubleBank.u1 - j.doubleBank.u0, 7.5); assert.deepEqual(j.doubleBank.points, [[0, 0], [2.5, .6], [5, .6], [7.5, 0]]);
  assert.equal(j.roller.points.length, 21); near(j.roller.points[10][1], .4);
  assert.equal(j.steps.length, 4); near(j.steps[3].height, .15);
  assert.equal(j.manualPad.s1, 3); assert.equal(j.manualPad.height, .16);
  assert.equal(p.roller.points.length, 17); near(p.roller.points[8][1], .65);
  assert.deepEqual(p.farBank.points, [[0, 0], [3, .75], [6, .75], [9, 0]]);
  near(p.quarter.points.at(-1)[1], 1.2); near(p.returnQuarter.points.at(-1)[1], 1.5);
  assert.equal(p.returnQuarter.u1 - p.returnQuarter.u0, 19); assert.equal(p.ledge.height, .4);
  j.quarter.points[1][1] = 999; p.flatRail.posts[0].height = 999;
  assert.notEqual(createJeffersonRecipes().quarter.points[1][1], 999); assert.notEqual(createPier62Recipes().flatRail.posts[0].height, 999);
  for (const family of [createJeffersonRecipes(), createPier62Recipes()]) for (const recipe of Object.values(family).flat()) {
    assert.ok(!('x' in recipe) && !('z' in recipe) && !('floor' in recipe));
    const { result } = fixture(frame([recipe]));
    assert.ok(result.counts.topTriangles > 0); assert.ok(result.counts.bodies > 0);
    dispose(result);
  }
});
