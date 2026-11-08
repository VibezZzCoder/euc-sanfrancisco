// CPU-only global-pool / view-plus-shadow union trial. No browser, device or alternate simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import numericTSL from './helpers/rendering-tsl.cjs';

const root = new URL('../', import.meta.url), read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('js/trees.js'), history = gitHistory(root, '9028c5bfd8d2311660587ff5b2933b37577c986e');
const baseline = process.env.SF_TREE_BASELINE ? readFileSync(process.env.SF_TREE_BASELINE, 'utf8') : history.read('js/trees.js');
const early = gitHistory(root, '32039e3456255f67f9399565c5210c265203ca58').read('js/trees.js');
const hash = value => createHash('sha256').update(value).digest('hex');
if (baseline) assert.equal(hash(baseline), '7baace076d1a54435fd4cc28ce5472d41cf018dd95e9db29cb8fef9081427433');
if (early) assert.equal(hash(early), 'e7469a28e37ab4817495dcb6bc191c81f631c59805d724b17cbf671bd46b4fc4');
const differential = { skip: !baseline && 'pinned 9028c5b source unavailable; set SF_TREE_BASELINE to that exact trees.js' };
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength), vec = (x, y, z) => new THREE.Vector3(x, y, z), noop = () => {};
const pixels = new Uint8ClampedArray(1024 * 1024 * 4);
const document = { createElement: () => ({ getContext: () => ({ fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
  bezierCurveTo: noop, closePath: noop, arc: noop, fill: noop, stroke: noop, getImageData: () => ({ data: pixels }) }) }) };
const marker = 'return { group, material, atlas, update, meshes: instanced, stats };';
function field(code, sites, { terrain = { loaded: false }, hook = noop, lights = [], math = Math } = {}) {
  const N = { THREE, Terrain: terrain, createTreeMaterial: () => new THREE.MeshBasicMaterial() };
  new Function('window', read('js/sf-ride-geometry.js'))({ NYC: N });
  if (code === source) {
    assert.ok(code.includes(marker));
    code = code.replace(marker, `return { group, material, atlas, update, meshes: instanced, stats,
      inspect: () => ({ mats, data, lod, drawn, meshOf, spheres, dirty, cellSpheres, cellDrawCounts, cellList, frusta, frustumCount }) };`);
  }
  new Function('window', 'document', 'Math', code)({ NYC: N }, document, math);
  const scene = new THREE.Scene(); for (const light of lights) scene.add(light); scene.onBeforeRender = hook;
  const result = N.createTreeField(scene, sites); scene.add(result.group); scene.updateMatrixWorld(true);
  return { ...result, scene, bodies: N.ride };
}
function dispose(f) { for (const m of f.meshes) { m.dispose(); m.geometry.dispose(); } f.material.dispose(); f.atlas.texture.dispose(); f.scene.clear(); }
function fixture(n = 1200) { return Array.from({ length: n }, (_, i) => ({
  x: (i % 37 - 18) * 63.7 + (i * 17 % 43) / 10, z: (Math.floor(i / 37) - n / 74) * 62.3 + (i * 29 % 31) / 10,
  y: [-.3, .15, 8, 65, 350][i % 5], scale: .4 + i % 17 / 10, species: i % 6, tier: Math.floor(i / 7) % 3,
  yaw: i % 23 * .3, sx: .6 + i % 5 * .3, sz: .8 + i % 7 * .1 })); }
