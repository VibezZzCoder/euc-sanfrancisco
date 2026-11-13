// CPU only: real pinned Three/TSL emits shaders; the lazy numerical executor checks branch execution/equivalence.
// Builder and numerical-fixture patterns adapted from NYC tests/oct29-materials.test.mjs @ 9c4cfc9 (cf56976).
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
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
// Frozen legacy geography is intentionally wrong for SF; keep it as a regression control, never a runtime fallback.
const legacyGeography = readFileSync(join(__dirname, 'fixtures/sf-water-geography-2a4cf85.txt'), 'utf8');
const between = (src, start, end) => {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `source region: ${start} … ${end}`);
  return src.slice(a, b);
};
const water = between(source, 'function createWaterMaterial()', '/**');
const emission = between(water, '  const night = smoothstep(0.55, 1.35, cityUniforms.uInteriorGlow);', '\n\n  return mat;');
const prefix = water.slice(0, water.indexOf('  // Night:'));
const oldWater = prefix + legacyGeography + baseline + '\n  return mat;\n}\n';
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
let THREE, TSL, materials, realConfig;
test.before(async () => {
  THREE = await import(pathToFileURL(join(root, 'vendor/three/build/three.webgpu.js')).href);
  TSL = await import(pathToFileURL(join(root, 'vendor/three/build/three.tsl.js')).href);
  const geography = { window: { NYC: {} } };
  vm.runInNewContext(readFileSync(join(root, 'js/sf-geodata.js'), 'utf8'), geography);
  const cityConfig = readFileSync(join(root, 'js/city-config.js'), 'utf8');
  realConfig = vm.runInNewContext(between(cityConfig, 'const GEO =', 'function ordinal') +
    between(cityConfig, 'const LAND_RINGS =', 'const CUT_Z =') +
    '\n({ ISLAND_BOUNDS, getIslandBoundsAtZ, GEO });', geography);
  const NYC = { ...config, ...realConfig, THREE, TSL };
  vm.runInNewContext(source, { window: { NYC } });
  materials = NYC;
});

