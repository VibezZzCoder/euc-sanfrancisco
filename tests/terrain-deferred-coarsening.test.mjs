// Deferred pure-coarsening core terrain rebuilds versus the synchronous 4c44b7f path. Full committed core + real grade
// cuts, Three CPU objects only; no renderer/browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { root, read, world, drawing, release, routes } from './helpers/terrain-hitch-fixture.mjs';

const ref = '4c44b7f908e46662c7441b05b0e9046f42cb5731';
const history = gitHistory(root, ref);
const baselineTest = optionalSourceTest(history.skip);
const before = history.skip ? null : history.read('js/terrain-mesh.js');
const after = read('js/terrain-mesh.js');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function same(a, b, label) {
  for (const name of ['position', 'normal', 'index']) {
    const x = name === 'index' ? a.index : a.attributes[name], y = name === 'index' ? b.index : b.attributes[name];
    assert.equal(y.array.constructor, x.array.constructor, `${label} ${name}`);
    assert.ok(bytes(y.array).equals(bytes(x.array)), `${label} ${name} bytes`);
    assert.equal(y.array.byteLength, y.array.buffer.byteLength, `${label} ${name}: exact-sized owned output`);
  }
  assert.deepEqual(b.boundingSphere, a.boundingSphere, `${label} sphere`);
  assert.deepEqual(b.boundingBox, a.boundingBox, `${label} box`);
}
const meshes = f => f.mesh.group.children.filter(m => m.name === 'TerrainTile');
const pose = (x, y, z, hx = 0, hz = 1) => ({ camera: { x: x - hx * 6, y: y + 3, z: z - hz * 6 }, rider: { x, y, z } });
// Market start, regional arrivals (Golden Gate, Twin Peaks), a return, then bounded riding segments.
function plan() {
  const r = routes();
  return [pose(0, 0, 0), pose(-6562.9, 55, -2145.8, .3, -.97), pose(-4010.9, 257, 3876.6, -.9, .5), pose(0, 0, 0),
    ...r.stockton, pose(-6562.9, 55, -2145.8), ...r.broadway, pose(-444.6, 32, -173.9), ...r.highway];
}
const tracked = f => {
  const disposals = new Map();
  const watch = () => { for (const m of meshes(f)) if (!disposals.has(m.geometry)) {
    disposals.set(m.geometry, 0); m.geometry.addEventListener('dispose', function () { disposals.set(this, disposals.get(this) + 1); });
  } };
  watch();
  return { disposals, watch };
};

baselineTest('core deferred coarsening: budget 0 is the exact synchronous path', () => {
  const { terrain, grade } = world();
  const a = drawing(before, terrain, grade), b = drawing(after, terrain, grade);
  try {
    plan().forEach((p, i) => {
      a.mesh.update(p.camera, i, p.rider); b.mesh.update(p.camera, i, p.rider);
      assert.equal(b.mesh.deferredTiles(), 0);
      meshes(a).forEach((m, k) => same(m.geometry, meshes(b)[k].geometry, `sync ${i} tile ${k}`));
      const sa = a.mesh.stats(), sb = b.mesh.stats();
      for (const key of ['rebuilt', 'generatedChunks', 'reusedChunks']) assert.equal(sb[key], sa[key], `${i} ${key}`);
    });
  } finally { release(a); release(b); }
});

