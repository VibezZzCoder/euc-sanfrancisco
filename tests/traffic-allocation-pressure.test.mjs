// CPU-only exact comparisons/allocation diagnostics. No browser, renderer or production instrumentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gitHistory, optionalSourceTest } from './helpers/optional-source.mjs';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
import { performance } from 'node:perf_hooks';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadTraffic } = require('./helpers/traffic-harness.cjs');
const root = new URL('../', import.meta.url), ref = 'fc9826b2872320bca7f08ac19d7141d3bbc31683';
const names = ['traffic', 'sf-dynamic-bodies'];
const read = name => readFileSync(new URL(`js/${name}.js`, root), 'utf8');
const history = gitHistory(root, ref);
const baselineTest = optionalSourceTest(history.skip);
const baseline = Object.fromEntries(names.map(name => [name, history.read(`js/${name}.js`)]));
const current = Object.fromEntries(names.map(name => [name, read(name)]));
const indexedTraffic = baseline.traffic
  ?.replace('for (const v of vehicles) if (v.edge && !v.disabled) bodyIndex.add(snapshotVehicle(v));', 'for (let i = 0; i < vehicles.length; i++) { const v = vehicles[i]; if (v.edge && !v.disabled) bodyIndex.add(snapshotVehicle(v)); }')
  .replace('    for (const p of peds) {\n      if (!p.placed) continue;\n      const b = p.dynamicBody;', '    for (let i = 0; i < peds.length; i++) {\n      const p = peds[i];\n      if (!p.placed) continue;\n      const b = p.dynamicBody;');
const indexedDynamic = baseline['sf-dynamic-bodies']?.replace('for (const s of profile) {', 'for (let i = 0; i < profile.length; i++) {\n    const s = profile[i];');
const recordTraffic = indexedTraffic
  ?.replace('      v.x, v.y, v.z, v.yaw + v.yawOffset, v.pitch - v.gradePitch, v.roll + v.gradeRoll,\n      v.velocityX ?? v.tx * v.speed + v.vx, v.velocityZ ?? v.tz * v.speed + v.vz);', '      v, true);')
  .replace('c.dynamicBody, profiles[c.kind], c.x, c.y, c.z, c.yaw, c.pitch, 0, c.velocityX, c.velocityZ)', 'c.dynamicBody, profiles[c.kind], c, false)');
const recordDynamic = indexedDynamic?.replace('function writeSfVehicleBody(body, profile, x, y, z, headingY, pitch, roll, velocityX, velocityZ) {', `function writeSfVehicleBody(body, profile, x, y, z, headingY, pitch, roll, velocityX, velocityZ) {
  if (typeof x === 'object') {
    const actor = x, street = y;
    x = actor.x; y = actor.y; z = actor.z;
    headingY = street ? actor.yaw + actor.yawOffset : actor.yaw;
    pitch = street ? actor.pitch - actor.gradePitch : actor.pitch;
    roll = street ? actor.roll + actor.gradeRoll : 0;
    velocityX = street ? actor.velocityX ?? actor.tx * actor.speed + actor.vx : actor.velocityX;
    velocityZ = street ? actor.velocityZ ?? actor.tz * actor.speed + actor.vz : actor.velocityZ;
  }`);
