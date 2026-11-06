// Bounded CPU-only tunnel traffic regression. No renderer/browser, downloads, RNG or runtime hooks.
// Ownership: 67f0686 owns the original routing/connector contract and the narrow Sacramento
// grounding evidence. Parent-reviewed road bb558914 / grade 882a0d98 own the corrected Stockton
// anchors and derived heights/poses; the grade literal now pins the 2026-11-05 portal follow-up (same floors/lanes). Expected hashes are recorded literals, never self-goldened.
// Fixture uses committed core terrain + actual curb polygons, with no scene building obstacles (as
// road-network.test.cjs). It does not claim the full main.js obstacle/device/gameplay acceptance matrix.
// Clearance is sampled, with conservative full-face tests at each pose, not a continuous-motion proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const typed = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('hex');
const digest = value => sha(JSON.stringify(value, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
const FROZEN = Object.freeze({
  roadSource: 'bb55891475d2a06bdf16d6475cdad80b99d73b783960a8f0d56a4861d7ab81fb',
  gradeSource: '9ff431f3790e84843cf978907e6afed8eb575c091b5b16e9e5e2beb702c8fb09',
  trafficSource: '68f3b7312eef5553f932bbc03d1b39a1cde2617d02a1ad11942a86c37402d3b6',
  graph: 'f702c29efb17b09eb0d9024391f1b2545d55dca22a2b21f8ad27cf2cb5c18c8d',
  baselineRouting: '2c6ac0523f4fd067c3d60afe9af57ee23a11424cc3602efc1125f57113501a7f', // 67f0686, not the candidate
  tunnels: 'b65fe8d264ce76951ab84af4f57650830391c8c7753ef5107cc30b8098972c3a',
  upper: '8f38b3390d0e80247dfec42048bffd3c740feaa60824a28e8b12e6bf6741ea61',
  poses: 'a59c12d5f47dd814391ae3a6013b4bafefda385e62f1de2596eb51bb375ecdfd'
});
const TUNNELS = new Set(['STOCKTON TUNL', 'ROBERT C LEVY TUNL']);
const UPPER = new Set(['BUSH ST', 'BROADWAY']);
const EPS = 2e-4; // independent Float32 drawn vertices versus Float64 physical construction, metres
const options = { timeout: 90000 };
const TERRAIN_BASELINE_REF = '67f06860042a3a72f77a8d01cfe69d9a2d5b9511';
const UPPER_BODY_Y = 2.5; // bus-local metres: upper glazing, roof and equipment; never grandfather overhead contacts
// Only the 61 inherited Sacramento street contacts survive the reviewed repair. Readable original
// 67f0686 vertices + exact connector stations replace the obsolete all-Stockton compressed fixture.
// This is not a spatial/range exemption: each contact must match this route, station AND triangle.
const SACRAMENTO = {
  route: 'connector 1214/0 -> 1357/0',
  coreHash: '6fbb877b4eba725351c8359f02ee2c0db7e6d79a4d4492c94e7b4f9da4e0dac2',
  modelHash: '6f15dc42cae7c7de5e00a15200f7256ad35748a80c20d691d708c96c89eddaa6',
  poseHash: 'e4fb834bd9cafaa2a7354d65a23938a6bfadbfa04bad07fe7076cc9ba7a1097b',
  triangles: [
    [[-500,42.489036560058594,-494],[-500,42.47057342529297,-492],[-498,42.47980499267578,-494]],
    [[-500,42.489036560058594,-494],[-502,42.466880798339844,-492],[-500,42.47057342529297,-492]],
    [[-502,42.490882873535156,-494],[-502,42.466880798339844,-492],[-500,42.489036560058594,-494]],
    [[-502,42.466880798339844,-492],[-502,42.41887664794922,-490],[-500,42.47057342529297,-492]],
    [[-502,42.490882873535156,-494],[-504,42.47057342529297,-492],[-502,42.466880798339844,-492]],
    [[-504,42.47057342529297,-492],[-504,42.415184020996094,-490],[-502,42.466880798339844,-492]],
    [[-502,42.466880798339844,-492],[-504,42.415184020996094,-490],[-502,42.41887664794922,-490]],
    [[-504,42.50011444091797,-494],[-504,42.47057342529297,-492],[-502,42.490882873535156,-494]],
    [[-504,42.50011444091797,-494],[-506,42.511192321777344,-492],[-504,42.47057342529297,-492]]
  ],
  poses: [
    [10.996954938279643,[0]], [11.246954938279643,[1,0]], [11.496954938279643,[1]],
    [11.746954938279643,[1]], [11.996954938279643,[2,1]], [12,[2,1]],
    [12.246954938279643,[2,1,3]], [12.496954938279643,[2,1,3]],
    [12.746954938279643,[4,2,1,3]], [12.996954938279643,[4,2,1,3]],
    [13.246954938279643,[4,2,1,5,6,3]], [13.496954938279643,[7,4,5,6,3]],
    [13.746954938279643,[7,4,5]], [13.996954938279643,[7,4,5]], [14,[7,4,5]],
    [14.246954938279643,[7,4,5]], [14.496954938279643,[7,4,5]], [14.746954938279643,[7,4,5]],
    [14.996954938279643,[8,7,4]], [15.246954938279643,[8,7]], [15.496954938279643,[8]],
    [15.746954938279643,[8]], [15.996954938279643,[8]], [16,[8]]
  ]
};

function graphFacts(net) {
  const node = n => ({ id: n.id, x: n.x, z: n.z, rg: Array.from(n.rg), shape: !!n.shape,
    signal: n.signal, signalOffset: n.signalOffset, stop: n.stop, allWay: n.allWay,
    sideCount: n.sideCount, groupCount: n.groupCount,
    arms: n.arms.map(a => [a.ux, a.uz, a.half, a.side, a.group, a.in?.id, a.out?.id]) });
  const edge = e => ({ id: e.id, name: e.name, from: e.from.id, to: e.to.id,
    x0: e.x0, z0: e.z0, dx: e.dx, dz: e.dz, rx: e.rx, rz: e.rz, sx: e.sx, sz: e.sz,
    span: e.span, len: e.len, half: e.half, axis: e.axis, lanes: Array.from(e.lanes),
    bore: e.bore, speedCap: e.speedCap, stop: e.stop, inSide: e.inSide, outSide: e.outSide,
    axisIndex: e.axisIndex, opposite: e.opposite?.id, clx: e.clx, clz: e.clz,
    prof: typed(e.prof), laneProf: e.laneProf.map(typed), len3: typed(e.len3),
    // Every admitted connector, including all lanes of the entering/exiting upper roads.
    moves: e.moves.map(m => ({ to: m.to.id, turn: m.turn, cross: m.cross, out: Array.from(m.out),
      curves: Array.from(m.out, (j, i) => {
        if (j < 0) return null;
        const c = net.connector(e, i, m.to, j);
        return { ...c, lut: typed(c.lut), y: [0, .125, .5, .875, 1].map(t => net.curveY(c, c.len * t)) };
      }) })),
    // Preserve evaluated last-fractional-interval behavior, not just profile endpoints.
    evaluated: e.lanes.map((_, i) => [0, .25, .5, .75, 1].map(t =>
      [net.edgeY(e, e.len * t, i), net.edgeGrade(e, e.len * t, i)])) });
  const edges = net.edges.map(edge);
  const tunnelIds = new Set(net.edges.filter(e => TUNNELS.has(e.name)).map(e => e.id));
  const closure = new Set(tunnelIds);
  for (const e of net.edges) for (const m of e.moves) {
    if (tunnelIds.has(e.id) || tunnelIds.has(m.to.id)) { closure.add(e.id); closure.add(m.to.id); }
  }
  const nodes = net.nodes.map(node);
  // Explicit 67f0686 comparison: mask only the reviewed Stockton bore anchors and edge-height
  // products. Every node, lane, signal, movement, connector (including its Y/grade), and every
  // other edge's complete height profile remains in this original-baseline fingerprint.
  const routing = edges.map(e => {
    if (![1214, 1215].includes(e.id)) return e;
    assert.equal(e.name, 'STOCKTON TUNL');
    const { prof, laneProf, len3, evaluated, bore, ...rest } = e;
    const { p0, p1, y0, y1, ...unchangedBore } = bore;
    return { ...rest, bore: unchangedBore };
  });
  return {
    graph: digest({ nodes, edges }),
    baselineRouting: digest({ nodes, edges: routing }),
    tunnels: digest(edges.filter(e => closure.has(e.id))),
    upper: digest(edges.filter(e => UPPER.has(e.name))),
    counts: { nodes: net.nodes.length, edges: edges.length, tunnelEdges: tunnelIds.size,
      tunnelClosure: closure.size, upperEdges: edges.filter(e => UPPER.has(e.name)).length,
      connectors: edges.reduce((sum, e) => sum + e.moves.reduce((n, m) => n + m.curves.filter(Boolean).length, 0), 0) }
  };
}

function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `production function boundary: ${start}`);
  return source.slice(a, b);
}

