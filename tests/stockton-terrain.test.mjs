// Actual core geometry, shared traffic profiles and native 120 Hz riding. No browser or renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const EPS = 2e-4; // Float32 drawn vertices versus registered Float64 facets/bodies, metres
const worlds = new Map();
function fixture({ legacyPortals = false } = {}) {
  if (worlds.has(legacyPortals)) return worlds.get(legacyPortals);
  const N = { THREE, DEBUG_ROADS: false,
    createRoadSurfaceMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    createMarbleAshlarMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: N }, console: { info() {} } });
  let gradeHash, roadHash;
  const load = name => {
    // Optional frozen disabled-fix replay; ordinary tests have no Git/history dependency.
    let source = name === 'grade-separation' && process.env.SF_TUNNEL_GRADE_REF
      ? execFileSync('git', ['show', `${process.env.SF_TUNNEL_GRADE_REF}:js/grade-separation.js`], { cwd: root, encoding: 'utf8' })
      : read(`js/${name}.js`);
    if (name === 'road-network' && legacyPortals) {
      if (process.env.SF_TUNNEL_ROAD_REF) source = execFileSync('git', ['show', `${process.env.SF_TUNNEL_ROAD_REF}:js/road-network.js`],
        { cwd: root, encoding: 'utf8' });
      else {
        const correction = '  k0 = cleanApproach(k0, 1);\n  k1 = cleanApproach(k1, -1);';
        assert.ok(source.includes(correction), 'disabled-headwall-repair control has an exact source boundary');
        source = source.replace(correction, '');
      }
    }
    if (name === 'grade-separation') gradeHash = createHash('sha256').update(source).digest('hex');
    if (name === 'road-network') roadHash = createHash('sha256').update(source).digest('hex');
    vm.runInContext(source, context);
  };
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'road-network', 'sf-ride-geometry']) load(name);
  const b = fs.readFileSync(new URL('data/terrain-core.bin', root)), n = b.readUInt32LE(4);
  const header = JSON.parse(b.toString('utf8', 8, 8 + n));
  N.Terrain.load(header, new Uint16Array(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length)));
  const terrain = N.Terrain;
  terrain.patchesEnabled = false;
  const sidewalks = N.BLOCKS.map(block => ({ ...block, block }));
  const network = N.buildRoadNetwork(sidewalks, []);
  const heights = terrain.heights, heightAt = terrain.heightAt, groundAt = terrain.groundAt;
  const terrainHash = () => createHash('sha256').update(Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength)).digest('hex');
  const originalHash = terrainHash();
  load('grade-separation');
  const grade = N.buildGradeSeparation(new THREE.Group(), network);
  assert.equal(N.Terrain, terrain); assert.equal(terrain.heights, heights);
  assert.equal(terrain.heightAt, heightAt); assert.equal(terrain.groundAt, groundAt);
  assert.equal(terrainHash(), originalHash, 'local crossing construction cannot mutate the shared terrain field');
  N.GradeSeparation = grade;
  const sampler = new SfTerrainSampler({ city: N, terrain, grade, ride: N.ride });

  // First Stockton edge and two-metre inside-portal offset, matching the native riding fixture.
  const e = network.edges.find(e => e.bore?.kind === 'tunnel' && e.name.toLowerCase().includes('stockton'));
  const t = u => (u - e.bore.a0) / (e.bore.a1 - e.bore.a0 || 1) * e.span;
  const lo = Math.max(0, Math.min(t(e.bore.p0), t(e.bore.p1)));
  const hi = Math.min(e.span, Math.max(t(e.bore.p0), t(e.bore.p1)));
  const point = station => {
    const lateral = e.lanes[0] ?? 0;
    const x = e.x0 + e.dx * station + e.rx * lateral, z = e.z0 + e.dz * station + e.rz * lateral;
    return { x, y: grade.floorAt(x, z, -10000), z, station };
  };
  const start = point(lo + 2), ridden = point(lo + 2 + 6.013755961281757);
  // Last recorded forward rider pose (the next placement's `before` in the parent report), after screenshot coasting.
  // Camera transform and the visible car's actor ID were not captured; do not invent either.
  const recorded = { x: -446.0934834679466, y: 32.139973773634736, z: -183.25108995031155 };
  const recordedStation = (recorded.x - e.x0) * e.dx + (recorded.z - e.z0) * e.dz;

  // Keep the original full core in the sampler/network. Only drawing construction is cropped.
  N.DATA = { groundMask: { header: { w: 1, h: 1 }, mask: new Uint8Array([0]) } };
  N.createTerrainMaterial = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  N.SHADOW_PROXY_LAYER = 3;
  const drawings = [];
  const buildDrawing = (cuts, focus = ridden, bounds = { originX: -600, originZ: -524, w: 97, h: 257 }, originalTerrain = false) => {
    const crop = { ...terrain, ...bounds, cell: 2 };
    crop.heights = new Float32Array(crop.w * crop.h);
    for (let j = 0; j < crop.h; j++) for (let i = 0; i < crop.w; i++)
      crop.heights[j * crop.w + i] = terrain.heightAt(crop.originX + i * 2, crop.originZ + j * 2);
    N.Terrain = crop;
    load('terrain-mesh'); // captures this crop only; previous drawings retain their own buffers
    N.GradeSeparation = { ...grade, terrainCuts: cuts, ...(originalTerrain ? { carveAt: () => null } : {}) };
    const drawing = N.buildTerrainMesh(new THREE.Group());
    drawing.update({ x: focus.x, y: focus.y + 2, z: focus.z }, 0, focus);
    drawing.group.updateMatrixWorld(true);
    drawings.push(drawing);
    N.Terrain = terrain;
    N.GradeSeparation = grade;
    return drawing;
  };
  const uncut = buildDrawing([]), drawing = buildDrawing(grade.terrainCuts);
  N.GradeSeparation = grade;
  const traffic = read('js/traffic.js');
  // Evaluate the actual actor path/axle functions in an isolated CPU realm, without modifying runtime traffic.
  const actor = vm.createContext({ edgeY: network.edgeY, edgeGrade: network.edgeGrade, curveY: network.curveY,
    curvePoint: network.curvePoint, Math });
  vm.runInContext(traffic.slice(traffic.indexOf('  function lanePoint('), traffic.indexOf('  // Move v along and across')) +
    ';globalThis.locate=locate;', actor);
  grade.group.updateMatrixWorld(true);
  const obstacles = grade.group.children.filter(m => /SFGradeSeparation_(ceiling|light|masonry|wall)$/.test(m.name));
  const result = { N, e, lo, hi, start, ridden, recorded, recordedStation, point, terrain, network, grade, sampler,
    uncut, drawing, actor, gradeHash, roadHash, buildDrawing, drawings, obstacles, load };
  worlds.set(legacyPortals, result);
  return result;
}

