import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSfPursuitGraph, createSfFlightBrain } from '../js/sf-nemesis-brain.js';
import { createSfFlightQueries } from '../js/sf-nemesis-flight.js';
import { SfTerrainSampler } from '../js/sf-terrain-sampler.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

function tunnel() {
  const square = [{ x: -100, z: -20 }, { x: 100, z: -20 }, { x: 100, z: 20 }, { x: -100, z: 20 }];
  const terrain = { originX: -128, originZ: -128, cell: 4, w: 65, h: 65,
    heights: new Float64Array(65 * 65).fill(16), waterLevel: 0 };
  return createSfFlightQueries(new SfTerrainSampler({ terrain, waterAt: () => false,
    tops: [{ poly: square, top: 8, surface: 'pavement', replacesTerrain: true,
      ceilingOffset: 5.2, maxReferenceY: 13.2 }] }));
}

test('flight follows a visible rider but never reads hidden live coordinates', () => {
  const q = tunnel(), brain = createSfFlightBrain(q);
  assert.equal(brain.place({ x: 0, y: 9, z: 0 }), true);
  const seen = { x: 30, y: 8, z: 0, heading: Math.PI / 2 };
  for (let i = 0; i < 40; i++) brain.update(0.05, seen, true);
  assert.ok(brain.state.x > 0.5);
  const known = brain.lastSeen();
  const hidden = new Proxy({}, { get() { throw new Error('read hidden rider'); } });
  for (let i = 0; i < 60; i++) brain.update(0.05, hidden, false);
  assert.deepEqual(brain.lastSeen(), known);
  assert.equal(brain.state.mode, 'search');
});

test('actual SF tunnel ceiling blocks every candidate sweep, including vertical moves', () => {
  const q = tunnel(), brain = createSfFlightBrain(q);
  assert.equal(brain.place({ x: 0, y: 9, z: 0 }), true);
  const rider = { x: 60, y: 8, z: 0, heading: Math.PI / 2 };
  for (let i = 0; i < 160; i++) {
    const before = { ...brain.state };
    brain.update(0.05, rider, true);
    assert.equal(q.clearFlight(before, brain.state), true, `unclear movement at frame ${i}`);
    assert.ok(brain.state.y + 2.1 <= 13.2 + 1e-6, `crossed roof at frame ${i}`);
  }
  assert.ok(brain.state.x > 10, 'continues along the lower tunnel despite the blocked climb');
});

test('refused placement leaves the previous pose and remembered sighting untouched', () => {
  const q = tunnel(), brain = createSfFlightBrain(q);
  assert.equal(brain.place({ x: 0, y: 9, z: 0 }), true);
  brain.update(0.05, { x: 10, y: 8, z: 0, heading: 0 }, true);
  const before = { ...brain.state }, known = brain.lastSeen();
  assert.equal(brain.place({ x: 0, y: 12, z: 0 }), false);
  assert.equal(brain.place({ x: NaN, y: 9, z: 0 }), false);
  assert.deepEqual(brain.state, before);
  assert.deepEqual(brain.lastSeen(), known);
});

test('blocked wall is never crossed, while the detour moves along its open side', () => {
  const clearFlight = (a, b) => !(b.x >= 2 && Math.abs(b.z) < 5);
  const brain = createSfFlightBrain({ clearFlight, supportAt: () => ({ height: 0 }) });
  assert.equal(brain.place({ x: 0, y: 1, z: 0 }), true);
  const rider = { x: 20, y: 0, z: 0, heading: 0 };
  for (let i = 0; i < 100; i++) {
    brain.update(0.05, rider, true);
    assert.ok(clearFlight(null, brain.state));
  }
  assert.ok(Math.abs(brain.state.z) > 1, 'side-step makes progress along the wall');
});