function updateCamera(camera) { camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); return camera; }
function camera(x = 0, y = 10, z = 0, heading = 0) {
  const c = new THREE.PerspectiveCamera(55, 16 / 9, .35, 60000); c.position.set(x, y, z);
  c.lookAt(x + Math.sin(heading) * 100, y, z - Math.cos(heading) * 100); return updateCamera(c);
}
function hook(f, c, renderer = {}) { f.scene.updateMatrixWorld(true); f.scene.onBeforeRender(renderer, f.scene, c, null); }
function records(mesh) {
  const out = [];
  if (mesh.visible) for (let i = 0; i < mesh.count; i++) {
    if (mesh.instanceMatrix.array[i * 16 + 15] === 0) continue;
    out.push(Buffer.concat([bytes(mesh.instanceMatrix.array.subarray(i * 16, i * 16 + 16)),
      bytes(mesh.geometry.attributes.aTreeData.array.subarray(i * 4, i * 4 + 4))]).toString('base64'));
  }
  return out;
}
function sameRaw(a, b, whole = false) {
  assert.equal(a.meshes.length, 30); assert.equal(b.meshes.length, 30);
  for (let i = 0; i < 30; i++) {
    const x = a.meshes[i], y = b.meshes[i]; assert.equal(x.name, y.name); assert.equal(x.instanceMatrix.count, y.instanceMatrix.count);
    assert.equal(x.castShadow, true); assert.equal(x.receiveShadow, true); assert.equal(x.frustumCulled, false);
    assert.deepEqual(records(x), records(y), x.name);
    if (whole) { assert.deepEqual(bytes(x.instanceMatrix.array), bytes(y.instanceMatrix.array));
      assert.deepEqual(bytes(x.geometry.attributes.aTreeData.array), bytes(y.geometry.attributes.aTreeData.array)); }
  }
}
function compare(a, b, position) { assert.equal(a.update(position), b.update(position)); sameRaw(a, b, true); }
function projection(c) { return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), c.coordinateSystem, c.reversedDepth); }

const shadowCode = read('vendor/three/examples/jsm/lights/SunLightShadow.js')
  .replace(/import \{([^]*?)\} from 'three';/, 'const {$1} = THREE;').replace('export { SunLightShadow };', 'return SunLightShadow;');
const SunLightShadow = new Function('THREE', shadowCode)(THREE);
const sunCode = read('vendor/three/examples/jsm/lights/SunLight.js').replace("import { Light, Object3D } from 'three';", 'const {Light,Object3D} = THREE;')
  .replace("import { SunLightShadow } from './SunLightShadow.js';", '').replace('export { SunLight };', 'return SunLight;');
const SunLight = new Function('THREE', 'SunLightShadow', sunCode)(THREE, SunLightShadow);
function sun() {
  const light = new SunLight(); light.castShadow = true; light.position.set(-.44, .58, -.68).normalize(); light.updateMatrixWorld(true);
  light.shadow.camera.near = .5; light.shadow.camera.far = 300;
  const code = read('js/lighting.js'), a = code.indexOf('    const SHADOW_CEILING_M ='), b = code.indexOf('    this.scene.add(this.sunLight);', a);
  assert.ok(a > 0 && b > a); new Function(code.slice(a, b)).call({ sunLight: light }); return light;
}
function controlledSun(points) {
  const light = sun(), clips = points.map(p => {
    const c = new THREE.OrthographicCamera(-80, 80, 80, -80, .1, 2000); c.position.copy(p).add(vec(0, 1000, 0)); c.up.set(0, 0, -1); c.lookAt(p);
    return projection(updateCamera(c));
  });
  const state = { updates: 0, clips };
  light.shadow.updateMatrices = () => { state.updates++; };
  light.shadow.getFrustum = i => state.clips[i]; light.testState = state; return light;
}
function expectedUnion(f, raw) {
  const u = f.inspect(), expected = Array.from({ length: 30 }, () => []), sphere = new THREE.Sphere();
  for (let i = 0; i < u.lod.length; i++) {
    const l = u.lod[i]; if (l === 255) continue;
    sphere.center.fromArray(u.spheres, i * 4); sphere.radius = u.spheres[i * 4 + 3];
    let keep = false; for (let j = 0; j < u.frustumCount; j++) if (u.frusta[j].intersectsSphere(sphere)) keep = true;
    if (keep) expected[u.meshOf[i * 3 + l]].push(Buffer.concat([bytes(u.mats.subarray(i * 16, i * 16 + 16)), bytes(u.data.subarray(i * 4, i * 4 + 4))]).toString('base64'));
  }
  // The independent raw oracle also proves that the union never changes per-tree LOD selection.
  const rawIds = new Map();
  for (let mi = 0; mi < 30; mi++) for (const r of records(raw.meshes[mi])) rawIds.set(r, mi);
  for (let mi = 0; mi < 30; mi++) for (const r of expected[mi]) assert.equal(rawIds.get(r), mi);
  for (let mi = 0; mi < 30; mi++) assert.deepEqual(records(f.meshes[mi]), expected[mi], 'native flat-sphere union matches hierarchical ordered publication');
  return expected;
}

