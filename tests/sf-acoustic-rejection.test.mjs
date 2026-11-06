import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CityAcoustics } from '../js/audio-acoustics.js';
import { thickness as reference } from './helpers/acoustic-thickness-reference.mjs';

// Expose private production geometry locally, without changing its bytes or shipping a test API.
const source = readFileSync(new URL('../js/audio-acoustics.js', import.meta.url), 'utf8');
const thickness = new Function(source.replace('export { CityAcoustics };', 'return thickness;'))();
const shape = (points, minY = -3, maxY = 12) => ({
  polygon: points.map(([x, z]) => ({ x, z })), minY, maxY,
  minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
  minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])),
});
const square = shape([[0, 0], [10, 0], [10, 10], [0, 10]]);
const courtyard = shape([[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]]);
const comb = shape([[0, 0], [12, 0], [12, 10], [10, 10], [10, 2], [8, 2], [8, 10], [6, 10], [6, 2], [4, 2], [4, 10], [0, 10]]);
const shapes = [square, courtyard, comb, shape([[0, 0], [12, 2], [5, 10]]),
  { ...courtyard, polygon: courtyard.polygon.toReversed() },
  { ...square, polygon: undefined },
  { ...square, polygon: undefined, obb: { cx: 5, cz: 5, hx: 6, hz: 2, cs: Math.cos(0.7), sn: Math.sin(0.7) } }];
function compare(c, ray) {
  for (const inside of [false, true]) assert.equal(thickness(c, ...ray, inside), reference(c, ...ray, inside));
}
let seed = 712367;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

test('exact differential: boundaries, horizontal/vertical, inside endpoints, concavity, missing bounds and near-parallel rays', () => {
  const rays = [
    [-5, 2, 5, 15, 2, 5], [5, 2, 5, 5, 2, 15], [1, 2, 1, 20, 2, 1], [-5, 2, 1, 1, 2, 1],
    [0, 2, 0, 10, 2, 0], [0, 2, 10, 10, 2, 10], [-1, 2, -1, 0, 2, 0],
    [5, -10, 5, 5, 20, 5], [5, 2, 5, 5, 2, 5], [-5, -3, 5, 15, -3, 5], [-5, 12, 5, 15, 12, 5],
    [-5, 12 + 1e-10, 5, 15, 12 + 2e-10, 5], [-5, -3 - 1e-10, 5, 15, -3 - 2e-10, 5],
    [-5, 2, 1e-11, 15, 2 + 1e-8, -1e-11], [-5, 2, 10, 15, 2, 10 + 1e-11],
    [0, -3, 0, 10, 12, 10], [-5, 2, -5, -1, 2, 15], [12, 2, -5, 16, 2, 15],
  ];
  for (const c of shapes) for (const ray of rays) compare(c, ray);
  const missing = { polygon: courtyard.polygon, maxY: 12 };
  for (const ray of rays) compare(missing, ray);
  assert.equal(thickness(courtyard, 5, 2, 5, 5, 2, 15), 0, 'courtyard remains open');
  assert.ok(Math.abs(thickness(courtyard, -5, 2, 5, 15, 2, 5) - 6) < 1e-12, 'only two solid arms, not the AABB');
  assert.equal(thickness(square, -5, 2, 5, 5, 2, 5), 0, 'source-inside exemption');
  assert.equal(thickness(square, -5, 2, 5, 5, 2, 5, true), 5, 'enclosure probe allows source inside');
});

test('seeded differential: 40,000 rays in both directions/endpoint modes, including translated SF-scale coordinates', () => {
  for (let i = 0; i < 40000; i++) {
    const c = shapes[i % shapes.length];
    const ray = Array.from({ length: 6 }, () => random() * 60 - 25);
    compare(c, ray); compare(c, [...ray.slice(3), ...ray.slice(0, 3)]);
    if (c.polygon && i % 7 === 0) {
      const offset = 100000;
      const moved = { ...c, minX: c.minX + offset, maxX: c.maxX + offset,
        minZ: c.minZ - offset, maxZ: c.maxZ - offset,
        polygon: c.polygon.map(p => ({ x: p.x + offset, z: p.z - offset })) };
      compare(moved, ray.map((v, j) => j % 3 === 0 ? v + offset : j % 3 === 2 ? v - offset : v));
    }
  }
});