function terrainRay(drawing, origin, direction, distance) {
  return new THREE.Raycaster(origin, direction, 0.01, distance).intersectObject(drawing.group, true);
}
function meshY(mesh, p, ceiling = false) {
  mesh.updateMatrixWorld(true);
  const origin = new THREE.Vector3(p.x, p.y + (ceiling ? .05 : 2), p.z);
  const dir = new THREE.Vector3(0, ceiling ? 1 : -1, 0);
  return new THREE.Raycaster(origin, dir, 0, ceiling ? 10 : 4).intersectObject(mesh, false)[0]?.point.y;
}

function driveNative(w, start, direction, distance, { seconds = 100 } = {}) {
  const y = w.sampler.sampleGround(start.x, start.z, { normal: {} }, w.terrain.groundAt(start.x, start.z)).height;
  const spawn = { position: { ...start, y }, headingY: Math.atan2(direction.x, direction.z) };
  const rider = new EucController(w.sampler, { spawn });
  assert.equal(rider.reset(spawn, 5), true, 'checked native reset at a real approach');
  let progress = 0, maxSpeed = 0, maxStep = 0, previous = y, steps = 0, state = rider.snapshot();
  for (; steps < 120 * seconds && progress < distance && !state.crashed; steps++) {
    rider.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: Math.max(-.3, Math.min(.3, (6 - rider.speed) * .25)) });
    state = rider.snapshot(); const p = state.position;
    progress = (p.x - start.x) * direction.x + (p.z - start.z) * direction.z;
    maxSpeed = Math.max(maxSpeed, Math.abs(state.speed)); maxStep = Math.max(maxStep, Math.abs(p.y - previous)); previous = p.y;
    assert.ok(maxSpeed < 10, 'reasonable native riding speed');
  }
  return { progress, complete: progress >= distance, seconds: steps / 120, maxSpeed, maxStep,
    crashed: state.crashed, crashCause: state.crashCause, blocked: state.blocked, finalSpeed: state.speed, position: state.position };
}
function driveStockton(w, e, options) {
  const at = u => (u - e.bore.a0) / (e.bore.a1 - e.bore.a0) * e.span;
  const lo = Math.min(at(e.bore.p0), at(e.bore.p1)), hi = Math.max(at(e.bore.p0), at(e.bore.p1));
  return driveNative(w, { x: e.x0 + e.dx * (lo - 12) + e.rx * e.lanes[0], z: e.z0 + e.dz * (lo - 12) + e.rz * e.lanes[0] },
    { x: e.dx, z: e.dz }, hi - lo + 24, options);
}
test('native 120 Hz Stockton riding crosses both portals in both directions below 10 m/s', { timeout: 90000 }, t => {
  const w = fixture(), reports = [];
  for (const e of w.network.edges.filter(e => e.name === 'STOCKTON TUNL' && e.bore?.kind === 'tunnel')) {
    const report = driveStockton(w, e);
    assert.equal(report.crashed, false, JSON.stringify({ edge: e.id, ...report }));
    assert.equal(report.complete, true, 'complete native entrance, full bore and departure');
    reports.push({ edge: e.id, ...report });
  }
  assert.equal(reports.length, 2); t.diagnostic(JSON.stringify(reports));
});
test('rejected floor-minus-half-metre apron contract is a failing native controller control', t => {
  const w = fixture({ legacyPortals: true }), e = w.e;
  const at = (s, o, y) => ({ x: e.x0 + e.dx * s + e.rx * o, y, z: e.z0 + e.dz * s + e.rz * o });
  const start = at(w.lo - 4, 0, 0), y0 = w.terrain.groundAt(start.x, start.z), y1 = e.bore.y0 - .5;
  // Explicit controlled reproduction of the rejected apron contract at the ACTUAL old Stockton mouth, not a claim
  // that disabling re-anchoring alone recreates that apron. Both use the real native controller, unchanged tuning.
  const vertices = [at(w.lo - 4, -4.35, y0), at(w.lo - 4, 4.35, y0), at(w.lo, 4.35, y1), at(w.lo, -4.35, y1)];
  const tops = [[0, 1, 2], [0, 2, 3]].map(ids => {
    const p = ids.map(i => vertices[i]), plane = new THREE.Plane().setFromCoplanarPoints(...p.map(v => new THREE.Vector3(v.x, v.y, v.z)));
    return { poly: p.map(v => ({ x: v.x, z: v.z })), top: Math.max(...p.map(v => v.y)), surface: 'pavement', layered: true,
      replacesTerrain: true, maxReferenceY: e.bore.y0 + 2.5,
      plane: { ...p[0], dx: -plane.normal.x / plane.normal.y, dz: -plane.normal.z / plane.normal.y } };
  });
  const sampler = new SfTerrainSampler({ city: w.N, terrain: w.terrain, grade: w.grade,
    ride: { ...w.N.ride, tops: [...w.N.ride.tops, ...tops] } });
  const report = driveStockton({ ...w, sampler }, e, { seconds: 12 });
  t.diagnostic(JSON.stringify(report));
  assert.equal(report.complete, false, 'half-metre apron lip must not pass the native journey');
  assert.ok(report.progress > 8 && report.progress < 12 && report.finalSpeed < .1,
    'negative control reaches the actual lip and remains stopped despite sustained forward input');
});

