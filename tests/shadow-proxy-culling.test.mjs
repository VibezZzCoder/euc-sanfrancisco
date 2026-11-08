// CPU-only real pinned Three admission / geometry tests. No renderer, browser, GPU or changed shadow fitting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { gitHistory } from './helpers/optional-source.mjs';
import { drawing, release } from './helpers/terrain-hitch-fixture.mjs';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const history = gitHistory(root, '9028c5b');
const oldCulling = history.read('js/scene-culling.js'), oldTerrain = history.read('js/terrain-mesh.js');
const differential = { skip: !history.available && history.skip };
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const digest = a => createHash('sha256').update(bytes(a)).digest('hex');
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function load(code = read('js/scene-culling.js')) {
  const N = { THREE };
  new Function('window', code)({ NYC: N });
  return N;
}
function shadowCameras() {
  const cams = [new THREE.OrthographicCamera(), new THREE.OrthographicCamera()];
  return { cams, shadow: { getViewportCount: () => cams.length, getCamera: i => cams[i] } };
}
function cityFixture(code) {
  const N = load(code), scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
  group.position.set(111.137, 24.19, -87.315); group.rotation.y = .2;
  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const mass = new THREE.Mesh(new THREE.BoxGeometry(2200, 170, 45, 80, 50, 50), material);
  mass.position.set(800, 100, -300); mass.castShadow = true; group.add(mass);
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(24, 310, 16, 18, 18, 18), material, 12);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < instances.count; i++) {
    matrix.makeRotationY(i * .21).scale(v(1 + i * .03, .7 + i * .04, .6 + i * .02)).setPosition(-2200 + i * 450, 160, 850);
    instances.setMatrixAt(i, matrix);
  }
  instances.castShadow = true; group.add(instances);
  const ordinary = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); ordinary.castShadow = true; group.add(ordinary);
  const { cams, shadow } = shadowCameras();
  const stats = N.setupSceneCulling(scene, [group], shadow);
  scene.updateMatrixWorld(true);
  return { scene, group, mass, instances, ordinary, cams, stats, N, proxies: scene.children.filter(o => o.userData.shadowProxy) };
}
function terrainFixture(code = read('js/terrain-mesh.js')) {
  const w = 258, h = 258;
  const terrain = { w, h, cell: 2, originX: -10000.173, originZ: 6000.193, waterLevel: -1,
    heights: Float32Array.from({ length: w * h }, (_, k) => 80 + Math.sin(k % w * .03) * 70 + Math.floor(k / w) * .11) };
  const result = drawing(code, terrain, null);
  const scene = new THREE.Scene(); scene.add(result.mesh.group); scene.updateMatrixWorld(true);
  return { ...result, scene, proxies: result.mesh.group.children.filter(o => o.userData.shadowProxy) };
}
function disposeCity(f) {
  const geometry = new Set(), materials = new Set();
  f.scene.traverse(o => { if (o.geometry) geometry.add(o.geometry); if (o.material) materials.add(o.material); });
  for (const g of geometry) g.dispose(); for (const m of materials) m.dispose(); f.scene.clear();
}
function captureBox(mesh) {
  const box = new THREE.Box3();
  assert.equal(mesh.intersectsFrustum({ intersectsBox(value) { box.copy(value); return true; },
    intersectsObject() { assert.fail('ordinary box admission must not perform a redundant sphere test'); } }), true);
  return box;
}
function frustum(camera) {
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    camera.coordinateSystem, camera.reversedDepth);
}
function floatTransform(point, matrix) {
  const f = Math.fround, e = matrix.elements, [x, y, z] = point.toArray().map(f);
  return point.set(...[0, 1, 2].map(i => f(f(f(f(f(e[i]) * x) + f(f(e[i + 4]) * y)) + f(f(e[i + 8]) * z)) + f(e[i + 12]))));
}
function eachVertex(mesh, callback) {
  const position = mesh.geometry.attributes.position, matrix = new THREE.Matrix4(), point = new THREE.Vector3(), rounded = new THREE.Vector3();
  for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
    if (mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix);
    for (let j = 0; j < position.count; j++) {
      point.fromBufferAttribute(position, j); rounded.copy(point);
      if (mesh.isInstancedMesh) { point.applyMatrix4(matrix); floatTransform(rounded, matrix); }
      point.applyMatrix4(mesh.matrixWorld); floatTransform(rounded, mesh.matrixWorld);
      callback(point, rounded, j);
    }
  }
}
function signature(mesh, proxies) {
  return { name: mesh.name, cast: mesh.castShadow, receive: mesh.receiveShadow, visible: mesh.visible, culled: mesh.frustumCulled,
    layers: mesh.layers.mask, proxy: mesh.userData.shadowProxy, representative: proxies.indexOf(mesh.userData.sharesPipelineWith),
    side: mesh.material.side, shadowSide: mesh.material.shadowSide, count: mesh.count,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([k, a]) => [k, [a.itemSize, a.normalized, a.array.constructor.name, digest(a.array)]])),
    index: mesh.geometry.index ? [mesh.geometry.index.array.constructor.name, digest(mesh.geometry.index.array)] : null,
    matrix: mesh.isInstancedMesh ? digest(mesh.instanceMatrix.array) : null,
    sphere: mesh.geometry.boundingSphere, box: mesh.geometry.boundingBox, groups: mesh.geometry.groups, range: mesh.geometry.drawRange };
}

