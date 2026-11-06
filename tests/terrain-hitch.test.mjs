import { optionalSourceTest } from './helpers/optional-source.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { history, baselineSource, currentSource, world, drawing, release, crop, routes } from './helpers/terrain-hitch-fixture.mjs';
const test = optionalSourceTest(history.skip);

const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function equalDrawing(a, b, label) {
  const ac = a.mesh.group.children, bc = b.mesh.group.children;
  assert.equal(ac.length, bc.length, `${label}: mesh/draw count`);
  let attributes = 0;
  for (let i = 0; i < ac.length; i++) {
    const x = ac[i], y = bc[i];
    for (const k of ['name', 'castShadow', 'receiveShadow', 'visible', 'matrixAutoUpdate', 'frustumCulled']) {
      assert.equal(x[k], y[k], `${label}: ${k}`);
    }
    assert.equal(x.layers.mask, y.layers.mask);
    assert.equal(ac.indexOf(x.userData.sharesPipelineWith), bc.indexOf(y.userData.sharesPipelineWith));
    for (const k of ['position', 'normal', 'index']) {
      const p = k === 'index' ? x.geometry.index : x.geometry.attributes[k];
      const q = k === 'index' ? y.geometry.index : y.geometry.attributes[k];
      if (!p) { assert.equal(q, undefined); continue; }
      assert.equal(p.array.BYTES_PER_ELEMENT, q.array.BYTES_PER_ELEMENT);
      assert.ok(bytes(p.array).equals(bytes(q.array)), `${label}: mesh ${i} ${k} exact bytes`);
      attributes++;
    }
    assert.deepEqual(x.geometry.boundingBox, y.geometry.boundingBox, `${label}: bounding box`);
    assert.deepEqual(x.geometry.boundingSphere, y.geometry.boundingSphere, `${label}: bounding sphere`);
  }
  assert.deepEqual(Array.from(a.mesh.stats().lods), Array.from(b.mesh.stats().lods));
  assert.equal(a.mesh.stats().rebuilt, b.mesh.stats().rebuilt);
  return attributes;
}
const hashTiles = mesh => {
  const hash = createHash('sha256');
  for (const o of mesh.group.children) if (o.name === 'TerrainTile') hash.update(bytes(o.geometry.attributes.position.array));
  return hash.digest('hex');
};

test('real core: Git 2ff1a7c exact ordered geometry, normals, indices, culling/shadows across three routes and returns', () => {
  const { terrain, grade } = world();
  const beforeHeights = createHash('sha256').update(bytes(terrain.heights)).digest('hex');
  const a = drawing(baselineSource, terrain, grade, { count: true });
  const b = drawing(currentSource, terrain, grade, { count: true, inspect: true });
  let attributes = equalDrawing(a, b, 'cold'), t = 0, checks = 1, sampleBefore = 0, sampleAfter = 0;
  const initialBytes = b.mesh.stats().reuseBytes;
  let smallTileChanges = 0, maxTileBytes = 0, maxChunkStagingBytes = 0;
  try {
    for (const [name, path] of Object.entries(routes())) {
      for (const [i, point] of [...path, ...path.slice().reverse()].entries()) {
        t += .3;
        const oldRanges = b.mesh._reuse().ranges, generated = b.mesh.stats().generatedChunks;
        a.clearCalls(); b.clearCalls();
        a.mesh.update(point.camera, t, point.rider); b.mesh.update(point.camera, t, point.rider);
        let expectedGenerated = 0;
        for (const [tile, ranges] of b.mesh._reuse().ranges.entries()) {
          let changes = 0;
          for (let r = 0; r < ranges.length; r += 5) {
            if (oldRanges[tile][r] !== ranges[r]) changes++;
            maxChunkStagingBytes = Math.max(maxChunkStagingBytes, ranges[r + 2] * 24 + ranges[r + 4] * 4);
          }
          if (changes >= 1 && changes <= 3) smallTileChanges++;
          expectedGenerated += changes;
        }
        assert.equal(b.mesh.stats().generatedChunks - generated, expectedGenerated, 'only changed LOD chunks generated');
        for (const o of b.mesh.group.children) if (o.name === 'TerrainTile') {
          maxTileBytes = Math.max(maxTileBytes, o.geometry.attributes.position.array.byteLength +
            o.geometry.attributes.normal.array.byteLength + o.geometry.index.array.byteLength);
        }
        sampleBefore += a.calls(); sampleAfter += b.calls();
        attributes += equalDrawing(a, b, `${name}/${i}`); checks++;
        assert.equal(b.mesh.stats().reuseBytes, initialBytes, 'travel retains no obsolete variants');
      }
    }
    assert.ok(b.mesh.stats().reusedChunks > 1000, 'the actual traversed updates reuse unchanged geometry');
    assert.ok(smallTileChanges > 100, 'many observed-style 1–3-chunk tile changes covered');
    assert.ok(sampleAfter < sampleBefore / 4, 'sampling reduction is structural, not a timing assertion');
    assert.equal(createHash('sha256').update(bytes(terrain.heights)).digest('hex'), beforeHeights, 'physical source untouched');
    assert.equal(b.mesh._reuse().heights.byteLength, 9800);
    for (const range of b.mesh._reuse().ranges) assert.equal(Object.prototype.toString.call(range), '[object Uint32Array]');
    console.log(JSON.stringify({ checks, exactAttributeComparisons: attributes, sampleBefore, sampleAfter,
      smallTileChanges, maxTileBytes, maxChunkStagingBytes, stats: b.mesh.stats() }));
  } finally { release(a); release(b); }
});