function faceIndex(meshes, bounds) {
  const cells = new Map(), size = 16;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
      const points = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
      const box = new THREE.Box3().setFromPoints(points);
      if (!box.intersectsBox(bounds)) continue;
      const face = { points, box, name: mesh.name };
      for (let x = Math.floor(box.min.x / size); x <= Math.floor(box.max.x / size); x++)
        for (let z = Math.floor(box.min.z / size); z <= Math.floor(box.max.z / size); z++) {
          const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(face);
        }
    }
  }
  return box => {
    const out = new Set();
    for (let x = Math.floor(box.min.x / size); x <= Math.floor(box.max.x / size); x++)
      for (let z = Math.floor(box.min.z / size); z <= Math.floor(box.max.z / size); z++)
        for (const face of cells.get(`${x},${z}`) ?? []) if (box.intersectsBox(face.box)) out.add(face);
    return out;
  };
}
test('actual pitched bus body, roof and signs clear terrain AND pavement through both Stockton mouths in both directions', { timeout: 90000 }, async t => {
  const w = fixture(), threeURL = new URL('vendor/three/build/three.webgpu.js', root).href;
  const utils = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js').replace("from 'three'", `from '${threeURL}'`);
  w.N.Addons = await import(`data:text/javascript;base64,${Buffer.from(utils).toString('base64')}`);
  w.N.TSL = TSL; w.N.cityUniforms = { uInteriorGlow: TSL.uniform(.8) }; w.load('actor-models');
  const models = [w.N.buildLoftedBusBodyGeometry(), w.N.buildBusSignGeometry()];
  for (const geometry of models) geometry.computeBoundingBox();
  const body = models.reduce((box, geometry) => box.union(geometry.boundingBox), new THREE.Box3());
  assert.ok(Math.abs(body.max.y - 3.255) < 1e-6 && Math.abs(body.min.y - .36) < 1e-6,
    'includes actual underbody and rooftop equipment; excludes only the intended tyre contact');
  const crops = new Map(), reports = [], triangle = new THREE.Triangle();
  let controlHits = 0;
  try {
    for (const e of w.network.edges.filter(e => e.name === 'STOCKTON TUNL')) {
      const at = u => (u - e.bore.a0) / (e.bore.a1 - e.bore.a0) * e.span;
      for (const gate of [at(e.bore.p0), at(e.bore.p1)]) {
        const gx = e.x0 + e.dx * gate, gz = e.z0 + e.dz * gate;
        const originX = w.terrain.originX + Math.floor((gx - w.terrain.originX - 96) / 64) * 64;
        const originZ = w.terrain.originZ + Math.floor((gz - w.terrain.originZ - 96) / 64) * 64, key = `${originX},${originZ}`;
        if (!crops.has(key)) {
          const focus = { x: gx, z: gz, y: w.terrain.groundAt(gx, gz) }, bounds = { originX, originZ, w: 129, h: 129 };
          const drawing = w.buildDrawing(w.grade.terrainCuts, focus, bounds), uncut = w.buildDrawing([], focus, bounds);
          assert.deepEqual(Array.from(drawing.stats().lods), [16, 0, 0, 0], 'entire local drawing is actual 2 m terrain');
          const box = new THREE.Box3(new THREE.Vector3(originX, -Infinity, originZ), new THREE.Vector3(originX + 256, Infinity, originZ + 256));
          crops.set(key, { current: faceIndex([...drawing.group.children.filter(m => m.name === 'TerrainTile'), ...w.grade.group.children], box),
            control: faceIndex(uncut.group.children.filter(m => m.name === 'TerrainTile'), box) });
        }
        const crop = crops.get(key); let samples = 0, maxPitch = 0;
        for (let delta = -16; delta <= 16; delta += .25) {
          const s = gate + delta - Math.hypot(e.sx - e.x0, e.sz - e.z0);
          const v = { edge: e, lane: 0, s, axle: 3.6, dl: 0, dlv: 0, speed: 6, conn: null, trail: null };
          w.actor.locate(v);
          const yaw = Math.atan2(v.tx, v.tz) - v.nose;
          const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-v.gradePitch, yaw, 0, 'YXZ')).setPosition(v.x, v.y, v.z);
          const inverse = matrix.clone().invert(), bounds = body.clone().applyMatrix4(matrix);
          for (const face of crop.current(bounds)) {
            triangle.set(...face.points.map(p => p.clone().applyMatrix4(inverse)));
            assert.equal(body.intersectsTriangle(triangle), false, `edge ${e.id}, delta ${delta}, ${face.name}: conservative full bus face obstruction`);
          }
          if (!controlHits) for (const face of crop.control(bounds)) {
            triangle.set(...face.points.map(p => p.clone().applyMatrix4(inverse)));
            if (body.intersectsTriangle(triangle)) controlHits++;
          }
          samples++; maxPitch = Math.max(maxPitch, Math.abs(v.gradePitch));
        }
        reports.push({ edge: e.id, gate, samples, maxPitchDegrees: maxPitch * 180 / Math.PI });
      }
    }
  } finally { for (const geometry of models) geometry.dispose(); }
  assert.equal(reports.length, 4); assert.ok(controlHits > 0, 'same real bus intersects the uncut headwall control');
  t.diagnostic(JSON.stringify({ reports, controlHits, scope: 'conservative bounds of actual body/sign vertices, including underbody; 0.25 m samples ±16 m around each gate; actual axle pitch; all terrain and grade faces' }));
});