let cached;
function world() {
  if (cached) return cached;
  const N = { THREE, TSL, DEBUG_ROADS: false,
    createRoadSurfaceMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    createMarbleAshlarMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: N }, console: { info() {} } });
  const sources = {};
  const load = name => { const source = read(`js/${name}.js`); sources[name] = sha(source);
    vm.runInContext(source, context, { filename: `js/${name}.js` }); };
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'road-network', 'sf-ride-geometry']) load(name);
  const bytes = readFileSync(new URL('data/terrain-core.bin', root)), n = bytes.readUInt32LE(4);
  const header = JSON.parse(bytes.toString('utf8', 8, 8 + n));
  N.Terrain.load(header, new Uint16Array(bytes.buffer.slice(bytes.byteOffset + 8 + n, bytes.byteOffset + bytes.length)));
  N.Terrain.patchesEnabled = false;
  const core = N.Terrain, heights = core.heights, heightAt = core.heightAt, groundAt = core.groundAt;
  const geoBefore = digest(N.GEO.roadGraph), heightsBefore = sha(typed(heights));
  const sidewalks = N.BLOCKS.map(block => ({ minX: block.minX, maxX: block.maxX, minZ: block.minZ, maxZ: block.maxZ, block }));
  const net = N.buildRoadNetwork(sidewalks, []);
  assert.equal(digest(N.GEO.roadGraph), geoBefore, 'approach repair never mutates shared geographic source');
  assert.equal(N.Terrain, core); assert.equal(core.heights, heights);
  assert.equal(core.heightAt, heightAt); assert.equal(core.groundAt, groundAt);
  assert.equal(sha(typed(heights)), heightsBefore, 'approach repair never mutates shared measured terrain');
  const traffic = read('js/traffic.js'); sources.traffic = sha(traffic);
  const actorContext = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(actorContext, { window: { NYC: N }, edgeY: net.edgeY, edgeGrade: net.edgeGrade,
    curveY: net.curveY, curvePoint: net.curvePoint });
  // Exact production path/axle and camber functions, exposed only in this test realm.
  const actor = vm.runInContext(`const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const _normal = { x: 0, y: 1, z: 0 };
    ${section(traffic, '  function lanePoint(', '  // Move v along and across')}
    ${section(traffic, '  function pose(', '  // Knock velocity')}
    ({ locate, pathY, pathPoint, pose });`, actorContext);
  const before = graphFacts(net);
  cached = { N, net, actor, before, sources, load, grade: null };
  cached.routes = routes(cached);
  cached.poseBefore = poseFingerprint(cached); // before any grade construction, regardless of test order
  return cached;
}

function boreInterval(e) {
  const b = e.bore, offset = Math.hypot(e.sx - e.x0, e.sz - e.z0);
  const at = u => (u - b.a0) / (b.a1 - b.a0) * e.span - offset;
  return [Math.min(at(b.p0), at(b.p1)), Math.max(at(b.p0), at(b.p1))];
}
function stations(length, special = []) {
  const values = new Set([0, length]);
  for (let s = 0; s < length; s += 2) values.add(s);
  for (const at of [0, length, ...special]) for (let k = -48; k <= 48; k++) {
    const s = at + k * .25;
    if (s >= 0 && s <= length) values.add(s);
  }
  return [...values].sort((a, b) => a - b);
}
function routes(w) {
  const result = [], ids = new Set();
  for (const e of w.net.edges.filter(e => TUNNELS.has(e.name))) {
    ids.add(e.id);
    for (let i = 0; i < e.lanes.length; i++) result.push({ label: `${e.name} edge ${e.id}/${i}`, edge: e, lane: i,
      // At the start the rear axle still uses trail; at len-6 the bus enters its connector.
      // Those physically reachable states are covered by the explicit connector routes below.
      samples: stations(e.len, boreInterval(e)).filter(s => s >= 3.6 && s < e.len - 6),
      state: s => ({ edge: e, lane: i, s, conn: null, trail: null }) });
  }
  for (const e of w.net.edges) for (const m of e.moves) {
    if (!ids.has(e.id) && !ids.has(m.to.id)) continue;
    for (let i = 0; i < e.lanes.length; i++) {
      const j = m.out[i]; if (j < 0) continue;
      const c = w.net.connector(e, i, m.to, j);
      // Includes front-bumper entry (centre -6 m), both axle-straddling states and post-exit trail.
      const samples = stations(c.len + 12).map(s => s - 6);
      result.push({ label: `connector ${e.id}/${i} -> ${m.to.id}/${j}`, edge: e, lane: i, connector: c, samples,
        state: s => s <= c.len ? { edge: e, lane: i, conn: c, cs: s, move: m, out: j, trail: null }
          : { edge: m.to, lane: j, s: s - c.len, conn: null, trail: c } });
    }
  }
  return result;
}
function vehicle(w, route, s, axle = 3.6) {
  const v = { axle, half: axle > 2 ? 6 : 2.3, dl: 0, dlv: 0, speed: 8, acc: 0, v0: 8,
    pitch: 0, pitchVel: 0, roll: 0, rollVel: 0, yawOffset: 0, yawVel: 0, yawRate: 0, steer: 0,
    ...route.state(s) };
  v.move ??= v.edge.moves[0];
  w.actor.locate(v);
  v.yaw = Math.atan2(v.tx, v.tz) - v.nose;
  // Steady unknocked chassis; native axle pitch and native connector camber remain active.
  w.actor.pose(v, 1 / 60);
  return v;
}
function poseFingerprint(w) {
  const hash = createHash('sha256'); let count = 0;
  for (const route of w.routes) for (const s of route.samples) for (const axle of [3.6, 1.4]) {
    if (route.connector && axle === 1.4 && s < -2.3) continue;
    const v = vehicle(w, route, s, axle), c = v.conn ? v.cs : v.s;
    const values = [v.x, v.y, v.z, v.yFront, v.yRear, v.grade, v.gradePitch, v.gradeRoll,
      v.tx, v.tz, v.yaw, v.gradeV0, w.actor.pathY(v, c - axle), w.actor.pathY(v, c + axle)];
    assert.ok(values.every(Number.isFinite), `${route.label}, ${s}: finite actual axle pose`);
    hash.update(JSON.stringify([route.label, s, axle, values])); count++;
  }
  return { hash: hash.digest('hex'), count };
}