test('follows rising sampled terrain without flattening the hill', () => {
  const w = 65, h = 65, cell = 2, originX = -64, originZ = -64;
  const heights = new Float64Array(w * h);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) heights[z * w + x] = 20 + (originX + x * cell) * 0.4;
  const sampler = new SfTerrainSampler({ terrain: { originX, originZ, w, h, cell, heights, waterLevel: -100 }, waterAt: () => false });
  const q = createSfFlightQueries(sampler), brain = createSfFlightBrain(q);
  assert.equal(brain.place({ x: 0, y: 21, z: 0 }), true);
  for (let i = 0; i < 180; i++) brain.update(0.05, { x: 30, y: 32, z: 0, heading: Math.PI / 2 }, true);
  assert.ok(brain.state.x > 10, `uphill progress ${brain.state.x}`);
  assert.ok(brain.state.y > 25, `climbed height ${brain.state.y}`);
  assert.ok(q.supportAt(20, 0, 30).height > q.supportAt(0, 0, 21).height + 7);
});

function road(a, b, y0 = 0, y1 = y0) {
  const len = Math.hypot(b.x-a.x, b.z-a.z);
  return { from: a, to: b, sx: a.x, sz: a.z, dx: (b.x-a.x)/len, dz: (b.z-a.z)/len, len, y0, y1 };
}
const network = edges => ({ edges, edgeY: (e, s) => e.y0+(e.y1-e.y0)*s/e.len });

test('profiled graph follows hills, is undirected, and does not join stacked junctions', () => {
  const a = { x: 0, z: 0 }, b = { x: 16, z: 0 }, c = { x: 32, z: 0 };
  const edges = [road(a, b, 0, 8), road(b, c, 18, 20)];
  const before = JSON.stringify(edges);
  const graph = buildSfPursuitGraph(network(edges));
  assert.deepEqual(graph.points.map(p => p.y), [0, 4, 8, 18, 19, 20]);
  assert.ok(graph.adjacency[1].some(e => e.to === 0));
  assert.ok(!graph.adjacency[2].some(e => e.to === 3));
  assert.equal(JSON.stringify(edges), before);
  const joined = buildSfPursuitGraph(network([road(a, b), road(b, c)]));
  assert.ok(joined.adjacency[2].some(e => e.to === 3 && e.cost === 0), 'coincident junctions remain connected');
});

test('flight graph consumes the actual SF road network and its height profiles without mutation', () => {
  const require = createRequire(import.meta.url);
  const { BOX } = require('./helpers/geo-box.cjs');
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  context.window = { NYC: { DEBUG_ROADS: false } };
  for (const file of ['sf-geodata.js', 'city-config.js', 'terrain.js', 'road-network.js']) {
    vm.runInContext(readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8'), context);
  }
  const city = context.window.NYC;
  const buf = readFileSync(new URL(`../data/terrain-${BOX}.bin`, import.meta.url));
  const size = buf.readUInt32LE(4), header = JSON.parse(buf.subarray(8, 8+size));
  city.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset+8+size, buf.byteOffset+buf.length), 0, header.w*header.h));
  const sidewalks = city.BLOCKS.map(b => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b }));
  const net = city.buildRoadNetwork(sidewalks, []), first = net.edges[0];
  const snapshot = { edges: net.edges.length, moves: first.moves.length, profile: Array.from(first.prof) };
  const graph = buildSfPursuitGraph(net);
  assert.ok(graph.points.length > net.edges.length);
  assert.ok(Math.abs(graph.points[0].y-net.edgeY(first, 0)) < 1e-9);
  assert.ok(graph.adjacency[0].length);
  assert.deepEqual({ edges: net.edges.length, moves: first.moves.length, profile: Array.from(first.prof) }, snapshot);
});

test('graph route takes a checked street around a building', () => {
  const a = { x: 0, z: 0 }, b = { x: 0, z: 12 }, c = { x: 24, z: 12 }, d = { x: 24, z: 0 };
  const graph = buildSfPursuitGraph(network([road(a,b), road(b,c), road(c,d)]));
  const clearFlight = (p, q) => {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x-p.x, q.z-p.z)*4));
    for (let i = 0; i <= n; i++) {
      const x = p.x+(q.x-p.x)*i/n, z = p.z+(q.z-p.z)*i/n;
      if (x > 6 && x < 18 && Math.abs(z) < 6) return false;
    }
    return true;
  };
  const brain = createSfFlightBrain({ graph, clearFlight, supportAt: () => ({ height: 0 }) }, { routeRange: 10 });
  assert.equal(brain.place({ x: 0, y: 1.1, z: 0 }), true);
  let usedPath = false;
  for (let i = 0; i < 1200; i++) {
    const before = { ...brain.state };
    brain.update(0.05, { x: 24, y: 0, z: 0, heading: 0 }, true);
    assert.ok(clearFlight(before, brain.state));
    usedPath ||= brain.state.mode === 'path';
    if (Math.hypot(brain.state.x-24, brain.state.z) < 5) break;
  }
  assert.ok(usedPath);
  assert.ok(Math.hypot(brain.state.x-24, brain.state.z) < 5, JSON.stringify(brain.state));
});

