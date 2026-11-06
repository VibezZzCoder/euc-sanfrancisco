// CPU-only allocation and exact output controls against the pre-cleanup checkpoint.
// Real local Three geometry/instances/materials; no renderer, browser or GPU.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import geoBox from './helpers/geo-box.cjs';
import landmarksHelper from './helpers/landmarks-build.cjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const history = gitHistory(root, '32039e3456255f67f9399565c5210c265203ca58');
const baselineTest = optionalSourceTest(history.skip);
const baseline = history.read('js/buildings.js');
const current = read('js/buildings.js');
const removedFields = ['waterTowers', 'fireEscapes', 'awnings', 'scaffoldSheds', 'yards'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytes = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const utilsSource = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js')
  .replace(/import \{([^]*?)\} from 'three';/, 'const {$1} = THREE;')
  .replace(/export \{([^]*?)\};/, 'return {$1};');
const utils = vm.runInNewContext(`(function(){${utilsSource}})()`, { THREE });

function meshSnapshot(mesh) {
  const attributes = Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, a]) =>
    [key, [a.itemSize, a.normalized, bytes(a.array)]]));
  const m = mesh.material;
  return {
    name: mesh.name, type: mesh.type, count: mesh.count,
    flags: [mesh.visible, mesh.castShadow, mesh.receiveShadow, mesh.frustumCulled, mesh.renderOrder],
    attributes, index: mesh.geometry.index && bytes(mesh.geometry.index.array),
    matrix: mesh.instanceMatrix && bytes(mesh.instanceMatrix.array.subarray(0, mesh.count * 16)),
    colors: mesh.instanceColor && bytes(mesh.instanceColor.array.subarray(0, mesh.count * 3)),
    ranges: mesh.instanceMatrix?.updateRanges.map(r => ({ ...r })),
    material: [m.type, m.color?.toArray(), m.roughness, m.metalness, m.side, m.transparent, m.opacity, m.depthWrite, m.fog]
  };
}

