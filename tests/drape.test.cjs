// js/drape.js on the real curbs (tests/helpers/geo-box.cjs): every curb island draped on the terrain (P2.4) — the curb
// tops stand CURB_H above the ground at the outline, the sidewalk surface follows the grade between its vertices, and the
// build is fast enough. Node 24's uncontextified VM global avoids the inherited VM
// global-property proxy penalty; sources, cross-realm inputs/callbacks and the 10 s budget stay intact.
// DRAPE_PROFILE=1 adds the bounded matched harness experiment; no browser/renderer is involved.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const root = join(__dirname, '..');
const { BOX } = require('./helpers/geo-box.cjs');
const terrainFile = join(root, `data/terrain-${BOX}.bin`);
const CURB_H = 0.15; // js/city-config.js

function setup(mode = 'plain-global') {
  const window = { NYC: {} };
  const context = mode === 'plain-global' ? vm.createContext(vm.constants.DONT_CONTEXTIFY) : vm.createContext({ window });
  if (mode === 'plain-global') context.window = window;
  if (mode === 'explicit-Math') context.Math = Math;
  for (const f of ['js/sf-geodata.js', 'js/terrain.js', 'js/drape.js']) {
    const source = readFileSync(join(root, f), 'utf8');
    if (mode === 'same-realm') new Function('window', source)(window);
    else vm.runInContext(source, context, { filename: f });
  }
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  const ab = buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length);
  const NYC = window.NYC;
  NYC.Terrain.load(header, new Uint16Array(ab, 0, header.w * header.h));
  const rings = NYC.GEO.blocks.map(([flat]) => {
    const r = [];
    for (let i = 0; i < flat.length; i += 2) r.push({ x: flat[i], z: flat[i + 1] });
    return r;
  }).filter((r) => r.length > 2);
  return { NYC, rings };
}

function buildFixture(NYC, rings) {
  const { Terrain: T, Drape } = NYC;
  const ground = (x, z) => T.groundAt(x, z), normal = (x, z, o) => T.normalAt(x, z, o);
  const top = { pos: [], nrm: [], idx: [] }, curb = { pos: [], nrm: [], idx: [] };
  for (const r of rings) {
    const ring = Drape.densify(r, 2);
    Drape.polygon(ring, ground, normal, CURB_H, top);
    Drape.wall(ring, ground, -0.3, CURB_H, curb);
  }
  return { top, curb };
}

function geometryHash({ top, curb }) {
  const hash = createHash('sha256');
  for (const out of [top, curb]) for (const key of ['pos', 'nrm', 'idx']) hash.update(Buffer.from(new Float64Array(out[key]).buffer));
  return hash.digest('hex');
}

if (process.env.DRAPE_PROFILE === '1') test('bounded harness comparison preserves geometry across global/realm configurations', { skip: !existsSync(terrainFile) && 'no terrain' }, (t) => {
  const modes = ['inherited', 'explicit-Math', 'plain-global', 'same-realm'];
  const fixtures = modes.map((mode) => {
    const { NYC, rings } = setup(mode);
    return { mode, NYC, rings: Array.from({ length: 64 }, (_, i) => rings[Math.floor(i * rings.length / 64)]), ms: [] };
  });
  let expected;
  for (const f of fixtures) {
    const out = buildFixture(f.NYC, f.rings); // one bounded warm-up, never the full city
    const hash = geometryHash(out);
    if (!expected) expected = hash;
    assert.equal(hash, expected, f.mode + ' produces the same ordered vertices/normals/indices');
  }
  for (let round = 0; round < 5; round++) for (const f of round % 2 ? fixtures.slice().reverse() : fixtures) {
    const start = performance.now();
    buildFixture(f.NYC, f.rings);
    f.ms.push(performance.now() - start);
  }
  t.diagnostic(JSON.stringify({ node: process.version, fixtureRings: 64, geometryHash: expected,
    samples: fixtures.map(({ mode, ms }) => ({ mode, ms: ms.map((v) => +v.toFixed(3)) })),
    sourceSHA256: Object.fromEntries(['js/drape.js', 'js/terrain.js'].map((file) => [file, createHash('sha256').update(readFileSync(join(root, file))).digest('hex')])) }));
});

