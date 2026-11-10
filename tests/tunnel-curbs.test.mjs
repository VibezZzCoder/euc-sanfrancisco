// CPU-only actual-core and independent drawn/support controls. No renderer, browser or production test hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { drawing, release, crop } from './helpers/terrain-hitch-fixture.mjs';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(`js/${name}.js`, root), 'utf8');
const source = Object.fromEntries(['sf-geodata', 'city-config', 'terrain', 'road-network', 'drape',
  'sf-ride-geometry', 'grade-separation', 'terrain-mesh', 'sf-ground'].map(name => [name, read(name)]));
const history = gitHistory(root, '67f0686');
const baselineTest = optionalSourceTest(history.skip);
const baseline = history.read('js/sf-ground.js');
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const material = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const overlap = (a, b) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
const bounds = points => ({ minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
  minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) });
const block = (x, z, size = 4, park = 0) => ({ minX: x, maxX: x + size, minZ: z, maxZ: z + size, park,
  poly: [{ x, z }, { x, z: z + size }, { x: x + size, z: z + size }, { x: x + size, z }] });
const curbMeshes = city => city.group.children.filter(m => /^SFCurb|^SFPark/.test(m.name));
const scenes = [];

// Reconstruct only the two pre-broadphase loops in memory. No alternate geometry/clipping implementation:
// the same current grade, Drape, Float64 intersection kernel, upload and support registration run on both sides.
const beforeTerrain = source['terrain-mesh'].replace(
  /    \/\/ Chunk-local candidate scratch,[\s\S]*?(?=    const stride = n \+ 3;)/,
  `    const face = cuts.length ? (a, b, c) => clipTerrainFace(a, b, c, cuts, pos, nrm, idx)
      : (a, b, c) => {
        const at = idx.length;
        idx.array[at] = a; idx.array[at + 1] = b; idx.array[at + 2] = c; idx.length = at + 3;
      };
`);
const beforeGround = source['sf-ground'].replace(/function clipCurbFaces\(out, cuts\) \{[\s\S]*?(?=\n\/\/ Move an appended block)/,
  `function clipCurbFaces(out, cuts) {
  const buffer = array => ({ array, get length() { return array.length; }, push(x, y, z) { array.push(x, y, z); } });
  const pos = buffer(out.pos), nrm = buffer(out.nrm), idx = [], local = [];
  for (let i = 0; i < out.idx.length; i += 3) {
    const a = out.idx[i], b = out.idx[i + 1], c = out.idx[i + 2], p = out.pos;
    const minX = Math.min(p[a * 3], p[b * 3], p[c * 3]), maxX = Math.max(p[a * 3], p[b * 3], p[c * 3]);
    const minZ = Math.min(p[a * 3 + 2], p[b * 3 + 2], p[c * 3 + 2]), maxZ = Math.max(p[a * 3 + 2], p[b * 3 + 2], p[c * 3 + 2]);
    local.length = 0;
    for (const cut of cuts) {
      if (cut.maxX < minX || cut.minX > maxX || cut.maxZ < minZ || cut.minZ > maxZ) continue;
      // Most overlapping XZ faces are the intact upper hill/sidewalk. Reject them without allocating clip vertices.
      let separated = false;
      for (const q of cut.planes) {
        if (q[0] * p[a * 3] + q[1] * p[a * 3 + 1] + q[2] * p[a * 3 + 2] + q[3] <= 0 &&
            q[0] * p[b * 3] + q[1] * p[b * 3 + 1] + q[2] * p[b * 3 + 2] + q[3] <= 0 &&
            q[0] * p[c * 3] + q[1] * p[c * 3 + 1] + q[2] * p[c * 3 + 2] + q[3] <= 0) { separated = true; break; }
      }
      if (!separated) local.push(cut);
    }
    if (local.length) window.NYC.clipTerrainFace(a, b, c, local, pos, nrm, idx, true);
    else idx.push(a, b, c);
  }
  out.idx = idx;
}
`);

function realm(N) {
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: N }, console: { info() {} }, URLSearchParams, location: { search: '' } });
  return (name, text = source[name]) => vm.runInContext(text, context, { filename: `js/${name}.js` });
}