test('Stockton QA fixture: actor lane, drawn floor and native support agree below a separately drawn ceiling', () => {
  const { e, lo, hi, start, recorded, recordedStation, point, grade, sampler, actor } = fixture();
  assert.ok(start.y > 28 && start.y < 30, 'entrance is anchored to the lower road, not the blurred headwall');
  const replay = point(recordedStation);
  assert.ok(Math.hypot(replay.x - recorded.x, replay.z - recorded.z) < 1e-8);
  assert.ok(replay.y < recorded.y - 2 && replay.y > recorded.y - 3, 'reviewed floor correction at the original QA XZ');
  const road = grade.group.children.find(m => m.name === 'SFGradeSeparation_road');
  const ceiling = grade.group.children.find(m => m.name === 'SFGradeSeparation_ceiling');
  for (const station of [lo + 2, lo + 8.013755961281757, recordedStation, (lo + hi) / 2, hi - 2]) {
    const p = point(station);
    const v = { edge: e, lane: 0, s: station - Math.hypot(e.sx - e.x0, e.sz - e.z0),
      axle: 1.4, dl: 0, dlv: 0, speed: 8, conn: null, trail: null };
    actor.locate(v);
    assert.ok(Math.abs(v.y - p.y) < 1e-4, 'tunnel actors use the bore profile, not the hill/ceiling');
    assert.ok(Math.abs(meshY(road, p) - p.y) < 1e-4, 'independent drawn floor triangles');
    assert.ok(Math.abs(sampler.sampleGround(p.x, p.z, { normal: {} }, p.y).height - p.y) < 1e-6);
    const roof = grade.roofAt(p.x, p.z, p.y + .3), drawn = meshY(ceiling, p, true);
    if (Number.isFinite(roof)) assert.ok(Math.abs(drawn - roof) < .021, `covered station ${station}: drawn/analytic roof agreement`);
    else assert.equal(drawn, undefined, `open station ${station}: Infinity means no ceiling mesh`);
    const origin = new THREE.Vector3(p.x, p.y + .05, p.z), up = new THREE.Vector3(0, 1, 0);
    const visible = new THREE.Raycaster(origin, up, 0, 8).intersectObjects(fixture().obstacles, false)[0]?.distance ?? null;
    const physical = sampler.raycastObstacle(origin, up, 8);
    assert.ok(visible === null ? physical === null : physical !== null && Math.abs(physical - visible) < EPS,
      `station ${station}: independent drawn/native first overhead obstacle ${visible}/${physical}`);
  }
  // The shallow DEM ramp is an open approach, not an invisible fixed-height roof.
  for (const station of [lo + 1, hi - 1]) {
    const p = point(station);
    assert.equal(grade.roofAt(p.x, p.z, p.y + 1), Infinity, `open mouth ${station}`);
    assert.equal(meshY(ceiling, p, true), undefined, `no drawn lid at open mouth ${station}`);
  }
});

