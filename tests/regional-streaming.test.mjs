// Exact CPU geometry/lifecycle comparisons against the accepted fc9826b checkpoint. No browser/GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { withoutRegionalTreeEdits } from './helpers/region-tree-edits.mjs';
import { withoutGroundEdgeEdits } from './helpers/region-ground-edge-edits.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const ref = 'fc9826b2872320bca7f08ac19d7141d3bbc31683';
const history = gitHistory(root, ref);
const baselineTest = optionalSourceTest(history.skip);
const before = history.read('js/region.js');
const after = read('js/region.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const section = (s, start, end) => {
  const a = s.indexOf(start), b = s.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `source anchors: ${start}`);
  return s.slice(a, b);
};
const normalStart = '// Specialized for this builder\'s indexed, non-normalized, non-interleaved Float32 XYZ geometry.';
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
const h = bin('data/terrain-core.bin').header;
const core = { x0: h.originX, z0: h.originZ, x1: h.originX + (h.w - 1) * h.cell, z1: h.originZ + (h.h - 1) * h.cell };
const geodata = { NYC: {} }; new Function('window', read('js/sf-geodata.js'))(geodata);
const cuts = [core, ...Object.values(geodata.NYC.GEO.landmarks).filter(s => s.detail && s.detail.step < C.step).map(({ detail: d }) =>
  ({ x0: d.x0, z0: d.z0, x1: d.x0 + (d.nx - 1) * d.step, z1: d.z0 + (d.nz - 1) * d.step }))];
function factory(source, city = C, inner = core, rects = cuts, three = THREE, workspaceTypes = {}) {
  return new Function('THREE', 'C', 'innerCore', 'cutRects', 'water', 'Float64Array', 'Uint32Array',
    section(source, normalStart, 'function buildSFRegion(scene)') +
    section(source, '  const inRect=', '  const terrain=[];') +
    section(source, '  function geometry(', '  for(const [g,far]') + '\nreturn geometry;')(
      three, city, inner, rects, manifest.waterLevel, workspaceTypes.Float64Array || Float64Array, workspaceTypes.Uint32Array || Uint32Array);
}
function same(a, b) {
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes));
  for (const name of [...Object.keys(a.attributes), 'index']) {
    const x = name === 'index' ? a.index : a.attributes[name], y = name === 'index' ? b.index : b.attributes[name];
    if (!x) { assert.equal(y, null); continue; }
    for (const key of ['itemSize', 'normalized', 'count', 'version', 'usage', 'gpuType', 'constructor']) assert.equal(y[key], x[key], name + ':' + key);
    assert.equal(y.array.constructor, x.array.constructor);
    assert.deepEqual(bytes(y.array), bytes(x.array), name);
    assert.equal(y.array.byteLength, y.array.buffer.byteLength, 'no unused workspace retained by output');
  }
  for (const key of ['boundingSphere', 'boundingBox', 'groups', 'drawRange']) assert.deepEqual(b[key], a[key], key);
}

baselineTest('regional streaming: pinned baseline, exact normals, sampler, thresholds and resource ownership remain unchanged', () => {
  assert.equal(hash(before), '84769163b43edc90e5cc2640154e62ebfe1b29b041c25b3ecf2302954b6a6907');
  // Only the scoped regional-tree drawing and ground-edge material edits are undone (tests/helpers/).
  const guarded = withoutGroundEdgeEdits(withoutRegionalTreeEdits(after));
  assert.equal(guarded.slice(0, guarded.indexOf('  function geometry(')), before.slice(0, before.indexOf('  function geometry(')));
  assert.equal(guarded.slice(guarded.indexOf('  for(const [g,far]')), before.slice(before.indexOf('  for(const [g,far]')));
});

baselineTest('regional streaming: all committed tile/stride outputs, clipping, skirts and seam endpoints match fc9826b', t => {
  const a = factory(before), b = factory(after), digest = createHash('sha256');
  let cases = 0, totalBytes = 0, largest = 0;
  for (const [g, far] of [[C, false], [H, true]]) for (const tile of g.tiles) for (const stride of far ? [1] : [1, 2, 4]) {
    const x = a(g, tile, stride, far), y = b(g, tile, stride, far); same(x, y);
    let size = 0;
    for (const attr of [...Object.values(y.attributes), y.index]) { digest.update(bytes(attr.array)); size += attr.array.byteLength; }
    cases++; totalBytes += size; largest = Math.max(largest, size); x.dispose(); y.dispose();
  }
  assert.equal(cases, 639);
  const outputSHA256 = digest.digest('hex');
  assert.equal(outputSHA256, '17b206ea09a636b0dbdf6ff0872a7d985eeb0878b6611326035b86fb947baaf3');
  t.diagnostic(JSON.stringify({ cases, outputSHA256, totalBytes, largest, sourceSHA256: hash(after) }));
});

