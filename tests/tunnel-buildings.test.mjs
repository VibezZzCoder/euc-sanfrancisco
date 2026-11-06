// CPU-only actual building/grade geometry and native sampler controls. No browser,
// GPU, production hooks, geographic regeneration or edits to the shared tunnel tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hash = a => createHash('sha256').update(bytes(a)).digest('hex');
const source = read('js/buildings.js');
const utilsSource = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js')
  .replace(/import \{([^]*?)\} from 'three';/, 'const {$1} = THREE;').replace(/export \{([^]*?)\};/, 'return {$1};');
const utils = vm.runInNewContext(`(function(){${utilsSource}})()`, { THREE });
const bin = name => {
  const b = readFileSync(new URL(`data/${name}-core.bin`, root)), n = b.readUInt32LE(4);
  return { header: JSON.parse(b.toString('utf8', 8, 8 + n)), buffer: b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length) };
};
const atBlocker = (x, z) => Math.abs(x + 833.361328125) < .0001 && Math.abs(z + 938.3668823242188) < .0001;
const native = (colliders, solids = [], prisms = []) => new SfTerrainSampler({ terrain: null,
  colliders: colliders.flatMap(c => c.parts || [c]), ride: { tops: [], solids, prisms } });
const snapshots = mesh => ({ mesh, count: mesh.count, matrix: mesh.instanceMatrix.array.slice(),
  attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([k, a]) => [k, a.array.slice()])),
  index: hash(mesh.geometry.index.array) });

let cached;
function world() {
  if (cached) return cached;
  const N = { THREE, TSL, Addons: utils, DEBUG_ROADS: false };
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: N }, console: { info() {} }, document: { createElement: () => ({
    getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) } });
  const load = name => vm.runInContext(read(`js/${name}.js`), context, { filename: `js/${name}.js` });
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'sf-ride-geometry', 'tsl-materials', 'sf-style', 'sf-buildings', 'road-network', 'buildings']) load(name);
  const terrain = bin('terrain'); N.Terrain.load(terrain.header, new Uint16Array(terrain.buffer)); N.Terrain.patchesEnabled = false;
  const building = bin('buildings'), h = building.header;
  N.DATA = { buildings: { header: h, table: new Float32Array(building.buffer, 0, h.tableFloats),
    verts: new Float32Array(building.buffer, h.tableFloats * 4, h.vertexFloats),
    masses: new Float32Array(building.buffer, (h.tableFloats + h.vertexFloats) * 4, h.massFloats) } };
  const scene = new THREE.Group(), city = N.buildCityBlocks(scene);
  // Production navigation includes the non-OBB building reservations. Bores retain
  // road-network's explicit obstacle omission; the finalizer never rebuilds it.
  const net = N.buildRoadNetwork(N.BLOCKS.map(block => ({ ...block, block })), city.colliders.filter(c => !c.obb));
  load('grade-separation');
  // As main.js: building masses let the approach under this building get its slab and portal frame.
  const structureBodies = [], addBox = N.RideGeometry.addBox;
  N.RideGeometry.addBox = (...args) => { const body = addBox(...args); if (body && args[3]?.source !== 'grade:slab') structureBodies.push(body); return body; };
  let grade;
  try { grade = N.buildGradeSeparation(scene, net, { structures: city.colliders.filter(c => c.obb) }); }
  finally { N.RideGeometry.addBox = addBox; }
  const batches = city.group.children.filter(m => m.isInstancedMesh && m.geometry.attributes.box).map(snapshots);
  const main = city.colliders.filter(c => c.obb && atBlocker(c.obb.cx, c.obb.cz));
  assert.equal(main.length, 1, 'the reported source mass is unique');
  const foundation = N.ride.solids.filter(c => atBlocker(c.centre.x, c.centre.z) && c.halfExtents.y === .5);
  assert.equal(foundation.length, 1);
  const before = native(structuredClone(main), foundation);
  const walls = [], matrix = new THREE.Matrix4();
  for (const s of batches) for (let i = 0; i < s.count; i++) {
    s.mesh.getMatrixAt(i, matrix);
    if (!atBlocker(matrix.elements[12], matrix.elements[14])) continue;
    const g = s.mesh.geometry.clone();
    for (const [k, a] of Object.entries(g.attributes)) if (a.isInstancedBufferAttribute)
      g.setAttribute(k, new THREE.InstancedBufferAttribute(a.array.slice(i * a.itemSize, (i + 1) * a.itemSize), a.itemSize));
    const m = new THREE.InstancedMesh(g, s.mesh.material, 1); m.setMatrixAt(0, matrix); m.updateMatrixWorld(true);
    walls.push(m); s.removed = i;
  }
  assert.equal(walls.length, 1);
  const oldColliders = city.colliders.map(c => digest(c)), oldSolids = N.ride.solids.slice();
  const oldPrisms = N.ride.prisms.slice(), tops = digest(N.ride.tops), graph = graphDigest(net);
  const start = performance.now(), stats = city.finishTunnelOpenings(grade), elapsed = performance.now() - start;
  const final = city.group.children.filter(m => m.name === 'SFBuildingTunnelOpening');
  city.group.updateMatrixWorld(true);
  const after = native(main, [], N.ride.prisms.slice(oldPrisms.length));
  return cached = { N, load, context, city, scene, net, grade, structureBodies, batches, before, after, main, foundation, walls, final,
    oldColliders, oldSolids, oldPrisms, tops, graph, stats, elapsed };
}
function graphDigest(net) {
  return digest(net.edges.map(e => ({ id: e.id, x: e.x0, z: e.z0, len: e.len, lanes: [...e.lanes],
    prof: [...e.prof], laneProf: e.laneProf.map(p => [...p]), moves: e.moves.map(m => [m.to.id, [...m.out]]) })));
}
const ray = (objects, from, direction, distance) => new THREE.Raycaster(new THREE.Vector3(from.x, from.y, from.z),
  new THREE.Vector3(direction.x, direction.y, direction.z).normalize(), 0, distance).intersectObjects(objects, false);

