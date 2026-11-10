// Private-history differential, e5753c8 vs working source. CPU only, capped diagnostics.
// Heavy runs: Node24 --max-old-space-size=4096; redirect output to ../qa-artifacts/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { SfTerrainSampler } from '../../js/sf-terrain-sampler.js';

export { SfTerrainSampler };
export const ROOT = new URL('../../', import.meta.url);
export const REF = 'e5753c8a9ff1673ce1f5f3f9ceffbb26a0fb7f59';
export const read = path => readFileSync(new URL(path, ROOT));
export const hash = b => createHash('sha256').update(b).digest('hex');
export const original = path => execFileSync('git', ['show', `${REF}:${path}`],
  { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
let frozen;
try { frozen = original('js/sf-terrain-sampler.js'); } catch { /* Curated exports omit private history. */ }
export const baselineAvailable = !!frozen;
const frozenStoreURL = frozen && url(original('js/sf-static-body-store.js'));
export const FrozenSampler = frozen && (await import(url(frozen.replace(/from '(\.\/[^']+)'/g, (_, relative) => {
  const path = `js/${relative.slice(2)}`;
  if (path === 'js/sf-static-body-store.js') return `from '${frozenStoreURL}'`;
  assert.equal(hash(read(path)), hash(original(path)), `unchanged differential dependency ${path}`);
  return `from '${new URL(path, ROOT).href}'`;
})))).SfTerrainSampler;
export const sourceHashes = Object.fromEntries(['sf-terrain-sampler', 'sf-static-body-store', 'sf-ride-geometry', 'region']
  .map(n => [`js/${n}.js`, hash(read(`js/${n}.js`))]));

// First scalar mismatch only; never let assert print a world-sized recursive diff.
export function same(a, b, label = 'value') {
  if (Object.is(a, b)) return;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    assert.fail(`${label.slice(0, 400)}: ${String(a)} (${Object.is(a, -0) ? '-0' : typeof a}) != ${String(b)} (${Object.is(b, -0) ? '-0' : typeof b})`);
  }
  const ak = Reflect.ownKeys(a), bk = Reflect.ownKeys(b);
  assert.equal(bk.length, ak.length, `${label}: key count`);
  for (let i = 0; i < ak.length; i++) { assert.equal(bk[i], ak[i], `${label}: key ${i}`); same(a[ak[i]], b[bk[i]], `${label}.${String(ak[i])}`); }
}
export function registry(variant = 'candidate') {
  const c = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(c, { window: { NYC: {} } });
  vm.runInContext(variant === 'baseline' ? original('js/sf-ride-geometry.js') : read('js/sf-ride-geometry.js').toString(), c,
    { filename: `${variant}/js/sf-ride-geometry.js` });
  return { c, N: c.window.NYC };
}
export const flat = { originX: -20000, originZ: -20000, cell: 40000, w: 2, h: 2,
  heights: [10, 10, 10, 10], waterLevel: 0 };
export const options = extra => ({ city: null, grade: null, terrain: flat, waterAt: () => false, ...extra });

