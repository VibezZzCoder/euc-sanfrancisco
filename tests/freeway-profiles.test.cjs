// CPU-only freeway elevation regression: actual production profile builder, committed graph/DEM.
// The bounded source extraction mirrors the private site observer; no production test hooks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = join(__dirname, '..');
const read = path => readFileSync(join(root, path), 'utf8');

function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `production boundary: ${start}`);
  return source.slice(a, b);
}

// Evaluate the real Bay Bridge height model without constructing its scene. All formulae/anchors come from
// production, not a test-side facsimile; the ramp test must include the mainline's physical bridge anchors.
function bayBridge(context) {
  const source = read('js/sf-bridges.js');
  const constants = section(source, 'const BB =', '\n');
  const frame = section(source, '  const frame =', '\n');
  const model = section(source, '  let bayDeck = null;', '    const depth =');
  const lookup = section(source, '  function bridgeDeckAt(', '\n  scene.add(group);');
  context.bridgeSource = `const GEO=window.NYC.GEO, B=GEO.bridges, W=window.NYC.Terrain.waterLevel;
    const createParts=()=>({}); ${constants}${frame}${model}
    bayDeck={F,t0:tShore,t1:tPortal,upper,lower,half:BB.width/2+2}; } ${lookup};return bridgeDeckAt;`;
  return vm.runInContext(`new Function('window',bridgeSource)(window)`, context);
}

function profiles({ graph, ground, bridge, full = false, unjoined = false, ref = process.env.SF_FREEWAY_GRADE_REF } = {}) {
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, { window: { NYC: {} } });
  for (const path of ['js/sf-geodata.js', 'js/terrain.js']) vm.runInContext(read(path), context);
  const N = context.window.NYC, bytes = readFileSync(join(root, 'data/terrain-core.bin'));
  const size = bytes.readUInt32LE(4), header = JSON.parse(bytes.toString('utf8', 8, 8 + size));
  N.Terrain.load(header, new Uint16Array(bytes.buffer.slice(bytes.byteOffset + 8 + size, bytes.byteOffset + bytes.length)));
  if (graph) N.GEO.roadGraph = graph;
  if (ground) N.Terrain.groundAt = ground;
  let source = ref
    ? execFileSync('git', ['show', `${ref}:js/grade-separation.js`], { cwd: root, encoding: 'utf8' })
    : read('js/grade-separation.js');
  if (unjoined) {
    const guard = 'if (other && Math.abs(other.half - w.half) < 1e-9)';
    assert.ok(source.includes(guard), 'disable only shared endpoint mitres for the failing control');
    source = source.replace(guard, 'if (false && other && Math.abs(other.half - w.half) < 1e-9)');
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const constants = source.slice(source.indexOf('const STEP ='), source.indexOf('// options.structures:'));
  const start = source.indexOf('    const RG = window.NYC.GEO.roadGraph;', source.indexOf('function buildFreeways()'));
  const end = source.indexOf('    // Parapets border the union', start);
  assert.ok(start >= 0 && end > start, 'actual production profile boundaries');
  context.profile = source.slice(start, end);
  context.constants = constants;
  context.bridge = bridge || (graph ? () => null : bayBridge(context));
  const before = JSON.stringify(N.GEO.roadGraph);
  const ways = vm.runInContext(`new Function('window', 'bridgeDeckAt',
    'const ground=(x,z)=>window.NYC.Terrain.groundAt(x,z);' + constants + profile + ';return ways;')(window,bridge)`, context);
  if (!full) return { ways, N, before };
  // Full production consumer pass, including mesh batching, registered support/slabs and highway lane offsets.
  class Vector3 {
    constructor(x, y, z) { Object.assign(this, { x, y, z }); }
    distanceTo(p) { return Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z); }
  }
  class Color { constructor() { this.r = this.g = this.b = 0; } }
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
  const tops = [], boxes = [];
  vm.runInContext(read('js/sf-ride-geometry.js'), context);
  const registry = N.RideGeometry;
  Object.assign(N, {
    THREE: { Vector3, Color, Group, BufferAttribute, BufferGeometry, Mesh, MeshStandardNodeMaterial: Material, MeshBasicNodeMaterial: Material },
    createRoadSurfaceMaterial: () => new Material({}), createMarbleAshlarMaterial: () => new Material({}),
    bridgeDeckAt: context.bridge,
    RideGeometry: { addTriangles: (positions, indices, surface, metadata) => {
      tops.push({ positions, surface, metadata }); return registry.addTriangles(positions, indices, surface, metadata);
    }, addBox: (centre, halfExtents, rotationY, metadata) => {
      boxes.push({ centre, halfExtents, rotationY, metadata }); return registry.addBox(centre, halfExtents, rotationY, metadata);
    } }
  });
  context.console = { info() {} };
  vm.runInContext(source, context);
  const grade = N.buildGradeSeparation(new Group(), { edges: [] });
  return { ways, N, before, grade, tops, boxes, sourceHash };
}
const maxGrade = w => Math.max(...w.segments.map(s => Math.abs(s.q.y - s.p.y) / s.length));
let cached, fullCached;
const real = () => cached ||= profiles();
const realFull = () => fullCached ||= profiles({ full: true });
const EPS = 1e-8;

