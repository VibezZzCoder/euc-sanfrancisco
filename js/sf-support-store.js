// Packed construction-time SF support facets — MIT, © 2026 VibezZzCoder.
// City derivations: unable12/slop-sanfrancisco@bdd5d37; see NOTICE.md.
// All world coordinates/planes remain JavaScript doubles, without rebasing or
// algebraic reassociation. No source records or geometry arrays are retained.
// tags: low 6 bits are presence flags, bits 6–9 an inline polygon count (<15),
// bits 10–31 a shared metadata ID. Values: bounds[4], top, optional plane[5],
// optional numeric bounds/ceiling, optional large polygon count, polygon XZ
// pairs, optional length-prefixed outer and hole rings.
const PLANE = 1, MIN = 2, MAX = 4, CEILING = 8, OUTER = 16, HOLES = 32;
const COUNT_SHIFT = 6, COUNT_MASK = 15, META_SHIFT = 10;
// Bit 31: the facet lives in a referenced PackedTops batch (offsets = facet index in batches[batchOf[id]]), not in
// `values`. Metadata IDs therefore use bits 10–30.
const REFERENCED = 0x80000000, META_MASK = 0x1fffff;
const COMMON = ['surface', 'layered', 'shore', 'replacesTerrain', 'water', 'occludes', 'rideIgnore'];
const COMMON_KEYS = new Set(COMMON);
const PACKED = new Set(['poly', 'top', 'plane', 'outer', 'holes', 'minReferenceY', 'maxReferenceY', 'ceilingOffset']);
const NUMBERS = [[MIN, 'minReferenceY'], [MAX, 'maxReferenceY'], [CEILING, 'ceilingOffset']];
const VERTEX_KEYS = ['x', 'z'], PLANE_KEYS = ['x', 'y', 'z', 'dx', 'dz'];
const ABSENT = Symbol('absent'), NEGATIVE_ZERO = Symbol('-0');
// Boot loads the classic geometry factory before importing this module. Capture
// its private WeakSet verifier once; later changes to window.NYC cannot supply
// a verifier or cause an untrusted token's properties to be inspected.
const nativeCompactVerifier = globalThis.window?.NYC?.RideGeometry?.isCompactSupportToken;
export function isCertifiedCompactSupport(token) {
  return token !== null && token !== undefined && typeof nativeCompactVerifier === 'function' && nativeCompactVerifier(token);
}
const enumerable = (o, k) => Object.prototype.propertyIsEnumerable.call(o, k);
const numeric = (t, k) => enumerable(t, k) && typeof t[k] === 'number';
// Accept both the original len/top/anchor arrays and the compact ring-slot format. Construction
// and queries never expand a batch or change source-order facet IDs to interpret either layout.
const packedCount = (b, i) => b.facet ? b.countAt(i) : b.len[i];
const packedAnchor = (b, i) => b.facet ? b.anchorAt(i) : b.anchor[i];
const packedTop = (b, i) => b.facet ? b.topAt(i) : b.top[i];

function tagOf(t) {
  return (t.plane ? PLANE : 0) | (numeric(t, 'minReferenceY') ? MIN : 0)
    | (numeric(t, 'maxReferenceY') ? MAX : 0) | (numeric(t, 'ceilingOffset') ? CEILING : 0)
    | (t.outer ? OUTER : 0) | (t.holes ? HOLES : 0)
    | (Math.min(COUNT_MASK, t.poly.length) << COUNT_SHIFT);
}

function sizeOf(t, tag) {
  let n = 5 + (tag & PLANE ? 5 : 0) + (tag & MIN ? 1 : 0) + (tag & MAX ? 1 : 0)
    + (tag & CEILING ? 1 : 0) + (t.poly.length >= COUNT_MASK ? 1 : 0) + t.poly.length * 2;
  if (tag & OUTER) n += 1 + t.outer.length * 2;
  if (tag & HOLES) { n++; for (const ring of t.holes) n += 1 + ring.length * 2; }
  return n;
}

// Allocation-free exact pre-check: for-in yields every own enumerable string key (plus any
// inherited enumerable ones). If it yields exactly `keys` and there are no own symbols,
// no enumerable annotation can exist. Anything else takes the general path below.
function onlyPackedKeys(o, keys) {
  let n = 0;
  for (const k in o) { if (n >= keys.length || k !== keys[n]) return false; n++; }
  return n === keys.length && Object.getOwnPropertySymbols(o).length === 0;
}

function annotations(o, keys) {
  let result;
  if (onlyPackedKeys(o, keys)) return result;
  for (const k of Reflect.ownKeys(o)) if (enumerable(o, k) && !keys.includes(k)) {
    Object.defineProperty(result ??= {}, k, { value: o[k], enumerable: true });
  }
  return result;
}

function ringAnnotations(ring) {
  let result;
  for (let i = 0; i < ring.length; i++) {
    const fields = annotations(ring[i], VERTEX_KEYS);
    if (fields) (result ??= new Map()).set(i, fields);
  }
  return result;
}

function writeRing(values, at, ring) {
  for (const p of ring) { values[at++] = p.x; values[at++] = p.z; }
  return at;
}

function packedField(k, tag) {
  return k === 'plane' && tag & PLANE || k === 'outer' && tag & OUTER || k === 'holes' && tag & HOLES
    || k === 'minReferenceY' && tag & MIN || k === 'maxReferenceY' && tag & MAX || k === 'ceilingOffset' && tag & CEILING;
}

// Keys copied by the shared metadata template or packed geometry/values for this tag.
function skipped(k, tag) {
  return k === 'poly' || k === 'top' || COMMON_KEYS.has(k) || PACKED.has(k) && packedField(k, tag);
}

