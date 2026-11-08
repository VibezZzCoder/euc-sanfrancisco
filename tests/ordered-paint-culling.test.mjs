// Exact ordered-index / native-hook CPU checks. No browser, renderer device, geographic regeneration or GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { gitHistory } from './helpers/optional-source.mjs';

const root = new URL('../', import.meta.url), read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('js/road-paint.js'), history = gitHistory(root, '9028c5b');
const baseline = history.read('js/road-paint.js');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hash = a => createHash('sha256').update(typeof a === 'string' ? a : bytes(a)).digest('hex');
if (baseline) assert.equal(hash(baseline), '48b415a58cdb761dd98970eb3e000b03bd628b2e86148b33dde81c61fcc8eb96');
const differential = { skip: !baseline && history.skip }, LEAF = 256 * 3;
const v = (x, y, z) => new THREE.Vector3(x, y, z), noop = () => {};

function patchSubarrays(callback) {
  let calls = 0, owner = null;
  const prototypes = [Uint16Array.prototype, Uint32Array.prototype];
  const descriptors = prototypes.map(p => Object.getOwnPropertyDescriptor(p, 'subarray'));
  const original = prototypes.map(p => p.subarray);
  for (let i = 0; i < prototypes.length; i++) prototypes[i].subarray = function (...args) {
    calls++; owner = this; return original[i].apply(this, args);
  };
  try { return { result: callback(), calls: () => calls, owner: () => owner }; }
  finally { for (let i = 0; i < prototypes.length; i++) {
    if (descriptors[i]) Object.defineProperty(prototypes[i], 'subarray', descriptors[i]); else delete prototypes[i].subarray;
  } }
}
function fixture(code = source, { roads = 24, length = 127, crosswalk = 3.5 } = {}) {
  const allocated = [], constructors = {};
  for (const [name, Type] of [['Float64Array', Float64Array], ['Uint32Array', Uint32Array]]) constructors[name] = new Proxy(Type, {
    construct(Target, args) { const a = new Target(...args); allocated.push(a); return a; }
  });
  let materials = 0;
  const N = { THREE, CROSSWALK: crosswalk, CURB_H: .15,
    Terrain: { loaded: true, groundAt: (x, z) => 120 + x * .013 - z * .029 + Math.sin(x * .03) * 4,
      normalAt(x, z, out) { out.x = -.013; out.y = 1; out.z = .029; } },
    blockAt: (x, z) => Math.abs(z % 1200) > 8,
    GEO: { bikeways: [], rail: [], transit: [] },
    createRoadPaintMaterial() { materials++; return new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, vertexColors: true }); } };
  const network = { edges: [] };
  for (let i = 0; i < roads; i++) {
    // Interleaved signed locations: visibility must not turn this source stream into a cell-sorted stream.
    const x = (i % 6 - 3) * 1200 + 11, z = (Math.floor(i / 6) - 2) * 1200 - 2;
    const from = { id: i * 2, signal: true }, to = { id: i * 2 + 1, stop: true };
    network.edges.push({ from, to, sx: x, sz: z, dx: 1, dz: 0, rx: 0, rz: -1, len: length, half: 10, lanes: [-1.8, 1.8], stop: true });
    N.GEO.bikeways.push({ pts: [x, z, x + length, z], cls: 2, side: 0, buffered: true });
    N.GEO.rail.push({ pts: [x - 5, z - 4, x + length + 5, z + 4] });
    N.GEO.transit.push({ kind: 'cablecar', pts: [x - 5, z - 4, x + length + 5, z + 4] });
  }
  new Function('window', 'console', 'Float64Array', 'Uint32Array', code)({ NYC: N }, { info: noop }, constructors.Float64Array, constructors.Uint32Array);
  const scene = new THREE.Scene();
  const built = patchSubarrays(() => N.buildRoadPaint(scene, network));
  const mesh = built.result; scene.updateMatrixWorld(true);
  const original = built.owner() ?? mesh.geometry.index.array.slice();
  const leafBoxes = [];
  // Independent flat oracle: native Box3 over every original indexed endpoint, not the production hierarchy.
  for (let start = 0; start < original.length; start += LEAF) {
    const box = new THREE.Box3(), p = new THREE.Vector3(), end = Math.min(start + LEAF, original.length);
    for (let j = start; j < end; j++) {
      const i = original[j], pos = mesh.geometry.attributes.position, side = mesh.geometry.attributes.side;
      p.fromBufferAttribute(pos, i); box.expandByPoint(p);
      p.x += side.getX(i) * 15; p.z += side.getY(i) * 15; box.expandByPoint(p);
    }
    const magnitude = Math.max(...box.min.toArray().map(Math.abs), ...box.max.toArray().map(Math.abs));
    box.expandByScalar(.01 + magnitude * 2 ** -21); leafBoxes.push(box);
  }
  return { N, scene, mesh, original, leafBoxes, allocated, constructionViews: built.calls(), materials,
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); scene.clear(); } };
}
function camera(x = -3589, z = -2402, span = 260) {
  const c = new THREE.OrthographicCamera(-span, span, span, -span, .1, 5000);
  c.position.set(x, 2000, z); c.up.set(0, 0, -1); c.lookAt(x, 0, z); return updateCamera(c);
}
function updateCamera(c) { c.updateProjectionMatrix(); c.updateMatrixWorld(true); return c; }
function hook(f, c, renderer = {}) { f.scene.updateMatrixWorld(true); f.mesh.onBeforeRender(renderer, f.scene, c, f.mesh.geometry, f.mesh.material, null); }
function expected(f, c) {
  const clip = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).multiply(f.mesh.matrixWorld);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(clip, c.coordinateSystem, c.reversedDepth);
  const leaves = [];
  for (let i = 0; i < f.leafBoxes.length; i++) if (frustum.intersectsBox(f.leafBoxes[i])) leaves.push(i);
  const out = [];
  for (const leaf of leaves) for (let j = leaf * LEAF; j < Math.min((leaf + 1) * LEAF, f.original.length); j++) out.push(f.original[j]);
  return { leaves, array: new f.original.constructor(out) };
}
function prefix(f) {
  const g = f.mesh.geometry; return g.index.array.subarray(g.drawRange.start, Math.min(g.index.count, g.drawRange.start + g.drawRange.count));
}
function snapshot(f) {
  const g = f.mesh.geometry;
  return { attributes: Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, [a.itemSize, a.normalized, a.array.constructor.name, hash(a.array)]])),
    box: g.boundingBox.clone(), sphere: g.boundingSphere.clone(), name: f.mesh.name, order: f.mesh.renderOrder,
    shadow: [f.mesh.castShadow, f.mesh.receiveShadow], material: f.mesh.material };
}

