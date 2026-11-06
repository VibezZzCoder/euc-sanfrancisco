// Source/CPU residency diagnostics for fc9826b. No renderer, browser, network, forced GC or runtime edits.
// MIT, © 2026 VibezZzCoder. City/Three notices remain in NOTICE.md and vendor/three/LICENSE.
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';

const root = new URL('../', import.meta.url);
const ref = 'fc9826b2872320bca7f08ac19d7141d3bbc31683';
const history = gitHistory(root, ref);
const test = optionalSourceTest(history.skip);
const source = path => history.read(path);
const sha = value => createHash('sha256').update(value).digest('hex');
const regionSource = source('js/region.js');
const manifest = JSON.parse(source('data/region/manifest.json'));
const dataDigest = createHash('sha256');
const read = path => readFileSync(new URL(path, root));
function bin(path) {
  const b = read(path), n = b.readUInt32LE(4);
  assert.equal(b.toString('utf8', 0, 4), 'SFB1');
  dataDigest.update(path); dataDigest.update(b);
  return { header: JSON.parse(b.toString('utf8', 8, 8 + n)), buf: b.buffer.slice(b.byteOffset, b.byteOffset + b.length), offset: 8 + n };
}
function onceReplace(text, needle, replacement) {
  assert.equal(text.split(needle).length, 2, `unique probe anchor: ${needle}`);
  return text.replace(needle, replacement);
}
const geometryBytes = g => Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, g.index?.array.byteLength || 0);
let loaded;
async function world() {
  if (loaded) return loaded;
  const window = { NYC: { THREE, TSL, cityUniforms: { uInteriorGlow: TSL.uniform(1), uTime: TSL.uniform(0) } } };
  for (const name of ['sf-geodata', 'terrain']) new Function('window', source(`js/${name}.js`))(window);
  const core = bin('data/terrain-core.bin');
  window.NYC.Terrain.load(core.header, new Uint16Array(core.buf, core.offset));
  new Function('window', 'fetch', regionSource)(window, async path => {
    assert.equal(path, 'data/region/manifest.json');
    return { ok: true, json: async () => manifest };
  });
  const data = await window.NYC.loadSFRegion(async path => bin(path));
  window.NYC.installRegionTerrain(data);
  // The production fine-patch installation (sf-ground.js:64–68), before buildSFRegion.
  for (const s of Object.values(window.NYC.GEO.landmarks).filter(s => s.detail)) {
    const d = s.detail;
    window.NYC.Terrain.patches.unshift({ x0: d.x0, z0: d.z0, step: d.step, nx: d.nx, nz: d.nz,
      h: Float32Array.from(d.h, h => h / 10), rect: true });
  }
  window.NYC.DATA = { fullRegion: data };
  const binarySHA256 = dataDigest.digest('hex');
  assert.equal(binarySHA256, '77e22409b0f52dc13679ac317ac73d37c3ebdf64ddfb7c1ed914812f79ef94d5', 'committed baseline input bytes/order');
  return loaded = { window, data, core, binarySHA256 };
}

