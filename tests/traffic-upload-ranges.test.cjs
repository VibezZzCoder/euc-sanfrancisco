// CPU-only constructor-pool regression for FPS-skipped draws. Real pinned Three BufferAttributes/versions,
// SF geometry, lanes and traffic updates; only native upload consumption is mocked. No renderer or frame hooks.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { loadTraffic } = require('./helpers/traffic-harness.cjs');

const root = join(__dirname, '..');
let actors;
test.before(async () => {
  const threeURL = pathToFileURL(join(root, 'vendor/three/build/three.webgpu.js')).href;
  const THREE = await import(threeURL);
  const utils = readFileSync(join(root, 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js'), 'utf8')
    .replace("from 'three'", `from '${threeURL}'`);
  const Addons = await import(`data:text/javascript;base64,${Buffer.from(utils).toString('base64')}`);
  actors = { THREE, Addons };
});

function poolAttributes(group) {
  const attributes = new Set();
  group.traverse(mesh => {
    if (mesh.instanceMatrix) attributes.add(mesh.instanceMatrix);
    for (const attr of Object.values(mesh.geometry?.attributes || {})) if (attr.isInstancedBufferAttribute) attributes.add(attr);
  });
  return [...attributes];
}

function bodyMeshes(group) {
  const meshes = [];
  group.traverse(mesh => { if (mesh.geometry?.attributes.paintColor) meshes.push(mesh); });
  return meshes;
}

// The draw/upload boundary consumes the pending ranges, copying their exact scalar components before clearing.
// Production must never infer consumption from an animation callback or from onAfterRender.
function consume(attr, gpu = new Float32Array(attr.array.length)) {
  for (const { start, count } of attr.updateRanges) gpu.set(attr.array.subarray(start, start + count), start);
  const version = attr.version;
  attr.clearUpdateRanges();
  assert.equal(attr.version, version, 'native consumption does not invent a CPU write version');
  return gpu;
}

function assertPrefix(attr, n) {
  assert.ok(attr.isBufferAttribute);
  assert.deepEqual(attr.updateRanges.map(range => ({ ...range })), [{ start: 0, count: n * attr.itemSize }]);
}

function cameraAt(target, fov = 3) {
  const camera = new actors.THREE.PerspectiveCamera(fov, 1, 0.1, 4000);
  camera.position.set(target.x + 12, target.y + 4, target.z - 18);
  camera.lookAt(target.x, target.y + 1, target.z);
  camera.updateMatrixWorld();
  return camera;
}

function watch(mesh) {
  const attrs = [mesh.instanceMatrix, mesh.geometry.attributes.paintColor, mesh.geometry.attributes.carState];
  const records = attrs.map(attr => ({ attr, usage: attr.usage, array: attr.array, upload: attr.onUploadCallback,
    gpu: consume(attr) }));
  // PBO ownership is renderer-side. A native backing texture, when present, must not be replaced/dirty-marked here.
  const pbo = new actors.THREE.Texture();
  attrs[1].pbo = pbo;
  return { attrs, records, pbo, pboVersion: pbo.version };
}

function checkOwnership(watched) {
  for (const { attr, usage, array, upload } of watched.records) {
    assert.equal(attr.usage, usage); assert.equal(attr.array, array); assert.equal(attr.onUploadCallback, upload);
  }
  assert.equal(watched.attrs[1].pbo, watched.pbo);
  assert.equal(watched.pbo.version, watched.pboVersion);
}

test('street constructor pools retain pending matrix/paint/state tails over shrinking visible prefixes, then start fresh after consumption', () => {
  const { system } = loadTraffic({ seed: 9127, actors, headless: false });
  const focus = { x: -330, y: 0, z: -560 };
  system.update(0, 0, focus);
  system.update(0, 0.01, focus);
  assert.equal(system.cars.length, 60); assert.equal(system.buses.length, 6); assert.equal(system.peds.length, 340);
  const meshes = bodyMeshes(system.group);
  const mesh = meshes.reduce((a, b) => a.count > b.count ? a : b);
  const wide = mesh.count;
  assert.ok(wide >= 4, 'the actual SF fleet supplies a multi-slot body pool');
  for (const attr of poolAttributes(system.group)) consume(attr);
  const watched = watch(mesh);
  const dirty = step => {
    for (const [i, car] of system.cars.entries()) {
      car.paint = [Math.fround(0.2 + step * 0.1), Math.fround(i / 100), 0.7];
      car.acc = step % 2 ? -2 : 0;
      car.pitch = step * 0.01;
    }
    mesh.geometry.attributes.carState.array[0] = 9; // make the native renderCar lamp write observable each update
  };
  dirty(1);
  const before = watched.attrs.map(attr => attr.version);
  system.update(0, 0.02, focus);
  watched.attrs.forEach((attr, i) => { assertPrefix(attr, wide); assert.equal(attr.version, before[i] + 1); });
  const meshIndex = meshes.indexOf(mesh), kind = ['taxi', 'sedan', 'suv', 'van'][Math.floor(meshIndex / 2)];
  const candidates = system.cars.filter(c => c.edge && c.bodyType === kind
    && (Math.hypot(c.x - focus.x, c.z - focus.z) < 90 ? 0 : 1) === meshIndex % 2);
  let narrowCamera, narrow;
  for (const car of candidates) {
    dirty(2);
    const camera = cameraAt(car);
    system.update(0, 0.03, focus, null, 'euc', camera);
    if (mesh.count > 0 && mesh.count < wide) { narrowCamera = camera; narrow = mesh.count; break; }
  }
  assert.ok(narrowCamera, 'native frustum culling shrinks this same populated pool without changing density');
  const tail = watched.attrs.map(attr => attr.array.slice());
  assert.notDeepEqual([...watched.records[1].gpu.slice(narrow * 3, wide * 3)], [...tail[1].slice(narrow * 3, wide * 3)],
    'the undisplayed paint tail contains genuinely pending writes');
  // Third skipped draw: smaller visible prefix changes again while the older wide tail is still pending.
  dirty(3);
  const versions = watched.attrs.map(attr => attr.version);
  system.update(0, 0.04, focus, null, 'euc', narrowCamera);
  assert.equal(mesh.count, narrow);
  watched.attrs.forEach((attr, i) => { assertPrefix(attr, wide); assert.equal(attr.version, versions[i] + 1); });
  const hidden = cameraAt({ x: 10000, y: 10, z: 10000 });
  const hiddenVersions = watched.attrs.map(attr => attr.version);
  system.update(0, 0.045, focus, null, 'euc', hidden);
  assert.equal(mesh.count, 0);
  watched.attrs.forEach((attr, i) => { assertPrefix(attr, wide); assert.equal(attr.version, hiddenVersions[i]); });
  for (const [i, record] of watched.records.entries()) {
    record.gpu = consume(record.attr, record.gpu);
    assert.deepEqual([...record.gpu.slice(narrow * record.attr.itemSize, wide * record.attr.itemSize)],
      [...tail[i].slice(narrow * record.attr.itemSize, wide * record.attr.itemSize)], 'pending tail really reaches the upload boundary');
  }
  dirty(4);
  system.update(0, 0.05, focus, null, 'euc', narrowCamera);
  watched.attrs.forEach(attr => assertPrefix(attr, narrow));
  checkOwnership(watched);
});

test('highway constructor pools union matrix/paint/state prefixes across LOD shrink, preserve offset tails, and reset only on native consumption', () => {
  const { NYC } = loadTraffic({ seed: 9127, actors });
  const { THREE } = actors;
  const lane = { pts: Array.from({ length: 121 }, (_, i) => new THREE.Vector3(0, 30 + i * 0.2, i * 10)), speed: 9 };
  const highway = NYC.createHighwayTraffic(new THREE.Scene(), [lane]);
  const camera = cameraAt({ x: 0, y: 30, z: 600 }, 55);
  highway.update(0, camera, null, 'euc');
  highway.update(0, camera, null, 'euc');
  const mesh = bodyMeshes(highway.group).reduce((a, b) => a.count > b.count ? a : b);
  const wide = mesh.count, population = highway.cars.length;
  assert.ok(wide >= 4);
  for (const attr of poolAttributes(highway.group)) consume(attr);
  const watched = watch(mesh);
  const dirty = step => {
    for (const [i, car] of highway.cars.entries()) car.col = [Math.fround(0.2 + step * 0.1), Math.fround(i / 100), 0.7];
    mesh.geometry.attributes.carState.array[0] = 9;
  };
  dirty(1);
  const before = watched.attrs.map(attr => attr.version);
  highway.update(0, camera, null, 'euc');
  watched.attrs.forEach((attr, i) => { assertPrefix(attr, wide); assert.equal(attr.version, before[i] + 1); });
  let narrowCamera, narrow;
  for (const z of [0, 200, 1000, 1200, 1500]) {
    const candidate = cameraAt({ x: 0, y: 30, z }, 55);
    dirty(2);
    highway.update(0, candidate, null, 'euc');
    if (mesh.count > 0 && mesh.count < wide) { narrowCamera = candidate; narrow = mesh.count; break; }
  }
  assert.ok(narrowCamera, 'camera/LOD changes shrink an actual highway pool');
  const tail = watched.attrs.map(attr => attr.array.slice());
  assert.notDeepEqual([...watched.records[1].gpu.slice(narrow * 3, wide * 3)], [...tail[1].slice(narrow * 3, wide * 3)]);
  dirty(3);
  const versions = watched.attrs.map(attr => attr.version);
  highway.update(0, narrowCamera, null, 'euc');
  assert.equal(mesh.count, narrow);
  watched.attrs.forEach((attr, i) => { assertPrefix(attr, wide); assert.equal(attr.version, versions[i] + 1); });
  for (const [i, record] of watched.records.entries()) {
    record.gpu = consume(record.attr, record.gpu);
    assert.deepEqual([...record.gpu.slice(narrow * record.attr.itemSize, wide * record.attr.itemSize)],
      [...tail[i].slice(narrow * record.attr.itemSize, wide * record.attr.itemSize)]);
  }
  // Three may leave an offset range as well as a prefix. The next dirty prefix must include its end, not its count.
  const attr = watched.attrs[0], offset = (wide - 1) * attr.itemSize;
  attr.addUpdateRange(offset, attr.itemSize);
  dirty(4); highway.update(0, narrowCamera, null, 'euc');
  assertPrefix(attr, wide);
  watched.attrs.forEach(a => consume(a));
  dirty(5); highway.update(0, narrowCamera, null, 'euc');
  watched.attrs.forEach(a => assertPrefix(a, narrow));
  assert.equal(highway.cars.length, population);
  checkOwnership(watched);
});