test('actual complete core building construction: only the source-proven Broadway mass/foundation changes', t => {
  const w = world();
  t.diagnostic(JSON.stringify({ buildings: w.city.allBlocks.length, colliders: w.city.colliders.length,
    ...w.stats, finalizationMs: w.elapsed, changed: w.city.colliders.filter(c => c.parts).map(c => ({ obb: c.obb, minY: c.minY, maxY: c.maxY,
      parts: c.parts.length, heights: [...new Set(c.parts.flatMap(p => [p.minY, p.maxY]))] })) }));
  assert.deepEqual({ ...w.stats }, { masses: 1, parts: w.stats.parts, foundations: 1 });
  assert.ok(w.stats.parts >= 3 && w.stats.parts < 100, 'bounded notched parts, never whole-building deletion');
  assert.equal(w.final.length, 1);
  assert.equal(digest(w.N.ride.tops), w.tops, 'all original roof/support elevations remain exact');
  assert.equal(graphDigest(w.net), w.graph, 'traffic graph and evaluated profile bytes remain exact');
  for (let i = 0; i < w.city.colliders.length; i++) {
    const c = w.city.colliders[i];
    assert.equal(digest(c.parts ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'parts')) : c), w.oldColliders[i]);
    assert.equal(!!c.parts, c === w.main[0], 'no unrelated collider edits');
  }
  assert.deepEqual(w.N.ride.solids, w.oldSolids.filter(c => c !== w.foundation[0]));
  assert.deepEqual(w.N.ride.prisms.slice(0, w.oldPrisms.length), w.oldPrisms);
  const children = w.city.group.children.slice(), solids = w.N.ride.solids.length, prisms = w.N.ride.prisms.length;
  assert.equal(w.city.finishTunnelOpenings(w.grade), w.stats);
  assert.deepEqual(w.city.group.children, children); assert.equal(w.N.ride.solids.length, solids); assert.equal(w.N.ride.prisms.length, prisms);
});