test('fc9826b regional cache: committed full-exploration ceiling, repeated warm visits and terminal disposal', async t => {
  const { window, data, core, binarySHA256 } = await world();
  const a = regionSource.indexOf('  // Dashed centre paint'), b = regionSource.indexOf('  let last=-Infinity');
  assert.ok(a >= 0 && b > a);
  // Keep the actual terrain construction, update/selection and disposal. Omit unrelated one-time scenery builders.
  let isolated = regionSource.slice(0, a) + '  const roadMeshes=[],buildingMeshes=[],treeMeshes=[],boats=[],cargo=[],buildingCount=0;\n' + regionSource.slice(b);
  isolated = onceReplace(isolated, '  const terrain=[];', '  const terrain=[]; let builds=0,disposals=0;');
  isolated = onceReplace(isolated, '    const n=Math.ceil((t.w-1)/stride),pos=[],idx=[],color=[];', '    builds++; const n=Math.ceil((t.w-1)/stride),pos=[],idx=[],color=[];');
  isolated = onceReplace(isolated, 'const geo=new THREE.BufferGeometry();geo.setAttribute', 'const geo=new THREE.BufferGeometry();geo.addEventListener("dispose",()=>disposals++);geo.setAttribute');
  isolated = onceReplace(isolated, '  return {group,disposeTerrainCache,', `  return {ownershipSnapshot(){
    let cachedBytes=0,activeBytes=0,detachedBytes=0,variants=0,cityTiles=0,horizonTiles=0;
    const cachedByStride=[0,0,0],activeByStride=[0,0,0];
    for(const item of terrain){
      if(item.far)horizonTiles++;else cityTiles++;
      const bytes=g=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index.array.byteLength);
      activeBytes+=bytes(item.mesh.geometry);
      if(!item.far)activeByStride[[1,2,4].indexOf(item.stride)]++;
      for(const [stride,g] of item.geometries){variants++;cachedBytes+=bytes(g);if(g!==item.mesh.geometry)detachedBytes+=bytes(g);if(!item.far)cachedByStride[[1,2,4].indexOf(stride)]++;}
    }
    return {builds,disposals,variants,cityTiles,horizonTiles,cachedBytes,activeBytes,detachedBytes,cachedByStride,activeByStride};
  },group,disposeTerrainCache,`);
  new Function('window', 'location', isolated)(window, { search: '' });
  const scene = new THREE.Scene(), region = window.NYC.buildSFRegion(scene);
  const initial = region.ownershipSnapshot();
  let elapsed = 0;
  const remote = { x: 1e6, z: 1e6 };
  const visit = (x, z, rider = remote) => region.update({ position: { x, z } }, ++elapsed, rider);
  const cityTiles = region.group.children.filter(m => m.name === 'SFRegionTerrain').map(m => m.geometry.boundingSphere.center.clone());
  const tour = () => {
    for (const c of cityTiles) { visit(c.x, c.z); visit(c.x + 3000, c.z); }
    visit(remote.x, remote.z);
  };
  tour();
  const explored = region.ownershipSnapshot();
  assert.equal(initial.cityTiles, 170); assert.equal(initial.horizonTiles, 81);
  assert.deepEqual(explored.cachedByStride, [170, 170, 170]);
  assert.equal(explored.variants, 591); assert.equal(explored.disposals, 0);
  assert.deepEqual(explored.activeByStride, [0, 0, 170]);
  for (let round = 0; round < 3; round++) { tour(); assert.deepEqual(region.ownershipSnapshot(), explored); }
  region.disposeTerrainCache();
  const terminal = region.ownershipSnapshot();
  assert.equal(terminal.variants, 0); assert.equal(terminal.disposals, 340);
  visit(0, 0); region.disposeTerrainCache(); assert.deepEqual(region.ownershipSnapshot(), terminal);
  for (const m of region.group.children) m.geometry.dispose();
  assert.equal(region.ownershipSnapshot().disposals, 591);
  const heights = [window.NYC.Terrain.heights, ...window.NYC.Terrain.patches.map(p => p.h)];
  assert.equal(new Set(heights).size, heights.length, 'patch objects alias the regional grids, not duplicate arrays');
  assert.ok(heights.includes(data.city.heights) && heights.includes(data.horizon.heights));
  const raw = [...data.buildings.map(b => b.records), data.trees, data.roads];
  const buffers = new Set(raw.map(a => a.buffer));
  t.diagnostic(JSON.stringify({ ref, regionSHA256: sha(regionSource), binarySHA256, initial, explored,
    warmTourRepeats: 3, terminalDetachedDisposals: terminal.disposals,
    decodedData: { coreHeights: window.NYC.Terrain.heights.byteLength, coreQuantized: core.header.w * core.header.h * 2,
      cityHeights: data.city.heights.byteLength, horizonHeights: data.horizon.heights.byteLength,
      finePatchHeights: heights.slice(1).filter(h => h !== data.city.heights && h !== data.horizon.heights).reduce((n, h) => n + h.byteLength, 0),
      regionMask: data.mask.byteLength, retainedRegionRawPayload: raw.reduce((n, a) => n + a.byteLength, 0),
      retainedRegionRawBackingIncludingHeaders: [...buffers].reduce((n, b) => n + b.byteLength, 0),
      regionalBuildings: data.buildings.reduce((n, b) => n + b.records.length / 7, 0), regionalTrees: data.trees.length / 4 },
    scope: 'CPU typed payloads; terrain-only production selector; exhaustive synthetic view tour, not native routes, heap/RSS/GPU or GC timing' }));
});

