// Exact pre-follow-up validator vs candidate, with unchanged real handoff code.
// CPU-only allocation sampling (NOT snapshots), timed separately from profiling.
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import { ROOT, read, hash, regionalBodies, options } from './sf-regional-body-fixture.mjs';

export const BEFORE_VALIDATION = `// A future registrant annotation, accessor, custom prototype or changed shape must
// stay on the original identity-preserving path, rather than silently lose metadata.
function dataKeys(o, keys, prototype) {
  if (!o || Object.getPrototypeOf(o) !== prototype) return false;
  const own = Reflect.ownKeys(o);
  if (own.length !== keys.length) return false;
  for (let i = 0; i < keys.length; i++) {
    if (own[i] !== keys[i]) return false;
    const d = Object.getOwnPropertyDescriptor(o, keys[i]);
    if (!d || !('value' in d) || !d.enumerable) return false;
  }
  return true;
}
const vector = (o, keys, prototype) => dataKeys(o, keys, prototype) && keys.every(k => Number.isFinite(o[k]));
function regionalBox(c, owner, excluded) {
  return owner?.boxes.has(c) && !excluded.has(c) && dataKeys(c, BOX_KEYS, owner.objectPrototype)
    && c.surface === 'pavement' && c.support === false && Number.isFinite(c.rotationY)
    && vector(c.centre, XYZ, owner.objectPrototype) && vector(c.halfExtents, XYZ, owner.objectPrototype);
}
function regionalPrism(p, owner, excluded) {
  const c = p.source;
  if (!owner?.prisms.has(c) || excluded.has(c) || !dataKeys(c, PRISM_KEYS, owner.objectPrototype)
    || c.surface !== 'pavement' || c.support !== false || !Number.isFinite(c.minY) || !Number.isFinite(c.maxY)
    || !Object.is(c.minY, p.minY) || !Object.is(c.maxY, p.maxY) || p.outer !== c.outer || p.holes !== undefined
    || p.surface !== c.surface || p.support !== false || p.occludes !== undefined) return false;
  const r = c.outer;
  if (!Array.isArray(r) || Object.getPrototypeOf(r) !== owner.arrayPrototype || r.length !== 8
    || Reflect.ownKeys(r).length !== 9) return false;
  for (let i = 0; i < 8; i++) {
    const d = Object.getOwnPropertyDescriptor(r, String(i));
    if (!d || !('value' in d) || !d.enumerable || !vector(d.value, XZ, owner.objectPrototype)) return false;
  }
  return true;
}

`;

export const CANDIDATE_VALIDATION = `// A future registrant annotation, accessor, custom prototype or changed shape must
// stay on the original identity-preserving path, rather than silently lose metadata.
// Keep Reflect.ownKeys: enumerable-only iteration would miss hidden/symbol annotations.
// These intrinsics inspect accessors without invoking them or trusting object methods.
const enumerable = Function.call.bind(Object.prototype.propertyIsEnumerable);
const getter = Function.call.bind(Object.prototype.__lookupGetter__);
function dataKeys(o, keys, prototype) {
  if (!o || Object.getPrototypeOf(o) !== prototype) return false;
  // for-in supplies enumerability without per-field descriptor objects. Ignore
  // inherited keys; the final own-key count also rejects hidden/symbol extras.
  let count = 0;
  for (const k in o) {
    if (!Object.hasOwn(o, k)) continue;
    if (count >= keys.length || k !== keys[count++] || getter(o, k) !== undefined) return false;
  }
  // Setter-only and {get:undefined,set:undefined} accessors read as undefined.
  // EVERY accepted field below requires a non-undefined value/type, so those still
  // reject. Reads cannot invoke setters; the check above never invokes getters.
  // This shortcut is valid only for these required fields, not optional metadata.
  return count === keys.length && Reflect.ownKeys(o).length === count;
}
function vector(o, keys, prototype) {
  if (!dataKeys(o, keys, prototype)) return false;
  for (let i = 0; i < keys.length; i++) if (!Number.isFinite(o[keys[i]])) return false;
  return true;
}
function regionalBox(c, owner, excluded) {
  return owner?.boxes.has(c) && !excluded.has(c) && dataKeys(c, BOX_KEYS, owner.objectPrototype)
    && c.surface === 'pavement' && c.support === false && Number.isFinite(c.rotationY)
    && vector(c.centre, XYZ, owner.objectPrototype) && vector(c.halfExtents, XYZ, owner.objectPrototype);
}
function regionalPrism(p, owner, excluded) {
  const c = p.source;
  if (!owner?.prisms.has(c) || excluded.has(c) || !dataKeys(c, PRISM_KEYS, owner.objectPrototype)
    || c.surface !== 'pavement' || c.support !== false || !Number.isFinite(c.minY) || !Number.isFinite(c.maxY)
    || !Object.is(c.minY, p.minY) || !Object.is(c.maxY, p.maxY) || p.outer !== c.outer || p.holes !== undefined
    || p.surface !== c.surface || p.support !== false || p.occludes !== undefined) return false;
  const r = c.outer;
  if (!Array.isArray(r) || Object.getPrototypeOf(r) !== owner.arrayPrototype || r.length !== 8
    || Reflect.ownKeys(r).length !== 9) return false;
  for (let i = 0; i < 8; i++) {
    const k = String(i);
    if (!enumerable(r, k) || getter(r, k) !== undefined
      || !vector(r[k], XZ, owner.objectPrototype)) return false;
  }
  return true;
}

`;

