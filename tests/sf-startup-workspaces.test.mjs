// Independent 282e6f1 originals vs working Drape/furniture only. No browser/GPU.
// Full committed data: SF_WORKSPACES_FULL=1; optional sampled allocation bytes: SF_WORKSPACES_PROFILE=1.
// Redirect heavy runs to ../qa-artifacts/. Failures report the first scalar mismatch, never city-sized diffs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector/promises';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.core.js';

const ROOT = new URL('../', import.meta.url), REF = '282e6f1b3c9d756786a619d1136e67e32c83c12e';
const read = path => readFileSync(new URL(path, ROOT), 'utf8');
let original;
try { original = path => execFileSync('git', ['show', `${REF}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); original('js/drape.js'); }
catch { original = null; } // Curated public exports do not include private development history.
const skip = !original && 'private frozen baseline unavailable';
const sources = original && Object.fromEntries(['drape', 'sf-street-details', 'sf-ride-geometry'].map(n => [n, original(`js/${n}.js`)]));
const changed = Object.fromEntries(['drape', 'sf-street-details'].map(n => [n, read(`js/${n}.js`)]));
const hash = value => createHash('sha256').update(value).digest('hex');
function context(N = {}) {
  const c = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(c, { window: { NYC: N }, console: { info() {}, warn() {} } });
  return c;
}
const load = (c, code, name = 'fixture.js') => vm.runInContext(code, c, { filename: name });
function drape(code) { const c = context(); load(c, code, 'js/drape.js'); return c.window.NYC.Drape; }
const out = () => ({ pos: [], nrm: [], idx: [] });
const normal = (x, z, p) => { p.x = x / 100; p.y = 1; p.z = z / 100; };
function sameNumbers(a, b, label) {
  assert.equal(b.length, a.length, `${label} length`);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) assert.fail(`${label}[${i}]: ${a[i]} != ${b[i]}`);
}
function sameRing(a, b, label) {
  assert.equal(b.length, a.length, `${label} length`);
  for (let i = 0; i < a.length; i++) for (const k of ['x', 'z']) assert.ok(Object.is(a[i][k], b[i][k]), `${label}[${i}].${k}`);
}
function sameGeometry(a, b, label) { for (const k of ['pos', 'nrm', 'idx']) sameNumbers(a[k], b[k], `${label}.${k}`); }
function countedDrape(code, candidate) {
  const counts = { clips: 0, cutPoints: 0, workspaces: 0 }, c = context(); c.__alloc = counts;
  const replace = (from, to) => { assert.equal(code.split(from).length, 2, `unique allocation site: ${from}`); code = code.replace(from, to); };
  if (candidate) {
    replace('function clipToRectInto(ring, x0, z0, x1, z1, work) {', 'function clipToRectInto(ring, x0, z0, x1, z1, work) { __alloc.clips++;');
    replace('function clipWorkspace() {', 'function clipWorkspace() { __alloc.workspaces++;');
    replace('work.cuts[cuts] = { x: 0, z: 0 }', 'work.cuts[cuts] = (__alloc.cutPoints++, { x: 0, z: 0 })');
  } else {
    replace('function clipToRect(ring, x0, z0, x1, z1) {', 'function clipToRect(ring, x0, z0, x1, z1) { __alloc.clips++;');
    replace('next.push({ x: a.x', '__alloc.cutPoints++; next.push({ x: a.x');
  }
  load(c, code, 'counted-drape.js'); return { D: c.window.NYC.Drape, counts };
}
function random(seed = 73) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32; }
function numericDigest() {
  const h = createHash('sha256'), number = Buffer.alloc(8);
  const add = v => {
    if (typeof v === 'number') { number.writeDoubleLE(v); h.update('n'); h.update(number); }
    else if (v === null || typeof v !== 'object') h.update(`${typeof v}:${String(v)};`);
    else if (ArrayBuffer.isView(v)) { h.update(v.constructor.name); h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); }
    else { h.update(Array.isArray(v) ? '[' : '{'); for (const k of Object.keys(v)) { h.update(`${k}:`); add(v[k]); } h.update(']'); }
  };
  return { add, end: () => h.digest('hex') };
}

test('rectangle clipping: exact original arithmetic, order, thresholds and output ownership', { skip }, () => {
  const a = drape(sources.drape), b = drape(changed.drape), rnd = random();
  const rings = [[], [{ x: -0, z: +0 }], [{ x: -0, z: -0 }, { x: 0, z: 0 }, { x: 1e-6, z: 1e-6 }, { x: 2, z: 0 }, { x: 0, z: 2 }]];
  for (let j = 0; j < 500; j++) rings.push(Array.from({ length: 3 + j % 40 }, (_, i) => ({ x: Math.cos(i * 2 * Math.PI / (3 + j % 40)) * (1 + rnd() * 20), z: Math.sin(i * 2 * Math.PI / (3 + j % 40)) * (1 + rnd() * 20) })));
  for (const [i, ring] of rings.entries()) for (const rect of [[-1, -1, 1, 1], [-30, -30, 30, 30], [0, 0, 0, 0], [30, 30, 32, 32], [-0, 0, 1e-6, 1e-6]]) {
    const frozen = ring.map(p => Object.freeze({ ...p })); Object.freeze(frozen);
    const expected = a.clipToRect(frozen, ...rect), actual = b.clipToRect(frozen, ...rect);
    sameRing(expected, actual, `clip ${i}`);
    b.clipToRect(rings.at(-1), -4, -3, 6, 8);
    sameRing(expected, actual, 'prior output retained');
    for (let k = 0; k < actual.length; k++) assert.equal(frozen.indexOf(actual[k]), frozen.indexOf(expected[k]), 'uncut input reference preserved');
  }
});

test('quadtree siblings, concavities, winding, centimetre merges and reentrant callbacks', { skip }, () => {
  const a = drape(sources.drape), b = drape(changed.drape), rnd = random(14);
  const ground = (x, z) => Math.sin(x / 4) * Math.cos(z / 7) * 3 + x * .07;
  for (let j = 0; j < 70; j++) {
    const n = 5 + j % 31;
    let ring = Array.from({ length: n }, (_, i) => ({ x: Math.cos(i * 2 * Math.PI / n) * (4 + rnd() * 90), z: Math.sin(i * 2 * Math.PI / n) * (4 + rnd() * 90) }));
    ring = a.densify(j % 2 ? ring.reverse() : ring, 2);
    const x = out(), y = out();
    a.polygon(ring, ground, normal, .15, x); b.polygon(ring, ground, normal, .15, y);
    sameGeometry(x, y, `polygon ${j}`);
    const nested = [{ x: 0, z: 0 }, { x: 0, z: 4 }, { x: 4, z: 0 }];
    let once = false;
    const reenter = (px, pz) => { if (!once) { once = true; b.polygon(nested, ground, normal, 0, out()); } return ground(px, pz); };
    const z = out(); b.polygon(ring, reenter, normal, .15, z); sameGeometry(x, z, 'ground reentry');
    once = false;
    const nrm = (px, pz, p) => { normal(px, pz, p); if (!once) { once = true; b.polygon(nested, ground, normal, 0, out()); } };
    const w = out(); b.polygon(ring, ground, nrm, .15, w); sameGeometry(x, w, 'normal reentry');
  }
  assert.throws(() => b.polygon([{ x: 0, z: 0 }, { x: 0, z: 4 }, { x: 4, z: 0 }], () => { throw Error('expected'); }, normal, 0, out()), /expected/);
});

test('Drape reuses intersection objects across siblings (exact allocation-site counts)', { skip }, t => {
  const a = countedDrape(sources.drape, false), b = countedDrape(changed.drape, true);
  const ring = a.D.densify([{ x: -127.5, z: -127.25 }, { x: -127.5, z: 128.75 }, { x: 128.5, z: 128.75 }, { x: 128.5, z: -127.25 }], 2);
  const ground = (x,z) => Math.sin(x) * Math.cos(z), x = out(), y = out();
  a.D.polygon(ring, ground, normal, .15, x); b.D.polygon(ring, ground, normal, .15, y);
  sameGeometry(x, y, 'counted fixture'); assert.equal(b.counts.clips, a.counts.clips);
  assert.ok(b.counts.cutPoints < a.counts.cutPoints / 100, 'intersection object creation reduced >99%');
  assert.ok(b.counts.workspaces < 16, 'only quadtree depth, not number of visits');
  t.diagnostic(JSON.stringify({ fixture: '256m rugged square, 2m edges', before: a.counts, after: b.counts }));
});

const mergeCode = read('vendor/three/examples/jsm/utils/BufferGeometryUtils.js').replace("from 'three'", `from '${new URL('vendor/three/build/three.core.js', ROOT).href}'`);
const { mergeGeometries } = await import(`data:text/javascript;base64,${Buffer.from(mergeCode).toString('base64')}`);
function registry(code = sources['sf-ride-geometry']) {
  const c = context({ THREE, Addons: {}, TSL: {} }); load(c, code, 'js/sf-ride-geometry.js');
  // Test-only access to private helper: no runtime test hook/export.
  load(c, changed['sf-street-details'].replace('Object.assign(window.NYC, { buildSFStreetDetails });', 'Object.assign(window.NYC, { buildSFStreetDetails, streetContactsWorkspace });'), 'js/sf-street-details.js');
  return c.window.NYC;
}
function geos() {
  return [
    mergeGeometries([new THREE.BoxGeometry(.4, 1.12, .28), new THREE.BoxGeometry(.07, .4, .07).translate(0, .76, 0)].map(g => g.toNonIndexed())),
    mergeGeometries([new THREE.CircleGeometry(.38, 8).rotateZ(Math.PI / 8).translate(0, 0, .02), new THREE.CircleGeometry(.38, 8).rotateZ(Math.PI / 8).rotateY(Math.PI).translate(0, 0, -.02)]),
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(.3, .16, .65),
    mergeGeometries([new THREE.CylinderGeometry(.14, .17, .62, 10), new THREE.SphereGeometry(.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .31, 0), new THREE.CylinderGeometry(.06, .06, .42, 6).rotateZ(Math.PI / 2).translate(0, .08, 0)].map(g => g.toNonIndexed())),
    new THREE.CylinderGeometry(.17, .17, 1, 8), new THREE.BoxGeometry(1, 1e-7, 1)
  ];
}
function sameRegistry(a, b, label) {
  const digest = N => { const h = numericDigest(); for (const t of N.RideGeometry.expandTops(N.ride.tops)) h.add(t); h.add(N.ride.solids); h.add(N.ride.prisms); return h.end(); };
  assert.equal(digest(b), digest(a), label);
}

test('furniture workspace vs frozen addMesh: all shapes, transforms, body rings and packed tops', { skip }, () => {
  for (const registryCode of [sources['sf-ride-geometry'], read('js/sf-ride-geometry.js')]) {
    const a = registry(), b = registry(registryCode), add = b.streetContactsWorkspace(), ar = a.RideGeometry.packedRun(), br = b.RideGeometry.packedRun();
    const rnd = random(37), shapes = geos();
    for (let i = 0; i < 120; i++) {
      const g = shapes[i % shapes.length], m = new THREE.Matrix4().compose(new THREE.Vector3((rnd() - .5) * 8000, rnd() * 100, (rnd() - .5) * 8000), new THREE.Quaternion().setFromEuler(new THREE.Euler(i % 3 ? 0 : rnd(), rnd() * 7, i % 5 ? 0 : rnd())), new THREE.Vector3(i % 7 ? 1 : -1, 1, i % 11 ? 1 : 0));
      a.RideGeometry.addMesh({ geometry: g, matrixWorld: m }, 'pavement', { layered: true, sides: { sliceHeight: .16, maxSlices: 8 }, packed: ar });
      add(g, m, b.RideGeometry, br);
    }
    ar.close(); br.close(); sameRegistry(a, b, 'ordered full records (including signed zero)');
    const before = numericDigest(); before.add(b.ride.prisms); const expected = before.end();
    const saved = b.ride.prisms.slice();
    add(shapes[0], new THREE.Matrix4().makeTranslation(1, 2, 3), b.RideGeometry, undefined);
    const after = numericDigest(); after.add(saved); assert.equal(after.end(), expected, 'no shared scratch in published rings');
    const sampler = shapes[0].getAttribute('position'), getX = sampler.getX;
    let nested = false;
    sampler.getX = function(i) { if (!nested) { nested = true; add(shapes[2], new THREE.Matrix4(), b.RideGeometry, undefined); } return getX.call(this, i); };
    add(shapes[0], new THREE.Matrix4(), b.RideGeometry, undefined); sampler.getX = getX;
    const c = registry(); c.RideGeometry.addMesh({ geometry: shapes[2], matrixWorld: new THREE.Matrix4() }, 'pavement', { layered: true, sides: { sliceHeight: .16, maxSlices: 8 } });
    c.RideGeometry.addMesh({ geometry: shapes[0], matrixWorld: new THREE.Matrix4() }, 'pavement', { layered: true, sides: { sliceHeight: .16, maxSlices: 8 } });
    const h1 = numericDigest(), h2 = numericDigest(); h1.add(c.ride.prisms); h2.add(b.ride.prisms.slice(-c.ride.prisms.length)); assert.equal(h2.end(), h1.end(), 'nested workspace bodies');
    assert.throws(() => add(shapes[0], new THREE.Matrix4(), { addTriangles() { throw Error('expected'); } }, undefined), /expected/);
    add(shapes[0], new THREE.Matrix4(), b.RideGeometry, undefined); // finally releases busy flag
  }
});

test('furniture slice boundaries, duplicate vertices, collinearity and stable hull ties stay exact', { skip }, () => {
  const rnd = random(81), a = registry(), b = registry(), add = b.streetContactsWorkspace();
  for (let i = 0; i < 100; i++) {
    const height = [0, 1e-6, 1e-6 + 1e-15, .16, .32, .16000000001, 5][i % 7];
    const width = [1e-9, 1e-5, 1e-4, .5, 2][i % 5], pos = [];
    for (let k = 0; k < 8; k++) {
      const x = k % 2 ? width : -0, z = k % 4 < 2 ? -width : width;
      pos.push(x, k < 4 ? -0 : height, z);
    }
    // Repeated vertices/edges in original triangle order; hull tests at 1e-10 and merges at 1e-8.
    const idx = [0, 4, 1, 1, 4, 5, 1, 5, 3, 3, 5, 7, 3, 7, 2, 2, 7, 6, 2, 6, 0, 0, 6, 4, 4, 6, 5, 5, 6, 7];
    if (i % 2) idx.push(0, 0, 1, 1, 4, 5, 5, 4, 1);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float64Array(pos), 3));
    if (i % 3) geo.setIndex(idx); else {
      geo.setAttribute('position', new THREE.BufferAttribute(new Float64Array(idx.flatMap(k => pos.slice(k * 3, k * 3 + 3))), 3));
    }
    const m = new THREE.Matrix4().makeTranslation(i % 4 ? (rnd() - .5) * 8000 : -0, i % 4 ? rnd() * 80 : -0, i % 4 ? (rnd() - .5) * 8000 : -0);
    a.RideGeometry.addMesh({ geometry: geo, matrixWorld: m }, 'pavement', { layered: true, sides: { sliceHeight: .16, maxSlices: 8 } });
    add(geo, m, b.RideGeometry, undefined);
  }
  sameRegistry(a, b, 'all boundary/degenerate records');
});

function terrainWorld() {
  const c = context();
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'road-network']) load(c, original(`js/${name}.js`), `js/${name}.js`);
  const N = c.window.NYC, buf = readFileSync(new URL(N.GEO.data.terrain.url, ROOT)), size = buf.readUInt32LE(4);
  const header = JSON.parse(buf.toString('utf8', 8, 8 + size)), data = buf.buffer.slice(buf.byteOffset + 8 + size, buf.byteOffset + buf.length);
  N.Terrain.load(header, new Uint16Array(data, 0, header.w * header.h));
  return { c, N };
}
async function measured(fn) {
  if (process.env.SF_WORKSPACES_PROFILE !== '1') return { result: fn() };
  const session = new Session(); session.connect();
  await session.post('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const start = performance.now(), result = fn(), ms = performance.now() - start;
  const { profile } = await session.post('HeapProfiler.stopSampling'); session.disconnect();
  let bytes = 0; const sites = {};
  const walk = node => { bytes += node.selfSize; if (node.callFrame.url.endsWith('js/drape.js') || node.callFrame.url.endsWith('js/sf-street-details.js') || node.callFrame.functionName === 'convexSlices') {
    const key = `${node.callFrame.functionName}:${node.callFrame.lineNumber + 1}`; sites[key] = (sites[key] || 0) + node.selfSize;
  } for (const c of node.children) walk(c); }; walk(profile.head);
  return { result, sampledAllocatedBytes: bytes, ms, topSites: Object.entries(sites).sort((a,b) => b[1]-a[1]).slice(0,12) };
}

test('full committed curb islands: all ordered Float64 tops/walls exactly equal', { skip: skip || process.env.SF_WORKSPACES_FULL !== '1' }, async t => {
  const { N } = terrainWorld(), T = N.Terrain;
  const a = countedDrape(sources.drape, false), b = countedDrape(changed.drape, true);
  const rings = N.BLOCKS.map(block => a.D.densify(block.poly, 2)).filter(r => r.length > 2);
  const ground = (x,z) => T.groundAt(x,z), nrm = (x,z,p) => T.normalAt(x,z,p);
  // Hold only one island's outputs at a time; hashes are byte-level Float64 (not JSON).
  const build = D => {
    const h = createHash('sha256'); let vertices = 0, triangles = 0, bytes = 0;
    for (const ring of rings) { const top = out(), wall = out(); D.polygon(ring, ground, nrm, .15, top); D.wall(ring, ground, -.3, .15, wall);
      vertices += top.pos.length / 3; triangles += top.idx.length / 3;
      for (const g of [top,wall]) for (const k of ['pos','nrm','idx']) { const b = Buffer.from(new Float64Array(g[k]).buffer); bytes += b.length; h.update(b); }
    }
    return { rings: rings.length, vertices, triangles, bytes, sha256: h.digest('hex') };
  };
  const before = await measured(() => build(a.D)), after = await measured(() => build(b.D));
  assert.deepEqual(after.result, before.result);
  assert.equal(b.counts.clips, a.counts.clips);
  assert.ok(b.counts.cutPoints < a.counts.cutPoints / 50, 'full city intersection objects reduced >98%');
  t.diagnostic(JSON.stringify({ baseline: REF, source: hash(changed.drape), before, after, allocationSites: { before: a.counts, after: b.counts } }));
});

test('full committed street placement: exact geometry, instances, footprints, ordered tops/solids/prisms', { skip: skip || process.env.SF_WORKSPACES_FULL !== '1' }, async t => {
  const { N } = terrainWorld();
  // Exact core terrain/curbs/road graph, all inventory entries; no prior landmark/building registration.
  // Rendering/materials, tree construction and downstream sidewalk scenes are outside these two edits.
  const network = N.buildRoadNetwork(N.BLOCKS.map(b => ({ ...b, block: b })), []);
  const chain = { mul() { return this; }, add() { return this; } };
  const build = code => {
    const c = context({ ...N, THREE: { ...THREE, MeshStandardNodeMaterial: THREE.MeshStandardMaterial, MeshBasicNodeMaterial: THREE.MeshBasicMaterial, LineBasicNodeMaterial: THREE.LineBasicMaterial },
      Addons: { mergeGeometries }, TSL: { uniform: v => ({value:v}), color: () => chain, mix: () => chain, smoothstep: () => chain },
      cityUniforms: { uInteriorGlow: {} }, createTrafficSignalLensMaterial: () => new THREE.MeshBasicMaterial(),
      buildSidewalkScenes: () => null, createTreeField: undefined });
    load(c, sources['sf-ride-geometry'], 'js/sf-ride-geometry.js'); load(c, code, 'js/sf-street-details.js');
    const X = c.window.NYC;
    const built = X.buildSFStreetDetails(new THREE.Group(), network, []);
    const contacts = numericDigest(), meshes = numericDigest(); let tops = 0, meshCount = 0, instances = 0;
    for (const batch of X.ride.tops) { if (batch.packedTops) for (let i = 0; i < batch.length; i++) { contacts.add(batch.record(i)); tops++; }
      else { contacts.add(batch); tops++; } }
    contacts.add(X.ride.solids); contacts.add(X.ride.prisms); contacts.add(built.footprints);
    built.group.traverse(o => { if (!o.geometry) return; meshCount++; meshes.add(o.name);
      for (const k of Object.keys(o.geometry.attributes)) { meshes.add(k); meshes.add(o.geometry.attributes[k].array); }
      meshes.add(o.geometry.index?.array ?? null); if (o.instanceMatrix) { meshes.add(o.instanceMatrix.array); instances += o.count; }
      o.geometry.dispose(); });
    return { tops, solids: X.ride.solids.length, prisms: X.ride.prisms.length, footprints: built.footprints.length, meshCount, instances, contacts: contacts.end(), meshes: meshes.end() };
  };
  const before = await measured(() => build(sources['sf-street-details'])), after = await measured(() => build(changed['sf-street-details']));
  assert.deepEqual(after.result, before.result);
  t.diagnostic(JSON.stringify({ baseline: REF, source: hash(changed['sf-street-details']), before, after }));
});
