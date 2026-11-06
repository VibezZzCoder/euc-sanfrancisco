// CPU-only construction/observer diagnostics. MIT, © 2026 VibezZzCoder.
// No browser, renderer, native GC trigger, output pool or production test hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { THREE, root, world, crop, routes, historical, history as worldHistory, release } from './helpers/terrain-hitch-fixture.mjs';

const ref = 'fc9826b2872320bca7f08ac19d7141d3bbc31683';
const history = gitHistory(root, ref);
const baselineTest = optionalSourceTest(history.skip);
const worldTest = optionalSourceTest(history.skip || worldHistory.skip);
const pinned = path => history.read(path);
const baseline = pinned('js/terrain-mesh.js');
const current = readFileSync(new URL('../js/terrain-mesh.js', import.meta.url), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const geometryBytes = g => Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, g.index?.array.byteLength || 0);
const drawingHash = d => {
  const hash = createHash('sha256');
  for (const m of d.mesh.group.children) for (const attr of [...Object.values(m.geometry.attributes), m.geometry.index].filter(Boolean)) hash.update(bytes(attr.array));
  return hash.digest('hex');
};
const types = { Float64Array, Float32Array, Uint32Array, Uint16Array };

function build(source, terrain, grade, { tracked = false } = {}) {
  const counts = { calls: 0, typedBytes: 0, doubleElements: 0, chunkArrays: 0 };
  const trackedTypes = Object.fromEntries(Object.entries(types).map(([name, Type]) => [name, new Proxy(Type, {
    construct(Target, args) {
      const result = Reflect.construct(Target, args);
      counts.calls++; counts.typedBytes += result.byteLength;
      return result;
    }
  })]));
  if (tracked && source.includes('const pos = [], nrm = [], idx = [];')) {
    source = source.replace('const pos = [], nrm = [], idx = [];', 'const pos = [], nrm = [], idx = []; counts.chunkArrays += 3;');
    source = source.replace('        writeChunk(c, pos, nrm, idx);',
      '        writeChunk(c, pos, nrm, idx); counts.doubleElements += pos.length + nrm.length + idx.length;');
  }
  source = source.replace('    group,\n    update,', `    _cpu:()=>({heights,tiles,ranges:tiles.map(t=>t.ranges),
      scratch:typeof chunkPos==='undefined'?[]:[chunkPos,chunkNrm,chunkIdx,stagePos,stageNrm,stageIdx],
      changed:typeof changed==='undefined'?null:changed}),
    group,\n    update,`);
  const N = { THREE, Terrain: terrain, GradeSeparation: grade, SHADOW_PROXY_LAYER: 3,
    DATA: { groundMask: { header: { w: 1, h: 1 }, mask: new Uint8Array(1) } },
    createTerrainMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
  const selected = tracked ? trackedTypes : types;
  new Function('window', 'console', 'counts', ...Object.keys(types), source)(
    { NYC: N }, { info() {} }, counts, ...Object.keys(types).map(k => selected[k]));
  const mesh = N.buildTerrainMesh(new THREE.Group());
  return { mesh, N, counts, clear() { for (const key of Object.keys(counts)) counts[key] = 0; } };
}

function equal(a, b, label, { generatedExtra = 0 } = {}) {
  const left = a.mesh.group.children, right = b.mesh.group.children;
  assert.equal(left.length, right.length);
  let comparisons = 0;
  for (let i = 0; i < left.length; i++) {
    const x = left[i], y = right[i];
    for (const key of ['name', 'castShadow', 'receiveShadow', 'visible', 'matrixAutoUpdate', 'frustumCulled']) assert.equal(y[key], x[key], `${label}/${i}/${key}`);
    assert.equal(y.layers.mask, x.layers.mask);
    assert.equal(right.indexOf(y.userData.sharesPipelineWith), left.indexOf(x.userData.sharesPipelineWith));
    assert.deepEqual(y.geometry.boundingBox, x.geometry.boundingBox, label);
    assert.deepEqual(y.geometry.boundingSphere, x.geometry.boundingSphere, label);
    for (const key of ['position', 'normal', 'index']) {
      const p = key === 'index' ? x.geometry.index : x.geometry.attributes[key];
      const q = key === 'index' ? y.geometry.index : y.geometry.attributes[key];
      if (!p) { assert.equal(q, undefined); continue; }
      assert.equal(q.array.constructor, p.array.constructor, `${label}/${key}/type`);
      assert.ok(bytes(p.array).equals(bytes(q.array)), `${label}/${i}/${key} bytes`); comparisons++;
    }
  }
  for (const key of ['rebuilt', 'reusedChunks', 'reuseBytes']) assert.equal(b.mesh.stats()[key], a.mesh.stats()[key]);
  assert.equal(b.mesh.stats().generatedChunks, a.mesh.stats().generatedChunks + generatedExtra);
  assert.deepEqual(b.mesh.stats().lods, a.mesh.stats().lods);
  assert.deepEqual(b.mesh._cpu().ranges, a.mesh._cpu().ranges);
  return comparisons;
}

worldTest('core fc9826b: three actual routes/returns are byte-exact; warm staging allocates no typed payload', t => {
  // The existing geographic helper is pinned to 2ff1a7c. Prove its world inputs equal this task's baseline.
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'road-network', 'sf-ride-geometry', 'grade-separation']) {
    assert.equal(historical(`js/${name}.js`), pinned(`js/${name}.js`));
  }
  const { terrain, grade } = world(), originalHeights = sha(bytes(terrain.heights));
  const a = build(baseline, terrain, grade, { tracked: true }), b = build(current, terrain, grade, { tracked: true });
  const sequence = Object.values(routes()).flatMap(path => [...path, ...path.slice().reverse()]);
  let time = 0, comparisons = 0, snapshots = 0;
  const visit = point => { a.mesh.update(point.camera, ++time, point.rider); b.mesh.update(point.camera, time, point.rider); };
  try {
    comparisons += equal(a, b, 'cold'); snapshots++;
    for (const point of sequence) { visit(point); comparisons += equal(a, b, `warmup/${snapshots++}`); }
    const constructionBytes = b.mesh.stats().constructionBytes;
    assert.ok(constructionBytes > 0 && constructionBytes <= 4588032);
    const retained = b.mesh._cpu().scratch.map(s => s.retained);
    a.clear(); b.clear();
    let outputBytes = 0, rangeBytes = 0, replacements = 0, disposed = 0;
    const count = () => { disposed++; };
    for (const point of sequence) {
      const tiles = b.mesh.group.children.filter(m => m.name === 'TerrainTile'), previous = tiles.map(m => m.geometry);
      previous.forEach(g => g.addEventListener('dispose', count));
      visit(point);
      for (let i = 0; i < tiles.length; i++) {
        previous[i].removeEventListener('dispose', count);
        if (previous[i] !== tiles[i].geometry) {
          replacements++; outputBytes += geometryBytes(tiles[i].geometry);
          rangeBytes += b.mesh._cpu().ranges[i].byteLength;
        }
      }
      comparisons += equal(a, b, `repeat/${snapshots++}`);
      assert.equal(b.mesh.stats().constructionBytes, constructionBytes);
      b.mesh._cpu().scratch.forEach((s, i) => assert.equal(s.retained, retained[i], 'warm staging capacity/identity stable'));
    }
    assert.equal(disposed, replacements);
    assert.equal(b.counts.typedBytes, outputBytes + rangeBytes, 'warm construction adds NO per-chunk/per-tile typed staging allocation');
    assert.ok(a.counts.typedBytes > b.counts.typedBytes);
    assert.ok(a.counts.chunkArrays > 0 && a.counts.doubleElements > 0);
    assert.equal(b.counts.chunkArrays, 0); assert.equal(b.counts.doubleElements, 0);
    assert.equal(sha(bytes(terrain.heights)), originalHeights);
    const scratchBuffers = new Set(b.mesh._cpu().scratch.map(s => s.retained.buffer));
    for (const tile of b.mesh.group.children) for (const attr of [...Object.values(tile.geometry.attributes), tile.geometry.index].filter(Boolean)) {
      assert.ok(!scratchBuffers.has(attr.array.buffer), 'attached outputs never alias CPU staging');
    }
    t.diagnostic(JSON.stringify({ ref, baselineSHA256: sha(baseline), currentSHA256: sha(current), snapshots, comparisons,
      warmUpdates: sequence.length, replacements, disposed, outputBytes, rangeBytes, baseline: a.counts, current: b.counts,
      constructionBytes, reuseBytes: b.mesh.stats().reuseBytes,
      scope: 'constructor payload counts/source numeric elements, not V8 heap/GC/GPU; only warm second tour counted' }));
  } finally { release(a); release(b); }
});

