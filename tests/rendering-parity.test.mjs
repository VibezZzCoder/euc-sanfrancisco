// Real pinned Three CPU geometry/shader builders + independent pre-port SF execution.
// No browser, renderer/device, geographic regeneration or runtime hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import numericTSL from './helpers/rendering-tsl.cjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const source = Object.fromEntries(['pedestrians', 'actor-models', 'road-paint'].map(name => [name, read(`js/${name}.js`)]));
const hashes = {
  pedestrians: '2fd50c5478fef71ed249254a13791b0a05995b7a1c4d6731640e3d8b23948a9c',
  'actor-models': 'c60a82298a752e8550ff381632d1ae3da5e6a730587d7d3184e05aad631e3871',
  'road-paint': '12b2f568ac0b709cceb379b148149d213abf9132aa4ddee79e26a4580484242b'
};
const history = process.env.SF_RENDERING_BASELINE ? null : gitHistory(root, '2360827dd517d9b7d4ab58fea76e9bd95a12dc6c');
const baseline = process.env.SF_RENDERING_BASELINE || history.available
  ? Object.fromEntries(Object.keys(source).map(name => [name, process.env.SF_RENDERING_BASELINE
    ? readFileSync(`${process.env.SF_RENDERING_BASELINE}/${name}.js`, 'utf8')
    : history.read(`js/${name}.js`)])) : null;
if (baseline) for (const [name, code] of Object.entries(baseline)) assert.equal(sha(code), hashes[name], `pinned SF oracle ${name}`);
const differential = { skip: !baseline && 'No pinned SF history; set SF_RENDERING_BASELINE to a directory with the three original JS files' };
const utilsSource = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js')
  .replace(/import \{([^]*?)\} from 'three';/, 'const {$1} = THREE;').replace(/export \{([^]*?)\};/, 'return {$1};');
const Addons = vm.runInNewContext(`(function(){${utilsSource}})()`, { THREE });
function load(code, numeric = null, extra = {}) {
  const nodes = numeric?.tsl ?? TSL;
  const namespace = { THREE: numeric ? { ...THREE, MeshStandardNodeMaterial: class { constructor(options) { this.userData = {}; Object.assign(this, options); } } } : THREE,
    TSL: nodes, Addons, cityUniforms: { uInteriorGlow: nodes.float(.8) }, ...extra };
  vm.runInNewContext(code, { window: { NYC: namespace }, console, Math });
  return Object.assign(namespace, numeric);
}
const actors = load(source['actor-models']);
const people = load(source.pedestrians);
const attrs = (g, i) => Object.fromEntries(Object.entries(g.attributes).map(([key, a]) => [key, Array.from(a.array.slice(i * a.itemSize, (i + 1) * a.itemSize))]));
const interpolate = (values, weights) => values[0].map((_, i) => Math.fround(values.reduce((sum, v, k) => sum + weights[k] * v[i], 0)));
function surface(module, material, attributes, snapshots = new Map()) {
  module.state.epoch++;
  Object.assign(module.state, { attrs: attributes, snapshots, stage: 'fragment', fragmentSin: 0, branches: 0, derivatives: 0 });
  const result = [...material.colorNode.eval(), ...material.roughnessNode.eval()];
  if (material.metalnessNode) result.push(...material.metalnessNode.eval());
  assert.ok(result.every(Number.isFinite));
  return result;
}
function raster(module, material, vertices, weights) {
  const maps = vertices.map(a => { surface(module, material, a); return module.state.snapshots; });
  const a = Object.fromEntries(Object.keys(vertices[0]).map(k => [k, interpolate(vertices.map(v => v[k]), weights)]));
  const samples = new Map();
  for (const [node, value] of maps[0]) samples.set(node, node.interpolation === 'flat' ? value : interpolate(maps.map(m => m.get(node)), weights));
  return surface(module, material, a, samples);
}
function close(actual, expected, label) {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 2e-6, `${label} channel ${i}: ${v} != ${expected[i]}`));
}

test('pedestrian shader port retains geometry, PBO and non-gait CPU bytes; gait has a separate exact differential', differential, () => {
  // Later allocation work changes only PersonRig.update; its exact state/pose replay lives in
  // pedestrian-allocation-pressure.test.mjs. Keep the original shader oracle and freeze every other CPU byte.
  const withoutGait = s => {
    const start = s.indexOf('  update(dt, x, z, heading, ground, owner = null, air = 0, updatePose = true) {');
    const end = s.indexOf('\n  setPelvisRotation() {', start);
    assert.ok(start >= 0 && end > start, 'exact gait source boundaries');
    return s.slice(0, start) + '  /* separately verified gait */\n' + s.slice(end);
  };
  const region = source => {
    const s = withoutGait(source);
    return [s.slice(s.indexOf('const { mergeGeometries }'), s.indexOf('/**\n * Material for one crowd mesh.')),
      s.slice(s.indexOf('// 4. CROWD:'))];
  };
  assert.deepEqual(region(source.pedestrians), region(baseline.pedestrians));
  const position = s => s.slice(s.indexOf('  mat.positionNode = Fn('), s.indexOf('\n  // NYC @', s.indexOf('function createPersonMaterial')));
  assert.equal(position(source.pedestrians), position(baseline.pedestrians), 'skinning/shadow deformation unchanged');
});