test('fc9826b core travel replaces current tile buffers, with constant range/scratch ownership', async t => {
  const { window } = await world(), N = window.NYC;
  // Real grade construction in the ordinary realm. No scene render or shader compile.
  N.DEBUG_ROADS = false;
  N.createRoadSurfaceMaterial = N.createMarbleAshlarMaterial = () => new THREE.MeshBasicMaterial();
  for (const name of ['city-config', 'road-network', 'sf-ride-geometry', 'grade-separation']) new Function('window', source(`js/${name}.js`))(window);
  const enabled = N.Terrain.patchesEnabled; N.Terrain.patchesEnabled = false;
  const network = N.buildRoadNetwork(N.BLOCKS.map(block => ({ ...block, block })), []);
  N.GradeSeparation = N.buildGradeSeparation(new THREE.Group(), network);
  N.Terrain.patchesEnabled = enabled;
  N.SHADOW_PROXY_LAYER = 3; N.createTerrainMaterial = () => new THREE.MeshBasicMaterial();
  N.DATA.groundMask = { header: { w: 1, h: 1 }, mask: new Uint8Array(1) };
  const code = source('js/terrain-mesh.js');
  new Function('window', 'console', code)(window, { info() {} });
  const scene = new THREE.Scene(), core = N.buildTerrainMesh(scene);
  const tiles = core.group.children.filter(m => m.name === 'TerrainTile');
  const path = Array.from({ length: 13 }, (_, i) => {
    const d = i * 20.2;
    return { x: -444.56936973297985 + Math.sin(-2.9796452145077765) * d,
      y: 34.1, z: -173.9223466770852 + Math.cos(-2.9796452145077765) * d };
  });
  let replacements = 0, disposed = 0, allocatedOutputBytes = 0, maxActiveBytes = 0, elapsed = 0;
  const reuseBytes = core.stats().reuseBytes;
  for (let round = 0; round < 6; round++) for (const p of [...path, ...path.slice(0, -1).reverse()]) {
    const previous = tiles.map(m => m.geometry);
    previous.forEach(g => g.addEventListener('dispose', count));
    core.update(p, ++elapsed, p);
    for (let i = 0; i < tiles.length; i++) {
      previous[i].removeEventListener('dispose', count);
      if (tiles[i].geometry !== previous[i]) { replacements++; allocatedOutputBytes += geometryBytes(tiles[i].geometry); }
    }
    maxActiveBytes = Math.max(maxActiveBytes, tiles.reduce((n, m) => n + geometryBytes(m.geometry), 0));
    assert.equal(core.stats().reuseBytes, reuseBytes);
  }
  function count() { disposed++; }
  assert.equal(disposed, replacements); assert.ok(replacements > 100);
  assert.equal(reuseBytes, 101360); assert.equal(tiles.length, 84);
  t.diagnostic(JSON.stringify({ ref, coreSHA256: sha(code), syntheticUpdates: elapsed, replacements, disposed,
    allocatedOutputBytes, maxActiveBytes, reuseBytes, generatedChunks: core.stats().generatedChunks,
    reusedChunks: core.stats().reusedChunks, scope: 'typed replacement output allocation LOWER bound; excludes staging/JS, renderer/GPU, GC; synthetic repeated Stockton view path' }));
  core.dispose(); assert.equal(core.stats().reuseBytes, 0);
  scene.traverse(m => { m.geometry?.dispose(); }); scene.clear();
});