test('Clementina link 261 and connected I-80 ramp controls have no residual endpoint cliff', t => {
  const { ways, N } = real(), rg = N.GEO.roadGraph;
  const ids = [259, 260, 261, 262, 283, 284];
  const summary = ids.map(li => {
    const w = ways.find(w => w.li === li);
    return { li, name: rg.names[rg.links[li][2]], a: w.a, b: w.b, length: w.length,
      ends: [w.dense[0].y, w.dense.at(-1).y], target: [w.target[0], w.target.at(-1)], maxGrade: maxGrade(w),
      firstGrade: (w.dense[1].y - w.dense[0].y) / w.dense[1].s, modelGrade: w.grade };
  });
  t.diagnostic(JSON.stringify(summary));
  const suspect = ways.find(w => w.li === 261), parent = ways.find(w => w.li === 260);
  assert.equal(rg.names[rg.links[261][2]], 'I-80 W OFF RAMP');
  assert.equal(parent.b, suspect.a);
  assert.equal(parent.dense.at(-1).y, suspect.dense[0].y, 'correct the connected arm, not just the ramp vertex');
  for (const s of suspect.segments.filter(s => s.start < 100))
    assert.ok(Math.abs(s.q.y - s.p.y) <= .07 * s.length + EPS, 'whole first 100 m, not just one corrected vertex');
  assert.ok(suspect.dense[0].y < suspect.target[0] - 3, 'incompatible soft junction estimate moves by more than 3 m');
  for (const [li, bound] of [[259, .06], [260, .07], [262, .05]]) {
    const w = ways.find(w => w.li === li);
    assert.ok(maxGrade(w) <= bound + 1e-9, `link ${li}: ${(maxGrade(w) * 100).toFixed(3)}%`);
  }
  assert.ok(maxGrade(suspect) < .07);
  for (const li of [283, 284]) assert.ok(maxGrade(ways.find(w => w.li === li)) < .15, 'short physical lower-deck approach needs >5%, not an endpoint cliff');
  const east = ways.find(w => w.li === 283);
  const required = (east.dense.at(-1).y - east.dense[0].y) / east.length;
  assert.ok(required > .13, 'actual fixed lower-deck/street pair proves 5% is infeasible');
  assert.ok(maxGrade(east) < required + 1e-7, 'spread precisely the necessary rise, rather than leaving an endpoint residue');
});