test('static city / terrain proxies retain exact geometry, layout, flags, compile sharing and teardown ownership', differential, () => {
  const before = cityFixture(oldCulling), after = cityFixture();
  const oldGround = terrainFixture(oldTerrain), ground = terrainFixture();
  let groundReleased = false;
  try {
    assert.deepEqual(after.stats, before.stats); assert.equal(after.stats.proxiedMeshes, 2);
    for (const [a, b] of [[before, after], [oldGround, ground]]) {
      assert.deepEqual(b.proxies.map(m => signature(m, b.proxies)), a.proxies.map(m => signature(m, a.proxies)));
      for (const mesh of b.proxies) assert.ok(Object.hasOwn(mesh, 'intersectsFrustum'));
    }
    assert.equal(after.ordinary.intersectsFrustum, THREE.Mesh.prototype.intersectsFrustum, 'ordinary scenery is untouched');
    for (const mesh of ground.mesh.group.children.filter(m => !m.userData.shadowProxy)) {
      assert.equal(mesh.intersectsFrustum, THREE.Mesh.prototype.intersectsFrustum, 'visible terrain is untouched');
    }
    let disposed = 0;
    const geometries = new Set(ground.proxies.map(m => m.geometry));
    for (const g of geometries) g.addEventListener('dispose', () => disposed++);
    release(ground); groundReleased = true;
    assert.equal(disposed, geometries.size, 'existing terminal scene walk owns all proxy geometry');
  } finally { disposeCity(before); disposeCity(after); release(oldGround); if (!groundReleased) release(ground); }
});

test('actual vertices and Float32 transforms fit world boxes after parent/object changes, at perspective and orthographic edges', () => {
  const city = cityFixture(), ground = terrainFixture(), parent = new THREE.Group(); city.scene.add(parent);
  const meshes = [city.proxies.find(m => !m.isInstancedMesh), city.proxies.find(m => m.isInstancedMesh), ground.proxies[0]];
  for (const mesh of meshes) parent.add(mesh);
  try {
    for (const state of [0, 1, 2]) {
      parent.position.set(state ? 10000.173 : 0, state * 41.213, state ? -6000.193 : 0);
      parent.rotation.set(state * .17, state * .61, state * -.13); parent.scale.set(1 + state * .7, 1 + state * .2, 1 / (1 + state));
      for (const mesh of meshes) { mesh.position.y = state * .123; mesh.rotation.y = state * -.31; }
      city.scene.updateMatrixWorld(true);
      for (const mesh of meshes) {
        const box = captureBox(mesh), samples = [];
        eachVertex(mesh, (point, rounded, j) => {
          assert.ok(box.containsPoint(point), 'all actual transformed vertices, not nominal cell bounds');
          assert.ok(box.containsPoint(rounded), 'margin contains independently rounded instancing/world operations');
          if (j % 4000 === 0 && samples.length < 5) samples.push(rounded.clone());
        });
        for (const point of samples) for (const coordinate of [THREE.WebGLCoordinateSystem, THREE.WebGPUCoordinateSystem]) for (const reversed of [false, true]) {
          for (const camera of [new THREE.PerspectiveCamera(.1, 1, .05, 20), new THREE.OrthographicCamera(-.002, .002, .002, -.002, .05, 20)]) {
            camera.coordinateSystem = coordinate; camera._reversedDepth = reversed;
            camera.position.copy(point).add(v(0, 0, 10)); camera.lookAt(point);
            const clip = frustum(camera); assert.ok(clip.containsPoint(point));
            assert.equal(mesh.intersectsFrustum(clip), true, 'visible Float32 silhouette is admitted by every pass');
          }
        }
      }
    }
    // A stale world-box cache would retain the last visible box after this direct matrix + parent change.
    const mesh = meshes[0], previous = captureBox(mesh), center = previous.getCenter(new THREE.Vector3());
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 20); camera.position.copy(center).add(v(0, 0, 10)); camera.lookAt(center);
    const clip = frustum(camera); assert.equal(mesh.intersectsFrustum(clip), true);
    mesh.matrixAutoUpdate = false; mesh.matrix.makeTranslation(1e6, 0, 0); parent.position.x += 1e6;
    city.scene.updateMatrixWorld(true); assert.equal(mesh.intersectsFrustum(clip), false);
  } finally { disposeCity(city); release(ground); }
});

