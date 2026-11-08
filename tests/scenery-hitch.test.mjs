// Differential CPU checks against the pre-hitch checkpoint. No browser, renderer or project mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { withoutRegionalTreeEdits } from './helpers/region-tree-edits.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const ref = '2ff1a7c29702ee17266f18592d704cfcbdf8e23b';
const names = ['region', 'trees', 'buildings', 'sf-map'];
const current = Object.fromEntries(names.map(n => [n, read(`js/${n}.js`)]));
const history = gitHistory(root, ref);
const baselineTest = optionalSourceTest(history.skip);
const baseline = Object.fromEntries(names.map(n => [n, history.read(`js/${n}.js`)]));
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const section = (s, start, end) => {
  const a = s.indexOf(start), b = s.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `source anchors: ${start}`);
  return s.slice(a, b);
};
const normalStart = '// Specialized for this builder\'s indexed, non-normalized, non-interleaved Float32 XYZ geometry.';
const normalHelper = section(current.region, normalStart, 'function buildSFRegion(');
// Reconstruct the historical control from its accepted checkpoint, not evolving production geometry.
// Current output is still compared directly below; new construction work must not rewrite this oracle.
const acceptedHistory = gitHistory(root, 'fc9826b2872320bca7f08ac19d7141d3bbc31683');
const normalTest = optionalSourceTest(acceptedHistory.skip);
const regionTest = optionalSourceTest(history.skip || acceptedHistory.skip);
const acceptedRegion = acceptedHistory.read('js/region.js');
const acceptedNormalHelper = acceptedHistory.available ? section(acceptedRegion, normalStart, 'function buildSFRegion(scene)') : null;
const preNormalHash = 'b12a562f045681324fae61eec774438f1ece6aad4e998206c03a0d7c1620ed25';
const preNormal = acceptedRegion?.replace(acceptedNormalHelper, '').replace('computeRegionVertexNormals(geo);geo.computeBoundingSphere()', 'geo.computeVertexNormals();geo.computeBoundingSphere()');
if (acceptedHistory.available) assert.equal(hash(preNormal), preNormalHash);
const artifactChecks = new URL('./scenery-artifact.private.mjs', import.meta.url);
if (existsSync(artifactChecks)) (await import(artifactChecks.href)).checkFrozenSource(preNormalHash, preNormal, acceptedHistory.skip);
else test('optional scenery artifact comparison', { skip: 'development-only artifact helper is not shipped' }, () => {});
const fastNormals = new Function('THREE', normalHelper + '\nreturn computeRegionVertexNormals;')(THREE);
const manifest = JSON.parse(read('data/region/manifest.json'));
function bin(path) {
  const b = readFileSync(new URL(path, root)), n = b.readUInt32LE(4);
  return { header: JSON.parse(b.toString('utf8', 8, 8 + n)), data: b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length) };
}
function grid(tier) {
  const heights = new Float32Array(tier.w * tier.h).fill(manifest.waterLevel), tiles = [];
  for (const file of tier.files) {
    const { header: h, data } = bin(file.url), q = new Uint16Array(data);
    const ix = Math.round((h.originX - tier.x0) / tier.step), iz = Math.round((h.originZ - tier.z0) / tier.step);
    for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) heights[(iz + j) * tier.w + ix + i] = h.minH + q[j * h.w + i] * h.scale;
    tiles.push({ x: h.originX, z: h.originZ, w: h.w, h: h.h, size: tier.size });
  }
  return { ...tier, heights, tiles };
}
const C = grid(manifest.city), H = grid(manifest.horizon);
function bench(t, name, before, after, count = 1) {
  if (process.env.SF_SCENERY_BENCH !== '1') return;
  const samples = [[], []];
  for (let round = 0; round < 8; round++) for (const k of round % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now();
    for (let i = 0; i < count; i++) [before, after][k]();
    if (round >= 2) samples[k].push((performance.now() - start) / count);
  }
  const median = a => a.slice().sort((a, b) => a - b).slice(2, 4).reduce((a, b) => a + b) / 2;
  t.diagnostic(JSON.stringify({ name, msPerCall: samples.map(median), samples, count,
    scope: 'Node CPU wall time; alternating order, two warmups, six measured blocks; no allocation counters/forced GC in windows; not browser/GPU/FPS' }));
}