test('all unrelated instance bytes and every facade attribute survive; the replacement owns its original frame/seed', () => {
  const w = world(), replacement = w.final[0];
  for (const s of w.batches) {
    assert.equal(hash(s.mesh.geometry.index.array), s.index);
    const removed = s.removed, expectedCount = s.count - (removed === undefined ? 0 : 1);
    assert.equal(s.mesh.count, expectedCount);
    for (const [k, a] of Object.entries(s.mesh.geometry.attributes)) {
      if (!a.isInstancedBufferAttribute) { assert.ok(bytes(a.array).equals(bytes(s.attributes[k]))); continue; }
      const original = s.attributes[k], result = [];
      for (let i = 0; i < s.count; i++) if (i !== removed) result.push(...original.subarray(i * a.itemSize, (i + 1) * a.itemSize));
      assert.ok(bytes(a.array.subarray(0, expectedCount * a.itemSize)).equals(bytes(new Float32Array(result))), `${k}: unchanged ordered instance prefix`);
      if (removed !== undefined) assert.ok(bytes(replacement.geometry.attributes[k].array)
        .equals(bytes(original.subarray(removed * a.itemSize, (removed + 1) * a.itemSize))), `${k}: original metadata`);
    }
    const expected = [];
    for (let i = 0; i < s.count; i++) if (i !== removed) expected.push(...s.matrix.subarray(i * 16, (i + 1) * 16));
    assert.ok(bytes(s.mesh.instanceMatrix.array.subarray(0, expectedCount * 16)).equals(bytes(new Float32Array(expected))));
    if (removed !== undefined) assert.ok(bytes(replacement.instanceMatrix.array).equals(bytes(s.matrix.subarray(removed * 16, (removed + 1) * 16))));
  }
  assert.deepEqual(Object.keys(replacement.geometry.attributes).sort(), Object.keys(w.walls[0].geometry.attributes).sort());
  for (const a of Object.values(replacement.geometry.attributes)) assert.ok(a.array.every(Number.isFinite));
  for (let i = 0; i < replacement.geometry.attributes.normal.count; i++)
    assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(replacement.geometry.attributes.normal, i).length() - 1) < 1e-6);
  assert.equal(replacement.material, w.walls[0].material);
});

// Original native failures, not invented centreline routes. The root at the east
// crash is 40.2631; reverse root is ~39.7272. Low probes include the foundation.
const failures = [
  { x: -849.1652369420318, y: 40.263600547798816, z: -929.3929704917662, heading: 1.7219864934566318 },
  { x: -816.4844323591925, y: 39.72721694995176, z: -940.5879441772379, heading: -1.3447279388010116 }
];
test('native crash-path rays hit drawn and physical mass before repair, clear the shared opening afterward in both directions', () => {
  const w = world();
  for (const p of failures) for (const height of [.12, 1, 2.5, 3.3]) {
    const direction = { x: Math.sin(p.heading), y: 0, z: Math.cos(p.heading) };
    const from = { x: p.x - direction.x * 3, y: p.y + height, z: p.z - direction.z * 3 };
    assert.ok(ray(w.walls, from, direction, 15).length, 'non-vacuous original facade/foundation hit');
    assert.ok(w.before.raycastObstacle(from, direction, 15, 0), 'original physical hit');
    assert.equal(ray(w.final, from, direction, 15).length, 0, 'drawn opening');
    assert.equal(w.after.raycastObstacle(from, direction, 15, 0), null, 'physical opening');
  }
});

test('upper mass, side walls and below-floor foundation remain drawn and physical at their original positions', () => {
  const w = world(), c = w.main[0], o = c.obb, roof = c.maxY;
  const candidates = [
    { x: o.cx, y: roof - .25, z: o.cz, dx: o.cs, dz: -o.sn, half: o.hx },
    { x: o.cx, y: 42, z: o.cz, dx: -o.sn, dz: -o.cs, half: o.hz },
    { x: o.cx, y: c.minY - .98, z: o.cz, dx: o.cs, dz: -o.sn, half: o.hx }
  ];
  for (const p of candidates) {
    const from = { x: p.x + p.dx * (p.half + 3), y: p.y, z: p.z + p.dz * (p.half + 3) };
    const direction = { x: -p.dx, y: 0, z: -p.dz };
    const old = ray(w.walls, from, direction, 4), final = ray(w.final, from, direction, 4);
    assert.ok(old.length && final.length, JSON.stringify(p));
    assert.ok(Math.abs(old[0].distance - final[0].distance) < .0002);
    const a = w.before.raycastObstacle(from, direction, 4, 0), b = w.after.raycastObstacle(from, direction, 4, 0);
    assert.notEqual(a, null); assert.notEqual(b, null); assert.ok(Math.abs(a - b) < .0002);
    assert.ok(old[0].uv.distanceTo(final[0].uv) < 1e-5, 'original facade UV coordinates');
  }
  const down = { x: 0, y: -1, z: 0 }, from = { x: o.cx, y: roof + 1, z: o.cz };
  assert.ok(Math.abs(ray(w.final, from, down, 2)[0].point.y - roof) < .00001, 'actual SF roof elevation');
});