baselineTest('regional streaming: overlapping fractional cuts, out-of-grid samples, irregular last cells and Uint32 outputs remain exact', () => {
  const syntheticCuts = [{ x0: .5, z0: 1.3, x1: 19.7, z1: 27.1 }, { x0: 11.9, z0: 8, x1: 40, z1: 15.2 }];
  const g = { x0: -8.1, z0: -8.2, x1: 48, z1: 48, step: 8, w: 8, h: 8,
    heights: Float32Array.from({ length: 64 }, (_, i) => i % 11 < 3 ? -20 : i * 7.1) };
  for (const far of [false, true]) for (const stride of [1, 2, 4]) {
    const tile = { x: -9, z: -10.2, w: 8, h: 8, size: 56 };
    const x = factory(before, g, syntheticCuts[0], syntheticCuts)(g, tile, stride, far);
    const y = factory(after, g, syntheticCuts[0], syntheticCuts)(g, tile, stride, far);
    same(x, y); x.dispose(); y.dispose();
  }
  const large = { x0: 0, z0: 0, x1: 2048, z1: 2048, step: 8, w: 257, h: 257, heights: new Float32Array(257 * 257).fill(5) };
  const tile = { x: 0, z: 0, w: 257, h: 257, size: 2048 }, outside = { x0: -10, z0: -10, x1: -5, z1: -5 };
  const x = factory(before, large, outside, [])(large, tile, 1, false), y = factory(after, large, outside, [])(large, tile, 1, false);
  same(x, y); assert.equal(y.index.array.constructor, Uint32Array); x.dispose(); y.dispose();
});

baselineTest('regional streaming: many disjoint/boundary cuts and workspace growth preserve ordered Float64 clipping', () => {
  const g = { x0: 0, z0: 0, x1: 64, z1: 64, step: 8, w: 9, h: 9,
    heights: Float32Array.from({ length: 81 }, (_, i) => 1 + (i % 9) ** 2 * 1.125 + Math.floor(i / 9) * .37) };
  const tile = { x: 0, z: 0, w: 9, h: 9, size: 64 }, outside = { x0: -10, z0: -10, x1: -5, z1: -5 };
  const rects = [outside, { x0: 64, z0: 0, x1: 80, z1: 64 }, { x0: 0, z0: 64, x1: 64, z1: 80 }];
  for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) rects.push({ x0: x * 8 + .7, z0: z * 8 + .9, x1: x * 8 + 7.1, z1: z * 8 + 6.7 });
  const scratch = [];
  const tracked = Type => class extends Type { constructor(...args) { super(...args); if (typeof args[0] === 'number') scratch.push(this); } };
  const x = factory(before, g, outside, rects)(g, tile, 1, false);
  const y = factory(after, g, outside, rects, THREE, { Float64Array: tracked(Float64Array), Uint32Array: tracked(Uint32Array) })(g, tile, 1, false);
  same(x, y);
  assert.ok(scratch.filter(a => a instanceof Float64Array).length > 1, 'clipped positions exceed initial capacity');
  assert.ok(scratch.filter(a => a instanceof Uint32Array).length > 1, 'clipped indices exceed initial capacity');
  for (const a of scratch) for (const attr of [...Object.values(y.attributes), y.index]) assert.notEqual(attr.array.buffer, a.buffer, 'cache never retains construction workspace');
  x.dispose(); y.dispose();
});