// EXACT production registration blocks, all committed regional buildings and trees.
// No synthetic proxy corpus; rendering/terrain/core city/actors are not constructed here.
export function regionalBodies(variant = 'candidate') {
  const manifestBytes = read('data/region/manifest.json'), manifest = JSON.parse(manifestBytes), digest = createHash('sha256').update(manifestBytes);
  const bin = (path, Type) => {
    const b = read(path), n = b.readUInt32LE(4); digest.update(path).update(b);
    assert.equal(b.toString('ascii', 0, 4), 'SFB1');
    return { header: JSON.parse(b.toString('utf8', 8, 8 + n)), records: new Type(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length)) };
  };
  const { c, N } = registry(variant), code = variant === 'baseline' ? original('js/region.js') : read('js/region.js').toString();
  c.data = { buildings: manifest.buildings.files.map(f => bin(f.url, Int32Array)), trees: bin(manifest.trees.url, Float32Array).records };
  const a = code.indexOf('  const buildings=[],palette='), b = code.indexOf('  const buildingMeshes=', a);
  const c0 = code.indexOf('  const treeGroups=new Map();', b), c1 = code.indexOf('  const matrix=', c0);
  const d = code.indexOf('    for(let i=0;i<ks.length;i++){', c1), e = code.indexOf('    const mesh=regionTrees.farChunk', d);
  assert.ok(a > 0 && b > a && c0 > b && c1 > c0 && d > c1 && e > d, 'unique production blocks');
  vm.runInContext(`(function(){const ride=window.NYC.RideGeometry;${code.slice(a, b)}${code.slice(c0, c1)}for(const [key,ks]of treeGroups){${code.slice(d, e)}}})()`, c);
  const treeCount = c.data.trees.length / 4; delete c.data;
  assert.equal(N.ride.solids.length, 161645); assert.equal(N.ride.prisms.length, 113474); assert.equal(treeCount, 113474);
  return { ride: N.ride, files: manifest.buildings.files.length, dataHash: digest.digest('hex'), boxes: 161645, prisms: treeCount };
}
export function pointsFor(ride, count = 256) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const c = ride.solids[Math.floor(i * ride.solids.length / count)], angle = c.rotationY ?? 0, co = Math.cos(angle), si = Math.sin(angle), d = c.halfExtents.x + 2;
    points.push({ origin: { x: c.centre.x - co * d, y: c.centre.y, z: c.centre.z + si * d }, direction: { x: co, y: 0, z: -si }, distance: d * 2,
      centre: { ...c.centre }, heading: angle, type: 'box' });
    const p = ride.prisms[Math.floor(i * ride.prisms.length / count)];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const q of p.outer) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
    const centre = { x: (minX + maxX) / 2, y: (p.minY + p.maxY) / 2, z: (minZ + maxZ) / 2 };
    points.push({ origin: { x: minX - 2, y: centre.y, z: centre.z }, direction: { x: 1, y: 0, z: 0 }, distance: maxX - minX + 4, centre, heading: 0, type: 'prism' });
  }
  return points;
}
export function probe(s, p, i, withLimb = true) {
  const out = { normal: {}, inside: false }, width = [0, .08, .26][i % 3];
  const lateral = i % 2 ? { x: Math.sin(p.heading), z: Math.cos(p.heading) } : undefined;
  const result = { ray: s.raycastObstacle(p.origin, p.direction, p.distance, width, lateral, out), out,
    camera: s.raycast(p.origin, p.direction, p.distance), wheel: s.raycastWheelObstacle(p.origin, p.direction, p.distance, width, lateral),
    ground: s.sampleGround(p.centre.x, p.centre.z, { normal: {}, base: { normal: {} } }, p.centre.y),
    volume: s.isVolumeClear({ x: p.centre.x, z: p.centre.z, headingY: p.heading, halfWidthMetres: .35,
      halfLengthMetres: .5, minY: p.centre.y - .7, maxY: p.centre.y + .8 }) };
  const inside = { normal: {}, inside: false }; s.raycastObstacle(p.centre, p.direction, .1, 0, undefined, inside); result.inside = inside;
  if (inside.inside) {
    const cert = { colliderIndex: inside.colliderIndex, normal: inside.normal, faceOffset: inside.faceOffset, slack: .01 };
    result.exit = s.raycastObstacle(p.centre, inside.normal, p.distance, .08, undefined, undefined, cert);
    result.forgedExit = s.raycastObstacle(p.centre, inside.normal, p.distance, .08, undefined, undefined, { ...cert, faceOffset: cert.faceOffset + 7 });
  }
  if (withLimb) {
    const q = { minX: p.centre.x - 1, maxX: p.centre.x + 1, minZ: p.centre.z - 1, maxZ: p.centre.z + 1,
      minY: p.centre.y - 1, maxY: p.centre.y + 1, capacity: i % 5 ? 12 : 1, recordOffset: 9, records: new Float64Array(126) };
    s.raycastObstacle(p.origin, p.direction, p.distance, width, lateral, undefined, undefined, q);
    result.limbs = { count: q.count, overflow: q.overflow, fulfilled: q.fulfilled, records: Array.from(q.records),
      prisms: q.prisms.map(p => p.id), contacts: [...q.records.sfContacts].map(([at, p]) => [at, p.contactId, p.planes]) };
  }
  return result;
}
export function cacheCounts(s) {
  let cachedPrisms = 0, edges = 0, pieces = 0;
  const records = s.prismStore ? s.prismStore.cache.values() : s.prisms;
  for (const p of records) { cachedPrisms++; edges += p._edges?.length ?? 0; pieces += p.contactPieces?.length ?? 0; }
  return { cachedPrisms, edges, pieces, boxes: s.boxStore.cache.size, nextContactId: s._nextContactId };
}

