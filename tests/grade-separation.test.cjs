// Roads off the ground (P3.3): js/grade-separation.js built in vm on the real road network, terrain and freeway data.
// The tunnels (Broadway, Stockton) run under their hills with a floor the player finds from inside and the hill from
// above; the Mission Creek bridges carry a deck over the water; the freeways' decks and highway lanes stand on the
// ground or above it.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { BOX } = require('./helpers/geo-box.cjs');

const root = join(__dirname, '..');
const terrainFile = join(root, `data/terrain-${BOX}.bin`);
const skip = (!existsSync(terrainFile) || BOX === 'slice') && 'needs the core terrain';

// Just enough of THREE for the builder: geometry kept as arrays, materials as plain objects
class Vector3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class Group { constructor() { this.children = []; } add(...o) { this.children.push(...o); } }
class BufferAttribute { constructor(array, size) { Object.assign(this, { array, size }); } }
class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(k, a) { this.attributes[k] = a; }
  computeVertexNormals() {}
  computeBoundingSphere() {}
}
class Mesh { constructor(geometry, material) { Object.assign(this, { geometry, material }); } }
class Material { constructor(o) { Object.assign(this, o); } }
const THREE = { Vector3, Group, BufferAttribute, BufferGeometry, Mesh, MeshStandardNodeMaterial: Material, MeshBasicNodeMaterial: Material, DoubleSide: 2 };

let cached;
function build(options = {}) {
  if (!Object.keys(options).length && cached) return cached;
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: { DEBUG_ROADS: false } }, console: { info() {}, log: console.log } });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js', 'js/road-network.js', 'js/sf-ride-geometry.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const NYC = context.window.NYC;
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  NYC.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length), 0, header.w * header.h));
  if (options.graph) NYC.GEO.roadGraph = options.graph;
  if (options.ground) NYC.Terrain.groundAt = options.ground;
  Object.assign(NYC, { THREE, createRoadSurfaceMaterial: () => new Material({}), createMarbleAshlarMaterial: () => new Material({}) });
  // Optional read-only disabled-fix replay; default runs require no Git history.
  let source = process.env.SF_TUNNEL_GRADE_REF
    ? execFileSync('git', ['show', `${process.env.SF_TUNNEL_GRADE_REF}:js/grade-separation.js`], { cwd: root, encoding: 'utf8' })
    : readFileSync(join(root, 'js/grade-separation.js'), 'utf8');
  const sourceHash = createHash('sha256').update(source).digest('hex');
  if (options.uncut) source = source.replace('freewayParapet(w, i, o, dx, dz);',
    'strip(at(p, o), at(q, o), dx, dz, 0.3, 0, PARAPET_H, geo.concrete);');
  vm.runInContext(source, context);
  const sidewalks = NYC.BLOCKS.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b }));
  const network = options.graph ? { edges: [] } : NYC.buildRoadNetwork(sidewalks, []);
  const scene = new Group();
  const grade = NYC.buildGradeSeparation(scene, network);
  const result = { NYC, network, grade, scene, sourceHash };
  if (!Object.keys(options).length) cached = result;
  return result;
}

test('tunnels: AI lanes through both bores, a floor found from inside the bore and the hill from above it', { skip }, () => {
  const { NYC, network, grade } = build();
  const T = NYC.Terrain;
  for (const name of ['STOCKTON TUNL', 'ROBERT C LEVY TUNL']) {
    const edges = network.edges.filter((e) => e.name === name && e.bore && e.bore.kind === 'tunnel');
    assert.ok(edges.length >= 2, `${name}: ${edges.length} edges driven both ways`);
    // deepest point of the bore: the hill well over the floor, the floor where the lanes run
    let best = null;
    for (const e of edges) {
      for (let s = 0; s <= e.len; s += 4) {
        const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
        const cover = T.groundAt(x, z) - network.edgeY(e, s);
        if (!best || cover > best.cover) best = { e, s, x, z, cover };
      }
    }
    assert.ok(best.cover > 10, `${name}: ${best.cover.toFixed(1)} m of hill over the deepest point`);
    const y = network.edgeY(best.e, best.s);
    assert.ok(Math.abs(grade.floorAt(best.x, best.z, y + 1) - y) < 0.05, `${name}: floor from inside`);
    assert.equal(grade.floorAt(best.x, best.z, T.groundAt(best.x, best.z)), null, `${name}: the hill from above`);
    assert.ok(Math.abs(grade.roofAt(best.x, best.z, y + 1) - (y + 5.2)) < 0.05);
    assert.ok(grade.carveAt(best.x, best.z) === null, `${name}: the hill stays over the deep bore`);
  }
  // pedestrians can't walk in: no tunnel lane ends on a curb island's sidewalk mid-bore
  for (const e of network.edges.filter((e) => e.bore && e.bore.kind === 'tunnel')) {
    const mid = e.len / 2;
    assert.equal(network.onSidewalk(e.sx + e.dx * mid, e.sz + e.dz * mid) && !e.bore, false);
  }
});

