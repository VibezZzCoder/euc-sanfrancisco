// CPU-only: production draw gate and PersonCrowd packing, plus the real SF headless traffic simulation.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { loadTraffic, available } = require('./helpers/traffic-harness.cjs');

const traffic = readFileSync(join(__dirname, '../js/traffic.js'), 'utf8');
const people = readFileSync(join(__dirname, '../js/pedestrians.js'), 'utf8');
const renderSource = traffic.match(/  function renderPed\([^]*?\n  \}/)?.[0];
const crowdSource = people.match(/class PersonCrowd \{[^]*?\n\}/)?.[0];
assert.ok(renderSource && crowdSource);

function makeCrowd() {
  // The production class owns the actual LOD indexing, pose prefixes, empty/warm-up handling and PBO dirty flags.
  // GPU objects are stand-ins, so this does not claim a rendered WebGPU/WebGL2 result.
  const context = {
    STRIDE: 1,
    attributeArray(n) {
      const attr = { array: new Float32Array(n * 4), ranges: [], pbo: { needsUpdate: false }, needsUpdate: false,
        clearUpdateRanges() { this.ranges.length = 0; }, addUpdateRange(start, count) { this.ranges.push({ start, count }); } };
      return { value: attr, setPBO() { return this; }, toReadOnly() { return this; } };
    },
    THREE: { Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } } },
    buildPersonGeometry: detail => ({ detail }), createPersonMaterial: pose => ({ pose })
  };
  const PersonCrowd = vm.runInNewContext(`(${crowdSource})`, context);
  return new PersonCrowd(16);
}

function setup() {
  const crowd = makeCrowd();
  const context = { presentationClearance: null, hasView: false, visible: () => true,
    pedGround: () => 0, focusX: 0, focusZ: 0, pedCrowd: crowd };
  const render = vm.runInNewContext(`(${renderSource.trim()})`, context);
  const pedestrian = (id, x, z) => ({ x, z, ux: 0, uz: 1, dir: 1,
    rig: { pose: new Float32Array([id, id + 0.1, id + 0.2, id + 0.3]), calls: [],
      update(...args) { this.calls.push(args); } } });
  const frame = peds => { crowd.begin(); for (const p of peds) render(p, 0.05); crowd.end(); };
  return { crowd, context, pedestrian, frame };
}

test('inclusive stage boundaries hide only centres inside it; view culling and gait still work', () => {
  const h = setup(), area = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };
  h.context.presentationClearance = area;
  const points = [[0, 0, false], [-1, 0, false], [1, 0, false], [0, -2, false], [0, 2, false],
    [-1.0001, 0, true], [1.0001, 0, true], [0, -2.0001, true], [0, 2.0001, true]];
  const peds = points.map(([x, z], i) => h.pedestrian(i + 1, x, z));
  h.frame(peds);
  for (let i = 0; i < points.length; i++) {
    assert.equal(peds[i].rig.calls.length, 1);
    assert.equal(peds[i].rig.calls[0][0], 0.05);
    assert.equal(peds[i].rig.calls[0][7], points[i][2]);
    assert.equal(peds[i].x, points[i][0]); assert.equal(peds[i].z, points[i][1]);
  }
  assert.equal(h.crowd.lods[0].count, 4);
  h.context.hasView = true; h.context.visible = () => false;
  h.frame(peds);
  assert.ok(peds.every(p => p.rig.calls.at(-1)[7] === false));
});

test('both production LODs compact pose indices, clear empty pools, and restore after exit', () => {
  const h = setup();
  const near1 = h.pedestrian(1, 1, 0), near2 = h.pedestrian(2, 2, 0);
  const far1 = h.pedestrian(3, 40, 0), far2 = h.pedestrian(4, 41, 0);
  const all = [near1, near2, far1, far2];
  h.frame(all); h.frame(all); h.frame(all);
  const [near, far] = h.crowd.lods;
  assert.deepEqual([near.mesh.name, far.mesh.name], ['PeopleNear', 'PeopleFar']);
  assert.deepEqual([near.mesh.count, far.mesh.count], [2, 2]);
  h.context.presentationClearance = { minX: 0, maxX: 40, minZ: -1, maxZ: 1 };
  h.frame(all);
  assert.deepEqual([near.mesh.count, far.mesh.count], [0, 1]);
  assert.equal(near.mesh.visible, false); assert.equal(far.mesh.visible, true);
  assert.equal(far.pose.value.array[0], 4, 'remaining far rig occupies slot zero');
  assert.deepEqual(far.pose.value.ranges, [{ start: 0, count: 4 }]);
  assert.equal(far.pose.value.pbo.needsUpdate, true);
  h.context.presentationClearance = { minX: -1, maxX: 100, minZ: -1, maxZ: 1 };
  h.frame(all);
  assert.deepEqual([near.mesh.count, far.mesh.count], [0, 0]);
  assert.equal(near.mesh.visible, false); assert.equal(far.mesh.visible, false);
  h.context.presentationClearance = null;
  h.frame(all);
  assert.deepEqual([near.mesh.count, far.mesh.count], [2, 2]);
  assert.deepEqual([near.pose.value.array[0], near.pose.value.array[4], far.pose.value.array[0], far.pose.value.array[4]], [1, 2, 3, 4]);
  assert.deepEqual(near.pose.value.ranges, [{ start: 0, count: 8 }]);
  assert.deepEqual(far.pose.value.ranges, [{ start: 0, count: 8 }]);
  assert.ok(all.every(p => p.rig.calls.length === 6), 'hidden rigs still advance on each frame');
});