test('periodic replanning keeps forward progress on a 400 m road in both directions and grades', () => {
  for (const grade of [0, 0.2, -0.2]) for (const direction of [1, -1]) {
    const a = { x: 0, z: 0 }, b = { x: 400, z: 0 };
    const graph = buildSfPursuitGraph(network([road(a, b, 20, 20+400*grade)]));
    const brain = createSfFlightBrain({ graph, clearFlight: () => true, supportAt: x => ({ height: 20+x*grade }) });
    const start = direction > 0 ? 0 : 400, end = 400-start;
    assert.ok(brain.place({ x: start, y: 21.1+start*grade, z: 0 }));
    let last = start;
    for (let period = 0; period < 4; period++) {
      for (let i = 0; i < 40; i++) brain.update(0.05, { x: end, y: 20+end*grade, z: 0, heading: 0 }, true);
      const progress = (brain.state.x-last)*direction;
      assert.ok(progress > 5, `grade ${grade}, direction ${direction}, period ${period}, progress ${progress}`);
      last = brain.state.x;
    }
  }
});

test('a blocked stop-line chord is rejected while A* finds a clear alternate junction path', () => {
  const start = { x: 0, z: 0 }, junction = { x: 40, z: 0 }, end = { x: 82, z: 0 }, corner = { x: 70, z: 12 };
  const first = road(start, { x: 12, z: 0 }); first.to = junction;
  const last = road({ x: 70, z: 0 }, end); last.from = junction;
  const around = road({ x: 12, z: 12 }, corner); around.from = junction;
  const down = road(corner, { x: 70, z: 0 }); down.to = junction;
  const graph = buildSfPursuitGraph(network([first, last, around, down]));
  let refused = 0;
  const clearFlight = (a, b) => {
    for (let i = 0; i <= 20; i++) {
      const x = a.x+(b.x-a.x)*i/20, z = a.z+(b.z-a.z)*i/20;
      if (x > 35 && x < 47 && z < 6) { refused++; return false; }
    }
    return true;
  };
  const brain = createSfFlightBrain({ graph, clearFlight, supportAt: () => ({ height: 0 }) }, { routeRange: 5, routeAttach: 3 });
  assert.ok(brain.place({ x: 0, y: 1.1, z: 0 }));
  brain.update(0.05, { x: 82, y: 0, z: 0, heading: 0 }, true);
  assert.ok(refused > 0, 'A* rejected the direct chord during the initial plan');
  assert.equal(brain.state.mode, 'path', 'an alternative route was found in the same plan');
  let maxZ = 0, usedPath = false;
  for (let i = 0; i < 1800; i++) {
    const before = { ...brain.state };
    brain.update(0.05, { x: 82, y: 0, z: 0, heading: 0 }, true);
    assert.ok(clearFlight(before, brain.state));
    maxZ = Math.max(maxZ, brain.state.z); usedPath ||= brain.state.mode === 'path';
    if (brain.state.x > 78 && Math.abs(brain.state.z) < 4) break;
  }
  assert.ok(refused > 0, 'blocked chord was actually probed');
  assert.ok(usedPath && maxZ > 6 && brain.state.x > 78, JSON.stringify(brain.state));
  const withoutAlternate = buildSfPursuitGraph(network([first, last]));
  const stranded = createSfFlightBrain({ graph: withoutAlternate, clearFlight, supportAt: () => ({ height: 0 }) },
    { routeRange: 5, routeAttach: 3 });
  assert.ok(stranded.place({ x: 0, y: 1.1, z: 0 }));
  stranded.update(0.05, { x: 82, y: 0, z: 0, heading: 0 }, true);
  assert.notEqual(stranded.state.mode, 'path', 'a blocked sole link is not accepted as a route');
});