test('one paint mesh retains exact full source, attributes, sorting bounds and material; only a reusable index prefix changes', differential, () => {
  const before = fixture(baseline), after = fixture();
  try {
    const a = snapshot(before), b = snapshot(after);
    assert.deepEqual({ ...b, material: null }, { ...a, material: null });
    assert.equal(after.materials, 1); assert.equal(after.scene.children.length, 1); assert.equal(after.mesh.children.length, 0);
    assert.equal(after.mesh.name, 'RoadMarkings'); assert.equal(after.mesh.renderOrder, -1);
    assert.deepEqual(bytes(after.mesh.geometry.index.array), bytes(before.mesh.geometry.index.array));
    assert.notEqual(after.original.buffer, after.mesh.geometry.index.array.buffer);
    const originalHash = hash(after.original), index = after.mesh.geometry.index, array = index.array;
    hook(after, camera()); assert.ok(prefix(after).length < after.original.length);
    assert.equal(after.mesh.geometry.index, index); assert.equal(index.array, array);
    assert.equal(index.usage, THREE.StaticDrawUsage, 'unchanged leaves must not upload on every native render');
    assert.deepEqual(snapshot(after), b); assert.equal(hash(after.original), originalHash);
    assert.equal(after.constructionViews, after.leafBoxes.length, 'one reusable source view per leaf, not a copied tree of index buffers');
  } finally { before.dispose(); after.dispose(); }
});

