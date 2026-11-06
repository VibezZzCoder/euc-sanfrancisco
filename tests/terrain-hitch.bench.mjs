// Bounded CPU fixture, no renderer/browser/actors. Run directly with the workspace Node 24.
import { performance } from 'node:perf_hooks';
import { baselineSource, currentSource, world, drawing, release, routes, baselineRef } from './helpers/terrain-hitch-fixture.mjs';

const { terrain, grade } = world(), paths = routes();
const results = { baseline: [], current: [] }, cold = { baseline: [], current: [] };
let retainedBytes = 0;
for (let block = 0; block < 4; block++) {
  for (const variant of block % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
    const start = performance.now();
    const f = drawing(variant === 'baseline' ? baselineSource : currentSource, terrain, grade);
    cold[variant].push(performance.now() - start);
    let elapsed = 0;
    for (const [name, path] of Object.entries(paths)) {
      // Placement/first refinement is separate; measured riding updates change only a few chunks per tile.
      f.mesh.update(path[0].camera, elapsed += .3, path[0].rider);
      for (const [i, point] of [...path.slice(1), ...path.slice().reverse()].entries()) {
        const previous = f.mesh.stats(), start = performance.now();
        f.mesh.update(point.camera, elapsed += .3, point.rider);
        const ms = performance.now() - start, now = f.mesh.stats();
        if (now.rebuilt !== previous.rebuilt && block > 0) results[variant].push({ name, i, ms,
          tiles: now.rebuilt - previous.rebuilt,
          generated: now.generatedChunks - previous.generatedChunks,
          reused: now.reusedChunks - previous.reusedChunks });
      }
    }
    retainedBytes = Math.max(retainedBytes, f.mesh.stats().reuseBytes || 0);
    release(f);
  }
}
function summary(rows) {
  const sorted = rows.map(r => r.ms).sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return { n: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1),
    total: sorted.reduce((a, b) => a + b, 0), over16: sorted.filter(x => x > 16).length,
    over50: sorted.filter(x => x > 50).length };
}
console.log(JSON.stringify({ baselineRef, node: process.version, method: 'full core + real grade; ABBA blocks, block 0 warmup; CPU only',
  cold, retainedBytes, baseline: summary(results.baseline), current: summary(results.current),
  routes: Object.fromEntries(Object.keys(paths).map(name => [name, {
    baseline: summary(results.baseline.filter(r => r.name === name)), current: summary(results.current.filter(r => r.name === name)) }])),
  currentChunkWork: { generated: results.current.reduce((s, r) => s + r.generated, 0),
    reused: results.current.reduce((s, r) => s + r.reused, 0) } }, null, 2));