test('strictly disjoint bounds avoid all polygon vertex visits; boundary/overlap still invoke exact geometry', () => {
  let reads = 0;
  const polygon = new Proxy(square.polygon, { get(target, key) {
    if (/^\d+$/.test(String(key))) reads++;
    return Reflect.get(target, key);
  } });
  const c = { ...square, polygon };
  for (const ray of [[-10, 2, 5, -1, 2, 5], [11, 2, 5, 20, 2, 5], [5, 2, -10, 5, 2, -1],
    [5, 2, 11, 5, 2, 20], [-10, 13, 5, 20, 15, 5], [-10, -5, 5, 20, -4, 5]]) {
    assert.equal(thickness(c, ...ray), 0);
  }
  assert.equal(reads, 0);
  thickness(c, -5, 2, 0, 15, 2, 0); assert.ok(reads > 0);
});

test('public acoustics enclosure/aperture outputs equal frozen geometry, with unchanged cache cadence', () => {
  let refreshes = 0;
  const buildings = [courtyard, square, comb];
  const acoustic = new CityAcoustics({ nearColliders() { refreshes++; return buildings; } });
  const listener = { x: -10, y: 2, z: 5 };
  acoustic.update(listener, 0);
  let enclosed = 0;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const depth = Math.max(...buildings.map(c => reference(c, listener.x, listener.y, listener.z,
      listener.x + Math.cos(angle) * 80, listener.y + 40, listener.z + Math.sin(angle) * 80, true)));
    enclosed += 1 - Math.exp(-depth * 0.1);
  }
  assert.equal(acoustic.enclosure, enclosed / 8);
  for (const source of [{ x: 20, y: 2, z: 5 }, { x: 5, y: 2, z: 20 }, { x: 20, y: 40, z: 5 }]) {
    const dx = source.x - listener.x, dz = source.z - listener.z, distance = Math.hypot(dx, dz);
    let blocked = 0;
    for (let ray = -1; ray <= 1; ray++) {
      const ox = -dz / distance * 0.9 * ray, oz = dx / distance * 0.9 * ray;
      const depth = Math.max(...buildings.map(c => reference(c, listener.x + ox, listener.y, listener.z + oz,
        source.x + ox, source.y, source.z + oz)));
      blocked += 1 - Math.exp(-depth * 0.45);
    }
    assert.equal(acoustic.obstruction(source, listener), blocked / 3);
  }
  acoustic.update(listener, 0.49); assert.equal(refreshes, 1);
  acoustic.update(listener, 0.5); assert.equal(refreshes, 2);
  acoustic.update({ ...listener, x: listener.x + 21 }, 0.51); assert.equal(refreshes, 3);
});

test('optional bounded mixed acoustic CPU fixture (diagnostic only, no timing threshold)', { skip: !process.env.SF_ACOUSTIC_BENCH }, t => {
  const polygon = shape(Array.from({ length: 48 }, (_, i) => {
    const angle = i * Math.PI / 24, radius = i % 2 ? 12 : 20;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  }));
  const rays = Array.from({ length: 4000 }, (_, i) => i % 4
    ? [30 + i % 100, 2, -50, 31 + i % 100, 4, 50] : [-40, 2, i % 30 - 15, 40, 4, i % 30 - 15]);
  const run = fn => {
    let sum = 0; const start = performance.now();
    for (let round = 0; round < 8; round++) for (const ray of rays) sum += fn(polygon, ...ray, true);
    return { ms: performance.now() - start, sum };
  };
  run(reference); run(thickness);
  const before = run(reference), after = run(thickness), repeat = run(reference);
  assert.equal(after.sum, before.sum); assert.equal(repeat.sum, before.sum);
  t.diagnostic(JSON.stringify({ callsPerWindow: 32000, reference: before.ms, candidate: after.ms, referenceRepeat: repeat.ms }));
});
