// Focused CPU-only SF actor/native-controller integration. Actual local geometry, no GPU/browser or stress run.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { loadTraffic } = require('./helpers/traffic-harness.cjs');
const root = join(__dirname, '..');
const donorOptions = name => ({ skip: !existsSync(join(root, `../slop-sanfrancisco/js/${name}.js`)) && `optional SF donor ${name}.js is unavailable` });
let actors, native, controllerModule, actions, NYC, system, context;
const focus = { x: -330, y: 0, z: -560 };
const close = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const query = (source, x, z, r = 0) => { const out = []; source.dynamicBodiesNear(x, z, r, out); return out; };

test.before(async () => {
  const threeURL = pathToFileURL(join(root, 'vendor/three/build/three.webgpu.js')).href;
  const THREE = await import(threeURL);
  const utils = readFileSync(join(root, 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js'), 'utf8').replace("from 'three'", `from '${threeURL}'`);
  const Addons = await import(`data:text/javascript;base64,${Buffer.from(utils).toString('base64')}`);
  actors = { THREE, Addons };
  native = await import(pathToFileURL(join(root, 'js/euc-dynamic.js')).href);
  controllerModule = await import(pathToFileURL(join(root, 'js/euc/simulation/EucController.js')).href);
  actions = await import(pathToFileURL(join(root, 'js/euc/input/actions.js')).href);
  ({ NYC, system, context } = loadTraffic({ seed: 9127, actors }));
  system.update(0.05, 0.05, focus);
});

test('offscreen street actors and grounded walkers remain queryable by body extents; records and epoch are reused', () => {
  const { THREE } = actors;
  const v = system.cars.find(v => v.edge);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(v.x, v.y + 3, v.z - 20);
  camera.lookAt(v.x, v.y + 3, v.z - 100);
  camera.updateMatrixWorld();
  const screen = new THREE.Vector3(v.x, v.y + 1, v.z).project(camera);
  assert.ok(screen.z > 1, 'fixture actor is behind the viewing camera');
  const epoch = system.bodyVersion(), body = v.dynamicBody, parts = body.crashProfile, part = parts[0];
  const px = v.x, pz = v.z;
  system.update(0.05, 0.1, focus, null, 'euc', camera);
  assert.equal(system.bodyVersion(), epoch + 1);
  close(body.velocityX, (v.x - px) / 0.05); close(body.velocityZ, (v.z - pz) / 0.05);
  assert.equal(v.dynamicBody, body); assert.equal(body.crashProfile, parts); assert.equal(parts[0], part);
  const sy = Math.sin(body.headingY), cy = Math.cos(body.headingY);
  const x = body.x + sy * (body.halfLengthMetres - 0.001), z = body.z + cy * (body.halfLengthMetres - 0.001);
  assert.ok(Math.hypot(x - body.x, z - body.z) > 1, 'query is outside the tiny centre radius');
  assert.ok(query(system, x, z, 0.01).includes(body));
  assert.ok(body.maxY > body.minY && Math.abs(body.minY) > 1, 'absolute SF elevation');
  close(body.crashPitch, v.pitch - v.gradePitch); close(body.crashRoll, v.roll + v.gradeRoll);
  const walker = system.peds.find(p => p.placed && !p.node);
  const wb = query(system, walker.x, walker.z, 0.1).find(b => b === walker.dynamicBody);
  assert.ok(wb && wb.kind !== 'vehicle');
  close(wb.minY, NYC.Terrain.groundAt(walker.x, walker.z) + NYC.CURB_H);
  close(wb.maxY - wb.minY, walker.bodyScale * 1.75);
  assert.ok(Math.hypot(wb.velocityX, wb.velocityZ) > 0);
  for (const p of system.peds) if (p.placed && p.node) {
    const curb = p.t > 2 && p.t < p.len - 2 ? 0 : NYC.CURB_H;
    close(p.dynamicBody.minY, NYC.Terrain.groundAt(p.x, p.z) + curb);
  }
  const out = [body], oldEpoch = system.bodyVersion();
  system.dynamicBodiesNear(x, z, 1, out);
  assert.equal(out[0], body, 'append to caller-owned output');
  assert.equal(system.bodyVersion(), oldEpoch, 'querying a frozen epoch changes no actor state');
  assert.ok(system.bodyQueryStats.candidates < system.bodyQueryStats.bodies / 2, 'neighborhood, not all-city scan');
  assert.ok(system.bodyQueryStats.queryCells <= 4);
});

test('posed dimensions enclose actual car/van/bus geometry and native crash slices keep the same absolute transform', () => {
  const { THREE } = actors;
  for (const kind of ['taxi', 'sedan', 'suv', 'van', 'bus']) {
    const spec = kind === 'bus' ? NYC.BUS_SPEC : NYC.BODY_SPECS[kind];
    const geo = kind === 'bus' ? NYC.buildLoftedBusBodyGeometry() : NYC.buildCarGeometry(spec, true);
    const profile = NYC.sfVehicleShape(geo, spec), body = {};
    const heading = 0.71, pitch = -0.43, roll = 0.065, y = 83.4;
    NYC.writeSfVehicleBody(body, profile, 20, y, -30, heading, pitch, roll, 3, -4);
    const index = NYC.createSfDynamicBodyIndex(); index.begin(); index.add(body); index.commit();
    const world = native.createEucDynamicWorld(native.combineBodySources(index));
    world.didPlace({ body: { x: body.x, z: body.z } });
    const pieces = world.crashObstacleBodies({ x: body.x, z: body.z });
    const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, heading, roll, 'YXZ'));
    matrix.setPosition(20, y, -30);
    const p = geo.attributes.position, point = new THREE.Vector3();
    for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 300))) {
      point.fromBufferAttribute(p, i).applyMatrix4(matrix);
      assert.ok(contains(body, point), `${kind}: mounted envelope misses drawn point`);
      assert.ok(pieces.some(b => contains(b, point)), `${kind}: native crash profile lost mesh anchor / elevation`);
    }
    assert.ok(body.halfLengthMetres > (kind === 'bus' ? 5.7 : 2));
    assert.ok(body.halfWidthMetres > 0.86, 'SF shapes are wider than the inherited car solver');
    geo.dispose();
  }
});