const current = read('js/sf-static-body-store.js').toString(), start = current.indexOf('// A future registrant'), end = current.indexOf('export function prepareStaticBox');
assert.ok(start > 0 && end > start);
assert.ok([BEFORE_VALIDATION, CANDIDATE_VALIDATION].includes(current.slice(start, end)), 'known validator only');
export const storeSource = variant => current.slice(0, start) + (variant === 'before' ? BEFORE_VALIDATION : CANDIDATE_VALIDATION) + current.slice(end);
const moduleURL = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
export const validators = async variant => import(moduleURL(storeSource(variant) + '\nexport { regionalBox, regionalPrism };'));
export async function samplerClass(variant) {
  const storeURL = moduleURL(storeSource(variant));
  const source = read('js/sf-terrain-sampler.js').toString().replace(/from '(\.\/[^']+)'/g, (_, path) =>
    `from '${path === './sf-static-body-store.js' ? storeURL : new URL('js/' + path.slice(2), ROOT).href}'`);
  return (await import(moduleURL(source))).SfTerrainSampler;
}

if (process.argv[2] === '--measure-validation') {
  const variant = process.argv[3], phase = process.argv[4];
  assert.ok(['before', 'candidate'].includes(variant) && ['time', 'profile', 'counts'].includes(phase));
  assert.ok(global.gc && process.execArgv.includes('--max-old-space-size=4096'));
  const Sampler = await samplerClass(variant), fixture = regionalBodies('candidate');
  const s = new Sampler(options({ ride: fixture.ride }));
  await new Promise(setImmediate); for (let i = 0; i < 4; i++) global.gc();
  const memoryBefore = process.memoryUsage();
  let session, allocation, calls;
  if (phase === 'profile') {
    session = new Session(); session.connect();
    await session.post('HeapProfiler.startSampling', { samplingInterval: 32768,
      includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  }
  const ownKeys = Reflect.ownKeys, descriptor = Object.getOwnPropertyDescriptor;
  if (phase === 'counts') {
    calls = { ownKeys: 0, descriptors: 0 };
    Reflect.ownKeys = (...args) => { calls.ownKeys++; return ownKeys(...args); };
    Object.getOwnPropertyDescriptor = (...args) => { calls.descriptors++; return descriptor(...args); };
  }
  const start = performance.now();
  try { s.releaseConstructionRegistry(fixture.ride); }
  finally { Reflect.ownKeys = ownKeys; Object.getOwnPropertyDescriptor = descriptor; }
  const handoffMs = performance.now() - start, memoryAfter = process.memoryUsage();
  if (session) {
    const { profile } = await session.post('HeapProfiler.stopSampling'); session.disconnect();
    let bytes = 0, nodes = 0; const sites = new Map();
    function walk(n) {
      assert.ok(++nodes < 100000, 'bounded sampling profile'); bytes += n.selfSize;
      const name = n.callFrame.functionName || '(anonymous)'; sites.set(name, (sites.get(name) ?? 0) + n.selfSize);
      for (const c of n.children) walk(c);
    }
    walk(profile.head); allocation = { sampledBytes: bytes, nodes, topSites: [...sites].sort((a, b) => b[1] - a[1]).slice(0, 12) };
  }
  await new Promise(setImmediate); for (let i = 0; i < 4; i++) global.gc();
  const retained = process.memoryUsage();
  const arrays = { prepared: s.boxStore.values, occludes: s.boxStore.occludes, boxes: s.boxStore.regionalValues,
    prisms: s.prismStore.values, contactBases: s.prismStore.contactBases };
  const output = Object.fromEntries(Object.entries(arrays).map(([k, a]) => [k, { bytes: a.byteLength,
    sha256: hash(Buffer.from(a.buffer, a.byteOffset, a.byteLength)) }]));
  assert.equal(s.boxStore.stats.regionalBoxes, 161645); assert.equal(s.prismStore.stats.regionalPrisms, 113474);
  console.log(JSON.stringify({ variant, phase, node: process.version, handoffMs, calls, allocation, memoryBefore, memoryAfter, retained,
    output, dataHash: fixture.dataHash, validatorHash: hash(variant === 'before' ? BEFORE_VALIDATION : CANDIDATE_VALIDATION),
    storeHash: hash(storeSource(variant)),
    scope: 'Complete regional corpus, handoff only. Unprofiled timing is separate from cumulative allocation sampling. Node categories, not browser RSS peak or phone stability.' }, null, 2));
}
