// The sun-shadow builder-retention fix replaces SunShadowNode._setupCascades with a copy. Pin the vendored method so
// a three upgrade forces a review of the copy; check the copy differs only by the closure-free uniform helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';

const vendored = readFileSync(new URL('../vendor/three/examples/jsm/lights/SunShadowNode.js', import.meta.url), 'utf8');
const fix = readFileSync(new URL('../js/sun-shadow-retention.js', import.meta.url), 'utf8');
const targetStart = vendored.indexOf('\tsetupRenderTarget( shadow, builder ) {');
const targetEnd = vendored.indexOf('\t/**\n\t * Builds the per-fragment cascade blending.');
assert.ok(targetStart > 0 && targetEnd > targetStart);
const targetMethod = vendored.slice(targetStart, targetEnd);

test('vendored SunShadowNode.setupRenderTarget is the reviewed e27dfa9 allocator', () => {
  assert.equal(createHash('sha256').update(targetMethod).digest('hex'),
    'f769e43b19205f9c4f01ebdc5bcc451f146740002e0156f5ad368e7135e39c81',
    'three changed SunShadowNode.setupRenderTarget: re-review the native R8 override and its ownership assumptions');
});

test('vendored SunShadowNode._setupCascades is the reviewed e27dfa9 body', () => {
  const start = vendored.indexOf('\t_setupCascades( builder, filterFn ) {');
  const end = vendored.indexOf('\t/**\n\t * Sets up the atlas render target');
  assert.ok(start > 0 && end > start);
  assert.equal(createHash('sha256').update(vendored.slice(start, end)).digest('hex'),
    '58ced08a526c6b6dae8015226dc97b2b9d29a3e654217a9c54508154142574fe',
    'three changed SunShadowNode._setupCascades: re-review js/sun-shadow-retention.js (and drop it if the leak is fixed upstream)');
});

test('the replacement keeps the node graph and only moves the cascade uniforms out of the builder scope', () => {
  const tokens = text => text.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
  const original = tokens(vendored.slice(vendored.indexOf('\t_setupCascades( builder, filterFn ) {'), vendored.indexOf('\t/**\n\t * Sets up the atlas render target')));
  const copy = tokens(fix.slice(fix.indexOf('proto._setupCascades = function (builder, filterFn) {'), fix.indexOf('  return true;\n}')));
  const inline = tokens(`const shadowMatrix = uniform( 'mat4' ).setGroup( renderGroup ).onRenderUpdate( () => shadow.getMatrix( i ) );
    const cascade = uniform( 'vec4' ).setGroup( renderGroup ).onRenderUpdate( () => shadow._cascadeData[ i ] );`);
  const viaHelper = tokens('const { shadowMatrix, cascade } = cascadeUniforms(shadow, i);');
  assert.ok(original.includes(inline));
  // The copy is a function expression (`…};`), the vendored body a class method (`…}`).
  assert.equal(copy.replace(/^proto\._setupCascades=function/, '_setupCascades').replace(viaHelper, inline).replace(/;$/, ''), original);
  assert.match(fix, /function cascadeUniforms\(shadow, i\) \{[^}]*shadow\.getMatrix\(i\)[^]*?shadow\._cascadeData\[i\]/);
  assert.doesNotMatch(fix.slice(fix.indexOf('function cascadeUniforms'), fix.indexOf('export function')), /builder/);
});

// Evaluate the real pinned allocator and application installer without a browser import map or GPU.
// Each fixture has its own prototype; the wrapper's call identity/count and original return are observable.
function allocatorFixture() {
  const original = vm.runInNewContext(`({${targetMethod}}).setupRenderTarget`, { ...THREE });
  const calls = [];
  class SunShadowNode {}
  SunShadowNode.prototype.setupRenderTarget = function (shadow, builder) {
    const result = original.call(this, shadow, builder);
    calls.push({ receiver: this, shadow, builder, result,
      target: Object.getOwnPropertyDescriptors(result.shadowMap),
      color: Object.getOwnPropertyDescriptors(result.shadowMap.texture),
      depth: Object.getOwnPropertyDescriptors(result.depthTexture) });
    return Object.freeze(result); // The installer must preserve, not reconstruct or extend, the return record.
  };
  const install = vm.runInNewContext(`(function () {
    ${fix.replace(/^import .*;$/gm, '').replace('export function', 'function')}
    return installSunShadowRetentionFix;
  })()`, { ...TSL, SunShadowNode });
  return { install, calls, SunShadowNode };
}

function targetFixture(backend, reversedDepthBuffer = false) {
  const shadow = { mapSize: new THREE.Vector2(2048, 2048), mapType: THREE.UnsignedByteType,
    getFrameExtents: () => new THREE.Vector2(2, 1) };
  const builder = { renderer: { backend, reversedDepthBuffer },
    createRenderTarget: (width, height) => new THREE.RenderTarget(width, height) };
  return { shadow, builder };
}