test('all real freeway stations meet shared nodes, final grade/ground constraints and exact physical Bay Bridge anchors', t => {
  const { ways, N, before } = real(), rg = N.GEO.roadGraph, joins = new Map();
  const street = new Set(rg.links.filter(l => !(l[7] & 1)).flatMap(l => l.slice(0, 2)));
  let stations = 0, bridges = 0, overNominal = 0;
  for (const w of ways) {
    for (const [id, p] of [[w.a, w.dense[0]], [w.b, w.dense.at(-1)]]) {
      if (joins.has(id)) assert.equal(p.y, joins.get(id), `node ${id} must be shared, including after ground clearance`);
      joins.set(id, p.y);
      if (street.has(id) && !p.bridge) assert.ok(Math.abs(p.y - N.Terrain.groundAt(p.x, p.z) - .05) < EPS, `street node ${id}`);
    }
    for (const p of w.dense) {
      stations++;
      assert.ok(Number.isFinite(p.y) && p.y >= N.Terrain.groundAt(p.x, p.z) + .05 - EPS, `link ${w.li}: clearance`);
      if (p.bridge) { bridges++; assert.ok(Math.abs(p.y - w.deckAt(p).y) < EPS, 'real physical Bay Bridge deck is fixed'); }
    }
    for (const s of w.segments) {
      const groundRise = Math.abs(N.Terrain.groundAt(s.p.x, s.p.z) - N.Terrain.groundAt(s.q.x, s.q.z));
      const physicalBridgeRise = s.p.bridge && s.q.bridge ? Math.abs(w.deckAt(s.p).y - w.deckAt(s.q).y) : 0;
      assert.ok(Math.abs(s.q.y - s.p.y) <= Math.max(w.grade * s.length, groundRise, physicalBridgeRise) + EPS,
        `link ${w.li} at ${s.start}: final slope exceeds anchor-constrained model, terrain and physical bridge`);
      if (Math.abs(s.q.y - s.p.y) > .05 * s.length + EPS) overNominal++;
      if (!s.drawn) assert.ok(s.length <= 1e-6 ||
        Math.max(s.p.y - N.Terrain.groundAt(s.p.x, s.p.z), s.q.y - N.Terrain.groundAt(s.q.x, s.q.z)) < .061,
      'omitted near-ground profile cannot conceal the old 60 cm handoff');
    }
  }
  assert.equal(JSON.stringify(rg), before, 'no geographic graph/lane/layer mutation');
  assert.equal(ways.length, rg.decks.length);
  assert.ok(bridges > 100, 'real bridge profile controls actually exercised');
  t.diagnostic(JSON.stringify({ ways: ways.length, stations, sharedNodes: joins.size, bridges, overNominal,
    modelGrades: [...new Set(ways.map(w => +w.grade.toFixed(7)))] }));
});

function chainGraph() {
  return { nodes: [-400, 0, 0, 0, 80, 0, 120, 0, 140, 0, -400, 50, 0, 50], names: ['main', 'ramp', 'street', 'control'],
    links: [[0, 1, 0, 0, 3, 1, [], 1], [1, 2, 1, 0, 1, 1, [], 5], [2, 3, 1, 0, 1, 1, [], 5],
      [3, 4, 2, 0, 1, 1, [], 0], [5, 6, 3, 0, 2, 1, [], 1]],
    decks: [[0, [2, 2]], [1, [2, 1]], [2, [1, 0]], [4, [3, 3]]] };
}

test('infeasible short two-link ramp adjusts its shared mainline; disconnected stacked control remains unchanged', () => {
  const { ways } = profiles({ graph: chainGraph(), ground: () => 0 });
  const [main, rampA, rampB, control] = ways;
  assert.equal(main.dense.at(-1).y, rampA.dense[0].y);
  assert.equal(rampA.dense.at(-1).y, rampB.dense[0].y);
  assert.ok(main.dense.at(-1).y <= 6.05 + EPS, '120 m descent cannot keep the old 15 m anchor');
  assert.ok(Math.abs(rampB.dense.at(-1).y - .05) < EPS, 'street arrival stays on terrain');
  for (const w of ways) assert.ok(maxGrade(w) <= .05 + EPS);
  assert.ok(control.dense.every(p => Math.abs(p.y - 22) < EPS), 'unconnected parallel layer-3 control keeps its 22 m deck');
});

