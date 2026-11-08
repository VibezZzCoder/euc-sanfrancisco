import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { buildSfPursuitGraph, createSfFlightBrain } from '../js/sf-nemesis-brain.js';

const source = await readFile(new URL('../js/sf-nemesis.js', import.meta.url), 'utf8');
const url = path => new URL(path, import.meta.url).href;
const resolved = source.replace("from 'three/webgpu'", `from '${url('../vendor/three/build/three.webgpu.js')}'`)
  .replace("from 'three/tsl'", `from '${url('../vendor/three/build/three.tsl.js')}'`)
  .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${url('../js/' + path.slice(2))}'`);
const { createSfNemesis } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);

function fixture({ blocked = false, ray = () => null, network = { edges: [], edgeY: () => 0 }, ground = null, volume = null } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 2, 0); camera.lookAt(0, 2, 1); camera.updateMatrixWorld(true);
  const controller = { crashed: false, placementSerial: 0, hardKnock: () => true };
  const player = { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, controller };
  const sampler = {
    sampleGround(x, z, out, y) { Object.assign(out, { height: 0, offCourse: false, water: false }); ground?.(x, z, out, y); return out; },
    raycast: ray, raycastObstacle: () => null, isVolumeClear: body => !blocked && (!volume || volume(body)),
  };
  const cop = createSfNemesis({ scene, sampler, network, getPlayer: () => player, camera });
  return { cop, scene, camera, player, controller };
}

test('off-camera radial spawn works without road graph and lifecycle freezes', () => {
  const { cop, scene } = fixture();
  const rig = scene.getObjectByName('nemesis-hover-wheel');
  assert.ok(rig.getObjectByName('rider-paddle-mesh'));
  assert.equal(rig.visible, false);
  cop.ambushSoon();
  assert.equal(cop.update(0.05, false).phase, 'waiting');
  assert.equal(cop.update(0.05, true).phase, 'chasing');
  assert.equal(rig.visible, true); assert.equal(cop.audioView.sting, 1);
  assert.ok(rig.position.z < 0);
  const before = rig.position.clone(), chaseTime = cop.director.state.chaseTime;
  cop.update(0.05, false);
  assert.ok(before.equals(rig.position)); assert.equal(cop.director.state.chaseTime, chaseTime);
  cop.dispose(); cop.dispose(); assert.equal(scene.children.length, 0);
  assert.throws(() => cop.update(0.05, true), /disposed/);
});

test('failed spawn postpones without visible officer and retries later', () => {
  const { cop, scene } = fixture({ blocked: true });
  cop.ambushSoon();
  assert.equal(cop.update(0.05, true).phase, 'waiting');
  assert.equal(scene.getObjectByName('nemesis-hover-wheel').visible, false);
  assert.equal(cop.audioView.sting, 0);
  cop.dispose();
});

test('booking uses rotated heading, restores light and exposes capture until explicit release', () => {
  const { cop, scene } = fixture();
  cop.ambushSoon(); cop.update(0.05, true);
  cop.director.state.phase = 'captured';
  assert.equal(cop.update(0.05, true).captured, true);
  assert.equal(cop.beginBooking(2, 3, 4, Math.PI / 2), true);
  const rig = scene.getObjectByName('nemesis-hover-wheel');
  assert.equal(rig.rotation.y, Math.PI / 2);
  cop.presentBooking(0.05, { x: 1, y: 4, z: 4, age: 1, writing: true, light: { x: 3, y: 5, z: 4 } });
  cop.endBooking();
  assert.equal(rig.visible, false); assert.equal(cop.audioView.present, false);
  assert.equal(cop.director.state.phase, 'captured');
  assert.equal(cop.director.release(), true);
  assert.equal(cop.update(0.05, false).captured, false);
  cop.dispose();
});

test('spawn sight is remembered when the rider immediately passes behind a wall', () => {
  let blocked = false;
  const { cop, scene, player } = fixture({ ray: (origin, direction, distance) => blocked && distance > 10 ? 1 : null });
  cop.ambushSoon(); cop.update(0.05, true);
  assert.equal(cop.director.state.acquired, true);
  const rig = scene.getObjectByName('nemesis-hover-wheel'), before = rig.position.clone();
  blocked = true;
  player.position.x = 4;
  for (let i = 0; i < 20; i++) cop.update(0.05, true);
  assert.equal(cop.director.state.sees, false);
  assert.ok(rig.position.distanceTo(before) > 0.5, 'search moves toward the admitted last sighting');
  assert.ok(Math.abs(rig.position.x) < 0.1, 'hidden displacement is not tracked');
  cop.dispose();
});