function contains(b, p) {
  const dx = p.x - b.x, dz = p.z - b.z, c = Math.cos(b.headingY), s = Math.sin(b.headingY), e = 1e-5;
  return Math.abs(dx * c - dz * s) <= b.halfWidthMetres + e && Math.abs(dx * s + dz * c) <= b.halfLengthMetres + e
    && p.y >= b.minY - e && p.y <= b.maxY + e;
}

test('highway logical poses include culled cars, road dip/grade and world velocity; native zero-move contact crashes', () => {
  const { THREE } = actors;
  const lane = { pts: [new THREE.Vector3(5000, 40, 0), new THREE.Vector3(5000, 140, 1000)], speed: 9 };
  const highway = NYC.createHighwayTraffic(new THREE.Scene(), [lane]);
  const c = highway.cars.find(c => c.u > 100 && c.u < 800);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 0); camera.lookAt(0, 0, -100);
  const old = highway.bodyVersion(); highway.update(0.05, camera, null, 'euc');
  assert.equal(highway.bodyVersion(), old + 1);
  const b = c.dynamicBody;
  assert.ok(query(highway, b.x, b.z).includes(b), 'car > far-cull distance stays physical');
  close(c.y, 40 + c.z / 10); close(c.pitch, -Math.atan(100 / Math.hypot(100, 1000)));
  close(b.velocityX, 0); close(b.velocityZ, c.v * 1000 / Math.hypot(100, 1000));
  const world = native.createEucDynamicWorld(native.combineBodySources(highway));
  const ground = c.y, riderX = b.x, riderZ = b.z + b.halfLengthMetres - 0.05;
  const sampler = {
    sampleGround(x, z, out) { out.height = ground; Object.assign(out.normal, { x: 0, y: 1, z: 0 }); out.surface = 'pavement'; out.offCourse = false; return out; },
    raycast() { return null; }
  };
  const rider = new controllerModule.EucController(sampler, { spawn: { position: { x: riderX, y: ground, z: riderZ }, headingY: 0 }, dynamicWorld: world });
  rider.step(1 / 120, actions.NEUTRAL_ACTIONS);
  assert.ok(rider.crashed, 'a moving city car can hit a stationary native rider');
  assert.ok(world.stats.contacts > 0);
  const high = { x: riderX, z: riderZ, headingY: 0, halfWidthMetres: 0.35, halfLengthMetres: 0.5,
    minY: ground + 100, maxY: ground + 102, velocityX: 0, velocityZ: 0 };
  assert.equal(world.resolveMotion({ previous: high, proposed: high }), null, 'different elevation remains clear');
  assert.ok(highway.bodyQueryStats.candidates < highway.cars.length / 2);
});