baselineTest('relief: all committed raster bytes, transparent border/water and cache match; reviewed map code pinned', t => {
  function relief(source, g, counted = false) {
    let result, allocations = 0, canvases = 0;
    const document = { createElement() {
      canvases++;
      return { getContext: () => ({ createImageData(w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        if (counted) data.set = function (array, offset) { allocations++; Uint8ClampedArray.prototype.set.call(this, array, offset); };
        return { data };
      }, putImageData(image) { result = image.data; } }) };
    } };
    const code = section(source, 'let RELIEF = null;', '\nlet LAYERS = null;');
    const fn = new Function('window', 'document', code + '\nreturn mapRelief;')({ NYC: { DATA: { fullRegion: { city: g } }, Terrain: { waterLevel: manifest.waterLevel } } }, document);
    const output = fn(); assert.equal(fn(), output); assert.equal(canvases, 1);
    return { result, allocations, output };
  }
  const a = relief(baseline['sf-map'], C, true), b = relief(current['sf-map'], C, true);
  assert.deepEqual(bytes(b.result), bytes(a.result));
  for (const k of ['x', 'z', 'width', 'height']) assert.equal(a.output[k], b.output[k]);
  assert.equal(b.allocations, 0); assert.ok(a.allocations > 1e6);
  assert.equal(section(current['sf-map'], '\nlet LAYERS = null;', "// SF's authored parks;"),
    section(baseline['sf-map'], '\nlet LAYERS = null;', 'class NYCMapSystem {'), 'layers, labels and caches before marker helpers remain exact');
  // Reviewed 6887737 adds only skateboard markers/spacing, aliases and exact arrival forwarding
  // after the relief code. Pin the entire suffix, rather than silently ignoring changed UI methods.
  assert.equal(hash(current['sf-map'].slice(current['sf-map'].indexOf('\nlet LAYERS = null;'))),
    'f1db3c37b0c92fd44bdde542fb4749ae7f97ad606977fd7e02c5e883bdafe10a', 'reviewed park map suffix');
  assert.equal(current['sf-map'].split('let RELIEF = null;')[0], baseline['sf-map'].split('let RELIEF = null;')[0]);
  t.diagnostic(JSON.stringify({ raster: [C.w, C.h], bytes: b.result.byteLength, sha256: hash(b.result), removedPerLandPixelArrays: a.allocations, newRetainedBytes: 0 }));
  bench(t, 'full committed map relief (includes image allocation, canvas stub)', () => relief(baseline['sf-map'], C), () => relief(current['sf-map'], C));
});