test('Stockton terrain risers and skirts cannot close the drawn bore; disabled-clipping control reproduces the wall', () => {
  const { e, lo, hi, ridden, recordedStation, point, drawing, uncut } = fixture();
  const grade = (e.bore.y1 - e.bore.y0) / (e.bore.p1 - e.bore.p0);
  const forward = new THREE.Vector3(e.dx, grade, e.dz).normalize();
  const entrance = point(lo + 1);
  const control = terrainRay(uncut, new THREE.Vector3(entrance.x, entrance.y + 2, entrance.z), forward, 40);
  assert.ok(control[0]?.distance > 0 && control[0].distance < 40,
    `without cavity cuts the natural DEM rise blocks the entrance: ${control[0]?.distance}`);
  assert.equal(terrainRay(drawing, new THREE.Vector3(entrance.x, entrance.y + 2, entrance.z), forward, 40).length, 0,
    'same entrance ray is clear with the cavity cuts');
  for (const station of [lo + 2, lo + 8.013755961281757, recordedStation, (lo + hi) / 2, hi - 2]) {
    const p = point(station), sign = station === hi - 2 ? -1 : 1;
    const dir = forward.clone().multiplyScalar(sign), distance = sign > 0 ? hi - station : station - lo;
    for (const height of [1, 2, 3, 3.6]) {
      const hits = terrainRay(drawing, new THREE.Vector3(p.x, p.y + height, p.z), dir, distance);
      assert.equal(hits.length, 0, 'no terrain surface or LOD skirt inside the supported bore volume');
    }
  }
  for (const mesh of drawing.group.children.filter(m => m.name === 'TerrainTile')) {
    const normals = mesh.geometry.attributes.normal.array;
    assert.ok(normals.every(Number.isFinite), 'clipped/interpolated normals remain finite');
  }
});

test('Stockton cavity clipping preserves the actual hill surface and upper support above the ceiling', () => {
  const { lo, hi, point, terrain, grade, sampler, drawing, uncut } = fixture();
  const p = point((lo + hi) / 2), hill = terrain.heightAt(p.x, p.z);
  assert.ok(hill - p.y > 16, 'the real hill remains high above the bore');
  assert.ok(Math.abs(grade.roofAt(p.x, p.z, p.y + 1) - p.y - 5.2) < 1e-6, 'deep bore retains original 5.2 m clearance');
  assert.equal(grade.carveAt(p.x, p.z), null, 'deep hill is not flattened');
  const origin = new THREE.Vector3(p.x, hill + 10, p.z), down = new THREE.Vector3(0, -1, 0);
  const original = terrainRay(uncut, origin, down, 30)[0], clipped = terrainRay(drawing, origin, down, 30)[0];
  assert.ok(original && clipped);
  assert.ok(Math.abs(original.point.y - clipped.point.y) < 1e-6, 'drawing above the ceiling is unchanged');
  assert.ok(Math.abs(sampler.sampleGround(p.x, p.z, { normal: {} }, hill).height - clipped.point.y) < 1e-4,
    'upper hill support still matches its independent drawn triangle');
});

// All actual directional Bush/Stockton and Broadway/Levy centreline crossings, not one hand-picked
// successful ray. Every lane, centreline and roadway shoulder is sampled at one-metre stations.
function crossingCorridors(network) {
  const out = [];
  for (const upper of network.edges.filter(e => !e.bore && ['BUSH ST', 'BROADWAY'].includes(e.name))) {
    const name = upper.name === 'BUSH ST' ? 'STOCKTON TUNL' : 'ROBERT C LEVY TUNL';
    for (const lower of network.edges.filter(e => e.bore?.kind === 'tunnel' && e.name === name)) {
      const det = upper.dx * lower.dz - upper.dz * lower.dx;
      if (Math.abs(det) < 1e-8) continue;
      const dx = lower.x0 - upper.x0, dz = lower.z0 - upper.z0;
      const u = (dx * lower.dz - dz * lower.dx) / det;
      const t = (dx * upper.dz - dz * upper.dx) / det;
      if (u < 0 || u > upper.span || t < 0 || t > lower.span) continue;
      const arc = lower.bore.a0 + (lower.bore.a1 - lower.bore.a0) * t / lower.span;
      if (arc < lower.bore.p0 || arc > lower.bore.p1) continue;
      out.push({ upper, lower, u, x: upper.x0 + upper.dx * u, z: upper.z0 + upper.dz * u,
        offsets: [...new Set([0, ...upper.lanes, -upper.half + .5, upper.half - .5])] });
    }
  }
  return out;
}