test('independent boundary-ray grid: drawing and native solids agree; removed facade lies only in the bounded tunnel footprint', t => {
  const w = world(), o = w.main[0].obb;
  let checks = 0, opened = 0, retained = 0;
  for (const y of [39.44, 39.6, 40.25, 41.5, 45, 45.3, 59]) for (const axis of [0, 1]) for (const sign of [-1, 1]) {
    const half = axis ? o.hz : o.hx, across = axis ? o.hx : o.hz;
    const dx = (axis ? o.sn : o.cs) * sign, dz = (axis ? o.cs : -o.sn) * sign;
    for (let s = -across + .1; s < across; s += .5) {
      const from = { x: o.cx + dx * (half + 2) - dz * s, y, z: o.cz + dz * (half + 2) + dx * s };
      const direction = { x: -dx, y: 0, z: -dz }, distance = 2 * half + 4;
      const old = ray(w.walls, from, direction, distance)[0], drawn = ray(w.final, from, direction, distance)[0];
      const hit = w.after.raycastObstacle(from, direction, distance, 0);
      assert.ok(old, 'all boundary rays enter the original source mass');
      assert.equal(!!drawn, hit !== null, `draw/physical presence at ${JSON.stringify(from)}`);
      if (drawn) assert.ok(Math.abs(drawn.distance - hit) < .0002, 'Float32 drawing and Float64 prism boundary');
      if (drawn && Math.abs(drawn.distance - old.distance) < .0002) retained++;
      else {
        const p = old.point;
        assert.ok(w.grade.terrainCuts.some(c => c.planes.filter(a => a[1] === 0).every(a => a[0] * p.x + a[2] * p.z + a[3] > -.0002)), 'removed facade is within actual source bore XZ');
        assert.ok(y > 39.489 && y < 45.149, 'only local min-slab/max-roof envelope');
        opened++;
      }
      checks++;
    }
  }
  assert.ok(opened > 100 && retained > 100);
  t.diagnostic(JSON.stringify({ boundaryRays: checks, opened, retained }));
});

