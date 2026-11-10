// Differential rejection contract against the pre-follow-up descriptor validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash, read } from './helpers/sf-regional-body-fixture.mjs';
import { validators, BEFORE_VALIDATION, CANDIDATE_VALIDATION, storeSource } from './helpers/sf-body-validation-fixture.mjs';
const before = await validators('before'), candidate = await validators('candidate');

function fixture(kind, prototype = Object.prototype) {
  const obj = fields => Object.setPrototypeOf(fields, prototype);
  const owner = { boxes: new WeakSet(), prisms: new WeakSet(), objectPrototype: prototype, arrayPrototype: Array.prototype }, excluded = new WeakSet();
  const c = kind === 'box' ? obj({ centre: obj({ x: -0, y: 11, z: 2 ** 29 + .123456789 }),
    halfExtents: obj({ x: .12345678912345, y: 1, z: 2 }), rotationY: -0, surface: 'pavement', support: false })
    : obj({ outer: Array.from({ length: 8 }, (_, i) => obj({ x: Math.sin(i * Math.PI / 4), z: Math.cos(i * Math.PI / 4) })),
      minY: -0, maxY: 12, surface: 'pavement', support: false });
  owner[kind === 'box' ? 'boxes' : 'prisms'].add(c);
  const record = kind === 'box' ? c : { source: c, outer: c.outer, holes: undefined, minY: c.minY, maxY: c.maxY,
    surface: c.surface, support: false, occludes: undefined };
  const fields = Object.keys(c).map(k => [c, k, `body.${k}`]);
  const objects = [[c, 'body']];
  if (kind === 'box') for (const k of ['centre', 'halfExtents']) {
    objects.push([c[k], k]); for (const axis of ['x', 'y', 'z']) fields.push([c[k], axis, `${k}.${axis}`]);
  } else {
    objects.push([c.outer, 'ring']);
    for (let i = 0; i < 8; i++) {
      fields.push([c.outer, String(i), `ring.${i}`]); objects.push([c.outer[i], `point.${i}`]);
      for (const axis of ['x', 'z']) fields.push([c.outer[i], axis, `point.${i}.${axis}`]);
    }
  }
  const method = kind === 'box' ? 'regionalBox' : 'regionalPrism';
  return { c, owner, excluded, record, fields, objects,
    check(expected, label) {
      const a = before[method](record, owner, excluded), b = candidate[method](record, owner, excluded);
      assert.equal(a, expected, `baseline ${label}`); assert.equal(b, a, `candidate ${label}`);
    } };
}

test('every required field rejects getters, setters and both-undefined accessors without invoking user code', t => {
  let cases = 0, calls = 0;
  const unexpected = () => { calls++; throw Error('accessor must not run'); };
  const descriptors = [
    { get: unexpected, set: undefined }, { get: undefined, set: unexpected },
    { get: unexpected, set: unexpected }, { get: undefined, set: undefined }
  ];
  for (const kind of ['box', 'prism']) {
    const count = fixture(kind).fields.length;
    for (let i = 0; i < count; i++) for (const desc of descriptors) {
      const f = fixture(kind), [o, key, label] = f.fields[i];
      const stores = kind === 'box' ? [new before.SfStaticBoxStore([f.c]), new candidate.SfStaticBoxStore([f.c])] : null;
      Object.defineProperty(o, key, { ...desc, configurable: true, enumerable: true });
      f.check(false, `${kind}.${label}`); cases++;
      if (stores) for (const s of stores) assert.equal(s.prepareRegionalHandoff(f.owner, f.excluded), null, 'public box preparation rejects');
      else for (const module of [before, candidate]) assert.equal(module.SfRegionalPrismStore.prepare([f.record], f.owner, f.excluded, class {}), null,
        'public prism preparation rejects');
    }
  }
  assert.equal(calls, 0); assert.equal(cases, 160); t.diagnostic(`${cases} accessor rejections, zero getter/setter invocations`);
});

test('required undefined/non-enumerable/missing data values reject; readonly data remains accepted', t => {
  let cases = 0;
  for (const kind of ['box', 'prism']) for (let i = 0, n = fixture(kind).fields.length; i < n; i++) {
    for (const change of ['undefined', 'hidden', 'missing', 'readonly']) {
      const f = fixture(kind), [o, k, label] = f.fields[i];
      if (change === 'missing') delete o[k];
      else if (change === 'undefined') Object.defineProperty(o, k, { value: undefined });
      else Object.defineProperty(o, k, change === 'hidden' ? { enumerable: false } : { writable: false, configurable: false });
      f.check(change === 'readonly', `${kind}.${label}.${change}`); cases++;
    }
  }
  assert.equal(cases, 160); t.diagnostic(`${cases} data-property controls`);
});