test('curb islands drape on the terrain: outline tops at ground + CURB_H, surfaces within tolerance', { skip: !existsSync(terrainFile) && 'no terrain' }, (t) => {
  const { NYC, rings } = setup();
  const { Terrain: T, Drape } = NYC;
  const ground = (x, z) => T.groundAt(x, z);
  const t0 = performance.now(), cpu0 = process.cpuUsage();
  const { top, curb } = buildFixture(NYC, rings);
  const ms = performance.now() - t0, cpu = process.cpuUsage(cpu0);

  // 5,000 outline vertices: the top edge of the curb faces (vertices 2 and 3 of each quad)
  const quads = curb.pos.length / 12;
  assert.ok(quads > 5000);
  const stride = Math.floor(quads / 5000);
  let checked = 0;
  for (let q = 0; q < quads && checked < 5000; q += stride, checked++) {
    for (const v of [2, 3]) {
      const o = q * 12 + v * 3;
      const [x, y, z] = [curb.pos[o], curb.pos[o + 1], curb.pos[o + 2]];
      assert.ok(Math.abs(y - ground(x, z) - CURB_H) < 0.01, `outline vertex at ${x},${z}: ${y - ground(x, z)}`);
    }
  }
  assert.equal(checked, 5000);

  // every top vertex at ground + CURB_H; triangle centroids within the drape tolerance (+ a centimetre) of it
  for (let k = 0; k < top.pos.length; k += 3) {
    assert.ok(Math.abs(top.pos[k + 1] - ground(top.pos[k], top.pos[k + 2]) - CURB_H) < 0.01);
  }
  // triangle centroids within the drape tolerance of the grade, except where the smallest leaves (2 m, the data's own
  // spacing: two triangles) can't follow the ground (PLAN.md P3-1): on retaining walls (slope > 1), in height-field
  // cells creased more than the tolerance (twist |h00 - h10 - h01 + h11| / 4 > TOL: terrace edges on the core's
  // waterfront) and in cells the waterline crosses (the ground is the height clamped at the water: a curved crease along
  // the seawall's top edge). Those only count towards the percentiles
  const creased = (x, z) => {
    const i = Math.floor((x - T.originX) / T.cell), j = Math.floor((z - T.originZ) / T.cell), k = j * T.w + i;
    const c = [k, k + 1, k + T.w, k + T.w + 1].map((n) => T.heights[n]);
    const wet = c.filter((h) => h <= T.waterLevel).length;
    return (wet > 0 && wet < 4) || Math.abs(c[0] - c[1] - c[2] + c[3]) / 4 > Drape.TOL;
  };
  const devs = [];
  let worst = 0;
  for (let t = 0; t < top.idx.length; t += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const o = top.idx[t + k] * 3;
      x += top.pos[o] / 3; y += top.pos[o + 1] / 3; z += top.pos[o + 2] / 3;
    }
    const d = Math.abs(y - ground(x, z) - CURB_H);
    devs.push(d);
    if (T.slopeAt(x, z) < 1 && !creased(x, z)) worst = Math.max(worst, d);
  }
  devs.sort((a, b) => a - b);
  assert.ok(devs[Math.floor(devs.length * 0.99)] <= Drape.TOL, `p99 ${devs[Math.floor(devs.length * 0.99)]}`);
  assert.ok(worst < 2 * Drape.TOL + 0.01, `worst centroid ${worst.toFixed(3)} m off the grade`);
  // triangles face up
  let down = 0;
  for (let t = 0; t < top.idx.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => top.idx[t + k] * 3);
    const ux = top.pos[b] - top.pos[a], uz = top.pos[b + 2] - top.pos[a + 2];
    const vx = top.pos[c] - top.pos[a], vz = top.pos[c + 2] - top.pos[a + 2];
    if (uz * vx - ux * vz < -1e-6) down++;
  }
  assert.equal(down, 0);
  // Geometry must finish before reporting/asserting performance. Keep the inherited
  // 10 s budget: the correction is the VM global, not a relaxed/hidden/ignored check.
  t.diagnostic(JSON.stringify({ benchmark: 'full Drape build; setup and validation excluded', node: process.version,
    globalMode: 'plain-global', wallMs: +ms.toFixed(3), cpuMs: +((cpu.user + cpu.system) / 1000).toFixed(3), budgetMs: 10000,
    rings: rings.length, topVertices: top.pos.length / 3, topTriangles: top.idx.length / 3, curbQuads: quads,
    checkedOutlineQuads: checked, p99DeviationMetres: devs[Math.floor(devs.length * 0.99)], worstSmoothDeviationMetres: worst, downwardTriangles: down }));
  assert.ok(ms < 10000, `drape took ${ms.toFixed(3)} ms (plain-global VM; 10000 ms budget)`);
});
