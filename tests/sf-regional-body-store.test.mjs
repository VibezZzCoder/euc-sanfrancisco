// Frozen e5753c8 differential; no renderer/device. Full corpus and GC/cost rounds are opt-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { SfTerrainSampler, FrozenSampler, baselineAvailable, ROOT, REF, sourceHashes,
  original, read, registry, regionalBodies, same, options, pointsFor, probe, cacheCounts } from './helpers/sf-regional-body-fixture.mjs';
import { EucController } from '../js/euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from '../js/euc/input/actions.js';
const skip = !baselineAvailable && 'private e5753c8 baseline unavailable';

function small(variant = 'candidate', count = 600) {
  const f = registry(variant); f.c.count = count;
  vm.runInContext(`{
    const R=window.NYC.RideGeometry, box=R.addRegionalBox||R.addBox, prism=R.addRegionalPrism||R.addPrism;
    for(let i=0;i<count;i++){
      box({x:(i%30)*12,y:11+i%7,z:Math.floor(i/30)*12},{x:.5+i%3,y:.7+i%2,z:.2+i%5},i%7?i*.133:-0);
      const x=(i%30)*12,z=1000+Math.floor(i/30)*12;
      prism(Array.from({length:8},(_,k)=>({x:x+Math.sin(k*Math.PI/4)*.3,z:z+Math.cos(k*Math.PI/4)*.3})),10,14);
    }
  }`, f.c);
  return f;
}
function make(variant, f, extra = {}) {
  return new (variant === 'baseline' ? FrozenSampler : SfTerrainSampler)(options({ ride: f.N.ride, ...extra }));
}

test('region drawing source is byte-identical except the two ownership-proven registration callees', { skip }, () => {
  const candidate = read('js/region.js').toString();
  assert.equal(candidate.split('ride?.addRegionalBox(').length, 2);
  assert.equal(candidate.split('ride?.addRegionalPrism(').length, 2);
  assert.equal(candidate.replace('ride?.addRegionalBox(', 'ride?.addBox(').replace('ride?.addRegionalPrism(', 'ride?.addPrism('), original('js/region.js'));
});

test('default construction is non-consuming; successful handoff packs only region-owned unshared identities', { skip }, () => {
  const f = small('candidate', 12), R = f.N.RideGeometry, ride = f.N.ride;
  const rawBox = R.addBox({ x: -8, y: 11, z: 0 }, { x: 1, y: 1, z: 1 });
  const rawPrism = R.addPrism([{ x: -12, z: 0 }, { x: -10, z: 0 }, { x: -10, z: 2 }, { x: -12, z: 2 }], 10, 13);
  const sharedBox = ride.solids[2], sharedPrism = ride.prisms[2];
  const heldInputBox = ride.solids[0], heldInputPrism = ride.prisms[0];
  const s = make('candidate', f, { colliders: [sharedBox, sharedPrism], boxes: [rawBox], prisms: [rawPrism] });
  assert.equal(s.boxRecords[0].collider, sharedBox); assert.equal(s.prisms[0].source, sharedPrism);
  const ids = { box: s.boxStore.sources.indexOf(heldInputBox), prism: s.prisms.findIndex(p => p.source === heldInputPrism) };
  const heldBox = s.boxRecords[ids.box], heldPrism = s.prisms[ids.prism];
  assert.equal(ride.solids.length, 13); assert.equal(ride.prisms.length, 13);
  assert.equal(s.boxStore.regionalValues, null); assert.equal(s.prismStore, undefined);
  assert.equal(heldBox.collider, heldInputBox); assert.equal(heldPrism.source, heldInputPrism);
  assert.ok(ride.solids.every(b => b.centre && b.halfExtents), 'finalization can still scan ordinary source boxes');
  assert.equal(s.releaseConstructionRegistry(ride), true); assert.equal(s.releaseConstructionRegistry(ride), false);
  assert.equal(s.stats.staticBoxStore.regionalBoxes, 11); assert.equal(s.stats.regionalPrismStore.regionalPrisms, 11);
  assert.equal(s.boxRecords[0].collider, sharedBox); assert.equal(s.prisms[0].source, sharedPrism);
  assert.equal(s.boxStore.sources.find(c => c === rawBox), rawBox); assert.equal(s.prisms.find(p => p.source === rawPrism).source, rawPrism);
  assert.notEqual(s.boxRecords[ids.box].collider, heldInputBox); assert.notEqual(s.prisms[ids.prism].source, heldInputPrism);
  same(heldBox, s.boxRecords[ids.box]); same(heldPrism, s.prisms[ids.prism]);
  assert.equal(heldBox.collider, heldInputBox); assert.equal(heldPrism.source, heldInputPrism);
  assert.ok(!Object.isFrozen(heldInputBox) && !Object.isFrozen(heldInputPrism.outer), 'never freeze or overwrite escaped originals');
  assert.equal(s.native.colliders, s.boxRecords); assert.equal(s.prismIndex.items, s.prismStore);
  assert.ok(s.boxStore.cache.size <= 256);
  assert.equal(ride.solids.length, 0); assert.equal(ride.prisms.length, 0);
  assert.equal(ride.regionalBodies, undefined); assert.equal(s._registryHandoff.regional, null); assert.equal(s._registryHandoff.excluded, null);
});