worldTest('core invalidation, full-precision clipping, bounded overflow/failure cleanup and terminal range/scratch release', t => {
  const { terrain, grade } = world(), T = crop(terrain, 24, 32);
  // Force temporary scratch overflow using tiny retention budgets; geometry must remain exact without truncation.
  const tiny = current.replace(/new TerrainScratchArray\((Float64Array|Float32Array|Uint32Array), \d+, \d+\)/g,
    'new TerrainScratchArray($1, 64, 128)');
  assert.notEqual(tiny, current);
  const a = build(baseline, T, null), b = build(tiny, T, null, { tracked: true });
  const point = routes().stockton[0];
  let checks = 0;
  try {
    a.mesh.update(point.camera, 0, point.rider); b.mesh.update(point.camera, 0, point.rider); equal(a, b, 'pre-grade'); checks++;
    const pre = drawingHash(a);
    a.N.GradeSeparation = b.N.GradeSeparation = grade;
    a.mesh.rebuild(); b.mesh.rebuild(); equal(a, b, 'grade-cuts'); checks++;
    assert.notEqual(drawingHash(a), pre, 'disabled-carve/invalidation negative control');
    for (let i = 0; i < T.heights.length; i++) T.heights[i] += .1234567;
    a.mesh.rebuild(); b.mesh.rebuild(); equal(a, b, 'height-invalidation'); checks++;
    const early = build(current.replace(/new TerrainScratchArray\(Float64Array/g, 'new TerrainScratchArray(Float32Array'), T, grade);
    try {
      early.mesh.update(point.camera, 0, point.rider);
      assert.notEqual(drawingHash(early), drawingHash(a), 'early-Float32 clipping negative control must change output');
    } finally { release(early); }
    assert.ok(b.counts.typedBytes > b.mesh.stats().constructionBytes, 'oversized temporary arrays were actually constructed');
    const scratch = b.mesh._cpu().scratch;
    for (const s of scratch) { assert.equal(s.array, s.retained); assert.equal(s.length, 0); assert.ok(s.retained.length <= s.limit); }
    // Fail the NEXT changed chunk only once all three streams have staged the first complete chunk.
    // Closure introspection is confined to this test factory; the runtime receives no inspection hook.
    const cpu = b.mesh._cpu(), stage = scratch.slice(3), firstTile = cpu.tiles[0];
    assert.ok(firstTile.members.length >= 2);
    // Give the failed tile a genuinely different pending LOD key, so an early key write is observable.
    firstTile.members[1].lod = (firstTile.members[1].lod + 1) % 4;
    a.mesh._cpu().tiles[0].members[1].lod = firstTile.members[1].lod;
    const pendingKey = firstTile.members.map(c => c.lod).join('');
    assert.notEqual(pendingKey, firstTile.key);
    const beforeFailure = cpu.tiles.map(tile => ({ geometry: tile.mesh.geometry, ranges: tile.ranges,
      rangeBytes: bytes(tile.ranges).toString('hex'), key: tile.key }));
    const beforeFailureHash = drawingHash(b), generatedBeforeFailure = b.mesh.stats().generatedChunks;
    let failedAfterStage = null, failedDisposals = 0, carveCalls = 0;
    const failure = new Error('controlled sampling failure after one staged chunk');
    const countFailureDispose = () => { failedDisposals++; };
    beforeFailure.forEach(s => s.geometry.addEventListener('dispose', countFailureDispose));
    b.N.GradeSeparation = { ...grade, carveAt(...args) {
      carveCalls++;
      if (stage.every(s => s.length > 0)) {
        const stagedChunks = firstTile.members.reduce((n, _, i) => n + Number(cpu.changed[i * 2] !== 0xffffffff), 0);
        failedAfterStage = { stagedChunks, lengths: stage.map(s => s.length),
          oversized: stage.map(s => s.array !== s.retained) };
        throw failure;
      }
      return grade.carveAt(...args);
    } };
    try {
      assert.throws(() => b.mesh.rebuild(), error => error === failure);
      assert.ok(carveCalls > 1, 'failure occurs later than the first carve sample');
      assert.equal(failedAfterStage?.stagedChunks, 1, 'exactly one complete changed chunk reached all staging streams');
      assert.ok(failedAfterStage.lengths.every(n => n > 0));
      assert.ok(failedAfterStage.oversized.every(Boolean), 'the tiny-budget staging overflow was live at failure');
      assert.equal(b.mesh.stats().generatedChunks - generatedBeforeFailure, 1, 'failed but completed work is counted once');
      assert.equal(failedDisposals, 0, 'no old tile geometry disposed before successful publication');
      for (let i = 0; i < cpu.tiles.length; i++) {
        const tile = cpu.tiles[i], prior = beforeFailure[i];
        assert.equal(tile.mesh.geometry, prior.geometry, `failed tile/unvisited tile ${i}: same geometry identity`);
        assert.equal(tile.ranges, prior.ranges, `failed tile/unvisited tile ${i}: same ranges identity`);
        assert.equal(bytes(tile.ranges).toString('hex'), prior.rangeBytes, `tile ${i}: range contents unchanged`);
        assert.equal(tile.key, prior.key, `tile ${i}: published LOD key unchanged`);
      }
      assert.equal(drawingHash(b), beforeFailureHash, 'all published output bytes remain unchanged after partial staging failure');
      for (const s of scratch) {
        assert.equal(s.array, s.retained); assert.equal(s.length, 0);
        assert.ok(s.retained.length <= s.limit, 'all six workspaces drop overflow back to bounded retention');
      }
    } finally { beforeFailure.forEach(s => s.geometry.removeEventListener('dispose', countFailureDispose)); }
    b.N.GradeSeparation = grade; a.mesh.rebuild(); b.mesh.rebuild();
    equal(a, b, 'recovered-rebuild', { generatedExtra: 1 }); checks++;
    assert.notEqual(firstTile.mesh.geometry, beforeFailure[0].geometry, 'retry publishes replacement geometry');
    assert.notEqual(firstTile.ranges, beforeFailure[0].ranges, 'retry publishes replacement ranges');
    assert.equal(firstTile.key, pendingKey, 'only successful retry publishes the pending LOD key');
    const tiles = b.mesh.group.children.filter(m => m.name === 'TerrainTile'), outputs = tiles.map(m => m.geometry);
    const outputHashes = outputs.map(g => sha(bytes(g.attributes.position.array)));
    let disposals = 0; outputs.forEach(g => g.addEventListener('dispose', () => { disposals++; }));
    b.mesh.dispose(); b.mesh.dispose();
    assert.equal(b.mesh.stats().constructionBytes, 0); assert.equal(b.mesh.stats().reuseBytes, 0);
    assert.ok(b.mesh._cpu().ranges.every(r => r === null)); assert.equal(b.mesh._cpu().changed, null);
    scratch.forEach(s => { assert.equal(s.retained, null); assert.equal(s.array, null); });
    b.mesh.update(point.camera, 99, point.rider); b.mesh.rebuild();
    assert.deepEqual(tiles.map(m => m.geometry), outputs);
    assert.deepEqual(outputs.map(g => sha(bytes(g.attributes.position.array))), outputHashes);
    assert.equal(disposals, 0, 'terminal CPU cleanup leaves attached output disposal to drained scene owner');
    t.diagnostic(JSON.stringify({ checks, forcedTinyBudgets: true, exactInvalidation: true, terminalOutputOwnership: true,
      failedAfterStage, failedTilePublicationUnchanged: true, retryExactWithOneUnpublishedGeneratedChunk: true }));
  } finally { release(a); release(b); }
});

baselineTest('index16→32→16 on the SAME tile, partial grid/steep water edges and forced-Uint16 negative control', t => {
  const w = 514, h = 266;
  const heights = Float32Array.from({ length: w * h }, (_, k) => k % w < 12 ? (k % 3 === 0 ? .05 : -.25)
    : 22.1234567 + k % w * .05 + Math.sin(Math.floor(k / w) * .3) * 21.231);
  const T = { w, h, heights, originX: -.123456789, originZ: -307.987654321, cell: 2, waterLevel: 0 };
  const a = build(baseline, T, null), b = build(current, T, null);
  const badWidth = build(current.replace('vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)', 'new Uint16Array(indices)'), T, null);
  const widths = b.mesh.group.children.filter(m => m.name === 'TerrainTile').map(m => [m.geometry.index.array.BYTES_PER_ELEMENT]);
  try {
    let negativeControls = 0;
    const points = [[-1000, 2000, -1000], [384, 30, 12], [520, 30, 64], [1500, 300, 64],
      [256, 30, -50], [1026, 900, 222], [-1000, 2000, -1000]];
    for (const [i, [x, y, z]] of points.entries()) {
      const camera = { x, y, z }, rider = i <= 1 ? { x: 160, z: -84 } : camera;
      a.mesh.update(camera, i, rider); b.mesh.update(camera, i, rider); equal(a, b, `width/${i}`);
      badWidth.mesh.update(camera, i, rider);
      if (b.mesh.group.children.some(m => m.name === 'TerrainTile' && m.geometry.index.array.BYTES_PER_ELEMENT === 4)) {
        assert.throws(() => equal(a, badWidth, 'forced-uint16'), /index\/type|bytes/); negativeControls++;
      }
      b.mesh.group.children.filter(m => m.name === 'TerrainTile').forEach((m, j) => widths[j].push(m.geometry.index.array.BYTES_PER_ELEMENT));
    }
    const transitions = widths.map(v => v.filter((n, i) => !i || n !== v[i - 1]));
    assert.ok(transitions.some(v => v.some((n, i) => n === 2 && v[i + 1] === 4 && v[i + 2] === 2)));
    assert.ok(negativeControls > 0);
    t.diagnostic(JSON.stringify({ transitions, forcedUint16NegativeControls: negativeControls }));
  } finally { release(a); release(b); release(badWidth); }
});

worldTest('CPU attribution: alternate warm core updates with unchanged final output allocation', { skip: process.env.SF_CORE_ALLOCATION_BENCH !== '1' }, t => {
  const { terrain, grade } = world(), samples = [[], []];
  const path = Object.values(routes()).flatMap(path => [...path, ...path.slice().reverse()]);
  const drawings = [build(baseline, terrain, grade), build(current, terrain, grade)], time = [0, 0];
  try {
    for (let round = 0; round < 8; round++) for (const side of round % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now();
      for (const p of path) drawings[side].mesh.update(p.camera, ++time[side], p.rider);
      if (round >= 2) samples[side].push(performance.now() - start);
    }
  } finally { drawings.forEach(release); }
  const median = values => { const v = [...values].sort((a, b) => a - b); return (v[2] + v[3]) / 2; };
  t.diagnostic(JSON.stringify({ updatesPerBlock: path.length, blockMilliseconds: samples, medianBlockMilliseconds: samples.map(median),
    scope: 'Node CPU including geometry/disposal/bounds, no forced GC; same persistent builders, two warmup pairs then six alternating pairs; no browser FPS/majorGC claim' }));
});

const observerChecks = new URL('./core-observer.private.mjs', import.meta.url);
if (existsSync(observerChecks)) await import(observerChecks.href);
else test('optional endurance observer checks', { skip: 'development-only observer helper is not shipped' }, () => {});