if (process.argv[2] === '--measure') {
  assert.ok(global.gc && process.execArgv.includes('--max-old-space-size=4096'));
  const variant = process.argv[3]; assert.ok(['baseline', 'candidate'].includes(variant));
  const collect = async () => { await new Promise(resolve => setImmediate(resolve)); for (let i = 0; i < 4; i++) global.gc();
    const { heapUsed, arrayBuffers, rss } = process.memoryUsage(); return { heapUsed, arrayBuffers, rss }; };
  const empty = await collect(), fixture = regionalBodies(variant), points = pointsFor(fixture.ride, 256);
  const history = pointsFor(fixture.ride, 2048), source = await collect();
  const Sampler = variant === 'baseline' ? FrozenSampler : SfTerrainSampler, start = performance.now();
  const s = new Sampler(options({ ride: fixture.ride })); s.releaseConstructionRegistry(fixture.ride);
  const constructionAndHandoffMs = performance.now() - start, retained = await collect();
  function query(list, rounds) { let checksum = 0; const start = performance.now(); for (let k = 0; k < rounds; k++) for (const p of list)
    checksum += s.raycastObstacle(p.origin, p.direction, p.distance, .26) ?? -1;
    return { ms: performance.now() - start, queries: list.length * rounds, checksum }; }
  const timing = {};
  for (const type of ['box', 'prism']) {
    const scattered = points.filter(p => p.type === type), repeated = scattered.slice(100, 108);
    query(scattered, 8); const cold = Array.from({ length: 7 }, () => query(scattered, 16));
    query(repeated, 256); const warm = Array.from({ length: 7 }, () => query(repeated, 1024));
    const median = a => a.map(v => v.ms * 1000 / v.queries).sort((a, b) => a - b)[3];
    timing[type] = { scattered: cold, repeated: warm, medianUs: { scattered: median(cold), repeated: median(warm) } };
  }
  for (let i = 0; i < history.length; i++) probe(s, history[i], i, i % 8 === 1);
  const historyCache = cacheCounts(s), afterHistory = await collect();
  for (let i = history.length - 1; i >= 0; i--) probe(s, history[i], i, i % 8 === 1);
  const returnCache = cacheCounts(s), afterReturn = await collect();
  console.log(JSON.stringify({ variant, ref: REF, node: process.version, sourceHashes,
    fixture: { boxes: fixture.boxes, prisms: fixture.prisms, files: fixture.files, dataHash: fixture.dataHash }, empty, source, retained,
    constructionAndHandoffMs, timing, historyCache, returnCache, afterHistory, afterReturn, stats: s.stats,
    scope: 'Actual candidate query stores, complete regional body corpus; no renderer/core city/actors. Separate-process post-GC heap and ArrayBuffer categories, not phone/process residency, startup peak or whole-frame performance.' }));
}