test('short ramp still meets fixed physical bridge samples without altering deck height or direction', () => {
  const graph = chainGraph();
  const bridge = (x, z) => z === 0 && x <= -300 ? { y: 12 + (x + 400) * .01, onBridge: true } : null;
  const { ways } = profiles({ graph, ground: () => 0, bridge });
  const [main, ramp] = ways;
  assert.equal(main.dense.at(-1).y, ramp.dense[0].y);
  for (const w of ways) for (const p of w.dense) if (p.bridge) assert.equal(p.y, bridge(p.x, p.z).y);
  for (const w of ways) assert.ok(maxGrade(w) <= .05 + EPS);
});

test('unavoidable street hill is preserved; a steep DEM sample below an unanchored viaduct does not relax its grade', () => {
  const graph = chainGraph();
  const ground = (x, z) => z === 0 ? Math.max(0, 2 - Math.abs(x - 110) * .2) : Math.max(0, 4 - Math.abs(x + 200));
  const { ways, N } = profiles({ graph, ground });
  const ramp = ways[2], control = ways.at(-1);
  assert.ok(maxGrade(ramp) > .05, 'real 20% ground approach cannot satisfy the estimated 5%');
  for (const p of ramp.dense) assert.ok(p.y >= ground(p.x, p.z) + .05 - EPS);
  assert.equal(N.Terrain.groundAt(110, 0), 2, 'do not lower the hill');
  assert.ok(maxGrade(control) <= .05 + EPS, 'no hard anchors: keep 5% despite a 100% terrain sample below');
});

test('many alternative anchor paths use the bounded component fallback without leaving an endpoint residual', () => {
  const graph = { nodes: [0, 0, 100, 0, 200, 0, -4, 0], names: ['bridge', 'ramp', 'street'],
    links: [[3, 0, 0, 0, 1, 1, [], 1]], decks: [[0, [1, 1]]] };
  for (let i = 0; i < 40; i++) {
    graph.links.push([0, 1, 1, 0, 1, 1, [50, i * .1], 5]); graph.decks.push([i + 1, [1, 0, 0]]);
  }
  graph.links.push([1, 2, 2, 0, 1, 1, [], 0]);
  const { ways } = profiles({ graph, ground: () => 0, bridge: () => ({ y: 12, onBridge: true }) });
  for (const w of ways.slice(1)) {
    assert.ok(Math.abs(w.dense[0].y - 12) < EPS);
    assert.ok(Math.abs(w.dense.at(-1).y - .05) < EPS);
    assert.ok(maxGrade(w) <= .119501, '12 m bridge / 5 cm street across the shortest 100 m run, no final cliff');
  }
});

// Independent barycentric interpolation of the actual output triangles, not the dense profile under test.
function triangleY(positions, x, z, reference = Infinity) {
  let top = -Infinity;
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], az = positions[i + 2], bx = positions[i + 3], bz = positions[i + 5], cx = positions[i + 6], cz = positions[i + 8];
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-10) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, w = 1 - u - v;
    const y = u * positions[i + 1] + v * positions[i + 4] + w * positions[i + 7];
    if (Math.min(u, v, w) >= -1e-7 && y <= reference + .01) top = Math.max(top, y);
  }
  return top;
}

