// CPU only: real pinned Three/TSL emits shaders; the lazy numerical executor checks branch execution/equivalence.
// Builder and numerical-fixture patterns adapted from NYC tests/oct29-materials.test.mjs @ 9c4cfc9 (cf56976).
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const vm = require('node:vm');
const waterTSL = require('./helpers/water-tsl.cjs');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'js/tsl-materials.js'), 'utf8');
// Verbatim SF 09977d521fb6c9083448fe4b91cdebf9444fa2df, js/tsl-materials.js lines 2820–2903.
const baseline = readFileSync(join(__dirname, 'fixtures/sf-water-emissive-09977d5.txt'), 'utf8');
const between = (src, start, end) => {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `source region: ${start} … ${end}`);
  return src.slice(a, b);
};
const water = between(source, 'function createWaterMaterial()', '/**');
const emission = between(water, '  const night = smoothstep(0.55, 1.35, cityUniforms.uInteriorGlow);', '\n\n  return mat;');
const oldWater = water.replace(emission, baseline.trimEnd());
const helpers = between(source, 'const hash2D = Fn(', '/**') +
  between(source, 'const filteredPulse = Fn(', '/**') + between(source, 'const waterBoxCover = Fn(', '/**');
// Small nonrectangular SF-schema geography: empty NYC tables, zero streetZ and CP bounds, actual SF water/tower hooks.
// This isolates the material contract from multi-MB geodata/terrain construction.
const config = {
  ISLAND_BOUNDS: { minX: -1800, maxX: 900, minZ: -2700, maxZ: 1800, waterLevel: -2.2 },
  getIslandBoundsAtZ: z => ({ westX: -1600 + z * 0.08, eastX: 800 - z * 0.12 }),
  NJ_SHORELINE_POLYGON: [], LONG_ISLAND_POLYGONS: [],
  CENTRAL_PARK_BOUNDS: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, streetZ: () => 0,
  GEO: { bridges: { goldenGate: { towers: [{ c: [-1500, -2200] }, { c: [-1200, -2400] }] } } }
};
let THREE, TSL, materials;
test.before(async () => {
  THREE = await import(pathToFileURL(join(root, 'vendor/three/build/three.webgpu.js')).href);
  TSL = await import(pathToFileURL(join(root, 'vendor/three/build/three.tsl.js')).href);
  const NYC = { ...config, THREE, TSL };
  vm.runInNewContext(source, { window: { NYC } });
  materials = NYC;
});

// No renderer/context/device is created. Keep this helper restricted to shader-source generation.
function build(material, backend) {
  const geometry = new THREE.BoxGeometry();
  const renderer = {
    contextNode: TSL.context({}), library: new THREE.StandardNodeLibrary(),
    coordinateSystem: backend === 'wgsl' ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
    backend: { isWebGPUBackend: backend === 'wgsl', isWebGLBackend: backend === 'glsl',
      capabilities: { getUniformBufferLimit: () => 65536 }, utils: { getTextureSampleData: () => ({ primarySamples: 1 }) } },
    debug: { diagnostics: {} }, lighting: { enabled: false }, shadowMap: { enabled: false },
    getRenderTarget: () => null, getMRT: () => null, getOutputRenderTarget: () => null,
    getColorBufferType: () => THREE.UnsignedByteType, hasFeature: () => false, hasCompatibility: () => false,
    outputColorSpace: THREE.LinearSRGBColorSpace, toneMapping: THREE.NoToneMapping,
    getDrawingBufferSize: v => v.set(1280, 720), getPixelRatio: () => 1,
    getCanvasTarget: () => ({ textures: [{ format: THREE.RGBAFormat, type: THREE.UnsignedByteType }] })
  };
  try {
    const builder = new (backend === 'wgsl' ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder)(new THREE.Mesh(geometry, material), renderer);
    builder.scene = new THREE.Scene(); builder.camera = new THREE.PerspectiveCamera();
    builder.build();
    return builder.fragmentShader;
  } finally { geometry.dispose(); }
}

test('the original SF raycast/filter/region expressions are retained verbatim', () => {
  const start = '    const P = positionWorld.xz;';
  const end = '    return city.mul(brightness).mul(treeline).mul(fresnel).mul(night).mul(region);';
  assert.equal(between(emission, start, end), between(baseline, start, end));
  // Pin the independent fixture and the untouched water factory prefix (waves, GG chop, geography and band fix).
  const sha = text => createHash('sha256').update(text).digest('hex');
  assert.equal(sha(baseline), 'ac263e5e0ae23ccb6948a80f4e1ae93853949705a6a96d7caac6aab3eefd0fa0');
  assert.equal(sha(water.slice(0, water.indexOf('  const night ='))), '43e3d61ecab8d38aa78421f27b2b245f9663cc11149b87d09f065f2db072d2ff');
});

