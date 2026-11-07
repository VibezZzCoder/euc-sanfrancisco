(function () {
// Construction-time, world-space EUC contacts. MIT; city derivations retain ../NOTICE.md.
// No Three dependency, visibility queries, mesh retention or global spatial grid here.
const N = window.NYC;
N.ride = N.ride || { tops: [], solids: [], prisms: [] };
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
  const p = ring(poly);
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

// Only exact shared edges, opposite interiors and coplanar triangles may merge. One bounded
// map per call; pairs become quads, never hulls that fill concave gaps or holes.
function addTriangles(pos, idx, surface = 'pavement', options = {}) {
  const records = [];
  const length = idx ? idx.length : pos.length / 3;
  const get = (i) => { const k = (idx ? idx[i] : i) * 3; return { x: pos[k], y: pos[k + 1], z: pos[k + 2] }; };
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
      other.poly = [other.poly[k], { x: q.x, z: q.z }, other.poly[(k + 1) % 3], w];
      other.top = Math.max(other.top, a.y, b.y, c.y);
      joined = true;
      break;
    }
    if (joined) continue;
    const r = addTop(pts, Math.max(a.y, b.y, c.y), surface, { ...options, plane: Math.abs(dx) + Math.abs(dz) > 1e-12 ? plane : undefined });
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
N.RideGeometry = { addTop, addBox, addPrism, addMesh, addTriangles, boxPoly, convexSlices };
})();