test('geometry/atlas and native trunk construction remain exact against the pinned pre-union source', differential, () => {
  const construction = code => code.slice(code.indexOf('const { THREE }'), code.indexOf('// 5. TREE FIELD'));
  assert.equal(construction(source), construction(baseline));
  const sites = fixture(), a = field(source, sites), b = field(baseline, sites);
  try {
    assert.deepEqual(a.stats, b.stats); assert.equal(hash(JSON.stringify(a.bodies)), hash(JSON.stringify(b.bodies)));
    for (let mi = 0; mi < 30; mi++) {
      const x = a.meshes[mi], y = b.meshes[mi];
      for (const name of Object.keys(x.geometry.attributes)) assert.deepEqual(bytes(x.geometry.attributes[name].array), bytes(y.geometry.attributes[name].array));
      assert.deepEqual(bytes(x.geometry.index.array), bytes(y.geometry.index.array));
      assert.equal(x.material, a.material); assert.equal(x.userData.sharesPipelineWith, undefined);
    }
    for (let i = 0; i < 100; i++) compare(a, b, vec(Math.sin(i * .4) * 1500, [3, 39, 40, 44, 100, 700][i % 6], -2500 + i * 65));
    for (const f of [a, b]) for (const m of f.meshes) m.instanceMatrix = new THREE.StorageInstancedBufferAttribute(m.instanceMatrix.array, 16);
    for (let i = 0; i < 40; i++) compare(a, b, vec(700 - i * 40, i % 2 ? 12 : 120, -200 + i * 32));
    assert.equal(hash(JSON.stringify(a.bodies)), hash(JSON.stringify(b.bodies)));
  } finally { dispose(a); dispose(b); }
});

const floatBits = new DataView(new ArrayBuffer(8));
function adjacent(x, direction) { floatBits.setFloat64(0, x); floatBits.setBigUint64(0, floatBits.getBigUint64(0) + BigInt(direction)); return floatBits.getFloat64(0); }
test('raw selection keeps original exact LOD/hysteresis edges, terrain gates and low/aloft policies', differential, () => {
  for (const tier of [0, 1, 2]) {
    const seed = Math.sin(1.3 * 311.7) * 43758.5453, scale = 1 / (.9 + (seed - Math.floor(seed)) * .2);
    const sites = [{ x: 0, y: 0, z: 0, scale, species: tier + 3, tier }], a = field(source, sites), b = field(baseline, sites);
    try {
      for (const y of [6, 40]) for (const edge of [105, 420, y < 40 ? [1150, 1150, 950][tier] : [3000, 1600, 950][tier]]) {
        for (const delta of [-6, 0, 6]) for (const distance of [adjacent(edge + delta, -1), edge + delta, adjacent(edge + delta, 1)]) {
          const x = Math.sqrt(distance * distance - (y - 6) ** 2);
          for (const start of [0, edge - 20, edge + 20, 5000]) { compare(a, b, vec(-start, y, 0)); compare(a, b, vec(x, y, 0)); }
        }
      }
    } finally { dispose(a); dispose(b); }
  }
  const terrain = { loaded: true, groundAt: () => 150 }, a = field(source, fixture(60), { terrain }), b = field(baseline, fixture(60), { terrain });
  try {
    for (const x of [0, 9.999999, 10, 19, 20]) compare(a, b, vec(x, 200, 0));
    terrain.groundAt = () => 0; for (const x of [59.999999, 60]) compare(a, b, vec(x, 200, 0));
    terrain.loaded = false; for (const x of [99.999999, 100]) compare(a, b, vec(x, 200, 0));
  } finally { dispose(a); dispose(b); }
});

test('view union includes every active sun cascade, retains offscreen casters, and Low→High restores them without movement', differential, () => {
  const sites = [{ x: 0, z: -200 }, { x: 0, z: 200 }, { x: 500, z: 0 }, { x: -500, z: 0 }]
    .map((p, i) => ({ ...p, y: 0, scale: 1, species: i, tier: 0 }));
  const light = controlledSun([vec(0, 10, 200), vec(500, 10, 0)]), other = controlledSun([vec(-500, 10, 0), vec(-500, 10, 0)]);
  other.shadow.intensity = 0;
  const a = field(source, sites, { lights: [light, other] }), b = field(baseline, sites), c = camera();
  try {
    b.update(c.position); hook(a, c); const union = expectedUnion(a, b); assert.equal(union.flat().length, 3);
    assert.equal(light.testState.updates, 1); assert.equal(other.testState.updates, 0);
    other.shadow.intensity = 1; hook(a, c); assert.equal(expectedUnion(a, b).flat().length, 4, 'ALL active suns participate');
    light.shadow.intensity = other.shadow.intensity = 0; light.shadow.autoUpdate = light.shadow.needsUpdate = false;
    const updates = light.testState.updates; hook(a, c); assert.equal(expectedUnion(a, b).flat().length, 1, 'inactive Low shadows do not enlarge union');
    assert.equal(light.testState.updates, updates);
    light.shadow.intensity = 1; light.shadow.autoUpdate = true; hook(a, c); assert.equal(expectedUnion(a, b).flat().length, 3);
    a.update(c.position); sameRaw(a, b); // standalone raw API must restore offscreen selected trees even under its movement gate
  } finally { dispose(a); dispose(b); }
});