test('post-grade rebuild invalidates every chunk, preserves tunnel cuts and refreshed heights; terminal release is idempotent', () => {
  const { terrain, grade } = world();
  // Four full 512 m tiles around Stockton, with real unrounded carve/clipping arithmetic.
  const T = crop(terrain, 24, 32);
  const a = drawing(baselineSource, T, null), b = drawing(currentSource, T, null, { inspect: true });
  try {
    const point = routes().stockton[0];
    a.mesh.update(point.camera, 0, point.rider); b.mesh.update(point.camera, 0, point.rider);
    equalDrawing(a, b, 'pre-grade');
    const preGrade = hashTiles(a.mesh), shadow = a.mesh.group.children.filter(o => o.name === 'ShadowProxy').map(o => o.geometry);
    a.N.GradeSeparation = grade; b.N.GradeSeparation = grade;
    a.mesh.rebuild(); b.mesh.rebuild();
    equalDrawing(a, b, 'post-grade');
    assert.notEqual(hashTiles(b.mesh), preGrade, 'real tunnel carving changes this fixture');
    assert.deepEqual(a.mesh.group.children.filter(o => o.name === 'ShadowProxy').map(o => o.geometry), shadow,
      'baseline shadow rebuild semantics preserved');
    const old = b.mesh.group.children.filter(o => o.name === 'TerrainTile').map(o => o.geometry);
    let disposed = 0;
    old.forEach(g => g.addEventListener('dispose', () => disposed++));
    const before = hashTiles(b.mesh), samples = b.mesh.stats().generatedChunks;
    for (let i = 0; i < T.heights.length; i++) T.heights[i] += .1234567;
    a.mesh.rebuild(); b.mesh.rebuild();
    equalDrawing(a, b, 'height-invalidation');
    assert.notEqual(hashTiles(b.mesh), before);
    assert.equal(disposed, old.length, 'replaced GPU geometries disposed exactly once');
    assert.equal(b.mesh.stats().generatedChunks - samples, b.mesh.stats().lods.reduce((s, n) => s + n, 0));
    const current = b.mesh.group.children.filter(o => o.name === 'TerrainTile').map(o => o.geometry);
    for (let i = 0; i < current.length; i++) {
      assert.notEqual(current[i].attributes.position.array.buffer, old[i].attributes.position.array.buffer);
    }
    b.mesh.dispose(); b.mesh.dispose();
    assert.equal(b.mesh.stats().reuseBytes, 0);
    assert.equal(b.mesh._reuse().heights, null);
    assert.ok(b.mesh._reuse().ranges.every(r => r === null));
    const terminal = hashTiles(b.mesh);
    b.mesh.update({ x: 9000, y: 9000, z: 9000 }, 99); b.mesh.rebuild();
    assert.equal(hashTiles(b.mesh), terminal, 'terminal callbacks cannot resurrect CPU caches or GPU buffers');
    assert.equal(disposed, old.length);
  } finally { release(a); release(b); }
});

test('partial edge chunks, waterline, steep slopes, 16/32-bit index transitions and detached rider near-field remain exact', () => {
  const w = 514, h = 266;
  const heights = Float32Array.from({ length: w * h }, (_, k) => {
    const x = k % w, z = Math.floor(k / w);
    return x < 12 ? (x % 3 === 0 ? .05 : -.25) : 22.1234567 + x * .05 + Math.sin(z * .3) * 21.231;
  });
  const T = { w, h, heights, originX: -.123456789, originZ: -307.987654321, cell: 2, waterLevel: 0 };
  const a = drawing(baselineSource, T, null), b = drawing(currentSource, T, null);
  const widthHistory = new Map(b.mesh.group.children.filter(o => o.name === 'TerrainTile')
    .map(o => [o, [o.geometry.index.array.BYTES_PER_ELEMENT]]));
  try {
    const points = [[-1000, 2000, -1000], [384, 30, 12], [520, 30, 64], [1500, 300, 64],
      [256, 30, -50], [1026, 900, 222], [-1000, 2000, -1000]];
    for (const [i, [x, y, z]] of points.entries()) {
      const camera = { x, y, z }, rider = i <= 1 ? { x: 160, z: -84 } : camera;
      a.mesh.update(camera, i, rider); b.mesh.update(camera, i, rider);
      equalDrawing(a, b, `edges/${i}`);
      if (i === 0) assert.ok(b.mesh.stats().lods[0] > 0, 'rider keeps 2 m profile under distant elevated camera');
      for (const [tile, history] of widthHistory) history.push(tile.geometry.index.array.BYTES_PER_ELEMENT);
    }
    const transitions = [...widthHistory.values()].map(history => history.filter((width, i) => i === 0 || width !== history[i - 1]));
    assert.ok(transitions.some(history => history.some((width, i) => width === 2 && history[i + 1] === 4 && history[i + 2] === 2)),
      `the same tile transitions 16→32→16 bits: ${JSON.stringify(transitions)}`);
  } finally { release(a); release(b); }
});