test('bridges: the 3rd and 4th St decks carry their lanes over Mission Creek', { skip }, () => {
  const { NYC, network, grade } = build();
  const T = NYC.Terrain;
  for (const name of ['03RD ST', '04TH ST']) {
    const edges = network.edges.filter((e) => e.name === name && e.bore && e.bore.kind === 'bridge');
    assert.ok(edges.length >= 2, `${name}: ${edges.length} bridge edges`);
    let wet = 0;
    for (const e of edges) {
      for (let s = 0; s <= e.len; s += 2) {
        const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
        if (T.heightAt(x, z) > T.waterLevel + 0.05) continue;
        wet++;
        const y = network.edgeY(e, s);
        assert.ok(y > T.waterLevel + 2, `${name}: deck ${y.toFixed(2)} over the water`);
        assert.ok(Math.abs(grade.floorAt(x, z, y + 0.5) - y) < 0.05, `${name}: deck floor`);
      }
    }
    assert.ok(wet > 5, `${name}: ${wet} samples over the water`);
  }
});

test('freeways: decks on or over the ground, highway lanes along them, finite colliders', { skip }, () => {
  const { NYC, grade } = build();
  const T = NYC.Terrain;
  assert.ok(grade.highwayLanes.length >= 4, `${grade.highwayLanes.length} lanes`);
  let over = 0;
  for (const lane of grade.highwayLanes) {
    assert.ok(lane.pts.length > 10 && lane.speed > 0);
    for (const p of lane.pts) {
      assert.ok(Number.isFinite(p.x + p.y + p.z));
      assert.ok(p.y >= T.groundAt(p.x, p.z) - 0.5, `lane at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}: ${(p.y - T.groundAt(p.x, p.z)).toFixed(2)} m under the ground`);
      if (p.y > T.groundAt(p.x, p.z) + 5) over++;
    }
  }
  assert.ok(over > 100, `${over} lane points on viaducts`);
  for (const c of grade.colliders) {
    assert.ok([c.minX, c.maxX, c.minZ, c.maxZ, c.minY, c.maxY].every(Number.isFinite) && c.maxY > c.minY);
  }
});

const containsBox = (b, p) => {
  const x = p.x - b.centre.x, z = p.z - b.centre.z, c = Math.cos(b.rotationY), s = Math.sin(b.rotationY);
  return Math.abs(c * x - s * z) < b.halfExtents.x - 1e-6 &&
    Math.abs(s * x + c * z) < b.halfExtents.z - 1e-6 && Math.abs(p.y - b.centre.y) < b.halfExtents.y - 1e-6;
};
const meshPositions = (world, name) => world.grade.group.children.find(m => m.name === `SFGradeSeparation_${name}`).geometry.attributes.position.array;
const meshBytes = (world, name) => {
  const p = meshPositions(world, name);
  return Buffer.from(p.buffer, p.byteOffset, p.byteLength);
};
const insideTop = (poly, x, z) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (Math.abs(cross) < 1e-7) continue;
    if (sign && sign !== Math.sign(cross)) return false;
    sign = Math.sign(cross);
  }
  return true;
};