// `presence` caches the frozen template's own-enumerable COMMON bits (construction-local).
function sameMetadata(t, metadata, presence) {
  for (let i = 0; i < COMMON.length; i++) {
    const k = COMMON[i], own = enumerable(t, k);
    if (own !== ((presence >>> i & 1) === 1) || (own && !Object.is(t[k], metadata[k]))) return false;
  }
  return true;
}

function presenceOf(metadata) {
  let bits = 0;
  for (let i = 0; i < COMMON.length; i++) if (enumerable(metadata, COMMON[i])) bits |= 1 << i;
  return bits;
}

// Same edge/boundary arithmetic and order as the sampler's object-ring test.
function containsRing(data, start, count, x, z, boundary) {
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const a = start + j * 2, b = start + i * 2;
    const ax = data[a], az = data[a + 1], bx = data[b], bz = data[b + 1];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (Math.abs(cross) <= 1e-8 * Math.max(1, Math.hypot(bx - ax, bz - az))
      && x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8
      && z >= Math.min(az, bz) - 1e-8 && z <= Math.max(az, bz) + 1e-8) return boundary;
    if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) inside = !inside;
  }
  return inside;
}

// containsRing's arithmetic on a packed ring (vertex indices into a batch's positions).
function containsPacked(pos, ids, base, count, x, z, boundary) {
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const a = ids[base + j] * 3, b = ids[base + i] * 3;
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (Math.abs(cross) <= 1e-8 * Math.max(1, Math.hypot(bx - ax, bz - az))
      && x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8
      && z >= Math.min(az, bz) - 1e-8 && z <= Math.max(az, bz) + 1e-8) return boundary;
    if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) inside = !inside;
  }
  return inside;
}

// Exact address snapshots, not geometry. A locator's high bit selects a full
// ordinary tag/offset; packed locators carry the first-pass count/plane bits and
// a page-local batch slot. The batch's geometry stays referenced as before.
let keyCapture, uint32Shape, uint16Shape;
const PAGED_STORES = new WeakMap(), pagedFor = WeakMap.prototype.get.bind(PAGED_STORES),
  setPaged = WeakMap.prototype.set.bind(PAGED_STORES), deletePaged = WeakMap.prototype.delete.bind(PAGED_STORES);
// Bracket access uses ToPropertyKey (including its string hint and Symbol
// handling), once per original typed-array read. Never coerce an object twice.
function addressKey(id) {
  const type = typeof id;
  if (type === 'number' || type === 'string' || type === 'symbol') return id;
  if (id === null || type === 'undefined' || type === 'boolean' || type === 'bigint') return String(id);
  return (keyCapture ??= new Proxy(Object.create(null), { get: (_target, key) => key }))[id];
}
function addressIndex(key, length) {
  if (typeof key === 'number') return Number.isInteger(key) && key >= 0 && key < length ? (key === 0 ? 0 : key) : -1;
  if (typeof key !== 'string') return -1;
  const value = Number(key);
  return Number.isInteger(value) && value >= 0 && value < length && String(value) === key ? value : -1;
}
function nonIndexProperty(key, length, bytes) {
  if (typeof key === 'number') return undefined;
  if (key === 'length') return length;
  if (key === 'byteLength') return length * bytes;
  if (key === 'byteOffset') return 0;
  const shape = bytes === 4 ? (uint32Shape ??= new Uint32Array(0)) : (uint16Shape ??= new Uint16Array(0));
  return Reflect.get(shape, key);
}
class PagedSupportAddresses {
  constructor(length, plans, ordinary) {
    const pages = Math.ceil(length / 128), packedPerPage = new Uint16Array(pages), batchesPerPage = new Uint8Array(pages);
    for (const { start, length: n } of plans) {
      const end = start + n;
      for (let page = Math.floor(start / 128); page <= Math.floor((end - 1) / 128); page++) {
        packedPerPage[page] += Math.min(end, (page + 1) * 128) - Math.max(start, page * 128);
        if (++batchesPerPage[page] > 32) return; // unsupported: caller takes the raw path
      }
    }
    this.locator = new Uint8Array(length);
    this.pageOrdinaryBases = new Uint32Array(pages); this.pageBatchBases = new Uint32Array(pages);
    let ordinaryAt = 0, batchAt = 0;
    for (let page = 0; page < pages; page++) {
      this.pageOrdinaryBases[page] = ordinaryAt; this.pageBatchBases[page] = batchAt;
      ordinaryAt += Math.min(128, length - page * 128) - packedPerPage[page];
      batchAt += batchesPerPage[page];
    }
    if (ordinaryAt !== ordinary) throw new Error('SF compact support ordinary count mismatch');
    this.pageBatchIds = new Uint8Array(batchAt);
    this.batchStarts = new Uint32Array(plans.length); this.batchMetaBits = new Uint32Array(plans.length);
    for (let i = 0; i < plans.length; i++) this.batchStarts[i] = plans[i].start;
    this.ordinaryTags = new Uint32Array(ordinary); this.ordinaryOffsets = new Uint32Array(ordinary);
    this.length = length; this.terminalOffset = new Uint32Array(1);
    this.ordinaryWritten = 0; this.packedWritten = 0; this.batchEntriesWritten = 0;
    this.page = -1; this.pageOrdinary = 0; this.pageBatches = 0; this.lastBatch = -1; this.slot = 0;
  }
  selectPage(id) {
    const page = Math.floor(id / 128);
    if (page !== this.page) { this.page = page; this.pageOrdinary = 0; this.pageBatches = 0; this.lastBatch = -1; }
    return page;
  }
  ordinary(id, tag, offset) {
    if (id >= this.length) throw new Error('SF compact support ID overflow');
    const page = this.selectPage(id), ordinal = this.pageOrdinary++;
    if (ordinal >= 128) throw new Error('SF compact support ordinary page overflow');
    const at = this.pageOrdinaryBases[page] + ordinal;
    const end = page + 1 < this.pageOrdinaryBases.length ? this.pageOrdinaryBases[page + 1] : this.ordinaryTags.length;
    if (at >= end) throw new Error('SF compact support ordinary address overflow');
    this.locator[id] = 128 | ordinal; this.ordinaryTags[at] = tag; this.ordinaryOffsets[at] = offset;
    this.ordinaryWritten++;
  }
  packed(id, tag, batch) {
    if (id >= this.length || tag === undefined) throw new Error('SF compact support packed snapshot overflow');
    const page = this.selectPage(id);
    if (batch !== this.lastBatch) {
      this.slot = this.pageBatches++; this.lastBatch = batch;
      if (this.slot >= 32) throw new Error('SF compact support batch page overflow');
      const at = this.pageBatchBases[page] + this.slot;
      const end = page + 1 < this.pageBatchBases.length ? this.pageBatchBases[page + 1] : this.pageBatchIds.length;
      if (at >= end) throw new Error('SF compact support batch address overflow');
      this.pageBatchIds[at] = batch; this.batchEntriesWritten++;
    }
    this.locator[id] = (this.slot << 2) | ((((tag >>> COUNT_SHIFT) & COUNT_MASK) - 3) << 1) | (tag & PLANE);
    this.packedWritten++;
  }
  tagAt(id) {
    const key = addressKey(id), index = addressIndex(key, this.length);
    if (index < 0) return nonIndexProperty(key, this.length, 4);
    const locator = this.locator[index], page = Math.floor(index / 128);
    if (locator & 128) return this.ordinaryTags[this.pageOrdinaryBases[page] + (locator & 127)];
    const batch = this.pageBatchIds[this.pageBatchBases[page] + (locator >>> 2)];
    return (REFERENCED | this.batchMetaBits[batch] | ((3 + ((locator >>> 1) & 1)) << COUNT_SHIFT) | (locator & PLANE)) >>> 0;
  }
  offsetAt(id) {
    const key = addressKey(id), index = addressIndex(key, this.length + 1);
    if (index < 0) return nonIndexProperty(key, this.length + 1, 4);
    if (index === this.length) return this.terminalOffset[0];
    const locator = this.locator[index], page = Math.floor(index / 128);
    return locator & 128 ? this.ordinaryOffsets[this.pageOrdinaryBases[page] + (locator & 127)]
      : index - this.batchStarts[this.pageBatchIds[this.pageBatchBases[page] + (locator >>> 2)]];
  }
  batchAt(id) {
    const key = addressKey(id), index = addressIndex(key, this.length);
    if (index < 0) return nonIndexProperty(key, this.length, 2);
    const locator = this.locator[index];
    return locator & 128 ? 0 : this.pageBatchIds[this.pageBatchBases[Math.floor(index / 128)] + (locator >>> 2)];
  }
  get byteLength() {
    return this.locator.byteLength + this.pageOrdinaryBases.byteLength + this.pageBatchBases.byteLength
      + this.pageBatchIds.byteLength + this.batchStarts.byteLength + this.batchMetaBits.byteLength
      + this.ordinaryTags.byteLength + this.ordinaryOffsets.byteLength + this.terminalOffset.byteLength;
  }
}