test('metadata/prototype/accessor/shape changes decline transfer; rejected handoff leaves sources intact', { skip }, () => {
  const f = small('candidate', 8), ride = f.N.ride;
  ride.solids[0].annotation = { live: true }; ride.solids[1].support = true;
  Object.defineProperty(ride.solids[2].centre, 'x', { get: () => 24, enumerable: true });
  Object.setPrototypeOf(ride.solids[3], { diagnostic: true });
  ride.prisms[0].outer[0].annotation = 'keep'; ride.prisms[1].holes = [];
  ride.prisms[2].outer.tag = true; ride.prisms[3].surface = 'wood';
  const boxes = ride.solids.slice(0, 4), prisms = ride.prisms.slice(0, 4), s = make('candidate', f);
  ride.solids.push(boxes[0]); assert.throws(() => s.releaseConstructionRegistry(ride), /changed/); ride.solids.pop();
  assert.equal(s.boxStore.regionalValues, null); assert.equal(s.prismStore, undefined);
  s.releaseConstructionRegistry(ride);
  assert.equal(s.stats.staticBoxStore.regionalBoxes, 4); assert.equal(s.stats.regionalPrismStore.regionalPrisms, 4);
  for (let i = 0; i < 4; i++) { assert.equal(s.boxRecords[i].collider, boxes[i]); assert.equal(s.prisms[i].source, prisms[i]); }
});

test('GC ownership: default sources stay live, transferred graphs retire, held escaped originals remain valid',
  { skip: skip || typeof global.gc !== 'function' && 'run with --expose-gc' }, async () => {
    function build(transfer) {
      const f = small('candidate', 600), s = make('candidate', f);
      const box = s.boxRecords[1].collider, p = s.prisms[1];
      const weak = [box, box.centre, box.halfExtents, p, p.source, p.outer, p.outer[0]].map(o => new WeakRef(o));
      const held = { box: s.boxRecords[0], prism: s.prisms[0] };
      if (transfer) s.releaseConstructionRegistry(f.N.ride);
      return { s, weak, held };
    }
    const ordinary = build(false), transferred = build(true);
    for (let i = 0; i < 4; i++) { await new Promise(setImmediate); global.gc(); }
    assert.ok(ordinary.weak.every(w => w.deref()), 'non-consuming sampler owns the original sources');
    assert.ok(transferred.weak.every(w => w.deref() === undefined), 'no hidden Proxy/index/certificate source owner');
    same(transferred.held.box, transferred.s.boxRecords[0]); same(transferred.held.prism, transferred.s.prisms[0]);
    assert.equal(transferred.held.prism.source.outer[0].x, 0);
    assert.equal(ordinary.s.boxRecords.length, 600);
  });