function build(source, withLandmarkCoverage = false) {
  const allocations = {};
  let canvases = 0, randomCalls = 0;
  const counted = Object.fromEntries(Object.entries(THREE).map(([key, value]) => [key,
    typeof value === 'function' && /^[A-Z]/.test(key) ? new Proxy(value, {
      construct(target, args) {
        allocations[key] = (allocations[key] || 0) + 1;
        return Reflect.construct(target, args);
      }
    }) : value]));
  const NYC = { THREE: counted, TSL, Addons: utils };
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, {
    window: { NYC }, console: { info() {}, warn() {}, log() {} },
    document: { createElement(tag) {
      assert.equal(tag, 'canvas'); canvases++;
      return { getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) };
    } }
  });
  const run = path => vm.runInContext(read(path), context, { filename: path });
  for (const path of ['sf-geodata', 'city-config', 'terrain', 'sf-ride-geometry', 'tsl-materials', 'sf-style', 'sf-buildings']) run(`js/${path}.js`);
  const { readBin } = landmarksHelper;
  const terrain = readBin(new URL(`data/terrain-${geoBox.BOX}.bin`, root));
  NYC.Terrain.load(terrain.header, new Uint16Array(terrain.ab, 0, terrain.header.w * terrain.header.h));
  const data = readBin(new URL(`data/buildings-${geoBox.BOX}.bin`, root)), H = data.header;
  NYC.DATA = { buildings: { header: H, table: new Float32Array(data.ab, 0, H.tableFloats),
    verts: new Float32Array(data.ab, H.tableFloats * 4, H.vertexFloats),
    masses: new Float32Array(data.ab, (H.tableFloats + H.vertexFloats) * 4, H.massFloats) } };
  if (withLandmarkCoverage) {
    // The older shared landmark builder requests retired terrain-region.bin.
    // Build its real XY coverage predicate here using shipped core data and render
    // stubs; landmark mesh/contact validation is outside this building-only fixture.
    const { stub } = landmarksHelper;
    const landmarks = { ...NYC, THREE: stub(), TSL: stub(), Addons: stub(), RideGeometry: undefined,
      createPreWarBuildingMaterial: () => ({ userData: {} }),
      createCurtainWallMaterial: () => ({ userData: {} }) };
    vm.runInNewContext(read('js/landmarks.js'), { window: { NYC: landmarks }, document: stub(), console: context.console });
    landmarks.buildLandmarks(stub());
    assert.equal(typeof landmarks.landmarkCovers, 'function');
    NYC.landmarkCovers = landmarks.landmarkCovers;
  }
  const facadeCalls = [], detailCalls = [], materialCalls = [];
  for (const key of ['createPreWarBuildingMaterial', 'createCurtainWallMaterial']) {
    const create = NYC[key];
    NYC[key] = options => { materialCalls.push([key, digest(options)]); return create(options); };
  }
  const facade = NYC.createFacadeBoxes, details = NYC.buildSFDetailMeshes;
  NYC.createFacadeBoxes = (material, boxes) => { facadeCalls.push(digest(boxes)); return facade(material, boxes); };
  NYC.buildSFDetailMeshes = (group, records) => { detailCalls.push(digest(records)); return details(group, records); };
  vm.runInContext(source, context, { filename: 'buildings.js' });
  const scene = new THREE.Scene();
  const originalRandom = Math.random;
  let seed = 1234567;
  Math.random = () => { randomCalls++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let city;
  try { city = NYC.buildCityBlocks(scene, { sf: true }); }
  finally { Math.random = originalRandom; }
  const snapshots = [];
  const snapshot = () => {
    const meshes = [];
    city.group.traverse(m => { if (m.isMesh && (!m.isInstancedMesh || m.count > 0)) meshes.push(meshSnapshot(m)); });
    return { active: city.getActiveBlockCount(), meshes };
  };
  snapshots.push(snapshot());
  const focuses = [[0, 62], ...Array.from({ length: 32 }, (_, i) => {
    const b = city.allBlocks[Math.floor(i * (city.allBlocks.length - 1) / 31)];
    return [b.cx, b.cz];
  }), [1e6, 1e6]];
  for (const [x, z] of focuses) {
    city.update(x, z, true);
    const before = snapshot(); snapshots.push(before);
    city.update(x + 1, z + 1);
    assert.deepEqual(snapshot(), before, 'sub-18m movement retains the visible prefix');
  }
  // Test-only capacity/tie control: both pools overflow, with a nearer block first
  // and equal-distance blocks retaining insertion order. No production hooks.
  const makeBlock = (cx, offset) => ({ cx, cz: 0, ry: 0.3, waterTowers: [], fireEscapes: [], awnings: [], scaffoldSheds: [],
    cornices: Array.from({ length: 3501 }, (_, i) => ({ x: offset + i, y: 25, z: 3, w: 4, h: 0.8, d: 5 })),
    hvacUnits: Array.from({ length: 801 }, (_, i) => ({ x: offset + i, y: 25, z: 3, w: 4, h: 3, d: 5 })) });
  const blocks = [makeBlock(10, 10000), makeBlock(-10, 20000), makeBlock(0, 0)];
  city.quadtree.queryRange = () => blocks.slice();
  city.update(0, 0, true);
  const saturated = snapshot();
  snapshots.push(saturated);
  const pools = saturated.meshes.slice(-2);
  assert.deepEqual(pools.map(m => m.count), [7000, 1600]);
  const instances = city.group.children.filter(m => m.isInstancedMesh && m.count > 0).slice(-2);
  assert.equal(instances[0].instanceMatrix.array[12], 0, 'nearest block wins');
  assert.equal(instances[0].instanceMatrix.array[3501 * 16 + 12], 10000, 'stable distance ties');
  const counts = {};
  for (const field of removedFields) counts[field] = city.allBlocks.reduce((n, b) => n + (b[field]?.length || 0), 0);
  let matrixBytes = 0, colorBytes = 0, spots = 0, textures = 0;
  const geometries = new Set(), materials = new Set();
  scene.traverse(o => {
    if (o.isSpotLight) { spots++; assert.equal(o.intensity, 0); }
    if (o.instanceMatrix) matrixBytes += o.instanceMatrix.array.byteLength;
    if (o.instanceColor) colorBytes += o.instanceColor.array.byteLength;
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (const m of materials) if (m.map) textures++;
  const result = {
    counts, records: city.allBlocks.length,
    emptyArrays: city.allBlocks.reduce((n, b) => n + removedFields.filter(f => Array.isArray(b[f])).length, 0),
    blocks: digest(city.allBlocks.map(b => Object.fromEntries(Object.entries(b).filter(([key]) => !removedFields.includes(key))))),
    colliders: digest(city.colliders), support: digest(NYC.ride), facadeCalls, detailCalls, materialCalls,
    snapshots, allocations, canvases, spots, textures, matrixBytes, colorBytes, randomCalls,
    updateLights: typeof city.updateLights
  };
  for (const g of geometries) g.dispose();
  for (const m of materials) { m.map?.dispose(); m.dispose(); }
  return result;
}

baselineTest('active SF data: remove only empty allocations, preserve exact visible and physical output', () => {
  assert.equal(geoBox.BOX, 'core', 'this control must exercise the shipped core data');
  const before = build(baseline);
  const after = build(current);
  assert.equal(before.records, 15735);
  assert.deepEqual(before.counts, Object.fromEntries(removedFields.map(f => [f, 0])));
  assert.equal(before.emptyArrays, 78675);
  assert.equal(after.emptyArrays, 0);
  for (const key of ['records', 'counts', 'blocks', 'colliders', 'support', 'facadeCalls', 'detailCalls', 'materialCalls', 'snapshots']) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.equal(before.allocations.InstancedMesh - after.allocations.InstancedMesh, 11);
  assert.equal(before.spots, 28); assert.equal(after.spots, 0);
  assert.equal(before.canvases, 5); assert.equal(after.canvases, 0);
  assert.equal(before.textures, 5); assert.equal(after.textures, 0);
  assert.equal(before.matrixBytes - after.matrixBytes, 682240);
  assert.equal(before.colorBytes - after.colorBytes, 21600);
  assert.equal(after.updateLights, 'undefined');
  assert.ok(before.randomCalls > after.randomCalls, 'UUID allocation changes the shared global RNG offset');
  console.info('Allocation control:', JSON.stringify({ before: before.allocations, after: after.allocations,
    randomCalls: [before.randomCalls, after.randomCalls], matrixBytesSaved: before.matrixBytes - after.matrixBytes,
    colorBytesSaved: before.colorBytes - after.colorBytes, streamedViews: after.snapshots.length }));
});

baselineTest('production landmark exclusions keep exact SF buildings, support and streamed instances', () => {
  const before = build(baseline, true), after = build(current, true);
  assert.ok(before.records < 15735, 'real landmark coverage branch is exercised');
  for (const key of ['records', 'blocks', 'colliders', 'support', 'facadeCalls', 'detailCalls', 'materialCalls', 'snapshots']) {
    assert.deepEqual(after[key], before[key], key);
  }
  console.info(`Landmark-covered fixture: ${after.records} records; ${after.snapshots.length} streamed views match`);
});

baselineTest('active SF mass construction and HVAC shader stay source-exact', () => {
  const massStart = '  function buildSFMasses() {';
  const oldMass = baseline.slice(baseline.indexOf(massStart), baseline.indexOf('\n\n  if (sf) buildSFMasses();'));
  const newMass = current.slice(current.indexOf(massStart), current.indexOf('\n\n  buildSFMasses();'));
  assert.equal(newMass, oldMass.replace(
    'cornices: [], waterTowers: [], hvacUnits: [], fireEscapes: [], awnings: [], scaffoldSheds: [], yards: [],',
    'cornices: [], hvacUnits: [],'));
  const hvac = source => source.slice(source.indexOf('  const hvacMat ='), source.indexOf('  group.add(hvacInst);'));
  // The only intended shader change: slop-newyork d720d3a's box-filtered fan rings and louvre slats
  const filtered = hvac(baseline)
    .replace('    const fanRing = smoothstep(0.025, 0.008, abs(fract(fanDist.mul(16.0)).sub(0.5))).mul(inFanWell);\n',
      '    // slop-newyork d720d3a: average subpixel fan rings and louvre slats instead of letting them shimmer at a distance\n' +
      '    const fanCoord = fanDist.mul(16.0);\n' +
      '    const fanRing = filteredPulse(fract(fanCoord), 0.4835, 0.5165, fwidth(fanCoord)).mul(inFanWell);\n')
    .replace('    const louverSlat = step(0.45, fract(u.y.mul(14.0))).mul(inLouverBox);\n',
      '    const slatCoord = u.y.mul(14.0);\n' +
      '    const louverSlat = filteredPulse(fract(slatCoord), 0.45, 1.0, fwidth(slatCoord)).mul(inLouverBox);\n');
  assert.notEqual(filtered, hvac(baseline));
  assert.equal(hvac(current), filtered);
});

test('visible-prefix control ignores unused capacity but catches drawn changes', () => {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardNodeMaterial(), 2);
  m.count = 1;
  const before = meshSnapshot(m);
  m.setMatrixAt(1, new THREE.Matrix4().makeTranslation(10, 20, 30));
  assert.deepEqual(meshSnapshot(m), before, 'undrawn pool tail is not visible output');
  m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0.001, 0));
  assert.notDeepEqual(meshSnapshot(m), before, 'a 1mm drawn change is detected');
  m.geometry.dispose(); m.material.dispose();
});
