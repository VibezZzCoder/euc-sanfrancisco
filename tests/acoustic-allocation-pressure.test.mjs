// CPU-only acoustic allocation/equivalence diagnostics. No browser or production hooks.
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';

const ref = 'fc9826b2872320bca7f08ac19d7141d3bbc31683';
const root = new URL('../', import.meta.url);
const history = gitHistory(root, ref);
const test = optionalSourceTest(history.skip);
// Keep the acoustic algorithm oracle at fc9826b, but pin the LIVE geometry consumers
// separately. dc2108c added building tunnel cuts; be408b4 extracted landmark P.body for
// species-tree drawing (retaining trunk contacts) and filtered HVAC shaders. The raw
// terrain/building inputs and footprint coverage filter did not change in those commits.
const outlineRef = 'be408b42d30f4b1c8650633b55096cfc33e635c7';
// Reviewed public-copy comments only: provenance citation moves in the first three
// files and removal of main's internal profiling citation. Pin complete blobs, not stripped comments.
const outlineBlobOverrides = new Map([
  ['js/sf-geodata.js', 'd6cbd85cddf999b560aba0974cfa06cec8acdd49'],
  ['js/terrain.js', '8b5177d8487a9ad209474f00f2cefa78cfddf8ab'],
  ['js/landmarks.js', 'd216f2dcffec64a77d32f52e37eee75887dfd4dd'],
  ['js/main.js', '227efd1d9d2bd08f503070f6f32d233f3cca5fc7']
]);
const outlineHistory = gitHistory(root, outlineRef);
const outlineTest = optionalSourceTest(history.skip || outlineHistory.skip);
const baseline = history.read('js/audio-acoustics.js');
const current = readFileSync(new URL('../js/audio-acoustics.js', import.meta.url), 'utf8');
const sha = source => createHash('sha256').update(source).digest('hex');
function build(source, label, math = Math) {
  return new Function('Math', source.replace('export { CityAcoustics };', 'return { CityAcoustics, thickness };')
    + `\n//# sourceURL=acoustic-${label}.js`)(math);
}
const before = history.available ? build(baseline, 'oracle') : null, after = build(current, 'candidate');

function polygon(points, minY = -3.125, maxY = 12.75) {
  return { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
    minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])), minY, maxY,
    polygon: points.map(([x, z]) => ({ x, z })) };
}
const courtyard = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
const hole = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
  [3, 3], [3, 7], [7, 7], [7, 3], [3, 3], [0, 0]];
const rng = initial => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};
function shapes() {
  const square = polygon([[0, 0], [10, 0], [10, 10], [0, 10]]);
  const angle = .712345678901;
  const result = [square, polygon(courtyard), polygon(hole), polygon(courtyard.toReversed()),
    polygon([[0, 0], [13, 2], [5, 11]], 35.25, 78.625),
    { ...square, polygon: undefined },
    { ...square, polygon: undefined, obb: { cx: 5.125, cz: -2.375, hx: 6.375, hz: 2.125,
      cs: Math.cos(angle), sn: Math.sin(angle) } },
    { polygon: square.polygon, maxY: 12.75 },
    { ...square, polygon: square.polygon.slice(0, 2) }];
  return [...result, ...result.map(c => ({ ...c, minY: 125.125, maxY: 128.375 }))];
}
function move(c, x, z) {
  return { ...c, minX: c.minX + x, maxX: c.maxX + x, minZ: c.minZ + z, maxZ: c.maxZ + z,
    polygon: c.polygon?.map(p => ({ x: p.x + x, z: p.z + z })),
    ...(c.obb ? { obb: { ...c.obb, cx: c.obb.cx + x, cz: c.obb.cz + z } } : {}) };
}
function equalThickness(c, ray) {
  for (const mode of [false, true]) {
    const expected = before.thickness(c, ...ray, mode);
    assert.equal(after.thickness(c, ...ray, mode), expected);
    const length = Math.hypot(ray[3] - ray[0], ray[4] - ray[1], ray[5] - ray[2]);
    assert.equal(after.thickness(c, ...ray, mode, length), expected, 'exact local world length; OBB must discard it');
  }
}

test('fc9826b exact acoustic differential: 48,000 seeded rays, reversed/end-inside/layers/translated coordinates', t => {
  assert.equal(sha(baseline), '94487728674bc6c81834a0ab3165273f333362b1a4e997e04861a8c8db768a7c');
  const random = rng(0xaca110c), outlines = shapes();
  for (let i = 0; i < 48000; i++) {
    const original = outlines[i % outlines.length];
    const x = i % 3 ? 0 : 100000.123456789, z = i % 3 ? 0 : -100000.987654321;
    const c = x ? move(original, x, z) : original;
    const ray = Array.from({ length: 6 }, (_, j) => random() * 60 - 25 + (j % 3 === 0 ? x : j % 3 === 2 ? z : 0));
    if (i % 5 === 0) { ray[1] += 125; ray[4] += 125; }
    if (i % 7 === 0) ray[4] = ray[1] + (i % 2 ? 1e-7 - 1e-15 : 1e-7 + 1e-15);
    if (i % 11 === 0) ray[3] = ray[0] + (i % 2 ? 1e-7 - 1e-15 : 1e-7 + 1e-15);
    equalThickness(c, ray); equalThickness(c, [...ray.slice(3), ...ray.slice(0, 3)]);
  }
  t.diagnostic('48,000 seeded rays × both directions × both end-inside modes × standalone/precomputed length = 384,000 exact comparisons');
});