test('exact Float64 source/prepared fields, signed zero, array reflection and held views survive eviction', { skip }, () => {
  const a = small('baseline'), b = small();
  for (const f of [a, b]) vm.runInContext(`{
    const r=window.NYC.ride;
    r.solids[0].centre.x=-0;r.solids[0].centre.y=-0;r.solids[0].centre.z=-0;r.solids[0].rotationY=-0;
    r.solids[1].centre.x=2**29+.123456789;r.solids[1].halfExtents.z=.12345678912345;
    r.prisms[0].minY=-0;r.prisms[0].outer[0].x=-0;
    r.prisms[1].outer.forEach(p=>{p.x+=2**29+.123456789;p.z-=2**28+.23456789;});
  }`, f.c);
  const x = make('baseline', a), y = make('candidate', b); x.releaseConstructionRegistry(a.N.ride); y.releaseConstructionRegistry(b.N.ride);
  const heldBox = y.boxRecords[0], heldPrism = y.prisms[0];
  for (let i = 0; i < 600; i++) { same(x.boxRecords[i], y.boxRecords[i], `box ${i}`); same(x.prisms[i], y.prisms[i], `prism ${i}`); }
  same(heldBox, x.boxRecords[0]); same(heldPrism, x.prisms[0]);
  assert.notEqual(y.boxRecords[0], heldBox); assert.notEqual(y.prisms[0], heldPrism);
  assert.equal(y.boxStore.sources[0], y.boxRecords[0].collider);
  assert.ok(Array.isArray(y.prisms) && Array.isArray(y.boxStore.sources));
  assert.equal(Object.keys(y.prisms).length, 600);
  assert.equal(Object.getOwnPropertyDescriptor(y.prisms, '0').value, y.prisms[0]);
  assert.equal(y.prisms.at(-1).id, 599); assert.equal(y.prisms.filter(p => p.id < 2).length, 2);
  assert.throws(() => y.prisms.push(heldPrism), TypeError); assert.throws(() => { y.boxStore.sources[0] = heldBox.collider; }, TypeError);
  assert.equal(y.prismStore.cache.size, 256); assert.equal(y.boxStore.cache.size, 256);
});

test('native ray/limb history, stable contact IDs, pre-handoff contacts and escaped contact objects are exact', { skip }, () => {
  const a = small('baseline'), b = small(), points = pointsFor(a.N.ride, 600);
  const x = make('baseline', a), y = make('candidate', b);
  same(probe(x, points[1], 1), probe(y, points[1], 1), 'before handoff');
  const held = y.prisms[0], heldPiece = held.contactPieces[0], heldPlanes = structuredClone(heldPiece.planes);
  const oldContactId = heldPiece.contactId;
  x.releaseConstructionRegistry(a.N.ride); y.releaseConstructionRegistry(b.N.ride);
  for (let i = 0; i < points.length; i++) same(probe(x, points[i], i), probe(y, points[i], i), `query ${i}`);
  const issued = y._nextContactId;
  for (let i = points.length - 1; i >= 0; i--) same(probe(x, points[i], i), probe(y, points[i], i), `return ${i}`);
  assert.equal(y._nextContactId, issued); assert.equal(y._nextContactId, x._nextContactId);
  assert.equal(y.prisms[0].contactPieces[0].contactId, oldContactId);
  assert.equal(heldPiece.contactId, oldContactId); same(heldPiece.planes, heldPlanes);
  assert.notEqual(y.prisms[0], held); assert.notEqual(y.prisms[0].contactPieces[0], heldPiece);
  assert.equal(y.prismStore.cache.size, 256);
  const counts = cacheCounts(y); assert.ok(counts.edges <= 256 * 8); assert.ok(counts.pieces <= 256 * 8);
});

test('native controller riding/crash/reset, checked placement and recovery retain exact outputs', { skip }, () => {
  for (const shape of ['box', 'prism']) {
    const a = small('baseline', 1), b = small('candidate', 1);
    for (const f of [a, b]) vm.runInContext(`{
      const r=window.NYC.ride;
      if('${shape}'==='box'){r.prisms.length=0;Object.assign(r.solids[0].centre,{x:0,y:11,z:8});Object.assign(r.solids[0].halfExtents,{x:3,y:1,z:.05});}
      else{r.solids.length=0;r.prisms[0].outer.forEach(p=>{p.x*=6;p.z-=992;});}
    }`, f.c);
    const x = make('baseline', a), y = make('candidate', b); x.releaseConstructionRegistry(a.N.ride); y.releaseConstructionRegistry(b.N.ride);
    const makeController = s => new EucController(s, { spawn: { position: { x: 0, y: 10, z: 0 }, headingY: 0 } });
    const ca = makeController(x), cb = makeController(y); let crashed = false;
    for (let i = 0; i < 1440; i++) {
      const actions = { ...NEUTRAL_ACTIONS, throttle: i < 720 ? .5 : 0, reset: i === 960 };
      ca.step(1 / 120, actions); cb.step(1 / 120, actions); crashed ||= ca.crashed;
      same(ca.snapshot(), cb.snapshot(), `${shape} step ${i}`);
    }
    assert.ok(crashed, `${shape} fixture must reach the body`);
    for (const px of [-4, 0, 4]) {
      same(x.findPlacementTarget({ x: px, z: 8, referenceY: 10 }), y.findPlacementTarget({ x: px, z: 8, referenceY: 10 }), 'placement');
      const q = { fallen: { x: px, y: 10, z: 8 }, safePoints: [{ x: -4, y: 10, z: 0 }], headingY: 0 };
      same(x.findRecoveryTarget(q, () => true), y.findRecoveryTarget(q, () => true), 'recovery');
    }
  }
});