function section(text, a, b) { const start = text.indexOf(a), end = text.indexOf(b, start); assert.ok(start >= 0 && end > start); return text.slice(start, end); }
function bus(w) {
  w.load('actor-models');
  const body = w.N.buildLoftedBusBodyGeometry(), signs = w.N.buildBusSignGeometry();
  const box = new THREE.Box3();
  for (const g of [body, signs]) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const wheels = [-1, 1].map(side => w.N.buildBusWheelGeo(side));
  body.dispose(); signs.dispose();
  return { box, wheels, spec: w.N.BUS_SPEC };
}
test('actual bus conservative body/sign/roof/mirror/wheel envelope clears the building on every nearby native lane and join pose', t => {
  const w = world(), { box: model, wheels, spec } = bus(w), traffic = read('js/traffic.js');
  assert.ok(model.max.y >= 3.25 && model.max.z >= 5.9 && model.min.z <= -5.8, 'full actual bus, not rider clearance');
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: w.N }, edgeY: w.net.edgeY, edgeGrade: w.net.edgeGrade, curveY: w.net.curveY, curvePoint: w.net.curvePoint });
  const actor = vm.runInContext(`const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)); const _normal={x:0,y:1,z:0};
    ${section(traffic, '  function lanePoint(', '  // Move v along and across')}
    ${section(traffic, '  function pose(', '  // Knock velocity')}
    ({locate,pose});`, context);
  const routes = [];
  for (const e of w.net.edges.filter(e => e.name === 'ROBERT C LEVY TUNL')) {
    for (let lane = 0; lane < e.lanes.length; lane++) routes.push({ label: `${e.id}/${lane}`, length: e.len, start: 3.6, end: e.len - 6,
      state: s => ({ edge: e, lane, s, conn: null, trail: null }) });
    for (const m of e.moves) for (let lane = 0; lane < e.lanes.length; lane++) {
      const out = m.out[lane]; if (out < 0) continue;
      const c = w.net.connector(e, lane, m.to, out);
      routes.push({ label: `${e.id}/${lane}->${m.to.id}/${out}`, length: c.len + 12, start: 0, end: c.len + 12,
        state: s => (s -= 6) <= c.len ? { edge: e, lane, conn: c, cs: s, move: m, out, trail: null }
        : { edge: m.to, lane: out, s: s - c.len, conn: null, trail: c } });
    }
  }
  const mesh = w.final[0], triangle = new THREE.Triangle(), matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  const positions = mesh.geometry.attributes.position, worldTriangles = [];
  for (let i = 0; i < positions.count; i += 3) worldTriangles.push([0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, i + j).applyMatrix4(matrix)));
  // The slab, walls and portal frame carrying this building are tested with the same bus poses, drawn and native.
  const structures = w.grade.group.children.filter(m => /SFGradeSeparation_(ceiling|light|masonry|wall)$/.test(m.name));
  let portalTriangles = 0;
  for (const m of structures) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, i + j));
      if (points.every(q => Math.hypot(q.x + 833.36, q.z + 938.37) > 45)) continue;
      worldTriangles.push(points); portalTriangles++;
    }
  }
  const gradeBodies = native([], w.structureBodies.filter(b => Math.hypot(b.centre.x + 833.36, b.centre.z + 938.37) < 60));
  assert.ok(portalTriangles > 100, 'non-vacuous slab/frame/wall drawing near the building');
  let tested = 0, negative = 0, maxTop = 0;
  const routeCounts = new Map();
  for (const route of routes) for (let s = route.start; s < route.end; s += .25) {
    const v = { axle: 3.6, half: 6, dl: 0, dlv: 0, speed: 8, acc: 0, v0: 8, pitch: 0, pitchVel: 0, roll: 0, rollVel: 0,
      yawOffset: 0, yawVel: 0, yawRate: 0, steer: 0, ...route.state(s) };
    v.move ??= v.edge.moves[0]; actor.locate(v);
    if (Math.hypot(v.x + 833.36, v.z + 938.37) > 35) continue;
    v.yaw = Math.atan2(v.tx, v.tz) - v.nose; actor.pose(v, 1 / 60);
    const pose = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-v.gradePitch, v.yaw, v.gradeRoll, 'YXZ')).setPosition(v.x, v.y, v.z);
    // Body/signs and independently mounted axle wheels have distinct transforms.
    // A single pitched box with tyre-height corners invents a low bumper below the
    // roadway. These enclosing volumes include every actual vertex without that
    // artificial extension of the wheels to the front/rear extremities of the bus.
    const pitched = model.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-v.gradePitch, 0, v.gradeRoll, 'YXZ')));
    const yaw = new THREE.Matrix4().makeRotationY(v.yaw).setPosition(v.x, v.y, v.z), yawInverse = yaw.clone().invert();
    const parts = [{ box: model, matrix: pose, upright: pitched }], lift = spec.wheelX * Math.sin(v.gradeRoll);
    for (const [index, side] of [-1, 1].entries()) for (const front of [true, false]) {
      const z = front ? spec.wheelZ : -spec.wheelZ;
      const wheelMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(front ? 0 : .55, v.yaw, v.gradeRoll, 'YXZ')).setPosition(
        v.x + side * spec.wheelX * Math.cos(v.yaw) + z * Math.sin(v.yaw),
        (front ? v.yFront : v.yRear) + spec.wheelRadius + side * lift,
        v.z - side * spec.wheelX * Math.sin(v.yaw) + z * Math.cos(v.yaw));
      const localMatrix = yawInverse.clone().multiply(wheelMatrix), p = wheels[index].attributes.position, box = new THREE.Box3();
      for (let i = 0; i < p.count; i++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(localMatrix));
      parts.push({ box, matrix: yaw, upright: box });
    }
    let blocked = false;
    for (const part of parts) {
      const inverse = part.matrix.clone().invert();
      for (const points of worldTriangles) {
        triangle.set(...points.map(p => p.clone().applyMatrix4(inverse)));
        assert.equal(part.box.intersectsTriangle(triangle), false, `drawn face/bus overlap ${JSON.stringify({ x: v.x, y: v.y, z: v.z, edge: v.edge.id,
          part: parts.indexOf(part), wheelFront: v.yFront, wheelRear: v.yRear, gradePitch: v.gradePitch, gradeRoll: v.gradeRoll,
          points: points.map(p => p.toArray()), box: [part.box.min.toArray(), part.box.max.toArray()] })}`);
      }
      const centre = part.upright.getCenter(new THREE.Vector3()).applyMatrix4(yaw), size = part.upright.getSize(new THREE.Vector3());
      const envelope = { x: centre.x, z: centre.z, headingY: v.yaw, halfWidthMetres: size.x / 2, halfLengthMetres: size.z / 2,
        minY: v.y + part.upright.min.y, maxY: v.y + part.upright.max.y };
      assert.ok(w.after.isVolumeClear(envelope), `physical bus envelope at ${v.x},${v.z}: ${JSON.stringify(envelope)}`);
      assert.ok(gradeBodies.isVolumeClear(envelope), `physical slab/frame/wall bodies at ${v.x},${v.z}: ${JSON.stringify(envelope)}`);
      if (!w.before.isVolumeClear(envelope)) blocked = true;
      maxTop = Math.max(maxTop, envelope.maxY);
    }
    if (blocked) negative++;
    routeCounts.set(route.label, (routeCounts.get(route.label) || 0) + 1);
    tested++;
  }
  assert.ok(tested > 200 && negative > 50, 'both clear and originally blocked bus poses are exercised');
  t.diagnostic(JSON.stringify({ sampledBusPoses: tested, originalBlocked: negative, maximumBusTop: maxTop,
    routes: Object.fromEntries(routeCounts), envelope: [model.min.toArray(), model.max.toArray()],
    scope: 'actual lane/connector axle poses near building, conservative body and separate wheel bounds; not full-world route/browser acceptance' }));
  for (const g of wheels) g.dispose();
});