test('real SF fitting is called before publication and later recomputes bit-identically; shadow passes never mutate buffers', differential, () => {
  const light = sun(), calls = [], a = field(source, fixture(), { lights: [light], hook: function (...args) { calls.push([this, args]); } }), b = field(baseline, fixture());
  try {
    for (const c of [camera(0, 15, 0), camera(120, 60, 20, 1.1), camera(-100, 80, 300, -.7)]) {
      b.update(c.position); hook(a, c); expectedUnion(a, b);
      const transforms = a.meshes.map(m => [m.instanceMatrix.version, m.geometry.attributes.aTreeData.version, hash(bytes(m.instanceMatrix.array))]);
      const matrices = [0, 1].map(i => light.shadow.getMatrix(i).elements.slice()); light.shadow.updateMatrices(light, c);
      for (let i = 0; i < 2; i++) assert.deepEqual(light.shadow.getMatrix(i).elements, matrices[i], 'existing SF ceiling extension is unchanged');
      for (let i = 0; i < 2; i++) a.scene.onBeforeRender({}, a.scene, light.shadow.getCamera(i), null);
      assert.deepEqual(a.meshes.map(m => [m.instanceMatrix.version, m.geometry.attributes.aTreeData.version, hash(bytes(m.instanceMatrix.array))]), transforms);
    }
    assert.equal(calls[0][0], a.scene); assert.equal(calls[0][1][1], a.scene);
  } finally { dispose(a); dispose(b); }
});

test('a real SF uphill offscreen tree remains an opaque caster for a visible receiver', differential, () => {
  const light = sun(), direction = light.position.clone(), receiver = vec(0, 0, -40), point = receiver.clone().addScaledVector(direction, 600);
  const sites = [{ x: point.x, y: point.y - 1, z: point.z, scale: 1, species: 0, tier: 0 }];
  const a = field(source, sites, { lights: [light] }), b = field(baseline, sites), c = camera();
  try {
    b.update(c.position); hook(a, c); expectedUnion(a, b);
    const u = a.inspect(), sphere = new THREE.Sphere(new THREE.Vector3().fromArray(u.spheres, 0), u.spheres[3]);
    assert.equal(projection(c).intersectsSphere(sphere), false, 'the entire canopy is outside the player view');
    assert.ok([0, 1].some(i => light.shadow.getFrustum(i).containsPoint(receiver) && light.shadow.getFrustum(i).intersectsSphere(sphere)));
    const mesh = a.meshes[u.meshOf[2]], ray = new THREE.Raycaster(receiver, direction, 0, 1000);
    assert.ok(ray.intersectObject(mesh).some(hit => mesh.geometry.attributes.aTree.getX(hit.face.a) === 0),
      'actual opaque bark triangles intercept the receiver-to-sun ray');
    assert.equal(records(mesh).length, 1);
  } finally { dispose(a); dispose(b); }
});

test('whole-cell inside/outside decisions avoid per-tree tests; boundary cells match independent sphere admission', differential, () => {
  const sites = Array.from({ length: 600 }, (_, i) => ({ x: i % 30 * .6, y: 0, z: -600 + Math.floor(i / 30) * .2,
    scale: 1, species: i % 6, tier: 0 }));
  const a = field(source, sites), b = field(baseline, sites), c = camera();
  try {
    hook(a, c); b.update(c.position); expectedUnion(a, b);
    const u = a.inspect(); assert.equal(u.cellList.length, 1);
    let reads = 0;
    for (const p of u.frusta[0].planes) {
      const normal = p.normal; Object.defineProperty(p, 'normal', { get() { reads++; return normal; } });
    }
    reads = 0; hook(a, c); assert.ok(reads < 200, 'inside cell needs only fixed plane work');
    c.lookAt(0, 10, 100); updateCamera(c); reads = 0; hook(a, c);
    assert.ok(reads < 200, 'outside cell does not run 600 detailed sphere tests');
    assert.ok(a.meshes.every(m => !m.visible));
    c.lookAt(0, 10, -100); c.fov = 1; c.aspect = .5; updateCamera(c); reads = 0; hook(a, c);
    assert.ok(reads > 200, 'boundary cell deliberately falls back to detailed tests'); expectedUnion(a, b);
  } finally { dispose(a); dispose(b); }
});