test('warm-up clears a formerly populated LOD to a degenerate pose without stale people', () => {
  const h = setup(), p = h.pedestrian(9, 0, 0);
  h.frame([p]);
  h.context.presentationClearance = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  h.frame([p]);
  const near = h.crowd.lods[0];
  assert.equal(near.mesh.count, 1); assert.equal(near.mesh.visible, true);
  assert.deepEqual([...near.pose.value.array.slice(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual(near.pose.value.ranges, [{ start: 0, count: 4 }]);
  assert.equal(near.pose.value.pbo.needsUpdate, true);
  h.frame([p]);
  assert.equal(near.mesh.count, 0); assert.equal(near.mesh.visible, false);
});

test('a pedestrian walking into and out of the stage disappears and reappears without a setter call', () => {
  const h = setup(), p = h.pedestrian(7, -2, 0);
  h.context.presentationClearance = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  h.frame([p]); assert.equal(h.crowd.lods[0].count, 1);
  p.x = 0;
  h.frame([p]); assert.equal(h.crowd.lods[0].count, 0);
  p.x = 2;
  h.frame([p]); assert.equal(h.crowd.lods[0].count, 1);
  assert.deepEqual(p.rig.calls.map(call => call[7]), [true, false, true]);
});

test('inactive clearance matches the original SF draw decision, view calls and crowd order', () => {
  const h = setup(), expected = [];
  let viewCalls = 0;
  h.context.hasView = true;
  h.context.visible = (x, z, margin) => { viewCalls++; assert.equal(margin, 7); return x + z > 0; };
  const peds = Array.from({ length: 15 }, (_, i) => h.pedestrian(i + 1, i * 8 - 56, i % 2 ? 10 : -10));
  for (const p of peds) if (p.x + p.z > 0) expected.push(p.rig.pose[0]);
  h.frame(peds);
  assert.equal(viewCalls, peds.length);
  assert.deepEqual(peds.map(p => p.rig.calls[0][7]), peds.map(p => p.x + p.z > 0));
  const actual = Array.from(h.crowd.lods).flatMap(l => Array.from({ length: l.count }, (_, i) => l.pose.value.array[i * 4]));
  const byLod = expected.filter(id => Math.hypot(peds[id - 1].x, peds[id - 1].z) <= 34)
    .concat(expected.filter(id => Math.hypot(peds[id - 1].x, peds[id - 1].z) > 34));
  assert.deepEqual(actual, byLod);
});

test('seeded SF routes, social state, occupancy and dynamic bodies match with clearance toggled', { skip: !available && 'no terrain' }, () => {
  const base = loadTraffic({ seed: 7351 }).system;
  const masked = loadTraffic({ seed: 7351 }).system;
  const focus = { x: -330, y: 0, z: -560 };
  assert.equal(typeof masked.setPresentationClearance, 'function');
  const pedState = s => s.peds.map(p => [p.placed, p.x, p.z, p.t, p.dir, p.v, p.pause, p.waiting,
    p.velocityX, p.velocityZ, p.bumped, p.dodge, !!p.conversation]);
  const vehicleState = s => s.cars.concat(s.buses).map(v => [v.edge?.id, v.lane, v.s, v.x, v.z, v.speed, !!v.conn]);
  const occupancy = s => s.network.nodes.map(n => [n.walkers.map(p => s.peds.indexOf(p)), n.curb.map(p => s.peds.indexOf(p))]);
  const query = (s, x, z) => { const out = []; s.dynamicBodiesNear(x, z, 4, out); return out.map(b =>
    [b.kind, b.x, b.z, b.minY, b.maxY, b.headingY, b.velocityX, b.velocityZ]); };
  for (let i = 0; i < 100; i++) {
    if (i === 10) masked.setPresentationClearance({ minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 });
    if (i === 70) masked.setPresentationClearance(null);
    base.update(0.05, i * 0.05, focus); masked.update(0.05, i * 0.05, focus);
    assert.equal(JSON.stringify(pedState(masked)), JSON.stringify(pedState(base)), `pedestrians at step ${i}`);
    assert.equal(JSON.stringify(vehicleState(masked)), JSON.stringify(vehicleState(base)), `vehicles at step ${i}`);
    assert.equal(JSON.stringify(occupancy(masked)), JSON.stringify(occupancy(base)), `walking/curb occupancy at step ${i}`);
    assert.equal(masked.bodyQueryStats.bodies, base.bodyQueryStats.bodies);
    const p = base.peds.find(p => p.placed);
    assert.ok(p);
    assert.equal(JSON.stringify(query(masked, p.x, p.z)), JSON.stringify(query(base, p.x, p.z)), `bodies at step ${i}`);
    assert.ok(query(masked, p.x, p.z).some(b => b[0] === 'person'), 'hidden walker remains physical');
  }
});
