(function () {
// Construction-time, world-space EUC contacts. MIT; city derivations retain ../NOTICE.md.
// No Three dependency, visibility queries, mesh retention or global spatial grid here.
const N = window.NYC;
let ownedRide = null;
N.ride = N.ride || (ownedRide = { tops: [], solids: [], prisms: [] });
// Opt-in only: the host starts this before building a Light world. Unknown or
// caller-owned records are never certified, and the weak tables are discarded
// immediately after the authoritative sampler is built.
let supportCertificate = null;
const compactSupportTokens = new WeakSet();
const weakSetHas = Function.call.bind(WeakSet.prototype.has), weakSetAdd = Function.call.bind(WeakSet.prototype.add),
  weakSetDelete = Function.call.bind(WeakSet.prototype.delete), weakMapGet = Function.call.bind(WeakMap.prototype.get),
  weakMapSet = Function.call.bind(WeakMap.prototype.set);
const finite = Number.isFinite;
const xyz = (p) => ({ x: p.x, y: p.y, z: p.z });
const ring = (p) => p.map((v) => ({ x: v.x ?? v[0], z: v.z ?? v[1] }));
const validRing = (p) => p.length >= 3 && p.every((v) => finite(v.x) && finite(v.z));
const planeAt = (p, x, z) => p.y + p.dx * (x - p.x) + p.dz * (z - p.z);
const BITS = new Float64Array(1), WORDS = new Uint32Array(BITS.buffer); // addTriangles hash scratch
// NYC 7cf4ce7, city-grid.js::addRideMesh: profiles opt in, actual world-space slopes own transitions.
const transitionOf = (capabilities, plane) => capabilities.transition === 'slope'
  ? Math.hypot(plane?.dx ?? 0, plane?.dz ?? 0) > 1e-6 : capabilities.transition === true;

function addTop(poly, top, surface = 'pavement', options = {}) {
  return addTopRing(ring(poly), top, surface, options);
}
// `p` is an already-copied ring of {x, z} objects. addTriangles passes rings whose point objects are shared by every
// facet using the same mesh vertex (read-only: no consumer mutates registered points), instead of one fresh copy per
// facet corner. Millions of draped-ground facets made those copies the largest startup allocation (phone memory).
function addTopRing(p, top, surface = 'pavement', options = {}) {
  if (!validRing(p) || !finite(top)) return null;
  const r = { poly: p, top, surface, layered: !!options.layered, shore: !!options.shore };
  if (options.plane) {
    const q = options.plane;
    if (![q.x, q.y, q.z, q.dx, q.dz].every(finite)) return null;
    r.plane = { x: q.x, y: q.y, z: q.z, dx: q.dx, dz: q.dz };
  }
  for (const k of ['replacesTerrain', 'minReferenceY', 'maxReferenceY']) if (options[k] !== undefined) r[k] = options[k];
  if (options.capabilities) r.capabilities = { ...options.capabilities, transition: transitionOf(options.capabilities, r.plane) };
  if (options.source !== undefined) r.source = options.source;
  if (supportCertificate) weakSetAdd(supportCertificate.records, r);
  N.ride.tops.push(r);
  return r;
}
function addBox(centre, halfExtents, rotationY = 0, options = {}) {
  if (![centre.x, centre.y, centre.z, halfExtents.x, halfExtents.y, halfExtents.z, rotationY].every(finite) ||
      halfExtents.x <= 0 || halfExtents.y <= 0 || halfExtents.z <= 0) return null;
  const r = { centre: xyz(centre), halfExtents: xyz(halfExtents), rotationY, surface: options.surface || 'pavement', support: false };
  // Only explicit actual bar boxes opt in. Never infer a shell envelope from a whole mesh or its bounds.
  if (options.wheelSweep === true) r.wheelSweep = true;
  if (options.source !== undefined) r.source = options.source;
  N.ride.solids.push(r);
  if (options.top) addTop(boxPoly(centre, halfExtents, rotationY), centre.y + halfExtents.y, r.surface, options);
  return r;
}
function addPrism(outer, minY, maxY, options = {}) {
  const p = ring(outer);
  if (!validRing(p) || !finite(minY) || !finite(maxY) || maxY <= minY) return null;
  const r = { outer: p, minY, maxY, surface: options.surface || 'pavement', support: false };
  if (options.source !== undefined) r.source = options.source;
  if (options.holes?.length) r.holes = options.holes.map(ring).filter(validRing);
  N.ride.prisms.push(r);
  return r;
}

// Only region.js's building boxes / eight-sided trunks have this ownership contract:
// no rendering, acoustic, navigation or external collider owner keeps the returned body.
// Keep ordinary records throughout construction (notably the later tunnel foundation scan).
// The sampler may transfer these records ONLY at the explicit successful registry handoff.
// Weak certificates neither retain bodies nor alter their keys/geometry/default caller API.
function regionalBody(body, kind) {
  if (!body) return body;
  let regionalBodies = N.ride.regionalBodies;
  if (!regionalBodies) {
    regionalBodies = Object.freeze({ boxes: new WeakSet(), prisms: new WeakSet(),
      objectPrototype: Object.prototype, arrayPrototype: Array.prototype });
    Object.defineProperty(N.ride, 'regionalBodies', { value: regionalBodies, configurable: true });
  }
  regionalBodies[kind].add(body);
  return body;
}
function addRegionalBox(centre, halfExtents, rotationY, options) {
  return regionalBody(addBox(centre, halfExtents, rotationY, options), 'boxes');
}
function addRegionalPrism(outer, minY, maxY, options) {
  return regionalBody(addPrism(outer, minY, maxY, options), 'prisms');
}

// Only exact shared edges, opposite interiors and coplanar triangles may merge. One bounded
// map per call; pairs become quads, never hulls that fill concave gaps or holes.
function addTriangles(pos, idx, surface = 'pavement', options = {}) {
  if (options.packed) return addTrianglesPacked(pos, idx, surface, options);
  const records = [];
  const length = idx ? idx.length : pos.length / 3;
  const get = (i) => { const k = (idx ? idx[i] : i) * 3; return { x: pos[k], y: pos[k + 1], z: pos[k + 2] }; };
  // One shared {x, z} per mesh vertex for registered rings (the same values ring() would copy).
  const points = new Array(Math.ceil(pos.length / 3));
  const pointAt = (i) => { const v = idx ? idx[i] : i; return points[v] ??= { x: pos[v * 3], z: pos[v * 3 + 2] }; };
  // Edge identity is unchanged from the original `${x},${z}` text keys. Merged vertices always have
  // finite x/z (any non-finite coordinate makes `ny` non-finite and the triangle is skipped), and
  // shortest round-trip number formatting is injective on finite doubles except -0/+0, which ===
  // also equates. So equal text <=> equal numeric pair <=> equal interned ID. The directed-edge map
  // (last write wins) is a per-call linked table on those IDs instead of concatenated string keys.
  const vertexCount = Math.ceil(pos.length / 3), merging = options.merge !== false;
  const vertexIds = merging ? new Int32Array(vertexCount).fill(-1) : null;
  let slots = 1024, slotX = new Float64Array(slots), slotZ = new Float64Array(slots), slotId = new Int32Array(slots).fill(-1), interned = 0;
  const slotOf = (x, z) => {
    BITS[0] = x; let h = Math.imul(WORDS[0] ^ 0x9e3779b9, 0x85ebca6b) ^ WORDS[1];
    BITS[0] = z; h = Math.imul(h ^ WORDS[0], 0xc2b2ae35) ^ Math.imul(WORDS[1], 0x27d4eb2f);
    let s = (h ^ (h >>> 15)) & (slots - 1);
    while (slotId[s] >= 0 && !(slotX[s] === x && slotZ[s] === z)) s = (s + 1) & (slots - 1);
    return s;
  };
  const intern = (x, z) => {
    if (x === 0) x = 0; if (z === 0) z = 0; // -0 -> +0, as in text
    const s = slotOf(x, z);
    if (slotId[s] >= 0) return slotId[s];
    slotX[s] = x; slotZ[s] = z; slotId[s] = interned;
    if (++interned * 2 > slots) {
      const ox = slotX, oz = slotZ, oid = slotId;
      slots *= 2; slotX = new Float64Array(slots); slotZ = new Float64Array(slots); slotId = new Int32Array(slots).fill(-1);
      for (let o = 0; o < oid.length; o++) if (oid[o] >= 0) {
        const n = slotOf(ox[o], oz[o]); slotX[n] = ox[o]; slotZ[n] = oz[o]; slotId[n] = oid[o];
      }
    }
    return interned - 1;
  };
  const edgeHead = merging ? new Int32Array(vertexCount).fill(-1) : null, edgeRecord = [];
  let edgeTo = new Int32Array(merging ? 1024 : 0), edgeNext = new Int32Array(edgeTo.length);
  const edgeGet = (from, to) => {
    for (let e = edgeHead[from]; e >= 0; e = edgeNext[e]) if (edgeTo[e] === to) return edgeRecord[e];
    return undefined;
  };
  const edgeSet = (from, to, r) => {
    for (let e = edgeHead[from]; e >= 0; e = edgeNext[e]) if (edgeTo[e] === to) { edgeRecord[e] = r; return; }
    const e = edgeRecord.length;
    if (e === edgeTo.length) {
      const to2 = new Int32Array(e * 2), next2 = new Int32Array(e * 2);
      to2.set(edgeTo); next2.set(edgeNext); edgeTo = to2; edgeNext = next2;
    }
    edgeTo[e] = to; edgeNext[e] = edgeHead[from]; edgeHead[from] = e; edgeRecord.push(r);
  };
  const keyAt = (i) => {
    const v = idx ? idx[i] : i;
    let id = vertexIds[v];
    if (id === undefined || id < 0) { id = intern(pos[v * 3], pos[v * 3 + 2]); vertexIds[v] = id; }
    return id;
  };
  for (let t = 0; t + 2 < length; t += 3) {
    const ib = t + (options.flipWinding ? 2 : 1), ic = t + (options.flipWinding ? 1 : 2);
    const a = get(t), b = get(ib), c = get(ic);
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const ny = uz * vx - ux * vz;
    // Some inherited double-sided ribbons have upward vertex normals but reversed winding.
    // That exception is opt-in; default extraction never registers undersides.
    if (!finite(ny) || Math.abs(ny) < 1e-10 || (ny < 0 && !options.doubleSided)) continue;
    const dx = (uy * vz - uz * vy) / -ny, dz = (ux * vy - uy * vx) / -ny;
    const plane = { x: a.x, y: a.y, z: a.z, dx, dz };
    let pts = ny > 0 ? [a, b, c] : [a, c, b], joined = false;
    const shared = ny > 0 ? [pointAt(t), pointAt(ib), pointAt(ic)] : [pointAt(t), pointAt(ic), pointAt(ib)];
    const keys = merging && (ny > 0 ? [keyAt(t), keyAt(ib), keyAt(ic)] : [keyAt(t), keyAt(ic), keyAt(ib)]);
    if (merging) for (let e = 0; e < 3; e++) {
      const u = pts[e], v = pts[(e + 1) % 3];
      const other = edgeGet(keys[(e + 1) % 3], keys[e]);
      if (!other || other.poly.length !== 3) continue;
      // Near-coplanar merge tolerance must not cross the explicit slope capability threshold.
      if (options.capabilities?.transition === 'slope' && other.capabilities.transition !== transitionOf(options.capabilities, plane)) continue;
      const op = other.plane || { x: 0, y: other.top, z: 0, dx: 0, dz: 0 };
      if (Math.abs(op.dx - dx) > 1e-8 || Math.abs(op.dz - dz) > 1e-8 || pts.some((p) => Math.abs(planeAt(op, p.x, p.z) - p.y) > 1e-5)) continue;
      const k = other.poly.findIndex((p) => p.x === v.x && p.z === v.z); // == text-key equality (finite)
      const w = other.poly[(k + 2) % 3], q = pts[(e + 2) % 3];
      const side = (p) => (v.x - u.x) * (p.z - u.z) - (v.z - u.z) * (p.x - u.x);
      if (side(w) * side(q) >= 0) continue;
      other.poly = [other.poly[k], shared[(e + 2) % 3], other.poly[(k + 1) % 3], w]; // shared[(e+2)%3] has q's x/z
      other.top = Math.max(other.top, a.y, b.y, c.y);
      joined = true;
      break;
    }
    if (joined) continue;
    const r = addTopRing(shared, Math.max(a.y, b.y, c.y), surface, { ...options, plane: Math.abs(dx) + Math.abs(dz) > 1e-12 ? plane : undefined });
    if (!r) continue;
    records.push(r);
    if (merging) for (let e = 0; e < 3; e++) edgeSet(keys[e], keys[(e + 1) % 3], r);
  }
  return records;
}

// mesh.geometry + mesh.matrixWorld (or a supplied matrix) are sufficient: useful before
// batching/instancing. Optional `bodies` are explicit WORLD-space boxes/prisms. No implicit
// bounding box of an entire shelter, colonnade, bridge or merged city mesh is ever solid.
function addMesh(mesh, surface = 'pavement', options = {}) {
  if (mesh.updateWorldMatrix) mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry, attr = g?.getAttribute ? g.getAttribute('position') : g?.attributes?.position;
  const result = { tops: [], solids: [], prisms: [] };
  if (!attr || !finite(attr.count)) return result;
  const m = (options.matrix || mesh.matrixWorld)?.elements;
  const pos = new Float64Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i), k = i * 3;
    pos[k] = m ? m[0] * x + m[4] * y + m[8] * z + m[12] : x;
    pos[k + 1] = m ? m[1] * x + m[5] * y + m[9] * z + m[13] : y;
    pos[k + 2] = m ? m[2] * x + m[6] * y + m[10] * z + m[14] : z;
  }
  const determinant = m ? m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]) : 1;
  if (options.tops !== false) result.tops = addTriangles(pos, g.index?.array || null, surface, { ...options, flipWinding: determinant < 0 });
  // Explicit convex parts only. A small stack of horizontal projected hulls bounds a
  // tapered/leaning part without a triangle soup of boxes. Never use on concave masses,
  // holed extrusions, foliage, whole groups, shelters or scene reservation rectangles.
  if (options.sides) {
    result.prisms = convexSlices(pos, g.index?.array || null, surface, options.sides);
    for (const r of result.prisms) N.ride.prisms.push(r);
  }
  for (const b of options.bodies || []) {
    const r = b.outer ? addPrism(b.outer, b.minY, b.maxY, { ...b, surface }) : addBox(b.centre, b.halfExtents, b.rotationY || 0,
      { surface, wheelSweep: b.wheelSweep, source: b.source });
    if (r) (b.outer ? result.prisms : result.solids).push(r);
  }
  return result;
}