function geometryFactory(source, city, core, cuts) {
  const sample = section(source, '  const inRect=', '  const terrain=[];');
  const geometry = section(source, '  function geometry(', '  for(const [g,far]');
  return new Function('THREE', 'C', 'innerCore', 'cutRects', 'water', normalHelper + sample + geometry + '\nreturn geometry;')(THREE, city, core, cuts, manifest.waterLevel);
}
function sameGeometry(a, b) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const name of Object.keys(a.attributes)) {
    assert.equal(a.attributes[name].itemSize, b.attributes[name].itemSize);
    for (const key of ['normalized', 'count', 'version', 'usage', 'gpuType']) assert.equal(a.attributes[name][key], b.attributes[name][key]);
    assert.equal(a.attributes[name].constructor, b.attributes[name].constructor);
    assert.equal(a.attributes[name].array.constructor, b.attributes[name].array.constructor);
    assert.deepEqual(bytes(a.attributes[name].array), bytes(b.attributes[name].array), name);
  }
  assert.equal(a.index.array.constructor, b.index.array.constructor);
  assert.deepEqual(bytes(a.index.array), bytes(b.index.array), 'ordered triangle indices');
  assert.deepEqual(a.boundingSphere, b.boundingSphere);
  assert.deepEqual(a.boundingBox, b.boundingBox);
  assert.deepEqual(a.drawRange, b.drawRange); assert.deepEqual(a.groups, b.groups);
}
regionTest('region: every committed city tile at strides 1/2/4 and horizon tile at stride1 is byte-exact', t => {
  const terrain = bin('data/terrain-core.bin').header;
  const core = { x0: terrain.originX, z0: terrain.originZ, x1: terrain.originX + (terrain.w - 1) * terrain.cell, z1: terrain.originZ + (terrain.h - 1) * terrain.cell };
  // The committed Alcatraz fine patch is the additional production cut rectangle.
  const window = { NYC: {} }; new Function('window', read('js/sf-geodata.js'))(window);
  const cuts = [core, ...Object.values(window.NYC.GEO.landmarks).filter(s => s.detail && s.detail.step < C.step).map(({ detail: d }) =>
    ({ x0: d.x0, z0: d.z0, x1: d.x0 + (d.nx - 1) * d.step, z1: d.z0 + (d.nz - 1) * d.step }))];
  const before = geometryFactory(baseline.region, C, core, cuts), previous = geometryFactory(preNormal, C, core, cuts), after = geometryFactory(current.region, C, core, cuts);
  let cases = 0, maxBytes = 0, totalBytes = 0;
  const digest = createHash('sha256');
  for (const [g, far] of [[C, false], [H, true]]) for (const tile of g.tiles) for (const stride of far ? [1] : [1, 2, 4]) {
    const a = before(g, tile, stride, far), b = after(g, tile, stride, far);
    sameGeometry(a, b);
    const old = previous(g, tile, stride, far); sameGeometry(old, b); old.dispose();
    let size = 0;
    for (const attr of [...Object.values(b.attributes), b.index]) { digest.update(bytes(attr.array)); size += attr.array.byteLength; }
    maxBytes = Math.max(maxBytes, size); totalBytes += size; cases++;
    a.dispose(); b.dispose();
  }
  // Tiny irregular cuts crossing triangles exercise multiple polygon pieces and exact boundary exclusion.
  const g = { x0: -8, z0: -8, x1: 48, z1: 48, step: 8, w: 8, h: 8,
    heights: Float32Array.from({ length: 64 }, (_, i) => i % 11 < 3 ? -20 : i * 7.1) };
  const tile = { x: -8, z: -8, w: 8, h: 8, size: 56 };
  const irregular = [{ x0: 0.5, z0: 1.3, x1: 19.7, z1: 27.1 }, { x0: 11.9, z0: 8, x1: 40, z1: 15.2 }];
  for (const stride of [1, 2, 4]) {
    const a = geometryFactory(baseline.region, g, irregular[0], irregular)(g, tile, stride, false);
    const b = geometryFactory(current.region, g, irregular[0], irregular)(g, tile, stride, false);
    const old = geometryFactory(preNormal, g, irregular[0], irregular)(g, tile, stride, false);
    sameGeometry(a, b); sameGeometry(old, b); a.dispose(); b.dispose(); old.dispose();
  }
  // Undo only the exact paint-loop wrapper and scoped regional-tree drawing edits.
  let guarded = withoutRegionalTreeEdits(current.region);
  const undo = (current, original) => {
    assert.equal(guarded.split(current).length, 2, 'unique exact paint-hook fixture');
    guarded = guarded.replace(current, original);
  };
  undo(`      // Authored former-street pavement suppresses only its dashed paint. Source
      // linework, ground, vehicle routes and UV distance elsewhere stay unchanged.
      const intervals=paintIntervals?paintIntervals(ax,az,dx,dz,i*length/n,(i+1)*length/n):[[i*length/n,(i+1)*length/n]];
      for(const [a,b]of intervals){
      const x=ax+dx*(a+b)/2,z=az+dz*(a+b)/2;`,
  '      const a=i*length/n,b=(i+1)*length/n,x=ax+dx*(a+b)/2,z=az+dz*(a+b)/2;');
  undo('      }\n      }\n    }\n  }\n  const roadMeshes=[];', '      }\n    }\n  }\n  const roadMeshes=[];');
  assert.equal(guarded.slice(guarded.indexOf('  for(const [g,far]')), baseline.region.slice(baseline.region.indexOf('  for(const [g,far]')),
    'construction, near-rider8m selection, cache, city life and teardown remain source-exact');
  t.diagnostic(JSON.stringify({ committedCases: cases, syntheticCases: 3, outputSHA256: digest.digest('hex'), totalOutputBytes: totalBytes,
    largestGeometryBytes: maxBytes, newRetainedBytes: 0, harness: 'one geometry pair at a time, never retain full matrix' }));
  const tileBench = C.tiles.find(tile => tile.x > core.x1 && tile.z > core.z1) || C.tiles.at(-1);
  const allocations = { corners: 0, triangleArguments: 0 };
  const counted = baseline.region.replace('corners=[k,k+1,k+row,k+row+1]', 'corners=(allocations.corners++,[k,k+1,k+row,k+row+1])')
    .replace('const triangle = tri => {', 'const triangle = tri => { allocations.triangleArguments++;');
  // Test-only local closure injection, never production instrumentation and never timed.
  const countedFactory = new Function('allocations', 'THREE', 'C', 'innerCore', 'cutRects', 'water',
    section(counted, '  const inRect=', '  const terrain=[];') + section(counted, '  function geometry(', '  for(const [g,far]') + '\nreturn geometry;')(
    allocations, THREE, C, core, cuts, manifest.waterLevel);
  countedFactory(C, tileBench, 1, false).dispose();
  assert.equal(allocations.corners, 15625); assert.ok(allocations.triangleArguments > 0);
  t.diagnostic(JSON.stringify({ tile: [tileBench.x, tileBench.z], stride: 1, removedArrayLiterals: allocations,
    note: 'source-site execution counts, not V8 heap bytes or measured GC; candidate has no corner/triangle-argument arrays; clipped polygons retained' }));
  for (const stride of [1, 2, 4]) bench(t, `cold regional tile ${tileBench.x},${tileBench.z} stride${stride} incl normals/bounds`,
    () => before(C, tileBench, stride, false).dispose(), () => after(C, tileBench, stride, false).dispose(), 8);
});