test('full committed regional corpus: all source/prepared data, indexes and 1024 native multi-query probes',
  { skip: skip || process.env.SF_REGIONAL_BODY_FULL !== '1', timeout: 120000 }, t => {
    const a = regionalBodies('baseline'), b = regionalBodies('candidate'), points = pointsFor(a.ride, 512);
    assert.equal(a.dataHash, b.dataHash); assert.equal(a.files, 87);
    for (let i = 0; i < a.boxes; i++) same(a.ride.solids[i], b.ride.solids[i], `source box ${i}`);
    for (let i = 0; i < a.prisms; i++) same(a.ride.prisms[i], b.ride.prisms[i], `source prism ${i}`);
    const x = new FrozenSampler(options({ ride: a.ride })), y = new SfTerrainSampler(options({ ride: b.ride }));
    same(x.stats, y.stats, 'before handoff stats');
    x.releaseConstructionRegistry(a.ride); y.releaseConstructionRegistry(b.ride);
    assert.equal(y.boxStore.cache.size, 0); assert.equal(y.prismStore.cache.size, 0);
    assert.equal(y.stats.staticBoxStore.regionalBoxes, a.boxes); assert.equal(y.stats.regionalPrismStore.regionalPrisms, a.prisms);
    for (let i = 0; i < a.boxes; i++) same(x.boxRecords[i], y.boxRecords[i], `prepared box ${i}`);
    for (let i = 0; i < a.prisms; i++) same(x.prisms[i], y.prisms[i], `prepared prism ${i}`);
    for (const key of ['boxIndex', 'prismIndex']) {
      same(x[key].stats, y[key].stats, key);
      for (let l = 0; l < x[key].levels.length; l++) {
        const p = x[key].levels[l], q = y[key].levels[l]; if (!p) { assert.equal(q, p); continue; }
        same([...p.grid], [...q.grid], `${key} grid`); same(p.starts, q.starts, `${key} starts`); same(p.items, q.items, `${key} items`);
      }
    }
    for (let i = 0; i < points.length; i++) same(probe(x, points[i], i), probe(y, points[i], i), `full query ${i}`);
    for (let i = points.length - 1; i >= 0; i -= 7) same(probe(x, points[i], i), probe(y, points[i], i), `full return ${i}`);
    assert.ok(y.prismStore.cache.size <= 256); assert.equal(y._nextContactId, x._nextContactId);
    t.diagnostic(JSON.stringify({ ref: REF, sourceHashes, dataHash: a.dataHash, files: a.files, boxes: a.boxes, prisms: a.prisms,
      probes: points.length, stats: { boxes: y.boxStore.stats, prisms: y.prismStore.stats }, cache: cacheCounts(y) }));
  });

test('optional separate-process actual candidate retention, bounded query history and query-cost measurement',
  { skip: skip || process.env.SF_REGIONAL_BODY_MEASURE !== '1', timeout: 240000 }, t => {
    const reports = ['baseline', 'candidate'].map(variant => JSON.parse(execFileSync(process.execPath,
      ['--max-old-space-size=4096', '--expose-gc', new URL('./helpers/sf-regional-body-fixture.mjs', import.meta.url).pathname, '--measure', variant],
      { cwd: ROOT, encoding: 'utf8', timeout: 110000, maxBuffer: 128 * 1024 })));
    const [a, b] = reports; same(a.fixture, b.fixture);
    for (const type of ['box', 'prism']) for (const regime of ['scattered', 'repeated'])
      same(a.timing[type][regime].map(v => v.checksum), b.timing[type][regime].map(v => v.checksum), `${type} ${regime} checksums`);
    assert.equal(b.historyCache.nextContactId, a.historyCache.nextContactId); assert.equal(b.returnCache.nextContactId, a.returnCache.nextContactId);
    assert.ok(b.historyCache.cachedPrisms <= 256 && b.returnCache.cachedPrisms <= 256);
    const deltas = Object.fromEntries(['retained', 'afterHistory', 'afterReturn'].map(k => [k, {
      heapSaved: a[k].heapUsed - b[k].heapUsed, backingAdded: b[k].arrayBuffers - a[k].arrayBuffers,
      netSaved: a[k].heapUsed + a[k].arrayBuffers - b[k].heapUsed - b[k].arrayBuffers }]));
    t.diagnostic(JSON.stringify({ reports, deltas }, null, 2));
  });