test('hierarchical indices exactly match a flat native-frustum oracle across fixed views, turns, resize, transforms and depth modes', () => {
  const f = fixture();
  try {
    const originalHash = hash(f.original), full = snapshot(f), parent = new THREE.Group(); f.scene.add(parent); parent.add(f.mesh);
    let strictSubsets = 0, changed = 0;
    for (const coordinate of [THREE.WebGLCoordinateSystem, THREE.WebGPUCoordinateSystem]) for (const reversed of [false, true]) {
      for (const [i, [x, z, span]] of [[-3589, -2402, 260], [-1189, -1202, 500], [11, -2, 120], [2411, 1198, 800]].entries()) {
        parent.position.set(i * 31, 0, -i * 17); parent.rotation.y = i * .13; f.scene.updateMatrixWorld(true);
        const c = camera(x, z, span); c.coordinateSystem = coordinate; c._reversedDepth = reversed; updateCamera(c);
        const want = expected(f, c), version = f.mesh.geometry.index.version;
        hook(f, c); assert.deepEqual(bytes(prefix(f)), bytes(want.array), 'same ordered subsequence as brute-force leaf tests');
        for (let j = 1; j < want.leaves.length; j++) assert.ok(want.leaves[j] > want.leaves[j - 1], 'original primitive ranges never reorder');
        if (want.array.length > 0 && want.array.length < f.original.length) strictSubsets++;
        if (f.mesh.geometry.index.version !== version) changed++;
        // Turn at the same position, then alter aspect/projection: no player-distance or movement gate.
        const view = new THREE.PerspectiveCamera(55, 16 / 9, .35, 60000);
        view.position.set(x, 180, z + 400); view.lookAt(x, 120, z); view.coordinateSystem = coordinate; view._reversedDepth = reversed;
        for (const [yaw, aspect] of [[0, 16 / 9], [Math.PI, 16 / 9], [0, .55]]) {
          view.lookAt(x + Math.sin(yaw) * 400, 120, z + 400 - Math.cos(yaw) * 400); view.aspect = aspect; updateCamera(view);
          const oracle = expected(f, view); hook(f, view); assert.deepEqual(bytes(prefix(f)), bytes(oracle.array));
        }
      }
    }
    assert.ok(strictSubsets >= 4 && changed > 0); assert.equal(hash(f.original), originalHash); assert.deepEqual(snapshot(f), full);
  } finally { f.dispose(); }
});

test('actual Float32 1–16x widened endpoints fit every hierarchy leaf, including rail/crosswalk frustum-edge negative controls', () => {
  const f = fixture(source, { roads: 4, length: 190, crosswalk: 7 });
  try {
    const tree = f.allocated.find(a => a instanceof Float64Array), base = tree.length / 12;
    const g = f.mesh.geometry, p = new THREE.Vector3(); let outsideRaw = 0, outside16m = 0, edges = 0;
    for (let leaf = 0; leaf < f.leafBoxes.length; leaf++) {
      const actual = new THREE.Box3(v(...tree.subarray((base + leaf) * 6, (base + leaf) * 6 + 3)),
        v(...tree.subarray((base + leaf) * 6 + 3, (base + leaf) * 6 + 6)));
      const raw = new THREE.Box3();
      for (let j = leaf * LEAF; j < Math.min((leaf + 1) * LEAF, f.original.length); j++) raw.expandByPoint(p.fromBufferAttribute(g.attributes.position, f.original[j]));
      const nominal = raw.clone().expandByScalar(16);
      for (let j = leaf * LEAF; j < Math.min((leaf + 1) * LEAF, f.original.length); j++) {
        const i = f.original[j];
        for (const widen of [1, 2, 8, 16]) {
          p.fromBufferAttribute(g.attributes.position, i);
          p.x = Math.fround(p.x + Math.fround(g.attributes.side.getX(i) * (widen - 1)));
          p.z = Math.fround(p.z + Math.fround(g.attributes.side.getY(i) * (widen - 1)));
          assert.ok(actual.containsPoint(p), 'bound the uploaded Float32 data and shader arithmetic');
          if (!raw.containsPoint(p)) outsideRaw++;
          if (!nominal.containsPoint(p)) {
            outside16m++;
            if (edges < 12) {
              const c = camera(p.x, p.z, .001); c.position.y = p.y + 10; c.near = .01; c.far = 20; c.lookAt(p); updateCamera(c);
              const oracle = expected(f, c); assert.ok(oracle.leaves.includes(leaf), 'widened silhouette remains in the real pass frustum');
              hook(f, c); assert.deepEqual(bytes(prefix(f)), bytes(oracle.array)); edges++;
            }
          }
        }
      }
    }
    assert.ok(outsideRaw > 0 && outside16m > 0 && edges === 12, 'unexpanded / fixed-16m bounds genuinely fail these samples');
  } finally { f.dispose(); }
});

test('cached or unchanged leaf sequences allocate no arrays/views, copy no indices and publish no redundant dirty version', () => {
  const f = fixture();
  try {
    const c = camera(), oracle = expected(f, c); assert.ok(oracle.array.length > 0 && oracle.array.length < f.original.length);
    hook(f, c);
    const index = f.mesh.geometry.index, array = index.array, version = index.version, full = Buffer.from(bytes(array));
    let copies = 0; const set = array.set; array.set = function (...args) { copies++; return set.apply(this, args); };
    const allocations = f.allocated.length;
    const calls = patchSubarrays(() => { for (let i = 0; i < 30; i++) hook(f, c); });
    assert.equal(calls.calls(), 0); assert.equal(copies, 0); assert.equal(index.version, version); assert.equal(f.allocated.length, allocations);
    c.position.x += .001; c.lookAt(c.position.x, 0, c.position.z); updateCamera(c);
    assert.deepEqual(expected(f, c).leaves, oracle.leaves, 'a changed view matrix can still select the same partial leaf sequence');
    hook(f, c); assert.equal(copies, 0); assert.equal(index.version, version); assert.deepEqual(bytes(array), full);
    delete array.set;
  } finally { f.dispose(); }
});

