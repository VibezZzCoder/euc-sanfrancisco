// CPU-only frozen-baseline helpers. MIT, © 2026 VibezZzCoder.
// Run heavy tests with --max-old-space-size=4096 and redirect output to qa-artifacts/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { SfTerrainSampler } from '../../js/sf-terrain-sampler.js';

export { SfTerrainSampler };
export const ROOT = new URL('../../', import.meta.url);
export const REF = 'b802a5104d4c5b68b3a39c9b956b662c10ba29a8';
export const read = path => readFileSync(new URL(path, ROOT));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const original = path => execFileSync('git', ['show', `${REF}:${path}`],
  { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let oldSource;
try { oldSource = original('js/sf-terrain-sampler.js'); } catch { /* Public exports omit private history. */ }
export const baselineAvailable = !!oldSource;
export const sourceHashes = { baseline: oldSource && hash(oldSource),
  sampler: hash(read('js/sf-terrain-sampler.js')), store: hash(read('js/sf-static-body-store.js')) };
export const FrozenSampler = oldSource && (await import('data:text/javascript;base64,' + Buffer.from(
  oldSource.replace(/from '(\.\/[^']+)'/g, (_, relative) => {
    const path = `js/${relative.slice(2)}`;
    assert.equal(hash(read(path)), hash(original(path)), `unchanged baseline dependency ${path}`);
    return `from '${new URL(path, ROOT).href}'`;
  })).toString('base64'))).SfTerrainSampler;

// Fail at the first scalar/path mismatch. Never ask assert to print a world-sized object diff.
export function same(a, b, label = 'value') {
  if (Object.is(a, b)) return;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    assert.fail(`${label}: ${String(a)} (${Object.is(a, -0) ? '-0' : typeof a}) != ${String(b)} (${Object.is(b, -0) ? '-0' : typeof b})`);
  }
  const ak = Reflect.ownKeys(a), bk = Reflect.ownKeys(b);
  assert.equal(bk.length, ak.length, `${label}: key count`);
  for (let i = 0; i < ak.length; i++) {
    assert.equal(bk[i], ak[i], `${label}: key ${i}`);
    same(a[ak[i]], b[bk[i]], `${label}.${String(ak[i])}`);
  }
}

// Execute the frozen production registration block over every committed regional building file.
// This includes its exact arithmetic and original source order, not a random synthetic box census.
// Terrain, drawing, trees, core buildings and actors are deliberately absent from this bounded fixture.
export function regionalBoxes() {
  const manifestBytes = read('data/region/manifest.json'), manifest = JSON.parse(manifestBytes);
  const digest = createHash('sha256').update(manifestBytes);
  const buildings = manifest.buildings.files.map(({ url, count }) => {
    const b = read(url), n = b.readUInt32LE(4); digest.update(url).update(b);
    assert.equal(b.toString('ascii', 0, 4), 'SFB1');
    assert.equal((b.byteLength - 8 - n) / 28, count, `complete building file ${url}`);
    return { header: JSON.parse(b.toString('utf8', 8, 8 + n)),
      records: new Int32Array(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length)) };
  });
  const source = original('js/region.js');
  // e5753c8 follow-up changes only these two ownership callees. This older fixture
  // deliberately keeps ordinary bodies: it measures prepared-wrapper packing alone.
  assert.equal(read('js/region.js').toString().replace('ride?.addRegionalBox(', 'ride?.addBox(')
    .replace('ride?.addRegionalPrism(', 'ride?.addPrism('), source, 'regional drawing/registration math is frozen');
  const start = source.indexOf('  const buildings=[],palette='), end = source.indexOf('  const buildingMeshes=', start);
  assert.ok(start > 0 && end > start, 'production registration block');
  const registry = original('js/sf-ride-geometry.js');
  const currentRegistry = read('js/sf-ride-geometry.js').toString();
  assert.equal(currentRegistry.slice(0, currentRegistry.indexOf('// Only region.js')),
    registry.slice(0, registry.indexOf('// Only exact shared edges')), 'ordinary box/prism registration is frozen');
  const c = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(c, { window: { NYC: {} }, data: { buildings } });
  vm.runInContext(registry, c, { filename: 'frozen/sf-ride-geometry.js' });
  vm.runInContext(`(function() { const ride = window.NYC.RideGeometry; ${source.slice(start, end)} })()`, c);
  delete c.data;
  return { ride: c.window.NYC.ride, files: manifest.buildings.files.length,
    expectedCount: manifest.buildings.files.reduce((n, f) => n + f.count, 0), dataHash: digest.digest('hex'),
    regionSourceHash: hash(source), registrySourceHash: hash(registry) };
}

export const flat = { originX: -20000, originZ: -20000, cell: 40000, w: 2, h: 2,
  heights: [10, 10, 10, 10], waterLevel: 0 };
export const options = extra => ({ city: null, grade: null, terrain: flat, waterAt: () => false, ...extra });

