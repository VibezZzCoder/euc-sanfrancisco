// Static box preparation — MIT, © 2026 VibezZzCoder.
// Ordinary callers retain authoritative collider identity/geometry. At the explicit
// registry handoff ONLY certified region-owned bodies can transfer their exact data.
// Float64 and expression order match sf-terrain-sampler; no geometry approximation.
const STRIDE = 6;
const BOX_KEYS = ['centre', 'halfExtents', 'rotationY', 'surface', 'support'];
const PRISM_KEYS = ['outer', 'minY', 'maxY', 'surface', 'support'];
const XYZ = ['x', 'y', 'z'], XZ = ['x', 'z'];

// A future registrant annotation, accessor, custom prototype or changed shape must
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

export function prepareStaticBox(collider) {
  const cos = Math.cos(collider.rotationY ?? 0), sin = Math.sin(collider.rotationY ?? 0);
  const x = Math.abs(cos) * collider.halfExtents.x + Math.abs(sin) * collider.halfExtents.z;
  const z = Math.abs(sin) * collider.halfExtents.x + Math.abs(cos) * collider.halfExtents.z;
  return { collider, cos, sin, minX: collider.centre.x - x, maxX: collider.centre.x + x,
    minZ: collider.centre.z - z, maxZ: collider.centre.z + z, occludes: collider.occludes !== false };
}

// The generated native narrow phase reads colliders[id]. A read-through facade
// preserves GLOBAL IDs (including initial-exit certificates and limb records),
// without a dense array of wrappers or remapping its native collision algorithm.
// Reuse the source-membership array as the target: no second world-sized array,
// and every native array reader (including filter in the tunnel observer) works.
// Ordinary source identity stays fixed; transferred regional records have bounded
// views. Never reuse an escaped view as scratch. Static view mutation is unsupported.
class RecordsHandler {
  constructor(store, sources = false) { this.store = store; this.sources = sources; }
  index(key) {
    if (typeof key !== 'string') return -1;
    const id = Number(key);
    return Number.isInteger(id) && id >= 0 && id < this.store.length && String(id) === key ? id : -1;
  }
  get(array, key, receiver) {
    const id = this.index(key);
    return id >= 0 ? this.value(id) : Reflect.get(array, key, receiver);
  }
  getOwnPropertyDescriptor(array, key) {
    const descriptor = Reflect.getOwnPropertyDescriptor(array, key), id = this.index(key);
    return id >= 0 ? { ...descriptor, value: this.value(id) } : descriptor;
  }
  value(id) { return this.sources ? this.store.sourceAt(id) : this.store.get(id); }
  set() { return false; }
  defineProperty() { return false; }
  deleteProperty() { return false; }
}

export class SfStaticBoxStore {
  constructor(colliders, { cacheSize = 256 } = {}) {
    // The caller transfers this newly assembled membership array, not its input
    // registry arrays. Bodies/nested vectors/metadata are never cloned or frozen.
    this.sources = colliders;
    this.sourceSlots = colliders;
    this.regionalValues = null;
    this.length = colliders.length;
    this.values = new Float64Array(this.length * STRIDE);
    this.occludes = new Uint8Array(this.length);
    this.cacheSize = Number.isFinite(cacheSize) ? Math.max(0, Math.floor(cacheSize)) : 256;
    this.cache = new Map();
    for (let id = 0; id < this.length; id++) {
      const p = prepareStaticBox(colliders[id]), at = id * STRIDE;
      this.values[at] = p.cos; this.values[at + 1] = p.sin;
      this.values[at + 2] = p.minX; this.values[at + 3] = p.maxX;
      this.values[at + 4] = p.minZ; this.values[at + 5] = p.maxZ;
      this.occludes[id] = p.occludes ? 1 : 0;
    }
    this.records = new Proxy(this.sources, new RecordsHandler(this));
    this.stats = Object.freeze({ boxes: this.length, typedBytes: this.values.byteLength + this.occludes.byteLength,
      viewCacheLimit: this.cacheSize });
  }
  getBounds(id, out) {
    const at = id * STRIDE, v = this.values;
    out.minX = v[at + 2]; out.maxX = v[at + 3]; out.minZ = v[at + 4]; out.maxZ = v[at + 5];
    return out;
  }
  // Stage allocations without consuming inputs. Commit only after BOTH body stores
  // prepare successfully. Existing core/raw identities and all global IDs stay put.
  prepareRegionalHandoff(owner, excluded) {
    if (!owner) return null;
    const ids = [];
    for (let id = 0; id < this.length; id++) if (regionalBox(this.sourceSlots[id], owner, excluded)) ids.push(id);
    if (!ids.length) return null;
    const values = new Float64Array(ids.length * 7);
    for (let slot = 0; slot < ids.length; slot++) {
      const c = this.sourceSlots[ids[slot]], at = slot * 7;
      values[at] = c.centre.x; values[at + 1] = c.centre.y; values[at + 2] = c.centre.z;
      values[at + 3] = c.halfExtents.x; values[at + 4] = c.halfExtents.y; values[at + 5] = c.halfExtents.z;
      values[at + 6] = c.rotationY;
    }
    return { ids, values, sources: new Proxy(this.sourceSlots, new RecordsHandler(this, true)),
      stats: Object.freeze({ ...this.stats, regionalBoxes: ids.length, typedBytes: this.stats.typedBytes + values.byteLength }) };
  }
  commitRegionalHandoff(plan) {
    if (!plan) return;
    this.regionalValues = plan.values;
    for (let slot = 0; slot < plan.ids.length; slot++) this.sourceSlots[plan.ids[slot]] = slot;
    this.sources = plan.sources; this.stats = plan.stats;
    this.cache.clear(); // escaped earlier views remain independently valid
  }
  sourceAt(id) { return typeof this.sourceSlots[id] === 'number' ? this.get(id).collider : this.sourceSlots[id]; }
  get(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.length) return undefined;
    let view = this.cache.get(id);
    if (view) return view;
    const at = id * STRIDE, v = this.values;
    // An escaped view owns its values: eviction NEVER retargets a caller's object.
    // Ordinary collider identity stays stable. Transferred regional data is immutable;
    // its bounded views own their vectors and never change when another ID is queried.
    let collider = this.sourceSlots[id];
    if (typeof collider === 'number') {
      const a = collider * 7, r = this.regionalValues;
      collider = { centre: { x: r[a], y: r[a + 1], z: r[a + 2] },
        halfExtents: { x: r[a + 3], y: r[a + 4], z: r[a + 5] },
        rotationY: r[a + 6], surface: 'pavement', support: false };
    }
    view = { collider, cos: v[at], sin: v[at + 1], minX: v[at + 2], maxX: v[at + 3],
      minZ: v[at + 4], maxZ: v[at + 5], occludes: this.occludes[id] === 1 };
    if (this.cacheSize) {
      if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(id, view);
    }
    return view;
  }
}