test('compilation, forced warmup and array views use the full stream; disposal restores complete reusable geometry', () => {
  const f = fixture();
  try {
    const c = camera(), total = f.original.length, originalHash = hash(f.original), full = Buffer.from(bytes(f.original));
    hook(f, c); assert.ok(prefix(f).length < total);
    hook(f, c, { _precompilationState: {} }); assert.deepEqual(bytes(prefix(f)), full);
    hook(f, c); assert.ok(prefix(f).length < total);
    f.mesh.frustumCulled = false; hook(f, c); assert.deepEqual(bytes(prefix(f)), full); f.mesh.frustumCulled = true;
    hook(f, c); hook(f, new THREE.ArrayCamera([c])); assert.deepEqual(bytes(prefix(f)), full);
    hook(f, c); f.mesh.geometry.dispose(); assert.deepEqual(bytes(f.mesh.geometry.index.array), full);
    assert.equal(f.mesh.geometry.drawRange.count, total); assert.equal(f.mesh.onBeforeRender, THREE.Mesh.prototype.onBeforeRender);
    f.mesh.geometry.dispose(); assert.equal(hash(f.original), originalHash, 'repeat disposal cannot mutate the immutable source');
  } finally { f.dispose(); }
});

function nativeMethod(text, className, signature, next = '\n\t/**') {
  const begin = text.indexOf(signature, text.indexOf(`class ${className}`)), end = text.indexOf(next, begin + signature.length);
  assert.ok(begin >= 0 && end > begin, `${className}.${signature}`);
  const body = text.slice(begin + signature.length, end); return body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
}
const rendererSource = read('vendor/three/build/three.webgpu.js');