let cachedWorld;
function world() {
  if (cachedWorld) return cachedWorld;
  const started = performance.now();
  const N = { THREE, DEBUG_ROADS: false, createRoadSurfaceMaterial: material, createMarbleAshlarMaterial: material };
  const load = realm(N);
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'road-network', 'sf-ride-geometry', 'grade-separation']) load(name);
  const b = readFileSync(new URL('data/terrain-core.bin', root)), n = b.readUInt32LE(4);
  N.Terrain.load(JSON.parse(b.toString('utf8', 8, 8 + n)), new Uint16Array(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length)));
  N.Terrain.patchesEnabled = false;
  const net = N.buildRoadNetwork(N.BLOCKS.map(block => ({ ...block, block })), []);
  const scene = new THREE.Group(), grade = N.buildGradeSeparation(scene, net);
  scenes.push(scene);
  // All actual blocks overlapping any bore, plus remote controls. This is not a full-city rebuild or obstacle fixture.
  const blocks = N.BLOCKS.filter(b => grade.terrainCuts.some(c => overlap(b, c)));
  blocks.push(...N.BLOCKS.filter(b => b.poly.length >= 3 && !grade.terrainCuts.some(c => overlap(b, c))).slice(0, 3));
  return cachedWorld = { N, grade, blocks, setupMs: performance.now() - started };
}

function setup({ terrain, blocks, old = false, pier = true, groundSource = source['sf-ground'], terrainSource = source['terrain-mesh'] }) {
  const N = { THREE, Terrain: terrain, BLOCKS: blocks, CURB_H: .15,
    WATERFRONT_PIERS: pier ? [{ ring: block(2200, -1000).poly }] : [], GEO: { box: { name: 'CPU curb fixture' }, landmarks: {} },
    Addons: { mergeGeometries: geometries => { assert.equal(geometries.length, 1); return geometries[0]; } },
    createWaterMaterial: material, createSidewalkMaterial: material, createCurbMaterial: material, createParkLawnMaterial: material };
  const load = realm(N);
  load('sf-ride-geometry'); load('drape'); load('terrain-mesh', terrainSource);
  N.buildTerrainMesh = () => ({}); // Independently tested terrain drawing; this fixture isolates actual curb construction.
  load('sf-ground', old ? baseline : groundSource);
  const scene = new THREE.Group(); scenes.push(scene);
  return { N, scene };
}

// Draped facets are registered as packed batches (2026-11-09, phone memory); compare their exact plain records.
const expanded = N => ({ ...N.ride, tops: N.RideGeometry.expandTops(N.ride.tops) });
function marker(N, x) { return N.RideGeometry.addTop(block(x, 5000).poly, 100, 'wood'); }
function actual(old, clipped, options = {}) {
  const w = world(), f = setup({ terrain: { ...w.N.Terrain, patches: w.N.Terrain.patches.slice() }, blocks: w.blocks, old, ...options });
  const before = marker(f.N, 5000), started = performance.now();
  const city = f.N.buildSFGround(f.scene, { deferCurbSurfaces: true });
  if (!old) assert.equal(curbMeshes(city).length, 0, 'metadata precedes Drape assembly');
  assert.equal(city.sidewalks.length, (options.blocks || w.blocks).filter(b => b.poly.length >= 3).length);
  const middle = marker(f.N, 5010), gradeStart = f.N.ride.tops.length;
  for (const top of w.N.ride.tops) f.N.ride.tops.push(top);
  const last = marker(f.N, 5020), registry = f.N.ride.tops;
  if (!old) city.finishCurbSurfaces(clipped ? w.grade.terrainCuts : [], gradeStart);
  assert.equal(f.N.ride.tops, registry, 'registry identity is preserved');
  assert.equal(registry[0], before); assert.equal(registry.at(-1), last);
  assert.ok(registry.indexOf(middle) < registry.indexOf(w.N.ride.tops[0]), 'later construction remains in source order');
  const groundTops = registry.slice(1, registry.indexOf(middle) - 1); // Exclude the one pier top after all curb tops.
  assert.equal(registry[registry.indexOf(middle) - 1].shore, true, 'curb tops retain their original position before piers');
  const count = registry.length, children = city.group.children.slice();
  city.finishCurbSurfaces?.(w.grade.terrainCuts, gradeStart);
  assert.equal(registry.length, count, 'finishing is one-shot');
  assert.deepEqual(city.group.children, children);
  city.group.updateMatrixWorld(true);
  return { ...f, city, groundTops, buildMs: performance.now() - started };
}