test('long transit nose extents enter the bounded broadphase; absolute bridge Y, dwell/restart velocities and epochs', () => {
  const { THREE } = actors;
  const originalGeo = NYC.GEO, originalTerrain = NYC.Terrain, originalBlock = NYC.blockAt, originalGrade = NYC.GradeSeparation;
  NYC.GEO = { transit: ['streetcar', 'lightrail', 'cablecar'].map((kind, i) => ({ name: kind, kind, pts: [i * 100, 0, i * 100, 1000], stops: [500] })) };
  NYC.Terrain = { loaded: true, groundAt: (x, z) => 60 + z * 0.2 };
  NYC.blockAt = () => false;
  NYC.GradeSeparation = { floorAt: (x, z) => x >= 200 ? 100 + z * 0.2 : null };
  try {
    vm.runInContext(readFileSync(join(root, 'js/sf-transit.js'), 'utf8'), context);
    const transit = NYC.buildSFTransit(new THREE.Scene());
    const old = transit.bodyVersion(), positions = transit.vehicles.map(v => [v.x, v.z]);
    transit.update(0.05);
    assert.equal(transit.bodyVersion(), old + 1);
    transit.vehicles.forEach((v, i) => {
      const b = v.dynamicBody, expectedLen = { streetcar: 14.2, lightrail: 23, cablecar: 8.4 }[v.run.kind];
      close(v.K.len, expectedLen);
      assert.ok(b.halfLengthMetres >= expectedLen * 0.45);
      const z = b.z + b.halfLengthMetres - 0.001;
      assert.ok(query(transit, b.x, z, 0.01).includes(b), 'nose enters query with centre outside');
      close(v.y, (v.run.kind === 'cablecar' ? 100 : 60) + v.z * 0.2);
      close(b.velocityX, (v.x - positions[i][0]) / 0.05); close(b.velocityZ, (v.z - positions[i][1]) / 0.05);
      close(b.crashPitch, v.pitch);
    });
    const v = transit.vehicles[0], body = v.dynamicBody;
    v.dwell = 1; v.v = 0; transit.update(0.05);
    close(body.velocityX, 0); close(body.velocityZ, 0);
    v.dwell = 0; v.s = v.run.len - 0.01; v.nextStop = -1; v.v = v.K.v; transit.update(0.05);
    assert.ok(v.wrapped); assert.ok(Math.hypot(body.velocityX, body.velocityZ) <= v.K.v + 1e-6, 'no restart impulse');
    const frozen = transit.bodyVersion(), pos = v.s;
    query(transit, body.x, body.z, 6); query(transit, body.x, body.z, 6);
    assert.equal(transit.bodyVersion(), frozen); assert.equal(v.s, pos);
  } finally { NYC.GEO = originalGeo; NYC.Terrain = originalTerrain; NYC.blockAt = originalBlock; NYC.GradeSeparation = originalGrade; }
});

test('traffic never writes any player field or mesh; awareness reads actual hull and elevation, density invalidates immediately', () => {
  const v = system.cars.find(v => v.edge);
  const readonly = object => new Proxy(object, { set() { throw new Error('city wrote player state'); } });
  const entity = readonly({ position: readonly({ x: v.x, y: v.y, z: v.z }), heading: v.yaw, speed: 0,
    hull: { halfWidthMetres: 0.47, halfLengthMetres: 0.61, heightMetres: 2.03 }, mesh: { position: { copy() { throw new Error('city wrote player mesh'); } } } });
  const p = NYC.readSfPlayerBody(entity, {});
  close(p.halfW, 0.47); close(p.halfL, 0.61); close(p.minY, v.y); close(p.maxY, v.y + 2.03);
  const committed = NYC.readSfPlayerBody({ position: { x: -999, y: 0, z: -999 }, speed: 0,
    controller: { x: 12, y: 81, z: 34, headingY: Math.PI / 2, speed: 3, dynamicWorld: { hull: entity.hull } } }, {});
  close(committed.x, 12); close(committed.z, 34); close(committed.minY, 81); close(committed.vx, 3);
  system.update(0.05, 0.15, focus, entity);
  assert.equal(system.requestRideJunction, undefined); assert.equal(system.releaseRideJunction, undefined);
  const before = system.bodyVersion(); system.setDensity(0);
  assert.ok(system.bodyVersion() > before);
  assert.ok(query(system, v.x, v.z, 50).every(b => b.kind !== 'vehicle'));
  system.setDensity(1);
  const trafficSource = readFileSync(join(root, 'js/traffic.js'), 'utf8');
  assert.doesNotMatch(trafficSource, /collideWithPlayer|overlapWithPlayer|rideReservation|heldByRide|lastCollisionSpark|activeMode ===/);
});