test('full builder shares revised freeway facets with drawing, support, slab bodies and highway lane Y', () => {
  const world = profiles({ graph: chainGraph(), ground: () => 0, full: true });
  const { grade, tops, boxes, ways } = world;
  const drawn = grade.group.children.find(m => m.name === 'SFGradeSeparation_road').geometry.attributes.position.array;
  const registered = tops.filter(t => t.metadata.source === 'grade:freeway').flatMap(t => t.positions);
  assert.deepEqual(Array.from(drawn), Array.from(new Float32Array(registered)), 'every rendered floor corner is registered');
  assert.equal(grade.highwayLanes.length, 5, 'three mainline / two control lanes; no added ramp traffic');
  assert.deepEqual(Array.from(grade.highwayLanes, l => l.speed), [24, 25.5, 27, 24, 25.5]);
  for (const lane of grade.highwayLanes) for (const p of lane.pts) {
    const y = triangleY(registered, p.x, p.z);
    assert.ok(Number.isFinite(y) && Math.abs(p.y - y - .02) < EPS, 'highway wheel path follows actual shared pavement');
  }
  // Ramp facets continue until the true 5 cm landing, not the former 60 cm omission.
  const exit = ways[2], penultimate = exit.segments.at(-1);
  assert.ok(penultimate.drawn);
  const mid = { x: (penultimate.p.x + penultimate.q.x) / 2, z: 0, y: (penultimate.p.y + penultimate.q.y) / 2 };
  assert.ok(Math.abs(triangleY(registered, mid.x, mid.z) - mid.y) < EPS);
  assert.ok(boxes.some(b => b.metadata.source === 'grade:slab' && Math.abs(b.centre.x - mid.x) < 2), 'final landing has registered slab bodies');
  assert.ok(boxes.every(b => b.metadata.support === false), 'bodies do not invent support lids');
});

test('real Clementina first/last ramp stations and both lateral tracks have matching final drawn/registered support', async () => {
  const { ways, grade, tops, sampler } = await nativeFreeways(), w = ways.find(w => w.li === 261);
  const registered = tops.filter(t => t.metadata.source === 'grade:freeway').flatMap(t => t.positions);
  const drawn = grade.group.children.find(m => m.name === 'SFGradeSeparation_road').geometry.attributes.position.array;
  assert.deepEqual(Array.from(drawn), Array.from(new Float32Array(registered)), 'all real freeway support facets match drawing');
  const segments = [w.segments[0], w.segments[1], w.segments[20], w.segments.at(-2), w.segments.at(-1)];
  for (const s of segments) {
    assert.ok(s.drawn, 'profile remains drawn and supported through the landing');
    const dx = (s.q.x - s.p.x) / s.length, dz = (s.q.z - s.p.z) / s.length;
    for (const offset of [-1.5, 0, 1.5]) for (const u of [.25, .75]) {
      const x = s.p.x + (s.q.x - s.p.x) * u - dz * offset;
      const z = s.p.z + (s.q.z - s.p.z) * u + dx * offset, y = s.p.y + (s.q.y - s.p.y) * u;
      // Mitred station corners can introduce a small crossfall. Test actual shared facets, not the old
      // perpendicular-strip assumption that every lateral point has the centreline's interpolated height.
      const native = sampler.sampleGround(x,z,{normal:{}},y+.1).height;
      assert.ok(Math.abs(native-y)<.06, 'bounded miter crossfall, not a layer change');
      assert.ok(Math.abs(triangleY(registered,x,z,y+.1)-native)<EPS, 'native support agrees with registered facet output');
      assert.ok(Math.abs(triangleY(drawn,x,z,y+.1)-native)<2e-4, 'Float32 drawing independently agrees');
    }
  }
});

function laneFootprints(world, accept = () => true) {
  const { grade, tops, N } = world, cells = new Map(), size = 16;
  for (const top of tops) if (top.metadata.source === 'grade:freeway') {
    const p = top.positions;
    for (let i = 0; i < p.length; i += 9) {
      const xs = [p[i], p[i + 3], p[i + 6]], zs = [p[i + 2], p[i + 5], p[i + 8]];
      for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++)
        for (let z = Math.floor(Math.min(...zs) / size); z <= Math.floor(Math.max(...zs) / size); z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(...p.slice(i, i + 9));
        }
    }
  }
  let checked = 0, maxError = 0;
  const failures = [];
  for (const [laneIndex, lane] of grade.highwayLanes.entries()) for (const p of lane.pts) {
    if (!accept(p)) continue;
    const deck = triangleY(cells.get(`${Math.floor(p.x / size)},${Math.floor(p.z / size)}`) || [], p.x, p.z, p.y + .1);
    const effectiveFloor = Math.max(deck, N.Terrain.groundAt(p.x, p.z));
    const error = Math.abs(p.y - effectiveFloor - .02);
    maxError = Math.max(maxError, error); checked++;
    if (error > .1) {
      failures.push({ laneIndex, x: p.x, y: p.y, z: p.z, effectiveFloor, error });
      failures.sort((a,b) => b.error - a.error); failures.length = Math.min(failures.length, 8);
    }
  }
  return { checked, maxError, failures };
}