test('Broadway east building: its overhang is carried by a drawn/native slab and portal frame, never an open void', t => {
  const w = world(), T = THREE, up = new T.Vector3(0, 1, 0);
  const meshes = w.grade.group.children.filter(m => /SFGradeSeparation_(ceiling|light|masonry|wall)$/.test(m.name));
  const ceiling = w.grade.group.children.filter(m => m.name === 'SFGradeSeparation_ceiling');
  const physical = native([], w.structureBodies);
  const o = w.main[0].obb, counts = { under: 0, covered: 0, east: 0, open: 0 };
  for (const e of w.net.edges.filter(e => e.name === 'ROBERT C LEVY TUNL')) for (let lane = 0; lane < e.lanes.length; lane++) {
    for (let s = 0; s <= e.len; s += .5) {
      const x = e.sx + e.dx * s + e.rx * e.lanes[lane], z = e.sz + e.dz * s + e.rz * e.lanes[lane];
      if (Math.hypot(x + 833.36, z + 938.37) > 40) continue;
      const floor = w.grade.floorAt(x, z, -10000);
      if (!Number.isFinite(floor)) continue;
      const dx = x - o.cx, dz = z - o.cz;
      const under = Math.abs(o.cs * dx - o.sn * dz) < o.hx - .5 && Math.abs(o.sn * dx + o.cs * dz) < o.hz - .5;
      const roof = w.grade.roofAt(x, z, floor + .3), origin = new T.Vector3(x, floor + .3, z);
      const drawnRoof = new T.Raycaster(origin, up, 0, 9).intersectObjects(ceiling, false)[0]?.distance;
      const first = new T.Raycaster(origin, up, 0, 9).intersectObjects(meshes, false)[0]?.distance ?? null;
      const body = physical.raycastObstacle(origin, up, 9);
      assert.ok(first === null ? body === null : body !== null && Math.abs(first - body) < .0002, `drawn/native overhead ${first}/${body}`);
      if (under) {
        counts.under++;
        assert.ok(Number.isFinite(roof), 'roofAt sees the slab under the building');
        assert.ok(Math.abs(origin.y + drawnRoof - roof) < .021, 'drawn slab matches roofAt');
        assert.ok(roof - floor >= 4, 'full bus clearance under the slab');
        counts.covered++;
      } else if (!Number.isFinite(roof)) counts.open++;
    }
  }
  t.diagnostic(JSON.stringify(counts));
  assert.ok(counts.under > 40 && counts.open > 10, 'both the carried overhang and the open approach east of it are exercised');
});

test('main finalizes building cavities after grade publication and before native sampler construction', () => {
  const main = read('js/main.js');
  assert.ok(main.indexOf('city.GradeSeparation = gradeSeparation') < main.indexOf('cityBlocks.finishTunnelOpenings(gradeSeparation)'));
  assert.ok(main.indexOf('cityBlocks.finishTunnelOpenings(gradeSeparation)') < main.indexOf('new ThirdPersonControllerManager'));
  const grade = read('js/grade-separation.js');
  assert.match(grade, /function floorQuad\([^]*?thickness = 0\.24\)/, 'building slab envelope follows the actual source depth');
  assert.match(grade, /Math\.min\(y0, y1\) - thickness \/ 2 - 0\.002/, 'source slab offset');
});

test.after(() => {
  if (!cached) return;
  const geometries = new Set(), materials = new Set();
  for (const root of [cached.scene, ...cached.walls]) root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
});