for (const [name, backend, expected] of [
  ['WebGL2', { isWebGLBackend: true }, 'R8'],
  ['WebGPU', { isWebGPUBackend: true }, 'r8unorm'],
  ['unrecognized backend', {}, null]
]) test(`${name}: one native call, same return/flags/depth, only colour internalFormat changes`, () => {
  const { install, calls, SunShadowNode } = allocatorFixture();
  assert.equal(install(), true);
  const wrapped = SunShadowNode.prototype.setupRenderTarget;
  assert.equal(install(), false);
  assert.equal(SunShadowNode.prototype.setupRenderTarget, wrapped, 'repeat install must not stack wrappers');
  const receiver = new SunShadowNode();
  for (const reversed of [false, true]) {
    const { shadow, builder } = targetFixture(backend, reversed);
    const before = calls.length;
    const result = receiver.setupRenderTarget(shadow, builder);
    assert.equal(calls.length, before + 1);
    const call = calls.at(-1);
    assert.equal(call.receiver, receiver);
    assert.equal(call.shadow, shadow); assert.equal(call.builder, builder); assert.equal(result, call.result);
    const { shadowMap, depthTexture } = result;
    assert.deepEqual(Object.getOwnPropertyDescriptors(shadowMap), call.target);
    assert.deepEqual(Object.getOwnPropertyDescriptors(depthTexture), call.depth);
    const colorAfter = Object.getOwnPropertyDescriptors(shadowMap.texture);
    assert.equal(colorAfter.internalFormat.value, expected);
    delete colorAfter.internalFormat; delete call.color.internalFormat;
    assert.deepEqual(colorAfter, call.color, 'all other texture properties, including version, stay native');
    assert.equal(shadowMap.texture.format, THREE.RGBAFormat);
    assert.equal(shadowMap.texture.type, THREE.UnsignedByteType);
    assert.equal(shadowMap.samples, 0);
    assert.equal(shadowMap.textures.length, 1);
    assert.equal(shadowMap.depthTexture, depthTexture);
    assert.equal(depthTexture.renderTarget, shadowMap);
    assert.equal(depthTexture.compareFunction, reversed ? THREE.GreaterEqualCompare : THREE.LessEqualCompare);
    assert.deepEqual([shadowMap.width, shadowMap.height], [4096, 2048]);
    // Keeping the native colour attachment retains the allocator's size/disposal path through tier changes.
    let disposals = 0;
    shadowMap.addEventListener('dispose', () => disposals++);
    shadowMap.setSize(2048, 1024);
    assert.equal(disposals, 1);
    assert.deepEqual([shadowMap.texture.image.width, shadowMap.texture.image.height], [2048, 1024]);
    assert.equal(shadowMap.texture.internalFormat, expected);
    shadowMap.dispose(); assert.equal(disposals, 2);
  }
});

function buildShadowShader(target, backend) {
  const renderer = {
    contextNode: TSL.context({}), library: new THREE.StandardNodeLibrary(),
    coordinateSystem: backend === 'wgsl' ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
    backend: { isWebGPUBackend: backend === 'wgsl', isWebGLBackend: backend === 'glsl', has: () => false,
      capabilities: { getUniformBufferLimit: () => 65536 }, utils: { getTextureSampleData: () => ({ primarySamples: 1 }) } },
    debug: { diagnostics: {} }, lighting: { enabled: false }, shadowMap: { enabled: false },
    getRenderTarget: () => target, getMRT: () => null, getOutputRenderTarget: () => null,
    hasFeature: () => false, hasCompatibility: () => false,
    outputColorSpace: THREE.LinearSRGBColorSpace, toneMapping: THREE.NoToneMapping
  };
  const light = new THREE.DirectionalLight();
  const shadowNode = new THREE.ShadowNode(light);
  const material = shadowNode.getShadowMaterial();
  const geometry = new THREE.BoxGeometry();
  const builder = new (backend === 'wgsl' ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder)(
    new THREE.Mesh(geometry, material), renderer);
  builder.scene = new THREE.Scene(); builder.camera = new THREE.OrthographicCamera();
  try {
    assert.equal(builder.getOutputType(), 'vec4');
    builder.build();
    return { vertex: builder.vertexShader, fragment: builder.fragmentShader };
  } finally { geometry.dispose(); shadowNode.dispose(); }
}

for (const backend of ['wgsl', 'glsl']) test(`${backend}: native storage override preserves the emitted shadow shader`, () => {
  const fixture = allocatorFixture(); fixture.install();
  const { shadow, builder } = targetFixture(backend === 'wgsl' ? { isWebGPUBackend: true } : { isWebGLBackend: true });
  const { shadowMap } = new fixture.SunShadowNode().setupRenderTarget(shadow, builder);
  const narrow = buildShadowShader(shadowMap, backend);
  shadowMap.texture.internalFormat = null;
  const original = buildShadowShader(shadowMap, backend);
  assert.equal(narrow.vertex, original.vertex);
  assert.equal(narrow.fragment, original.fragment);
  assert.doesNotMatch(narrow.vertex + narrow.fragment, /NaN|undefined/);
  assert.match(narrow.fragment, backend === 'wgsl' ? /@location\(\s*0\s*\)[^\n]*vec4<f32>/ : /out vec4/);
  shadowMap.dispose();
});