baselineTest('core deferred coarsening: only coarsening waits; drained tiles are byte-identical; each replaced drawing disposes once', t => {
  const { terrain, grade } = world();
  for (const budget of [1e-9, 4]) {
    const a = drawing(before, terrain, grade), b = drawing(after, terrain, grade);
    b.mesh.setLodBudget(budget);
    const life = tracked(b), report = [];
    try {
      plan().forEach((p, i) => {
        const shown = meshes(b).map(m => m.geometry);
        let started = performance.now();
        a.mesh.update(p.camera, i, p.rider);
        const syncMs = performance.now() - started;
        started = performance.now();
        b.mesh.update(p.camera, i, p.rider);
        const selectMs = performance.now() - started, waiting = b.mesh.deferredTiles();
        life.watch();
        meshes(b).forEach((m, k) => {
          if (m.geometry !== shown[k]) same(meshes(a)[k].geometry, m.geometry, `immediate ${i} tile ${k}`);
          else if (!waiting) same(meshes(a)[k].geometry, m.geometry, `unchanged ${i} tile ${k}`);
        });
        let calls = 0;
        while (b.mesh.deferredTiles()) {
          b.mesh.update(p.camera, i, p.rider); life.watch();
          assert.ok(++calls < 512, 'bounded drain');
        }
        meshes(a).forEach((m, k) => same(m.geometry, meshes(b)[k].geometry, `drained budget ${budget} stop ${i} tile ${k}`));
        if (waiting) report.push({ i, waiting, calls, syncMs: +syncMs.toFixed(1), selectMs: +selectMs.toFixed(1) });
      });
      assert.ok(report.some(r => r.i === 1 && r.waiting >= 10), 'Golden Gate departure defers core coarsening');
      if (budget === 1e-9) assert.ok(report.every(r => r.calls >= r.waiting), 'one tile minimum per call');
      const drawn = new Set(meshes(b).map(m => m.geometry));
      for (const [g, n] of life.disposals) assert.equal(n, drawn.has(g) ? 0 : 1, 'replaced drawings dispose exactly once');
      t.diagnostic(JSON.stringify({ budget, deferredStops: report }));
    } finally { release(a); release(b); }
  }
});

baselineTest('core deferred coarsening: a return before draining refines at once; flush, rebuild and teardown', () => {
  const { terrain, grade } = world();
  const a = drawing(before, terrain, grade), b = drawing(after, terrain, grade);
  b.mesh.setLodBudget(1e-9);
  try {
    const steps = [pose(0, 0, 0), pose(-6562.9, 55, -2145.8), pose(0, 0, 0), pose(-4010.9, 257, 3876.6)];
    steps.forEach((p, i) => {
      a.mesh.update(p.camera, i, p.rider); b.mesh.update(p.camera, i, p.rider);
      if (i === 1) { assert.ok(b.mesh.deferredTiles() > 1); b.mesh.update(p.camera, i, p.rider); }
      if (i === 2) {
        // The rider/camera came back before the coarsening finished: every tile now draws the synchronous result.
        assert.equal(b.mesh.deferredTiles(), 0);
        meshes(a).forEach((m, k) => same(m.geometry, meshes(b)[k].geometry, `return tile ${k}`));
      }
    });
    assert.ok(b.mesh.deferredTiles() > 1);
    b.mesh.setLodBudget(0);
    assert.equal(b.mesh.deferredTiles(), 0, 'switching to synchronous mode completes every waiting tile');
    meshes(a).forEach((m, k) => same(m.geometry, meshes(b)[k].geometry, `flushed tile ${k}`));
    b.mesh.setLodBudget(4);
    b.mesh.update(pose(0, 0, 0).camera, 10, pose(0, 0, 0).rider);
    b.mesh.update(pose(-6562.9, 55, -2145.8).camera, 11, pose(-6562.9, 55, -2145.8).rider);
    assert.ok(b.mesh.deferredTiles() > 1);
    b.mesh.rebuild();
    assert.equal(b.mesh.deferredTiles(), 0, 'explicit full rebuild draws every current level');
    a.mesh.update(pose(0, 0, 0).camera, 10, pose(0, 0, 0).rider);
    a.mesh.update(pose(-6562.9, 55, -2145.8).camera, 11, pose(-6562.9, 55, -2145.8).rider);
    meshes(a).forEach((m, k) => same(m.geometry, meshes(b)[k].geometry, `rebuilt tile ${k}`));
    b.mesh.update(pose(0, 0, 0).camera, 12, pose(0, 0, 0).rider);
    b.mesh.update(pose(-6562.9, 55, -2145.8).camera, 13, pose(-6562.9, 55, -2145.8).rider);
    const shown = meshes(b).map(m => m.geometry), rebuilt = b.mesh.stats().rebuilt;
    b.mesh.dispose(); b.mesh.dispose();
    assert.equal(b.mesh.deferredTiles(), 0, 'teardown drops waiting work');
    b.mesh.update(pose(0, 0, 0).camera, 14, pose(0, 0, 0).rider);
    b.mesh.setLodBudget(0);
    assert.deepEqual(meshes(b).map(m => m.geometry), shown, 'no construction after terminal teardown');
    assert.equal(b.mesh.stats().rebuilt, rebuilt);
  } finally { release(a); release(b); }
});