test('turns, resize, storage replacement and stable membership preserve exact ordered streams and pending uploads', differential, () => {
  const a = field(source, fixture()), b = field(baseline, fixture()), c = camera(0, 15, 0);
  try {
    b.update(c.position); hook(a, c); expectedUnion(a, b);
    for (const m of a.meshes) m.instanceMatrix = new THREE.StorageInstancedBufferAttribute(m.instanceMatrix.array, 16);
    const versions = () => a.meshes.map(m => [m.instanceMatrix.version, m.geometry.attributes.aTreeData.version]);
    const first = versions(); for (let i = 0; i < 10; i++) hook(a, c); assert.deepEqual(versions(), first, 'no repack/upload when ordered stream is unchanged');
    for (const [heading, aspect] of [[Math.PI, 16 / 9], [1.2, .6], [-1, 2]]) {
      c.lookAt(c.position.x + Math.sin(heading) * 100, c.position.y, c.position.z - Math.cos(heading) * 100); c.aspect = aspect; updateCamera(c);
      const pending = a.meshes.map(m => Math.max(0, ...m.instanceMatrix.updateRanges.map(r => r.start + r.count)));
      hook(a, c); expectedUnion(a, b);
      for (let i = 0; i < 30; i++) assert.ok(Math.max(0, ...a.meshes[i].instanceMatrix.updateRanges.map(r => r.start + r.count)) >= pending[i]);
    }
    assert.ok(versions().some((v, i) => v[0] > first[i][0]), 'the replacement storage attribute receives current transforms');
  } finally { dispose(a); dispose(b); }
});

test('unsupported active shadows, coordinate/projection degeneracy and transformed pools fall back to raw selected LOD', differential, () => {
  const light = sun(), unknown = new THREE.PointLight(0xffffff, 1); unknown.castShadow = false;
  const a = field(source, fixture(), { lights: [light, unknown] }), b = field(baseline, fixture()), c = camera();
  try {
    b.update(c.position); hook(a, c); expectedUnion(a, b);
    unknown.castShadow = true; hook(a, c); sameRaw(a, b); unknown.castShadow = false;
    const buffers = a.meshes.map(m => [m.instanceMatrix.version, m.geometry.attributes.aTreeData.version, hash(bytes(m.instanceMatrix.array))]);
    a.scene.overrideMaterial = { isShadowPassMaterial: true };
    hook(a, camera(30000, 100, 30000)); a.scene.overrideMaterial = null;
    assert.deepEqual(a.meshes.map(m => [m.instanceMatrix.version, m.geometry.attributes.aTreeData.version, hash(bytes(m.instanceMatrix.array))]), buffers,
      'an unsupported perspective shadow pass cannot reselect LOD or replace the common GPU stream');
    light.shadow.autoUpdate = light.shadow.needsUpdate = false; hook(a, c); sameRaw(a, b); light.shadow.autoUpdate = true;
    const fit = light.shadow.updateMatrices;
    light.shadow.updateMatrices = function (l, view) { fit.call(this, l, view); this.getFrustum(0).planes[0].constant = NaN; };
    hook(a, c); sameRaw(a, b); light.shadow.updateMatrices = fit;
    const getFrustum = light.shadow.getFrustum;
    light.shadow.getFrustum = () => ({ planes: Array(6).fill(null) }); hook(a, c); sameRaw(a, b);
    light.shadow.getFrustum = () => { throw new Error('unsupported shadow fixture'); }; hook(a, c); sameRaw(a, b);
    light.shadow.getFrustum = getFrustum;
    light.shadow.camera.coordinateSystem = THREE.WebGPUCoordinateSystem; hook(a, c); sameRaw(a, b); light.shadow.camera.coordinateSystem = c.coordinateSystem;
    const direction = light.position.clone(); light.position.set(0, 0, 0); hook(a, c); sameRaw(a, b); light.position.copy(direction);
    c.projectionMatrix.elements.fill(0); hook(a, c); sameRaw(a, b); updateCamera(c);
    a.group.position.x = 100; hook(a, c); sameRaw(a, b); a.group.position.x = 0;
    hook(a, c); expectedUnion(a, b);
  } finally { dispose(a); dispose(b); }
});