// The only packed prism recipe is the registered regional eight-point ring. Store
// the original coordinates, NEVER derive them from centre/radius or Float32 matrices.
// Raw/core prisms stay untouched in the same global membership array. Only packed
// views cache edges/decomposition, so walking through new regions cannot accumulate
// an unbounded object cache. A compact stable first-contact ID survives view eviction.
export class SfRegionalPrismStore {
  static prepare(records, owner, excluded, PreparedPrism) {
    if (!owner) return null;
    const ids = [];
    for (let id = 0; id < records.length; id++) if (regionalPrism(records[id], owner, excluded)) ids.push(id);
    return ids.length ? new SfRegionalPrismStore(records, ids, PreparedPrism) : null;
  }
  constructor(records, ids, PreparedPrism) {
    this.slots = records; this.length = records.length; this.PreparedPrism = PreparedPrism;
    this.values = new Float64Array(ids.length * 22);
    this.contactBases = new Float64Array(ids.length).fill(-1);
    this.cache = new Map(); this.cacheLimit = 256;
    for (let slot = 0; slot < ids.length; slot++) {
      const p = records[ids[slot]], at = slot * 22, v = this.values;
      v[at] = p.minY; v[at + 1] = p.maxY;
      v[at + 2] = p.minX; v[at + 3] = p.maxX; v[at + 4] = p.minZ; v[at + 5] = p.maxZ;
      for (let k = 0; k < 8; k++) { v[at + 6 + k * 2] = p.outer[k].x; v[at + 7 + k * 2] = p.outer[k].z; }
      if (p.contactPieces?.length) this.contactBases[slot] = p.contactPieces[0].contactId;
    }
    this.records = new Proxy(records, new RecordsHandler(this));
    this.pendingIds = ids;
    this.stats = Object.freeze({ regionalPrisms: ids.length, typedBytes: this.values.byteLength + this.contactBases.byteLength,
      viewCacheLimit: this.cacheLimit });
  }
  commit() {
    for (let slot = 0; slot < this.pendingIds.length; slot++) this.slots[this.pendingIds[slot]] = slot;
    this.pendingIds = null;
  }
  getBounds(id, out) {
    const slot = this.slots[id];
    if (typeof slot !== 'number') {
      out.minX = slot.minX; out.maxX = slot.maxX; out.minZ = slot.minZ; out.maxZ = slot.maxZ;
    } else {
      const at = slot * 22, v = this.values;
      out.minX = v[at + 2]; out.maxX = v[at + 3]; out.minZ = v[at + 4]; out.maxZ = v[at + 5];
    }
    return out;
  }
  get(id) {
    const slot = this.slots[id];
    if (typeof slot !== 'number') return slot;
    let p = this.cache.get(id);
    if (p) return p;
    const at = slot * 22, v = this.values, outer = [];
    for (let k = 0; k < 8; k++) outer.push({ x: v[at + 6 + k * 2], z: v[at + 7 + k * 2] });
    const source = { outer, minY: v[at], maxY: v[at + 1], surface: 'pavement', support: false };
    p = new this.PreparedPrism(source, id);
    p.minX = v[at + 2]; p.maxX = v[at + 3]; p.minZ = v[at + 4]; p.maxZ = v[at + 5];
    if (this.cache.size === this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(id, p);
    return p;
  }
  contactBase(id) { const slot = this.slots[id]; return typeof slot === 'number' ? this.contactBases[slot] : -1; }
  rememberContactBase(id, base) { const slot = this.slots[id]; if (typeof slot === 'number') this.contactBases[slot] = base; }
}
