const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/traffic.js'), 'utf8');
// Exercise the production lane query and player snapshot without creating the WebGPU scene.
const laneQuery = source.match(/  function playerInLane\(lane, pl\) \{[\s\S]*?\n  \}/)?.[0];
const boxRun = source.match(/const HWY_BOX_RUN = \d+;/)?.[0];
const laneBounds = source.match(/    lane.box = \[Infinity[^]*?(?=    lane.cars = \[\];)/)?.[0];
assert.ok(laneQuery, 'traffic lane query is present');
assert.ok(boxRun && laneBounds, 'production highway bounds construction is present');
const context = vm.createContext({ window: { NYC: {} } });
vm.runInContext(readFileSync(join(__dirname, '../js/sf-dynamic-bodies.js'), 'utf8'), context);
const { playerInLane, snapshot, prepareBounds } = vm.runInNewContext(`
  const playerLane = {};
  ${boxRun}
  ${laneQuery}
  function prepareBounds(lane) {
    const P = lane.pts;
    ${laneBounds}
    return lane;
  }
  function snapshot(entity) {
    const out = readSfPlayerBody(entity, {});
    return out.active ? out : null;
  }
  ({ playerInLane, snapshot, prepareBounds });
`, { readSfPlayerBody: context.window.NYC.readSfPlayerBody });

function lane(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return prepareBounds({
    pts: points,
    cum
  });
}

function player(x, y, z, mode = 'car') {
  return snapshot({ position: { x, y, z }, heading: Math.PI / 2, speed: 10 }, mode);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

// Frozen SF 09977d521fb6c9083448fe4b91cdebf9444fa2df js/traffic.js playerInLane.
// Keep the original whole-lane gate, source-order first hit, projected hull and absolute-Y volume checks as oracle.
function fullScan(lane, pl) {
  const [x0, x1, z0, z1] = lane.box;
  if (pl.x < x0 - 3 || pl.x > x1 + 3 || pl.z < z0 - 3 || pl.z > z1 + 3) return null;
  const P = lane.pts;
  for (let i = 0; i + 1 < P.length; i++) {
    const ax = P[i].x, az = P[i].z;
    const sx = P[i + 1].x - ax, sz = P[i + 1].z - az;
    const horizontalLengthSq = sx * sx + sz * sz;
    if (horizontalLengthSq === 0) continue;
    const L = lane.cum[i + 1] - lane.cum[i];
    const t = ((pl.x - ax) * sx + (pl.z - az) * sz) / horizontalLengthSq;
    if (t < 0 || t > 1) continue;
    const y = P[i].y + (P[i + 1].y - P[i].y) * t;
    if (pl.maxY <= y || pl.minY >= y + 2.6) continue;
    const heading = Math.atan2(sx, sz), c = Math.abs(Math.cos(pl.headingY - heading)), s = Math.abs(Math.sin(pl.headingY - heading));
    if (Math.abs((pl.z - az) * sx - (pl.x - ax) * sz) / Math.sqrt(horizontalLengthSq) < 1 + pl.halfW * c + pl.halfL * s + 0.4) {
      return {
        u: lane.cum[i] + t * L,
        v: Math.max(0, ((pl.vx * sx + pl.vz * sz) / horizontalLengthSq) * L),
        halfL: pl.halfL * c + pl.halfW * s
      };
    }
  }
  return null;
}

function compare(road, pl, label = '') {
  const actual = playerInLane(road, pl), expected = fullScan(road, pl);
  assert.deepEqual(actual && { ...actual }, expected, label);
  return expected;
}

function shorePoints(n = 40) {
  const points = [];
  for (let i = 0; i <= n; i++) points.push({ x: 0, y: 40 + i * 2, z: i * 10 });
  for (let i = 0; i <= n; i++) points.push({ x: 200, y: 80 - i * 3, z: (n - i) * 10 });
  return points;
}

test('highway construction retains whole-lane bounds and includes both vertices at every 16-segment seam', () => {
  const points = shorePoints(), before = JSON.stringify(points), road = lane(points);
  assert.deepEqual([...road.box], [0, 200, 0, 400]);
  assert.equal(road.playerBoxes.length, Math.ceil((points.length - 1) / 16) * 4);
  assert.equal(JSON.stringify(points), before, 'precomputation never modifies geometry');
  for (let r = 0; r < road.playerBoxes.length; r += 4) {
    const start = r / 4 * 16, end = Math.min(points.length - 1, start + 16);
    const run = points.slice(start, end + 1);
    assert.deepEqual([...road.playerBoxes.slice(r, r + 4)], [Math.min(...run.map(p => p.x)), Math.max(...run.map(p => p.x)),
      Math.min(...run.map(p => p.z)), Math.max(...run.map(p => p.z))]);
  }
});

test('SF full-scan differential: slopes, bends, repeated/vertical segments, underground and overlapping levels', () => {
  const points = shorePoints();
  points.push({ ...points.at(-1) }, { x: 200, y: -40, z: 0 }, { x: 200, y: 80, z: 0 });
  for (let i = 1; i <= 40; i++) points.push({ x: 200, y: 80 + i * 0.2, z: i * 10 });
  points.push({ x: 100, y: -4.5, z: 400 }, { x: 100, y: -4.5, z: 0 });
  const road = lane(points);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (const t of [0, 0.5, 1]) for (const headingY of [0, Math.PI / 4, Math.PI / 2]) {
      for (const lateral of [-3.001, -2, -1.899999, 0, 1.899999, 2, 3.001]) {
        for (const dy of [-1.9, -0.001, 0, 2.599999, 2.6]) {
          const y = a.y + (b.y - a.y) * t + dy;
          compare(road, { x: a.x + (b.x - a.x) * t + (b.z - a.z) / len * lateral,
            z: a.z + (b.z - a.z) * t - (b.x - a.x) / len * lateral,
            minY: y, maxY: y + 1.9, headingY, halfW: 0.35, halfL: 0.5, vx: -7, vz: 11 }, `segment ${i}, t ${t}, heading ${headingY}, lateral ${lateral}, dy ${dy}`);
        }
      }
    }
  }
});

test('run/whole-lane edges, strict lateral contact and strict vertical boundaries match the SF full scan', () => {
  const road = lane(Array.from({ length: 34 }, (_, i) => ({ x: 0, y: 64, z: i * 10 })));
  const pl = { x: 0, z: 160, minY: 64, maxY: 65.9, halfW: 0.35, halfL: 0.5, headingY: 0, vx: 0, vz: 10 };
  const width = 1 + pl.halfW + 0.4;
  for (const x of [-3.000001, -3, -width, -width + 1e-9, 0, width - 1e-9, width, 3, 3.000001]) {
    for (const z of [-3.000001, -3, -1e-9, 0, 157, 160, 163, 320, 330, 330 + 1e-9, 333, 333.000001]) {
      compare(road, { ...pl, x, z });
    }
  }
  assert.equal(compare(road, { ...pl, x: width }), null);
  assert.ok(compare(road, { ...pl, x: width - 1e-9 }));
  for (const [minY, maxY, hit] of [[62, 64, false], [62, 64 + 1e-9, true], [66.6, 68, false], [66.6 - 1e-9, 68, true]]) {
    assert.equal(!!compare(road, { ...pl, minY, maxY }), hit);
  }
});

test('projected hull corners outside a fixed 3 m run margin stay candidates without changing the whole-lane gate', () => {
  const road = lane(shorePoints());
  const pl = { x: 4, z: 55, minY: 50, maxY: 53, halfW: 2, halfL: 3, headingY: Math.atan2(3, 2), vx: 0, vz: 10 };
  const hit = compare(road, pl);
  assert.ok(hit && hit.u < road.cum[40], 'wide rotated hull reaches the first shore, before the distant return');
  assert.equal(compare(road, { ...pl, x: -3.000001 }), null, 'original whole-lane clipping stays exact');
});

test('source-first hits survive seams, crossings and overlapping runs, including reverse projected velocity', () => {
  const points = Array.from({ length: 17 }, (_, i) => ({ x: 0, y: 40, z: i * 10 }));
  points.push({ x: 100, y: 50, z: 160 }, { x: 0, y: 40, z: 160 });
  for (let i = 15; i >= 0; i--) points.push({ x: 0, y: 40, z: i * 10 });
  const road = lane(points);
  const pl = { x: 0, z: 160, minY: 40, maxY: 41.9, halfW: 0.35, halfL: 0.5, headingY: 0, vx: 12, vz: -10 };
  assert.equal(compare(road, pl).u, 160);
  assert.equal(compare(road, pl).v, 0, 'first segment is +Z, not the later reverse traversal');
  close(compare(road, { ...pl, z: 55 }).u, 55);
});

test('deterministic variable-hull differential over multiple lane directions and elevations', () => {
  let seed = 431;
  const rand = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (let run = 0; run < 8; run++) {
    const points = [{ x: -500, y: -40, z: 200 }];
    for (let i = 0; i < 80; i++) {
      const a = points.at(-1);
      points.push({ x: a.x + (rand() - 0.5) * 60, y: a.y + (rand() - 0.5) * 30, z: a.z + (rand() - 0.5) * 60 });
    }
    const road = lane(points);
    for (let k = 0; k < 1200; k++) {
      const i = Math.floor(rand() * 80), a = points[i], b = points[i + 1], t = rand();
      const minY = a.y + (b.y - a.y) * t + (rand() - 0.5) * 6;
      compare(road, { x: a.x + (b.x - a.x) * t + (rand() - 0.5) * 12,
        z: a.z + (b.z - a.z) * t + (rand() - 0.5) * 12, minY, maxY: minY + 0.1 + rand() * 3,
        headingY: rand() * Math.PI * 2, halfW: 0.2 + rand() * 3, halfL: 0.2 + rand() * 4,
        vx: (rand() - 0.5) * 40, vz: (rand() - 0.5) * 40 }, `lane ${run}, query ${k}`);
    }
  }
});

test('bounded candidate-cost probe and informational matched CPU timings on an 801-segment synthetic lane', t => {
  const road = lane(shorePoints(400));
  const cases = [
    { name: 'far', x: 1000, z: 2000, minY: 0 },
    { name: 'inside/off-lane', x: 100, z: 2000, minY: 0 },
    { name: 'late run', x: 200, z: 55, minY: 80 - 394.5 * 3 }
  ].map(pl => ({ maxY: pl.minY + 1.9, halfW: 0.35, halfL: 0.5, headingY: 0, vx: 0, vz: 10, ...pl }));
  // Response-only CPU instrumentation: count entry to the unchanged detailed segment test, with no runtime hook.
  const instrument = code => code.replace('const ax = P[i].x', 'segmentTests++; const ax = P[i].x');
  const env = vm.createContext({ segmentTests: 0 });
  vm.runInContext(`const playerLane = {}; ${boxRun};
    const bounded = (${instrument(laneQuery)});
    const baseline = (${instrument(fullScan.toString())});`, env);
  const runQuery = (name, pl) => { env.segmentTests = 0; env.road = road; env.pl = pl;
    const value = vm.runInContext(`${name}(road, pl)`, env);
    return { value: value && { ...value }, segments: env.segmentTests }; };
  for (const pl of cases) {
    const bounded = runQuery('bounded', pl), baseline = runQuery('baseline', pl);
    assert.deepEqual(bounded.value, baseline.value);
    if (pl.name === 'late run') {
      assert.ok(bounded.value);
      assert.ok(bounded.segments <= 16, 'only the local run needs detailed segment tests');
      assert.ok(baseline.segments > 700, 'fixture exercises a late source-order hit');
    } else assert.equal(bounded.segments, 0);
    t.diagnostic(`${pl.name}: detailed segment tests ${baseline.segments} full scan -> ${bounded.segments} bounded`);
  }
  // Compile both non-instrumented functions in one non-contextified realm; no timings are pass/fail thresholds.
  const timingContext = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(timingContext, { road, cases, performance });
  const timings = vm.runInContext(`(() => {
    const playerLane = {}; ${boxRun};
    const bounded = (${laneQuery}), baseline = (${fullScan.toString()});
    const measure = fn => { let sum = 0; const start = performance.now();
      for (let i = 0; i < 1500; i++) for (const pl of cases) { const hit = fn(road, pl); if (hit) sum += hit.u; }
      return { ms: performance.now() - start, checksum: sum }; };
    measure(baseline); measure(bounded);
    return [measure(baseline), measure(bounded)];
  })()`, timingContext);
  assert.equal(timings[0].checksum, timings[1].checksum);
  t.diagnostic(`4500 CPU-only queries: full scan ${timings[0].ms.toFixed(3)} ms; bounded ${timings[1].ms.toFixed(3)} ms (informational, synthetic, no GPU/hardware claim)`);
});

test('street traffic recognizes players on its own road, including sidewalk height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]);
  for (const y of [0, 0.22]) {
    const result = playerInLane(road, player(50, y, 0));
    close(result.u, 50);
    close(result.v, 10);
  }
  assert.equal(playerInLane(road, player(50, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 0, 2.1)), null);
});

test('viaduct traffic ignores players below it and recognizes players at deck height', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  const result = playerInLane(road, player(50, 7.6, 0));
  close(result.u, 50);
  close(result.v, 10);
});

test('sloped lanes use horizontal projection and compare interpolated road height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  for (const t of [0, 0.5, 1]) {
    const result = playerInLane(road, player(100 * t, 7.6 * t, 0));
    close(result.u, road.cum[1] * t);
    close(result.v, road.cum[1] / 10);
  }
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  assert.equal(playerInLane(road, player(100.1, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 3.8, 2.001)), null);
});

test('overlapping road segments select the matching elevation', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 },
    { x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
  const result = playerInLane(road, player(50, 0, 0));
  close(result.u, 157.6);
  close(result.v, 0);
});

test('EUC awareness includes underground lanes at the matching absolute elevation', () => {
  const road = lane([{ x: 0, y: -4.5, z: 0 }, { x: 100, y: -4.5, z: 0 }]);
  close(playerInLane(road, player(50, -4.5, 0)).u, 50);
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  assert.equal(snapshot(null), null);
});