test('thirty original pipelines warm completely; compilation/hidden hooks hold representatives until the first real view', differential, () => {
  const a = field(source, [{ x: 20000, y: 0, z: 20000, scale: 1, species: 3 }]), c = camera();
  try {
    assert.equal(a.meshes.length, 30); assert.ok(a.meshes.every(m => m.visible && m.count === 1 && m.instanceMatrix.array[15] === 0));
    hook(a, c, { _precompilationState: {} }); assert.ok(a.meshes.every(m => m.visible && m.count === 1));
    a.scene.visible = false; hook(a, c); a.scene.visible = true; assert.ok(a.meshes.every(m => m.visible));
    hook(a, c); assert.ok(a.meshes.every(m => !m.visible && m.count === 0));
  } finally { dispose(a); }
});

function windEvaluator() {
  const text = read('js/tsl-materials.js'), begin = text.indexOf('  mat.positionNode = Fn(', text.indexOf('function createTreeMaterial(')), end = text.indexOf('\n  // Coverage:', begin);
  const { tsl, state } = numericTSL(), Node = tsl.float(0).constructor;
  Object.defineProperty(Node.prototype, 'xz', { get() { return new Node(() => { const p = this.eval(); return [p[0], p[2]]; }); } });
  const env = { ...tsl, dot: (a, b) => new Node(() => [a.eval().reduce((n, x, i) => n + x * b.eval()[i], 0)]),
    positionLocal: tsl.attribute('posed'), positionGeometry: tsl.attribute('position'), normalLocal: tsl.attribute('posedNormal'), time: tsl.attribute('time') };
  const graph = new Function(...Object.keys(env), `${text.match(/const TREE_WIND = [^\n]+/)[0]}
    const mat={},aTree=attribute('aTree'),isLeaf=aTree.x,rnd=fract(attribute('aTreeData').w);${text.slice(begin, end)};return mat.positionNode;`)(...Object.values(env));
  return (geometry, index, matrix, data, time) => {
    const p = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
    const n = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, index).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
    state.attrs = { position: p.toArray(), posed: p.applyMatrix4(matrix).toArray(), posedNormal: n.toArray(), aTreeData: data, time: [time],
      aTree: Array.from(geometry.attributes.aTree.array.subarray(index * 4, index * 4 + 4)) }; state.stage = 'vertex'; state.epoch++;
    return new THREE.Vector3().fromArray(graph.eval());
  };
}
test('compact common spheres enclose transformed full geometry AND actual shader wind for all LODs', () => {
  const sites = fixture(24), f = field(source, sites), wind = windEvaluator(), matrix = new THREE.Matrix4(), point = new THREE.Vector3(), sphere = new THREE.Sphere();
  try {
    const u = f.inspect(); let windSamples = 0;
    for (let i = 0; i < sites.length; i++) {
      sphere.center.fromArray(u.spheres, i * 4); sphere.radius = u.spheres[i * 4 + 3]; matrix.fromArray(u.mats, i * 16);
      for (let l = 0; l < 3; l++) {
        const geometry = f.meshes[u.meshOf[i * 3 + l]].geometry;
        for (let j = 0; j < geometry.attributes.position.count; j++) {
          point.fromBufferAttribute(geometry.attributes.position, j).applyMatrix4(matrix); assert.ok(sphere.containsPoint(point));
          if (j % Math.max(1, Math.floor(geometry.attributes.position.count / 30)) === 0) for (const t of [0, .4, 3, 12, 120]) {
            point.copy(wind(geometry, j, matrix, Array.from(u.data.subarray(i * 4, i * 4 + 4)), t));
            assert.ok(sphere.containsPoint(point), 'common Float32 sphere includes actual post-instancing wind'); windSamples++;
          }
        }
      }
    }
    assert.ok(windSamples > 3000);
  } finally { dispose(f); }
});