const hash = value => createHash('sha256').update(value).digest('hex');
function dynamic(source, name, math = Math) {
  const window = { NYC: {} }; new Function('window', 'Math', source + `\n//# sourceURL=traffic-allocation-${name}.js`)(window, math); return window.NYC;
}
const B = history.available ? dynamic(baseline['sf-dynamic-bodies'], 'baseline') : null, A = dynamic(current['sf-dynamic-bodies'], 'candidate');
let actors;
test.before(async () => {
  const threeURL = new URL('vendor/three/build/three.webgpu.js', root).href;
  const addon = readFileSync(new URL('vendor/three/examples/jsm/utils/BufferGeometryUtils.js', root), 'utf8').replace("from 'three'", `from '${threeURL}'`);
  const Addons = await import(`data:text/javascript;base64,${Buffer.from(addon).toString('base64')}`);
  actors = { THREE, Addons };
});
const section = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b);
};
baselineTest('traffic allocation: changes stay in ordered body rebuilds and exact per-call pose work', () => {
  const strips = source => source.replace(/  function rebuildBodies\(\) \{[^]*?\n  \}/g, '  /* body rebuild */');
  assert.equal(strips(current.traffic), strips(baseline.traffic), 'all native actor loops, RNG, movement, audio, rendering and dirty uploads unchanged');
  const stripWriter = source => source.replace(section(source, 'function writeSfVehicleBody(', '\n// Read only.'), '/* writer */\n');
  assert.equal(stripWriter(current['sf-dynamic-bodies']), stripWriter(baseline['sf-dynamic-bodies']), 'index/query/shape/social contracts unchanged');
});
function realProfiles() {
  const { NYC } = loadTraffic({ seed: 9127, actors });
  const result = [];
  for (const kind of ['taxi', 'sedan', 'suv', 'van', 'bus']) {
    const spec = kind === 'bus' ? NYC.BUS_SPEC : NYC.BODY_SPECS[kind];
    const geo = kind === 'bus' ? NYC.buildLoftedBusBodyGeometry() : NYC.buildCarGeometry(spec, true);
    result.push({ kind, profile: NYC.sfVehicleShape(geo, spec) }); geo.dispose();
  }
  const lightbar = NYC.buildLightbarGeometry(NYC.BODY_SPECS.sedan);
  result.push({ kind: 'patrol', profile: result[1].profile.concat(NYC.sfVehicleShape(lightbar)) }); lightbar.dispose();
  return result;
}
baselineTest('traffic allocation: real car/van/bus/patrol slice bounds and both upright/near-vertical branches are exactly equal', t => {
  let seed = 874121, cases = 0;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const profiles = realProfiles(), a = {}, b = {};
  const edges = [0, -0, Math.PI / 2, -Math.PI / 2, Math.acos(.01), Math.acos(.0100000001), Math.acos(.0099999999), Math.PI, 1e-30, Infinity, NaN];
  const digest = createHash('sha256');
  for (let i = 0; i < 2200; i++) {
    const p = i === 2199 ? [] : profiles[i % profiles.length].profile;
    const pitch = i < edges.length ? edges[i] : (rand() - .5) * 7;
    const roll = i < edges.length ? edges[edges.length - 1 - i] : (rand() - .5) * 7;
    const args = [p, (rand() - .5) * 30000, (rand() - .5) * 2000, (rand() - .5) * 30000,
      (rand() - .5) * 100, pitch, roll, (rand() - .5) * 60, (rand() - .5) * 60];
    B.writeSfVehicleBody(b, ...args); A.writeSfVehicleBody(a, ...args);
    assert.deepEqual(a, b, `exact body/slice fields at ${i}`);
    const parts = a.crashProfile, first = parts[0];
    A.writeSfVehicleBody(a, ...args); assert.equal(a.crashProfile, parts); if (first) assert.equal(parts[0], first);
    assert.deepEqual(a, b); digest.update(JSON.stringify(a)); cases++;
  }
  t.diagnostic(JSON.stringify({ cases, profileKinds: profiles.map(p => [p.kind, p.profile.length]), semanticSHA256: digest.digest('hex') }));
});
baselineTest('traffic allocation: exact source-operation reductions are counted independently of profiler/timing', t => {
  const results = [];
  for (const name of ['baseline', 'candidate']) {
    let absCalls = 0, profileIterators = 0;
    const math = Object.create(Math); math.abs = x => { absCalls++; return Math.abs(x); };
    const source = name === 'baseline' ? baseline : current, api = dynamic(source['sf-dynamic-bodies'], name, math);
    const p = Array.from({ length: 24 }, (_, i) => ({ z: (i - 11.5) * .5, halfWidthMetres: 1.3, halfLengthMetres: .25, minY: 0, maxY: 3 }));
    p[Symbol.iterator] = function () { profileIterators++; return Array.prototype[Symbol.iterator].call(this); };
    api.writeSfVehicleBody({}, p, 0, 30, 0, .43, -.4, .07, 3, -4);
    const upright = { absCalls, profileIterators }; absCalls = profileIterators = 0;
    api.writeSfVehicleBody({}, p, 0, 30, 0, .43, Math.PI / 2, 0, 3, -4);
    const fallback = { absCalls, profileIterators };
    results.push({ name, slices: p.length, upright, fallback });
  }
  assert.deepEqual(results.map(r => r.upright), [{ absCalls: 241, profileIterators: 1 }, { absCalls: 56, profileIterators: 0 }]);
  assert.deepEqual(results.map(r => r.fallback), [{ absCalls: 337, profileIterators: 1 }, { absCalls: 80, profileIterators: 0 }]);
  t.diagnostic(JSON.stringify({ results, scope: 'executed source-operation counts, not V8 allocated bytes; counters outside timed/profiled windows' }));
});
baselineTest('traffic allocation: city/highway rebuilds remove iterator entry points while visiting every admitted actor in source order', t => {
  const results = [];
  for (const name of ['baseline', 'candidate']) {
    const source = name === 'baseline' ? baseline.traffic : current.traffic;
    const functions = [...source.matchAll(/  function rebuildBodies\(\) \{[^]*?\n  \}/g)].map(m => m[0]); assert.equal(functions.length, 2);
    let iterators = 0, snapshots = 0, locates = 0, epoch = 0; const seen = [];
    const track = list => { list[Symbol.iterator] = function () { iterators++; return Array.prototype[Symbol.iterator].call(this); }; return list; };
    const vehicles = track(Array.from({ length: 9 }, (_, i) => ({ edge: i !== 3, disabled: i === 6, id: `v${i}` })));
    const peds = track(Array.from({ length: 7 }, (_, i) => ({ placed: i !== 4, x: i * .7, z: i * .3, ux: .2, uz: .98, dir: i % 2 ? -1 : 1,
      bodyScale: .9 + i * .02, bodyGirth: 1.1, velocityX: i * .11, velocityZ: -i * .03, dynamicBody: { id: `p${i}` } })));
    const cars = track(Array.from({ length: 11 }, (_, i) => ({ id: `h${i}` })));
    const bodyIndex = { begin() { seen.push('begin'); }, add(b) { seen.push(b.id); }, commit() { seen.push('commit'); epoch++; } };
    const city = new Function('bodyIndex', 'vehicles', 'peds', 'snapshotVehicle', 'pedGround', functions[0] + '\nreturn rebuildBodies;')(
      bodyIndex, vehicles, peds, v => { snapshots++; return v; }, (p, x, z) => x * .2 + z * .3);
    const highway = new Function('bodyIndex', 'cars', 'locateCar', functions[1] + '\nreturn rebuildBodies;')(bodyIndex, cars, c => { locates++; return c; });
    city(); highway();
    results.push({ name, iterators, snapshots, locates, epoch, seen, bodies: Array.from(peds, p => ({ ...p.dynamicBody })) });
  }
  assert.equal(results[0].iterators, 3); assert.equal(results[1].iterators, 0);
  assert.deepEqual({ ...results[1], name: '', iterators: 0 }, { ...results[0], name: '', iterators: 0 });
  t.diagnostic(JSON.stringify({ baselineIteratorsPerCityAndHighwayRebuild: results[0].iterators, candidate: results[1].iterators,
    admittedVehicles: results[1].snapshots, placedPeds: 6, allHighwayCars: results[1].locates }));
});
const bodyFacts = body => ({ ...body, crashProfile: body.crashProfile ? Array.from(body.crashProfile, part => ({ ...part })) : undefined, source: undefined, onEucImpact: undefined });
function queries(a, b, bodiesA, bodiesB, points) {
  const idsA = new Map(bodiesA.map((body, i) => [body, i])), idsB = new Map(bodiesB.map((body, i) => [body, i]));
  for (const [x, z, radius] of points) {
    const left = ['caller prefix'], right = ['caller prefix'];
    a.dynamicBodiesNear(x, z, radius, left); b.dynamicBodiesNear(x, z, radius, right);
    assert.equal(left[0], 'caller prefix'); assert.equal(right[0], 'caller prefix');
    assert.deepEqual(left.slice(1).map(body => idsA.get(body)), right.slice(1).map(body => idsB.get(body)), 'ordered exact broadphase/hull results');
    assert.deepEqual({ ...a.bodyQueryStats }, { ...b.bodyQueryStats });
  }
}
baselineTest('traffic allocation: posed broadphase extents, boundary/radius queries and append/order semantics match across moving epochs', () => {
  const a = A.createSfDynamicBodyIndex(), b = B.createSfDynamicBodyIndex();
  const left = bodies(), right = bodies();
  const adapt = index => ({ dynamicBodiesNear: index.dynamicBodiesNear, bodyQueryStats: index.stats });
  for (let frame = 0; frame < 25; frame++) {
    a.begin(); b.begin();
    for (let i = 0; i < left.length; i++) {
      const args = [profile, (i % 16 - 8) * 16 + frame * .07, 30 + i * .03, (Math.floor(i / 16) - 8) * 16 - frame * .11,
        i * .027, Math.sin(i + frame * .01) * .6, Math.cos(i * .1) * .1, 3.17, -4.23];
      A.writeSfVehicleBody(left[i], ...args); B.writeSfVehicleBody(right[i], ...args); a.add(left[i]); b.add(right[i]);
    }
    a.commit(); b.commit(); assert.equal(a.bodyVersion(), b.bodyVersion());
    const points = [[0, 0, 0], [16, -16, 16], [-16, 16, 32], [NaN, 0, 2], [0, 0, -1], [0, 0, Infinity]];
    for (let i = 0; i < left.length; i += 11) {
      const body = left[i], s = Math.sin(body.headingY), c = Math.cos(body.headingY);
      points.push([body.x + s * body.halfLengthMetres, body.z + c * body.halfLengthMetres, 0],
        [body.x + c * (body.halfWidthMetres + .1), body.z - s * (body.halfWidthMetres + .1), .1]);
    }
    queries(adapt(a), adapt(b), left, right, points);
  }
});
const scalarOwn = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value === null || !['object', 'function'].includes(typeof value)));
function actorFacts(actor) {
  return { ...scalarOwn(actor), edge: actor.edge?.id, next: actor.next?.id, out: actor.out, moveTo: actor.move?.to?.id,
    turn: actor.move?.turn, conn: !!actor.conn, trail: !!actor.trail, commit: !!actor.commit, node: actor.node?.id,
    body: bodyFacts(actor.dynamicBody) };
}
function cityFacts(system) {
  return { vehicles: [...system.cars, ...system.buses].map(actorFacts), walkers: Array.from(system.peds, actorFacts),
    nodes: Array.from(system.network.nodes, node => [Array.from(node.box), Array.from(node.crossing)]), bodyVersion: system.bodyVersion() };
}
baselineTest('traffic allocation: seeded city replay retains every actor body, lane/signal/walker decision, respawns, reactions and density epochs', t => {
  const variants = [baseline, current].map(source => loadTraffic({ seed: 621, actors,
    trafficSource: source.traffic, dynamicSource: source['sf-dynamic-bodies'] }));
  const systems = variants.map(v => v.system); let elapsed = 0, checks = 0;
  for (let frame = 0; frame < 420; frame++) {
    const dt = [1 / 120, 1 / 60, .05, 0][frame % 4]; elapsed += dt;
    const focus = frame < 140 ? { x: -330 + frame * .03, y: 0, z: -560 } : frame < 280 ? { x: -620, y: 0, z: -240 } : { x: -330, y: 0, z: -560 };
    for (let i = 0; i < systems.length; i++) {
      const system = systems[i], v = system.cars.find(car => car.edge);
      if (frame === 80) { const p = system.peds.find(p => p.placed); p.dynamicBody.onEucImpact.call(p.dynamicBody, 4, .4, -.8); }
      if (frame === 310) system.setDensity(.5);
      if (frame === 330) system.setDensity(1);
      const entity = frame > 20 && frame < 60 && v ? { position: { x: v.x, y: v.y, z: v.z + 3 }, heading: v.yaw, speed: 1.4,
        hull: { halfWidthMetres: .4, halfLengthMetres: .6, heightMetres: 1.9 } } : null;
      system.update(dt, elapsed, focus, entity);
    }
    if (frame % 7 === 0 || frame === 419) {
      assert.deepEqual(cityFacts(systems[1]), cityFacts(systems[0]), `city frame ${frame}`); checks++;
      const sourceBodies = systems.map(system => [...system.cars, ...system.buses, ...system.peds].map(actor => actor.dynamicBody));
      const v = systems[0].cars.find(car => car.edge);
      queries(systems[1], systems[0], sourceBodies[1], sourceBodies[0], [[focus.x, focus.z, 30], [v.x, v.z, 2], [v.x + 16, v.z - 16, 20]]);
    }
  }
  t.diagnostic(JSON.stringify({ frames: 420, semanticCheckpoints: checks, fleet: systems[0].cars.length + systems[0].buses.length,
    walkers: systems[0].peds.length, semanticSHA256: hash(JSON.stringify(cityFacts(systems[1]))) }));
});
function lanes() {
  return [0, 1, 2].map(n => ({ speed: 9 + n * 3, pts: Array.from({ length: 101 }, (_, i) => new THREE.Vector3(
    n * 500 + Math.sin(i / 12) * 35, 30 + n * 20 + i * .7 + Math.sin(i / 15) * 15, i * 20)) }));
}
baselineTest('traffic allocation: seeded curved/graded highway replay preserves all poses, velocity, dip/wrap/leader decisions and broadphase', t => {
  const systems = [baseline, current].map(source => {
    const { NYC } = loadTraffic({ seed: 9127, actors, trafficSource: source.traffic, dynamicSource: source['sf-dynamic-bodies'] });
    return NYC.createHighwayTraffic(new THREE.Scene(), lanes());
  });
  let wraps = 0;
  for (let frame = 0; frame < 640; frame++) {
    const dt = frame % 17 === 0 ? 0 : .05;
    for (const system of systems) {
      const previous = system.cars[0].u;
      const target = system.cars[10];
      const entity = frame < 40 ? { position: { x: target.x, y: target.y, z: target.z + 2 }, heading: target.yaw, speed: 0,
        hull: { halfWidthMetres: .47, halfLengthMetres: .61, heightMetres: 2.03 } } : null;
      if (frame === 100) { system.cars[0].u = system.cars[0].lane.len - .01; system.cars[0].seg = system.cars[0].lane.cum.length - 2; }
      system.update(dt, null, entity, 'euc'); if (system === systems[1] && system.cars[0].u < previous) wraps++;
    }
    assert.deepEqual(Array.from(systems[1].cars, actorFacts), Array.from(systems[0].cars, actorFacts), `highway frame ${frame}`);
    if (frame % 9 === 0) {
      const bodiesA = systems[1].cars.map(car => car.dynamicBody), bodiesB = systems[0].cars.map(car => car.dynamicBody);
      const c = systems[0].cars[10]; queries(systems[1], systems[0], bodiesA, bodiesB, [[c.x, c.z, 0], [c.x + 10, c.z + 10, 25], [-100, -100, 100]]);
    }
  }
  assert.ok(wraps > 0);
  t.diagnostic(JSON.stringify({ frames: 640, cars: systems[0].cars.length, wraps, semanticSHA256: hash(JSON.stringify(systems[1].cars.map(actorFacts))) }));
});
const profile = Array.from({ length: 12 }, (_, i) => ({ z: (i - 5.5) * .5, halfWidthMetres: .8 + (i % 3) * .11,
  halfLengthMetres: .25, minY: .03 + i * .007, maxY: 1.5 + (i % 4) * .04 }));