test('Bush retains its entire measured upper street and shoulders above the corrected lower bore', t => {
  const w = fixture(), c = crossingCorridors(w.network).find(c => c.upper.name === 'BUSH ST');
  const road = w.grade.group.children.find(m => m.name === 'SFGradeSeparation_road');
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  const point = (s, o) => ({ x: c.x + c.upper.dx * s + c.upper.rx * o, z: c.z + c.upper.dz * s + c.upper.rz * o });
  const ray = (p, original) => {
    const origin = new THREE.Vector3(p.x, w.terrain.groundAt(p.x, p.z) + 8, p.z);
    const terrain = terrainRay(original ? w.uncut : w.drawing, origin, down, 20)[0]?.point.y ?? -Infinity;
    const deck = original ? -Infinity : new THREE.Raycaster(origin, down, 0, 20).intersectObject(road, false)[0]?.point.y ?? -Infinity;
    return Math.max(terrain, deck);
  };
  let nativeSamples = 0, maxStep = 0;
  for (const o of [-7, -3.4, 0, 3.4, 5, 5.5, 6, 6.5, 7, 7.49]) {
    let previous;
    for (let s = -20; s <= 20; s += .5) {
      const p = point(s, o), original = ray(p, true), drawn = ray(p, false);
      assert.ok(Number.isFinite(drawn) && Math.abs(drawn - original) < EPS,
        `s=${s}, o=${o}: final terrain ${drawn} versus original ${original}`);
      assert.ok(Math.abs(w.sampler.sampleGround(p.x, p.z, { normal: {} }, drawn).height - drawn) < EPS,
        `s=${s}, o=${o}: exact native/drawn upper facet`);
      nativeSamples++;
      if (previous !== undefined) {
        maxStep = Math.max(maxStep, Math.abs(drawn - previous));
      }
      previous = drawn;
      const lower = w.grade.floorAt(p.x, p.z, -10000);
      if (Number.isFinite(lower)) {
        assert.ok(Math.abs(w.sampler.sampleGround(p.x, p.z, { normal: {} }, lower).height - lower) < EPS,
          'upper terrain cannot capture a lower reference');
        const origin = new THREE.Vector3(p.x, lower + .1, p.z);
        const visible = new THREE.Raycaster(origin, up, 0, 8).intersectObjects(w.obstacles, false)[0]?.distance ?? null;
        const physical = w.sampler.raycastObstacle(origin, up, 8);
        assert.ok(visible === null ? physical === null : physical !== null && Math.abs(visible - physical) < EPS,
          `s=${s}, o=${o}: drawn/native underside ${visible}/${physical}`);
      }
    }
  }
  const centre = ray(point(0, 0), false);
  assert.ok(Math.abs(centre - 37.1) < .03, 'owner crossing crown remains its measured 37.1 m');
  for (const s of [-16, -12, -4, 0, 4, 12, 16]) for (const o of [5, 6.5, 7]) {
    for (const [ds, dO] of [[1e-4, 0], [0, 1e-4]]) {
      const a = point(s - ds, o - dO), b = point(s + ds, o + dO), ya = ray(a, false), yb = ray(b, false);
      assert.ok(Math.abs(ya - yb) < .001, `continuous original upper surface at ${s}/${o}`);
      for (const [p, q, py, qy] of [[a, b, ya, yb], [b, a, yb, ya]]) {
        const origin = new THREE.Vector3(p.x, py + .12, p.z), direction = new THREE.Vector3(q.x - p.x, qy - py, q.z - p.z);
        const length = direction.length(); direction.divideScalar(length);
        assert.equal(w.sampler.raycastObstacle(origin, direction, length), null, 'tunnel structures do not obstruct upper crossing in either direction');
      }
    }
  }
  assert.equal(w.N.ride.tops.filter(t => t.minReferenceY !== undefined).length, 0, 'no replacement upper membrane is needed');
  t.diagnostic(JSON.stringify({ nativeSamples, maxStep, centre,
    scope: '40 m through actual Bush/adjoining east edge; ten lateral corridors; 0.5 m samples, final terrain+deck and both native layers' }));
});