/** Variable-ring CSR geometry plus interned common metadata. Only the bounded
 * query cache owns object/vertex/plane views; eviction never recycles a view.
 * Sparse extras preserve uncommon enumerable diagnostics, including symbols.
 */
export class SfSupportStore {
  constructor(lists, { cacheSize = 256 } = {}, compactToken = null, compactEmptyList = null) {
    if (!Number.isInteger(cacheSize) || cacheSize < 0) throw new RangeError('Invalid support view cache size');
    // A rejected value is never dereferenced, even when it is a Proxy or has getters.
    // Custom subclasses retain their original prototype and raw representation.
    const compactCertificate = new.target === SfSupportStore && isCertifiedCompactSupport(compactToken) ? compactToken : null;
    // Construction-local identity dedupe in first-source order. A strong Set plus one
    // unique list replaces repeated WeakSet probes; both are dropped after construction.
    const seen = new Set(), unique = [];
    let compact = !!compactCertificate, sourceTags;
    const plans = [];
    let count = 0, doubles = 0, ceilings = 0, batches = 0;
    if (!compact) {
      // Preserve the original raw constructor's allocation, growth and reads.
      sourceTags = new Uint32Array(1024);
      for (const list of lists) for (const t of list) {
        if (t.rideIgnore === true || seen.has(t)) continue;
        seen.add(t); unique.push(t);
        const facets = t.packedTops === true ? t.length : 1;
        if (count + facets > sourceTags.length) {
          const grown = new Uint32Array(Math.max(count * 2, count + facets)); grown.set(sourceTags); sourceTags = grown;
        }
        if (facets === 1 && t.packedTops !== true) {
          const tag = tagOf(t); sourceTags[count++] = tag;
          doubles += sizeOf(t, tag); if (t.ceilingOffset) ceilings++;
        } else {
          batches++;
          for (let i = 0; i < facets; i++) sourceTags[count++] = (packedAnchor(t, i) >= 0 ? PLANE : 0) | (Math.min(COUNT_MASK, packedCount(t, i)) << COUNT_SHIFT);
        }
      }
    } else {
      sourceTags = new Uint16Array(1024);
      const snapshot = tag => {
        if (sourceTags instanceof Uint16Array && (tag >>> 0) > 0xffff) {
          const wide = new Uint32Array(sourceTags.length); wide.set(sourceTags); sourceTags = wide; compact = false;
        }
        sourceTags[count++] = tag;
      };
      for (const list of lists) {
        if (compact && list !== compactCertificate.tops && list !== compactCertificate.emptyTops && list !== compactEmptyList) compact = false;
        for (const t of list) {
          // Do not touch geometry, metadata or accessors on ignored reservations.
          if (t.rideIgnore === true || seen.has(t)) continue;
          seen.add(t); unique.push(t);
          const kind = compact ? compactCertificate.owns(t) : null;
          if (compact && !kind) compact = false;
          // A packed batch stands for its facets, in original order.
          const facets = t.packedTops === true ? t.length : 1;
          if (count + facets > sourceTags.length) {
            const grown = new sourceTags.constructor(Math.max(count * 2, count + facets)); grown.set(sourceTags); sourceTags = grown;
          }
          if (facets === 1 && t.packedTops !== true) {
            if (compact && kind !== 'ordinary') compact = false;
            const tag = tagOf(t); snapshot(tag);
            doubles += sizeOf(t, tag); if (t.ceilingOffset) ceilings++;
          } else {
            // Referenced, not copied: the batch's typed arrays become the store's for these facets.
            if (compact && (kind !== 'packed' || !Number.isSafeInteger(facets) || facets <= 0 || batches >= 256)) compact = false;
            if (compact) plans.push({ entry: t, start: count, length: facets });
            batches++;
            for (let i = 0; i < facets; i++) {
              const tag = (packedAnchor(t, i) >= 0 ? PLANE : 0) | (Math.min(COUNT_MASK, packedCount(t, i)) << COUNT_SHIFT);
              if (compact && tag !== (3 << COUNT_SHIFT | (tag & PLANE)) && tag !== (4 << COUNT_SHIFT | (tag & PLANE))) compact = false;
              snapshot(tag);
            }
          }
        }
      }
    }
    seen.clear();
    if (count >= 0xffffffff || doubles > 0xffffffff) throw new RangeError('SF support store exceeds Uint32 offsets');
    this.length = count;
    const packedCountTotal = compact ? plans.reduce((n, p) => n + p.length, 0) : 0;
    let paged = compact && count > 0 && plans.length > 0 && plans.length === batches
      ? new PagedSupportAddresses(count, plans, count - packedCountTotal) : null;
    if (paged && !paged.locator) paged = null; // more than 32 distinct batches in a page
    this.offsets = paged ? null : new Uint32Array(count + 1);
    this.tags = paged ? null : new Uint32Array(count);
    this.values = new Float64Array(doubles);
    this.ceilingIds = new Uint32Array(ceilings);
    this.metadata = []; this.extras = new Map();
    this.batches = []; this.batchOf = !paged && batches ? new (batches < 65536 ? Uint16Array : Uint32Array)(count) : null;
    if (paged) setPaged(this, paged);
    this.cache = new Map(); this.cacheLimit = cacheSize; this.cacheMisses = 0; this.cacheHighWater = 0;
    this.registeredGradeBores = false;
    // The trie exists only during construction, not for every future query.
    const metadataTrie = new Map(), metaPresence = [];
    let id = 0, at = 0, ceiling = 0, vertices = 0, rings = 0, planes = 0, lastMeta = -1, source = 0, packedFacets = 0;
    // A later ordinary getter may change a future batch. Convert only the
    // already-written prefix; never replay a caller getter or an input iterator.
    const fallback = () => {
      this.tags = new Uint32Array(count); this.offsets = new Uint32Array(count + 1);
      this.batchOf = batches ? new (batches < 65536 ? Uint16Array : Uint32Array)(count) : null;
      for (let i = 0; i < id; i++) {
        this.tags[i] = paged.tagAt(i); this.offsets[i] = paged.offsetAt(i);
        if (this.batchOf) this.batchOf[i] = paged.batchAt(i);
      }
      deletePaged(this); paged = null;
    };
    for (const entry of unique) {
      const referenced = entry.packedTops === true;
      if (paged) {
        const plan = plans[this.batches.length];
        if (referenced ? !plan || plan.entry !== entry || plan.start !== id || compactCertificate.owns(entry) !== 'packed'
          || entry.length !== plan.length : plan && plan.start === id) fallback();
      }
      if (referenced) {
        // Same values, order and counters as the records the batch replaces (no extras, ceilings or bores).
        const t = entry.template;
        let meta = lastMeta;
        if (meta < 0 || !sameMetadata(t, this.metadata[meta], metaPresence[meta])) {
          let node = metadataTrie;
          for (const k of COMMON) {
            const value = enumerable(t, k) ? t[k] : ABSENT;
            const key = Object.is(value, -0) ? NEGATIVE_ZERO : value;
            if (!node.has(key)) node.set(key, new Map());
            node = node.get(key);
          }
          meta = node.get(ABSENT);
          if (meta === undefined) {
            meta = this.metadata.length;
            if (meta > META_MASK) throw new RangeError('Too many support metadata templates');
            const record = {};
            for (const k of COMMON) if (enumerable(t, k)) record[k] = t[k];
            this.metadata.push(Object.freeze(record)); metaPresence.push(presenceOf(record)); node.set(ABSENT, meta);
          }
          lastMeta = meta;
        }
        const batch = this.batches.length; this.batches.push(entry);
        if (paged) paged.batchMetaBits[batch] = meta << META_SHIFT;
        for (let i = 0; i < entry.length; i++) {
          const tag = sourceTags[source++];
          if (paged) paged.packed(id, tag, batch);
          else { this.tags[id] = tag | REFERENCED | (meta << META_SHIFT); this.offsets[id] = i; this.batchOf[id] = batch; }
          if (tag & PLANE) planes++;
          vertices += packedCount(entry, i); rings++; packedFacets++;
          id++;
        }
        continue;
      }
      // Each source identity is copied once, in first-source order.
      const t = entry, tag = sourceTags[source++], v = this.values;
      if (paged && tag === undefined) throw new Error('SF compact support ordinary snapshot overflow');
      let meta = lastMeta;
      if (meta < 0 || !sameMetadata(t, this.metadata[meta], metaPresence[meta])) {
        let node = metadataTrie;
        for (const k of COMMON) {
          const value = enumerable(t, k) ? t[k] : ABSENT;
          const key = Object.is(value, -0) ? NEGATIVE_ZERO : value;
          if (!node.has(key)) node.set(key, new Map());
          node = node.get(key);
        }
        meta = node.get(ABSENT);
        if (meta === undefined) {
          meta = this.metadata.length;
          if (meta > META_MASK) throw new RangeError('Too many support metadata templates');
          const record = {};
          for (const k of COMMON) if (enumerable(t, k)) record[k] = t[k];
          this.metadata.push(Object.freeze(record)); metaPresence.push(presenceOf(record)); node.set(ABSENT, meta);
        }
        lastMeta = meta;
      }
      if (paged) paged.ordinary(id, tag | (meta << META_SHIFT), at);
      else { this.tags[id] = tag | (meta << META_SHIFT); this.offsets[id] = at; }
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of t.poly) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
      v[at++] = minX; v[at++] = maxX; v[at++] = minZ; v[at++] = maxZ; v[at++] = t.top;
      if (tag & PLANE) {
        const p = t.plane; planes++;
        v[at++] = p.x; v[at++] = p.y; v[at++] = p.z; v[at++] = p.dx; v[at++] = p.dz;
      }
      for (const [flag, k] of NUMBERS) if (tag & flag) v[at++] = t[k];
      if (t.poly.length >= COUNT_MASK) v[at++] = t.poly.length;
      at = writeRing(v, at, t.poly); vertices += t.poly.length; rings++;
      if (tag & OUTER) { v[at++] = t.outer.length; at = writeRing(v, at, t.outer); vertices += t.outer.length; rings++; }
      if (tag & HOLES) {
        v[at++] = t.holes.length;
        for (const ring of t.holes) { v[at++] = ring.length; at = writeRing(v, at, ring); vertices += ring.length; rings++; }
      }
      // Common metadata is shared; packed values/geometry are never kept here.
      let extra, general = Object.getOwnPropertySymbols(t).length > 0;
      // Allocation-free pre-check; any own enumerable string key outside the skip set is yielded here.
      if (!general) for (const k in t) if (!skipped(k, tag)) { general = true; break; }
      if (general) for (const k of Reflect.ownKeys(t)) {
        // Same skip set as before; cheap key checks run before the enumerability probe.
        if (skipped(k, tag) || !enumerable(t, k)) continue;
        Object.defineProperty(extra ??= {}, k, { value: t[k], enumerable: true });
      }
      // Preserve rare annotations on geometry without retaining raw rings/planes.
      const planeFields = tag & PLANE ? annotations(t.plane, PLANE_KEYS) : undefined;
      const polyFields = ringAnnotations(t.poly), outerFields = tag & OUTER ? ringAnnotations(t.outer) : undefined;
      let holeFields;
      if (tag & HOLES) for (let i = 0; i < t.holes.length; i++) {
        const fields = ringAnnotations(t.holes[i]);
        if (fields) (holeFields ??= new Map()).set(i, fields);
      }
      if (extra || planeFields || polyFields || outerFields || holeFields) this.extras.set(id,
        { fields: extra, geometry: { plane: planeFields, poly: polyFields, outer: outerFields, holes: holeFields } });
      if (t.ceilingOffset) this.ceilingIds[ceiling++] = id;
      if (t.replacesTerrain && Number.isFinite(t.maxReferenceY)) this.registeredGradeBores = true;
      id++;
    }
    if (paged) {
      if (id !== count || source !== count || this.batches.length !== plans.length
        || paged.ordinaryWritten !== paged.ordinaryTags.length || paged.packedWritten !== packedCountTotal
        || paged.batchEntriesWritten !== paged.pageBatchIds.length) throw new Error('SF compact support construction mismatch');
      paged.terminalOffset[0] = at;
    } else this.offsets[count] = at;
    let packedBytes = this.batchOf?.byteLength ?? 0;
    for (const b of this.batches) for (const a of [b.pos, b.facet, b.len, b.ids, b.top, b.anchor, b.slope]) packedBytes += a?.byteLength ?? 0;
    this.stats = Object.freeze({ facets: count, vertices, rings, planes, metadataTemplates: this.metadata.length,
      sparseMetadataEntries: this.extras.size, typedBytes: (paged ? paged.byteLength : this.offsets.byteLength + this.tags.byteLength)
        + this.values.byteLength + this.ceilingIds.byteLength, packedFacets,
      packedBatches: this.batches.length, packedBytes, recordCacheLimit: cacheSize });
    if (paged) Object.setPrototypeOf(this, CompactSupportStore.prototype);
  }

  get cacheStats() { return { records: this.cache.size, limit: this.cacheLimit, misses: this.cacheMisses, highWater: this.cacheHighWater }; }
  get addresses() { return pagedFor(this) ?? null; }
  // Logical snapshots are also useful to layout-independent diagnostics. Raw
  // arrays remain unchanged on the default constructor and fallback paths.
  tagAt(id) { const a = pagedFor(this); return a ? a.tagAt(id) : this.tags[id]; }
  offsetAt(id) { const a = pagedFor(this); return a ? a.offsetAt(id) : this.offsets[id]; }
  batchAt(id) { const a = pagedFor(this); return a ? a.batchAt(id) : this.batchOf?.[id]; }

  getBounds(id, out) {
    if (this.tags[id] & REFERENCED) {
      // Same min/max order over the same ring coordinates the copied bounds were computed from.
      const b = this.batches[this.batchOf[id]], i = this.offsets[id], pos = b.pos, ids = b.ids, n = packedCount(b, i);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k = 0; k < n; k++) {
        const q = ids[i * 4 + k] * 3, x = pos[q], z = pos[q + 2];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      out.minX = minX; out.maxX = maxX; out.minZ = minZ; out.maxZ = maxZ; return out;
    }
    const at = this.offsets[id], v = this.values;
    out.minX = v[at]; out.maxX = v[at + 1]; out.minZ = v[at + 2]; out.maxZ = v[at + 3]; return out;
  }

  property(id, key) {
    const tag = this.tags[id], v = this.values;
    if (tag & REFERENCED) return this.metadata[(tag >>> META_SHIFT) & META_MASK][key]; // template metadata only
    let at = this.offsets[id] + 5 + (tag & PLANE ? 5 : 0);
    if (key === 'minReferenceY' && tag & MIN) return v[at];
    if (tag & MIN) at++;
    if (key === 'maxReferenceY' && tag & MAX) return v[at];
    if (tag & MAX) at++;
    if (key === 'ceilingOffset' && tag & CEILING) return v[at];
    const fields = this.extras.get(id)?.fields;
    return fields && enumerable(fields, key) ? fields[key] : this.metadata[(tag >>> META_SHIFT) & META_MASK][key];
  }

  plane(id, out) {
    if (!(this.tags[id] & PLANE)) return null;
    if (this.tags[id] & REFERENCED) {
      const b = this.batches[this.batchOf[id]], i = this.offsets[id], a = packedAnchor(b, i) * 3, pos = b.pos;
      out.x = pos[a]; out.y = pos[a + 1]; out.z = pos[a + 2]; out.dx = b.slope[i * 2]; out.dz = b.slope[i * 2 + 1]; return out;
    }
    const at = this.offsets[id] + 5, v = this.values;
    out.x = v[at]; out.y = v[at + 1]; out.z = v[at + 2]; out.dx = v[at + 3]; out.dz = v[at + 4]; return out;
  }

  heightAt(id, x, z) {
    if (this.tags[id] & REFERENCED) {
      const b = this.batches[this.batchOf[id]], i = this.offsets[id], a = packedAnchor(b, i);
      if (a < 0) return packedTop(b, i);
      const pos = b.pos, q = a * 3;
      return pos[q + 1] + b.slope[i * 2] * (x - pos[q]) + b.slope[i * 2 + 1] * (z - pos[q + 2]);
    }
    const at = this.offsets[id], v = this.values;
    return this.tags[id] & PLANE ? v[at + 6] + v[at + 8] * (x - v[at + 5]) + v[at + 9] * (z - v[at + 7]) : v[at + 4];
  }

  contains(id, x, z, boundary = true) {
    const tag = this.tags[id], v = this.values;
    if (tag & REFERENCED) {
      const b = this.batches[this.batchOf[id]], i = this.offsets[id];
      return containsPacked(b.pos, b.ids, i * 4, packedCount(b, i), x, z, boundary);
    }
    let at = this.offsets[id] + 5 + (tag & PLANE ? 5 : 0) + (tag & MIN ? 1 : 0)
      + (tag & MAX ? 1 : 0) + (tag & CEILING ? 1 : 0);
    let count = (tag >>> COUNT_SHIFT) & COUNT_MASK;
    if (count === COUNT_MASK) count = v[at++];
    const poly = at; at += count * 2;
    let outer = poly, outerCount = count;
    if (tag & OUTER) { outerCount = v[at++]; outer = at; at += outerCount * 2; }
    if (!containsRing(v, outer, outerCount, x, z, boundary)) return false;
    if (tag & HOLES) {
      const holes = v[at++];
      for (let i = 0; i < holes; i++) {
        const n = v[at++];
        if (containsRing(v, at, n, x, z, !boundary)) return false;
        at += n * 2;
      }
    }
    return true;
  }

  get(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.length) throw new RangeError('Invalid SF support ID');
    let result = this.cache.get(id);
    if (result) return result;
    this.cacheMisses++;
    const tag = this.tags[id], v = this.values, extra = this.extras.get(id);
    let at = this.offsets[id] + 5;
    if (tag & REFERENCED) return this.cacheView(id, this.packedView(id, tag));
    result = { ...this.metadata[(tag >>> META_SHIFT) & META_MASK], ...extra?.fields, top: v[at - 1] };
    if (tag & PLANE) {
      result.plane = Object.freeze({ ...extra?.geometry.plane, x: v[at], y: v[at + 1], z: v[at + 2], dx: v[at + 3], dz: v[at + 4] }); at += 5;
    }
    for (const [flag, k] of NUMBERS) if (tag & flag) result[k] = v[at++];
    let count = (tag >>> COUNT_SHIFT) & COUNT_MASK;
    if (count === COUNT_MASK) count = v[at++];
    const readRing = (n, fields) => {
      const ring = [];
      for (let i = 0; i < n; i++) { ring.push(Object.freeze({ ...fields?.get(i), x: v[at], z: v[at + 1] })); at += 2; }
      return Object.freeze(ring);
    };
    result.poly = readRing(count, extra?.geometry.poly);
    if (tag & OUTER) result.outer = readRing(v[at++], extra?.geometry.outer);
    if (tag & HOLES) {
      const holes = v[at++]; result.holes = [];
      for (let i = 0; i < holes; i++) result.holes.push(readRing(v[at++], extra?.geometry.holes?.get(i)));
      Object.freeze(result.holes);
    }
    this.getBounds(id, result); Object.freeze(result);
    return this.cacheView(id, result);
  }

  cacheView(id, result) {
    if (this.cacheLimit) {
      if (this.cache.size === this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(id, result); this.cacheHighWater = Math.max(this.cacheHighWater, this.cache.size);
    }
    return result;
  }

  // The same frozen view get() builds for a copied facet: metadata, top, plane, poly, then bounds.
  packedView(id, tag) {
    const b = this.batches[this.batchOf[id]], i = this.offsets[id], pos = b.pos;
    const result = { ...this.metadata[(tag >>> META_SHIFT) & META_MASK], top: packedTop(b, i) };
    if (tag & PLANE) {
      const a = packedAnchor(b, i) * 3;
      result.plane = Object.freeze({ x: pos[a], y: pos[a + 1], z: pos[a + 2], dx: b.slope[i * 2], dz: b.slope[i * 2 + 1] });
    }
    const ring = [];
    for (let k = 0, n = packedCount(b, i); k < n; k++) { const q = b.ids[i * 4 + k] * 3; ring.push(Object.freeze({ x: pos[q], z: pos[q + 2] })); }
    result.poly = Object.freeze(ring);
    this.getBounds(id, result);
    return Object.freeze(result);
  }
}