function initializedBody() {
  return { x: 0, z: 0, headingY: 0, minY: 0, maxY: 0, velocityX: 0, velocityZ: 0, kind: 'vehicle',
    crashPitch: 0, crashRoll: 0, crashProfile: [], halfLengthMetres: 0, halfWidthMetres: 0 };
}
const bodies = (initialized = false) => Array.from({ length: 256 }, () => initialized ? initializedBody() : {});
function writers(api, list, rounds) {
  for (let frame = 0; frame < rounds; frame++) for (let i = 0; i < list.length; i++) {
    api.writeSfVehicleBody(list[i], profile, i * 7.37 + frame * .03, 30 + i * .01, i * 11.11 - frame * .02,
      i * .027 + frame * .0001, Math.sin(i + frame * .01) * .6, Math.cos(i * .1 + frame * .01) * .1, 3.17, -4.23);
  }
}
const post = (session, method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
async function sample(run) {
  const session = new Session(); session.connect();
  try {
    await post(session, 'HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const start = performance.now(); run(); const ms = performance.now() - start;
    const { profile } = await post(session, 'HeapProfiler.stopSampling');
    const rows = new Map(); let totalBytes = 0;
    function visit(node) {
      const f = node.callFrame;
      totalBytes += node.selfSize;
      if (f.url.startsWith('traffic-allocation-') || ['writeSfVehicleBody', 'rebuildBodies', 'locateCar', 'add', 'begin', 'snapshotVehicle'].includes(f.functionName)) {
        const key = `${f.functionName}@${f.url}:${f.lineNumber + 1}`;
        rows.set(key, (rows.get(key) || 0) + node.selfSize);
      }
      for (const child of node.children || []) visit(child);
    }
    visit(profile.head);
    return { ms, totalBytes, sourceBytes: [...rows.values()].reduce((a, b) => a + b, 0), rows: [...rows].sort((a, b) => b[1] - a[1]).slice(0, 12), samples: profile.samples.length };
  } finally { session.disconnect(); }
}

baselineTest('traffic allocation diagnostic: compare stable full records with dynamically extended records', { skip: process.env.SF_TRAFFIC_ALLOC_BENCH !== '1' }, async t => {
  const sparse = bodies(), ready = bodies(true);
  writers(B, sparse, 64); writers(B, ready, 64);
  const samples = [];
  for (let round = 0; round < 4; round++) for (const readyFirst of round % 2 ? [true, false] : [false, true]) {
    samples.push({ round, initialized: readyFirst, ...await sample(() => writers(B, readyFirst ? ready : sparse, 256)) });
  }
  t.diagnostic(JSON.stringify({ node: process.version, baselineSHA256: hash(baseline['sf-dynamic-bodies']), samples,
    scope: 'Node sampled JS allocation estimate (collected objects included), not retained/typed/GPU/process memory; profiler-affected timing on concurrently used host' }));
});

baselineTest('traffic allocation diagnostic: integrated city update with real vehicle profiles', { skip: process.env.SF_TRAFFIC_ALLOC_BENCH !== '1' }, async t => {
  const variants = process.env.SF_TRAFFIC_EXPERIMENTS === '1' ? [baseline, current, { traffic: recordTraffic, 'sf-dynamic-bodies': recordDynamic }] : [baseline, current];
  const samples = [];
  for (let round = 0; round < 2; round++) for (const k of round % 2 ? variants.map((_, i) => i).reverse() : variants.map((_, i) => i)) {
    const { system } = loadTraffic({ seed: 9127, actors, trafficSource: variants[k].traffic + `\n//# sourceURL=traffic-allocation-city-${k}.js`,
      dynamicSource: variants[k]['sf-dynamic-bodies'] + `\n//# sourceURL=traffic-allocation-body-${k}.js` });
    let frame = 0;
    const run = count => { for (let i = 0; i < count; i++) { frame++; system.update(1 / 60, frame / 60, { x: -330 + frame * .003, y: 0, z: -560 }); } };
    run(30); samples.push({ round, variant: k, ...await sample(() => run(120)) });
  }
  t.diagnostic(JSON.stringify({ samples, scope: 'actual seeded city simulation/real vehicle geometry profiles; 60+6 vehicles/340 walkers; headless, gait/material stubs; Node contextified VM, name-attributed sites where inspector omits URLs; not browser/idle throughput' }));
});

baselineTest('traffic allocation diagnostic: integrated highway update with real profiles and all logical cars', { skip: process.env.SF_TRAFFIC_ALLOC_BENCH !== '1' }, async t => {
  const variants = [baseline, current], samples = [];
  for (let round = 0; round < 2; round++) for (const k of round % 2 ? [1, 0] : [0, 1]) {
    const { NYC } = loadTraffic({ seed: 9127, actors, trafficSource: variants[k].traffic, dynamicSource: variants[k]['sf-dynamic-bodies'] });
    const system = NYC.createHighwayTraffic(new THREE.Scene(), lanes());
    const run = count => { for (let i = 0; i < count; i++) system.update(1 / 60, null, null, 'euc'); };
    run(30); samples.push({ round, variant: k, cars: system.cars.length, ...await sample(() => run(240)) });
  }
  t.diagnostic(JSON.stringify({ samples, scope: 'all120 logical highway actors, actual graded/curved lanes and profiles; Node contextified VM, no drawing; same sampled-allocation and host-load limits as city' }));
});