test('original outline boundaries, bridged holes, endpoint exemptions, height layers and exceptional numbers are exact', () => {
  const rays = [[-5, 2, 5, 15, 2, 5], [5, 2, 5, 5, 2, 15], [1, 2, 1, 20, 2, 1], [-5, 2, 1, 1, 2, 1],
    [0, 2, 0, 10, 2, 0], [0, 2, 10, 10, 2, 10], [-1, 2, -1, 0, 2, 0], [0, -3.125, 0, 10, 12.75, 10],
    [5, -10, 5, 5, 20, 5], [5, 2, 5, 5, 2, 5], [-5, -3.125, 5, 15, -3.125, 5], [-5, 12.75, 5, 15, 12.75, 5],
    [-5, 12.75 + 1e-10, 5, 15, 12.75 + 2e-10, 5], [-5, -3.125 - 1e-10, 5, 15, -3.125 - 2e-10, 5],
    [-5, 2, 1e-11, 15, 2 + 1e-8, -1e-11], [-5, 2, 10, 15, 2, 10 + 1e-11],
    [-0, -0, -0, 0, 0, 0], [NaN, 2, 5, 15, 2, 5], [-Infinity, 2, 5, Infinity, 2, 5],
    [-1e308, 2, 5, 1e308, 2, 5], [-5, 2, 5, 15, Infinity, 5]];
  for (const c of shapes()) for (const ray of rays) equalThickness(c, ray);
  for (const c of shapes()) if (c.polygon) for (const p of c.polygon) {
    for (const y of [c.minY ?? 0, c.maxY, (c.minY ?? 0) + 1e-11, c.maxY - 1e-11]) {
      equalThickness(c, [p.x, y, p.z, p.x + 20, y + 1e-8, p.z + 1e-11]);
    }
  }
  const c = polygon(hole);
  assert.equal(after.thickness(c, -5, 2, 5, 15, 2, 5), 6.000000000000001, 'hole is not filled by bounds; original rounding');
  assert.equal(after.thickness(c, 5, 2, 5, 5, 2, 6), 0, 'inside the open hole');
  assert.equal(after.thickness(c, -5, 2, 1, 1, 2, 1), 0, 'source-inside exemption');
  assert.equal(after.thickness(c, -5, 2, 1, 1, 2, 1, true), before.thickness(c, -5, 2, 1, 1, 2, 1, true),
    'enclosure endpoint-inside mode with original rounding');
});

test('retained cut high-water prefix: many concave crossings, short rays, duplicates and multiple instances stay exact', () => {
  const comb = [[0, 0], [256, 0], [256, 10]];
  for (let x = 255; x >= 1; x -= 2) comb.push([x, 10], [x, 2], [x - 1, 2], [x - 1, 10]);
  const many = polygon(comb), small = polygon(hole), reversed = polygon(comb.toReversed());
  const sequence = [
    [many, [-1, 2, 5, 257, 2, 5]], [small, [-1, 2, 1, 11, 2, 1]],
    [small, [-1, 2, 5, 11, 2, 5]], [reversed, [257, 2, 5, -1, 2, 5]],
    [small, [0, 2, 0, 10, 2, 10]], [small, [-50, 2, -50, -40, 2, -40]],
  ];
  for (let i = 0; i < 32; i++) for (const [c, ray] of sequence) equalThickness(c, ray);
  const a = new after.CityAcoustics({}), b = new after.CityAcoustics({});
  const oldA = new before.CityAcoustics({}), oldB = new before.CityAcoustics({});
  a.buildings = oldA.buildings = [many]; b.buildings = oldB.buildings = [small];
  for (let i = 0; i < 32; i++) {
    const source = { x: 257, y: 2, z: 5 }, listener = { x: -1, y: 2, z: 5 };
    assert.equal(a.obstruction(source, listener), oldA.obstruction(source, listener));
    assert.equal(b.obstruction(source, listener), oldB.obstruction(source, listener));
  }
});

test('48,000 public aperture queries plus enclosure refreshes preserve source shapes, precision, layers and admission', t => {
  const random = rng(0x51de5eed), buildings = shapes().filter(c => Number.isFinite(c.minX));
  let oldQueries = 0, newQueries = 0;
  const old = new before.CityAcoustics({ nearColliders() { oldQueries++; return buildings; } });
  const now = new after.CityAcoustics({ nearColliders() { newQueries++; return buildings; } });
  const listeners = [{ x: 0, y: 0, z: 0 }, { y: 0, z: 0, x: 0, tag: 'camera' }];
  const sources = [{ x: 0, y: 0, z: 0 }, { kind: 'motor', z: 0, y: 0, x: 0 }, { y: 0, x: 0, z: 0, seed: .3 }];
  const saved = now.buildings;
  for (let i = 0; i < 48000; i++) {
    const listener = listeners[i % 2], source = sources[i % 3];
    listener.x = random() * 80 - 35; listener.y = random() * 160 - 10; listener.z = random() * 80 - 35;
    source.x = random() * 80 - 35; source.y = random() * 160 - 10; source.z = random() * 80 - 35;
    const height = random() * 5 - 2;
    if (i % 64 === 0) {
      old.update(listener, i / 100); now.update(listener, i / 100);
      assert.equal(now.enclosure, old.enclosure);
      assert.deepEqual(now.buildings, old.buildings);
      assert.equal(now.nextRefresh, old.nextRefresh);
      assert.equal(now.buildings, saved);
    }
    assert.equal(now.obstruction(source, listener, height), old.obstruction(source, listener, height));
  }
  assert.equal(newQueries, oldQueries);
  t.diagnostic(`48,000 public queries and ${newQueries} refreshes exactly match fc9826b`);
});