test('box admission removes real sphere false positives; native default/fallback and ArrayFrustum behavior remain available', () => {
  const city = cityFixture();
  try {
    const mesh = city.proxies.find(m => m.isInstancedMesh), box = captureBox(mesh), center = box.getCenter(new THREE.Vector3());
    const sphere = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld), half = (box.max.z - box.min.z) / 2;
    assert.ok(sphere.radius > half + 10);
    const offset = half + (sphere.radius - half) * .4;
    const outside = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 4000);
    outside.position.set(center.x + 2000, center.y, center.z + offset); outside.lookAt(center.x, center.y, center.z + offset);
    const excluded = frustum(outside);
    assert.equal(THREE.Mesh.prototype.intersectsFrustum.call(mesh, excluded), true, 'negative control: sphere submits this caster');
    assert.equal(mesh.intersectsFrustum(excluded), false, 'box removes its draw/vertices');
    assert.equal(mesh.intersectsFrustum({ intersectsObject(object) { assert.equal(object, mesh); return true; } }), true,
      'unknown frustum protocol delegates to the native Mesh default');
    // FrustumArray is private in this pin. Execute its unmodified class rather than a hand-written union fixture.
    const text = read('vendor/three/build/three.core.js');
    const a = text.indexOf('const _projScreenMatrix$1 ='), b = text.indexOf('\nfunction ascIdSort', a);
    const FrustumArray = new Function('Frustum', 'Matrix4', 'WebGLCoordinateSystem', `${text.slice(a, b)};return FrustumArray;`)(
      THREE.Frustum, THREE.Matrix4, THREE.WebGLCoordinateSystem);
    const inside = new THREE.PerspectiveCamera(55, 1, .1, 4000); inside.position.copy(center).add(v(0, 0, 1000)); inside.lookAt(center); frustum(inside);
    const array = new FrustumArray();
    assert.equal(mesh.intersectsFrustum(array.setFromArrayCamera(new THREE.ArrayCamera([outside, inside]))), true);
    assert.equal(mesh.intersectsFrustum(array.setFromArrayCamera(new THREE.ArrayCamera([outside]))), false);
    assert.equal(mesh.intersectsFrustum(array.setFromArrayCamera(new THREE.ArrayCamera([]))), false);
  } finally { disposeCity(city); }
});