// Pure counterpart used to cache a handful of species/variant trunk profiles.
function convexSlices(pos, idx, surface = 'pavement', options = {}) {
  let lo = Infinity, hi = -Infinity;
  for (let k = 1; k < pos.length; k += 3) { lo = Math.min(lo, pos[k]); hi = Math.max(hi, pos[k]); }
  lo = Math.max(lo, options.minY ?? lo); hi = Math.min(hi, options.maxY ?? hi);
  if (!(hi - lo > 1e-6)) return [];
  const count = Math.min(options.maxSlices || 24, Math.max(1, Math.ceil((hi - lo) / (options.sliceHeight || 0.5))));
  const out = [], n = idx ? idx.length : pos.length / 3;
  const get = (i) => { const k = (idx ? idx[i] : i) * 3; return { x: pos[k], y: pos[k + 1], z: pos[k + 2] }; };
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  for (let j = 0; j < count; j++) {
    const y0 = lo + (hi - lo) * j / count, y1 = lo + (hi - lo) * (j + 1) / count, pts = [];
    for (let t = 0; t + 2 < n; t += 3) {
      const tri = [get(t), get(t + 1), get(t + 2)];
      for (let k = 0; k < 3; k++) {
        const a = tri[k], b = tri[(k + 1) % 3];
        if (a.y >= y0 && a.y <= y1) pts.push({ x: a.x, z: a.z });
        for (const y of [y0, y1]) if ((a.y < y && b.y > y) || (a.y > y && b.y < y)) {
          const f = (y - a.y) / (b.y - a.y);
          pts.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
        }
      }
    }
    pts.sort((a, b) => a.x - b.x || a.z - b.z);
    const half = (list) => {
      const h = [];
      for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 1e-10) h.pop(); h.push(p); }
      h.pop(); return h;
    };
    const hull = half(pts).concat(half(pts.slice().reverse()));
    if (hull.length < 3) continue;
    const prev = out[out.length - 1];
    // Constant-section poles collapse to one prism even if many bands were requested.
    if (prev && prev.outer.length === hull.length && hull.every((p, k) => Math.abs(p.x - prev.outer[k].x) < 1e-8 && Math.abs(p.z - prev.outer[k].z) < 1e-8)) prev.maxY = y1;
    else out.push({ outer: hull, minY: y0, maxY: y1, surface, support: false });
  }
  return out;
}