test('regional typed normals match pinned Three: rounding, repeated/degenerate indices, zero and extreme vectors, Uint16/32', t => {
  const fixtures = [
    { p: [], i: [] },
    { p: [0, 0, 0, 1, 0, 0, 0, 1, 0, 7, 8, 9], i: [0, 1, 2, 0, 0, 2, 1, 2, 2, 2, 2, 2] },
    { p: [0, -0, 0, 1, 1, 1, 2, 2, 2, 0, 0, 0], i: [0, 1, 2, 0, 3, 2, 0, 0, 0] },
    { p: [0, 0, 0, 1, 0, 0, 0, 1, 0], i: [0, 1, 2, 2, 1, 0] },
    { p: [0, 0, 0, 1e-30, -1e-30, 1e-30, -1e-30, 1e-30, 1e-30], i: [0, 1, 2] },
    { p: [0, 0, 0, 1e30, 0, 0, 0, 1e30, 1e30], i: [0, 1, 2, 0, 0, 2] }
  ];
  let seed = 37;
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let f = 0; f < 24; f++) {
    const p = Array.from({ length: 111 }, () => (rng() - .5) * 10 ** (f % 9 - 4)), i = [];
    for (let n = 0; n < 300; n++) i.push(Math.floor(rng() * 37));
    fixtures.push({ p, i });
  }
  const doubleNormals = new Function('THREE', normalHelper.replace('new Float32Array(positions.length)', 'new Float64Array(positions.length)') + '\nreturn computeRegionVertexNormals;')(THREE);
  let cases = 0, roundingControls = 0;
  for (const fixture of fixtures) for (const Index of [Uint16Array, Uint32Array]) {
    const make = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(fixture.p, 3))
      .setIndex(new THREE.BufferAttribute(new Index(fixture.i), 1));
    const a = make(), b = make(), positions = bytes(a.attributes.position.array).toString('hex'), indices = bytes(a.index.array).toString('hex');
    for (const mode of ['fresh', 'reuse', 'mismatch']) {
      if (mode === 'mismatch') for (const g of [a, b]) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(fixture.p.length + 3).fill(3), 3));
      a.computeVertexNormals(); fastNormals(b); sameGeometry(a, b); cases++;
      assert.equal(bytes(b.attributes.position.array).toString('hex'), positions);
      assert.equal(bytes(b.index.array).toString('hex'), indices);
      for (const g of [a, b]) g.attributes.normal.array.fill(-17.125);
    }
    const mutant = make(); doubleNormals(mutant); a.computeVertexNormals();
    // A Float64 accumulator converted only at the end must fail at least one finite geometry control.
    if (a.attributes.normal.array.every(Number.isFinite) && mutant.attributes.normal.array.every(Number.isFinite) &&
      !bytes(new Float32Array(mutant.attributes.normal.array)).equals(bytes(a.attributes.normal.array))) roundingControls++;
    mutant.dispose();
    a.dispose(); b.dispose();
  }
  assert.ok(roundingControls > 0, 'negative control detects loss of per-face Float32 rounding');
  const large = new Float32Array(70003 * 3);
  large.set([1, 2, 3, 2, 2, 3, 1, 3, 3], 70000 * 3);
  const makeLarge = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(large.slice(), 3))
    .setIndex(new THREE.BufferAttribute(new Uint32Array([70000, 70001, 70002, 70000, 70000, 70002]), 1));
  const a = makeLarge(), b = makeLarge(); a.computeVertexNormals(); fastNormals(b); sameGeometry(a, b); a.dispose(); b.dispose(); cases++;
  t.diagnostic(JSON.stringify({ cases, roundingControls, pinnedThree: 'e27dfa95ae7f453b5d7a9a36ffdb563f7c9b529b', preNormalSHA256: preNormalHash,
    finalSHA256: hash(current.region), preNormalAvailable: acceptedHistory.available }));
});