test('both pedestrian LOD triangle interiors and detail boundaries match pre-port SF', differential, t => {
  const current = load(source.pedestrians, numericTSL()), old = load(baseline.pedestrians, numericTSL());
  const a = current.tsl.attributeArray(62), b = old.tsl.attributeArray(62);
  const after = current.createPersonMaterial(a), before = old.createPersonMaterial(b);
  current.state.instance = old.state.instance = 1;
  let count = 0, oldSines = 0, newSines = 0;
  const check = (vertices, weights) => {
    const actual = raster(current, after, vertices, weights);
    const part = vertices[0].skin[3];
    assert.equal(current.state.fragmentSin, part >= 6 ? 1 : 0);
    assert.equal(current.state.branches, 1);
    newSines += current.state.fragmentSin;
    close(actual, raster(old, before, vertices, weights), `person sample ${count}`);
    oldSines += old.state.fragmentSin;
    count++;
  };
  for (const detail of [1, 0]) {
    const g = people.buildPersonGeometry(detail);
    for (let i = 0; i < g.index.count; i += 3) {
      const parts = [0, 1, 2].map(k => g.attributes.skin.getW(g.index.getX(i + k)));
      assert.equal(parts[0], parts[1]); assert.equal(parts[1], parts[2]);
    }
    for (const [seed, female] of [[.13, 0], [1.1, 1], [4.2, 0], [9.7, 1]]) {
      for (const storage of [a, b]) storage.value.array.set([seed, female, 1.08, .85], 124 + 120);
      for (let i = 0; i < g.index.count; i += 69) {
        const vertices = [0, 1, 2].map(k => attrs(g, g.index.getX(i + k)));
        for (const weights of [[.23, .41, .36], [.001, .498, .501]]) check(vertices, weights);
      }
      for (const [part, x, y, z, along] of [
        [0, 0, .88, .08, 0], [0, 0, .955, .08, 0], [0, 0, 1, .08, 0], [0, .02, 1.4, .09, 0],
        [0, .03, 1.4, .09, 0], [0, 0, 1.48, .09, 0], [0, 0, 1.49, .09, 0], [0, 0, 1.5, .09, 0],
        [1, .09, .6, .04, 0], [1, .095, .6, -.04, 0], [2, .09, .016, .03, 0], [2, .09, .024, .03, 0],
        [2, .09, .08, .0335, 0], [3, .21, .98, .02, .93], [3, .21, .98, .02, .945], [3, .21, .98, .02, .96],
        [4, .24, .8, .01, .4], [5, .031, 1.627, .09, 0], [5, .031, 1.646, .09, 0], [5, 0, 1.549, .09, 0],
        [5, .02, 1.675, .09, 0], [6, .03, 1.75, .02, 0], [6, .03, 1.76, .02, 0], [7, .07, 1.4, -.06, 0]
      ]) {
        const v = { position: [x, y, z], skin: [0, 0, 0, part], extra: [0, 0, along] };
        check([v, v, v], [1, 0, 0]);
      }
    }
  }
  t.diagnostic(`${count} Float32/interpolated samples; numerical fragment sin calls ${oldSines} -> ${newSines} (not GPU instruction counts)`);
});

test('dedicated wheels preserve SF alloy, valve, tread and PBR at every vertex and triangle centre', differential, t => {
  const current = load(source['actor-models'], numericTSL()), old = load(baseline['actor-models'], numericTSL());
  let count = 0, oldDerivatives = 0;
  for (const kind of ['sedan', 'taxi', 'suv', 'van']) {
    const spec = current.BODY_SPECS[kind];
    const before = old.createLoftedCarMaterial(old.BODY_SPECS[kind], 0xffbe14), after = current.createCarWheelMaterial(spec.wheelRadius);
    for (const side of [-1, 1]) {
      const g = actors.buildSteerableWheelGeo(actors.BODY_SPECS[kind], side);
      const check = attributes => {
        close(surface(current, after, attributes), surface(old, before, attributes), `wheel ${kind}/${side}/${count}`);
        assert.equal(current.state.derivatives, 0);
        oldDerivatives += old.state.derivatives;
        assert.ok(before.emissiveNode.eval().every(v => v === 0), 'old centred wheels have no lamp/sign emission');
        count++;
      };
      for (let i = 0; i < g.attributes.position.count; i++) check(attrs(g, i));
      const n = g.index?.count ?? g.attributes.position.count;
      for (let i = 0; i < n; i += 3) {
        const v = [0, 1, 2].map(k => attrs(g, g.index ? g.index.getX(i + k) : i + k));
        check(Object.fromEntries(Object.keys(v[0]).map(key => [key, interpolate(v.map(a => a[key]), [1 / 3, 1 / 3, 1 / 3])])));
      }
      g.dispose();
    }
  }
  assert.ok(oldDerivatives > 0, 'baseline control really executes body derivatives');
  t.diagnostic(`${count} wheel samples; old numerical derivatives ${oldDerivatives}, dedicated wheel 0`);
});