test('strict cache/near-source/early-depth boundaries, query order and live geometry changes match baseline', () => {
  for (const api of [before, after]) {
    let refreshes = 0;
    const solids = [polygon(courtyard), polygon([[20, 0], [50, 0], [50, 20], [20, 20]], 0, 80)];
    const acoustic = new api.CityAcoustics({ nearColliders(x, z, radius) {
      assert.equal(radius, 200); refreshes++; return solids;
    } });
    const listener = { x: -10.125, y: 2, z: 5.125 };
    acoustic.update(listener, 0); acoustic.update(listener, .49999999999); assert.equal(refreshes, 1);
    acoustic.update(listener, .5); assert.equal(refreshes, 2);
    acoustic.update({ ...listener, x: listener.x + 19.999999 }, .51); assert.equal(refreshes, 2);
    acoustic.update({ ...listener, x: listener.x + 20 }, .52); assert.equal(refreshes, 3);
    const empty = new api.CityAcoustics({});
    assert.equal(empty.obstruction({ x: 2.999999999, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), 0);
    const source = { x: 70, y: 2, z: 5.125 };
    const first = acoustic.obstruction(source, listener);
    solids[0].minY = solids[1].minY = 90;
    assert.equal(acoustic.obstruction(source, listener), 0, 'no cross-call ray-answer cache');
    assert.ok(first > 0);
    // A later collider must not be touched once the original >10 m early-depth exit admits.
    const forbidden = { get polygon() { throw new Error('past early exit'); } };
    acoustic.buildings = [polygon([[20, 0], [50, 0], [50, 20], [20, 20]], 0, 80), forbidden];
    assert.ok(acoustic.obstruction(source, listener) > .99);
  }
});

test('synchronous nested work before polygon integration preserves per-call endpoints/length and shared scratch contract', () => {
  const run = api => {
    const nested = new api.CityAcoustics({}), outer = new api.CityAcoustics({});
    nested.buildings = [polygon(hole)];
    const shape = polygon(courtyard), outline = shape.polygon;
    let armed = true, nestedResult;
    Object.defineProperty(shape, 'polygon', { get() {
      if (armed) {
        armed = false;
        nestedResult = nested.obstruction({ x: 15.125, y: 2.25, z: 5.125 }, { x: -5.375, y: 2.25, z: 5.125 });
      }
      return outline;
    } });
    outer.buildings = [shape];
    const result = outer.obstruction({ x: 15.75, y: 3.125, z: 6.25 }, { x: -5.125, y: 2.375, z: 6.75 }, .75);
    return { result, nestedResult };
  };
  assert.deepEqual(run(after), run(before));
});

test('negative controls detect transformed OBB length and pre-aperture subtraction precision changes', t => {
  const wrongObb = build(current.replace('    rayLength = undefined;', ''), 'negative-obb');
  const wrongAperture = build(current.replace('Math.hypot(bx - ax, by - ay, bz - az)',
    'Math.hypot(dx, by - ay, dz)'), 'negative-aperture');
  assert.notEqual(current, current.replace('    rayLength = undefined;', ''));
  const c = move(shapes()[6], 100000.123456789, -100000.987654321), random = rng(0xbad51de);
  let obbDifferences = 0, apertureDifferences = 0;
  const api = new after.CityAcoustics({}), bad = new wrongAperture.CityAcoustics({});
  api.buildings = bad.buildings = [polygon([[0, 0], [3, 0], [3, 10], [0, 10]])];
  for (let i = 0; i < 8000; i++) {
    const ray = [99985 + random() * 40, 2.375, -100020 + random() * 40,
      99985 + random() * 40, 2.375 + random(), -100020 + random() * 40];
    const length = Math.hypot(ray[3] - ray[0], ray[4] - ray[1], ray[5] - ray[2]);
    if (!Object.is(wrongObb.thickness(c, ...ray, true, length), before.thickness(c, ...ray, true))) obbDifferences++;
    const listener = { x: -20.123456789 + random() * 15, y: 2.375, z: 5 + random() * 4 };
    const source = { x: 10.987654321 + random() * 15, y: 2.375 + random(), z: 5 + random() * 4 };
    if (!Object.is(api.obstruction(source, listener), bad.obstruction(source, listener))) apertureDifferences++;
  }
  assert.ok(obbDifferences > 0); assert.ok(apertureDifferences > 0);
  t.diagnostic(JSON.stringify({ obbDifferences, apertureDifferences, trials: 8000,
    scope: 'deliberately wrong test-only variants; exact precision guards are sensitive' }));
});

test('exact hypotenuse-call counters isolate removed repeated work without changing collider traversal', t => {
  const f = fixture();
  const measured = (source, label) => {
    let hypotCalls = 0, colliderReads = 0;
    const math = Object.create(Math);
    math.hypot = (...args) => { hypotCalls++; return Math.hypot(...args); };
    const api = build(source, label, math);
    const run = runner(api, { ...f, buildings: f.buildings.map(c => new Proxy(c, { get(target, key) {
      if (key === 'polygon') colliderReads++;
      return Reflect.get(target, key);
    } })) });
    hypotCalls = 0; colliderReads = 0;
    const checksum = run(1024);
    return { checksum, hypotCalls, colliderReads };
  };
  const a = measured(baseline, 'counter-before'), b = measured(current, 'counter-after');
  assert.equal(b.checksum, a.checksum); assert.equal(b.colliderReads, a.colliderReads);
  assert.ok(b.hypotCalls < a.hypotCalls);
  t.diagnostic(JSON.stringify({ baseline: a, current: b,
    scope: 'exact operation counters under test-only Math/getter wrappers, not heap/object counts or timings' }));
});

test('empty regional collection preserves zero output/refresh state without introducing per-ray length work', t => {
  const measured = (source, label) => {
    let hypotCalls = 0;
    const math = Object.create(Math);
    math.hypot = (...args) => { hypotCalls++; return Math.hypot(...args); };
    const api = build(source, label, math);
    const acoustic = new api.CityAcoustics({ nearColliders() { return []; } });
    const listener = { x: -10.125, y: 75.375, z: -12.625 }, emitter = { x: 20.125, y: 30.375, z: 45.625 };
    acoustic.enclosure = .75;
    acoustic.update(listener, 0); assert.equal(acoustic.enclosure, 0);
    acoustic.update(listener, .49999999999); acoustic.update(listener, .5);
    for (let i = 0; i < 1024; i++) assert.equal(acoustic.obstruction(emitter, listener, .75), 0);
    return { hypotCalls, nextRefresh: acoustic.nextRefresh, x: acoustic.x, y: acoustic.y, z: acoustic.z };
  };
  const a = measured(baseline, 'empty-before'), b = measured(current, 'empty-after');
  t.diagnostic(JSON.stringify({ baseline: a, current: b, scope: 'empty collection exact operation counters' }));
  assert.deepEqual(b, a);
});

let committedOutlines;
async function actualOutlineFixture() {
  if (committedOutlines) return committedOutlines;
  // Only the binary decoder/render stub from the existing geometry fixture; do not build its whole city,
  // import a test module (which registers tests), load regional height grids or construct the terrain mesh.
  const [{ default: helper }, THREE] = await Promise.all([
    import('./helpers/landmarks-build.cjs'), import('../vendor/three/build/three.core.js'),
  ]);
  const files = new Map();
  const read = path => {
    const bytes = readFileSync(new URL(path, root));
    files.set(path, { sha256: sha(bytes), blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') });
    return bytes;
  };
  const text = path => read(path).toString('utf8');
  const bin = path => {
    read(path); // Include the exact decoded file in the committed-input identity check below.
    return helper.readBin(new URL(path, root));
  };
  const N = {}, window = { NYC: N }, quiet = { info() {}, warn() {}, log() {} };
  for (const name of ['sf-geodata', 'city-config', 'terrain']) new Function('window', 'console', text(`js/${name}.js`))(window, quiet);
  const t = bin(N.GEO.data.terrain.url);
  N.Terrain.load(t.header, new Uint16Array(t.ab, 0, t.header.w * t.header.h));
  const inCore = (x, z) => x >= t.header.originX && z >= t.header.originZ
    && x <= t.header.originX + (t.header.w - 1) * t.header.cell && z <= t.header.originZ + (t.header.h - 1) * t.header.cell;
  const bodies = [], three = helper.stub(), ride = helper.stub();
  // Real Shape/Path/ExtrudeGeometry preserve the consumer's area filter AND triangulation fallback for holes.
  // All other drawing is stubbed; no renderer, TSL, GPU, mesh-derived collision or regional scenery construction.
  for (const key of ['Shape', 'Path', 'Vector2', 'ExtrudeGeometry', 'Float32BufferAttribute']) three[key] = THREE[key];
  for (const key of ['MeshStandardNodeMaterial', 'MeshBasicNodeMaterial']) three[key] = class {
    constructor() { const material = helper.stub(); material.userData = {}; return material; }
  };
  ride.addMesh = (mesh, surface, options) => {
    for (const body of options.bodies || []) if (body.outer) {
      const points = body.outer.map(p => [p.x, p.z]), shape = polygon(points, body.minY, body.maxY);
      bodies.push({ key: `landmark:${N.outlineSite}:${bodies.length}`, domain: inCore((shape.minX + shape.maxX) / 2,
        (shape.minZ + shape.maxZ) / 2) ? 'core-landmark' : 'regional-landmark', acoustic: false,
      shape, rings: [body.outer, ...(body.holes || [])] });
    }
  };
  Object.assign(N, { THREE: three, Addons: helper.stub(), RideGeometry: ride,
    createPreWarBuildingMaterial: () => ({ userData: {} }), createCurtainWallMaterial: () => ({ userData: {} }) });
  const landmarks = text('js/landmarks.js'), tag = '    const s = site(m.name);';
  assert.ok(landmarks.includes(tag));
  new Function('window', 'console', landmarks.replace(tag, '    window.NYC.outlineSite = m.name;\n' + tag))(window, quiet);
  const legacy = N.buildLandmarks(helper.stub());
  assert.ok(legacy.colliders.every(c => c.rideIgnore && c.obb), 'landmark prisms/holes are not acoustic polygons');

  const b = bin(N.GEO.data.buildings.url), H = b.header, F = H.fields.length;
  const table = new Float32Array(b.ab, 0, H.tableFloats), verts = new Float32Array(b.ab, H.tableFloats * 4, H.vertexFloats);
  const buildingSource = text('js/buildings.js');
  // Execute the actual consumer's coverage filter, rather than treating every baked footprint as an acoustic polygon.
  const start = buildingSource.indexOf('    const covered = new Set();'), end = buildingSource.indexOf('    // Every mass,', start);
  assert.ok(start >= 0 && end > start);
  const covered = new Function('window', 'header', 'table', 'verts', 'F', buildingSource.slice(start, end) + '\nreturn covered;')(
    window, H, table, verts, F);
  assert.ok(buildingSource.includes('if (count === 0) {'));
  assert.ok(buildingSource.includes('minY: base, maxY: roof, polygon: pts, buildingId: i'));
  const core = []; let rawLargest = 0, zeroMass = 0, filtered = 0;
  for (let i = 0; i < H.count; i++) {
    const k = i * F, ringStart = table[k + 3], ringCount = table[k + 4];
    rawLargest = Math.max(rawLargest, ringCount);
    if (table[k + 7] !== 0) continue;
    zeroMass++;
    if (covered.has(i)) continue;
    const points = Array.from({ length: ringCount }, (_, j) => [verts[2 * (ringStart + j)], verts[2 * (ringStart + j) + 1]]);
    const shape = polygon(points, table[k], table[k + 1]); shape.buildingId = i;
    if (!(shape.maxY - shape.minY > 3 && shape.maxX - shape.minX > 2 && shape.maxZ - shape.minZ > 2)) { filtered++; continue; }
    core.push({ key: `core-building:${i}`, domain: 'core-acoustic', acoustic: true, shape, rings: [shape.polygon] });
  }
  const manifest = JSON.parse(text('data/region/manifest.json')); let regionBoxes = 0;
  for (const file of manifest.buildings.files) {
    const { ab } = bin(file.url), records = new Int32Array(ab);
    assert.equal(records.length % 7, 0); regionBoxes += records.length / 7;
  }
  const regionSource = text('js/region.js'), main = text('js/main.js');
  assert.ok(regionSource.includes('for(let k=0;k<q.length;k+=7)'));
  assert.ok(regionSource.includes('ride?.addBox({ x: b.x, y: b.y + b.h / 2, z: b.z }'));
  assert.ok(main.includes('allColliders.filter(c => !c.rideIgnore).flatMap(c => c.parts || [c])'));
  // Check exact input paths against the fixed checkpoint and reviewed comment-only blob overrides.
  const tree = execFileSync('git', ['ls-tree', '-r', outlineRef, '--', ...files.keys()], { cwd: root, encoding: 'utf8' });
  const blobs = new Map(tree.trim().split('\n').map(line => { const [meta, path] = line.split('\t'); return [path, meta.split(' ')[2]]; }));
  for (const [path, identity] of files) {
    // All live inputs, including region/main, must match their exact reviewed bytes.
    // A new geometry/consumer change requires another explicit review, never a moving HEAD pin.
    assert.equal(identity.blob, outlineBlobOverrides.get(path) ?? blobs.get(path), `reviewed input ${path}`);
  }
  const inputsSHA256 = sha(JSON.stringify([...files].map(([path, h]) => [path, h.sha256])));
  const all = [...core, ...bodies].flatMap(body => body.rings.map((ring, index) => {
    const shape = { ...body.shape, polygon: ring };
    shape.minX = Math.min(...ring.map(p => p.x)); shape.maxX = Math.max(...ring.map(p => p.x));
    shape.minZ = Math.min(...ring.map(p => p.z)); shape.maxZ = Math.max(...ring.map(p => p.z));
    let positive = 0, negative = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
      const turn = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      if (turn > 0) positive++; else if (turn < 0) negative++;
    }
    return { ...body, key: `${body.key}:${index ? `hole-${index}` : 'outer'}`, shape,
      role: index ? 'hole' : 'outer', vertices: ring.length, reflex: Math.min(positive, negative) };
  }));
  return committedOutlines = { all, inputsSHA256, inventory: { coreRecords: H.count, rawLargest, zeroMass,
    landmarkCovered: covered.size, acousticSizeFiltered: filtered, acousticPolygons: core.length,
    landmarkPrisms: bodies.length, holeRings: all.filter(c => c.role === 'hole').length,
    regionalBoxFiles: manifest.buildings.files.length, regionalBoxes: regionBoxes,
    domains: Object.fromEntries(['core-acoustic', 'core-landmark', 'regional-landmark'].map(domain => {
      const items = all.filter(c => c.domain === domain);
      return [domain, { rings: items.length, concave: items.filter(c => c.reflex > 0).length,
        holeRings: items.filter(c => c.role === 'hole').length,
        largestHole: items.filter(c => c.role === 'hole').toSorted((a, b) => b.vertices - a.vertices)
          .slice(0, 1).map(c => ({ key: c.key, vertices: c.vertices })),
        largest: items.toSorted((a, b) => b.vertices - a.vertices).slice(0, 3).map(c => ({ key: c.key, vertices: c.vertices, reflex: c.reflex, role: c.role })) }];
    })) } };
}

function outlineMeter(source, candidate) {
  const stats = { cuts: 0, shifts: 0 };
  const observed = candidate ? source.replace('  for (let i = 1; i < cutCount; i++) {',
    '  stats.cuts = cutCount;\n  for (let i = 1; i < cutCount; i++) {')
    .replace('cuts[j] = cuts[j - 1]; j--;', 'cuts[j] = cuts[j - 1]; j--; stats.shifts++;')
    : source.replace('  cuts.sort((a, b) => a - b);', '  stats.cuts = cuts.length;\n  cuts.sort((a, b) => a - b);');
  assert.notEqual(observed, source);
  const api = new Function('stats', observed.replace('export { CityAcoustics };', 'return thickness;'))(stats);
  return { stats, query(c, ray, mode) { stats.cuts = stats.shifts = 0; return api(c, ...ray, mode); } };
}
function* outlineRays(c, angles, offsets, boundaries = false) {
  const x = (c.minX + c.maxX) / 2, z = (c.minZ + c.maxZ) / 2;
  const radius = Math.hypot(c.maxX - c.minX, c.maxZ - c.minZ) / 2 + 1, y = c.minY + (c.maxY - c.minY) * .375;
  for (let i = 0; i < angles; i++) {
    const a = i * Math.PI / angles, dx = Math.cos(a), dz = Math.sin(a);
    const distances = Array.from({ length: offsets }, (_, j) => (j / (offsets - 1) * 2 - 1) * radius);
    if (boundaries && i % 4 === 0) for (let j = 0; j < Math.min(48, c.polygon.length); j++) {
      const p = c.polygon[Math.floor(j * c.polygon.length / Math.min(48, c.polygon.length))];
      const d = -(p.x - x) * dz + (p.z - z) * dx;
      distances.push(d - 1e-8, d, d + 1e-8);
    }
    for (const d of distances) {
      const cx = x - dz * d, cz = z + dx * d;
      yield [cx - dx * radius * 2, y, cz - dz * radius * 2, cx + dx * radius * 2, y, cz + dz * radius * 2];
    }
  }
}

outlineTest('committed-outline inventory and deterministic acoustic cut sweeps are exact on actual largest/concave/hole rings', async t => {
  const f = await actualOutlineFixture(), old = outlineMeter(baseline, false), now = outlineMeter(current, true);
  const selected = new Map(), results = new Map(); let comparisons = 0;
  const add = c => selected.set(c.key, c);
  for (const domain of ['core-acoustic', 'core-landmark', 'regional-landmark']) {
    const items = f.all.filter(c => c.domain === domain);
    items.toSorted((a, b) => b.vertices - a.vertices).slice(0, 8).forEach(add);
    items.filter(c => c.reflex > 0).toSorted((a, b) => b.reflex - a.reflex).slice(0, 4).forEach(add);
    items.filter(c => c.role === 'hole').forEach(add);
  }
  const check = (item, ray, mode) => {
    const expected = old.query(item.shape, ray, mode), actual = now.query(item.shape, ray, mode);
    assert.equal(actual, expected, item.key); comparisons++;
    assert.equal(now.stats.cuts, old.stats.cuts, `${item.key} active cuts`);
    const r = results.get(item.key) || { key: item.key, domain: item.domain, vertices: item.vertices, role: item.role,
      maxCuts: 0, maxShifts: 0, rays: 0 };
    r.rays++;
    if (now.stats.cuts > r.maxCuts || now.stats.shifts > r.maxShifts) {
      r.maxCuts = Math.max(r.maxCuts, now.stats.cuts); r.maxShifts = Math.max(r.maxShifts, now.stats.shifts);
      item.worstRay = ray;
    }
    assert.ok(now.stats.cuts <= item.vertices + 2, 'one accepted cut per original edge plus two height bounds');
    results.set(item.key, r);
  };
  // Every consumer ring gets a coarse sweep; the largest/reflex-rich and ALL actual hole rings get dense sweeps.
  for (const item of f.all) for (const ray of outlineRays(item.shape, 8, 17)) check(item, ray, false);
  const coarseWorst = [...results.values()].toSorted((a, b) => b.maxCuts - a.maxCuts)[0];
  add(f.all.find(c => c.key === coarseWorst.key));
  for (const item of selected.values()) for (const ray of outlineRays(item.shape, 32, 65, true)) {
    for (const direction of [ray, [...ray.slice(3), ...ray.slice(0, 3)]]) for (const mode of [false, true]) {
      check(item, direction, mode);
      const length = Math.hypot(direction[3] - direction[0], direction[4] - direction[1], direction[5] - direction[2]);
      assert.equal(after.thickness(item.shape, ...direction, mode, length), before.thickness(item.shape, ...direction, mode), item.key);
      comparisons++;
    }
  }
  assert.ok(f.inventory.acousticPolygons > 50); assert.ok(f.inventory.holeRings > 0);
  const ranked = [...results.values()].toSorted((a, b) => b.maxCuts - a.maxCuts || b.maxShifts - a.maxShifts);
  assert.equal(Math.max(...f.all.map(c => c.vertices)), 207, 'largest frozen consumer ring');
  assert.equal(ranked[0].maxCuts, 40, 'revisit measured CPU evidence if this deterministic cut budget changes');
  assert.equal(Math.max(...[...results.values()].map(c => c.maxShifts)), 704);
  t.diagnostic(JSON.stringify({ phase: 'committed-outline', ref, outlineRef, sourceSHA256: sha(current), inputsSHA256: f.inputsSHA256,
    inventory: f.inventory, selected: selected.size, comparisons, maxCuts: ranked[0],
    maxShifts: [...results.values()].toSorted((a, b) => b.maxShifts - a.maxShifts)[0], topCuts: ranked.slice(0, 8),
    scope: 'actual acoustic polygons plus separately labelled landmark outer/hole ring sort stress; no compound hole flattening or new acoustic admission' }));
  if (process.env.SF_ACOUSTIC_OUTLINE_BENCH) {
    const cases = [...selected.values()].filter(c => c.worstRay).toSorted((a, b) => b.vertices - a.vertices).slice(0, 8);
    const worst = f.all.find(c => c.key === ranked[0].key);
    if (!cases.includes(worst)) cases.push(worst);
    const run = (api, cases, count) => {
      let checksum = 0;
      for (let i = 0; i < count; i++) {
        const c = cases[i % cases.length], r = c.worstRay;
        checksum += api.thickness(c.shape, r[0], r[1], r[2], r[3], r[4], r[5], false);
      }
      return checksum;
    };
    for (const [group, items, count] of [['largest-mix', cases, 4096], ['largest-ring', [cases[0]], 2048],
      ['most-cuts-shifts', [worst], 2048]]) {
      run(before, items, count); run(after, items, count);
      const expected = run(before, items, count);
      for (const [variant, api] of [['baseline', before], ['current', after], ['current', after], ['baseline', before]]) {
        const start = performance.now(), checksum = run(api, items, count), ms = performance.now() - start;
        assert.equal(checksum, expected);
        t.diagnostic(JSON.stringify({ phase: 'committed-outline-cpu', group, variant, calls: count,
          cases: items.map(c => c.key), ms, checksum }));
      }
    }
  }
});

function fixture() {
  const buildings = [];
  for (let i = 0; i < 96; i++) {
    const x = (i % 12 - 6) * 16.125, z = (Math.floor(i / 12) - 4) * 23.375;
    const c = polygon(courtyard.map(([px, pz]) => [px + x, pz + z]), (i % 5) * 4.125, 34.375 + i % 7);
    if (i % 3 === 0) delete c.polygon;
    if (i % 3 === 1) {
      delete c.polygon;
      c.obb = { cx: x + 5, cz: z + 5, hx: 5, hz: 5, cs: Math.cos(i * .13), sn: Math.sin(i * .13) };
      // The rotated box's conservative bounds must still enclose it.
      c.minX = x - 3; c.maxX = x + 13; c.minZ = z - 3; c.maxZ = z + 13;
    }
    buildings.push(c);
  }
  // Several source layouts imitate independent mutable city-source record shapes.
  const sources = Array.from({ length: 64 }, (_, i) => i % 2
    ? { id: i, x: 75.125 + Math.sin(i) * 90, y: 1.25 + i % 12, z: -90.75 + i * 3.125, gain: .2 }
    : { x: -140.375 + i * 4.125, z: 120.625 - i * 3.25, y: 1.5 + i % 9, kind: 'motor' });
  return { buildings, sources, listener: { x: -10.125, y: 2.375, z: -12.625 } };
}

function runner(api, f) {
  const acoustic = new api.CityAcoustics({ nearColliders() { return f.buildings; } });
  acoustic.update(f.listener, 0);
  let now = 0;
  return count => {
    let checksum = 0;
    for (let i = 0; i < count; i++) {
      // No object/array construction or snapshot in the measured loop.
      checksum += acoustic.obstruction(f.sources[i & 63], f.listener, (i & 3) * .375);
      if ((i & 63) === 0) acoustic.update(f.listener, now += .5);
    }
    return checksum;
  };
}

const indexed = source => source.replaceAll('for (const c of this.buildings) {',
  'for (let j = 0; j < this.buildings.length; j++) { const c = this.buildings[j];');
const hoisted = source => source.replace('      for (const c of this.buildings) {\n        depth = Math.max(depth, thickness(c, listener.x + ox, listener.y, listener.z + oz,\n          source.x + ox, source.y + height, source.z + oz));',
  '      const ax = listener.x + ox, ay = listener.y, az = listener.z + oz;\n'
  + '      const bx = source.x + ox, by = source.y + height, bz = source.z + oz;\n'
  + '      for (const c of this.buildings) {\n        depth = Math.max(depth, thickness(c, ax, ay, az, bx, by, bz));');
const probeHoisted = source => hoisted(source).replace(
  '      let depth = 0;\n      for (const c of this.buildings) {\n        depth = Math.max(depth, thickness(c, this.x, this.y, this.z, x, this.y + 40, z, true));',
  '      let depth = 0;\n      const y = this.y + 40;\n      for (const c of this.buildings) {\n        depth = Math.max(depth, thickness(c, this.x, this.y, this.z, x, y, z, true));');
const lengthHoisted = source => probeHoisted(source)
  .replace('bz, allowEndInside) {', 'bz, allowEndInside, rayLength) {')
  .replace('fraction * Math.hypot(dx, dy, dz)', 'fraction * (rayLength ?? Math.hypot(dx, dy, dz))')
  .replace('bz, allowEndInside = false) {', 'bz, allowEndInside = false, rayLength) {')
  .replace('bz, allowEndInside);', 'bz, allowEndInside, rayLength);')
  .replace('    const o = c.obb;', '    rayLength = undefined;\n    const o = c.obb;')
  .replace('Math.max(0, exit - enter) * Math.hypot(dx, dy, dz)', 'Math.max(0, exit - enter) * (rayLength ?? Math.hypot(dx, dy, dz))')
  .replace('      const y = this.y + 40;', '      const y = this.y + 40;\n      const rayLength = Math.hypot(x - this.x, y - this.y, z - this.z);')
  .replace('x, y, z, true));', 'x, y, z, true, rayLength));')
  .replace('      for (const c of this.buildings) {\n        depth = Math.max(depth, thickness(c, ax, ay, az, bx, by, bz));',
    '      const rayLength = Math.hypot(bx - ax, by - ay, bz - az);\n'
    + '      for (const c of this.buildings) {\n        depth = Math.max(depth, thickness(c, ax, ay, az, bx, by, bz, false, rayLength));');
test('optional bounded acoustic CPU/allocation diagnosis (no timing/allocation threshold)',
  { skip: !process.env.SF_ACOUSTIC_ALLOC }, async t => {
    const session = new Session(); session.connect();
    const scripts = new Map();
    session.on('Debugger.scriptParsed', ({ params }) => scripts.set(params.scriptId, params.url));
    const post = (method, args = {}) => new Promise((resolve, reject) => session.post(method, args,
      (err, result) => err ? reject(err) : resolve(result)));
    const f = fixture();
    const variants = process.env.SF_ACOUSTIC_TRIALS ? [
      ['baseline', baseline], ['indexed', indexed(baseline)], ['endpoints', hoisted(baseline)],
      ['length', lengthHoisted(baseline)], ['current', current],
    ] : [['baseline', baseline], ['current', current]];
    const runs = variants.map(([name, source]) => ({ name, source, run: runner(build(source, name), f) }));
    const count = 12000;
    try {
      await post('Debugger.enable');
      await post('HeapProfiler.enable');
      for (const v of runs) { v.run(6000); v.run(6000); }
      const expected = runs[0].run(count);
      // Unprofiled CPU windows separately, in A/B/.../B/A order.
      for (const v of [...runs, ...runs.toReversed()]) {
        const start = performance.now(), checksum = v.run(count), ms = performance.now() - start;
        assert.equal(checksum, expected);
        t.diagnostic(JSON.stringify({ phase: 'cpu', variant: v.name, calls: count, ms, checksum }));
      }
      for (const v of [...runs, ...runs.toReversed()]) {
        await post('HeapProfiler.startSampling', { samplingInterval: 8192,
          includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
        const checksum = v.run(count);
        const { profile } = await post('HeapProfiler.stopSampling');
        assert.equal(checksum, expected);
        const sites = new Map(), allSites = new Map(), frames = new Map();
        let total = 0, own = 0, nodeSelfBytes = 0;
        const visit = node => {
          nodeSelfBytes += node.selfSize;
          frames.set(node.id, node.callFrame);
          for (const child of node.children) visit(child);
        };
        visit(profile.head);
        // Use sample-record sizes consistently for totals AND source attribution. V8 can return a slightly
        // different sum of node.selfSize; retain that separately instead of asserting false byte identity.
        for (const sample of profile.samples) {
          const frame = frames.get(sample.nodeId); assert.ok(frame);
          const { functionName, lineNumber, scriptId } = frame;
          const url = frame.url || scripts.get(scriptId) || '';
          total += sample.size;
          const key = `${functionName || '(anonymous)'}@${url || `script:${scriptId}`}:${lineNumber + 1}`;
          allSites.set(key, (allSites.get(key) || 0) + sample.size);
          if (url.startsWith('acoustic-')) {
            own += sample.size;
            const key = `${functionName}:${lineNumber + 1}`;
            sites.set(key, (sites.get(key) || 0) + sample.size);
          }
        }
        t.diagnostic(JSON.stringify({ phase: 'allocation', variant: v.name, calls: count,
          totalBytes: total, acousticSelfBytes: own, nodeSelfBytes, samples: profile.samples.length,
          sites: Object.fromEntries([...sites].sort((a, b) => b[1] - a[1]).slice(0, 12)),
          topSelfSites: Object.fromEntries([...allSites].sort((a, b) => b[1] - a[1]).slice(0, 8)) }));
      }
      t.diagnostic(JSON.stringify({ ref, node: process.version, v8: process.versions.v8,
        baselineSHA256: sha(baseline), currentSHA256: sha(current),
        scope: 'synthetic mixed collider/source layouts; sampled attributed churn, not retained heap or route/browser timing' }));
    } finally { session.disconnect(); }
  });