normalTest('regional normals attribution: representative Twin Peaks cold grid, isolated normals and whole geometry', t => {
  const header = bin('data/terrain-core.bin').header;
  const core = { x0: header.originX, z0: header.originZ, x1: header.originX + (header.w - 1) * header.cell, z1: header.originZ + (header.h - 1) * header.cell };
  const window = { NYC: {} }; new Function('window', read('js/sf-geodata.js'))(window);
  const cuts = [core, ...Object.values(window.NYC.GEO.landmarks).filter(s => s.detail && s.detail.step < C.step).map(({ detail: d }) =>
    ({ x0: d.x0, z0: d.z0, x1: d.x0 + (d.nx - 1) * d.step, z1: d.z0 + (d.nz - 1) * d.step }))];
  // First native rider XYZ from twinpeaks-first-riding-raw.json. Camera approximated by rider XZ;
  // this is a representative fully cold near-grid, not a replay of the traced visited-stride state.
  const x = -4010.9382626983847, z = 3876.6073298332144;
  const tiles = C.tiles.filter(tile => Math.hypot(x - tile.x - tile.size / 2, z - tile.z - tile.size / 2) < 1600);
  assert.ok(tiles.length >= 6 && tiles.length <= 12);
  const before = geometryFactory(preNormal, C, core, cuts), after = geometryFactory(current.region, C, core, cuts);
  const geos = tiles.map(tile => before(C, tile, 1, false));
  let retainedBytes = 0;
  for (let i = 0; i < tiles.length; i++) {
    const candidate = after(C, tiles[i], 1, false); sameGeometry(geos[i], candidate); candidate.dispose();
    retainedBytes += [...Object.values(geos[i].attributes), geos[i].index].reduce((n, attr) => n + attr.array.byteLength, 0);
  }
  t.diagnostic(JSON.stringify({ tiles: tiles.map(tile => [tile.x, tile.z]), stride: 1, typedGeometryBytes: retainedBytes,
    vertices: geos.reduce((n, g) => n + g.attributes.position.count, 0), triangles: geos.reduce((n, g) => n + g.index.count / 3, 0),
    comparison: 'pre-normal b12a562 versus scalar normals only; original position/color/index constructors preserved' }));
  bench(t, 'TwinPeaks cold batch: normals only (fresh output allocation included)',
    () => { for (const g of geos) { g.deleteAttribute('normal'); g.computeVertexNormals(); } },
    () => { for (const g of geos) { g.deleteAttribute('normal'); fastNormals(g); } }, 8);
  bench(t, 'TwinPeaks cold batch: full geometry including normal generation and bounds',
    () => { for (const tile of tiles) before(C, tile, 1, false).dispose(); },
    () => { for (const tile of tiles) after(C, tile, 1, false).dispose(); }, 2);
  for (const g of geos) g.dispose();
});

const noop = () => {};
const pixels = new Uint8ClampedArray(1024 * 1024 * 4);
const document = { createElement: () => ({ getContext: () => ({ fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
  bezierCurveTo: noop, closePath: noop, arc: noop, fill: noop, stroke: noop, getImageData: () => ({ data: pixels }) }) }) };