// Extra construction utility: yawed rectangle corners, same R_y convention as Three/native EUC.
function boxPoly(centre, halfExtents, rotationY = 0) {
  const c = Math.cos(rotationY), s = Math.sin(rotationY);
  return [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => ({
    x: centre.x + a * halfExtents.x * c + b * halfExtents.z * s,
    z: centre.z - a * halfExtents.x * s + b * halfExtents.z * c
  }));
}
// Packed facets (phone memory). Millions of small facets used to be one JS record object each (plus ring and plane
// objects): the largest startup allocation, and iOS kills the tab when it crosses its memory limit. A PackedTops batch
// is ONE registry entry holding facets in typed arrays, in creation order: record(i) materializes exactly the record
// addTriangles would have registered (same keys, order and values) and SfSupportStore packs batches directly.
// `packed: true` gives a call its own batch; `packed: run` (RideGeometry.packedRun()) lets consecutive calls share one,
// appending only while that batch is still the registry's last entry (so registry order never changes).
// Vertices used by facets are copied into the batch with the input's own element type (Float32 or Float64), so every
// coordinate reads back as the same number. Only options that cannot change a record are accepted.
const PACKED_OPTIONS = new Set(['packed', 'replacesTerrain', 'layered', 'shore', 'flipWinding', 'sides']);
// One byte per facet: bit 0 = quad, bits 1–3 = plane anchor's ring slot + 1 (0 = no plane),
// bits 4–5 = top's ring slot, bit 6 = sparse exact top override. A merged near-coplanar edge can
// discard a duplicate vertex with a different Y: its old Math.max result is NOT always a ring Y.
const TOP_OVERRIDE = 64;
class PackedTops {
  constructor(PosArray, template) {
    this.packedTops = true;
    this.template = template; // same COMMON metadata fields, in the same order, as each record addTopRing builds
    this.length = 0; this.vertices = 0;
    this.pos = new PosArray(48);
    this.facet = new Uint8Array(16);
    this.ids = new Uint16Array(64);          // promoted before any vertex index could wrap
    this.topOverrides = null;               // only exceptional merged heights; no ordinary per-facet doubles
    this.slope = new Float64Array(32);       // plane dx, dz
    // Construction's skatepark scan still reads batch.top[i]. Keep that read-only indexed interface
    // without allocating another array (or one accessor per facet). Store/query hot paths use topAt.
    this.top = new Proxy(Object.freeze({}), { get: (_, key) => {
      if (key === 'length') return this.length;
      if (typeof key !== 'string') return undefined;
      const i = Number(key);
      return Number.isInteger(i) && i >= 0 && i < this.length && String(i) === key ? this.topAt(i) : undefined;
    } });
  }
  reserve(facets, vertices) {
    const grow = (a, n) => { if (a.length >= n) return a; const b = new a.constructor(Math.max(n, a.length * 2)); b.set(a); return b; };
    const f = this.length + facets, v = this.vertices + vertices;
    // Construction's edge/local tables use signed indices and -1 sentinels. Fail explicitly beyond
    // their existing representable range; within it, wide batches retain every index as Uint32.
    if (!Number.isSafeInteger(f) || !Number.isSafeInteger(v) || f < 0 || v < 0 || f > 0x7fffffff || v > 0x7fffffff) {
      throw new RangeError('Packed ride tops exceed construction index bounds');
    }
    if (v > 0x10000 && this.ids.BYTES_PER_ELEMENT === 2) this.ids = new Uint32Array(this.ids);
    this.facet = grow(this.facet, f); this.ids = grow(this.ids, f * 4);
    this.slope = grow(this.slope, f * 2); this.pos = grow(this.pos, v * 3);
  }
  trim() {
    const n = this.length;
    this.facet = this.facet.slice(0, n); this.ids = this.ids.slice(0, n * 4);
    this.slope = this.slope.slice(0, n * 2); this.pos = this.pos.slice(0, this.vertices * 3);
    return this;
  }
  countAt(i) { return 3 + (this.facet[i] & 1); }
  anchorAt(i) {
    const slot = ((this.facet[i] >>> 1) & 7) - 1;
    return slot < 0 ? -1 : this.ids[i * 4 + slot];
  }
  topAt(i) {
    const f = this.facet[i];
    return f & TOP_OVERRIDE ? this.topOverrides.get(i) : this.pos[this.ids[i * 4 + ((f >>> 4) & 3)] * 3 + 1];
  }
  setTop(i, top) {
    // Object.is preserves signed zero as well as all finite Float64 values. Keep Math.max's NaN in
    // the override rather than substituting a source NaN payload. Never reconstruct Y from the plane:
    // even equivalent plane arithmetic can round differently from the source vertex.
    const n = Number.isNaN(top) ? 0 : this.countAt(i), base = i * 4;
    for (let k = 0; k < n; k++) if (Object.is(this.pos[this.ids[base + k] * 3 + 1], top)) {
      this.facet[i] = (this.facet[i] & 15) | (k << 4);
      this.topOverrides?.delete(i);
      return;
    }
    this.facet[i] = (this.facet[i] & 15) | TOP_OVERRIDE;
    (this.topOverrides ??= new Map()).set(i, top);
  }
  record(i) {
    const pos = this.pos, n = this.countAt(i), poly = new Array(n), T = this.template;
    for (let k = 0; k < n; k++) { const v = this.ids[i * 4 + k] * 3; poly[k] = { x: pos[v], z: pos[v + 2] }; }
    const r = { poly, top: this.topAt(i), surface: T.surface, layered: T.layered, shore: T.shore };
    const a = this.anchorAt(i);
    if (a >= 0) r.plane = { x: pos[a * 3], y: pos[a * 3 + 1], z: pos[a * 3 + 2], dx: this.slope[i * 2], dz: this.slope[i * 2 + 1] };
    if ('replacesTerrain' in T) r.replacesTerrain = T.replacesTerrain;
    return r;
  }
}
class PackedRun {
  constructor() { this.batch = null; this.closed = false; }
  // The run's batch if it is still the registry's last entry with the same element type and metadata, else a new one.
  batchFor(tops, PosArray, template) {
    if (this.closed) throw new Error('Packed ride-top run is closed');
    const b = this.batch;
    if (b && tops[tops.length - 1] === b && b.pos instanceof PosArray && sameTemplate(b.template, template)) return b;
    if (b) b.trim();
    return (this.batch = rememberPacked(new PackedTops(PosArray, template)));
  }
  close() { this.batch?.trim(); this.batch = null; this.closed = true; }
}
const packedMethods = { countAt: PackedTops.prototype.countAt, anchorAt: PackedTops.prototype.anchorAt,
  topAt: PackedTops.prototype.topAt };
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedGetters = Object.fromEntries(['length', 'buffer', 'byteLength', 'byteOffset']
  .map(key => [key, Object.getOwnPropertyDescriptor(typedPrototype, key).get]));
const resizableGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function rememberPacked(batch) {
  if (supportCertificate) weakMapSet(supportCertificate.batches, batch, { template: batch.template, top: batch.top });
  return batch;
}

// Inspect only objects made here; a foreign Proxy or getter is never probed for
// certification. Ordinary records keep their complete existing sparse extras.
function plainDataProperties(object) {
  if (Object.getPrototypeOf(object) !== Object.prototype) return false;
  for (const key of Reflect.ownKeys(object)) {
    if (!('value' in Object.getOwnPropertyDescriptor(object, key))) return false;
  }
  return true;
}
function certifiedPacked(batch, certificate) {
  const { template, top } = certificate;
  if (Object.getPrototypeOf(batch) !== PackedTops.prototype) return false;
  for (const [key, method] of Object.entries(packedMethods)) {
    if (Object.getOwnPropertyDescriptor(PackedTops.prototype, key)?.value !== method || Object.hasOwn(batch, key)) return false;
  }
  const own = key => Object.getOwnPropertyDescriptor(batch, key);
  for (const key of ['packedTops', 'template', 'length', 'vertices', 'pos', 'facet', 'ids', 'slope', 'top', 'topOverrides']) {
    if (!own(key) || !('value' in own(key))) return false;
  }
  if (Reflect.ownKeys(batch).length !== 10 || batch.packedTops !== true || batch.template !== template || batch.top !== top
    || !plainDataProperties(template)) return false;
  const keys = Reflect.ownKeys(template);
  if (keys.some(k => !['surface', 'layered', 'shore', 'replacesTerrain'].includes(k))
    || !Object.hasOwn(template, 'surface') || typeof template.surface !== 'string'
    || !Object.hasOwn(template, 'layered') || typeof template.layered !== 'boolean'
    || !Object.hasOwn(template, 'shore') || typeof template.shore !== 'boolean'
    || (Object.hasOwn(template, 'replacesTerrain') && typeof template.replacesTerrain !== 'boolean')
    || keys.some(k => !Object.getOwnPropertyDescriptor(template, k).enumerable)) return false;
  const n = batch.length, vertices = batch.vertices, { pos, facet, ids, slope } = batch;
  const typed = (value, types) => {
    if (!ArrayBuffer.isView(value) || !types.some(type => Object.getPrototypeOf(value) === type.prototype)) return false;
    const prototype = Object.getPrototypeOf(value);
    for (const key of Object.keys(typedGetters)) {
      if (Object.hasOwn(value, key) || Object.hasOwn(prototype, key)
        || Object.getOwnPropertyDescriptor(typedPrototype, key)?.get !== typedGetters[key]) return false;
    }
    const buffer = typedGetters.buffer.call(value);
    return Object.getPrototypeOf(buffer) === ArrayBuffer.prototype && !Object.hasOwn(buffer, 'resizable')
      && Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get === resizableGetter
      && !(resizableGetter && resizableGetter.call(buffer));
  };
  return Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(vertices) && vertices >= 0
    && typed(pos, [Float32Array, Float64Array]) && typed(facet, [Uint8Array])
    && typed(ids, [Uint16Array, Uint32Array]) && typed(slope, [Float64Array])
    && typedGetters.length.call(pos) >= vertices * 3 && typedGetters.length.call(facet) >= n
    && typedGetters.length.call(ids) >= n * 4 && typedGetters.length.call(slope) >= n * 2
    && batch.topOverrides === null;
}
function beginCompactSupport() {
  if (!ownedRide || N.ride !== ownedRide || supportCertificate) return null;
  const state = { records: new WeakSet(), batches: new WeakMap() };
  supportCertificate = state;
  const token = Object.freeze({
    registry: ownedRide,
    tops: ownedRide.tops,
    emptyTops: Object.freeze([]),
    owns(entry) {
      if (!state.records) return null;
      if (weakSetHas(state.records, entry)) return plainDataProperties(entry) ? 'ordinary' : null;
      const batch = weakMapGet(state.batches, entry);
      return batch && certifiedPacked(entry, batch) ? 'packed' : null;
    },
    release() {
      if (supportCertificate === state) supportCertificate = null;
      state.records = null; state.batches = null;
      weakSetDelete(compactSupportTokens, token);
    }
  });
  weakSetAdd(compactSupportTokens, token);
  return token;
}
function isCompactSupportToken(token) { return weakSetHas(compactSupportTokens, token); }
const sameTemplate = (a, b) => a.surface === b.surface && a.layered === b.layered && a.shore === b.shore
  && ('replacesTerrain' in a) === ('replacesTerrain' in b) && a.replacesTerrain === b.replacesTerrain;
