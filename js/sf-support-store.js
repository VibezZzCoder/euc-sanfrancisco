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

/** Variable-ring CSR geometry plus interned common metadata. Only the bounded
 * query cache owns object/vertex/plane views; eviction never recycles a view.
 * Sparse extras preserve uncommon enumerable diagnostics, including symbols.
 */
export class SfSupportStore {
  constructor(lists, { cacheSize = 256 } = {}) {
    if (!Number.isInteger(cacheSize) || cacheSize < 0) throw new RangeError('Invalid support view cache size');
    // Construction-local identity dedupe in first-source order. A strong Set plus one
    // unique list replaces repeated WeakSet probes; both are dropped after construction.
    const seen = new Set(), unique = [];
    let sourceTags = new Uint32Array(1024);
    let count = 0, doubles = 0, ceilings = 0, batches = 0;
    for (const list of lists) for (const t of list) {
      // Do not touch geometry, metadata or accessors on ignored reservations.
      if (t.rideIgnore === true || seen.has(t)) continue;
      seen.add(t); unique.push(t);
      // A packed batch (sf-ride-geometry.js PackedTops) stands for its facets, in order: each is a plain record with
      // only poly/top/plane and the batch's template metadata, so its tag and size follow from the typed arrays.
      const facets = t.packedTops === true ? t.length : 1;
      if (count + facets > sourceTags.length) {
        const grown = new Uint32Array(Math.max(count * 2, count + facets)); grown.set(sourceTags); sourceTags = grown;
      }
      if (facets === 1 && t.packedTops !== true) {
        const tag = tagOf(t); sourceTags[count++] = tag;
        doubles += sizeOf(t, tag); if (t.ceilingOffset) ceilings++;
      } else {
        // Referenced, not copied: the batch's typed arrays become the store's for these facets.
        batches++;
        for (let i = 0; i < facets; i++) sourceTags[count++] = (packedAnchor(t, i) >= 0 ? PLANE : 0) | (Math.min(COUNT_MASK, packedCount(t, i)) << COUNT_SHIFT);
      }
    }
    seen.clear();
    if (count >= 0xffffffff || doubles > 0xffffffff) throw new RangeError('SF support store exceeds Uint32 offsets');
    this.length = count;
    this.offsets = new Uint32Array(count + 1);
    this.tags = new Uint32Array(count);
    this.values = new Float64Array(doubles);
    this.ceilingIds = new Uint32Array(ceilings);
    this.metadata = []; this.extras = new Map();
    this.batches = []; this.batchOf = batches ? new (batches < 65536 ? Uint16Array : Uint32Array)(count) : null;
    this.cache = new Map(); this.cacheLimit = cacheSize; this.cacheMisses = 0; this.cacheHighWater = 0;
    this.registeredGradeBores = false;
    // The trie exists only during construction, not for every future query.
    const metadataTrie = new Map(), metaPresence = [];
    let id = 0, at = 0, ceiling = 0, vertices = 0, rings = 0, planes = 0, lastMeta = -1, source = 0, packedFacets = 0;
    for (const entry of unique) {
      if (entry.packedTops === true) {
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
        for (let i = 0; i < entry.length; i++) {
          const tag = sourceTags[source++];
          this.tags[id] = tag | REFERENCED | (meta << META_SHIFT); this.offsets[id] = i; this.batchOf[id] = batch;
          if (tag & PLANE) planes++;
          vertices += packedCount(entry, i); rings++; packedFacets++;
          id++;
        }
        continue;
      }
      // Each source identity is copied once, in first-source order.
      const t = entry, tag = sourceTags[source++], v = this.values;
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
      this.tags[id] = tag | (meta << META_SHIFT); this.offsets[id] = at;
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
    this.offsets[count] = at;
    let packedBytes = this.batchOf?.byteLength ?? 0;
    for (const b of this.batches) for (const a of [b.pos, b.facet, b.len, b.ids, b.top, b.anchor, b.slope]) packedBytes += a?.byteLength ?? 0;
    this.stats = Object.freeze({ facets: count, vertices, rings, planes, metadataTemplates: this.metadata.length,
      sparseMetadataEntries: this.extras.size, typedBytes: this.offsets.byteLength + this.tags.byteLength
        + this.values.byteLength + this.ceilingIds.byteLength, packedFacets,
      packedBatches: this.batches.length, packedBytes, recordCacheLimit: cacheSize });
  }

  get cacheStats() { return { records: this.cache.size, limit: this.cacheLimit, misses: this.cacheMisses, highWater: this.cacheHighWater }; }

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