function sameDrawing(a, b) {
  assert.deepEqual(a.group.children.map(m => m.name), b.group.children.map(m => m.name), 'original draw ordering');
  for (let i = 0; i < a.group.children.length; i++) {
    const x = a.group.children[i], y = b.group.children[i];
    for (const key of ['position', 'normal', 'uv', 'index']) {
      const p = key === 'index' ? x.geometry.index : x.geometry.attributes[key];
      const q = key === 'index' ? y.geometry.index : y.geometry.attributes[key];
      if (!p) { assert.equal(q, p); continue; }
      assert.equal(p.array.constructor, q.array.constructor);
      assert.ok(bytes(p.array).equals(bytes(q.array)), `${x.name}/${key}: unchanged ordered bytes`);
    }
    assert.deepEqual(x.geometry.boundingSphere, y.geometry.boundingSphere);
    assert.deepEqual(x.geometry.boundingBox, y.geometry.boundingBox);
    for (const key of ['castShadow', 'receiveShadow', 'frustumCulled']) assert.equal(x[key], y[key]);
  }
}

let pair;
function fixtures() {
  return pair ??= { old: history.available ? actual(true, false) : null, deferred: actual(false, false), clipped: actual(false, true) };
}
baselineTest('actual core controls: deferred no-cut geometry and complete support order match committed immediate ground', t => {
  const { old, deferred, clipped } = fixtures();
  sameDrawing(old.city, deferred.city);
  assert.equal(JSON.stringify(old.N.ride), JSON.stringify(expanded(deferred.N)), 'support planes, metadata, bodies and source-order ties');
  t.diagnostic(JSON.stringify({ scope: 'core DEM + actual curb polygons, no building obstacles or renderer', blocks: world().blocks.length,
    cuts: world().grade.terrainCuts.length, setupMs: world().setupMs, oldBuildMs: old.buildMs, deferredBuildMs: deferred.buildMs,
    clippedBuildMs: clipped.buildMs, gradeSHA256: sha(source['grade-separation']), groundSHA256: sha(source['sf-ground']) }));
});

// Independent Three Plane/Line3 intersection check, slightly inside each cavity face to exclude upload round-off.
// It reads drawn triangles, not the production clipping output/scratch or a shared clipping helper.
function interior(points, cut) {
  let polygon = points;
  for (const coeff of cut.planes) {
    const plane = new THREE.Plane(new THREE.Vector3(...coeff.slice(0, 3)), coeff[3]).normalize();
    plane.constant -= .00015;
    const next = [];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i], da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if ((da < 0) !== (db < 0)) next.push(plane.intersectLine(new THREE.Line3(a, b), new THREE.Vector3()));
      if (db >= 0) next.push(b);
    }
    polygon = next;
    if (polygon.length < 3) return [];
  }
  return polygon;
}

function cavityPieces(meshes) {
  const w = world(), found = [];
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const triangle = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, idx[i + j])), b = bounds(triangle);
      for (const cut of w.grade.terrainCuts) {
        if (!overlap(b, cut)) continue;
        const polygon = interior(triangle, cut);
        for (let j = 1; j + 1 < polygon.length; j++) {
          const tri = new THREE.Triangle(polygon[0], polygon[j], polygon[j + 1]);
          if (tri.getArea() < 1e-7) continue;
          const point = tri.getMidpoint(new THREE.Vector3()), floor = w.grade.floorAt(point.x, point.z, -10000);
          if (floor !== null && point.y > floor + .0003) found.push({ point, floor, mesh: mesh.name });
        }
      }
    }
  }
  return found;
}