// No renderer/context/device is created. Keep this helper restricted to shader-source generation.
function build(material, backend, stats = {}) {
  const geometry = new THREE.BoxGeometry();
  const renderer = {
    contextNode: TSL.context({}), library: new THREE.StandardNodeLibrary(),
    coordinateSystem: backend === 'wgsl' ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
    backend: { isWebGPUBackend: backend === 'wgsl', isWebGLBackend: backend === 'glsl', has: () => false,
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
    stats.nodes = builder.nodes.size;
    stats.bindings = builder.getBindings().flatMap(group => group.bindings.map(binding => binding.constructor.name)).sort();
    return builder.fragmentShader;
  } finally { geometry.dispose(); }
}

test('frozen legacy evidence, daylight waves/optics and window/shop/lamp filtering stay intact', () => {
  // Geography and absolute NYC heights are deliberately superseded, not the appearance/filtering of local lights.
  const start = '    const sigma2 = sqrt(variance).mul(2.0);';
  const end = '    const region =';
  const codeOnly = text => text.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
  assert.equal(codeOnly(between(emission, start, end)), codeOnly(between(baseline, start, '    const treeline =')));
  const sha = text => createHash('sha256').update(text).digest('hex');
  assert.equal(sha(baseline), 'ac263e5e0ae23ccb6948a80f4e1ae93853949705a6a96d7caac6aab3eefd0fa0');
  // Exact frozen 2a4cf85 factory prefix, ending before night geography. Includes datum, GG waves, body and Fresnel.
  assert.equal(sha(prefix), '5cbf56fc6a52b24dac32a769eb43167bdeffc494821cb7ac70bec303acb0b1b8');
  assert.equal(sha(prefix + legacyGeography), '43e3d61ecab8d38aa78421f27b2b245f9663cc11149b87d09f065f2db072d2ff',
    'retain the original pre-night prefix hash, including frozen legacy geography');
  assert.doesNotMatch(water, /NJ_SHORELINE|LONG_ISLAND|CENTRAL_PARK|MANHATTAN|shoreAt|westShore|eastShore|streetZ|midtown|jerseyCity|treeline/);
  assert.match(emission, /const S = float\(70\.0\)/);
  assert.match(emission, /return city\.mul\(fresnel\)\.mul\(night\)\.mul\(region\)\.mul\(landHit\)/);
  assert.equal(between(emission, '    const region =', '\n    return'), between(baseline, '    const region =', '\n    return'));
  assert.equal(between(water, '  const N =', '  const night =').replaceAll('SF_LAND_BOXES', 'MANHATTAN_BOXES'),
    between(legacyGeography, '  const N =', '  const crossings ='));
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

// Observe production intermediates in this fixture only. No hooks or extra nodes enter the game.
const observedWater = water
  .replace('const tHit = mix(float(8000.0), tIsland, landHit).toVar();',
    'const tHit = mix(float(8000.0), tIsland, landHit).toVar("distance");\n    landHit.toVar("landHit");')
  .replace('  return mat;', '  mat.landBoxes = SF_LAND_BOXES;\n  return mat;');
const numericMaterial = (code, context) => vm.runInNewContext(`${helpers}\n${code}\ncreateWaterMaterial;`, { ...context })();

for (const geography of ['schema', 'actual SF']) test(`${geography}: sea misses are zero, land lights survive, daylight skips work`, () => {
  const cfg = geography === 'schema' ? config : { ...config, ...realConfig };
  const { env, context, arr, reset } = waterTSL(THREE, cfg);
  const before = numericMaterial(oldWater, context), after = numericMaterial(observedWater, context);
  const { minX, maxX, minZ, maxZ, waterLevel: y } = cfg.ISLAND_BOUNDS;
  const z = (minZ + maxZ) / 2;
  const locations = [
    { name: 'west toward land', p: [minX - 500, y, z], dx: 180, hit: true },
    { name: 'east toward land', p: [maxX + 500, y, z], dx: -180, hit: true },
    { name: 'west toward invented shore', p: [minX - 500, y, z], dx: -180, hit: false },
    { name: 'east toward invented shore', p: [maxX + 500, y, z], dx: 180, hit: false },
    { name: 'north open sea', p: [minX - 500, y, minZ - 2000], dx: 180, hit: false },
    { name: 'south open sea', p: [maxX + 500, y, maxZ + 2000], dx: -180, hit: false },
    { name: 'elevated west, no Central Park rim', p: [minX - 500, y + 8, z], dx: -180, hit: false }
  ];
  let positive = 0, tinyPositive = 0, legacyFalseLights = 0;
  for (const glow of [0.24, 0.48, 0.55, 0.550001, 0.78, 0.95, 1.35, 1.38, 0.48]) {
    env.glow = glow;
    for (const footprint of [0.001, 0.02, 1.2]) for (const sample of locations) {
      // Low outward views actually see the legacy short invented-shore facades; high views can look above them.
      env.world = sample.p; env.camera = [sample.p[0] - sample.dx, sample.p[1] + (sample.hit ? 15 : 3), sample.p[2]];
      env.footprint = footprint;
      reset();
      const legacy = arr(before.emissiveNode);
      assert.ok(env.hashes > 0 && env.derivatives > 0, 'legacy fixture executes even by day');
      reset();
      const actual = arr(after.emissiveNode);
      assert.ok(actual.every(Number.isFinite), sample.name);
      assert.deepEqual(env.gates, [{ matched: glow > 0.55, spatial: false }]);
      assert.equal(env.unsafe, 0);
      if (glow <= 0.55) {
        assert.deepEqual(actual, [0, 0, 0]);
        assert.equal(env.hashes, 0); assert.equal(env.derivatives, 0);
      } else {
        assert.equal(env.derivatives, 2, 'hits and misses both evaluate the same two derivatives');
        assert.ok(env.hashes > 0);
        assert.equal(arr(env.variables.landHit)[0], +sample.hit, sample.name);
        const distance = arr(env.variables.distance)[0];
        assert.ok(Number.isFinite(distance) && distance >= 0 && distance < 1e5);
        if (!sample.hit) {
          assert.equal(distance, 8000);
          assert.deepEqual(actual, [0, 0, 0], sample.name);
          if (legacy.some(v => v > 0)) legacyFalseLights++;
        } else if (actual.some(v => v > 0)) {
          positive++;
          if (glow === 0.550001) tinyPositive++;
          // On the schema's low base-height local land, the old night look is exactly the retained appearance.
          if (geography === 'schema') assert.deepEqual(actual, legacy);
        }
      }
    }
  }
  assert.ok(positive >= 24, 'both land-facing waterfront controls keep city sparkle');
  assert.ok(tinyPositive > 0, 'no epsilon cutoff for twilight');
  assert.ok(legacyFalseLights >= 24, 'negative controls reproduce the old imaginary-shore emission');
});

test('empty land proxy and vertical/grazing rays remain finite without derivative branches', () => {
  const cfg = { ...config, getIslandBoundsAtZ: () => ({ westX: 0, eastX: 50 }) };
  const { env, context, arr, reset } = waterTSL(THREE, cfg);
  const material = numericMaterial(observedWater, context);
  assert.equal(material.landBoxes.length, 0);
  env.glow = 1.38;
  // Flat texture slopes expose exactly vertical and axis-parallel rays; variance/filtering is still nonzero.
  env.waveSample = [0, 0, 0.015, 0.2];
  for (const world of [[0, -2.2, 0], [-30000, -2.2, 30000]]) {
    for (const offset of [[0, 15, 0], [180, 0, 0], [0, 0.000001, 180]]) {
      env.world = world; env.camera = world.map((v, i) => v + offset[i]);
      reset();
      assert.deepEqual(arr(material.emissiveNode), [0, 0, 0]);
      assert.equal(arr(env.variables.distance)[0], 8000);
      assert.equal(arr(env.variables.landHit)[0], 0);
      assert.equal(env.derivatives, 2); assert.equal(env.unsafe, 0);
      assert.deepEqual(env.gates, [{ matched: true, spatial: false }]);
    }
  }
});

test('optional frozen 2a4cf85 source/shader size comparison (no device)', t => {
  let frozen;
  try { frozen = execFileSync('git', ['show', '2a4cf85:js/tsl-materials.js'], { cwd: root, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { t.skip('private frozen source unavailable in portable export'); return; }
  const oldFactory = between(frozen, 'function createWaterMaterial()', '/**');
  assert.equal(prefix, oldFactory.slice(0, oldFactory.indexOf('  // Night:')));
  assert.equal(legacyGeography, between(oldFactory, '  // Night:', '  const night ='));
  const NYC = { ...config, ...realConfig, THREE, TSL };
  vm.runInNewContext(frozen, { window: { NYC } });
  const before = NYC.createWaterMaterial(), after = materials.createWaterMaterial();
  t.diagnostic(`factory UTF-8 bytes: ${Buffer.byteLength(oldFactory)} -> ${Buffer.byteLength(water)}`);
  try {
    for (const backend of ['wgsl', 'glsl']) {
      const oldStats = {}, newStats = {};
      const oldShader = build(before, backend, oldStats), newShader = build(after, backend, newStats);
      assert.ok(newShader.length < oldShader.length, 'geographic correction must shrink emitted shader');
      assert.ok(newStats.nodes < oldStats.nodes, 'fewer actual builder graph nodes');
      assert.deepEqual(newStats.bindings, oldStats.bindings, 'no added buffer/texture/sampler bindings');
      t.diagnostic(`${backend} full fragment UTF-8 bytes: ${Buffer.byteLength(oldShader)} -> ${Buffer.byteLength(newShader)}`);
      t.diagnostic(`${backend} builder nodes: ${oldStats.nodes} -> ${newStats.nodes}; bindings unchanged: ${newStats.bindings.join(', ')}`);
    }
  } finally { before.dispose(); after.dispose(); }
});