test('fc9826b regional tree prism lazy-edge/decomposition full-set potential, streamed one prism at a time', async t => {
  const { data } = await world();
  const sampler = source('js/sf-terrain-sampler.js');
  const helperCode = sampler.slice(0, sampler.indexOf('export class SfTerrainSampler')).replace(/^import .*;\n/gm, '').replaceAll('export ', '');
  const { PreparedPrism, contactPieces } = new Function(helperCode + '\nreturn {PreparedPrism,contactPieces};')();
  let edges = 0, pieces = 0, scratchBytes = 0, maxPieces = 0;
  const histogram = {};
  for (let k = 0; k < data.trees.length; k += 4) {
    const x = data.trees[k], y = data.trees[k + 1], z = data.trees[k + 2], h = data.trees[k + 3];
    const radius = Math.max(.08, h * .022);
    // Exact region.js:389–392 registration. Nothing in this loop is retained after its iteration.
    const poly = Array.from({ length: 8 }, (_, j) => ({ x: x + Math.sin(j * Math.PI / 4) * radius, z: z + Math.cos(j * Math.PI / 4) * radius }));
    const p = new PreparedPrism({ poly, minY: y, maxY: y + h * .5, support: false }, k / 4);
    assert.equal(p._edges, null); assert.equal(p.contactPieces, null);
    const decomposition = contactPieces(p);
    edges += p._edges.length; pieces += decomposition.length;
    maxPieces = Math.max(maxPieces, decomposition.length);
    histogram[decomposition.length] = (histogram[decomposition.length] || 0) + 1;
    for (const piece of decomposition) scratchBytes += piece.distanceScratch.byteLength;
  }
  assert.equal(edges, data.trees.length / 4 * 8); assert.ok(maxPieces <= 28);
  assert.equal(scratchBytes, pieces * 32);
  t.diagnostic(JSON.stringify({ ref, trees: data.trees.length / 4, potentialParentEdges: edges,
    potentialContactPieces: pieces, potentialDistanceScratchBytes: scratchBytes, maxPieces, pieceCountHistogram: histogram,
    scope: 'all committed regional tree rings only, potential lazy residency if EVERY trunk is queried/decomposed; not live coverage, total JS bytes, other core prisms, or a leak' }));
});

test('fc9826b fixed procedural PCM and selected WAV duration/PCM inventory (no Web Audio)', t => {
  const synth = source('js/audio-synthesis.js'), events = source('js/audio-events.js');
  const createSynth = new Function(synth.replaceAll('export ', '') + '\nreturn createSynthResources;')();
  const createEvents = new Function('setControlRate', events.replace(/^import .*;\n/m, '').replaceAll('export ', '') + '\nreturn createEventResources;')(() => {});
  const pcm = [];
  const context = { sampleRate: 48000, createPeriodicWave() { return {}; }, createBuffer(channels, length, sampleRate) {
    const arrays = Array.from({ length: channels }, () => new Float32Array(length));
    const b = { length, numberOfChannels: channels, sampleRate, duration: length / sampleRate, getChannelData: i => arrays[i] };
    pcm.push(b); return b;
  } };
  createEvents(context, createSynth(context));
  const audioSource = source('js/euc-audio.js');
  const files = [...audioSource.matchAll(/\w+: '([^']+\.wav)'/g)].map(m => m[1]);
  const wavs = files.map(file => {
    const b = read(`audio/euc/${file}`); let fmt, frames;
    for (let at = 12; at + 8 <= b.length;) {
      const tag = b.toString('ascii', at, at + 4), n = b.readUInt32LE(at + 4), p = at + 8;
      if (tag === 'fmt ') fmt = { channels: b.readUInt16LE(p + 2), rate: b.readUInt32LE(p + 4), block: b.readUInt16LE(p + 12) };
      if (tag === 'data') { assert.ok(fmt); frames = n / fmt.block; }
      at = p + n + (n % 2);
    }
    assert.ok(fmt && Number.isInteger(frames));
    return { file, channels: fmt.channels, sampleRate: fmt.rate, frames,
      pcmAtNativeRate: frames * fmt.channels * 4, pcmAt48k: Math.ceil(frames / fmt.rate * 48000) * fmt.channels * 4 };
  });
  assert.equal(wavs.length, 15);
  const sum = list => list.reduce((n, b) => n + b.length * b.numberOfChannels * 4, 0);
  t.diagnostic(JSON.stringify({ ref, sampleRate: context.sampleRate, proceduralBuffers: pcm.length, proceduralPCMBytes: sum(pcm), wavs,
    scope: 'fixed startup synthesis and WAV-derived float PCM; browser resampler/channel copies/native graph overhead excluded; no playback/listening' }));
});