test('native Bush upper crossing remains rideable both ways on the centre and both shoulders', t => {
  const w = fixture(), c = crossingCorridors(w.network).find(c => c.upper.name === 'BUSH ST'), reports = [];
  for (const offset of [0, -7, 7]) for (const sign of [-1, 1]) {
    const start = { x: c.x - sign * c.upper.dx * 20 + c.upper.rx * offset, z: c.z - sign * c.upper.dz * 20 + c.upper.rz * offset };
    const report = driveNative(w, start, { x: c.upper.dx * sign, z: c.upper.dz * sign }, 40);
    assert.equal(report.crashed, false, JSON.stringify({ offset, sign, ...report }));
    assert.equal(report.complete, true, 'native upper street/shoulder crossing completed');
    reports.push({ offset, sign, ...report });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('Stockton anchors leave the DEM headwall on stable lower approaches; neither mouth has a carved half-metre lip', t => {
  const w = fixture(), old = fixture({ legacyPortals: true }), b = w.e.bore, before = old.e.bore;
  assert.ok(Math.abs(before.p0 - 93.80179002603668) < 1e-8 && Math.abs(before.y0 - 31.745761992670346) < 1e-8,
    'disabled-correction control reproduces the documented headwall anchor');
  for (const shift of [before.p0 - b.p0, b.p1 - before.p1]) assert.ok(shift >= 8 && shift <= 16, 'bounded outward survey');
  assert.ok(b.y0 < before.y0 - 2.5, 'south anchor is on the observed lower street');
  assert.ok(b.y1 < before.y1, 'north anchor clears the local headwall rise');
  const reports = [];
  for (const e of w.network.edges.filter(e => e.name === 'STOCKTON TUNL')) {
    const at = u => (u - e.bore.a0) / (e.bore.a1 - e.bore.a0) * e.span;
    for (const gate of [at(e.bore.p0), at(e.bore.p1)]) {
      const height = delta => {
        const s = gate + delta, x = e.x0 + e.dx * s + e.rx * e.lanes[0], z = e.z0 + e.dz * s + e.rz * e.lanes[0];
        const y = w.network.edgeY(e, s - Math.hypot(e.sx - e.x0, e.sz - e.z0), 0);
        return w.sampler.sampleGround(x, z, { normal: {} }, y).height;
      };
      const seam = gate === Math.min(at(e.bore.p0), at(e.bore.p1)) ? -.02 : .02;
      const join = Math.abs(height(seam + .001) - height(seam - .001));
      assert.ok(join < .04, `DEM cross-slope/interpolation at ${e.id}/${gate}: ${join}; no artificial 0.5 m apron step`);
      let maxGrade = 0;
      for (let d = -4; d < 4; d += .25) maxGrade = Math.max(maxGrade, Math.abs(height(d + .25) - height(d)) / .25);
      assert.ok(maxGrade < .18, `lower approach stays a road grade, not a blurred headwall: ${maxGrade}`);
      reports.push({ edge: e.id, gate, join, maxGrade });
    }
  }
  t.diagnostic(JSON.stringify({ p0: b.p0, p1: b.p1, y0: b.y0, y1: b.y1, reports }));
});

// Deep-copy every own graph property, resolving graph references and cycles deterministically. Only the reviewed
// Stockton vertical-profile fields are omitted; other roads' profiles and ALL connector data remain in the oracle.
function flowGraph(net) {
  const nodes = new Map(net.nodes.map(n => [n, n.id])), edges = new Map(net.edges.map(e => [e, e.id]));
  const copy = root => {
    const seen = new Map(), reviewed = edges.has(root) && root.name === 'STOCKTON TUNL';
    const visit = (v, path = '') => {
      if (v === null || typeof v !== 'object') return v;
      if (v !== root && nodes.has(v)) return { node: nodes.get(v) };
      if (v !== root && edges.has(v)) return { edge: edges.get(v) };
      if (seen.has(v)) return { ref: seen.get(v) };
      seen.set(v, seen.size);
      if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v, (x, i) => visit(x, `${path}/${i}`));
      return Object.fromEntries(Object.keys(v).sort().filter(k => !(reviewed &&
        (path === '' && ['prof', 'laneProf', 'len3'].includes(k) || path === '/bore' && ['p0', 'p1', 'y0', 'y1'].includes(k))))
        .map(k => [k, visit(v[k], `${path}/${k}`)]));
    };
    return visit(root);
  };
  const connectors = [];
  for (const e of net.edges) for (const m of e.moves) for (let i = 0; i < m.out.length; i++)
    if (m.out[i] >= 0) connectors.push([e.id, i, m.to.id, m.out[i], copy(net.connector(e, i, m.to, m.out[i]))]);
  return { nodes: Array.from(net.nodes, copy), edges: Array.from(net.edges, copy), connectors };
}

test('full flow graph, signals, lanes, turns, connectors and all other street profiles survive the height-only correction', t => {
  const w = fixture(), old = fixture({ legacyPortals: true });
  const before = flowGraph(old.network), after = flowGraph(w.network);
  const differences = [];
  const compare = (a, b, path = '') => {
    if (Object.is(a, b) || differences.length >= 12) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], `${path}/${key}`);
    } else differences.push({ path, current: a, original: b });
  };
  compare(after, before); if (differences.length) t.diagnostic(JSON.stringify({ differences }));
  assert.deepEqual(after, before, 'only reviewed tunnel height fields may differ');
  const changed = w.network.edges.filter((e, i) => JSON.stringify(Array.from(e.prof)) !== JSON.stringify(Array.from(old.network.edges[i].prof)));
  assert.deepEqual(Array.from(changed, e => e.id), [1214, 1215], 'only the two Stockton directions change height');
  t.diagnostic(JSON.stringify({ nodes: after.nodes.length, edges: after.edges.length, connectors: after.connectors.length,
    changedHeightEdges: changed.map(e => e.id), roadSHA256: w.roadHash, controlRoadSHA256: old.roadHash,
    flowSHA256: createHash('sha256').update(JSON.stringify(after)).digest('hex') }));
});