// Independent vertical rays against the builder's final Float32 triangles, bounded by an XZ index.
// Neither internal roof arrays nor an invented grade.floors/ceilingOffset participate in this oracle.
function verticalTriangles(world, names, T) {
  const cells = new Map(), size = 8;
  for (const name of names) {
    const p = meshPositions(world, name);
    for (let k = 0; k < p.length; k += 9) {
      const triangle = [0, 3, 6].map(offset => new T.Vector3().fromArray(p, k + offset));
      const xs = triangle.map(v => v.x), zs = triangle.map(v => v.z);
      for (let ix = Math.floor(Math.min(...xs) / size); ix <= Math.floor(Math.max(...xs) / size); ix++)
        for (let iz = Math.floor(Math.min(...zs) / size); iz <= Math.floor(Math.max(...zs) / size); iz++) {
          const key = `${ix},${iz}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(triangle);
        }
    }
  }
  const ray = new T.Ray(), point = new T.Vector3();
  return (origin, direction, distance) => {
    ray.set(origin, direction); let nearest = null;
    for (const triangle of cells.get(`${Math.floor(origin.x / size)},${Math.floor(origin.z / size)}`) ?? []) {
      if (!ray.intersectTriangle(...triangle, false, point)) continue;
      const hit = point.distanceTo(origin);
      if (hit <= distance && (nearest === null || hit < nearest)) nearest = hit;
    }
    return nearest;
  };
}

test('adaptive covered roofs and open approaches agree with independent drawn triangles and native registered bodies', { skip, timeout: 30000 }, async t => {
  const world = build(), { network, grade, NYC } = world;
  const T = await import('../vendor/three/build/three.webgpu.js');
  const { SfTerrainSampler } = await import('../js/sf-terrain-sampler.js');
  const sampler = new SfTerrainSampler({ terrain: NYC.Terrain, grade, ride: NYC.ride, waterAt: () => false });
  assert.equal(grade.floors, undefined, 'fixture exercises registered native bodies, not inactive legacy gradeTops');
  assert.equal(sampler.legacyGradeRays, false, 'ceiling contact comes from actual registered structure bodies');
  const ceiling = verticalTriangles(world, ['ceiling'], T);
  const overhead = verticalTriangles(world, ['ceiling', 'light', 'masonry', 'wall'], T);
  const pavement = verticalTriangles(world, ['road'], T);
  const up = new T.Vector3(0, 1, 0), down = new T.Vector3(0, -1, 0), failures = [], summary = [];
  let failureCount = 0;
  const fail = (kind, e, s, x, z, actual, expected) => {
    failureCount++;
    if (failures.length < 12) failures.push({ kind, edge: e.id, s, x, z, actual, expected });
  };
  for (const e of network.edges.filter(e => e.bore?.kind === 'tunnel')) {
    const offset = Math.hypot(e.sx - e.x0, e.sz - e.z0);
    const at = u => (u - e.bore.a0) / (e.bore.a1 - e.bore.a0) * e.span - offset;
    const lo = Math.max(-offset, Math.min(at(e.bore.p0), at(e.bore.p1)));
    const hi = Math.min(e.span - offset, Math.max(at(e.bore.p0), at(e.bore.p1)));
    const counts = { edge: e.id, name: e.name, covered: 0, open: 0, adaptive: 0, deep: 0, groundApproach: 0 };
    // Half-metre-inset one-metre stations avoid placing the oracle exactly on a closed/open boundary.
    for (let s = lo + .5; s < hi; s += 1) {
      const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
      const gradeFloor = grade.floorAt(x, z, -10000);
      // Opposite Broadway links have different source portal arcs. Their graph-defined approaches
      // can extend beyond the shared physical span: absence of a grade floor there means ordinary
      // approach pavement, not necessarily a missing tunnel. Still demand no drawn floor hidden
      // from floorAt, and the same roofAt/drawn/native open-sky agreement below.
      const floor = Number.isFinite(gradeFloor) ? gradeFloor : network.edgeY(e, s);
      assert.ok(Number.isFinite(floor), `edge ${e.id}, ${s}: finite traffic approach height`);
      const roof = grade.roofAt(x, z, floor + 1);
      const origin = new T.Vector3(x, floor + .3, z);
      if (!Number.isFinite(gradeFloor)) {
        counts.groundApproach++;
        const drawnFloor = pavement(origin, down, 1);
        if (drawnFloor !== null) fail('drawn grade floor lacks floorAt lookup', e, s, x, z, gradeFloor, origin.y - drawnFloor);
      }
      const drawnCeiling = ceiling(origin, up, 8), drawnObstacle = overhead(origin, up, 8);
      const physical = sampler.raycastObstacle(origin, up, 8);
      if (Number.isFinite(roof)) {
        counts.covered++;
        if (roof - floor < 5.15) counts.adaptive++;
        if (Math.abs(roof - floor - 5.2) < 1e-6) counts.deep++;
        if (drawnCeiling === null || Math.abs(origin.y + drawnCeiling - roof) > .021)
          fail('covered roofAt/drawn ceiling', e, s, x, z, drawnCeiling === null ? null : origin.y + drawnCeiling, roof);
      } else {
        counts.open++;
        if (roof !== Infinity || drawnCeiling !== null) fail('open approach has ceiling', e, s, x, z, { roof, drawnCeiling }, 'Infinity / null');
      }
      // Lights and portal masonry may be lower than the ceiling. Compare like-for-like first
      // obstacles rather than treating roofAt as the complete obstacle query.
      if (drawnObstacle === null ? physical !== null : physical === null || Math.abs(drawnObstacle - physical) > 2e-4)
        fail('drawn/native first overhead obstacle', e, s, x, z, physical, drawnObstacle);
    }
    summary.push(counts);
  }
  t.diagnostic(JSON.stringify({ source: world.sourceHash, summary, failureCount, failures }));
  for (const name of ['STOCKTON TUNL', 'ROBERT C LEVY TUNL']) {
    const parts = summary.filter(s => s.name === name);
    assert.ok(parts.reduce((sum, s) => sum + s.covered, 0) > 50, `${name}: covered intervals exercised`);
    assert.ok(parts.reduce((sum, s) => sum + s.open, 0) > 0, `${name}: open approaches exercised`);
    if (name === 'STOCKTON TUNL') {
      assert.equal(parts.reduce((sum, s) => sum + s.adaptive, 0), 0, 'clean lower Stockton anchors leave full 5.2 m clearance');
      assert.ok(parts.every(s => s.covered === s.deep), 'every covered Stockton station retains full-height clearance');
    } else assert.ok(parts.reduce((sum, s) => sum + s.adaptive, 0) > 0, `${name}: shallow adaptive intervals exercised`);
    assert.ok(parts.reduce((sum, s) => sum + s.deep, 0) > 50, `${name}: unchanged deep 5.2 m ceiling exercised`);
  }
  assert.equal(failureCount, 0, 'roof/portal representation disagreement; inspect diagnostics');
});

test('real I-80 west on-ramp merge opens internal rails while floors, grades, navigation and highway lanes are identical', { skip }, () => {
  const current = build(), before = build({ uncut: true });
  const rg = current.NYC.GEO.roadGraph;
  assert.equal(rg.names[rg.links[266][2]], 'I-80 W ON RAMP');
  assert.deepEqual(Array.from(rg.links[266].slice(0, 2)), [77, 297]);
  assert.deepEqual(Array.from(rg.links[271].slice(0, 2)), [292, 297]);
  // Restoring just the old unconditional strip is a failing control, not a second height/traffic implementation.
  assert.deepEqual(meshBytes(current, 'road'), meshBytes(before, 'road'));
  assert.equal(JSON.stringify(current.NYC.ride.tops), JSON.stringify(before.NYC.ride.tops));
  assert.equal(JSON.stringify(current.grade.highwayLanes), JSON.stringify(before.grade.highwayLanes));
  assert.equal(JSON.stringify(current.grade.colliders), JSON.stringify(before.grade.colliders));
  const laneGeometry = w => JSON.stringify(w.network.edges.map(({ name, x0, z0, dx, dz, span, half, lanes, bore }) =>
    ({ name, x0, z0, dx, dz, span, half, lanes, bore })));
  assert.equal(laneGeometry(current), laneGeometry(before));
  for (let x = -120; x <= 120; x += 10) for (let z = 1080; z <= 1280; z += 10)
    assert.equal(current.network.walkable(x - .5, x + .5, z - .5, z + .5), before.network.walkable(x - .5, x + .5, z - .5, z + .5));
  const rails = w => w.NYC.ride.solids.filter(b => Math.abs(b.halfExtents.x - .15) < 1e-8 && Math.abs(b.halfExtents.y - .5) < 1e-8);
  const local = rails(before).filter(b => Math.hypot(b.centre.x + 9.7, b.centre.z - 1198.2) < 80);
  const after = rails(current);
  const opened = local.filter(b => !after.some(a => containsBox(a, b.centre)));
  assert.ok(opened.length > 10, `source merge has ${opened.length} formerly obstructed rail centres cleared`);
  assert.ok(local.some(b => after.some(a => containsBox(a, b.centre))), 'local exposed protection remains');
  const floor = (x, z) => Math.max(...current.NYC.ride.tops.filter(t => insideTop(t.poly, x, z)).map(t =>
    t.plane ? t.plane.y + t.plane.dx * (x - t.plane.x) + t.plane.dz * (z - t.plane.z) : t.top));
  const end = { x: -9.7, z: 1198.2 }, start = { x: 53.1, z: 1132.8 };
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const route = Array.from({ length: 80 }, (_, i) => {
    const u = (i + .5) / length, x = end.x + (start.x - end.x) * u, z = end.z + (start.z - end.z) * u;
    return { x, y: floor(x, z), z };
  });
  assert.ok(route.every(p => Number.isFinite(p.y)), 'last 80 m of source ramp centreline retains support');
  const blocked = w => route.filter(p => w.NYC.ride.solids.some(b => containsBox(b, { ...p, y: p.y + .5 })));
  assert.ok(blocked(before).length > 0, 'original barrier demonstrably crosses source ramp centreline');
  assert.equal(blocked(current).length, 0, `source ramp centreline obstruction: ${JSON.stringify(blocked(current).map(p => ({ p,
    bodies: current.NYC.ride.solids.filter(b => containsBox(b, { ...p, y: p.y + .5 })) })))}`);
  if (process.env.SF_JUNCTION_PROBES) {
    console.log('I-80 merge cleared centres', JSON.stringify(opened.filter((_, i) => i % Math.ceil(opened.length / 6) === 0).map(b => b.centre)));
    console.log('I-80 source arms', JSON.stringify([266, 271, 272].map(li => ({ li, link: rg.links[li],
      endpoints: rg.links[li].slice(0, 2).map(id => [rg.nodes[id * 2], rg.nodes[id * 2 + 1]]) }))));
    console.log('barriers: before / after / local cleared', rails(before).length, after.length, opened.length);
    console.log('ramp approach / merge probes', JSON.stringify([route[70], route[40], route[10]]));
  }
});

function junctionGraph({ disconnected = false, layer = 1, rampStart = [-100, 40] } = {}) {
  return { nodes: [-100, 0, 0, 0, 100, 0, ...rampStart, 0, 0], names: ['main', 'ramp'],
    links: [[0, 1, 0, 0, 3, 1, [], 1], [1, 2, 0, 0, 3, 1, [], 1], [3, disconnected ? 4 : 1, 1, 0, 1, 1, [], 5]],
    decks: [[0, [1, 1]], [1, [1, 1]], [2, [layer, layer]]] };
}

test('junction clipping clears the merge in both drawn triangles and native obstacle rays; exposed rails still stop both', { skip }, async () => {
  const { SfTerrainSampler } = await import('../js/sf-terrain-sampler.js');
  const T = await import('../vendor/three/build/three.webgpu.js');
  const graph = junctionGraph(), ground = () => 0;
  const current = build({ graph, ground }), before = build({ graph, ground, uncut: true });
  function rays(world, x, z, dz) {
    const sampler = new SfTerrainSampler({ ride: world.NYC.ride,
      terrain: { originX: -150, originZ: -150, cell: 300, w: 2, h: 2, heights: [0, 0, 0, 0] }, waterAt: () => false });
    const origin = new T.Vector3(x, 8.5, z), direction = new T.Vector3(0, 0, dz);
    const physical = sampler.raycastObstacle(origin, direction, 4);
    const ray = new T.Ray(origin, direction), positions = meshPositions(world, 'concrete');
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), hit = new T.Vector3();
    let drawn = null;
    for (let k = 0; k < positions.length; k += 9) {
      a.fromArray(positions, k); b.fromArray(positions, k + 3); c.fromArray(positions, k + 6);
      if (ray.intersectTriangle(a, b, c, false, hit)) {
        const distance = origin.distanceTo(hit);
        if (distance <= 4 && (drawn === null || distance < drawn)) drawn = distance;
      }
    }
    return { physical, drawn };
  }
  for (const [z, dz] of [[8, -1], [4, 1]]) {
    const bad = rays(before, -15.625, z, dz), good = rays(current, -15.625, z, dz);
    assert.ok(bad.physical !== null && bad.drawn !== null, 'old rail blocks native contact and drawing');
    assert.deepEqual(good, { physical: null, drawn: null }, 'both directions through repaired merge are clear');
  }
  const edge = rays(current, -50, -4, -1);
  assert.ok(edge.physical !== null && edge.drawn !== null);
  assert.ok(Math.abs(edge.physical - edge.drawn) < 1e-5);
  assert.deepEqual(meshBytes(current, 'road'), meshBytes(before, 'road'));
});

test('unconnected overlaps, stacked crossings, height-mismatched arms and distant overlap retain barriers', { skip }, () => {
  const ground = () => 0;
  for (const options of [{ disconnected: true }, { disconnected: true, layer: 2 }]) {
    const graph = junctionGraph(options);
    assert.deepEqual(meshBytes(build({ graph, ground }), 'concrete'), meshBytes(build({ graph, ground, uncut: true }), 'concrete'));
  }
  const graph = junctionGraph({ layer: 2 });
  const current = build({ graph, ground }), before = build({ graph, ground, uncut: true });
  const probe = before.NYC.ride.solids.find(b => b.centre.x > -16 && b.centre.x < -12 &&
    Math.abs(b.centre.z - 6.25) < 1e-6 && Math.abs(b.halfExtents.y - .5) < 1e-6).centre;
  assert.ok(current.NYC.ride.solids.some(b => containsBox(b, probe)),
    'connected but different deck heights do not open protection');
  // Very shallow merge: pavement overlaps far beyond the bounded junction, but no global union is allowed.
  const longGraph = junctionGraph({ rampStart: [-500, 18] });
  longGraph.nodes[0] = -200;
  const long = build({ graph: longGraph, ground });
  assert.ok(long.NYC.ride.solids.some(b => containsBox(b, { x: -130, y: 8.5, z: 6.25 })),
    'protection beyond 120 m remains even where the connected ramp overlaps');
});

test('registered floors match independent drawn triangles; tunnel replacement is height-bounded and slabs are body-only', { skip }, () => {
  const { NYC, grade } = build();
  const tops = NYC.ride.tops;
  assert.ok(grade.colliders.every(c=>c.rideIgnore),'legacy navigation boxes are marked for exclusion from EUC contacts');
  assert.ok(tops.length > 1000, `${tops.length} road facets including final freeway stations`);
  const value = (t, x, z) => t.plane ? t.plane.y + t.plane.dx * (x - t.plane.x) + t.plane.dz * (z - t.plane.z) : t.top;
  const drawn = grade.group.children.find(m => m.name === 'SFGradeSeparation_road').geometry.attributes.position.array;
  // Quantised drawing vertices are an independent output; registration must preserve every floor corner.
  const vertices = new Set();
  for (const t of tops) for (const p of t.poly) vertices.add(`${p.x.toFixed(2)},${value(t,p.x,p.z).toFixed(2)},${p.z.toFixed(2)}`);
  let matched = 0;
  for (let k=0;k<drawn.length;k+=3) {
    const key = `${drawn[k].toFixed(2)},${drawn[k+1].toFixed(2)},${drawn[k+2].toFixed(2)}`;
    if (vertices.has(key)) matched++;
  }
  assert.ok(matched/drawn.length*3 > .98, `registered/drawn corner agreement: ${matched/(drawn.length/3)}`);
  const tunnel = tops.filter(t => t.replacesTerrain);
  assert.ok(tunnel.length > 100);
  for (const t of tunnel) {
    assert.equal(t.layered, true);
    const floor = t.poly.map(p => value(t, p.x, p.z)), low = Math.min(...floor);
    // A reference band must include the complete floor and the floorAt API's 2.5 m admission
    // band, yet end below the lowest local roof. A global 5.2 m replacement band captures Bush.
    assert.ok(t.minReferenceY === undefined || Number.isFinite(t.minReferenceY) && t.minReferenceY <= low,
      'optional minimum reference admits every floor corner');
    assert.ok(Number.isFinite(t.maxReferenceY) && t.maxReferenceY > Math.max(...floor) + 2.5,
      'replacement admits the whole local lower support band');
    assert.ok(t.maxReferenceY <= low + 5.2 - .09, 'open spans still have a finite bounded replacement reference');
    const centre = t.poly.reduce((p, q) => ({ x: p.x + q.x / t.poly.length, z: p.z + q.z / t.poly.length }), { x: 0, z: 0 });
    for (const p of [...t.poly, centre]) {
      const roof = grade.roofAt(p.x, p.z, value(t, p.x, p.z) + 1);
      if (Number.isFinite(roof)) assert.ok(t.maxReferenceY <= roof - .06,
        `replacement boundary ${t.maxReferenceY} must stay beneath local roof ${roof} at ${p.x},${p.z}`);
    }
  }
  assert.ok(NYC.ride.solids.some(s => s.halfExtents.y < .13), 'thin tunnel floor slabs');
  assert.ok(NYC.ride.solids.some(s => s.halfExtents.y > 2), 'walls/columns, not only support facets');
  assert.ok(NYC.ride.solids.every(s => s.support === false), 'bodies never synthesize support lids');
});