test('regional streaming: cold Twin Peaks workspace/output ownership is bounded per tile, with no construction buffers in cache', t => {
  const tiles = C.tiles.filter(tile => Math.hypot(-4010.9382626983847 - tile.x - tile.size / 2, 3876.6073298332144 - tile.z - tile.size / 2) < 1600);
  let allocated = 0, maxWorkspace = 0, output = 0;
  for (const tile of tiles) {
    const scratch = [];
    const tracked = Type => class extends Type { constructor(...args) { super(...args); if (typeof args[0] === 'number') scratch.push(this); } };
    const geo = factory(after, C, core, cuts, THREE, { Float64Array: tracked(Float64Array), Uint32Array: tracked(Uint32Array) })(C, tile, 1, false);
    const attrs = [...Object.values(geo.attributes), geo.index], flagsBytes = (tile.w ** 2) * 2;
    const size = scratch.reduce((n, array) => n + array.byteLength, flagsBytes);
    allocated += size; maxWorkspace = Math.max(maxWorkspace, size);
    output += attrs.reduce((n, attr) => n + attr.array.byteLength, 0);
    for (const array of scratch) for (const attr of attrs) assert.notEqual(attr.array.buffer, array.buffer);
    geo.dispose();
  }
  t.diagnostic(JSON.stringify({ tiles: tiles.length, constructionArrayBytes: allocated, maxPerTileConstructionArrayBytes: maxWorkspace,
    outputTypedBytes: output, newRetainedConstructionBytes: 0,
    scope: 'exact typed payload counts; excludes engine objects, temporary views/clipping arrays and physical/GPU/process memory' }));
});

function fixture(source, three = THREE) {
  const terrain = { originX: 0, originZ: 0, w: 3, h: 3, cell: 2, patches: [] };
  const city = { x0: -16, z0: -16, x1: 112, z1: 48, step: 8, w: 17, h: 9,
    heights: Float32Array.from({ length: 153 }, (_, i) => 2 + (i % 17) * .5 + Math.floor(i / 17) * .2),
    tiles: [{ x: -16, z: -16, w: 9, h: 9, size: 64 }, { x: 48, z: -16, w: 9, h: 9, size: 64 }] };
  const horizon = { ...city, x0: 2000, z0: 2000, x1: 2128, z1: 2064, tiles: [{ x: 2000, z: 2000, w: 9, h: 9, size: 64 }] };
  const data = { city, horizon, mask: new Uint8Array(256), roads: new Float32Array(), buildings: [], trees: new Float32Array(),
    manifest: { mask: { originX: -16, originZ: -16, w: 16, h: 16 }, waterLevel: -10,
      ferries: [{ name: 'CPU ferry', speed: 4, pts: [[-16, -16], [48, 48]] }], cargo: [[200, 200]] } };
  const window = { NYC: { THREE: three, TSL, Terrain: terrain, DATA: { fullRegion: data }, cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } } };
  new Function('window', 'location', source)(window, { search: '' });
  const scene = new THREE.Scene(), region = window.NYC.buildSFRegion(scene);
  return { scene, region, data };
}
baselineTest('regional streaming: teleport/revisit, remote camera, seam travel and terminal cancellation retain exact geometry/cache lifecycle', () => {
  for (const sceneFirst of [false, true]) {
    const a = fixture(before), b = fixture(after), disposalCounts = new Map();
    const watch = () => {
      for (const mesh of b.region.group.children) if (mesh.geometry && !disposalCounts.has(mesh.geometry)) {
        const count = { n: 0 }; disposalCounts.set(mesh.geometry, count); mesh.geometry.addEventListener('dispose', () => { count.n++; });
      }
    };
    watch();
    const stops = [
      [6000, 16, 10000, 10000], [3000, 16, 10000, 10000], [16, 16, 10000, 10000],
      [6000, 16, 10000, 10000], [3000, 16, 10000, 10000], [6000, 16, 16, 16],
      [6000, 16, 47.9, 16], [6000, 16, 48, 16], [6000, 16, 48.1, 16],
      [6000, 6000, 10000, 10000], [16, 16, 16, 16]
    ];
    for (let repeat = 0; repeat < 5; repeat++) for (let i = 0; i < stops.length; i++) {
      const [cx, cz, x, z] = stops[i], elapsed = repeat * 100 + i;
      for (const item of [a, b]) item.region.update({ position: { x: cx, z: cz } }, elapsed, { position: { x, z } });
      a.region.group.children.forEach((mesh, k) => {
        const other = b.region.group.children[k]; if (mesh.geometry) same(mesh.geometry, other.geometry);
        assert.deepEqual(other.position, mesh.position); assert.equal(other.visible, mesh.visible);
      }); watch();
    }
    const watchedCount = disposalCounts.size;
    for (let i = 0; i < 30; i++) {
      const [cx, cz, x, z] = stops[i % stops.length];
      b.region.update({ position: { x: cx, z: cz } }, 1000 + i, { x, z }); watch();
    }
    assert.equal(disposalCounts.size, watchedCount, 'visited route variants plateau without rebuilding or retaining scratch');
    const disposeScene = scene => { const seen = new Set(); scene.traverse(o => { if (o.geometry) seen.add(o.geometry); }); for (const g of seen) g.dispose(); };
    if (sceneFirst) disposeScene(b.scene);
    b.region.disposeTerrainCache(); b.region.disposeTerrainCache();
    const snapshot = b.region.group.children.map(mesh => ({ geometry: mesh.geometry, position: mesh.position.clone(), visible: mesh.visible }));
    b.region.setQuality(0, 0); b.region.update({ position: { x: -10000, z: -10000 } }, 10000, { x: -10000, z: -10000 });
    b.region.group.children.forEach((mesh, i) => { assert.equal(mesh.geometry, snapshot[i].geometry); assert.deepEqual(mesh.position, snapshot[i].position); assert.equal(mesh.visible, snapshot[i].visible); });
    if (!sceneFirst) disposeScene(b.scene);
    assert.ok([...disposalCounts.values()].every(count => count.n === 1), 'each observed attached/detached geometry disposed once');
    a.region.disposeTerrainCache(); disposeScene(a.scene);
  }
});