test('nearby I-80 highway wheel paths agree with final support/terrain after the connected ramp repair', t => {
  const report = laneFootprints(realFull(), p => p.x >= 400 && p.x <= 1000 && p.z >= 0 && p.z <= 800);
  t.diagnostic(JSON.stringify(report));
  assert.ok(report.checked > 50, 'exercise actual nearby mainline traffic, not ramps without traffic');
  assert.equal(report.failures.length, 0, '10 cm tolerance includes curved offset reprojection, not mismatched layers');
});

let nativeCached;
async function nativeFreeways() {
  if (nativeCached) return nativeCached;
  const { SfTerrainSampler } = await import('../js/sf-terrain-sampler.js');
  const world = realFull();
  return nativeCached = { ...world, sampler: new SfTerrainSampler({ terrain: world.N.Terrain, ride: world.N.ride, waterAt: () => false }) };
}

function clementinaPath(world, offset = 0) {
  const a = world.ways.find(w => w.li === 260), b = world.ways.find(w => w.li === 261), p = b.dense[0];
  const tangent = s => ({ x: (s.q.x - s.p.x) / s.length, z: (s.q.z - s.p.z) / s.length });
  const incoming = tangent(a.segments.at(-1)), outgoing = tangent(b.segments[0]);
  const normal = t => ({ x: -t.z, z: t.x }), ni = normal(incoming), no = normal(outgoing);
  const dot = incoming.x * outgoing.x + incoming.z * outgoing.z;
  const joint = { x: (ni.x + no.x) / (1 + dot), z: (ni.z + no.z) / (1 + dot) };
  const at = (along, t, n) => ({ x: p.x + along * t.x + offset * n.x,
    y: p.y - along * b.grade, z: p.z + along * t.z + offset * n.z });
  // Offset sign is the downstream normal (-dz,dx), independent of the direction ridden.
  return [at(7,outgoing,no), at(2,outgoing,no), at(0,outgoing,joint),
    at(-2,incoming,ni), at(-8,incoming,ni), at(-16,incoming,ni)];
}

test('reported straight-input crashes meet the exposed link260 parapet, not an internal transverse rail', async t => {
  const world = await nativeFreeways(), { sampler, ways, grade, boxes } = world;
  const T = await import('../vendor/three/build/three.webgpu.js');
  const a = ways.find(w => w.li === 260), b = ways.find(w => w.li === 261), summary = [];
  const dx = (b.dense[1].x-b.dense[0].x)/b.dense[1].s, dz = (b.dense[1].z-b.dense[0].z)/b.dense[1].s;
  const concrete = grade.group.children.find(m => m.name === 'SFGradeSeparation_concrete').geometry.attributes.position.array;
  const crash = [{x:540.9437777,z:169.3177728,y:21.84568},{x:542.02475,z:166.55947,y:21.64158},{x:539.83310,z:172.10547,y:22.05242}];
  for (const p of crash) {
    const s=a.segments.at(-1), tx=(s.q.x-s.p.x)/s.length, tz=(s.q.z-s.p.z)/s.length;
    const lateral=(p.x-s.p.x)*-tz+(p.z-s.p.z)*tx;
    assert.ok(Math.abs(lateral)>2.1 && Math.abs(lateral)<2.2, 'rider already near the 2.8 m deck edge');
    const origin={x:p.x+dx*.5,y:p.y+.6,z:p.z+dz*.5}, direction={x:-dx,y:0,z:-dz};
    const out={normal:{},inside:false}, hit=sampler.raycastObstacle(origin,direction,3,0,undefined,out);
    const body=boxes[out.colliderIndex];
    assert.ok(hit!==null && body && Math.abs(body.halfExtents.x-.15)<EPS && Math.abs(body.halfExtents.y-.5)<EPS);
    const ray=new T.Ray(new T.Vector3(origin.x,origin.y,origin.z),new T.Vector3(-dx,0,-dz));
    const v=[new T.Vector3(),new T.Vector3(),new T.Vector3()], point=new T.Vector3(); let drawn=Infinity;
    for(let i=0;i<concrete.length;i+=9) {
      for(let j=0;j<3;j++)v[j].fromArray(concrete,i+j*3);
      if(ray.intersectTriangle(...v,false,point))drawn=Math.min(drawn,point.distanceTo(ray.origin));
    }
    assert.ok(Math.abs(hit-drawn)<2e-4, 'native obstacle is the same visible longitudinal parapet');
    summary.push({point:p,lateral,native:hit,drawn,normal:out.normal});
  }
  t.diagnostic(JSON.stringify({source:world.sourceHash,parentTail:a.pts.slice(-3),summary}));
});