function gradeWorld(w) {
  if (w.grade) return w;
  // Capture actual registered construction bodies, excluding intended road-support slabs. No guessed
  // roofAt ceiling and no legacy navigation-only AABBs: this is the native physical obstacle output.
  const structure = [], original = w.N.RideGeometry.addBox;
  w.N.RideGeometry.addBox = (...args) => {
    const body = original(...args);
    if (body && args[3]?.source !== 'grade:slab') structure.push(body);
    return body;
  };
  try {
    w.load('grade-separation');
    assert.equal(w.sources['grade-separation'], FROZEN.gradeSource, 'parent-reviewed grade source, not an automatically updated golden');
    w.grade = w.N.buildGradeSeparation(new THREE.Group(), w.net);
  } finally { w.N.RideGeometry.addBox = original; }
  w.N.GradeSeparation = w.grade;
  w.grade.group.updateMatrixWorld(true);
  w.meshes = w.grade.group.children.filter(m => /SFGradeSeparation_(ceiling|light|masonry|wall)$/.test(m.name));
  assert.equal(w.meshes.length, 4, 'all four actual tunnel obstacle mesh classes');
  assert.ok(structure.length > 0, 'actual native structure bodies registered');
  w.sampler = new SfTerrainSampler({ terrain: w.N.Terrain, ride: { tops: [], solids: structure, prisms: w.N.ride.prisms },
    grade: null, waterAt: () => false });
  w.triangles = triangleIndex(w.meshes);
  w.raycaster = new THREE.Raycaster();
  return w;
}