export function probesFor(boxes, count = 256) {
  return Array.from({ length: Math.min(count, boxes.length) }, (_, i) => {
    const b = boxes[Math.floor(i * boxes.length / Math.min(count, boxes.length))], p = b.centre, h = b.halfExtents;
    const angle = b.rotationY ?? 0, c = Math.cos(angle), s = Math.sin(angle), d = h.x + 2;
    return { origin: { x: p.x - c * d, y: p.y, z: p.z + s * d }, direction: { x: c, y: 0, z: -s },
      distance: 2 * d, centre: p, headingY: angle };
  });
}

export function probe(s, p, i) {
  const out = { normal: {}, inside: false };
  const width = [0, .08, .26][i % 3], lateral = i % 2 ? { x: Math.sin(p.headingY), z: Math.cos(p.headingY) } : undefined;
  const result = { ray: s.raycastObstacle(p.origin, p.direction, p.distance, width, lateral, out), out,
    camera: s.raycast(p.origin, p.direction, p.distance),
    wheel: s.raycastWheelObstacle(p.origin, p.direction, p.distance, width, lateral),
    ground: s.sampleGround(p.centre.x, p.centre.z, { normal: {}, base: { normal: {} } }, p.centre.y),
    volume: s.isVolumeClear({ x: p.centre.x, z: p.centre.z, headingY: p.headingY, halfWidthMetres: .35,
      halfLengthMetres: .5, minY: p.centre.y - .7, maxY: p.centre.y + .8 }) };
  // Inside certificates carry GLOBAL ids across views/cache eviction, including box→prism offsets.
  const inside = { normal: {}, inside: false };
  s.raycastObstacle(p.centre, p.direction, .1, 0, undefined, inside);
  result.inside = inside;
  if (inside.inside) {
    const cert = { colliderIndex: inside.colliderIndex, normal: inside.normal, faceOffset: inside.faceOffset, slack: .01 };
    result.exit = s.raycastObstacle(p.centre, inside.normal, p.distance, .08, undefined, undefined, cert);
    result.forgedExit = s.raycastObstacle(p.centre, inside.normal, p.distance, .08, undefined, undefined,
      { ...cert, faceOffset: cert.faceOffset + 7 });
  }
  const q = { minX: p.centre.x - 1, maxX: p.centre.x + 1, minZ: p.centre.z - 1, maxZ: p.centre.z + 1,
    minY: p.centre.y - 1, maxY: p.centre.y + 1, capacity: i % 5 ? 12 : 1, recordOffset: 9, records: new Float64Array(126) };
  s.raycastObstacle(p.origin, p.direction, p.distance, width, lateral, undefined, undefined, q);
  result.limbs = { count: q.count, overflow: q.overflow, fulfilled: q.fulfilled, records: Array.from(q.records),
    prisms: q.prisms.map(p => p.id), contacts: [...q.records.sfContacts].map(([at, piece]) => [at, piece.contactId, piece.planes]) };
  return result;
}

// Optional child mode: isolated post-GC retention and native query cost; no snapshots or inspector.
if (process.argv[2] === '--measure') {
  assert.ok(global.gc, 'measurement requires --expose-gc');
  const variant = process.argv[3];
  assert.ok(['baseline', 'candidate'].includes(variant));
  const collect = async () => {
    await new Promise(resolve => setImmediate(resolve));
    for (let i = 0; i < 3; i++) global.gc();
    const { heapUsed, arrayBuffers } = process.memoryUsage(); return { heapUsed, arrayBuffers };
  };
  const empty = await collect(), fixture = regionalBoxes(), source = await collect();
  const Sampler = variant === 'baseline' ? FrozenSampler : SfTerrainSampler;
  const points = probesFor(fixture.ride.solids);
  const start = performance.now(), sampler = new Sampler(options({ ride: fixture.ride }));
  const constructionMs = performance.now() - start;
  sampler.releaseConstructionRegistry(fixture.ride);
  const retained = await collect();
  const queryRun = (iterations, queryPoints = points) => {
    let checksum = 0;
    const start = performance.now();
    for (let n = 0; n < iterations; n++) for (const p of queryPoints) {
      checksum += sampler.raycastObstacle(p.origin, p.direction, p.distance, .26) ?? -1;
    }
    return { ms: performance.now() - start, queries: iterations * queryPoints.length, checksum };
  };
  queryRun(4);
  const timing = Array.from({ length: 7 }, () => queryRun(24));
  const nearby = points.slice(100, 108);
  queryRun(100, nearby);
  const warmTiming = Array.from({ length: 7 }, () => queryRun(1024, nearby));
  const medianUs = samples => samples.map(v => v.ms * 1000 / v.queries).sort((a, b) => a - b)[3];
  const afterQueries = await collect();
  console.log(JSON.stringify({ variant, ref: REF, sourceHashes, node: process.version,
    fixture: { boxes: sampler.colliderCount, files: fixture.files, dataHash: fixture.dataHash },
    empty, source, retained, afterQueries, constructionMs, timing, warmTiming,
    medianUsPerQuery: { scattered256: medianUs(timing), repeated8: medianUs(warmTiming) },
    store: sampler.stats.staticBoxStore ?? null, cache: sampler.boxStore?.cache.size ?? null,
    scope: 'Regional building boxes only; unchanged source bodies retained. Node post-GC heap + ArrayBuffer payload, not browser/phone memory or startup peak.' }));
}