test('shared mitre closes the proven outside-corner gap; all three offset tracks retain native support and clear rays', async t => {
  const world=await nativeFreeways(), { sampler }=world;
  const { SfTerrainSampler }=await import('../js/sf-terrain-sampler.js');
  const old=profiles({full:true,unjoined:true});
  const oldSampler=new SfTerrainSampler({terrain:old.N.Terrain,ride:old.N.ride,waterAt:()=>false});
  const outside=clementinaPath(world,-1.2)[2];
  const before=oldSampler.sampleGround(outside.x,outside.z,{normal:{}},outside.y+.1).height;
  assert.ok(outside.y-before>5, 'disabled join actually selects terrain far beneath the missing deck corner');
  let samples=0;
  for(const offset of [-1.2,0,1.2]) {
    const path=clementinaPath(world,offset);
    for(let j=1;j<path.length;j++) {
      const a=path[j-1],b=path[j],length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.ceil(length/.05);
      for(let i=0;i<=n;i++) {
        const u=i/n, x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u,ref=a.y+(b.y-a.y)*u;
        const g=sampler.sampleGround(x,z,{normal:{}},ref+.1);
        assert.ok(g.registered && Math.abs(g.height-ref)<.06, 'no sparse terrain fallback through the junction');
        for(const sign of [-1,1]) {
          const hit=sampler.raycastObstacle({x,y:g.height+.6,z},{x:sign*(b.x-a.x)/length,y:0,z:sign*(b.z-a.z)/length},.1,.25);
          assert.equal(hit,null,'no internal rail/body intersects the steered 50 cm-wide track');
        }
        samples++;
      }
    }
    t.diagnostic(JSON.stringify({offset,path}));
  }
  t.diagnostic(JSON.stringify({source:world.sourceHash,missingCorner:outside,unjoinedGround:before,samples}));
});