// Only installed after successful compact construction. Raw/default stores keep
// the original prototype and methods, with no per-query compact-state lookup.
// Valid native IDs resolve one page/locator and, for packed facets, one batch.
function compactIndex(id, length) {
  return typeof id === 'number' && id >= 0 && id < length && id === (id >>> 0);
}

class CompactSupportStore extends SfSupportStore {
  getBounds(id, out) {
    const address = pagedFor(this);
    let b, i;
    if (compactIndex(id, address.length)) {
      const index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
      if (locator & 128) {
        const at = address.ordinaryOffsets[address.pageOrdinaryBases[page] + (locator & 127)], v = this.values;
        out.minX = v[at]; out.maxX = v[at + 1]; out.minZ = v[at + 2]; out.maxZ = v[at + 3]; return out;
      }
      const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
      b = this.batches[batch]; i = index - address.batchStarts[batch];
    } else {
      if (!(address.tagAt(id) & REFERENCED)) {
        const at = address.offsetAt(id), v = this.values;
        out.minX = v[at]; out.maxX = v[at + 1]; out.minZ = v[at + 2]; out.maxZ = v[at + 3]; return out;
      }
      b = this.batches[address.batchAt(id)]; i = address.offsetAt(id);
    }
    const pos = b.pos, ids = b.ids, n = packedCount(b, i);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < n; k++) {
      const q = ids[i * 4 + k] * 3, x = pos[q], z = pos[q + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    out.minX = minX; out.maxX = maxX; out.minZ = minZ; out.maxZ = maxZ; return out;
  }

  property(id, key) {
    const address = pagedFor(this);
    let tag, offset, numeric = false;
    if (compactIndex(id, address.length)) {
      numeric = true;
      const index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
      if (locator & 128) {
        const slot = address.pageOrdinaryBases[page] + (locator & 127);
        tag = address.ordinaryTags[slot]; offset = address.ordinaryOffsets[slot];
      } else {
        const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
        tag = REFERENCED | address.batchMetaBits[batch];
      }
    } else tag = address.tagAt(id);
    const v = this.values;
    if (tag & REFERENCED) return this.metadata[(tag >>> META_SHIFT) & META_MASK][key];
    let at = (numeric ? offset : address.offsetAt(id)) + 5 + (tag & PLANE ? 5 : 0);
    if (key === 'minReferenceY' && tag & MIN) return v[at];
    if (tag & MIN) at++;
    if (key === 'maxReferenceY' && tag & MAX) return v[at];
    if (tag & MAX) at++;
    if (key === 'ceilingOffset' && tag & CEILING) return v[at];
    const fields = this.extras.get(id)?.fields;
    return fields && enumerable(fields, key) ? fields[key] : this.metadata[(tag >>> META_SHIFT) & META_MASK][key];
  }

  plane(id, out) {
    const address = pagedFor(this);
    let b, i;
    if (compactIndex(id, address.length)) {
      const index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
      if (locator & 128) {
        const slot = address.pageOrdinaryBases[page] + (locator & 127);
        if (!(address.ordinaryTags[slot] & PLANE)) return null;
        const at = address.ordinaryOffsets[slot] + 5, v = this.values;
        out.x = v[at]; out.y = v[at + 1]; out.z = v[at + 2]; out.dx = v[at + 3]; out.dz = v[at + 4]; return out;
      }
      if (!(locator & PLANE)) return null;
      const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
      b = this.batches[batch]; i = index - address.batchStarts[batch];
    } else {
      if (!(address.tagAt(id) & PLANE)) return null;
      if (!(address.tagAt(id) & REFERENCED)) {
        const at = address.offsetAt(id) + 5, v = this.values;
        out.x = v[at]; out.y = v[at + 1]; out.z = v[at + 2]; out.dx = v[at + 3]; out.dz = v[at + 4]; return out;
      }
      b = this.batches[address.batchAt(id)]; i = address.offsetAt(id);
    }
    const a = packedAnchor(b, i) * 3, pos = b.pos;
    out.x = pos[a]; out.y = pos[a + 1]; out.z = pos[a + 2]; out.dx = b.slope[i * 2]; out.dz = b.slope[i * 2 + 1]; return out;
  }

  heightAt(id, x, z) {
    const address = pagedFor(this);
    let b, i;
    if (compactIndex(id, address.length)) {
      const index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
      if (locator & 128) {
        const slot = address.pageOrdinaryBases[page] + (locator & 127), at = address.ordinaryOffsets[slot], v = this.values;
        return address.ordinaryTags[slot] & PLANE
          ? v[at + 6] + v[at + 8] * (x - v[at + 5]) + v[at + 9] * (z - v[at + 7]) : v[at + 4];
      }
      const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
      b = this.batches[batch]; i = index - address.batchStarts[batch];
    } else {
      if (!(address.tagAt(id) & REFERENCED)) {
        const at = address.offsetAt(id), v = this.values;
        return address.tagAt(id) & PLANE
          ? v[at + 6] + v[at + 8] * (x - v[at + 5]) + v[at + 9] * (z - v[at + 7]) : v[at + 4];
      }
      b = this.batches[address.batchAt(id)]; i = address.offsetAt(id);
    }
    const a = packedAnchor(b, i);
    if (a < 0) return packedTop(b, i);
    const pos = b.pos, q = a * 3;
    return pos[q + 1] + b.slope[i * 2] * (x - pos[q]) + b.slope[i * 2 + 1] * (z - pos[q + 2]);
  }

  contains(id, x, z, boundary = true) {
    const address = pagedFor(this);
    let tag, at, v;
    if (compactIndex(id, address.length)) {
      const index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
      if (!(locator & 128)) {
        const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
        v = this.values;
        const b = this.batches[batch], i = index - address.batchStarts[batch];
        return containsPacked(b.pos, b.ids, i * 4, packedCount(b, i), x, z, boundary);
      }
      const slot = address.pageOrdinaryBases[page] + (locator & 127);
      tag = address.ordinaryTags[slot]; v = this.values; at = address.ordinaryOffsets[slot];
    } else {
      tag = address.tagAt(id); v = this.values;
      if (tag & REFERENCED) {
        const b = this.batches[address.batchAt(id)], i = address.offsetAt(id);
        return containsPacked(b.pos, b.ids, i * 4, packedCount(b, i), x, z, boundary);
      }
      at = address.offsetAt(id);
    }
    at = at + 5 + (tag & PLANE ? 5 : 0) + (tag & MIN ? 1 : 0) + (tag & MAX ? 1 : 0) + (tag & CEILING ? 1 : 0);
    let count = (tag >>> COUNT_SHIFT) & COUNT_MASK;
    if (count === COUNT_MASK) count = v[at++];
    const poly = at; at += count * 2;
    let outer = poly, outerCount = count;
    if (tag & OUTER) { outerCount = v[at++]; outer = at; at += outerCount * 2; }
    if (!containsRing(v, outer, outerCount, x, z, boundary)) return false;
    if (tag & HOLES) {
      const holes = v[at++];
      for (let i = 0; i < holes; i++) {
        const n = v[at++];
        if (containsRing(v, at, n, x, z, !boundary)) return false;
        at += n * 2;
      }
    }
    return true;
  }

  get(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.length) throw new RangeError('Invalid SF support ID');
    let result = this.cache.get(id);
    if (result) return result;
    this.cacheMisses++;
    const address = pagedFor(this), index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
    let tag, slot;
    if (locator & 128) {
      slot = address.pageOrdinaryBases[page] + (locator & 127); tag = address.ordinaryTags[slot];
    } else {
      const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
      tag = (REFERENCED | address.batchMetaBits[batch] | ((3 + ((locator >>> 1) & 1)) << COUNT_SHIFT) | (locator & PLANE)) >>> 0;
    }
    const v = this.values, extra = this.extras.get(id);
    if (tag & REFERENCED) return this.cacheView(id, this.packedView(id, tag));
    let at = address.ordinaryOffsets[slot] + 5;
    result = { ...this.metadata[(tag >>> META_SHIFT) & META_MASK], ...extra?.fields, top: v[at - 1] };
    if (tag & PLANE) {
      result.plane = Object.freeze({ ...extra?.geometry.plane, x: v[at], y: v[at + 1], z: v[at + 2], dx: v[at + 3], dz: v[at + 4] }); at += 5;
    }
    for (const [flag, k] of NUMBERS) if (tag & flag) result[k] = v[at++];
    let count = (tag >>> COUNT_SHIFT) & COUNT_MASK;
    if (count === COUNT_MASK) count = v[at++];
    const readRing = (n, fields) => {
      const ring = [];
      for (let i = 0; i < n; i++) { ring.push(Object.freeze({ ...fields?.get(i), x: v[at], z: v[at + 1] })); at += 2; }
      return Object.freeze(ring);
    };
    result.poly = readRing(count, extra?.geometry.poly);
    if (tag & OUTER) result.outer = readRing(v[at++], extra?.geometry.outer);
    if (tag & HOLES) {
      const holes = v[at++]; result.holes = [];
      for (let i = 0; i < holes; i++) result.holes.push(readRing(v[at++], extra?.geometry.holes?.get(i)));
      Object.freeze(result.holes);
    }
    this.getBounds(id, result); Object.freeze(result);
    return this.cacheView(id, result);
  }