for (const backend of ['webgl2', 'webgpu']) for (const bits of [16, 32]) test(`${backend}/UInt${bits}: native hook precedes same-draw index upload; culled pending prefixes survive`, () => {
  const f = fixture(source, { roads: bits === 32 ? 60 : 4 });
  try {
    const geometry = f.mesh.geometry, index = geometry.index, gpu = index.array.slice();
    assert.equal(index.array.BYTES_PER_ELEMENT, bits / 8);
    let uploads = 0, draws = 0;
    const data = { buffer: {}, bufferGPU: {}, bufferType: 1, version: 0 };
    const attributes = new WeakMap();
    for (const a of [...Object.values(geometry.attributes), index]) attributes.set(a, { version: 0 });
    const copy = (array, start, count, offset) => gpu.set(array.subarray(start, start + count), offset);
    const gl = { ELEMENT_ARRAY_BUFFER: 1, COPY_WRITE_BUFFER: 2, bindBuffer(target) { assert.equal(target, 2); },
      bufferSubData(target, offset, array, start, count) { uploads++; assert.equal(target, 2); copy(array, start, count, offset / array.BYTES_PER_ELEMENT); } };
    const device = { queue: { writeBuffer(buffer, offset, array, start = 0, count = array.length) {
      uploads++;
      assert.equal(offset % 4, 0); assert.equal(count * array.BYTES_PER_ELEMENT % 4, 0, 'native aligned index writes');
      new Uint8Array(gpu.buffer).set(new Uint8Array(array.buffer, array.byteOffset + start * array.BYTES_PER_ELEMENT,
        count * array.BYTES_PER_ELEMENT), offset);
    } } };
    const alignedStart = rendererSource.indexOf('const _tail = new Uint8Array( 4 );');
    const alignedEnd = rendererSource.indexOf('class WebGPUAttributeUtils', alignedStart);
    const writeAligned = new Function(`${rendererSource.slice(alignedStart, alignedEnd)}; return writeBufferAligned;`)();
    const update = new Function('attribute', 'isTypedArray', 'writeBufferAligned', nativeMethod(rendererSource,
      backend === 'webgpu' ? 'WebGPUAttributeUtils' : 'WebGLAttributeUtils', '\tupdateAttribute( attribute )'));
    const utils = { backend: { gl, device, getBufferAttribute: a => a, get: () => data } };
    const AttributeType = { VERTEX: 1, INDEX: 2, STORAGE: 3, INDIRECT: 4 };
    const attributeUpdate = new Function('attribute', 'type', 'AttributeType', 'DynamicDrawUsage', nativeMethod(rendererSource, 'Attributes', '\tupdate( attribute, type )', '\n\tdispose()'));
    const attributeOwner = { get: a => attributes.get(a), backend: { updateAttribute(a) {
      assert.equal(a, index); update.call(utils, a, ArrayBuffer.isView, writeAligned);
    } } };
    const updateAttributes = new Function('renderObject', 'AttributeType', nativeMethod(rendererSource, 'Geometries', '\tupdateAttributes( renderObject )'));
    const ro = { geometry, group: null, getAttributes: () => Object.values(geometry.attributes) };
    const geometries = { getIndex: () => index, updateAttribute(a, type) { attributeUpdate.call(attributeOwner, a, type, AttributeType, THREE.DynamicDrawUsage); } };
    const renderer = { _currentRenderBundle: null, _currentRenderContext: {}, info: {},
      _objects: { get: () => ro }, _nodes: { needsRefresh: () => 2, updateBefore: noop, updateForRender: noop, updateAfter: noop },
      _geometries: { updateForRender(object) { updateAttributes.call(geometries, object, AttributeType); } },
      _bindings: { updateForRender: noop }, _pipelines: { updateForRender: noop, isReady: () => true },
      backend: { draw(object) {
        draws++; assert.equal(object.drawRange, geometry.drawRange);
        assert.deepEqual(bytes(gpu.subarray(0, geometry.drawRange.count)), bytes(prefix(f)), 'the GPU prefix is current BEFORE this draw');
      } } };
    renderer._handleObjectFunction = THREE.WebGPURenderer.prototype._renderObjectDirect;
    const draw = c => { updateCamera(c); f.scene.updateMatrixWorld(true);
      THREE.WebGPURenderer.prototype.renderObject.call(renderer, f.mesh, f.scene, c, geometry, f.mesh.material, null, null); };
    // Native culling can skip the whole object: no hook/upload is consumed during that interval.
    const wide = camera(-3589, -2402, 1800), narrow = camera();
    hook(f, wide); const pending = index.updateRanges[0].count;
    hook(f, narrow); assert.ok(index.updateRanges[0].count >= pending);
    assert.equal(uploads, 0); draw(narrow); assert.ok(uploads > 0); assert.equal(index.updateRanges.length, 0);
    const before = uploads; draw(narrow); assert.equal(uploads, before, 'StaticDrawUsage respects an unchanged index version');
    draw(camera(-1189, -2402, 160)); assert.ok(draws === 3 && uploads > before);
    draw(camera(1e6, 1e6, 10)); assert.equal(geometry.drawRange.count, 0);
    draw(narrow); assert.ok(geometry.drawRange.count > 0, 'empty to visible restores a valid uploaded prefix');
  } finally { f.dispose(); }
});

test('bounded CPU fixture reports retained index/hierarchy bytes and optional copy/preparation timing', t => {
  const f = fixture(source, { roads: 60 });
  try {
    const c = camera(), oracle = expected(f, c); hook(f, c);
    const metadataBytes = f.allocated.reduce((sum, a) => sum + a.byteLength, 0);
    t.diagnostic(JSON.stringify({ triangles: f.original.length / 3, leaves: f.leafBoxes.length,
      immutableSourceBytes: f.original.byteLength, existingGPUIndexCapacityBytes: f.mesh.geometry.index.array.byteLength,
      typedHierarchyAndSelectionBytes: metadataBytes, constructionOnlySourceViews: f.constructionViews,
      admittedTriangles: oracle.array.length / 3, requestedPrefixBytes: oracle.array.byteLength,
      scope: 'synthetic CPU fixture, not whole-frame/GPU timing or native memory residency' }));
    if (process.env.SF_ORDERED_PAINT_BENCH === '1') {
      const views = [camera(), camera(-1189, -1202, 500), camera(11, -2, 120), camera(2411, 1198, 800)];
      const blocks = [];
      for (let block = 0; block < 8; block++) {
        const start = performance.now();
        for (let i = 0; i < 120; i++) hook(f, views[i % views.length]);
        if (block >= 2) blocks.push((performance.now() - start) / 120);
      }
      t.diagnostic(JSON.stringify({ changingViewPreparationMs: blocks, scope: 'Node hierarchy + prefix copying only; no GPU/upload/whole-frame claim' }));
    }
  } finally { f.dispose(); }
});