test('stock native controller steers continuously across the repaired 260/261 join in both directions at three offsets', async t => {
  const world=await nativeFreeways(), { sampler }=world;
  const { EucController }=await import('../js/euc/simulation/EucController.js');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), results=[];
  for(const offset of [-1.2,0,1.2])for(const reverse of [false,true]) {
    const path=clementinaPath(world,offset); if(reverse)path.reverse();
    const controller=new EucController(sampler,{spawn:{position:path[0],headingY:Math.atan2(path[1].x-path[0].x,path[1].z-path[0].z)}});
    let state=controller.snapshot(), reached=false, minY=Infinity, maxDeparture=0;
    for(let step=0;step<2400;step++) {
      let best=null;
      for(let j=1;j<path.length;j++) {
        const a=path[j-1],b=path[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        const u=clamp(((state.position.x-a.x)*dx+(state.position.z-a.z)*dz)/(len*len),0,1);
        const x=a.x+dx*u,z=a.z+dz*u,distance=Math.hypot(x-state.position.x,z-state.position.z);
        if(!best||distance<best.distance)best={j,u,len,x,z,distance};
      }
      maxDeparture=Math.max(maxDeparture,best.distance);
      const end=path.at(-1);
      if(Math.hypot(state.position.x-end.x,state.position.z-end.z)<.6){reached=true;break;}
      let j=best.j, remaining=2-(1-best.u)*best.len, target;
      if(remaining<=0){const u=best.u+2/best.len;target={x:path[j-1].x+(path[j].x-path[j-1].x)*u,z:path[j-1].z+(path[j].z-path[j-1].z)*u};}
      else {while(j+1<path.length){const length=Math.hypot(path[j+1].x-path[j].x,path[j+1].z-path[j].z);if(remaining<=length){const u=remaining/length;target={x:path[j].x+(path[j+1].x-path[j].x)*u,z:path[j].z+(path[j+1].z-path[j].z)*u};break;}remaining-=length;j++;}target||=end;}
      const desired=Math.atan2(target.x-state.position.x,target.z-state.position.z);
      const error=Math.atan2(Math.sin(desired-state.headingY),Math.cos(desired-state.headingY));
      controller.step(1/120,{throttle:clamp((2.5-state.speed)*.3,-.3,.3),steer:clamp(-error*1.8,-1,1),crouch:false,hop:false,hopHeld:false,swing:false,reset:false});
      state=controller.snapshot(); minY=Math.min(minY,state.position.y);
      if(state.crashed)break;
    }
    const result={offset,reverse,reached,position:state.position,crashed:state.crashed,crashCause:state.crashCause,minY,maxDeparture};
    results.push(result);
    assert.ok(reached&&!state.crashed&&minY>20&&maxDeparture<.6,JSON.stringify(result));
  }
  t.diagnostic(JSON.stringify({source:world.sourceHash,results}));
});

// Broader consumer diagnostic retained separately: both unchanged HEAD and the candidate expose inherited
// off-deck lane points near x=-1800..-1500,z=2000..2100. This is not a passing ramp-acceptance check.
test('opt-in whole-network lane-footprint survey (not ramp acceptance)',
  { skip: !process.env.SF_FREEWAY_LANE_SURVEY && 'SF_FREEWAY_LANE_SURVEY=1; known baseline/candidate off-deck findings' }, t => {
    const report = laneFootprints(realFull());
    t.diagnostic(JSON.stringify(report));
    assert.equal(report.failures.length, 0, '10 cm station tolerance includes curved reprojection, not mismatched layers');
  });

function highwayPopulation(world) {
  // Evaluate only the real, deterministic highway spawn loop. No cars/rendering actors are mocked into the game.
  const source = read('js/traffic.js');
  const constant = section(source, 'const HWY_BOX_RUN =', '\n');
  const spawn = section(source, 'function createHighwayTraffic(scene, lanes)', '  // Per body type:');
  const run = new Function('THREE', `${constant}\n${spawn}return { total:cars.length, counts, perLane:lanes.map(l=>l.cars.length) }; } return createHighwayTraffic;`)(world.N.THREE);
  return JSON.parse(JSON.stringify(run({ add() {} }, world.grade.highwayLanes)));
}

test('baseline comparison preserves all highway lane XZ/speeds and deterministic initial actor counts',
  { skip: !process.env.SF_FREEWAY_COMPARE_REF && 'opt-in frozen-grade replay: SF_FREEWAY_COMPARE_REF=<ref>' }, t => {
    const current = realFull(), baseline = profiles({ full: true, ref: process.env.SF_FREEWAY_COMPARE_REF });
    const topology = world => JSON.stringify(world.grade.highwayLanes.map(l => ({ speed: l.speed, xz: l.pts.map(p => [p.x, p.z]) })));
    assert.equal(topology(current), topology(baseline), 'all lane geometry/directions/speeds are preserved');
    const before = highwayPopulation(baseline), after = highwayPopulation(current);
    t.diagnostic(JSON.stringify({ before, after }));
    assert.deepEqual(after, before, 'same actual spawn loop, no population reduction');
  });