test('regional streaming: failed synchronous preparation does not publish/cache a partial variant; retry and terminal cancellation are safe', () => {
  let fail = false;
  class FaultAttribute extends THREE.Float32BufferAttribute {
    constructor(...args) { if (fail) { fail = false; throw Error('controlled CPU attribute allocation fault'); } super(...args); }
  }
  const { scene, region } = fixture(after, { ...THREE, Float32BufferAttribute: FaultAttribute });
  const ground = region.group.children.find(mesh => mesh.name === 'SFRegionTerrain'), coarse = ground.geometry;
  fail = true;
  assert.throws(() => region.update({ position: { x: 6000, z: 16 } }, 1, { x: 16, z: 16 }), /controlled CPU/);
  assert.equal(ground.geometry, coarse, 'failed candidate cannot replace currently drawn ground');
  region.update({ position: { x: 6000, z: 16 } }, 2, { x: 16, z: 16 });
  assert.notEqual(ground.geometry, coarse, 'retry constructs/publishes the complete fine variant');
  const fine = ground.geometry;
  region.disposeTerrainCache(); fail = true;
  region.update({ position: { x: 3000, z: 16 } }, 100, { x: 10000, z: 10000 });
  assert.equal(ground.geometry, fine); assert.equal(fail, true, 'terminal owner never starts new work');
  const geometries = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); }); for (const g of geometries) g.dispose();
});

baselineTest('regional streaming CPU benchmark: representative cold Twin Peaks full-geometry batch', { skip: process.env.SF_REGIONAL_BENCH !== '1' }, t => {
  const tiles = C.tiles.filter(tile => Math.hypot(-4010.9382626983847 - tile.x - tile.size / 2, 3876.6073298332144 - tile.z - tile.size / 2) < 1600);
  assert.equal(tiles.length, 8);
  const builds = [factory(before), factory(after)], samples = [[], []];
  for (let round = 0; round < 10; round++) for (const variant of round % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now();
    for (let batch = 0; batch < 4; batch++) for (const tile of tiles) builds[variant](C, tile, 1, false).dispose();
    if (round >= 2) samples[variant].push((performance.now() - start) / 4);
  }
  const median = a => { const sorted = a.slice().sort((x, y) => x - y); return (sorted[3] + sorted[4]) / 2; };
  t.diagnostic(JSON.stringify({ baseline: ref, baselineSHA256: hash(before), candidateSHA256: hash(after), tiles: tiles.map(tile => [tile.x, tile.z]),
    samples, medianMs: samples.map(median), scope: 'Node24 CPU wall time incl allocation/normals/bounds; ABBA order, 2 warmups/8 blocks, 4 batches/block; no forced GC; not browser/GPU/FPS' }));
});