function plantedSites() {
  const window = { NYC: {} };
  for (const name of ['sf-geodata', 'city-config', 'terrain']) new Function('window', read(`js/${name}.js`))(window);
  const { header, data } = bin('data/terrain-core.bin'); window.NYC.Terrain.load(header, new Uint16Array(data));
  const code = section(read('js/sf-street-details.js'), '  const SPECIES_OF', '  const treeField =');
  const sites = new Function('window', 'blockAt', 'groundAt', 'CURB_H', code + '\nreturn sites;')(
    window, window.NYC.blockAt, (x, z) => window.NYC.Terrain.groundAt(x, z), window.NYC.CURB_H);
  return { sites, terrain: window.NYC.Terrain };
}
function treeField(source, sites, terrain) {
  const window = { NYC: { THREE, Terrain: terrain, createTreeMaterial: () => new THREE.MeshBasicMaterial() } };
  new Function('window', read('js/sf-ride-geometry.js'))(window);
  new Function('window', 'document', source)(window, document);
  const scene = new THREE.Scene(), field = window.NYC.createTreeField(scene, sites);
  scene.add(field.group); scene.updateMatrixWorld(true);
  return { ...field, scene, bodies: window.NYC.ride };
}
function sameTrees(a, b) {
  assert.equal(a.meshes.length, 30); assert.equal(b.meshes.length, 30);
  for (let i = 0; i < 30; i++) {
    const old = a.meshes[i], m = b.meshes[i];
    for (const key of ['name', 'count', 'visible', 'castShadow', 'receiveShadow', 'frustumCulled']) assert.equal(m[key], old[key], `${old.name}: ${key}`);
    assert.equal(m.layers.mask, old.layers.mask);
    for (const [before, after, label] of [[old.instanceMatrix, m.instanceMatrix, 'ordered matrix'],
      [old.geometry.attributes.aTreeData, m.geometry.attributes.aTreeData, 'ordered tree data']]) {
      for (const key of ['itemSize', 'count', 'normalized', 'usage', 'gpuType']) assert.equal(after[key], before[key], `${old.name}: ${key}`);
      assert.equal(after.array.constructor, before.array.constructor);
      // Raw update(position) must retain the entire original ordered pool, including inactive capacity.
      // Dirty versions/ranges intentionally differ: the union implementation repacks only changed streams.
      assert.deepEqual(bytes(after.array), bytes(before.array), `${old.name}: ${label} bytes`);
    }
    for (const attr of [m.instanceMatrix, m.geometry.attributes.aTreeData]) {
      for (const r of attr.updateRanges) assert.ok(r.start >= 0 && r.start + r.count <= attr.array.length);
    }
  }
}
baselineTest('trees: real22886 planting, exact raw global pools/geometry/physics/capacity/allocation and shadow-hook ownership', t => {
  const { sites, terrain } = plantedSites(); assert.equal(sites.length, 22886);
  const a = treeField(baseline.trees, sites, terrain), b = treeField(current.trees, sites, terrain);
  assert.deepEqual(a.stats, b.stats); assert.equal(hash(JSON.stringify(a.bodies)), hash(JSON.stringify(b.bodies)));
  assert.equal(a.meshes.length, 30); assert.equal(b.meshes.length, 30);
  for (let i = 0; i < 30; i++) sameGeometry(a.meshes[i].geometry, b.meshes[i].geometry);
  sameTrees(a, b);
  // Negative control: preserving a multiset is insufficient; swapping two instances must fail this oracle.
  const ordered = b.meshes.find(m => m.count > 1).instanceMatrix.array;
  const swap = () => { for (let i = 0; i < 16; i++) { const value = ordered[i]; ordered[i] = ordered[16 + i]; ordered[16 + i] = value; } };
  swap(); assert.throws(() => sameTrees(a, b), /ordered matrix/); swap(); sameTrees(a, b);
  const path = Array.from({ length: 80 }, (_, i) => { const site = sites[i * 127 % sites.length]; return new THREE.Vector3(site.x, [site.y + 8, 39.999, 40, 120, 400][i % 5], site.z); });
  path.push(new THREE.Vector3(30000, 80, 30000));
  let views = 0;
  const countViews = fn => {
    const old = Float32Array.prototype.subarray;
    Float32Array.prototype.subarray = function (...args) { views++; return old.apply(this, args); };
    try { return fn(); } finally { Float32Array.prototype.subarray = old; }
  };
  let oldViews = 0, newViews = 0, replacements;
  for (const [i, p] of path.entries()) {
    if (i === 40) {
      replacements = [a, b].map(f => f.meshes.map(m => {
        m.instanceMatrix = new THREE.StorageInstancedBufferAttribute(m.instanceMatrix.array, 16); return m.instanceMatrix;
      }));
    }
    views = 0; const before = countViews(() => a.update(p)); oldViews += views;
    views = 0; const after = countViews(() => b.update(p)); newViews += views;
    assert.equal(after, before); sameTrees(a, b);
  }
  assert.ok(oldViews > 100000); assert.equal(newViews, 0);
  for (const [j, f] of [a, b].entries()) for (let i = 0; i < 30; i++) assert.equal(f.meshes[i].instanceMatrix, replacements[j][i]);
  assert.ok(replacements[1].some(attr => attr.version > 0), 'remaining raw views publish through the replacement storage');
  const camera = new THREE.PerspectiveCamera(); camera.position.copy(path[0]); camera.updateMatrixWorld(true);
  a.update(camera.position); b.scene.updateMatrixWorld(true);
  b.scene.onBeforeRender(null, b.scene, camera, null);
  const rawCount = a.meshes.reduce((n, m) => n + m.count, 0), filteredCount = b.meshes.reduce((n, m) => n + m.count, 0);
  assert.ok(filteredCount > 0 && filteredCount < rawCount, 'exercise an intentionally filtered hook result, not a raw-stream comparison');
  const snapshot = () => b.meshes.map(m => ({ count: m.count, visible: m.visible,
    matrix: Buffer.from(bytes(m.instanceMatrix.array)), data: Buffer.from(bytes(m.geometry.attributes.aTreeData.array)),
    versions: [m.instanceMatrix.version, m.geometry.attributes.aTreeData.version],
    ranges: [m.instanceMatrix, m.geometry.attributes.aTreeData].map(attr => attr.updateRanges.map(r => ({ start: r.start, count: r.count }))) }));
  const filtered = snapshot(), previousOverride = b.scene.overrideMaterial;
  try {
    b.scene.overrideMaterial = { isShadowPassMaterial: true };
    for (const shadow of [new THREE.OrthographicCamera(), new THREE.PerspectiveCamera()]) {
      shadow.position.set(30000, 900, 30000); shadow.updateMatrixWorld(true);
      b.scene.onBeforeRender(null, b.scene, shadow, null);
      assert.deepEqual(snapshot(), filtered, 'shadow passes cannot replace or dirty the common union stream');
    }
  } finally { b.scene.overrideMaterial = previousOverride; }
  assert.equal(b.update(camera.position), a.update(camera.position), 'raw restore keeps the original same-position return value');
  sameTrees(a, b); // the raw update restores the original complete ordered arrays at exactly the hook position
  const capacityBytes = f => f.meshes.reduce((n, m) => n + m.instanceMatrix.array.byteLength + m.geometry.attributes.aTreeData.array.byteLength, 0);
  assert.equal(capacityBytes(a), capacityBytes(b));
  assert.equal(hash(JSON.stringify(a.bodies)), hash(JSON.stringify(b.bodies)), 'views never change native trunks');
  t.diagnostic(JSON.stringify({ sites: sites.length, views: path.length, removedSubarrayViews: oldViews, currentSubarrayViews: newViews,
    baselinePools: a.meshes.length, currentPools: b.meshes.length, matrixAndDataCapacityBytes: capacityBytes(b), renderCapacityDeltaBytes: capacityBytes(b) - capacityBytes(a),
    storageReplacementAtView: 40, rawHookPositionInstances: rawCount, filteredHookInstances: filteredCount,
    runtimeTreeSHA256: hash(current.trees), scope: 'raw global-pool differential and hook ownership only; union correctness has separate sf-trees coverage' }));
  bench(t, 'tree selector+repack81-view path', () => { for (const p of path) a.update(p); }, () => { for (const p of path) b.update(p); });
  for (const f of [a, b]) {
    for (const m of f.meshes) { m.dispose(); m.geometry.dispose(); }
    f.material.dispose(); f.atlas.texture.dispose(); f.scene.clear();
  }
});