  packedView(id, tag) {
    const address = pagedFor(this);
    let b, i;
    if (compactIndex(id, address.length)) {
      const index = id === 0 ? 0 : id, locator = address.locator[index], page = index >>> 7;
      if (locator & 128) {
        b = this.batches[0]; i = address.ordinaryOffsets[address.pageOrdinaryBases[page] + (locator & 127)];
      } else {
        const batch = address.pageBatchIds[address.pageBatchBases[page] + (locator >>> 2)];
        b = this.batches[batch]; i = index - address.batchStarts[batch];
      }
    } else { b = this.batches[address.batchAt(id)]; i = address.offsetAt(id); }
    const pos = b.pos, result = { ...this.metadata[(tag >>> META_SHIFT) & META_MASK], top: packedTop(b, i) };
    if (tag & PLANE) {
      const a = packedAnchor(b, i) * 3;
      result.plane = Object.freeze({ x: pos[a], y: pos[a + 1], z: pos[a + 2], dx: b.slope[i * 2], dz: b.slope[i * 2 + 1] });
    }
    const ring = [];
    for (let k = 0, n = packedCount(b, i); k < n; k++) { const q = b.ids[i * 4 + k] * 3; ring.push(Object.freeze({ x: pos[q], z: pos[q + 2] })); }
    result.poly = Object.freeze(ring);
    this.getBounds(id, result);
    return Object.freeze(result);
  }
}
Object.defineProperty(CompactSupportStore.prototype, 'constructor', { value: SfSupportStore, writable: true, configurable: true });