test('an offscreen upstream tower stays admitted to the actual unchanged SF shadow cascade and can occlude a visible receiver', () => {
  const N = load(), scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
  const view = new THREE.PerspectiveCamera(55, 16 / 9, .35, 60000); view.position.set(0, 3, 30); view.lookAt(0, 3, -40);
  const viewClip = frustum(view), receiver = v(0, 0, -40), direction = v(-.44, .58, -.68).normalize();
  const caster = receiver.clone().addScaledVector(direction, 900), remote = caster.clone().add(v(5000, 0, 0));
  const part = new THREE.BoxGeometry(8, 30, 8, 50, 50, 50), positions = [], indices = [];
  for (const point of [caster, remote]) {
    const offset = positions.length / 3, pos = part.attributes.position;
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i) + point.x, pos.getY(i) + point.y, pos.getZ(i) + point.z);
    for (const i of part.index.array) indices.push(offset + i);
  }
  part.dispose();
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  const source = new THREE.Mesh(geometry, new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })); source.castShadow = true; group.add(source);
  const addon = read('vendor/three/examples/jsm/lights/SunLightShadow.js')
    .replace(/import \{([^]*?)\} from 'three';/, 'const {$1} = THREE;').replace('export { SunLightShadow };', 'return SunLightShadow;');
  const SunLightShadow = new Function('THREE', addon)(THREE), shadow = new SunLightShadow();
  shadow.camera.near = .5; shadow.camera.far = 300;
  const light = new THREE.DirectionalLight(); light.position.copy(direction); light.updateMatrixWorld(true);
  // Install the actual SF wrapper from its current source, without editing or shortening it.
  const lighting = read('js/lighting.js'), a = lighting.indexOf('    const SHADOW_CEILING_M ='), b = lighting.indexOf('    this.scene.add(this.sunLight);', a);
  assert.ok(a > 0 && b > a);
  new Function(lighting.slice(a, b)).call({ sunLight: { shadow } });
  const stats = N.setupSceneCulling(scene, [group], shadow); assert.equal(stats.proxiedMeshes, 1);
  scene.updateMatrixWorld(true); shadow.updateMatrices(light, view);
  const proxies = scene.children.filter(m => m.userData.shadowProxy), tower = proxies.find(m => captureBox(m).containsPoint(caster));
  try {
    assert.ok(tower && !tower.intersectsFrustum(viewClip), 'tower upper section is fully outside the player view');
    const cascade = [0, 1].find(i => shadow.getFrustum(i).containsPoint(receiver) && tower.intersectsFrustum(shadow.getFrustum(i)));
    assert.notEqual(cascade, undefined, 'same native cascade contains the receiver and offscreen caster');
    const before = shadow.getMatrix(cascade).elements.slice();
    const ray = new THREE.Raycaster(receiver, direction, 0, 1000); ray.layers.enable(N.SHADOW_PROXY_LAYER);
    assert.ok(ray.intersectObject(tower).length > 0, 'actual caster triangles cross the receiver-to-sun ray');
    tower.intersectsFrustum(shadow.getFrustum(cascade)); assert.deepEqual(shadow.getMatrix(cascade).elements, before);
  } finally { disposeCity({ scene }); }
});

test('full moving instance pools stay out of BOTH static rebatching and proxy construction', () => {
  function run(dynamic) {
    const N = load(), scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    const material = new THREE.MeshStandardNodeMaterial(), pools = [.2, 20].map(size => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size, 9, 9, 9), material, 64);
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 150 - 4700, 50, 0));
      mesh.castShadow = true; mesh.userData.dynamicInstances = dynamic; root.add(mesh); return mesh;
    });
    const { shadow } = shadowCameras(), stats = N.setupSceneCulling(scene, [root], shadow);
    return { N, scene, root, pools, stats };
  }
  const kept = run(true), control = run(false);
  try {
    assert.equal(kept.stats.chunkedMeshes, 0); assert.equal(kept.stats.proxiedMeshes, 0); assert.equal(kept.stats.proxies, 0);
    assert.ok(control.stats.chunkedMeshes > 0 && control.stats.proxiedMeshes > 0, 'negative control qualifies for both static paths');
    for (const mesh of kept.pools) {
      assert.equal(mesh.count, mesh.instanceMatrix.count, 'a full pool is still dynamic'); assert.equal(mesh.parent, kept.root);
      assert.equal(mesh.castShadow, true); assert.equal(mesh.intersectsFrustum, THREE.Mesh.prototype.intersectsFrustum);
      mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(123, 456, 789)); mesh.instanceMatrix.needsUpdate = true;
      kept.N.updateSceneCulling(v(1e6, 0, 1e6)); assert.equal(mesh.visible, true);
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix); assert.deepEqual(matrix.elements.slice(12, 15), [123, 456, 789]);
    }
  } finally { disposeCity(kept); disposeCity(control); }
});