test('SF navigation source matches the donor except the exact reviewed tunnel-height anchor repair', donorOptions('road-network'), () => {
  const source = readFileSync(join(root, 'js/road-network.js'), 'utf8');
  const donor = readFileSync(join(root, '../slop-sanfrancisco/js/road-network.js'), 'utf8');
  const sha = text => createHash('sha256').update(text).digest('hex');
  // dc2108c08a92841b40a787e1845923cc46af9b2f added ONLY this 22-line spans() block:
  // stable DEM approach anchors for shared traffic/drawn tunnel floors. Do not mask the
  // whole function: its original profile logic and all lane/junction/signal code remain donor-exact.
  const start = '  // A single-valued DEM blends a portal', end = "  return { kind: 'tunnel'";
  const verify = code => {
    assert.equal(code.split(start).length, 2, 'one reviewed portal repair');
    const a = code.indexOf(start), b = code.indexOf(end, a);
    assert.ok(b > a, 'bounded portal repair');
    assert.equal(sha(code.slice(a, b)), '0f1946f1d0e0b45df7fd1a58dd28b5caa0e150e89f15065508d118e6c32c6bec',
      'exact dc2108c height repair');
    assert.equal(code.slice(0, a) + code.slice(b), donor, 'all other navigation source remains donor-exact');
  };
  verify(source);
  assert.throws(() => verify(source.replace('Math.abs(after - before) <= .05', 'Math.abs(after - before) <= .06')), /exact dc2108c/);
  assert.throws(() => verify(source.replace('const LANE_W = 3.4;', 'const LANE_W = 3.5;')), /donor-exact/);
  assert.equal(system.cars.length, 60); assert.equal(system.buses.length, 6); assert.equal(system.peds.length, 340);
});

test('removing exclusive hero detail leaves every ordinary SF fleet geometry byte-identical', donorOptions('actor-models'), () => {
  const original = { THREE: actors.THREE, Addons: actors.Addons, TSL: NYC.TSL, cityUniforms: NYC.cityUniforms };
  vm.runInNewContext(readFileSync(join(root, '../slop-sanfrancisco/js/actor-models.js'), 'utf8'), { window: { NYC: original } });
  for (const kind of ['taxi', 'sedan', 'suv', 'van', 'bus']) {
    const make = n => kind === 'bus' ? n.buildLoftedBusBodyGeometry() : n.buildCarGeometry(n.BODY_SPECS[kind], true);
    const a = make(NYC), b = make(original);
    const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    for (const key of Object.keys(a.attributes)) assert.ok(bytes(a.attributes[key].array).equals(bytes(b.attributes[key].array)), `${kind}/${key}`);
    assert.ok(bytes(a.index.array).equals(bytes(b.index.array)), `${kind}/topology`);
    a.dispose(); b.dispose();
  }
  assert.equal(NYC.buildCarSidePatch, undefined);
  assert.doesNotMatch(readFileSync(join(root, 'js/actor-models.js'), 'utf8'), /spec\.hero|Waymo|waymo/);
});

test('matched seeded ordinary traffic retains lane/junction/walker decisions after the taxi-exclusive hooks are pruned', donorOptions('traffic'), () => {
  const reference = readFileSync(join(root, '../slop-sanfrancisco/js/traffic.js'), 'utf8');
  const baseline = loadTraffic({ seed: 621, trafficSource: reference }).system;
  const adapted = loadTraffic({ seed: 621 }).system;
  for (let i = 1; i <= 12; i++) {
    baseline.update(0.05, i * 0.05, focus);
    adapted.update(0.05, i * 0.05, focus);
  }
  const facts = s => ({
    vehicles: s.cars.concat(s.buses).map(v => [v.edge?.id, v.lane, v.s, v.speed, v.x, v.y, v.z, !!v.conn,
      v.move?.to.id, v.move?.turn, v.out, v.claimed, v.yielding, v.stopDone]),
    walkers: s.peds.map(p => [p.placed, p.x, p.z, p.t, p.dir, p.v, p.waiting]),
    nodes: s.network.nodes.map(n => [Array.from(n.box), Array.from(n.crossing)])
  });
  assert.equal(JSON.stringify(facts(adapted)), JSON.stringify(facts(baseline)));
});