// Registry entries with packed batches expanded to plain records (tests, diagnostics; allocates every record).
function expandTops(list) {
  const out = [];
  for (const t of list) if (t?.packedTops === true) for (let i = 0; i < t.length; i++) out.push(t.record(i)); else out.push(t);
  return out;
}

// addTriangles' algorithm (same interning, edge table, merge tests and arithmetic) writing typed arrays. Packed options
// exclude doubleSided/capabilities/plane/merge:false/reference heights, so every kept face has ny > 0.
function addTrianglesPacked(pos, idx, surface, options) {
  for (const k of Object.keys(options)) if (!PACKED_OPTIONS.has(k)) throw new Error(`Packed ride tops do not support option '${k}'`);
  if (!ArrayBuffer.isView(pos)) throw new Error('Packed ride tops need typed positions');
  const template = { surface, layered: !!options.layered, shore: !!options.shore };
  if (options.replacesTerrain !== undefined) template.replacesTerrain = options.replacesTerrain;
  const tops = N.ride.tops, run = options.packed === true ? null : options.packed;
  const batch = run ? run.batchFor(tops, pos.constructor, template) : rememberPacked(new PackedTops(pos.constructor, template));
  let registered = tops[tops.length - 1] === batch;
  const length = idx ? idx.length : pos.length / 3;
  const vertexCount = Math.ceil(pos.length / 3);
  batch.reserve(Math.floor(length / 3), vertexCount);
  const { facet, ids, slope } = batch, B = batch.pos;
  const local = new Int32Array(vertexCount).fill(-1); // mesh vertex -> batch vertex
  const vid = (v) => {
    let b = local[v];
    if (b < 0) { b = local[v] = batch.vertices++; B[b * 3] = pos[v * 3]; B[b * 3 + 1] = pos[v * 3 + 1]; B[b * 3 + 2] = pos[v * 3 + 2]; }
    return b;
  };
  const vertexIds = new Int32Array(vertexCount).fill(-1);
  let slots = 1024, slotX = new Float64Array(slots), slotZ = new Float64Array(slots), slotId = new Int32Array(slots).fill(-1), interned = 0;
  const slotOf = (x, z) => {
    BITS[0] = x; let h = Math.imul(WORDS[0] ^ 0x9e3779b9, 0x85ebca6b) ^ WORDS[1];
    BITS[0] = z; h = Math.imul(h ^ WORDS[0], 0xc2b2ae35) ^ Math.imul(WORDS[1], 0x27d4eb2f);
    let s = (h ^ (h >>> 15)) & (slots - 1);
    while (slotId[s] >= 0 && !(slotX[s] === x && slotZ[s] === z)) s = (s + 1) & (slots - 1);
    return s;
  };
  const intern = (x, z) => {
    if (x === 0) x = 0; if (z === 0) z = 0;
    const s = slotOf(x, z);
    if (slotId[s] >= 0) return slotId[s];
    slotX[s] = x; slotZ[s] = z; slotId[s] = interned;
    if (++interned * 2 > slots) {
      const ox = slotX, oz = slotZ, oid = slotId;
      slots *= 2; slotX = new Float64Array(slots); slotZ = new Float64Array(slots); slotId = new Int32Array(slots).fill(-1);
      for (let o = 0; o < oid.length; o++) if (oid[o] >= 0) {
        const n = slotOf(ox[o], oz[o]); slotX[n] = ox[o]; slotZ[n] = oz[o]; slotId[n] = oid[o];
      }
    }
    return interned - 1;
  };
  const edgeHead = new Int32Array(vertexCount).fill(-1);
  let edgeTo = new Int32Array(64), edgeNext = new Int32Array(64), edgeRecord = new Int32Array(64), edges = 0;
  const edgeGet = (from, to) => {
    for (let e = edgeHead[from]; e >= 0; e = edgeNext[e]) if (edgeTo[e] === to) return edgeRecord[e];
    return -1;
  };
  const edgeSet = (from, to, r) => {
    for (let e = edgeHead[from]; e >= 0; e = edgeNext[e]) if (edgeTo[e] === to) { edgeRecord[e] = r; return; }
    if (edges === edgeTo.length) {
      const to2 = new Int32Array(edges * 2), next2 = new Int32Array(edges * 2), rec2 = new Int32Array(edges * 2);
      to2.set(edgeTo); next2.set(edgeNext); rec2.set(edgeRecord); edgeTo = to2; edgeNext = next2; edgeRecord = rec2;
    }
    edgeTo[edges] = to; edgeNext[edges] = edgeHead[from]; edgeRecord[edges] = r; edgeHead[from] = edges++;
  };
  const keyOf = (v) => {
    let id = vertexIds[v];
    if (id < 0) { id = intern(pos[v * 3], pos[v * 3 + 2]); vertexIds[v] = id; }
    return id;
  };
  const flip = !!options.flipWinding, P = [0, 0, 0], keys = [0, 0, 0];
  for (let t = 0; t + 2 < length; t += 3) {
    const ib = t + (flip ? 2 : 1), ic = t + (flip ? 1 : 2);
    const va = idx ? idx[t] : t, vb = idx ? idx[ib] : ib, vc = idx ? idx[ic] : ic;
    const ax = pos[va * 3], ay = pos[va * 3 + 1], az = pos[va * 3 + 2];
    const bx = pos[vb * 3], by = pos[vb * 3 + 1], bz = pos[vb * 3 + 2];
    const cx = pos[vc * 3], cy = pos[vc * 3 + 1], cz = pos[vc * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const ny = uz * vx - ux * vz;
    if (!finite(ny) || Math.abs(ny) < 1e-10 || ny < 0) continue;
    const dx = (uy * vz - uz * vy) / -ny, dz = (ux * vy - uy * vx) / -ny;
    keys[0] = keyOf(va); keys[1] = keyOf(vb); keys[2] = keyOf(vc);
    P[0] = vid(va); P[1] = vid(vb); P[2] = vid(vc); // batch vertices; same coordinates as a, b, c
    let joined = false;
    for (let e = 0; e < 3; e++) {
      const u = P[e], v = P[(e + 1) % 3];
      const other = edgeGet(keys[(e + 1) % 3], keys[e]);
      if (other < 0 || batch.countAt(other) !== 3) continue;
      const o = batch.anchorAt(other);
      const opx = o >= 0 ? B[o * 3] : 0, opy = o >= 0 ? B[o * 3 + 1] : batch.topAt(other), opz = o >= 0 ? B[o * 3 + 2] : 0;
      const opdx = o >= 0 ? slope[other * 2] : 0, opdz = o >= 0 ? slope[other * 2 + 1] : 0;
      if (Math.abs(opdx - dx) > 1e-8 || Math.abs(opdz - dz) > 1e-8) continue;
      let off = false;
      for (let j = 0; j < 3 && !off; j++) {
        const p = P[j] * 3;
        off = Math.abs(opy + opdx * (B[p] - opx) + opdz * (B[p + 2] - opz) - B[p + 1]) > 1e-5;
      }
      if (off) continue;
      const base = other * 4, vX = B[v * 3], vZ = B[v * 3 + 2];
      let k = -1;
      for (let j = 0; j < 3; j++) { const q = ids[base + j] * 3; if (B[q] === vX && B[q + 2] === vZ) { k = j; break; } }
      const w = ids[base + (k + 2) % 3], q = P[(e + 2) % 3];
      const uX = B[u * 3], uZ = B[u * 3 + 2];
      const side = (p) => (vX - uX) * (B[p * 3 + 2] - uZ) - (vZ - uZ) * (B[p * 3] - uX);
      if (side(w) * side(q) >= 0) continue;
      const k0 = ids[base + k], k1 = ids[base + (k + 1) % 3];
      const top = Math.max(batch.topAt(other), ay, by, cy);
      ids[base] = k0; ids[base + 1] = q; ids[base + 2] = k1; ids[base + 3] = w;
      // All three original vertices survive the merge; retain the original anchor, not a newly
      // chosen coplanar point (anchored arithmetic and its rounding must remain identical).
      const anchorSlot = o < 0 ? -1 : o === k0 ? 0 : o === k1 ? 2 : 3;
      facet[other] = 1 | ((anchorSlot + 1) << 1);
      batch.setTop(other, top);
      joined = true;
      break;
    }
    if (joined) continue;
    // addTopRing's checks: finite top, and a finite plane when one is attached.
    const y = Math.max(ay, by, cy), planar = Math.abs(dx) + Math.abs(dz) > 1e-12;
    if (!finite(y) || (planar && ![ax, ay, az, dx, dz].every(finite))) continue;
    const r = batch.length++;
    ids[r * 4] = P[0]; ids[r * 4 + 1] = P[1]; ids[r * 4 + 2] = P[2];
    facet[r] = planar ? 2 : 0; batch.setTop(r, y);
    slope[r * 2] = planar ? dx : 0; slope[r * 2 + 1] = planar ? dz : 0;
    for (let e = 0; e < 3; e++) edgeSet(keys[e], keys[(e + 1) % 3], r);
    if (!registered) { tops.push(batch); registered = true; }
  }
  if (!run) batch.trim();
  return batch;
}

N.RideGeometry = { addTop, addBox, addPrism, addRegionalBox, addRegionalPrism, addMesh, addTriangles, boxPoly, convexSlices, expandTops, PackedTops, beginCompactSupport, isCompactSupportToken,
  packedRun: () => new PackedRun() };
})();