for (const backend of ['wgsl', 'glsl']) test(`real e27dfa9 water emits a uniform-only skyline branch (${backend})`, () => {
  const material = materials.createWaterMaterial();
  const isolated = new THREE.MeshBasicNodeMaterial();
  isolated.fragmentNode = TSL.vec4(material.emissiveNode, 1);
  try {
    assert.doesNotMatch(build(material, backend), /NaN|undefined/);
    const shader = build(isolated, backend);
    const body = backend === 'glsl' ? shader.slice(shader.indexOf('void main()')) : shader;
    const lines = body.split('\n');
    const gates = lines.filter(line => /\bif\s*\(/.test(line));
    const gate = gates[0]?.match(/\( (\w+) > 0\.0 \)/)?.[1];
    assert.ok(gate, gates[0]);
    const definition = lines.find(line => line.includes(`${gate} =`) || line.includes(`${gate}:`));
    assert.match(definition, /smoothstep\( 0\.55, 1\.35, (?:[\w]+\.)?nodeUniform\d+ \)/);
    // Additional pinned WebGL texture-flip branches may use uniforms, never spatial guard expressions.
    for (const line of gates.slice(1)) {
      const name = line.match(/if \( (\w+) \)/)?.[1];
      assert.ok(name, `unexpected spatial branch: ${line}`);
      assert.match(lines.find(line => line.includes(`${name} =`)),
        new RegExp(`${name} = bool\\( (?:[\\w]+\\.)?nodeUniform\\d+ \\);`));
    }
    const open = body.indexOf('{', body.indexOf(gates[0]));
    let depth = 1, close = open + 1;
    for (; close < body.length && depth; close++) {
      if (body[close] === '{') depth++;
      if (body[close] === '}') depth--;
    }
    const branch = body.slice(open, close);
    assert.ok((branch.match(/fwidth\(/g) || []).length >= 2, 'hit-coordinate filtering stays inside the uniform gate');
    assert.match(branch, /sin\(/, 'actual procedural skyline/noise work is guarded');
    assert.doesNotMatch(body.slice(0, open), /fwidth\(|sin\(/, 'isolated emission must not hoist night work before the gate');
    assert.doesNotMatch(body.slice(close), /fwidth\(|sin\(/, 'isolated emission must not sink night work after the gate');
  } finally { material.dispose(); isolated.dispose(); }
});

test('exact-zero daylight skips work; every nonzero night sample matches independent pre-port SF', () => {
  const { env, context, arr, reset } = waterTSL(THREE, config);
  const make = code => vm.runInNewContext(`${helpers}\n${code}\ncreateWaterMaterial;`, { ...context })();
  const before = make(oldWater), after = make(water);
  const locations = [[-2200, -2.2, 500], [1500, -2.2, -500], [-1350, -2.2, -2300], [80, 4, -60],
    [-2200, -2.2, -2950], [-2200, -2.2, 2150], [-2200, -2.2, -4000], [-2200, -2.2, 3000]];
  let positive = 0, tinyPositive = 0, faded = 0, samples = 0;
  for (const glow of [0.24, 0.48, 0.55, 0.550001, 0.78, 0.95, 1.35, 1.38, 0.48]) {
    env.glow = glow;
    for (const footprint of [0.001, 0.02, 1.2]) for (const [x, y, z] of locations) {
      env.world = [x, y, z]; env.camera = [x - 180, y + 15, z]; env.footprint = footprint;
      reset();
      const expected = arr(before.emissiveNode);
      const oldCounts = { hashes: env.hashes, derivatives: env.derivatives };
      assert.ok(oldCounts.hashes > 0 && oldCounts.derivatives > 0, 'baseline really executes the expensive path');
      reset();
      const actual = arr(after.emissiveNode);
      assert.ok(actual.every(Number.isFinite));
      assert.deepEqual(actual, expected, `glow=${glow}, footprint=${footprint}, location=${x}/${y}/${z}`);
      assert.deepEqual(env.gates, [{ matched: glow > 0.55, spatial: false }]);
      assert.equal(env.unsafe, 0, 'no varying-dependent derivative execution');
      if (glow <= 0.55) {
        assert.deepEqual(actual, [0, 0, 0]);
        assert.equal(env.hashes, 0); assert.equal(env.derivatives, 0);
      } else {
        assert.equal(env.hashes, oldCounts.hashes); assert.equal(env.derivatives, oldCounts.derivatives);
        if (actual.some(v => v > 0)) {
          positive++;
          if (glow === 0.550001) tinyPositive++;
        }
        else faded++;
      }
      samples++;
    }
  }
  assert.equal(samples, 216);
  assert.ok(positive > 30, 'night controls include real emission');
  assert.ok(tinyPositive > 0, 'a tiny nonzero twilight contribution must not be dropped');
  assert.ok(faded >= 30, 'night still executes the existing regional fade rather than a new spatial early-out');
});