test('hidden/symbol annotations, key order, holes and changed prototypes retain exact rejection', t => {
  let cases = 0;
  for (const kind of ['box', 'prism']) for (let i = 0, n = fixture(kind).objects.length; i < n; i++) {
    for (const key of ['annotation', Symbol('annotation')]) for (const enumerable of [true, false]) {
      const f = fixture(kind), [o, label] = f.objects[i]; Object.defineProperty(o, key, { value: 7, enumerable });
      f.check(false, `${kind}.${label}.annotation`); cases++;
    }
    const f = fixture(kind), [o, label] = f.objects[i]; Object.setPrototypeOf(o, null);
    f.check(false, `${kind}.${label}.prototype`); cases++;
    if (Array.isArray(o)) continue;
    const g = fixture(kind), [p] = g.objects[i], k = Object.keys(p)[0], value = p[k]; delete p[k]; p[k] = value;
    g.check(false, `${kind}.${label}.order`); cases++;
  }
  const f = fixture('prism'); delete f.c.outer[3];
  Object.defineProperty(f.c.outer, 'hidden', { value: 1 }); // same own-key count; still a hole
  f.check(false, 'ring hole plus hidden annotation'); cases++;
  const g = fixture('prism'); g.c.holes = []; g.check(false, 'new holes'); cases++;
  t.diagnostic(`${cases} shape/annotation controls`);
});

test('intrinsic checks ignore inherited helper overrides and never invoke inherited accessors', () => {
  let calls = 0;
  const fail = () => { calls++; throw Error('inherited user code must not run'); };
  const prototype = Object.create(Object.prototype);
  Object.defineProperties(prototype, { x: { get: fail, set: fail }, propertyIsEnumerable: { value: fail },
    __lookupGetter__: { value: fail }, __lookupSetter__: { value: fail } });
  for (const kind of ['box', 'prism']) {
    const f = fixture(kind, prototype); f.check(true, 'own data shadows inherited accessors');
    const point = kind === 'box' ? f.c.centre : f.c.outer[0];
    Object.defineProperty(point, 'x', { get: undefined, set: undefined, enumerable: true, configurable: true });
    f.check(false, 'empty own accessor shadows inherited getter');
  }
  assert.equal(calls, 0);
});

test('membership, exclusions, special numbers and shape identity guards remain exact', () => {
  for (const kind of ['box', 'prism']) {
    const f = fixture(kind); f.check(true, 'ordinary exact record'); f.excluded.add(f.c); f.check(false, 'explicit independent owner');
    const g = fixture(kind); g.owner[kind === 'box' ? 'boxes' : 'prisms'].delete(g.c); g.check(false, 'not registered');
    for (const value of [NaN, Infinity, -Infinity, null, '1', 1n, Symbol('coordinate'), {}, undefined]) {
      const h = fixture(kind), p = kind === 'box' ? h.c.centre : h.c.outer[0]; p.x = value;
      h.check(false, 'nonfinite/nonnumber coordinate');
    }
  }
  const f = fixture('prism'); f.record.outer = f.c.outer.slice(); f.check(false, 'independent ring identity');
  const g = fixture('prism'); g.c.minY = 0; g.check(false, 'signed zero source/prepared mismatch');
});

test('the experiment changes only the validation block, never packing, queries, cache or handoff ownership', () => {
  assert.equal(storeSource('before').replace(BEFORE_VALIDATION, ''), storeSource('candidate').replace(CANDIDATE_VALIDATION, ''));
  assert.equal(read('js/sf-static-body-store.js').toString(), storeSource('candidate'), 'runtime is the measured candidate');
});

test('optional recorded full-corpus allocation/time controls match actual candidate bytes and exact output',
  { skip: !process.env.SF_BODY_VALIDATION_REPORTS && 'set SF_BODY_VALIDATION_REPORTS to private artifact directory' }, t => {
    const load = name => JSON.parse(readFileSync(resolve(process.env.SF_BODY_VALIDATION_REPORTS, name + '.json'), 'utf8'));
    const a = load('sf-body-validation-before-profile'), b = load('sf-body-validation-enumeration-profile');
    const controls = ['a1', 'a2', 'a3', 'a4'].map(n => load('sf-body-validation-time-' + n));
    const trials = ['d1', 'd2'].map(n => load('sf-body-validation-time-' + n));
    for (const r of [a, b, ...controls, ...trials]) {
      assert.equal(r.storeHash, hash(storeSource(r.variant)), 'measured module matches its exact validation variant');
      assert.equal(r.dataHash, a.dataHash); assert.deepEqual(r.output, a.output, 'all prepared and transferred typed bytes');
    }
    const counts = [load('sf-body-validation-before-counts'), load('sf-body-validation-current-counts')];
    assert.equal(counts[0].storeHash, hash(storeSource('before'))); assert.equal(counts[1].storeHash, hash(storeSource('candidate')));
    assert.deepEqual(counts[1].output, counts[0].output);
    assert.equal(counts[0].calls.descriptors, 5068845); assert.equal(counts[1].calls.descriptors, 4);
    assert.equal(counts[0].calls.ownKeys, 1619675); assert.equal(counts[1].calls.ownKeys, 1619675);
    t.diagnostic(JSON.stringify({ sampledAllocation: { before: a.allocation.sampledBytes, candidate: b.allocation.sampledBytes },
      unprofiledHandoffMs: { before: controls.map(r => r.handoffMs), candidate: trials.map(r => r.handoffMs) },
      reflectionCalls: counts.map(r => ({ variant: r.variant, ...r.calls })), storeHash: b.storeHash,
      scope: 'Complete regional body corpus; cumulative sampling and unprofiled timing are separate. No RSS-peak/phone claim.' }, null, 2));
  });