baselineTest('building stream: live ordering/instances match the historical baseline and deferred distance candidate', t => {
  // dc2108c added tunnel-opening geometry; be408b4 filtered HVAC fan/slat shaders.
  // Neither changed the quadtree, pool capacities or streaming closure. Compare these
  // exact live bytes AND execute the current stream below; whole-building identity is
  // no longer the contract of this historical sort-key experiment.
  const streaming = code => section(code, '  let lastStreamX', '\n  scene.add(group);');
  const verifyLiveStream = code => {
    assert.equal(streaming(code), streaming(baseline.buildings), 'live streaming closure remains baseline-exact');
    assert.equal(section(code, 'class ManhattanQuadtree {', '\n}\n'),
      section(baseline.buildings, 'class ManhattanQuadtree {', '\n}\n'), 'live quadtree remains baseline-exact');
    assert.equal(section(code, '  const MAX_CORNICES =', '  const corniceMat ='),
      section(baseline.buildings, '  const MAX_CORNICES =', '  const corniceMat ='), 'live pool capacities remain baseline-exact');
  };
  verifyLiveStream(current.buildings);
  assert.throws(() => verifyLiveStream(current.buildings.replace('const STREAM_RADIUS = 560;', 'const STREAM_RADIUS = 561;')), /streaming closure/);
  assert.throws(() => verifyLiveStream(current.buildings.replace('const MAX_HVAC = 1600;', 'const MAX_HVAC = 1601;')), /pool capacities/);
  const source = section(baseline.buildings, '    // Sort closest blocks first', '    activeBlockCount =');
  const candidate = `for (const b of nearbyBlocks) b[streamDistanceSq] = (b.cx - focusX) * (b.cx - focusX) + (b.cz - focusZ) * (b.cz - focusZ);
    nearbyBlocks.sort((a, b) => a[streamDistanceSq] - b[streamDistanceSq]);\n`;
  const candidateSource = baseline.buildings.replace(source, candidate).replace('  const STREAM_RADIUS = 560;',
    "  const STREAM_RADIUS = 560; const streamDistanceSq = Symbol('distance');");
  const before = new Function('nearbyBlocks', 'focusX', 'focusZ', source);
  const after = new Function('streamDistanceSq', 'return function(nearbyBlocks, focusX, focusZ) {' + candidate + '}')(Symbol('distance'));
  // Committed footprint centres, as used by buildSFMasses. Include ties and pool-overflow-sized candidate sets.
  const { header, data } = bin('data/buildings-core.bin');
  const table = new Float32Array(data, 0, header.tableFloats), verts = new Float32Array(data, header.tableFloats * 4, header.vertexFloats);
  const F = header.tableFloats / header.count, blocks = [];
  for (let i = 0; i < header.count; i++) {
    const start = table[i * F + 3], count = table[i * F + 4]; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < count; k++) { const x = verts[2 * (start + k)], z = verts[2 * (start + k) + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    blocks.push({ id: i, cx: (minX + maxX) * .5, cz: (minZ + maxZ) * .5 });
  }
  const groups = Array.from({ length: 32 }, (_, i) => { const focus = blocks[i * 401 % blocks.length]; return { focus, nearby: blocks.filter(b => Math.abs(b.cx - focus.cx) < 560 && Math.abs(b.cz - focus.cz) < 560) }; });
  for (const { focus, nearby } of groups) {
    const a = nearby.slice(), b = nearby.slice(); before(a, focus.cx, focus.cz); after(b, focus.cx, focus.cz);
    assert.deepEqual(a.map(b => b.id), b.map(b => b.id));
  }
  const ties = [{ cx: 1, cz: 0 }, { cx: -1, cz: 0 }, { cx: 0, cz: 1 }], ordered = ties.slice(); after(ties, 0, 0); assert.deepEqual(ties, ordered);
  function stream(code) {
    const corniceInst = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 7000);
    const hvacInst = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 1600);
    const quadtree = { queryRange: () => [] };
    const runtime = new Function('quadtree', 'dummy', 'corniceInst', 'hvacInst', 'MAX_CORNICES', 'MAX_HVAC',
      streaming(code) + '\nreturn { update, activeBlocks: () => activeBlockCount };')(quadtree, new THREE.Object3D(), corniceInst, hvacInst, 7000, 1600);
    return { quadtree, ...runtime, meshes: [corniceInst, hvacInst] };
  }
  const a = stream(baseline.buildings), b = stream(candidateSource), live = stream(current.buildings);
  const streams = [a, b, live];
  const detail = (id, n) => Array.from({ length: n }, (_, k) => ({ x: id + k, y: k % 11 * 3.1, z: id - k, w: 4.2, h: 1.1, d: 3.7 }));
  for (const block of blocks) { block.ry = block.id % 7 * .31; block.cornices = detail(block.id, block.id % 9); block.hvacUnits = detail(block.id, block.id % 3); }
  const saturated = [10, -10, 0].map((cx, id) => ({ cx, cz: 0, ry: .3, cornices: detail(id * 10000, 3501), hvacUnits: detail(id * 10000, 801) }));
  for (const { focus, nearby } of [...groups, { focus: { cx: 0, cz: 0 }, nearby: saturated }, { focus: { cx: 1e6, cz: 1e6 }, nearby: [] }]) {
    for (const f of streams) { f.quadtree.queryRange = () => nearby.slice(); f.update(focus.cx, focus.cz, true); }
    const compare = () => {
      for (const f of [b, live]) {
        assert.equal(f.activeBlocks(), a.activeBlocks());
        a.meshes.forEach((m, i) => {
          const n = f.meshes[i]; assert.equal(m.count, n.count); assert.deepEqual(bytes(m.instanceMatrix.array), bytes(n.instanceMatrix.array));
          assert.deepEqual(m.instanceMatrix.updateRanges, n.instanceMatrix.updateRanges); assert.equal(m.instanceMatrix.version, n.instanceMatrix.version);
        });
      }
    };
    compare();
    for (const f of streams) f.update(focus.cx + 1, focus.cz + 1);
    compare();
    for (const f of streams) f.update(focus.cx + 18, focus.cz);
    compare();
  }
  for (const f of streams) for (const m of f.meshes) { m.dispose(); m.geometry.dispose(); m.material.dispose(); }
  t.diagnostic(JSON.stringify({ adopted: false, blockCount: blocks.length, groups: groups.length, streamedViews: (groups.length + 2) * 3,
    comparedStreams: ['historical', 'deferred-candidate', 'live'], liveStreamingSHA256: hash(streaming(current.buildings)),
    candidateCounts: groups.map(g => g.nearby.length), candidateAddedScalarPayloadBytes: blocks.length * 8,
    note: 'candidate-only distance key per queried block; raw scalar payload excludes engine object/shape overhead; production has no new retained memory' }));
  bench(t, 'building comparator vs cached-key candidate32-sort batch',
    () => { for (const { focus, nearby } of groups) before(nearby.slice(), focus.cx, focus.cz); },
    () => { for (const { focus, nearby } of groups) after(nearby.slice(), focus.cx, focus.cz); }, 20);
});

baselineTest('source provenance for scoped scenery comparison', t => {
  t.diagnostic(JSON.stringify({ ref, sha256: Object.fromEntries(names.map(n => [n, { baseline: hash(baseline[n]), current: hash(current[n]) }])) }));
});