function rayAt(meshes, point, distance = .004) {
  return new THREE.Raycaster(new THREE.Vector3(point.x, point.y + distance / 2, point.z), new THREE.Vector3(0, -1, 0),
    0, distance).intersectObjects(meshes, false);
}

baselineTest('actual Broadway: uncut control intrudes; final drawn curb faces and registered tops leave the above-floor cavity clear', t => {
  const { old, clipped } = fixtures();
  const bad = cavityPieces(curbMeshes(old.city)), remaining = cavityPieces(curbMeshes(clipped.city));
  assert.ok(bad.some(p => p.mesh === 'SFCurbIslands' && p.point.x < -600), 'non-vacuous Broadway sidewalk control');
  assert.ok(bad.some(p => p.mesh === 'SFCurbs'), 'non-vacuous curb-face control');
  assert.equal(remaining.length, 0, `no drawn surface remains inside a cut above the supported bore floor: ${JSON.stringify(remaining.slice(0, 3))}`);
  const before = new SfTerrainSampler({ terrain: null, ride: { tops: old.groundTops, solids: [], prisms: [] } });
  const after = new SfTerrainSampler({ terrain: null, ride: { tops: clipped.groundTops, solids: [], prisms: [] } });
  const points = bad.filter(p => p.mesh === 'SFCurbIslands').slice(0, 40);
  for (const { point, floor } of points) {
    assert.ok(rayAt(curbMeshes(old.city), point).length, 'independent old drawing ray hits the offending sidewalk');
    assert.equal(rayAt(curbMeshes(clipped.city), point).length, 0, 'independent final drawing ray is clear');
    assert.ok(Math.abs(before.sampleGround(point.x, point.z, { normal: {} }, point.y).height - point.y) < .0002);
    assert.ok(after.sampleGround(point.x, point.z, { normal: {} }, point.y).height <= floor + .0003, 'no stale original ride top');
  }
  t.diagnostic(JSON.stringify({ uncutInteriorPieces: bad.length, remaining: remaining.length, drawnAndNativeProbes: points.length }));
});

baselineTest('actual clipped batches keep original vertex/normal bytes and ordered uncut triangles, including upper sides', () => {
  const { old, clipped } = fixtures(), a = curbMeshes(old.city), b = curbMeshes(clipped.city), cuts = world().grade.terrainCuts;
  let untouched = 0, upper = 0, added = 0;
  for (let m = 0; m < a.length; m++) {
    const original = a[m].geometry, final = b[m].geometry;
    for (const key of ['position', 'normal']) {
      const x = original.attributes[key].array, y = final.attributes[key].array;
      assert.ok(bytes(x).equals(bytes(y.subarray(0, x.length))), `${a[m].name}: original ${key} prefix is exact`);
      assert.ok(y.every(Number.isFinite));
    }
    added += final.attributes.position.count - original.attributes.position.count;
    const indices = new Set();
    for (let i = 0; i < final.index.count; i += 3) indices.add(Array.from(final.index.array.subarray(i, i + 3)).join(','));
    for (let i = 0; i < original.index.count; i += 3) {
      const ids = Array.from(original.index.array.subarray(i, i + 3));
      const points = ids.map(k => new THREE.Vector3().fromBufferAttribute(original.attributes.position, k));
      const box = bounds(points), local = cuts.filter(c => overlap(box, c));
      const above = local.length && local.every(c => c.planes.some(p => p[1] < 0 && points.every(v => p[0] * v.x + p[1] * v.y + p[2] * v.z + p[3] < -.001)));
      if (!local.length || above) {
        assert.ok(indices.has(ids.join(',')), 'outside/upper triangle remains exact'); untouched++; upper += !!above;
      }
    }
  }
  assert.ok(added > 0 && untouched > 1000 && upper > 100, 'real intersections and retained upper/distant controls');
});

const flatTerrain = (groundAt = () => 10) => ({ waterLevel: 0, patches: [], groundAt,
  normalAt: (_x, _z, out) => Object.assign(out, { x: 0, y: 1, z: 0 }) });