function plantedSites() {
  const N = {}; for (const name of ['sf-geodata', 'city-config', 'terrain']) new Function('window', read(`js/${name}.js`))({ NYC: N });
  const b = readFileSync(new URL('data/terrain-core.bin', root)), n = b.readUInt32LE(4), h = JSON.parse(b.toString('utf8', 8, 8 + n));
  N.Terrain.load(h, new Uint16Array(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length)));
  const code = read('js/sf-street-details.js'), a = code.indexOf('  const SPECIES_OF'), end = code.indexOf('  const treeField =', a);
  const sites = new Function('window', 'blockAt', 'groundAt', 'CURB_H', code.slice(a, end) + '\nreturn sites;')({ NYC: N }, N.blockAt,
    (x, z) => N.Terrain.groundAt(x, z), N.CURB_H);
  return { sites, terrain: N.Terrain };
}
test('actual planting: raw oracle and union equivalence, exact retained bytes, bounded Node hook CPU costs', differential, t => {
  const { sites, terrain } = plantedSites(), light = sun(); assert.equal(sites.length, 22886);
  const a = field(source, sites, { terrain, lights: [light] }), b = field(baseline, sites, { terrain });
  try {
    const u = a.inspect(); assert.equal(u.cellList.length, 410); assert.equal(a.bodies.prisms.length, 45772);
    assert.equal(hash(JSON.stringify(a.bodies)), hash(JSON.stringify(b.bodies)));
    const path = Array.from({ length: 120 }, (_, i) => { const x = -600 + i * 6; return camera(x, terrain.groundAt(x, -200) + 8, -200, Math.sin(i * .04) * .8); });
    for (let i = 0; i < path.length; i++) {
      compare(a, b, path[i].position);
      if (i % 12 === 0) { hook(a, path[i]); expectedUnion(a, b); a.update(path[i].position); sameRaw(a, b); }
    }
    if (early) {
      const old = field(early, sites, { terrain }), matching = field(source, sites, { terrain });
      for (const c of path.filter((_, i) => i % 12 === 0)) compare(matching, old, c.position);
      dispose(old); dispose(matching);
    }
    const capacity = f => f.meshes.reduce((n, m) => n + m.instanceMatrix.array.byteLength + m.geometry.attributes.aTreeData.array.byteLength, 0);
    assert.equal(capacity(a), capacity(b)); assert.equal(capacity(a), 5492640);
    const extraTypedBytes = u.spheres.byteLength + u.drawn.byteLength + u.dirty.byteLength + u.cellSpheres.byteLength + u.cellDrawCounts.byteLength;
    assert.equal(extraTypedBytes, 403852);
    const blocks = { stationary: [[], []], movingAndTurning: [[], []] }, renderer = {};
    for (const [name, cameras] of [['stationary', Array(120).fill(path[0])], ['movingAndTurning', path]]) {
      for (let round = 0; round < 8; round++) for (const variant of round % 2 ? [1, 0] : [0, 1]) {
        const f = [b, a][variant]; f.update(vec(-30000, 20, -30000)); f.scene.updateMatrixWorld(true);
        const start = performance.now();
        for (let i = 0; i < cameras.length; i++) f.scene.onBeforeRender(renderer, f.scene, cameras[i], null);
        const ms = (performance.now() - start) / cameras.length; if (round >= 2) blocks[name][variant].push(ms);
      }
    }
    b.update(path[0].position); hook(a, path[0]); expectedUnion(a, b);
    const triangles = f => f.meshes.reduce((n, m) => n + (m.visible && m.instanceMatrix.array[15] !== 0 ? m.count * m.geometry.index.count / 3 : 0), 0);
    const median = values => { const sorted = values.slice().sort((x, y) => x - y); return (sorted[2] + sorted[3]) / 2; };
    t.diagnostic(JSON.stringify({ sites: sites.length, cells: u.cellList.length, pools: a.meshes.length,
      renderCapacityBytes: capacity(a), extraTypedBytes, commonSphereBytes: u.spheres.byteLength,
      rawSelectedTriangles: triangles(b), unionTriangles: triangles(a), rawSelectedInstances: b.meshes.reduce((n, m) => n + m.count, 0),
      unionInstances: a.meshes.reduce((n, m) => n + m.count, 0), blocksMsPerHook: blocks,
      medianMsPerHook: { stationary: blocks.stationary.map(median), movingAndTurning: blocks.movingAndTurning.map(median) },
      scope: 'Node tree hook only, real CSM/SF extension, six alternating measured blocks after two warmups; no GPU/upload/whole-frame claim',
      baselineSHA256: hash(baseline), currentSHA256: hash(source) }));
  } finally { dispose(a); dispose(b); }
});