function build(mesh, backend) {
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
  const builder = new (backend === 'wgsl' ? THREE.WGSLNodeBuilder : THREE.GLSLNodeBuilder)(mesh, renderer);
  builder.scene = new THREE.Scene(); builder.camera = new THREE.PerspectiveCamera(); builder.build();
  assert.doesNotMatch(builder.vertexShader + builder.fragmentShader, /NaN|undefined/);
  return builder;
}

for (const backend of ['wgsl', 'glsl']) test(`${backend}: wheel PBR/instanced/shadow graphs and crowd shader counters`, t => {
  const wheel = actors.createCarWheelMaterial();
  assert.equal(actors.createCarWheelMaterial(), wheel);
  assert.equal(wheel.envMapIntensity, 1); assert.equal(wheel.fog, true); assert.equal(wheel.emissiveNode, null);
  const geometry = actors.buildSteerableWheelGeo(actors.BODY_SPECS.sedan, -1);
  const mesh = new THREE.InstancedMesh(geometry, wheel, 2);
  mesh.castShadow = mesh.receiveShadow = true;
  build(mesh, backend);
  const material = new THREE.MeshBasicNodeMaterial();
  const isolated = m => { material.fragmentNode = TSL.vec4(m.colorNode.add(m.roughnessNode).add(m.metalnessNode).add(m.emissiveNode ?? TSL.vec3(0)), 1);
    return build(new THREE.Mesh(geometry, material), backend).fragmentShader; };
  const old = isolated(actors.createLoftedCarMaterial(actors.BODY_SPECS.sedan, 0xffbe14));
  const current = isolated(wheel);
  assert.doesNotMatch(current, /fwidth\(|sin\(/);
  assert.match(old, /fwidth\(/);
  assert.ok(current.length < old.length / 2, 'remove full body/sign/glass graph, not just its final colour');
  t.diagnostic(`wheel isolated all-channel shader chars ${old.length} -> ${current.length}; fwidth calls ${(old.match(/fwidth\(/g) ?? []).length} -> 0`);
  // Native depth override uses the same geometry; no wheel color graph in shadow-only passes.
  const depth = new THREE.MeshBasicNodeMaterial(); depth.fragmentNode = TSL.vec4(1);
  const shadow = build(new THREE.InstancedMesh(geometry, depth, 2), backend);
  assert.doesNotMatch(shadow.fragmentShader, /fwidth\(/);
  if (baseline) {
    const oldPeople = load(baseline.pedestrians);
    for (const detail of [1, 0]) {
      const emit = city => {
        const pose = TSL.attributeArray(62, 'vec4').setPBO(true).toReadOnly();
        const m = new THREE.Mesh(city.buildPersonGeometry(detail), city.createPersonMaterial(pose)); m.count = 2;
        return build(m, backend);
      };
      const a = emit(oldPeople), b = emit(people);
      const count = shader => (shader.match(/sin\(/g) ?? []).length;
      assert.equal(count(b.fragmentShader), 1, 'only hair strands remain in fragment stage');
      assert.ok(count(a.fragmentShader) > count(b.fragmentShader));
      t.diagnostic(`crowd LOD${detail} shader chars vertex ${a.vertexShader.length} -> ${b.vertexShader.length}, fragment ${a.fragmentShader.length} -> ${b.fragmentShader.length}; fragment sin ${count(a.fragmentShader)} -> ${count(b.fragmentShader)}`);
      const pose = TSL.attributeArray(62, 'vec4').setPBO(true).toReadOnly();
      const personMaterial = people.createPersonMaterial(pose);
      const shadowMaterial = new THREE.MeshBasicNodeMaterial();
      shadowMaterial.positionNode = personMaterial.positionNode;
      shadowMaterial.fragmentNode = TSL.vec4(1);
      const shadowMesh = new THREE.Mesh(people.buildPersonGeometry(detail), shadowMaterial); shadowMesh.count = 2;
      const shadowBuild = build(shadowMesh, backend);
      assert.doesNotMatch(shadowBuild.vertexShader + shadowBuild.fragmentShader, /43758\.5453|vPersonPart|vPersonSkin/,
        'position-only shadow graph retains skinning without palette/style work');
      shadowMaterial.dispose(); personMaterial.dispose();
    }
  }
  geometry.dispose(); material.dispose(); depth.dispose();
});

const terrain = { loaded: true, groundAt: (x, z) => 120 + x * .13 - z * .29 + Math.sin(x * .03) * 4,
  normalAt(x, z, out) { out.x = -.13; out.y = 1; out.z = .29; } };
function paintFixture(code) {
  const network = { edges: [] };
  const geo = { bikeways: [], rail: [], transit: [] };
  for (const [id, x, z] of [[0, -2402, -1202], [2, -2, -2], [4, 1198, 1198], [6, 3600, -2400]]) {
    const from = { id, signal: true }, to = { id: id + 1, stop: true };
    network.edges.push({ from, to, sx: x, sz: z, dx: 1, dz: 0, rx: 0, rz: -1, len: 80, half: 10, lanes: [-1.8, 1.8], stop: true });
    geo.bikeways.push({ pts: [x, z, x + 80, z], cls: 2, side: 0, buffered: true });
    geo.rail.push({ pts: [x - 5, z - 4, x + 85, z + 4] });
    geo.transit.push({ kind: 'cablecar', pts: [x - 5, z - 4, x + 85, z + 4] });
  }
  const city = load(code, null, { Terrain: terrain, GEO: geo, CURB_H: .15, CROSSWALK: 3.5,
    blockAt: (x, z) => Math.abs(z % 1200) > 8,
    createRoadPaintMaterial: () => new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, vertexColors: true }) });
  return { city, network };
}
function triangles(group) {
  const result = [];
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    for (let i = 0; i < g.index.count; i += 3) result.push(JSON.stringify([0, 1, 2].map(k => attrs(g, g.index.getX(i + k)))));
  });
  return result;
}
test('ordered paint retains every original triangle and bounds full shader widening', differential, () => {
  const a = paintFixture(source['road-paint']), b = paintFixture(baseline['road-paint']);
  const scene = new THREE.Scene();
  const old = b.city.buildRoadPaint(scene, b.network), mesh = a.city.buildRoadPaint(scene, a.network);
  assert.ok(mesh.isMesh);
  assert.deepEqual(triangles(mesh), triangles(old), 'ordered primitive stream, drape, normals and dash phase');
  assert.equal(mesh.receiveShadow, true); assert.equal(mesh.castShadow, false); assert.equal(mesh.renderOrder, -1);
  assert.equal(mesh.frustumCulled, true);
  const g = mesh.geometry, p = new THREE.Vector3();
  let escapesOriginal = 0;
  old.geometry.computeBoundingBox(); old.geometry.computeBoundingSphere();
  for (let i = 0; i < g.attributes.position.count; i++) for (const widen of [1, 2, 8, 16]) {
    p.fromBufferAttribute(g.attributes.position, i);
    p.x += g.attributes.side.getX(i) * (widen - 1); p.z += g.attributes.side.getY(i) * (widen - 1);
    assert.ok(g.boundingBox.containsPoint(p) && g.boundingSphere.containsPoint(p), `expanded vertex ${i} at ${widen}x`);
    if (!old.geometry.boundingBox.containsPoint(p)) escapesOriginal++;
  }
  assert.ok(escapesOriginal > 0, 'negative control: unexpanded bounds can exclude drawn ribbon');
  mesh.geometry.dispose(); mesh.material.dispose(); old.geometry.dispose(); old.material.dispose();
});

for (const backend of ['wgsl', 'glsl']) test(`${backend}: actual SF paint material retains all output/deformation channels`, () => {
  const city = load(read('js/tsl-materials.js'), null, {
    Terrain: { loaded: true, heights: new Float32Array([120, 121, 122, 123]), w: 2, h: 2, originX: 0, originZ: 0, cell: 2 }
  });
  const { city: fixture, network } = paintFixture(source['road-paint']);
  const mesh = fixture.buildRoadPaint(new THREE.Scene(), network);
  const material = city.createRoadPaintMaterial();
  assert.equal(material.transparent, true); assert.equal(material.depthWrite, false); assert.equal(material.vertexColors, true);
  assert.equal(material.fog, true); assert.ok(material.mrtNode?.isNode);
  for (const name of ['colorNode', 'roughnessNode', 'aoNode', 'opacityNode', 'positionNode']) assert.ok(material[name]?.isNode, name);
  mesh.material.dispose(); mesh.material = material;
  const result = build(mesh, backend);
  assert.match(result.vertexShader, /16\.0/); assert.match(result.fragmentShader, /fwidth\(/);
  mesh.geometry.dispose();
  material.dispose();
});