const boxCut = (x, z, size, roof) => ({ minX: x, maxX: x + size, minZ: z, maxZ: z + size,
  planes: [[1, 0, 0, -x], [-1, 0, 0, x + size], [0, 0, 1, -z], [0, 0, -1, z + size], [0, -1, 0, roof]] });

test('bounded sloped floor keeps below-floor approaches, upper surfaces and off-cavity triangles; registration is final-only', () => {
  const f = setup({ terrain: flatTerrain(x => x >= 20 && x < 30 ? 8 : x >= 10 && x < 20 ? 20 : 10),
    blocks: [block(0, 0), block(10, 0), block(20, 0), block(100, 0, 4, 1)], pier: false });
  const city = f.N.buildSFGround(f.scene, { deferCurbSurfaces: true }), start = f.N.ride.tops.length;
  assert.equal(start, 0, 'no obsolete uncut support is registered');
  for (const x of [0, 10, 20]) f.N.RideGeometry.addTop(block(x, 0).poly, 11, 'pavement', {
    layered: true, replacesTerrain: true, maxReferenceY: 25,
    plane: x === 0 ? { x: 0, y: 9, z: 0, dx: .5, dz: 0 } : undefined
  });
  const floorRecords = f.N.ride.tops.slice(), cuts = [0, 10, 20].map(x => boxCut(x, 0, 4, 15));
  let calls = 0;
  const clip = f.N.clipTerrainFace;
  f.N.clipTerrainFace = (a, b, c, local, pos, ...args) => {
    const points = [a, b, c].map(i => ({ x: pos.array[i * 3], z: pos.array[i * 3 + 2] })), box = bounds(points);
    assert.ok(local.every(c => overlap(box, c)), 'triangle AABB rejection precedes the clipping kernel');
    assert.ok(box.maxX < 30, 'remote triangles in the same 512 m batch never reach the kernel');
    calls++; return clip(a, b, c, local, pos, ...args);
  };
  city.finishCurbSurfaces(cuts, start); city.group.updateMatrixWorld(true);
  assert.ok(calls > 0);
  const meshes = curbMeshes(city), tops = f.N.ride.tops;
  assert.deepEqual(tops.slice(-3), floorRecords, 'reserved insertion keeps original ground-before-grade support order');
  for (const [x, y, keep] of [[1, 10.15, false], [3, 10.15, true], [11, 20.15, true], [21, 8.15, true], [101, 10.162, true]]) {
    assert.equal(rayAt(meshes, new THREE.Vector3(x, y, 1)).length > 0, keep, `x=${x}: above-floor cut versus retained approach/upper/outside surface`);
  }
  Object.freeze(tops);
  city.finishCurbSurfaces(cuts, start); // terminal/second calls cannot register or retain another surface batch
});

baselineTest('deferred Drape uses the original patch view even after regional patches and the host patch gate change', () => {
  const make = old => {
    const N = {}, load = realm(N); load('terrain');
    N.Terrain.load({ w: 2, h: 2, cell: 2, originX: 0, originZ: 0, waterLevel: 0, minH: 5, scale: 1 }, new Uint16Array(4));
    N.Terrain.addPatch({ x0: 0, z0: 0, step: 10, nx: 3, nz: 3, rect: true, h: new Float32Array(9).fill(12) });
    const f = setup({ terrain: N.Terrain, blocks: [block(1, 1, 4), block(10, 10, 4, 1)], old, pier: false });
    const city = f.N.buildSFGround(f.scene, { deferCurbSurfaces: true });
    if (!old) {
      N.Terrain.patches.unshift({ ...N.Terrain.patches[0], h: new Float32Array(9).fill(90) });
      N.Terrain.patchesEnabled = false;
      city.finishCurbSurfaces();
      assert.equal(N.Terrain.patchesEnabled, false, 'host configuration was not temporarily changed');
    }
    return { ...f, city };
  };
  const a = make(true), b = make(false);
  sameDrawing(a.city, b.city);
  assert.equal(JSON.stringify(expanded(a.N)), JSON.stringify(expanded(b.N)));
});