test('Bush/Stockton and Broadway: every sampled cross-street corridor keeps drawn upper support, independent lower support and clear upper rays', { timeout: 90000 }, t => {
  const w = fixture(), corridors = crossingCorridors(w.network), down = new THREE.Vector3(0, -1, 0);
  assert.ok(corridors.some(c => c.upper.name === 'BUSH ST' && Math.hypot(c.x + 447.704, c.z + 182.564) < 2), 'owner Bush crossing is included');
  assert.ok(corridors.some(c => c.upper.name === 'BROADWAY' && Math.hypot(c.x + 1444, c.z + 841) < 5), 'shallow Broadway crossing is included');
  const localDrawings = new Map(), failures = [], summary = [];
  let failureCount = 0;
  const record = (kind, corridor, p, actual, expected) => {
    failureCount++;
    if (failures.length < 12) failures.push({ kind, upper: corridor.upper.id, lower: corridor.lower.id,
      x: p.x, z: p.z, station: p.station, offset: p.offset, actual: actual ?? null, expected });
  };
  const road = w.grade.group.children.find(m => m.name === 'SFGradeSeparation_road');
  for (const c of corridors) {
    const originX = w.terrain.originX + Math.floor((c.x - w.terrain.originX - 96) / 64) * 64;
    const originZ = w.terrain.originZ + Math.floor((c.z - w.terrain.originZ - 96) / 64) * 64;
    const key = `${originX},${originZ}`;
    if (!localDrawings.has(key)) {
      const bounds = { originX, originZ, w: 129, h: 129 }, focus = { x: c.x, z: c.z, y: w.terrain.groundAt(c.x, c.z) };
      localDrawings.set(key, { original: w.buildDrawing([], focus, bounds, true), current: w.buildDrawing(w.grade.terrainCuts, focus, bounds) });
    }
    const drawings = localDrawings.get(key), beforeFailures = failureCount;
    const counts = { upper: c.upper.id, lower: c.lower.id, name: c.upper.name, offsets: c.offsets, samples: 0, lowerSamples: 0, rays: 0 };
    for (const offset of c.offsets) {
      let previous = null;
      for (let station = -20; station <= 20; station++) {
        const along = c.u + station;
        if (along < 0 || along > c.upper.span) continue; // no invented straight road past a graph endpoint
        const p = { station, offset, x: c.upper.x0 + c.upper.dx * along + c.upper.rx * offset,
          z: c.upper.z0 + c.upper.dz * along + c.upper.rz * offset };
        const hint = w.terrain.groundAt(p.x, p.z), origin = new THREE.Vector3(p.x, hint + 8, p.z);
        const original = terrainRay(drawings.original, origin, down, 20)[0]?.point.y;
        const terrainDrawn = terrainRay(drawings.current, origin, down, 20)[0]?.point.y;
        const roadDrawn = new THREE.Raycaster(origin, down, 0, 20).intersectObject(road, false)[0]?.point.y;
        const drawn = Math.max(terrainDrawn ?? -Infinity, roadDrawn ?? -Infinity);
        const native = w.sampler.sampleGround(p.x, p.z, { normal: {} }, drawn).height;
        counts.samples++;
        if (!Number.isFinite(original) || !Number.isFinite(drawn) || Math.abs(drawn - original) > EPS)
          record('upper surface differs from original measured terrain', c, p, drawn, original);
        if (!Number.isFinite(drawn) || Math.abs(native - drawn) > EPS)
          record('upper native support selected wrong layer', c, p, native, drawn);
        const lower = w.grade.floorAt(p.x, p.z, -10000);
        if (Number.isFinite(lower)) {
          counts.lowerSamples++;
          const lowerDrawn = meshY(road, { ...p, y: lower });
          const lowerNative = w.sampler.sampleGround(p.x, p.z, { normal: {} }, lower).height;
          if (!Number.isFinite(lowerDrawn) || Math.abs(lowerDrawn - lower) > EPS)
            record('lower drawn floor', c, p, lowerDrawn, lower);
          if (Math.abs(lowerNative - lowerDrawn) > EPS)
            record('lower native support', c, p, lowerNative, lowerDrawn);
          if (Number.isFinite(drawn) && drawn - lower <= 3.6)
            record('cross-street lacks independent upper/lower clearance', c, p, drawn - lower, '>3.6 m');
        }
        if (previous && Number.isFinite(drawn) && Number.isFinite(previous.y)) {
          for (const lift of [.12, .5, 1.7]) for (const reverse of [false, true]) {
            const a = reverse ? { ...p, y: drawn } : previous, b = reverse ? previous : { ...p, y: drawn };
            const from = new THREE.Vector3(a.x, a.y + lift, a.z), direction = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
            const length = direction.length(); direction.divideScalar(length); counts.rays++;
            const physical = w.sampler.raycastObstacle(from, direction, length);
            const visible = new THREE.Raycaster(from, direction, 0, length).intersectObjects(w.obstacles, false)[0]?.distance ?? null;
            if (physical !== null || visible !== null) record('upper street obstructed', c, p, { physical, visible, lift, reverse }, null);
          }
        }
        previous = { ...p, y: drawn };
      }
    }
    counts.failures = failureCount - beforeFailures; summary.push(counts);
  }
  t.diagnostic(JSON.stringify({ gradeSource: w.gradeHash, corridors: summary, failureCount, failures,
    scope: 'core terrain and registered grade bodies; road-centre/lane/shoulder corridors ±20 m, 1 m stations, both ray directions; curb meshes tested separately' }));
  assert.ok(summary.every(s => s.samples >= s.offsets.length * 5 && s.lowerSamples > 0 && s.rays > 0), 'each directional corridor has upper/lower/ray coverage');
  assert.equal(failureCount, 0, 'upper/lower crossing regression; inspect per-corridor diagnostics');
});

test.after(() => {
  for (const w of worlds.values()) {
    for (const drawing of w.drawings) {
      drawing.dispose?.();
      drawing.group.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
    }
    for (const mesh of w.grade.group.children) { mesh.geometry?.dispose(); mesh.material?.dispose(); }
  }
});