test('warm-up exposes both meshes without advancing director, sound or gameplay', () => {
  const { cop, scene } = fixture();
  const rig = scene.getObjectByName('nemesis-hover-wheel'), shadow = scene.getObjectByName('nemesis-shadow');
  const wait = cop.director.state.wait;
  assert.equal(cop.beginWarmup(3, 0, 4, 1), true);
  assert.equal(rig.visible, true); assert.equal(shadow.visible, true);
  assert.equal(rig.rotation.y, 1); assert.equal(cop.audioView.present, false);
  cop.update(0.05, true); assert.equal(cop.director.state.wait, wait);
  assert.equal(cop.beginBooking(0, 0, 0), false);
  cop.endWarmup(); cop.endWarmup();
  assert.equal(rig.visible, false); assert.equal(shadow.visible, false);
  cop.dispose();
});

test('road candidate is attempted lazily without probing radial fallback', () => {
  const a = { x: 0, z: -40 }, b = { x: 0, z: -48 };
  const network = { edges: [{ from: a, to: b, sx: 0, sz: -40, dx: 0, dz: -1, len: 8 }], edgeY: () => 0 };
  assert.ok(buildSfPursuitGraph(network).nearby(0, 0, 100, 256, { minDistance: 35, referenceY: 0, maxHeight: 45 }).length);
  let samples = 0, rays = 0, volumes = 0;
  const samplePoints = [];
  const { cop } = fixture({ network, ground: (x, z) => { samples++; samplePoints.push([x, z]); }, ray: () => { rays++; return null; }, volume: () => { volumes++; return true; } });
  cop.ambushSoon(); assert.equal(cop.update(0.05, true).phase, 'chasing');
  assert.equal(samples, 13, `ground sample positions: ${JSON.stringify(samplePoints)}`);
  assert.equal(rays, 1); assert.equal(volumes, 2);
  cop.dispose();
});

test('spawn refuses an offscreen rig when its ground shadow is onscreen', () => {
  const a = { x: 0, z: -40 }, b = { x: 0, z: -48 };
  const network = { edges: [{ from: a, to: b, sx: 0, sz: -40, dx: 0, dz: -1, len: 8 }], edgeY: () => 0 };
  const { cop, camera, scene } = fixture({ network, ground: (x, z, out) => { if (z > -39 || Math.abs(x) > 1) out.offCourse = true; } });
  camera.fov = 12; camera.updateProjectionMatrix(); camera.position.set(0, 5, -10);
  camera.lookAt(0, 0, -40); camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
  assert.equal(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, 15, -40), 3.5)), false);
  assert.equal(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0, 0.03, -40), 2.3)), true);
  cop.ambushSoon(); assert.equal(cop.update(0.05, true).phase, 'waiting');
  assert.equal(scene.getObjectByName('nemesis-hover-wheel').visible, false);
  cop.dispose();
});

test('explicit seed gate does not inspect hidden observations or advance flight', () => {
  const brain = createSfFlightBrain({ supportAt: () => ({ height: 0 }), clearFlight: () => true });
  assert.equal(brain.place({ x: 0, y: 1, z: 0 }), true);
  const before = { ...brain.state }, inaccessible = new Proxy({}, { get() { throw new Error('hidden read'); } });
  assert.equal(brain.seedObservation(inaccessible, false), false);
  assert.equal(brain.seedObservation({ x: 10, y: 0, z: 0, heading: 0 }, true), true);
  assert.deepEqual(brain.state, before);
  brain.update(0.05, inaccessible, false);
  assert.equal(brain.lastSeen().x, 10);
});