test('ordered broadphase: actual clipped curb buffers and registered support match the pre-optimization scan exactly', t => {
  assert.notEqual(beforeGround, source['sf-ground'], 'non-vacuous original sequential scan control');
  const { clipped } = fixtures(), before = actual(false, true, { groundSource: beforeGround, terrainSource: beforeTerrain });
  sameDrawing(before.city, clipped.city);
  assert.equal(JSON.stringify(before.N.ride), JSON.stringify(clipped.N.ride), 'complete ordered support planes/metadata');
  t.diagnostic(JSON.stringify({ beforeGroundSHA256: sha(beforeGround), currentGroundSHA256: sha(source['sf-ground']),
    beforeTerrainSHA256: sha(beforeTerrain), currentTerrainSHA256: sha(source['terrain-mesh']) }));
});

function terrainComparison() {
  const w = world(), T = w.N.Terrain, result = [];
  for (const site of [{ name: 'Broadway', x: -1700, z: -1100, width: 1024, depth: 512, path: [
    [-1580, 55, -820], [-1400, 52, -850], [-1200, 48, -890], [-1000, 42, -920], [-780, 39, -950]
  ] }, { name: 'Stockton', x: -650, z: -600, width: 512, depth: 640, path: [
    [-445, 32, -175], [-460, 35, -275], [-475, 38, -375], [-490, 40, -475]
  ] }]) {
    const terrain = crop(T, Math.floor((site.x - T.originX) / 64), Math.floor((site.z - T.originZ) / 64), site.width, site.depth);
    const before = drawing(beforeTerrain, terrain, null), after = drawing(source['terrain-mesh'], terrain, null);
    const row = { site: site.name, phases: 0, beforeMs: [], afterMs: [] };
    const check = () => { sameDrawing(before.mesh, after.mesh); row.phases++; };
    try {
      check();
      before.N.GradeSeparation = w.grade; after.N.GradeSeparation = w.grade;
      const run = (f, fn, times) => { const start = performance.now(); fn(f.mesh); times.push(performance.now() - start); };
      run(before, m => m.rebuild(), row.beforeMs); run(after, m => m.rebuild(), row.afterMs); check();
      const route = [...site.path, [site.x - 2000, 2000, site.z - 2000], ...site.path.slice().reverse()];
      for (const [i, [x, y, z]] of route.entries()) {
        const point = { x, y, z }, update = m => m.update(point, (i + 1) * .3, point);
        for (const [f, times] of i % 2 ? [[after, row.afterMs], [before, row.beforeMs]] : [[before, row.beforeMs], [after, row.afterMs]]) run(f, update, times);
        check();
      }
      assert.deepEqual(Array.from(before.mesh.stats().lods), Array.from(after.mesh.stats().lods));
      assert.ok(after.mesh.stats().reusedChunks > 0);
      assert.ok(after.mesh.stats().constructionBytes <= 4588032, 'unchanged retained arena budget');
      assert.equal(after.mesh.stats().reuseBytes, before.mesh.stats().reuseBytes);
      row.stats = after.mesh.stats();
    } finally { release(before); release(after); }
    row.beforeTotalMs = row.beforeMs.reduce((a, b) => a + b, 0);
    row.afterTotalMs = row.afterMs.reduce((a, b) => a + b, 0);
    result.push(row);
  }
  return result;
}

test('ordered broadphase: current adaptive roofs retain exact cropped terrain/skirts at every LOD, rebuild and return', t => {
  assert.notEqual(beforeTerrain, source['terrain-mesh'], 'non-vacuous original all-chunk-cut control');
  t.diagnostic(JSON.stringify({ scope: 'CPU-only matched current-world crops; milliseconds exclude byte comparison', comparisons: terrainComparison() }));
});