// An XZ broadphase for *drawn* faces, independent of the native sampler's box index. Triangle/box
// SAT in the model frame tests the whole conservative face, not just vertices or sparse rays.
function triangleIndex(meshes) {
  const cells = new Map(), size = 16;
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let k = 0; k < (index?.count ?? p.count); k += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(k + j) : k + j).applyMatrix4(mesh.matrixWorld));
      const bounds = new THREE.Box3().setFromPoints(points), item = { points, bounds, name: mesh.name };
      for (let ix = Math.floor(bounds.min.x / size); ix <= Math.floor(bounds.max.x / size); ix++)
        for (let iz = Math.floor(bounds.min.z / size); iz <= Math.floor(bounds.max.z / size); iz++) {
          const key = `${ix},${iz}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(item);
        }
    }
  }
  return bounds => {
    const out = new Set();
    for (let ix = Math.floor(bounds.min.x / size); ix <= Math.floor(bounds.max.x / size); ix++)
      for (let iz = Math.floor(bounds.min.z / size); iz <= Math.floor(bounds.max.z / size); iz++)
        for (const item of cells.get(`${ix},${iz}`) ?? []) if (bounds.intersectsBox(item.bounds)) out.add(item);
    return out;
  };
}

let models;
async function busModels(w) {
  if (models) return models;
  const threeURL = new URL('vendor/three/build/three.webgpu.js', root).href;
  const utils = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js').replace("from 'three'", `from '${threeURL}'`);
  w.N.Addons = await import(`data:text/javascript;base64,${Buffer.from(utils).toString('base64')}`);
  w.N.cityUniforms = { uInteriorGlow: TSL.uniform(.8) };
  w.load('actor-models'); w.load('sf-dynamic-bodies');
  const body = w.N.buildLoftedBusBodyGeometry(), signs = w.N.buildBusSignGeometry();
  const profile = geometry => w.N.sfVehicleShape(geometry).map(s => new THREE.Box3(
    new THREE.Vector3(-s.halfWidthMetres, s.minY, s.z - s.halfLengthMetres),
    new THREE.Vector3(s.halfWidthMetres, s.maxY, s.z + s.halfLengthMetres)));
  const wheels = [-1, 1].map(side => { const geometry = w.N.buildBusWheelGeo(side); geometry.computeBoundingBox(); return geometry; });
  body.computeBoundingBox(); signs.computeBoundingBox();
  models = { body, signs, wheels, boxes: [...profile(body), ...profile(signs)], spec: w.N.BUS_SPEC };
  return models;
}
function matrix(x, y, z, pitch, yaw, roll) {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')).setPosition(x, y, z);
}
function posedParts(model, v) {
  const yaw = v.yaw + v.yawOffset, parts = [{ boxes: model.boxes,
    matrix: matrix(v.x, v.y, v.z, v.pitch - v.gradePitch, yaw, v.roll + v.gradeRoll), name: 'body/signs' }];
  const s = model.spec, lift = s.wheelX * Math.sin(v.gradeRoll);
  for (const [index, side] of [-1, 1].entries()) for (const front of [true, false]) {
    const z = front ? s.wheelZ : -s.wheelZ;
    parts.push({ boxes: [model.wheels[index].boundingBox], name: `${side}/${front ? 'front' : 'rear'} wheel`,
      matrix: matrix(v.x + side * s.wheelX * Math.cos(yaw) + z * Math.sin(yaw),
        (front ? v.yFront : v.yRear) + s.wheelRadius + side * lift,
        v.z - side * s.wheelX * Math.sin(yaw) + z * Math.cos(yaw), front ? 0 : .55,
        yaw + (front ? v.steer : 0), v.gradeRoll) });
  }
  return parts;
}
function corners(box) {
  const out = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y])
    for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}
function faceIntersections(index, part) {
  const inverse = part.matrix.clone().invert(), hits = [], triangle = new THREE.Triangle();
  const worldBounds = new THREE.Box3();
  for (const box of part.boxes) worldBounds.union(box.clone().applyMatrix4(part.matrix));
  for (const item of index(worldBounds)) {
    triangle.set(...item.points.map(p => p.clone().applyMatrix4(inverse)));
    for (const box of part.boxes) if (box.intersectsTriangle(triangle)) {
      hits.push({ mesh: item.name, part: part.name, bounds: [box.min.toArray(), box.max.toArray()] }); break;
    }
  }
  return hits;
}
function segmentHit(sampler, from, to) {
  const d = to.clone().sub(from), length = d.length();
  if (length <= 1e-8) return null;
  return sampler.raycastObstacle(from, d.divideScalar(length), length, 0);
}
function nativeFaceRays(sampler, part) {
  const hits = [];
  for (const box of part.boxes) {
    const c = corners(box).map(p => p.applyMatrix4(part.matrix));
    // All twelve box edges plus three face-centre diameters. Faces are independently covered by
    // the drawn SAT above; these rays exercise the real native physical obstacle representation.
    const segments = [];
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) segments.push([c[i], c[i | bit]]);
    const centre = box.getCenter(new THREE.Vector3());
    for (const axis of ['x', 'y', 'z']) {
      const a = centre.clone(), b = centre.clone(); a[axis] = box.min[axis]; b[axis] = box.max[axis];
      segments.push([a.applyMatrix4(part.matrix), b.applyMatrix4(part.matrix)]);
    }
    for (const [from, to] of segments) {
      const distance = segmentHit(sampler, from, to);
      if (distance !== null) { hits.push({ part: part.name, from: from.toArray(), to: to.toArray(), distance }); break; }
    }
  }
  return hits;
}

test('reviewed Stockton heights preserve the original 67f0686 routing/connector contract and survive grade construction', options, t => {
  const w = world();
  t.diagnostic(JSON.stringify({ sources: { roadSource: w.sources['road-network'], trafficSource: w.sources.traffic }, before: w.before }));
  assert.equal(w.sources['road-network'], FROZEN.roadSource, 'frozen road-network source');
  assert.equal(w.sources.traffic, FROZEN.trafficSource, 'frozen traffic source');
  for (const key of ['graph', 'tunnels', 'upper']) assert.equal(w.before[key], FROZEN[key], `reviewed ${key}`);
  assert.equal(w.before.baselineRouting, FROZEN.baselineRouting, 'original 67f0686 contract: only Stockton anchors and edge-height products may differ');
  assert.deepEqual([w.before.counts.nodes, w.before.counts.edges, w.before.counts.connectors], [2235, 4910, 12087]);
  assert.equal(w.before.counts.tunnelEdges, 8, 'Stockton two directions; Broadway three runs per direction');
  gradeWorld(w);
  assert.deepEqual(graphFacts(w.net), w.before, 'grade building must not mutate any lane/profile/connector/control');
  t.diagnostic(`grade source SHA256 ${w.sources['grade-separation']}`);
});

test('actual pathY/locate bus and van axle poses are deterministic through both mouths and every lane connector', options, t => {
  const w = world(), before = w.poseBefore;
  t.diagnostic(JSON.stringify({ poses: before.hash, cases: before.count, routes: w.routes.length }));
  assert.equal(before.hash, FROZEN.poses, 'frozen actual axle/grade/camber/path-height results');
  gradeWorld(w);
  assert.deepEqual(poseFingerprint(w), before, 'grade geometry cannot change either direction of actor travel');
});

test('full active bus geometry includes roof pods, mirrors and separately mounted wheels', options, async () => {
  const w = world(), model = await busModels(w), b = model.body.boundingBox;
  assert.ok(Math.abs(b.max.y - 3.255) < 1e-6, 'AC pod, not the 3.005 m body crown');
  assert.ok(Math.abs(b.max.x - 1.435) < 1e-6 && Math.abs(b.min.x + 1.435) < 1e-6, 'mirror extremities');
  assert.ok(Math.abs(b.max.z - 5.985) < 1e-6 && Math.abs(b.min.z + 5.84) < 1e-6, 'bike rack / rear bumper');
  assert.equal(model.spec.wheelZ * 2, 7.2);
  for (const geometry of [model.body, model.signs]) {
    const p = geometry.attributes.position, point = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i);
      assert.ok(model.boxes.some(box => box.clone().expandByScalar(1e-7).containsPoint(point)), 'conservative face bounds contain every actual vertex');
    }
  }
});

test('negative control: a thin obstacle through a bus roof face is caught by drawn SAT and native rays', options, async () => {
  const w = world(), model = await busModels(w);
  const centre = { x: 0, y: 3.15, z: -3.55 }, halfExtents = { x: 1.5, y: .3, z: .02 };
  const obstacle = new THREE.Mesh(new THREE.BoxGeometry(3, .6, .04), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  obstacle.name = 'controlled roof obstruction'; obstacle.position.set(centre.x, centre.y, centre.z); obstacle.updateMatrixWorld();
  const part = { name: 'bus roof', boxes: model.boxes, matrix: new THREE.Matrix4() };
  const sampler = new SfTerrainSampler({ boxes: [{ centre, halfExtents, rotationY: 0 }], ride: { tops: [], solids: [], prisms: [] } });
  const obstacleBounds = new THREE.Box3().setFromObject(obstacle), point = new THREE.Vector3();
  for (const geometry of [model.body, model.signs]) {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      assert.equal(obstacleBounds.containsPoint(point.fromBufferAttribute(positions, i)), false, 'vertex-only checking misses this control');
  }
  assert.ok(faceIntersections(triangleIndex([obstacle]), part).length > 0, 'faces intersect even without enclosing a vehicle vertex');
  assert.ok(nativeFaceRays(sampler, part).length > 0, 'native physical query independently detects obstruction');
  obstacle.geometry.dispose(); obstacle.material.dispose();
});

// Separate route results keep pre-existing defects visible rather than accepting an aggregate warning.
for (const name of TUNNELS) test(`${name}: pitched bus face bounds and native rays clear walls, masonry, ceiling and lights`, options, async t => {
  const w = gradeWorld(world()), model = await busModels(w), failures = [], perRoute = [], counts = { poses: 0, drawn: 0, native: 0, roofRays: 0 };
  let minOverhead = Infinity;
  const relevant = w.routes.filter(r => r.edge.name === name || (r.connector && r.state(0).move.to.name === name));
  const rayPoint = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const route of relevant) {
    const routeCount = { route: route.label, poses: 0, drawn: 0, native: 0, disagreements: 0, first: null };
    for (const s of route.samples) {
      const v = vehicle(w, route, s), parts = posedParts(model, v); counts.poses++;
      routeCount.poses++;
      for (const part of parts) {
        const drawn = faceIntersections(w.triangles, part), native = nativeFaceRays(w.sampler, part);
        counts.drawn += drawn.length; counts.native += native.length;
        routeCount.drawn += drawn.length; routeCount.native += native.length;
        if ((drawn.length || native.length) && !routeCount.first) {
          routeCount.first = { s, position: [v.x, v.y, v.z], gradePitch: v.gradePitch, camber: v.gradeRoll,
            drawn: drawn.slice(0, 1), native: native.slice(0, 1) };
        }
      }
      // Independently shoot upward from conservative roof points. Do not assume 5.2 m or read
      // unfinished tunnelSpans metadata. Missing rays outside a portal are legitimate open sky.
      for (const z of [-3.55, 1.1]) {
        rayPoint.set(0, z < 0 ? 3.255 : 3.165, z).applyMatrix4(parts[0].matrix);
        w.raycaster.set(rayPoint, up); w.raycaster.near = 0; w.raycaster.far = 8;
        const drawn = w.raycaster.intersectObjects(w.meshes, false)[0]?.distance ?? null;
        const physical = w.sampler.raycastObstacle(rayPoint, up, 8, 0);
        if (drawn !== null || physical !== null) {
          counts.roofRays++;
          if (drawn !== null) minOverhead = Math.min(minOverhead, drawn);
          if (drawn === null || physical === null || Math.abs(drawn - physical) > EPS) {
            routeCount.disagreements++;
            if (!routeCount.first) routeCount.first = { s, roof: rayPoint.toArray(), drawn, physical, reason: 'drawn/native roof-ray disagreement' };
          }
        }
      }
    }
    perRoute.push(routeCount);
    if (routeCount.first) failures.push(routeCount.route);
  }
  t.diagnostic(JSON.stringify({ name, gradeSource: w.sources['grade-separation'], routes: relevant.length, ...counts, minOverhead, perRoute,
    scope: '2 m stations; 0.25 m within 12 m of mouths/edge ends; complete connector approaches/trails; axle pitch/native camber, zero suspension/knock; conservative bus faces plus independent native rays; no terrain/sidewalk/device acceptance' }));
  assert.ok(counts.poses > 100 && counts.roofRays > 50, 'non-vacuous actual route and overhead coverage');
  assert.equal(counts.drawn, 0, 'actual drawn structures intersect conservative pitched bus face bounds; inspect diagnostics');
  assert.equal(counts.native, 0, 'actual native structure rays intersect pitched bus bounds; inspect diagnostics');
  assert.deepEqual(failures, [], 'drawn/native clearance disagreements');
});

// Upper streets at the portals: Bush over the Stockton south headwall and Stockton's dead end, whose U-turn
// reaches over the north approach and is carried by a street deck. Actual bus bodies/signs and wheels clear every
// drawn masonry/wall/ceiling/light face and native body; where a wheel is over the deck, it neither sinks into
// (> 6 cm) nor floats above (> 0.3 m) the drawn deck top. Sampled poses, not continuous motion.
function upperPortalRoutes(w) {
  const mouths = [];
  for (const e of w.net.edges.filter(e => e.name === 'STOCKTON TUNL')) {
    const [lo, hi] = boreInterval(e);
    for (const s of [lo, hi]) mouths.push({ x: e.sx + e.dx * s, z: e.sz + e.dz * s });
  }
  const near = (x, z) => mouths.some(m => Math.hypot(m.x - x, m.z - z) < 45);
  const result = [];
  for (const e of w.net.edges) {
    if (e.bore || !['BUSH ST', 'STOCKTON ST'].includes(e.name)) continue;
    if (![0, .25, .5, .75, 1].some(u => near(e.sx + e.dx * e.len * u, e.sz + e.dz * e.len * u))) continue;
    for (let i = 0; i < e.lanes.length; i++) result.push({ label: `${e.name} edge ${e.id}/${i}`, edge: e, lane: i,
      samples: stations(e.len).filter(s => s >= 3.6 && s < e.len - 6),
      state: s => ({ edge: e, lane: i, s, conn: null, trail: null }) });
    for (const m of e.moves) for (let i = 0; i < e.lanes.length; i++) {
      const j = m.out[i]; if (j < 0 || m.to.bore) continue;
      const c = w.net.connector(e, i, m.to, j);
      result.push({ label: `connector ${e.id}/${i} -> ${m.to.id}/${j}`, edge: e, lane: i, connector: c,
        samples: stations(c.len + 12).map(s => s - 6),
        state: s => s <= c.len ? { edge: e, lane: i, conn: c, cs: s, move: m, out: j, trail: null }
          : { edge: m.to, lane: j, s: s - c.len, conn: null, trail: c } });
    }
  }
  return result;
}
test('upper Bush/Stockton buses clear the new portal structures and ride on the north street deck', options, async t => {
  const w = gradeWorld(world()), model = await busModels(w), down = new THREE.Vector3(0, -1, 0);
  const masonry = w.meshes.filter(m => /masonry$/.test(m.name));
  const counts = { routes: 0, poses: 0, drawn: 0, native: 0, deckWheels: 0, sink: 0, float: 0 }, failures = [];
  let maxSink = -Infinity, maxFloat = -Infinity;
  for (const route of upperPortalRoutes(w)) {
    counts.routes++;
    for (const s of route.samples) {
      const v = vehicle(w, route, s); counts.poses++;
      for (const part of posedParts(model, v)) {
        // Wheels rest on the deck and sit under the full-length body box (0.36 m up), so any parapet or pier that
        // could reach a wheel also reaches the body. Their spun bounding boxes dip below the road: support only.
        const wheel = part.name.includes('wheel');
        const drawn = wheel ? [] : faceIntersections(w.triangles, part), native = wheel ? [] : nativeFaceRays(w.sampler, part);
        counts.drawn += drawn.length; counts.native += native.length;
        if ((drawn.length || native.length) && failures.length < 40) failures.push({ route: route.label, s, part: part.name, pose: [v.x, v.y, v.z, v.yaw, v.gradePitch], native: native[0]?.distance });
        if (!wheel) continue;
        const centre = new THREE.Vector3().setFromMatrixPosition(part.matrix), contact = centre.y - model.spec.wheelRadius;
        w.raycaster.set(new THREE.Vector3(centre.x, contact + 2, centre.z), down); w.raycaster.near = 0; w.raycaster.far = 4;
        const deck = w.raycaster.intersectObjects(masonry, false)[0];
        if (!deck) continue;
        counts.deckWheels++;
        const sink = deck.point.y - contact;
        maxSink = Math.max(maxSink, sink); maxFloat = Math.max(maxFloat, -sink);
        if (sink > .06) counts.sink++;
        if (sink < -.3) counts.float++;
      }
    }
  }
  t.diagnostic(JSON.stringify({ ...counts, maxSink, maxFloat, failures,
    scope: 'Bush and Stockton surface lanes/connectors within 45 m of either Stockton mouth; conservative bus faces and wheels; sampled' }));
  assert.ok(counts.routes > 10 && counts.poses > 300, 'non-vacuous upper-street coverage');
  assert.ok(counts.deckWheels > 50, 'the dead-end U-turn actually rides over the north deck');
  assert.equal(counts.drawn, 0, 'drawn portal structures intersect an upper-street bus');
  assert.equal(counts.native, 0, 'native portal bodies intersect an upper-street bus');
  assert.deepEqual({ sink: counts.sink, float: counts.float }, { sink: 0, float: 0 }, 'deck supports the upper-street wheels');
});

// Terrain is an independent rendered surface, not one of the grade structure boxes above. These
// focused portal crops deliberately keep the real DEM, diagonal, clipping and skirts. Ordinary tyre
// contact is excluded: the tested geometry is the complete bus body/signs (including pods/mirrors),
// whose lowest skin is above the road. Existing wheel/structure clearance tests remain unchanged.
const portalCrops = new Map();
let terrainSource;
function portalGates(w, name) {
  return w.net.edges.filter(e => e.name === name && e.bore?.kind === 'tunnel').flatMap(e => {
    const offset = Math.hypot(e.sx - e.x0, e.sz - e.z0), [lo, hi] = boreInterval(e);
    return [Math.max(-offset, lo), Math.min(e.span - offset, hi)].map((s, end) => ({
      edge: e.id, end, s, x: e.sx + e.dx * s, z: e.sz + e.dz * s
    }));
  });
}
function portalCrop(w, gate, cuts = true) {
  const core = w.N.Terrain;
  const originX = core.originX + Math.floor((gate.x - core.originX - 96) / 64) * 64;
  const originZ = core.originZ + Math.floor((gate.z - core.originZ - 96) / 64) * 64;
  const key = `${originX},${originZ},${cuts}`;
  if (portalCrops.has(key)) return portalCrops.get(key);
  const crop = { ...core, originX, originZ, w: 129, h: 129, cell: 2, heights: new Float32Array(129 * 129) };
  for (let j = 0; j < crop.h; j++) for (let i = 0; i < crop.w; i++)
    crop.heights[j * crop.w + i] = core.heightAt(originX + i * 2, originZ + j * 2);
  // A separate VM namespace avoids swapping the production terrain object used by path/camber
  // callbacks. This builder receives the exact current grade cuts, with only local drawing cropped.
  const grade = w.grade;
  const N = { THREE, Terrain: crop, GradeSeparation: { ...grade, terrainCuts: cuts ? grade.terrainCuts : [] },
    DATA: { groundMask: { header: { w: 1, h: 1 }, mask: new Uint8Array([0]) } }, SHADOW_PROXY_LAYER: 3,
    createTerrainMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: N }, console: { info() {} } });
  terrainSource ??= read('js/terrain-mesh.js');
  vm.runInContext(terrainSource, context, { filename: 'js/terrain-mesh.js' });
  const drawing = N.buildTerrainMesh(new THREE.Group());
  const focus = { x: gate.x, y: core.groundAt(gate.x, gate.z), z: gate.z };
  drawing.update({ ...focus, y: focus.y + 2 }, 0, focus);
  drawing.group.updateMatrixWorld(true);
  const stats = drawing.stats(), meshes = drawing.group.children.filter(m => m.name === 'TerrainTile');
  assert.ok(stats.lods[0] > 0 && stats.lods.slice(1).every(n => n === 0), 'entire portal crop uses actual 2 m LOD');
  assert.ok(meshes.length > 0 && stats.triangles > 100, 'nonempty actual drawn terrain, not a query-only floor');
  for (const mesh of meshes) for (const attr of ['position', 'normal'])
    assert.ok(mesh.geometry.attributes[attr].array.every(Number.isFinite), `finite clipped terrain ${attr}`);
  const result = { drawing, index: triangleIndex(meshes), key, originX, originZ,
    bounds: new THREE.Box3(new THREE.Vector3(originX, -Infinity, originZ), new THREE.Vector3(originX + 256, Infinity, originZ + 256)),
    facts: { originX, originZ, cuts, lods: stats.lods, triangles: stats.triangles } };
  portalCrops.set(key, result);
  return result;
}
function terrainRayAdapter(index, counts) {
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  return {
    raycastObstacle(origin, direction, length) {
      assert.ok([origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, length].every(Number.isFinite), 'finite terrain/body ray');
      counts.rays++;
      const end = origin.clone().addScaledVector(direction, length);
      const bounds = new THREE.Box3().setFromPoints([origin, end]).expandByScalar(1e-7);
      const candidates = index(bounds); counts.rayCandidates += candidates.size;
      ray.set(origin, direction); let nearest = null;
      for (const item of candidates) {
        if (!ray.intersectTriangle(...item.points, false, hit)) continue;
        const distance = origin.distanceTo(hit);
        if (distance <= length && (nearest === null || distance < nearest)) nearest = distance;
      }
      return nearest;
    }
  };
}
function terrainProbe(crop, part, counts) {
  const bounds = new THREE.Box3();
  for (const box of part.boxes) bounds.union(box.clone().applyMatrix4(part.matrix));
  assert.ok([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite), 'finite pitched bus bounds');
  assert.ok(crop.bounds.containsBox(bounds), 'whole bus is inside the actual 2 m crop');
  const countedIndex = box => { const candidates = crop.index(box); counts.faceQueries++;
    counts.faceCandidates += candidates.size; return candidates; };
  const faces = faceIntersections(countedIndex, part);
  const rays = nativeFaceRays(terrainRayAdapter(crop.index, counts), part);
  counts.poses++; counts.faces += faces.length; counts.rayHits += rays.length;
  return { faces, rays, bounds };
}
function terrainPoseSamples(w, route, gates) {
  if (route.connector) return route.samples;
  const values = new Set();
  for (const gate of gates.filter(g => g.edge === route.edge.id)) for (let k = -128; k <= 128; k++) {
    const s = gate.s + k * .25;
    // Same reachable-state distinction as the structural clearance test: connector/trail cases
    // own the bus's entry and departure, not a fictitious straight extension of an edge.
    if (s >= 3.6 && s < route.edge.len - 6) values.add(s);
  }
  return [...values].sort((a, b) => a - b);
}
function triangleContacts(a, b) {
  // Both sets of edges are necessary: either triangle can contain the other's intersection.
  // Coplanar vertex/edge overlap is handled explicitly; a one-way ray witness misses those cases.
  const points = [], ray = new THREE.Ray(), hit = new THREE.Vector3(), plane = new THREE.Plane();
  const add = p => { if (!points.some(q => q.distanceToSquared(p) < 1e-14)) points.push(p.clone()); };
  const ap = [a.a, a.b, a.c], bp = [b.a, b.b, b.c];
  for (const [vertices, other] of [[ap, b], [bp, a]]) {
    other.getPlane(plane);
    for (let i = 0; i < 3; i++) {
      const p = vertices[i], q = vertices[(i + 1) % 3], direction = q.clone().sub(p), length = direction.length();
      if (Math.abs(plane.distanceToPoint(p)) < 1e-7 && other.containsPoint(p)) add(p);
      if (length < 1e-9) continue;
      ray.set(p, direction.divideScalar(length));
      if (ray.intersectTriangle(other.a, other.b, other.c, false, hit) && p.distanceTo(hit) <= length + 1e-8) add(hit);
    }
  }
  a.getPlane(plane);
  if (bp.every(p => Math.abs(plane.distanceToPoint(p)) < 1e-7)) {
    const n = plane.normal, axes = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z)
      ? ['y', 'z'] : Math.abs(n.y) > Math.abs(n.z) ? ['x', 'z'] : ['x', 'y'];
    const [u, v] = axes;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const p = ap[i], q = ap[(i + 1) % 3], r = bp[j], s = bp[(j + 1) % 3];
      const ax = q[u] - p[u], ay = q[v] - p[v], bx = s[u] - r[u], by = s[v] - r[v], det = ax * by - ay * bx;
      if (Math.abs(det) < 1e-12) continue;
      const dx = r[u] - p[u], dy = r[v] - p[v], t = (dx * by - dy * bx) / det, k = (dx * ay - dy * ax) / det;
      if (t >= -1e-8 && t <= 1 + 1e-8 && k >= -1e-8 && k <= 1 + 1e-8) add(p.clone().lerp(q, t));
    }
  }
  return points;
}
function triangleKey(points) {
  return digest(points.map(p => p.toArray()).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]));
}
function exactTerrainContacts(crop, part, bounds, busIndex) {
  const inverse = part.matrix.clone().invert(), terrain = new THREE.Triangle(), bus = new THREE.Triangle(), contacts = [];
  for (const item of crop.index(bounds)) {
    terrain.set(...item.points.map(p => p.clone().applyMatrix4(inverse)));
    const box = new THREE.Box3().setFromPoints([terrain.a, terrain.b, terrain.c]);
    let highest = null, pairs = 0;
    for (const body of busIndex(box)) {
      bus.set(...body.points);
      const points = triangleContacts(terrain, bus);
      if (!points.length) continue;
      pairs++;
      for (const p of points) if (!highest || p.y > highest.y) highest = p;
    }
    if (highest) contacts.push({ key: triangleKey(item.points), vertices: item.points.map(p => p.toArray()), pairs,
      localY: highest.y, point: highest.clone().applyMatrix4(part.matrix).toArray() });
  }
  return contacts;
}
function inheritedContact(contact, baseline) {
  for (const old of baseline) {
    if (contact.key === old.key) return 'identical';
    const triangle = new THREE.Triangle(...old.vertices.map(p => new THREE.Vector3(...p))), nearest = new THREE.Vector3();
    // A strictly trimmed/retriangulated part of an old colliding triangle cannot introduce new
    // surface at this identical pose. No credit from other poses, neighboring faces or empty space.
    if (contact.vertices.every(p => {
      const v = new THREE.Vector3(...p); triangle.closestPointToPoint(v, nearest); return v.distanceTo(nearest) <= EPS;
    })) return 'trimmed';
  }
  return null;
}

test('terrain portal negative control: disabling cavity cuts obstructs the actual Stockton bus approach', options, async t => {
  const w = gradeWorld(world()), model = await busModels(w);
  const route = w.routes.find(r => !r.connector && r.edge.name === 'STOCKTON TUNL');
  const gate = portalGates(w, 'STOCKTON TUNL').find(g => g.edge === route.edge.id && g.end === 0);
  const crop = portalCrop(w, gate, false), counts = { poses: 0, faces: 0, rayHits: 0, rays: 0, faceQueries: 0, faceCandidates: 0, rayCandidates: 0 };
  const cut = portalCrop(w, gate), busIndex = triangleIndex([model.body, model.signs].map(geometry => ({ geometry, matrixWorld: new THREE.Matrix4(), name: 'bus' })));
  let witness = null;
  for (let k = 4; k <= 48 && !witness; k++) {
    const s = gate.s + k * .25, v = vehicle(w, route, s), part = posedParts(model, v)[0];
    const probe = terrainProbe(crop, part, counts);
    if (probe.faces.length && probe.rays.length) {
      const uncutContacts = exactTerrainContacts(crop, part, probe.bounds, busIndex);
      const cutContacts = exactTerrainContacts(cut, part, probe.bounds, busIndex);
      const added = uncutContacts.filter(c => !inheritedContact(c, cutContacts));
      if (added.length) witness = { route: route.label, s, fromMouth: s - gate.s,
        position: [v.x, v.y, v.z], gradePitch: v.gradePitch, face: probe.faces[0], ray: probe.rays[0],
        exactAddedWithoutCuts: added.length, exact: added[0] };
    }
  }
  t.diagnostic(JSON.stringify({ control: 'same actual DEM/body; only terrainCuts=[]', ...counts, crop: crop.facts, witness }));
  assert.ok(witness, 'disabled-cut control must fail both whole-face SAT and drawn terrain/body rays at the Stockton mouth');
  assert.ok(counts.rays > 0 && counts.faceCandidates > 0 && counts.rayCandidates > 0, 'non-vacuous finite control probes');
});

test('terrain portal exact-contact kernel detects reciprocal and coplanar triangle intersections', () => {
  const tri = vertices => new THREE.Triangle(...vertices.map(p => new THREE.Vector3(...p)));
  const a = tri([[-2, 0, -1], [2, 0, -1], [0, 0, 2]]);
  const b = tri([[-2, 0, 1], [2, 0, 1], [0, 0, -2]]);
  assert.ok(triangleContacts(a, b).length >= 4, 'coplanar crossed edges without an enclosed vertex');
  const c = tri([[0, -1, 0], [0, 1, 0], [1, 0, .5]]);
  assert.ok(triangleContacts(a, c).length > 0 && triangleContacts(c, a).length > 0, 'both operand orders');
  const d = tri([[-2, 1, -1], [2, 1, -1], [0, 1, 2]]);
  assert.equal(triangleContacts(a, d).length, 0, 'separated planes');
});

for (const name of TUNNELS) test(`${name}: repaired terrain portals clear the bus; only exact inherited Sacramento contacts are allowed`, options, async t => {
  const w = gradeWorld(world()), model = await busModels(w), core = w.N.Terrain, coreHeights = core.heights;
  const coreHash = sha(Buffer.from(coreHeights.buffer, coreHeights.byteOffset, coreHeights.byteLength));
  const modelHash = digest([model.body, model.signs].map(g => [typed(g.attributes.position.array), typed(g.index.array)]));
  assert.equal(coreHash, SACRAMENTO.coreHash); assert.equal(modelHash, SACRAMENTO.modelHash);
  const sacramentoRoute = w.routes.find(r => r.label === SACRAMENTO.route);
  assert.ok(sacramentoRoute, 'original Sacramento connector is present');
  const sacramentoPoses = sacramentoRoute.samples.map(s => {
    const v = vehicle(w, sacramentoRoute, s);
    return [s, v.x, v.y, v.z, v.yFront, v.yRear, v.gradePitch, v.gradeRoll, v.yaw];
  });
  assert.equal(digest(sacramentoPoses), SACRAMENTO.poseHash, 'allowlisted connector poses are still exactly original 67f0686');
  const keys = SACRAMENTO.triangles.map(vertices => triangleKey(vertices.map(p => new THREE.Vector3(...p))));
  const allowed = new Map(SACRAMENTO.poses.map(([s, ids]) => [`${SACRAMENTO.route}|${s}`, new Set(ids.map(id => keys[id]))]));
  assert.equal([...allowed.values()].reduce((n, set) => n + set.size, 0), 61, 'only the 61 original Sacramento triangle/pose contacts');
  const gates = portalGates(w, name), gateCounts = gates.map(g => ({ edge: g.edge, end: g.end, samples: 0 }));
  const relevant = w.routes.filter(r => r.edge.name === name || (r.connector && r.state(0).move.to.name === name));
  const busIndex = triangleIndex([model.body, model.signs].map(geometry => ({ geometry, matrixWorld: new THREE.Matrix4(), name: 'bus' })));
  const blank = () => ({ poses: 0, faces: 0, rayHits: 0, rays: 0, faceQueries: 0, faceCandidates: 0, rayCandidates: 0,
    exact: 0, inheritedSacramento: 0, added: 0, upperBody: 0 });
  const total = blank(), reports = [], usedCrops = new Map();
  for (const route of relevant) {
    const counts = blank();
    let first = null, exact = null, firstAdded = null, firstUpper = null, maxLocalY = -Infinity;
    for (const s of terrainPoseSamples(w, route, gates)) {
      const v = vehicle(w, route, s);
      const distances = gates.map(g => Math.hypot(v.x - g.x, v.z - g.z));
      const nearest = Math.min(...distances);
      if (nearest > 48) continue; // source portal/join approaches only, not unrelated city intersections
      const gate = gates[distances.indexOf(nearest)], crop = portalCrop(w, gate);
      distances.forEach((distance, i) => { if (distance <= 48) gateCounts[i].samples++; });
      usedCrops.set(crop.key, crop.facts);
      const part = posedParts(model, v)[0], probe = terrainProbe(crop, part, counts);
      const current = probe.faces.length || probe.rays.length ? exactTerrainContacts(crop, part, probe.bounds, busIndex) : [];
      const old = allowed.get(`${route.label}|${s}`);
      for (const contact of current) {
        counts.exact++; maxLocalY = Math.max(maxLocalY, contact.localY);
        const inherited = old?.has(contact.key) ?? false;
        if (inherited) counts.inheritedSacramento++; else counts.added++;
        const evidence = { s, position: [v.x, v.y, v.z], gradePitch: v.gradePitch, contact,
          attribution: inherited ? 'identical original Sacramento grounding' : 'not in narrow original allowlist' };
        exact ??= evidence;
        if (!inherited) firstAdded ??= evidence;
        if (contact.localY >= UPPER_BODY_Y) { counts.upperBody++; firstUpper ??= evidence; }
      }
      if (probe.faces.length || probe.rays.length) {
        first ??= { s, position: [v.x, v.y, v.z], gradePitch: v.gradePitch, camber: v.gradeRoll,
          gate: { edge: gate.edge, end: gate.end, distance: nearest }, face: probe.faces[0], ray: probe.rays[0] };
      }
    }
    if (counts.poses) {
      reports.push({ route: route.label, ...counts, maxLocalY: Number.isFinite(maxLocalY) ? maxLocalY : null,
        first, firstExact: exact, firstAdded, firstUpper });
      for (const key of Object.keys(total)) total[key] += counts[key];
    }
  }
  t.diagnostic(JSON.stringify({ name, gradeSource: w.sources['grade-separation'], terrainSource: sha(terrainSource),
    inheritedEvidence: { ref: TERRAIN_BASELINE_REF, route: SACRAMENTO.route, contacts: 61 },
    ...total, gates: gateCounts, crops: [...usedCrops.values()], routes: reports,
    scope: 'actual bus triangles at reviewed poses; only exact original Sacramento route/station/triangle membership is allowed; every other exact contact and every upper-body localY>=2.5 m contact fails; sampled not continuous motion' }));
  assert.equal(w.N.Terrain, core, 'core terrain owner never replaced');
  assert.equal(core.heights, coreHeights, 'core terrain buffer owner never replaced');
  assert.equal(sha(Buffer.from(coreHeights.buffer, coreHeights.byteOffset, coreHeights.byteLength)), coreHash, 'core heights unchanged');
  assert.deepEqual(graphFacts(w.net), w.before, 'cropped drawing does not change traffic graph/lane/connector profiles');
  assert.equal(w.before.graph, FROZEN.graph, 'frozen core graph still exercised');
  assert.ok(Object.values(total).every(n => Number.isSafeInteger(n) && n >= 0), 'finite bounded probe counters');
  assert.ok(total.poses > 100 && total.rays > total.poses && total.faceQueries === total.poses, 'non-vacuous terrain/body queries at every pose');
  assert.ok(gateCounts.every(g => g.samples > 0), 'both ends of every directed tunnel run are sampled');
  assert.ok(total.inheritedSacramento <= 61, 'allowlist cannot admit any additional grounding contact');
  assert.deepEqual({ unexpectedContacts: total.added, upperBodyContacts: total.upperBody },
    { unexpectedContacts: 0, upperBodyContacts: 0 },
    'exact terrain intersections outside original Sacramento evidence fail; upper-body/roof contacts always fail');
});

test.after(() => {
  for (const { drawing } of portalCrops.values()) {
    drawing.dispose();
    drawing.group.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
  }
  for (const geometry of models ? [models.body, models.signs, ...models.wheels] : []) geometry.dispose();
  for (const mesh of cached?.grade?.group.children ?? []) { mesh.geometry?.dispose(); mesh.material?.dispose(); }
});