test('in-view roofed departure continues laterally and never disappears at director timeout', () => {
  const { cop, scene, camera } = fixture({ volume: b => b.maxY <= 4 });
  cop.ambushSoon(); cop.update(0.05, true);
  const rig = scene.getObjectByName('nemesis-hover-wheel');
  assert.equal(rig.visible, true);
  camera.position.set(0, 2, rig.position.z + 20);
  camera.lookAt(rig.position.x, 2, rig.position.z); camera.updateMatrixWorld(true);
  cop.director.state.phase = 'leaving';
  const startZ = rig.position.z;
  for (let i = 0; i < 240; i++) {
    camera.lookAt(rig.position.x, rig.position.y + 1, rig.position.z);
    camera.updateMatrixWorld(true);
    cop.update(0.05, true);
    assert.equal(rig.visible, true, `vanished on frame ${i}`);
  }
  assert.ok(rig.position.z < startZ - 10, `lateral progress ${rig.position.z - startZ}`);
  assert.equal(cop.director.state.phase, 'leaving');
  camera.lookAt(0, 2, camera.position.z + 100); camera.updateMatrixWorld(true);
  for (let i = 0; i < 200 && rig.visible; i++) cop.update(0.05, true);
  assert.equal(rig.visible, false); assert.equal(cop.director.state.phase, 'waiting');
  cop.dispose();
});

test('sealed departure stays visible with bounded retries, then retires off-camera', () => {
  let sealed = false, checks = 0;
  const { cop, scene, camera } = fixture({ volume: () => { if (sealed) checks++; return !sealed; } });
  cop.ambushSoon(); cop.update(0.05, true);
  const rig = scene.getObjectByName('nemesis-hover-wheel');
  camera.position.set(0, 15, rig.position.z + 20); camera.lookAt(rig.position); camera.updateMatrixWorld(true);
  sealed = true; cop.director.state.phase = 'leaving';
  for (let i = 0; i < 240; i++) cop.update(0.05, true);
  assert.equal(rig.visible, true); assert.equal(cop.director.state.phase, 'leaving');
  assert.ok(checks < 1000, `unbounded volume checks: ${checks}`);
  camera.lookAt(0, 15, camera.position.z + 100); camera.updateMatrixWorld(true);
  for (let i = 0; i < 200 && rig.visible; i++) cop.update(0.05, true);
  assert.equal(rig.visible, false);
  cop.dispose();
});

test('hide retires a live pursuit without resetting a captured booking', () => {
  const { cop, scene } = fixture();
  cop.ambushSoon(); cop.update(0.05, true);
  assert.equal(cop.director.state.phase, 'chasing');
  cop.hide();
  assert.equal(cop.director.state.phase, 'waiting');
  assert.equal(scene.getObjectByName('nemesis-hover-wheel').visible, false);
  cop.dispose();
});

test('a real posed paddle can admit a stationary rider through hardKnock', () => {
  const { cop, controller } = fixture();
  let knocks = 0;
  controller.hardKnock = () => { knocks++; controller.crashed = true; return true; };
  cop.ambushSoon(); cop.update(0.05, true);
  for (let i = 0; i < 1200 && !knocks; i++) cop.update(0.05, true);
  assert.equal(knocks, 1);
  assert.equal(cop.director.state.knockdowns, 1);
  assert.equal(cop.audioView.hit, 1);
  cop.dispose();
});

test('refused hardKnock never creates warnings and a later admitted sweep can', () => {
  const { cop, controller } = fixture();
  let attempts = 0, admit = false;
  controller.hardKnock = () => { attempts++; if (admit) controller.crashed = true; return admit; };
  cop.ambushSoon(); cop.update(0.05, true);
  for (let i = 0; i < 500 && !attempts; i++) cop.update(0.05, true);
  assert.ok(attempts > 0); assert.equal(cop.director.state.knockdowns, 0); assert.equal(cop.audioView.hit, 0);
  admit = true;
  for (let i = 0; i < 500 && !cop.director.state.knockdowns; i++) cop.update(0.05, true);
  assert.equal(cop.director.state.knockdowns, 1); assert.equal(cop.audioView.hit, 1);
  cop.dispose();
});

test('four separately recovered posed hits reach captured state through the runtime', () => {
  const { cop, controller } = fixture();
  let knocks = 0;
  controller.hardKnock = () => { knocks++; controller.crashed = true; return true; };
  cop.ambushSoon(); cop.update(0.05, true);
  let result;
  for (let i = 0; i < 1800 && knocks < 4; i++) {
    result = cop.update(0.05, true);
    if (controller.crashed && knocks < 4) controller.crashed = false;
  }
  assert.equal(knocks, 4); assert.equal(result.captured, true);
  assert.equal(cop.director.state.knockdowns, 4); assert.equal(cop.audioView.hit, 4);
  cop.dispose();
});