if (process.env.SF_CLIP_BENCH === '1') test('bounded alternating CPU curb benchmark, exact output on every pair', t => {
  const rows = [];
  for (let round = 0; round < 3; round++) {
    globalThis.gc?.(); // optional diagnostic GC, outside construction timing
    const order = round % 2 ? ['after', 'before'] : ['before', 'after'], outputs = {}, row = { round };
    for (const name of order) {
      outputs[name] = actual(false, true, name === 'before' ? { groundSource: beforeGround, terrainSource: beforeTerrain } : {});
      row[name] = outputs[name].buildMs;
    }
    sameDrawing(outputs.before.city, outputs.after.city);
    assert.equal(JSON.stringify(outputs.before.N.ride), JSON.stringify(outputs.after.N.ride));
    for (const f of Object.values(outputs)) {
      f.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); f.scene.clear();
      f.N.ride.tops.length = 0; f.groundTops.length = 0;
    }
    rows.push(row);
  }
  t.diagnostic(JSON.stringify({ scope: '34-block-or-current-cut-closure fixture, whole ground construction; no browser/startup/FPS claim', rows }));
});

if (process.env.SF_CLIP_FULL_CORE === '1') test('full-core CPU broadphase benchmark: exact terrain buffers and sequential curb/support fingerprints', t => {
  const w = world(), before = drawing(beforeTerrain, w.N.Terrain, null), after = drawing(source['terrain-mesh'], w.N.Terrain, null);
  const terrain = { beforeMs: [], afterMs: [], phases: 0 };
  const check = () => { sameDrawing(before.mesh, after.mesh); terrain.phases++; };
  try {
    check(); before.N.GradeSeparation = w.grade; after.N.GradeSeparation = w.grade;
    const operations = [m => m.rebuild(), ...[[-1475, 55, -833], [-780, 40, -950], [-446, 37, -182]].map(([x, y, z], i) =>
      m => m.update({ x, y, z }, (i + 1) * .3, { x, y, z }))];
    for (const [i, operation] of operations.entries()) {
      for (const [f, times] of i % 2 ? [[after, terrain.afterMs], [before, terrain.beforeMs]] : [[before, terrain.beforeMs], [after, terrain.afterMs]]) {
        const start = performance.now(); operation(f.mesh); times.push(performance.now() - start);
      }
      check();
    }
    terrain.stats = after.mesh.stats();
    assert.ok(terrain.stats.constructionBytes <= 4588032);
  } finally { release(before); release(after); }
  // Do not hold two complete object support registries. Hash each mesh buffer and each record in source order,
  // then release before building the next variant; hashing and optional diagnostic GC are outside the timed window.
  const curbs = [];
  for (const variant of ['before', 'after']) {
    globalThis.gc?.();
    const f = actual(false, true, { blocks: w.N.BLOCKS,
      ...(variant === 'before' ? { groundSource: beforeGround, terrainSource: beforeTerrain } : {}) });
    const hash = createHash('sha256');
    let triangles = 0;
    for (const mesh of f.city.group.children) {
      hash.update(JSON.stringify([mesh.name, mesh.castShadow, mesh.receiveShadow, mesh.geometry.boundingBox, mesh.geometry.boundingSphere]));
      for (const name of ['position', 'normal', 'uv', 'index']) {
        const attribute = name === 'index' ? mesh.geometry.index : mesh.geometry.attributes[name];
        if (!attribute) continue;
        hash.update(`${name}/${attribute.array.constructor.name}/${attribute.count}`); hash.update(bytes(attribute.array));
      }
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    }
    for (const key of ['tops', 'solids', 'prisms']) for (const item of f.N.ride[key]) hash.update(JSON.stringify(item));
    curbs.push({ variant, buildMs: f.buildMs, triangles, tops: f.N.ride.tops.length, sha256: hash.digest('hex') });
    f.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    f.city.group.clear(); f.scene.clear(); f.N.ride.tops.length = 0; f.groundTops.length = 0;
  }
  assert.equal(curbs[0].sha256, curbs[1].sha256, 'all core curb buffers, normals, indices, bounds and ordered support records');
  t.diagnostic(JSON.stringify({ scope: 'CPU full core terrain; all core curb Drape/registration, excludes buildings/actors/renderer and comparative browser boot',
    blocks: w.N.BLOCKS.length, cuts: w.grade.terrainCuts.length, terrain, curbs }));
});

test.after(() => {
  const geometries = new Set(), materials = new Set();
  for (const scene of scenes) scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  for (const resource of [...geometries, ...materials]) resource.dispose();
});