test('graph spatial lookup is bounded, ordered, layer-filtered and suitable for spawn candidates', () => {
  const a = { x: 0, z: 0 }, b = { x: 400, z: 0 };
  const graph = buildSfPursuitGraph(network([road(a, b, 0, 0), road(a, b, 20, 20)]));
  const ids = graph.nearby(16, 0, 12, 3, { referenceY: 20, maxHeight: 1 });
  assert.equal(ids.length, 3);
  assert.ok(ids.every(id => graph.points[id].y === 20));
  assert.deepEqual(ids.map(id => graph.points[id].x), [16, 8, 24]);
  assert.deepEqual(graph.nearby(16, 0, 16, 3, { minDistance: 12, referenceY: 20, maxHeight: 1 })
    .map(id => graph.points[id].x), [0, 32]);
  assert.deepEqual(graph.nearby(0, 0, 1025, 10), []);
  assert.deepEqual(graph.nearby(0, 0, 10, 257), []);
  const brain = createSfFlightBrain({ graph, clearFlight: () => true, supportAt: () => ({ height: 20 }) });
  const candidates = ids.map(id => ({ ...graph.points[id], y: graph.points[id].y+1.1 }));
  assert.equal(brain.selectSpawn(candidates).x, 16);
});

test('repeated plans on a 51,000-point graph do not scan all graph points', () => {
  const edges = [];
  for (let i = 0; i < 1000; i++) edges.push(road({ x: 0, z: i*1000 }, { x: 400, z: i*1000 }));
  const graph = buildSfPursuitGraph(network(edges));
  assert.equal(graph.points.length, 51000);
  let reads = 0;
  graph.points = new Proxy(graph.points, { get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key, receiver);
  } });
  const brain = createSfFlightBrain({ graph, clearFlight: () => true, supportAt: () => ({ height: 0 }) });
  assert.ok(brain.place({ x: 0, y: 1.1, z: 0 }));
  for (let i = 0; i < 200; i++) brain.update(0.05, { x: 400, y: 0, z: 0, heading: 0 }, true);
  assert.ok(brain.state.x > 30);
  assert.ok(reads < 10000, `indexed planning read ${reads} points in five plans`);
});

test('spawn selection validates exact candidates, isolates callbacks, and place revalidates', () => {
  let blocked = false;
  const brain = createSfFlightBrain({ supportAt: x => ({ height: 0, water: x === 1 }),
    clearFlight: a => !blocked && a.x !== 2 });
  const selected = brain.selectSpawn([{ x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
    { x: 3, y: 1, z: 0 }, { x: 4, y: 1, z: 0, heading: 1 }], {
    visible: p => p.x === 3,
    accept: p => { p.x = 999; return true; },
  });
  assert.deepEqual(selected, { x: 4, y: 1, z: 0, heading: 1 });
  blocked = true;
  assert.equal(brain.place(selected, selected.heading), false);
  assert.equal(brain.selectSpawn([{ x: 4, y: 1, z: 0 }]), null);
});

test('swoop commitment never reads a hidden target and leave respects tunnel ceiling', () => {
  const q = tunnel(), brain = createSfFlightBrain(q);
  assert.ok(brain.place({ x: 0, y: 9, z: 0 }));
  const visible = { x: 8, y: 8, z: 0, vx: 1, vz: 0, heading: Math.PI / 2 };
  for (let i = 0; i < 10; i++) brain.swoop(0.05, visible, true, { lateral: 1, height: 1 });
  const known = brain.lastSeen(), hidden = new Proxy({}, { get() { throw new Error('hidden read'); } });
  for (let i = 0; i < 20; i++) brain.swoop(0.05, hidden, false, { commit: true });
  assert.deepEqual(brain.lastSeen(), known);
  for (let i = 0; i < 80; i++) {
    const before = { ...brain.state };
    brain.leave(0.05, { x: 20, y: 30, z: 0 });
    assert.ok(q.clearFlight(before, brain.state));
    assert.ok(brain.state.y + 2.1 <= 13.2 + 1e-6);
  }
  assert.equal(brain.state.mode, 'leave');
});
