// SF support/contact adapter — MIT, © 2026 VibezZzCoder.
// City data: unable12/slop-sanfrancisco@bdd5d37 (MIT; geographic credits in NOTICE.md).
// Native box sweeps: EUC Thrills@5f45fff, via the generated PlanTerrainSampler.
// No renderer/THREE or mutable player floor. All elevations are absolute NAVD88 metres.
import { PlanTerrainSampler } from './euc/simulation/planSampler.js';
import { findPlacementTarget, findRecoveryTarget } from './euc-recovery.js';
import { lightMaskValue } from './sf-light-data.js';
import { SfSupportStore, isCertifiedCompactSupport } from './sf-support-store.js';
import { SfStaticBoxStore, SfRegionalPrismStore, prepareStaticBox as prepareBox } from './sf-static-body-store.js';
import { WHEEL, TERRAIN } from './euc/data/tuning.js';

const EPS = 1e-8;
const REACH = 0.6; // Layer-selection tolerance, never wheel step-up tuning.
const EMPTY = Object.freeze([]);
const CORE_CLASSES = ['asphalt', 'sidewalk', 'lawn', 'sand', 'rock', 'waterEdge'];
const REGION_CLASSES = ['urban', 'asphalt', 'park', 'sand', 'rock', 'forest', 'cemetery', 'industrial', 'water'];
// Integer grid cells within ±2^14 pack injectively into one non-negative Smi (≤2^30-1), so construction
// and lookups hash small integers instead of building text. Any other cell keeps the original text key;
// the forms cannot collide and each cell always maps to the same form (-0 behaves as 0 in both).
const CELL_OFFSET = 2 ** 14, CELL_SPAN = 2 ** 15;
const key = (x, z) => x > -CELL_OFFSET && x < CELL_OFFSET && z > -CELL_OFFSET && z < CELL_OFFSET
  ? (x + CELL_OFFSET) * CELL_SPAN + (z + CELL_OFFSET) : `${x},${z}`;
const cellX = k => typeof k === 'number' ? Math.floor(k / CELL_SPAN) - CELL_OFFSET : Number(k.slice(0, k.indexOf(',')));
const cellZ = k => typeof k === 'number' ? k % CELL_SPAN - CELL_OFFSET : Number(k.slice(k.indexOf(',') + 1));
const sourceOrder = (a, b) => a - b;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const touches = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const nativeScratchCell = () => 0;

function bounds(poly) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function closest(a, b, x, z) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return { x: a.x + t * dx, z: a.z + t * dz };
}

function ringContains(poly, x, z, boundary = true) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (Math.abs(cross) <= EPS * Math.max(1, Math.hypot(b.x - a.x, b.z - a.z))
      && x >= Math.min(a.x, b.x) - EPS && x <= Math.max(a.x, b.x) + EPS
      && z >= Math.min(a.z, b.z) - EPS && z <= Math.max(a.z, b.z) + EPS) return boundary;
    if ((a.z > z) !== (b.z > z) && x < a.x + (z - a.z) * (b.x - a.x) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}

function contains(p, x, z, boundary = true) {
  return ringContains(p.outer ?? p.poly, x, z, boundary)
    && !(p.holes ?? EMPTY).some(h => ringContains(h, x, z, !boundary));
}

function edgesOf(p) {
  const edges = [];
  for (const [r, ring] of [p.outer ?? p.poly, ...(p.holes ?? EMPTY)].entries()) {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      area += a.x * b.z - b.x * a.z;
    }
    const sign = (area >= 0 ? 1 : -1) * (r ? -1 : 1);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length <= EPS) continue;
      const nx = sign * (b.z - a.z) / length || 0, nz = -sign * (b.x - a.x) / length || 0;
      edges.push({ a, b, nx, nz, offset: nx * a.x + nz * a.z });
    }
  }
  return edges;
}

// Hierarchical sparse hash: each item occupies <=64 buckets at one scale. Giant
// bridges/patches cannot allocate a horizon-sized grid; fine draped facets stay local.
class SparseIndex {
  constructor(items, cell = 16) {
    this.items = items; this.cell = cell; this.levels = []; this.references = 0;
    this.boundsView = {};
    // Count occupied buckets, then store all references in CSR typed arrays.
    // A JS array per bucket retains substantially more heap at regional scale.
    const itemLevels = new Uint8Array(items.length);
    // One-cell memo per level. The fill pass reuses the completed grid instead of
    // retaining/growing a bucket-ID replay buffer for every reference.
    const memos = [];
    for (let id = 0; id < items.length; id++) {
      const b = this.itemBounds(id);
      let level = 0, size = cell;
      while ((Math.floor(b.maxX / size) - Math.floor(b.minX / size) + 1)
        * (Math.floor(b.maxZ / size) - Math.floor(b.minZ / size) + 1) > 64) { level++; size *= 2; }
      itemLevels[id] = level;
      const data = this.levels[level] ??= { grid: new Map(), counts: [] }, grid = data.grid;
      const memo = memos[level] ??= { x: NaN, z: NaN, bucket: 0 };
      for (let x = Math.floor(b.minX / size); x <= Math.floor(b.maxX / size); x++) {
        for (let z = Math.floor(b.minZ / size); z <= Math.floor(b.maxZ / size); z++) {
          let bucket;
          if (x === memo.x && z === memo.z) bucket = memo.bucket;
          else {
            const k = key(x, z);
            bucket = grid.get(k);
            if (bucket === undefined) { bucket = grid.size; grid.set(k, bucket); data.counts.push(0); }
            memo.x = x; memo.z = z; memo.bucket = bucket;
          }
          data.counts[bucket]++;
          this.references++;
        }
      }
    }
    for (const data of this.levels) {
      if (!data) continue;
      data.starts = new Uint32Array(data.grid.size + 1);
      for (let i = 0; i < data.counts.length; i++) data.starts[i + 1] = data.starts[i] + data.counts[i];
      data.items = new Uint32Array(data.starts[data.grid.size]);
      data.cursor = data.starts.slice(0, -1);
      delete data.counts;
    }
    for (let id = 0; id < items.length; id++) {
      const b = this.itemBounds(id), level = itemLevels[id], size = cell * 2 ** level, data = this.levels[level];
      const memo = memos[level];
      for (let x = Math.floor(b.minX / size); x <= Math.floor(b.maxX / size); x++) {
        for (let z = Math.floor(b.minZ / size); z <= Math.floor(b.maxZ / size); z++) {
          // The grid is complete and bounds/visit order are unchanged. Keep the
          // original bucket IDs and source-order CSR writes, including text keys.
          let bucket;
          if (x === memo.x && z === memo.z) bucket = memo.bucket;
          else {
            bucket = data.grid.get(key(x, z));
            memo.x = x; memo.z = z; memo.bucket = bucket;
          }
          data.items[data.cursor[bucket]++] = id;
        }
      }
    }
    for (const data of this.levels) if (data) {
      delete data.cursor;
      data.lastX = data.lastZ = NaN; data.lastBucket = undefined;
    }
    this.stamps = new Uint32Array(items.length); this.serial = 0;
    let buckets = 0, bytes = this.stamps.byteLength;
    for (const data of this.levels) if (data) { buckets += data.grid.size; bytes += data.starts.byteLength + data.items.byteLength; }
    // Bytes are typed-array payload only, not Map/key/object heap or source data.
    this.stats = Object.freeze({ items: items.length, buckets, references: this.references, typedBytes: bytes });
  }
  itemBounds(id) { return this.items.getBounds ? this.items.getBounds(id, this.boundsView) : this.items[id]; }
  addBucket(data, bucket, b, out) {
    for (let at = data.starts[bucket]; at < data.starts[bucket + 1]; at++) {
      const id = data.items[at];
      if (this.stamps[id] === this.serial) continue;
      this.stamps[id] = this.serial;
      if (touches(b, this.itemBounds(id))) out.push(id);
    }
  }
  query(b, out = []) {
    out.length = 0;
    if (++this.serial >= 0xffffffff) { this.stamps.fill(0); this.serial = 1; }
    for (let level = 0; level < this.levels.length; level++) {
      const data = this.levels[level]; if (!data) continue;
      const grid = data.grid;
      const size = this.cell * 2 ** level;
      const x0 = Math.floor(b.minX / size), x1 = Math.floor(b.maxX / size);
      const z0 = Math.floor(b.minZ / size), z1 = Math.floor(b.maxZ / size);
      if (x0 === x1 && z0 === z1) {
        // Static bucket membership only: still filter current bounds and sort every
        // query. Short near-solid rays/ground probes often revisit this one cell.
        // No shared result/scratch view, rounded query or physical/visual coupling.
        if (x0 !== data.lastX || z0 !== data.lastZ) {
          data.lastBucket = grid.get(key(x0, z0)); data.lastX = x0; data.lastZ = z0;
        }
        if (data.lastBucket !== undefined) this.addBucket(data, data.lastBucket, b, out);
      } else if ((x1 - x0 + 1) * (z1 - z0 + 1) > grid.size * 2) {
        // Long camera rays across empty space inspect occupied buckets only.
        for (const [k, bucket] of grid) {
          const x = cellX(k), z = cellZ(k);
          if (x >= x0 && x <= x1 && z >= z0 && z <= z1) this.addBucket(data, bucket, b, out);
        }
      } else for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const bucket = grid.get(key(x, z)); if (bucket !== undefined) this.addBucket(data, bucket, b, out);
      }
    }
    out.sort(sourceOrder); // Deterministic source-order ties, independent of buckets.
    return out;
  }
}

// Keep this adapter on a prototype, outside the sampler constructor. A retained
// constructor closure could otherwise retain that constructor's city/ride scope.
class CeilingBounds {
  constructor(store) { this.store = store; this.length = store.ceilingIds.length; }
  getBounds(id, out) { return this.store.getBounds(this.store.ceilingIds[id], out); }
}

// Only sparse metadata extras can carry capabilities. Index packed IDs, never
// raw facets or materialized views, so registry handoff/cache eviction stay safe.
class CapabilityBounds {
  constructor(store) {
    this.store = store;
    const ids = [];
    for (const [id, extra] of store.extras) {
      const c = extra.fields?.capabilities;
      if (c?.transition === true || c?.restartsAtRest === true) ids.push(id);
    }
    this.ids = Uint32Array.from(ids); this.length = this.ids.length;
  }
  getBounds(id, out) { return this.store.getBounds(this.ids[id], out); }
}

// Native narrow phase only; callers feed a one-cell scratch list from SparseIndex.
function nativeBoxes(records) {
  const n = new PlanTerrainSampler({ segments: [], solids: [], hazards: [], surround: { height: 0, surface: 'pavement' },
    heightfield: { originX: 0, originZ: 0, spacing: 1, columns: 2, rows: 2, heights: [0, 0, 0, 0], surfaces: ['pavement'] } });
  n.colliders = records; n.stamps = new Int32Array(records.length);
  n.columnAt = n.rowAt = n.cellAt = nativeScratchCell;
  n.gridStarts = new Int32Array(2); n.gridItems = new Int32Array(0);
  return n;
}

function sphereHitsBox(p, o, d, max, radius) {
  const c = p.collider.centre, h = p.collider.halfExtents;
  const x = o.x - c.x, z = o.z - c.z;
  let lo = 0, hi = max;
  for (const [start, delta, half] of [[p.cos * x - p.sin * z, p.cos * d.x - p.sin * d.z, h.x + radius],
    [o.y - c.y, d.y, h.y + radius], [p.sin * x + p.cos * z, p.sin * d.x + p.cos * d.z, h.z + radius]]) {
    if (Math.abs(delta) <= EPS) { if (Math.abs(start) > half) return false; continue; }
    let near = (-half - start) / delta, far = (half - start) / delta;
    if (near > far) [near, far] = [far, near];
    lo = Math.max(lo, near); hi = Math.min(hi, far); if (lo > hi) return false;
  }
  return true;
}

/** Native boxes, with a non-enumerable .prisms array for exact polygon extrusions.
 * Polygon data always takes precedence over a collider's broad-phase AABB/OBB.
 * The SfTerrainSampler accepts raw city colliders, so callers need not split them.
 */
export function boxesFromCityColliders(colliders = []) {
  const boxes = [], prisms = [];
  appendCityColliders(colliders, b => boxes.push(b), p => prisms.push(p), new WeakSet());
  Object.defineProperty(boxes, 'prisms', { value: prisms });
  return boxes;
}

function nativeBox(c) {
  return c.rotationY !== undefined && c.surface !== undefined ? c
    : { ...c, rotationY: c.rotationY ?? 0, surface: c.surface ?? 'pavement' };
}

function claimBody(c, seen, counts) {
  // This routing flag must be checked BEFORE polygon, OBB, extent or parts reads.
  // Coarse navigation reservations deliberately include spaces the EUC can enter.
  if (!c || c.rideIgnore === true) { if (c && counts) counts.ignoredBodies++; return false; }
  if (seen.has(c)) { if (counts) counts.duplicateBodies++; return false; }
  seen.add(c); return true;
}

function appendCityColliders(colliders, addBox, addPrism, seen, counts) {
  for (const c of colliders) {
    if (!claimBody(c, seen, counts)) continue;
    const poly = c.outer ?? c.polygon ?? c.poly;
    const minY = c.minY ?? (c.centre ? c.centre.y - c.halfExtents.y : 0);
    const maxY = c.maxY ?? (c.centre ? c.centre.y + c.halfExtents.y : c.roof);
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) continue;
    if (poly?.length >= 3) {
      addPrism(c.outer === poly && c.minY === minY && c.maxY === maxY && c.surface !== undefined ? c
        : { ...c, outer: poly, minY, maxY, support: c.support === true, surface: c.surface ?? 'pavement' });
    } else if (c.centre && c.halfExtents) {
      addBox(nativeBox(c));
    } else if (c.obb) {
      const o = c.obb;
      addBox({ centre: { x: o.cx, y: (minY + maxY) / 2, z: o.cz },
        halfExtents: { x: o.hx, y: (maxY - minY) / 2, z: o.hz }, rotationY: Math.atan2(o.sn, o.cs),
        surface: c.surface ?? 'pavement', support: c.support === true, occludes: c.occludes, wheelSweep: c.wheelSweep });
    } else if ([c.minX, c.maxX, c.minZ, c.maxZ].every(Number.isFinite)) {
      addBox({ centre: { x: (c.minX + c.maxX) / 2, y: (minY + maxY) / 2, z: (c.minZ + c.maxZ) / 2 },
        halfExtents: { x: (c.maxX - c.minX) / 2, y: (maxY - minY) / 2, z: (c.maxZ - c.minZ) / 2 }, rotationY: 0,
        surface: c.surface ?? 'pavement', support: c.support === true, occludes: c.occludes, wheelSweep: c.wheelSweep });
    }
  }
}

class PreparedPrism {
  constructor(p, id) {
    this.source = p; this.outer = p.outer ?? p.poly; this.holes = p.holes;
    this.minY = p.minY; this.maxY = p.maxY; this.surface = p.surface ?? 'pavement';
    this.support = p.support === true; this.occludes = p.occludes; this.id = id;
    this._edges = null; this.contactPieces = null;
    Object.assign(this, bounds(this.outer));
  }
  // Regional trees alone exceed 900,000 edges. Most are never queried; retain
  // their source rings, not an eager edge object graph or convex decomposition.
  get edges() { return this._edges ??= edgesOf(this); }
}

function fieldOf(t) {
  if (!t) return null;
  const f = { x0: t.x0 ?? t.originX, z0: t.z0 ?? t.originZ, step: t.step ?? t.cell ?? t.spacing,
    nx: t.nx ?? t.w ?? t.columns, nz: t.nz ?? (typeof t.h === 'number' ? t.h : undefined) ?? t.rows,
    heights: t.heights ?? (typeof t.h !== 'number' ? t.h : null), source: t };
  if (!(f.step > 0) || !(f.nx >= 2) || !(f.nz >= 2) || !f.heights) return null;
  return Object.assign(f, { minX: f.x0, minZ: f.z0, maxX: f.x0 + (f.nx - 1) * f.step, maxZ: f.z0 + (f.nz - 1) * f.step });
}

function insideField(f, x, z) {
  if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) return false;
  const p = f.source;
  if (p.rect === false || (p.rect !== true && Number.isFinite(p.rx))) {
    return ((x - p.cx) / p.rx) ** 4 + ((z - p.cz) / p.rz) ** 4 <= 1;
  }
  return true;
}

function sampleField(f, x, z, out) {
  const fx = (x - f.x0) / f.step, fz = (z - f.z0) / f.step;
  const i = clamp(Math.floor(fx), 0, f.nx - 2), j = clamp(Math.floor(fz), 0, f.nz - 2);
  const u = fx - i, v = fz - j, k = j * f.nx + i, H = f.heights;
  const h00 = H[k], h10 = H[k + 1], h01 = H[k + f.nx], h11 = H[k + f.nx + 1];
  let dx, dz, height;
  // terrain-mesh.js indices: 00,01,10 / 10,01,11. NOT PlanSampler's other diagonal.
  if (u + v <= 1) { dx = h10 - h00; dz = h01 - h00; height = h00 + dx * u + dz * v; }
  else { dx = h11 - h01; dz = h11 - h10; height = h11 - dx * (1 - u) - dz * (1 - v); }
  out.height = height;
  const plane = out._sfFieldPlane ??= { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
  plane.x = x; plane.y = height; plane.z = z; plane.dx = dx / f.step; plane.dz = dz / f.step;
  out.plane = plane;
  return out;
}

function setNormal(out) {
  const p = out.plane, n = out.normal ??= {};
  const inv = p ? 1 / Math.hypot(p.dx, 1, p.dz) : 1;
  n.x = p ? -p.dx * inv : 0; n.y = inv; n.z = p ? -p.dz * inv : 0;
}

function maskClass(m, x, z, region = false) {
  if (!m) return null;
  const h = m.header ?? m, cell = h.cell ?? h.step ?? (region ? 4 : 1);
  const i = Math.floor((x - (h.originX ?? h.x0)) / cell), j = Math.floor((z - (h.originZ ?? h.z0)) / cell);
  if (i < 0 || j < 0 || i >= h.w || j >= h.h) return null;
  const value = m.rows ? lightMaskValue(m, i, j) : (m.mask ?? m.values)?.[j * h.w + i];
  return h.classes?.[value] ?? (region ? REGION_CLASSES[value] : CORE_CLASSES[value]);
}

function segmentCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz;
  const det = ux * vz - uz * vx;
  if (Math.abs(det) < EPS) return null;
  const t = ((cx - ax) * vz - (cz - az) * vx) / det;
  const s = ((cx - ax) * uz - (cz - az) * ux) / det;
  return t >= -EPS && t <= 1 + EPS && s >= -EPS && s <= 1 + EPS ? clamp(t, 0, 1) : null;
}

function segmentMeetsPrism(p, x, z, lx, lz, width, radius = 0) {
  const ax = x - lx * width, az = z - lz * width, bx = x + lx * width, bz = z + lz * width;
  if (contains(p, ax, az) || contains(p, bx, bz) || contains(p, x, z)) return true;
  for (const e of p.edges) {
    if (segmentCross(ax, az, bx, bz, e.a.x, e.a.z, e.b.x, e.b.z) !== null) return true;
    if (radius > 0) {
      const q = closest(e.a, e.b, x, z);
      if (Math.hypot(q.x - x, q.z - z) <= radius + EPS) return true;
    }
  }
  return false;
}

function nearestFace(p, origin) {
  let distance = Math.abs(origin.y - p.minY), n = { x: 0, y: -1, z: 0 }, offset = -p.minY;
  if (Math.abs(p.maxY - origin.y) < distance) { distance = Math.abs(p.maxY - origin.y); n = { x: 0, y: 1, z: 0 }; offset = p.maxY; }
  for (const e of p.edges) {
    const q = closest(e.a, e.b, origin.x, origin.z), d = Math.hypot(q.x - origin.x, q.z - origin.z);
    if (d < distance) { distance = d; n = { x: e.nx, y: 0, z: e.nz }; offset = e.offset; }
  }
  return { normal: n, faceOffset: offset };
}

// Exact event intervals for a translating horizontal segment through a concave prism,
// including holes. No convex hull/AABB replacement and no fixed-distance marching.
function prismIntervals(p, o, d, max, width = 0, lx = 0, lz = 0, radius = 0) {
  if (Math.max(o.y, o.y + d.y * max) < p.minY - radius - EPS
    || Math.min(o.y, o.y + d.y * max) > p.maxY + radius + EPS) return [];
  const events = [{ t: 0 }, { t: max }];
  const add = (t, normal, faceOffset) => {
    if (t >= -EPS && t <= max + EPS) events.push({ t: clamp(t, 0, max), normal, faceOffset });
  };
  if (Math.abs(d.y) > EPS) {
    add((p.minY - radius - o.y) / d.y, { x: 0, y: -1, z: 0 }, -p.minY);
    add((p.maxY + radius - o.y) / d.y, { x: 0, y: 1, z: 0 }, p.maxY);
  }
  for (const e of p.edges) {
    const ex = e.b.x - e.a.x, ez = e.b.z - e.a.z;
    for (const side of width ? [-1, 1] : [0]) {
      const ox = o.x + lx * width * side, oz = o.z + lz * width * side;
      const det = d.x * ez - d.z * ex;
      if (Math.abs(det) > EPS) {
        const t = ((e.a.x - ox) * ez - (e.a.z - oz) * ex) / det;
        const s = ((e.a.x - ox) * d.z - (e.a.z - oz) * d.x) / det;
        if (s >= -EPS && s <= 1 + EPS) add(t, { x: e.nx, y: 0, z: e.nz }, e.offset);
      }
    }
    // A vertex entering the interior of the sweep segment, not only its endpoints.
    const det = d.x * lz - d.z * lx;
    if (width && Math.abs(det) > EPS) for (const v of [e.a, e.b]) {
      const t = ((v.x - o.x) * lz - (v.z - o.z) * lx) / det;
      const s = ((v.x - o.x) * d.z - (v.z - o.z) * d.x) / det;
      if (Math.abs(s) <= width + EPS) add(t, { x: e.nx, y: 0, z: e.nz }, e.offset);
    }
    if (radius) {
      const progress = e.nx * d.x + e.nz * d.z;
      if (Math.abs(progress) > EPS) for (const side of [-1, 1]) {
        const t = (e.offset + side * radius - e.nx * o.x - e.nz * o.z) / progress;
        const qx = o.x + d.x * t - side * radius * e.nx, qz = o.z + d.z * t - side * radius * e.nz;
        const s = ((qx - e.a.x) * ex + (qz - e.a.z) * ez) / (ex * ex + ez * ez);
        if (s >= -EPS && s <= 1 + EPS) add(t);
      }
      const a = d.x * d.x + d.z * d.z;
      if (a > EPS) for (const v of [e.a, e.b]) {
        const vx = o.x - v.x, vz = o.z - v.z, b = vx * d.x + vz * d.z;
        const disc = b * b - a * (vx * vx + vz * vz - radius * radius);
        if (disc >= 0) { add((-b - Math.sqrt(disc)) / a); add((-b + Math.sqrt(disc)) / a); }
      }
    }
  }
  events.sort((a, b) => a.t - b.t);
  const occupied = t => o.y + d.y * t >= p.minY - radius - EPS && o.y + d.y * t <= p.maxY + radius + EPS
    && segmentMeetsPrism(p, o.x + d.x * t, o.z + d.z * t, lx, lz, width, radius);
  const intervals = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i], next = events[i + 1];
    if (!occupied(e.t) && (!next || next.t - e.t <= EPS || !occupied((e.t + next.t) / 2))) continue;
    const end = next && occupied((e.t + next.t) / 2) ? next.t : e.t;
    const last = intervals[intervals.length - 1];
    if (last && e.t <= last.end + EPS) last.end = Math.max(last.end, end);
    else intervals.push({ start: e.t, end, event: e });
  }
  // Coincident vertex/edge events may include a tangent face. Prefer the actual
  // opposing entry face; a tangent normal would fail to stop a fixed-axis sweep.
  for (const interval of intervals) {
    let opposition = Infinity;
    for (const event of events) {
      if (!event.normal || Math.abs(event.t - interval.start) > EPS) continue;
      const n = event.normal, dot = n.x * d.x + n.y * d.y + n.z * d.z;
      if (dot < opposition) { opposition = dot; interval.event = event; }
    }
  }
  return intervals;
}

function gradeTops(grade) {
  const out = [];
  for (const s of grade?.floors ?? []) {
    // Current grade builder distributes all samples evenly across the full span,
    // including a non-2m final interval. Explicit step remains a legacy option.
    const step = s.step ?? (s.t1 - s.t0) / (s.ys.length - 1);
    for (let i = 0; i + 1 < s.ys.length; i++) {
      const a = s.t0 + i * step, b = Math.min(s.t1, a + step); if (b <= a) continue;
      const P = (t, o) => ({ x: s.x0 + s.dx * t + s.rx * o, z: s.z0 + s.dz * t + s.rz * o });
      const p = P(a, s.L), slope = (s.ys[i + 1] - s.ys[i]) / (b - a);
      out.push({ poly: [p, P(a, s.R), P(b, s.R), P(b, s.L)], top: s.ys[i],
        plane: { ...p, y: s.ys[i], dx: slope * s.dx, dz: slope * s.dz }, surface: 'pavement', layered: true,
        replacesTerrain: s.kind === 'tunnel', maxReferenceY: s.kind === 'tunnel' ? s.ys[i] + (s.boreHeight ?? grade.boreHeight ?? 5.2) : undefined,
        ceilingOffset: s.kind === 'tunnel' ? (s.boreHeight ?? grade.boreHeight ?? 5.2) : undefined });
    }
  }
  return out;
}

// Exact horizontal trapezoidal decomposition (even/odd rings include holes).
// Each convex piece has <=4 side faces + two caps, fitting the native limb
// solver's six-face budget. No triangulation dependency or courtyard-filling box.
function contactPieces(p) {
  const zs = [...new Set(p.edges.flatMap(e => [e.a.z, e.b.z]))].sort((a, b) => a - b), pieces = [];
  for (let i = 0; i + 1 < zs.length; i++) {
    const lo = zs[i], hi = zs[i + 1]; if (hi - lo < EPS) continue;
    const mid = (lo + hi) / 2;
    const crossing = p.edges.filter(e => mid > Math.min(e.a.z, e.b.z) && mid < Math.max(e.a.z, e.b.z));
    const at = (e, z) => e.a.x + (z - e.a.z) * (e.b.x - e.a.x) / (e.b.z - e.a.z);
    crossing.sort((a, b) => at(a, mid) - at(b, mid));
    for (let j = 0; j + 1 < crossing.length; j += 2) {
      const a = crossing[j], b = crossing[j + 1];
      const ring = [{ x: at(a, lo), z: lo }, { x: at(b, lo), z: lo }, { x: at(b, hi), z: hi }, { x: at(a, hi), z: hi }]
        .filter((v, k, all) => Math.hypot(v.x - all[(k + 1) % all.length].x, v.z - all[(k + 1) % all.length].z) > EPS);
      if (ring.length >= 3) pieces.push(new ConvexContact(ring, p.minY, p.maxY));
    }
  }
  return pieces;
}

class ConvexContact {
  constructor(poly, minY, maxY) {
    this.poly = poly; this.minY = minY; this.maxY = maxY;
    Object.assign(this, bounds(poly));
    this.edges = edgesOf(this);
    this.planes = this.edges.map(e => [e.nx, 0, e.nz, e.offset]);
    this.planes.push([0, -1, 0, -minY], [0, 1, 0, maxY]);
    this.distanceScratch = new Float64Array(4);
  }
  face(face, out, at = 0) {
    const p = this.planes[Math.min(face, this.planes.length - 1)];
    for (let i = 0; i < 4; i++) out[at + i] = p[i];
  }
  support(nx, ny, nz) {
    let max = -Infinity;
    for (const p of this.poly) max = Math.max(max, nx * p.x + nz * p.z);
    return max + ny * (ny >= 0 ? this.maxY : this.minY);
  }
  segment(ax, ay, az, bx, by, bz, radius) {
    let lo = 0, hi = 1;
    for (const [nx, ny, nz, offset] of this.planes) {
      const start = nx * ax + ny * ay + nz * az - offset - radius;
      const delta = nx * (bx - ax) + ny * (by - ay) + nz * (bz - az);
      if (Math.abs(delta) < EPS) { if (start > EPS) return false; continue; }
      const t = -start / delta;
      if (delta > 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
      if (lo > hi + EPS) return false;
    }
    return true;
  }
  pointDistance(x, y, z) {
    let best = Infinity, qx = x, qz = z;
    if (!ringContains(this.poly, x, z)) for (const e of this.edges) {
      const ex = e.b.x - e.a.x, ez = e.b.z - e.a.z;
      const t = clamp(((x - e.a.x) * ex + (z - e.a.z) * ez) / (ex * ex + ez * ez), 0, 1);
      const px = e.a.x + t * ex, pz = e.a.z + t * ez, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best) { best = d; qx = px; qz = pz; }
    }
    const qy = clamp(y, this.minY, this.maxY), o = this.distanceScratch;
    o[0] = x - qx; o[1] = y - qy; o[2] = z - qz;
    return o[3] = o[0] ** 2 + o[1] ** 2 + o[2] ** 2;
  }
  capsule(ax, ay, az, bx, by, bz, radius, out) {
    if (!this.segment(ax, ay, az, bx, by, bz, radius)) return false;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const distance = t => this.pointDistance(ax + dx * t, ay + dy * t, az + dz * t);
    // Distance squared to a convex solid along a segment is convex. A bounded
    // minimization avoids the expanded-halfspace corner false positives. Error in
    // segment parameter is <2e-10; no randomness/timing or unbounded iteration.
    let lo = 0, hi = 1;
    for (let i = 0; i < 56; i++) {
      const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
      if (distance(a) <= distance(b)) hi = b; else lo = a;
    }
    let t = (lo + hi) / 2, squared = distance(t);
    for (const endpoint of [0, 1]) { const d = distance(endpoint); if (d < squared) { squared = d; t = endpoint; } }
    if (squared >= radius * radius - EPS) return false;
    if (!out) return true;
    distance(t);
    const length = Math.sqrt(squared), q = this.distanceScratch;
    if (length > EPS) { out[0] = q[0] / length; out[1] = q[1] / length; out[2] = q[2] / length; out[3] = radius - length; }
    else {
      let best = Infinity;
      for (const [nx, ny, nz, offset] of this.planes) {
        const first = nx * ax + ny * ay + nz * az, last = nx * bx + ny * by + nz * bz;
        const depth = offset + radius - Math.min(first, last);
        if (depth < best) { best = depth; out[0] = nx; out[1] = ny; out[2] = nz; out[3] = depth; }
      }
    }
    out[4] = ax + dx * t; out[5] = ay + dy * t; out[6] = az + dz * t;
    return true;
  }
  oriented(px, py, pz, basis, at, minX, maxX, minY, maxY, minZ, maxZ, out) {
    const middle = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const half = [(maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2];
    const axes = [0, 1, 2].map(j => [basis[at + j * 3], basis[at + j * 3 + 1], basis[at + j * 3 + 2]]);
    const centre = [px, py, pz];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) centre[j] += middle[i] * axes[i][j];
    const candidates = [...axes, [0, 1, 0], ...this.edges.map(e => [e.nx, 0, e.nz])];
    for (const edge of [[0, 1, 0], ...this.edges.map(e => [e.b.x - e.a.x, 0, e.b.z - e.a.z])]) {
      for (const a of axes) candidates.push([edge[1] * a[2] - edge[2] * a[1], edge[2] * a[0] - edge[0] * a[2], edge[0] * a[1] - edge[1] * a[0]]);
    }
    let best = Infinity;
    for (const a of candidates) {
      const length = Math.hypot(...a); if (length < EPS) continue;
      const nx = a[0] / length, ny = a[1] / length, nz = a[2] / length;
      const upper = this.support(nx, ny, nz), lower = -this.support(-nx, -ny, -nz);
      const mid = nx * centre[0] + ny * centre[1] + nz * centre[2];
      let radius = 0;
      for (let j = 0; j < 3; j++) radius += half[j] * Math.abs(nx * axes[j][0] + ny * axes[j][1] + nz * axes[j][2]);
      if (mid + radius < lower - EPS || mid - radius > upper + EPS) return false;
      const plus = upper - mid + radius, minus = mid + radius - lower, depth = Math.min(plus, minus);
      if (out && depth <= EPS) return false;
      if (depth < best) {
        best = depth;
        if (out) { const sign = plus <= minus ? 1 : -1; out[0] = nx * sign; out[1] = ny * sign; out[2] = nz * sign; out[3] = depth; }
      }
    }
    return best !== Infinity;
  }
}

export class SfTerrainSampler {
  constructor({ city = globalThis.window?.NYC, colliders = [], ride = city?.ride, terrain = city?.Terrain,
    data = city?.DATA, grade = city?.GradeSeparation, boxes = [], tops = [], prisms = [],
    waterAt = null, offLimitsAt = null, supportReach = REACH, topViewCacheSize = 256 } = {}, compactSupport = null) {
    // Retain only dependencies, never a city -> ride -> raw support registry alias.
    this.terrain = terrain; this.data = data; this.grade = grade;
    this.waterAt = waterAt; this.offLimitsAt = offLimitsAt; this.supportReach = supportReach;
    this.waterLevel = terrain?.waterLevel ?? data?.fullRegion?.manifest?.waterLevel ?? 0;
    this.coreMask = data?.groundMask;
    const region = data?.fullRegion;
    this.regionMask = region ? { header: region.manifest.mask, mask: region.mask } : data?.lightTerrain?.mask ?? null;
    this.fields = [fieldOf(terrain), ...(terrain?.patches ?? []).map(fieldOf)].filter(Boolean);
    if (!this.fields.length && data?.terrain) {
      const { header: h, q } = data.terrain;
      this.fields.push(fieldOf({ ...h, heights: Float32Array.from(q, n => h.minH + n * h.scale) }));
    }
    this.fieldIndex = new SparseIndex(this.fields, 256);
    const seenBodies = new WeakSet(), counts = { ignoredBodies: 0, duplicateBodies: 0 };
    const boxSources = []; this.prisms = [];
    this.hasBoxSupport = false; this.hasPrismSupport = false;
    const addBox = b => { boxSources.push(b); if (b.support === true) this.hasBoxSupport = true; };
    const addPrism = p => { this.prisms.push(new PreparedPrism(p, this.prisms.length)); if (p.support === true) this.hasPrismSupport = true; };
    // Stream inputs: no concatenated world arrays, per-box sampler, or cloning of
    // already-normalized native registry boxes. Only repeated references dedupe;
    // overlapping foundations/main masses and distinct detail remain independent.
    appendCityColliders(colliders, addBox, addPrism, seenBodies, counts);
    for (const list of [boxes, ride?.solids ?? EMPTY]) for (const b of list) {
      if (claimBody(b, seenBodies, counts)) addBox(nativeBox(b));
    }
    for (const list of [boxes.prisms ?? EMPTY, prisms, ride?.prisms ?? EMPTY]) for (const p of list) {
      if (claimBody(p, seenBodies, counts)) addPrism(p);
    }
    this.boxStore = new SfStaticBoxStore(boxSources);
    this.boxRecords = this.boxStore.records;
    this.boxIndex = new SparseIndex(this.boxStore, 8);
    this.prismIndex = new SparseIndex(this.prisms, 16);
    this._nextContactId = this.boxRecords.length + this.prisms.length;
    const rideSupport = ride?.tops ?? EMPTY, gradeSupport = gradeTops(grade);
    // Only the host's native Light registry and the sampler's own empty lists
    // qualify. Explicit caller lists and legacy grade floors remain raw.
    const compactCertificate = isCertifiedCompactSupport(compactSupport) && ride === compactSupport.registry && tops === compactSupport.emptyTops && !gradeSupport.length
      ? compactSupport : null;
    this.topStore = new SfSupportStore([rideSupport, tops, gradeSupport], { cacheSize: topViewCacheSize },
      compactCertificate, compactCertificate ? gradeSupport : null);
    this.topIndex = new SparseIndex(this.topStore, 8);
    const store = this.topStore;
    this.capabilityIndex = new SparseIndex(new CapabilityBounds(store), 8);
    this.ceilingIndex = new SparseIndex(new CeilingBounds(store), 8);
    // Current grade builder publishes exact bounded bore facets + real ceiling
    // bodies, but not its internal floors array. Do not approximate those ceilings
    // again by a 0.5 m API march through the full city on every obstacle query.
    this.registeredGradeBores = store.registeredGradeBores;
    this.legacyGradeRays = !!grade && !grade.floors?.length && !this.registeredGradeBores;
    // Only the native narrow phase is reused. Its one-cell scratch candidate list
    // is supplied by our sparse index; it never constructs a dense city/horizon grid.
    this.native = nativeBoxes(this.boxRecords);
    // NYC 7cf4ce7 euc-terrain.js: the wheel shell can meet a thin elevated bar
    // above the pedal ray. Extend only tagged boxes downward in a separate query
    // index; support, camera, placement, exit certificates and ragdolls keep the
    // original actual geometry. SF retains sparse indexing across distant sites.
    const reach = WHEEL.shellHeight - WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
    const wheelRecords = [];
    for (const b of boxSources) if (b.wheelSweep === true) wheelRecords.push(prepareBox({ ...b,
      centre: { ...b.centre, y: b.centre.y - reach / 2 },
      halfExtents: { ...b.halfExtents, y: b.halfExtents.y + reach / 2 }, support: false }));
    this.wheelBoxes = wheelRecords.length ? nativeBoxes(wheelRecords) : null;
    this.wheelIndex = wheelRecords.length ? new SparseIndex(wheelRecords, 8) : null;
    this._boxIds = []; this._prismIds = []; this._topIds = []; this._fieldIds = []; this._capabilityIds = []; this._wheelIds = [];
    this._probe = { normal: {} };
    const indexes = Object.freeze({ boxes: this.boxIndex.stats, prisms: this.prismIndex.stats, tops: this.topIndex.stats,
      fields: this.fieldIndex.stats, ceilings: this.ceilingIndex.stats, capabilities: this.capabilityIndex.stats,
      ...(this.wheelIndex ? { wheelShell: this.wheelIndex.stats } : {}) });
    this.stats = Object.freeze({ boxes: this.boxRecords.length, prisms: this.prisms.length, tops: store.length,
      ...counts, indexes, supportStore: store.stats, staticBoxStore: this.boxStore.stats,
      indexReferences: Object.values(indexes).reduce((n, s) => n + s.references, 0),
      indexTypedBytes: Object.values(indexes).reduce((n, s) => n + s.typedBytes, 0) });
    // Weak ownership certificate: the default constructor does not consume caller
    // inputs, and this certificate itself cannot keep raw facets/arrays alive.
    if (ride && ['tops', 'solids', 'prisms'].every(k => Array.isArray(ride[k]))) {
      // An explicit caller list is an independent owner even if it also contains a
      // region-tagged record. Such sources must keep the ordinary identity contract.
      const excluded = new WeakSet();
      if (ride.regionalBodies) for (const list of [colliders, boxes, boxes.prisms ?? EMPTY, prisms]) {
        for (const body of list) if (body && typeof body === 'object') excluded.add(body);
      }
      this._registryHandoff = { registry: new WeakSet([ride]), arrays: ['tops', 'solids', 'prisms'].map(k => new WeakSet([ride[k]])),
        lengths: ['tops', 'solids', 'prisms'].map(k => ride[k].length), regional: ride.regionalBodies, excluded, released: false };
    }
  }

  /** Host-only successful static-world handoff. Call after manager construction,
   * before exposing gameplay. Clears memberships, never shared body geometry. Only
   * explicitly region-owned bodies transfer; default construction is non-consuming.
   * A changed registry must be rebuilt, not released through an older sampler.
   */
  releaseConstructionRegistry(ride) {
    const token = this._registryHandoff, keys = ['tops', 'solids', 'prisms'];
    if (!token?.registry.has(ride)) throw new Error('SF registry was not captured by this sampler');
    if (token.released) return false;
    for (let i = 0; i < keys.length; i++) {
      const array = ride[keys[i]];
      if (!token.arrays[i].has(array) || array.length !== token.lengths[i]) throw new Error('SF registry changed after sampler construction');
      if (!Object.getOwnPropertyDescriptor(array, 'length').writable || Object.isSealed(array)) throw new Error('SF registry is not releasable');
    }
    if (ride.regionalBodies !== token.regional) throw new Error('SF regional body ownership changed after construction');
    const boxes = this.boxStore.prepareRegionalHandoff(token.regional, token.excluded);
    const prisms = SfRegionalPrismStore.prepare(this.prisms, token.regional, token.excluded, PreparedPrism);
    // All validation/allocation precedes publication. The original registry records
    // remained available through tunnel finalization and full manager construction.
    this.boxStore.commitRegionalHandoff(boxes);
    if (prisms) {
      prisms.commit(); this.prismStore = prisms; this.prisms = prisms.records; this.prismIndex.items = prisms;
    }
    if (boxes || prisms) this.stats = Object.freeze({ ...this.stats, staticBoxStore: this.boxStore.stats,
      ...(prisms ? { regionalPrismStore: prisms.stats } : {}) });
    for (const k of keys) { ride[k].length = 0; Object.freeze(ride[k]); }
    // Membership certificates have no query role. Drop even their WeakSet table
    // capacity after transfer; neither this sampler nor the registry factory keeps it.
    if (Object.getOwnPropertyDescriptor(ride, 'regionalBodies')?.configurable) delete ride.regionalBodies;
    token.regional = null; token.excluded = null;
    Object.freeze(ride); token.released = true;
    return true;
  }

  get colliderCount() { return this.boxRecords.length + this.prisms.length; }
  prismAt(id) { return this.prismStore ? this.prismStore.get(id) : this.prisms[id]; }
  prismContactPieces(p) {
    if (p.contactPieces) return p.contactPieces;
    const pieces = contactPieces(p), saved = this.prismStore?.contactBase(p.id) ?? -1;
    if (saved >= 0) {
      let id = saved;
      for (const piece of pieces) piece.contactId = id++;
    } else {
      this.prismStore?.rememberContactBase(p.id, this._nextContactId);
      for (const piece of pieces) piece.contactId = this._nextContactId++;
    }
    return p.contactPieces = pieces;
  }
  findPlacementTarget(request) { return findPlacementTarget(this, request); }
  findRecoveryTarget(request, canPlace) { return findRecoveryTarget(this, request, canPlace); }

  /** NYC 7cf4ce7's exact selected-support contract. No venue bounds or slope
   * heuristic grants park behavior to inherited SF roads or another floor.
   */
  transitionAt(x, z, referenceY) { return this.supportCapabilityAt('transition', x, z, referenceY); }

  // Local restart speed policy only. Actual recovery still requires the existing
  // footprint, dry support, full body, dynamic occupancy and departure checks.
  restartsAtRest(x, z, referenceY) { return this.supportCapabilityAt('restartsAtRest', x, z, referenceY); }

  supportCapabilityAt(capability, x, z, referenceY) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(referenceY)) return false;
    const store = this.topStore, index = this.capabilityIndex;
    let candidate = false;
    for (const localId of index.query({ minX: x, maxX: x, minZ: z, maxZ: z }, this._capabilityIds)) {
      const id = index.items.ids[localId];
      if (store.property(id, 'capabilities')?.[capability] !== true) continue;
      const y = store.heightAt(id, x, z);
      if (!Number.isFinite(y) || Math.abs(y - referenceY) > this.supportReach || !store.contains(id, x, z)) continue;
      candidate = true; break;
    }
    if (!candidate) return false; // Remote, empty-cell and wrong-floor probes do no ordinary ground/body work.
    const ground = this.sampleGround(x, z, this._capabilityProbe ??= { normal: {} }, referenceY);
    return ground.registered === true && !ground.offCourse && !ground.water
      && ground.support?.capabilities?.[capability] === true && Number.isFinite(ground.height)
      && Math.abs(ground.height - referenceY) <= this.supportReach;
  }

  cityGround(x, z, out, referenceY = Infinity) {
    out.height = this.waterLevel - 4; out.plane = null; out.surface = 'pavement';
    out.traction = undefined; out.offCourse = true; out.support = null; out.registered = false; out.water = true;
    if (![x, z].every(Number.isFinite)) { out.height = NaN; setNormal(out); return out; }
    const point = { minX: x, maxX: x, minZ: z, maxZ: z };
    for (const id of this.fieldIndex.query(point, this._fieldIds)) {
      const f = this.fields[id]; if (!insideField(f, x, z)) continue;
      sampleField(f, x, z, out); out.offCourse = false; out.registered = true; out.support = f; break;
    }
    const kind = maskClass(this.coreMask, x, z) ?? maskClass(this.regionMask, x, z, true);
    if (kind === 'lawn' || kind === 'park' || kind === 'forest' || kind === 'cemetery') out.surface = 'grass';
    else if (kind === 'sand') out.surface = 'dirt'; else if (kind === 'rock') out.surface = 'gravel';
    // Core waterEdge is a material, not a water mask. Keep dry negative NAVD88
    // support when explicitly classified as land; do not confuse datum with depth.
    out.water = this.waterAt ? !!this.waterAt(x, z, out.height)
      : (!kind || kind === 'waterEdge' || kind === 'water') && out.height <= this.waterLevel + 0.05;
    if (out.water) { out.height = this.waterLevel - 4; out.plane = null; }
    let selected = null, selectedY = -Infinity, replacement = null, replacementY = -Infinity;
    let selectedId = -1, replacementId = -1;
    const store = this.topStore;
    for (const id of this.topIndex.query(point, this._topIds)) {
      if (!store.contains(id, x, z)) continue;
      const y = store.heightAt(id, x, z), ceilingOffset = store.property(id, 'ceilingOffset');
      const ceiling = ceilingOffset ? y + ceilingOffset : store.property(id, 'maxReferenceY');
      if (!Number.isFinite(y) || referenceY < (store.property(id, 'minReferenceY') ?? -Infinity)
        || referenceY >= (ceiling ?? Infinity) && ceiling !== undefined
        || (Number.isFinite(referenceY) && y > referenceY + this.supportReach)) continue;
      if (store.property(id, 'replacesTerrain') && Number.isFinite(referenceY)) {
        if (y > replacementY) { replacementId = id; replacementY = y; }
      } else if (y >= selectedY) { selectedId = id; selectedY = y; }
    }
    if (replacementId >= 0) replacement = store.get(replacementId);
    if (selectedId >= 0) selected = store.get(selectedId);
    // Legacy grade API is an explicit-height fallback; never consult level.y.
    if (!replacement && !this.grade?.floors?.length && Number.isFinite(referenceY)) {
      const floor = this.grade?.floorAt?.(x, z, referenceY);
      if (Number.isFinite(floor) && floor <= referenceY + this.supportReach) {
        const roof = this.grade.roofAt?.(x, z, Math.min(referenceY, floor + 0.1));
        if (Number.isFinite(roof) && referenceY < roof) {
          replacementY = floor;
          replacement = { top: floor, surface: 'pavement', replacesTerrain: true, ceiling: roof };
        } else if (floor > selectedY) { selectedY = floor; selected = { top: floor, surface: 'pavement' }; }
      }
    }
    if (replacement) { out.height = replacementY; out.plane = replacement.plane ?? null; out.support = replacement; out.water = false; out.registered = true; out.offCourse = false; }
    if (selected && selectedY >= out.height - EPS) {
      out.height = selectedY; out.plane = selected.plane ?? null; out.surface = selected.surface ?? 'pavement';
      // A submerged ordinary facet cannot turn the bay into dry pavement. A
      // bounded tunnel replacement above explicitly establishes its own dry bore.
      out.water = !!selected.water || (out.water && selectedY <= this.waterLevel + 0.05);
      out.support = selected; out.registered = true; out.offCourse = false;
    } else if (replacement) out.surface = replacement.surface ?? 'pavement';
    out.offCourse ||= out.water; // Never record the submerged floor as a safe riding point.
    setNormal(out); return out;
  }

  sampleGround(x, z, out, referenceY = Infinity) {
    this.cityGround(x, z, out, referenceY);
    if (out.base) { out.base.height = out.height; Object.assign(out.base.normal ??= {}, out.normal); }
    // Body tops are NOT automatically roofs/support. Only explicit support:true
    // bodies opt in, and map/recovery can still demand registered surface support.
    const point = { minX: x, maxX: x, minZ: z, maxZ: z };
    if (this.hasBoxSupport) for (const id of this.boxIndex.query(point, this._boxIds)) {
      const b = this.boxStore.get(id), c = b.collider, y = c.centre.y + c.halfExtents.y;
      if (c.support !== true || y <= out.height || (Number.isFinite(referenceY) && y > referenceY + this.supportReach)) continue;
      const dx = x - c.centre.x, dz = z - c.centre.z;
      if (Math.abs(b.cos * dx - b.sin * dz) > c.halfExtents.x || Math.abs(b.sin * dx + b.cos * dz) > c.halfExtents.z) continue;
      out.water &&= y <= this.waterLevel + 0.05;
      out.height = y; out.plane = null; out.surface = c.surface; out.support = c; out.registered = false; out.offCourse = out.water;
    }
    if (this.hasPrismSupport) for (const id of this.prismIndex.query(point, this._prismIds)) {
      const p = this.prismAt(id);
      if (p.support !== true || p.maxY <= out.height || (Number.isFinite(referenceY) && p.maxY > referenceY + this.supportReach) || !contains(p, x, z)) continue;
      out.water &&= p.maxY <= this.waterLevel + 0.05;
      out.height = p.maxY; out.plane = null; out.surface = p.surface ?? 'pavement'; out.support = p; out.registered = false; out.offCourse = out.water;
    }
    setNormal(out); return out;
  }

  isWater(x, z, referenceY = Infinity) { return this.sampleGround(x, z, this._probe, referenceY).water; }
  // Wheel-foot immersion, not height alone or an XZ-only ocean boundary. Airborne
  // travel over water stays physical until the foot is 25 cm below the waterline.
  needsWaterRecovery(x, z, referenceY) {
    return Number.isFinite(referenceY) && referenceY <= this.waterLevel - 0.25
      && this.isWater(x, z, referenceY);
  }
  isOffLimits(x, z, referenceY = Infinity) {
    const p = this.sampleGround(x, z, this._probe, referenceY);
    return p.offCourse || p.water || !!this.offLimitsAt?.(x, z, referenceY);
  }

  _candidates(o, d, max, width, limb) {
    const b = { minX: Math.min(o.x, o.x + d.x * max) - width, maxX: Math.max(o.x, o.x + d.x * max) + width,
      minZ: Math.min(o.z, o.z + d.z * max) - width, maxZ: Math.max(o.z, o.z + d.z * max) + width };
    if (limb) { b.minX = Math.min(b.minX, limb.minX); b.maxX = Math.max(b.maxX, limb.maxX); b.minZ = Math.min(b.minZ, limb.minZ); b.maxZ = Math.max(b.maxZ, limb.maxZ); }
    const ids = this.boxIndex.query(b, this._boxIds), n = this.native;
    if (n.gridItems.length < ids.length) n.gridItems = new Int32Array(Math.max(ids.length, n.gridItems.length * 2, 16));
    n.gridItems.set(ids); n.gridStarts[1] = ids.length;
    this.prismIndex.query(b, this._prismIds);
  }

  raycastObstacle(origin, direction, maxDistance, sweepHalfWidth = 0, sweepLateral, out, initialExit, limb) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!(length > 0) || !Number.isFinite(length) || !(maxDistance > 0) || !Number.isFinite(maxDistance)
      || ![origin.x, origin.y, origin.z].every(Number.isFinite)) return null;
    const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    const width = Number.isFinite(sweepHalfWidth) ? Math.max(0, sweepHalfWidth) : 0;
    const horizontal = Math.hypot(d.x, d.z), supplied = Math.hypot(sweepLateral?.x ?? 0, sweepLateral?.z ?? 0);
    const lx = supplied ? sweepLateral.x / supplied : horizontal ? -d.z / horizontal : 0;
    const lz = supplied ? sweepLateral.z / supplied : horizontal ? d.x / horizontal : 0;
    this._candidates(origin, d, maxDistance, width, limb);
    const boxCount = this.boxRecords.length;
    const polygonExit = initialExit && initialExit.colliderIndex >= boxCount;
    if (limb) {
      const contacts = limb.records.sfContacts ??= new Map();
      // Clear the entire caller-owned slice, including slots later used by living
      // bodies. Other limbs' slices must keep their independent metadata.
      for (let i = 0; i < limb.capacity; i++) contacts.delete(limb.recordOffset + i * 9);
    }
    let hit = this.native.raycastObstacle(origin, d, maxDistance, width, sweepLateral, out, polygonExit ? undefined : initialExit, limb);
    if (limb) {
      const exact = limb.prisms ??= []; exact.length = 0;
      for (const id of this._prismIds) {
        const p = this.prismAt(id);
        if (touches(p, limb) && p.minY <= limb.maxY && p.maxY >= limb.minY) exact.push(p);
      }
      for (const p of exact) {
        const pieces = this.prismContactPieces(p);
        for (let id = 0; id < pieces.length; id++) {
          const piece = pieces[id]; if (!touches(piece, limb)) continue;
          if (limb.count >= limb.capacity) { limb.overflow = true; break; }
          const at = limb.recordOffset + limb.count++ * 9, r = limb.records;
          r[at] = piece.contactId;
          r[at + 1] = (piece.minX + piece.maxX) / 2; r[at + 2] = (piece.minY + piece.maxY) / 2; r[at + 3] = (piece.minZ + piece.maxZ) / 2;
          r[at + 4] = (piece.maxX - piece.minX) / 2; r[at + 5] = (piece.maxY - piece.minY) / 2; r[at + 6] = (piece.maxZ - piece.minZ) / 2;
          r[at + 7] = 1; r[at + 8] = 0;
          r.sfContacts.set(at, piece);
        }
      }
    }
    if (initialExit) {
      if (polygonExit) {
        const p = this.prismAt(initialExit.colliderIndex - boxCount);
        if (!p || !this._validPrismExit(p, origin, d, maxDistance, width, initialExit) || hit !== null) return 0;
        for (const id of this._boxIds) if (sphereHitsBox(this.boxStore.get(id), origin, d, maxDistance, width)) return 0;
      } else if (hit !== null) return 0;
      for (const id of this._prismIds) {
        if (boxCount + id === initialExit.colliderIndex) continue;
        if (prismIntervals(this.prismAt(id), origin, d, maxDistance, 0, 0, 0, width).length) return 0;
      }
      return this._roofDistance(origin, d, maxDistance, width)?.distance !== undefined ? 0 : null;
    }
    for (const id of this._prismIds) {
      const p = this.prismAt(id), intervals = prismIntervals(p, origin, d, maxDistance, width, lx, lz);
      if (!intervals.length || (hit !== null && hit <= intervals[0].start)) continue;
      const first = intervals[0]; hit = first.start;
      if (out) {
        const inside = origin.y > p.minY + EPS && origin.y < p.maxY - EPS && contains(p, origin.x, origin.z, false);
        const face = inside || !first.event.normal ? nearestFace(p, origin) : first.event;
        out.distance = hit; out.halfExtentX = (p.maxX - p.minX) / 2; out.halfExtentZ = (p.maxZ - p.minZ) / 2;
        if (out.normal) Object.assign(out.normal, face.normal);
        if (out.inside !== undefined) { out.inside = inside; out.colliderIndex = boxCount + id; out.faceOffset = face.faceOffset; }
      }
    }
    const roof = this._roofDistance(origin, d, maxDistance);
    if (roof && (hit === null || roof.distance < hit)) {
      hit = roof.distance;
      if (out) {
        out.distance = hit; out.halfExtentX = 0; out.halfExtentZ = 0;
        if (out.normal) Object.assign(out.normal, roof.normal);
        if (out.inside !== undefined) { out.inside = false; out.colliderIndex = -1; out.faceOffset = roof.faceOffset; }
      }
    }
    return hit;
  }

  // Controller-only wheel/standoff query. Ordinary hits retain precedence and
  // hit details on ties; the derived envelope never enters general clearance.
  raycastWheelObstacle(origin, direction, maxDistance, sweepHalfWidth = 0, sweepLateral, out) {
    const ordinary = this.raycastObstacle(origin, direction, maxDistance, sweepHalfWidth, sweepLateral, out);
    const n = this.wheelBoxes;
    if (!n) return ordinary;
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!(length > 0) || !Number.isFinite(length) || !(maxDistance > 0) || !Number.isFinite(maxDistance)
      || ![origin.x, origin.y, origin.z].every(Number.isFinite)) return ordinary;
    const width = Number.isFinite(sweepHalfWidth) ? Math.max(0, sweepHalfWidth) : 0;
    const ex = origin.x + direction.x / length * maxDistance, ez = origin.z + direction.z / length * maxDistance;
    const ids = this.wheelIndex.query({ minX: Math.min(origin.x, ex) - width, maxX: Math.max(origin.x, ex) + width,
      minZ: Math.min(origin.z, ez) - width, maxZ: Math.max(origin.z, ez) + width }, this._wheelIds);
    if (!ids.length) return ordinary;
    if (n.gridItems.length < ids.length) n.gridItems = new Int32Array(Math.max(ids.length, n.gridItems.length * 2, 16));
    n.gridItems.set(ids); n.gridStarts[1] = ids.length;
    const rail = n.raycastObstacle(origin, direction, maxDistance, width, sweepLateral);
    if (rail === null || (ordinary !== null && ordinary <= rail)) return ordinary;
    if (out) n.raycastObstacle(origin, direction, maxDistance, width, sweepLateral, out);
    return rail;
  }

  _roofDistance(o, d, max, radius = 0) {
    let best = null;
    const b = { minX: Math.min(o.x, o.x + d.x * max), maxX: Math.max(o.x, o.x + d.x * max),
      minZ: Math.min(o.z, o.z + d.z * max), maxZ: Math.max(o.z, o.z + d.z * max) };
    const store = this.topStore, plane = {};
    for (const id of this.ceilingIndex.query(b, this._topIds)) {
      const topId = store.ceilingIds[id], ceilingOffset = store.property(topId, 'ceilingOffset');
      const p = store.plane(topId, plane), denom = d.y - (p?.dx ?? 0) * d.x - (p?.dz ?? 0) * d.z;
      if (Math.abs(denom) < EPS) continue;
      const at = (store.heightAt(topId, o.x, o.z) + ceilingOffset - radius - o.y) / denom;
      if (at < 0 || at > max || (best && at >= best.distance) || !store.contains(topId, o.x + d.x * at, o.z + d.z * at)) continue;
      const inv = 1 / Math.hypot(p?.dx ?? 0, 1, p?.dz ?? 0);
      best = { distance: at, normal: { x: (p?.dx ?? 0) * inv, y: -inv, z: (p?.dz ?? 0) * inv },
        faceOffset: -(store.heightAt(topId, 0, 0) + ceilingOffset) * inv };
    }
    if (this.legacyGradeRays && this.grade?.roofAt) {
      for (let lo = 0; lo < max; lo += 0.5) {
        const hi = Math.min(max, lo + 0.5), mid = (lo + hi) / 2;
        const x = o.x + d.x * mid, z = o.z + d.z * mid;
        const floor = this.grade.floorAt?.(x, z, o.y);
        const roof = this.grade.roofAt(x, z, Number.isFinite(floor) ? floor + 0.1 : o.y);
        if (!Number.isFinite(roof) || Math.abs(d.y) <= EPS) continue;
        const at = (roof - radius - o.y) / d.y;
        if (at >= lo - EPS && at <= hi + EPS && (!best || at < best.distance)) {
          best = { distance: Math.max(0, at), normal: { x: 0, y: -1, z: 0 }, faceOffset: -roof }; break;
        }
      }
    }
    return best;
  }

  _validPrismExit(p, o, d, max, radius, c) {
    if (!(c.slack >= 0) || !Number.isFinite(c.slack) || !Number.isFinite(c.faceOffset)
      || !(o.y > p.minY && o.y < p.maxY) || !contains(p, o.x, o.z, false)) return false;
    const n = c.normal;
    const face = Math.abs(n.x) < EPS && Math.abs(n.z) < EPS &&
      ((Math.abs(n.y - 1) < EPS && Math.abs(c.faceOffset - p.maxY) < EPS)
      || (Math.abs(n.y + 1) < EPS && Math.abs(c.faceOffset + p.minY) < EPS))
      || p.edges.some(e => Math.abs(e.nx - n.x) < EPS && Math.abs(n.y) < EPS && Math.abs(e.nz - n.z) < EPS && Math.abs(e.offset - c.faceOffset) < EPS);
    const progress = n.x * d.x + n.y * d.y + n.z * d.z;
    const signed = n.x * o.x + n.y * o.y + n.z * o.z;
    if (!face || progress <= EPS || signed + progress * max < c.faceOffset + radius + c.slack - EPS) return false;
    const intervals = prismIntervals(p, o, d, max, 0, 0, 0, radius);
    // A concave ray may leave and then enter another wing. Such a certificate
    // cannot authorize skipping that later wall, even though it is the same id.
    if (intervals.length !== 1 || intervals[0].start > EPS || intervals[0].end >= max - EPS) return false;
    const t = (c.faceOffset - signed) / progress;
    const q = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    if (Math.abs(n.y) > 0.9) return contains(p, q.x, q.z);
    return p.edges.some(e => Math.abs(e.nx - n.x) < EPS && Math.abs(e.nz - n.z) < EPS
      && Math.hypot(closest(e.a, e.b, q.x, q.z).x - q.x, closest(e.a, e.b, q.x, q.z).z - q.z) < 1e-6
      && q.y >= p.minY && q.y <= p.maxY);
  }

  /** Full upright OBB volume query; no public dense sampler.boxes dependency. */
  isVolumeClear(body) {
    const { x, z, headingY: h, halfWidthMetres: hw, halfLengthMetres: hl, minY, maxY } = body;
    if (![x, z, h, hw, hl, minY, maxY].every(Number.isFinite) || hw <= 0 || hl <= 0 || maxY <= minY) return false;
    const c = Math.cos(h), s = Math.sin(h);
    const poly = [{ x: x - c * hw - s * hl, z: z + s * hw - c * hl }, { x: x + c * hw - s * hl, z: z - s * hw - c * hl },
      { x: x + c * hw + s * hl, z: z - s * hw + c * hl }, { x: x - c * hw + s * hl, z: z + s * hw + c * hl }];
    const b = bounds(poly);
    const fp = body.floorPlane;
    if (fp && ![fp.x, fp.y, fp.z, fp.dx, fp.dz].every(Number.isFinite)) return false;
    const bottomAt = fp ? (px, pz) => fp.y + fp.dx * (px - fp.x) + fp.dz * (pz - fp.z) + minY - (body.floorY ?? fp.y)
      : () => minY;
    const lower = fp ? Math.min(...poly.map(p => bottomAt(p.x, p.z))) : minY;
    const overlapsPoly = (p, topY) => {
      const above = (x, z) => topY > bottomAt(x, z) + EPS;
      // A linear bottom plane reaches its extrema at vertices of the exact
      // footprint intersection: contained corners, ring vertices and crossings.
      // This exempts supporting sloped slabs without exempting posts/overheads,
      // nor replacing a concave/holed prism by its broad-phase rectangle.
      for (const q of poly) if (contains(p, q.x, q.z) && above(q.x, q.z)) return true;
      for (const ring of [p.outer ?? p.poly, ...(p.holes ?? EMPTY)]) for (const q of ring) {
        if (ringContains(poly, q.x, q.z) && above(q.x, q.z)) return true;
      }
      for (const e of p.edges ?? edgesOf(p)) for (let i = 0; i < 4; i++) {
        const a = poly[i], b = poly[(i + 1) % 4];
        const t = segmentCross(a.x, a.z, b.x, b.z, e.a.x, e.a.z, e.b.x, e.b.z);
        if (t !== null && above(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return true;
      }
      return false;
    };
    for (const id of this.boxIndex.query(b, this._boxIds)) {
      const p = this.boxStore.get(id), q = p.collider;
      const top = q.centre.y + q.halfExtents.y;
      if (top <= lower + EPS || q.centre.y - q.halfExtents.y >= maxY - EPS) continue;
      const xc = p.cos * q.halfExtents.x, xs = p.sin * q.halfExtents.x, zc = p.cos * q.halfExtents.z, zs = p.sin * q.halfExtents.z;
      if (overlapsPoly({ poly: [{ x: q.centre.x - xc - zs, z: q.centre.z + xs - zc }, { x: q.centre.x + xc - zs, z: q.centre.z - xs - zc },
        { x: q.centre.x + xc + zs, z: q.centre.z - xs + zc }, { x: q.centre.x - xc + zs, z: q.centre.z + xs + zc }] }, top)) return false;
    }
    for (const id of this.prismIndex.query(b, this._prismIds)) {
      const p = this.prismAt(id); if (p.maxY > lower + EPS && p.minY < maxY - EPS && overlapsPoly(p, p.maxY)) return false;
    }
    for (const p of [...poly, { x, z }]) {
      const reference = fp ? bottomAt(p.x, p.z) - minY + (body.floorY ?? fp.y) : body.floorY ?? minY;
      const g = this.cityGround(p.x, p.z, this._probe, reference);
      const roof = g.support?.ceiling ?? (g.support?.ceilingOffset ? g.height + g.support.ceilingOffset : this.grade?.roofAt?.(p.x, p.z, reference));
      if (Number.isFinite(roof) && roof < maxY + EPS && roof > minY) return false;
    }
    return true;
  }

  raycast(origin, direction, maxDistance) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!(length > 0) || !Number.isFinite(length) || !(maxDistance > 0) || !Number.isFinite(maxDistance)) return null;
    const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    this._candidates(origin, d, maxDistance, 0);
    let hit = this.native.raycastPreparedBoxes(origin, d.x, d.y, d.z, maxDistance, true);
    for (const id of this._prismIds) {
      const p = this.prismAt(id); if (p.occludes === false) continue;
      const a = prismIntervals(p, origin, d, maxDistance);
      if (a.length && (hit === null || a[0].start < hit)) hit = a[0].start;
    }
    const limit = hit ?? maxDistance, events = [0, limit];
    const b = { minX: Math.min(origin.x, origin.x + d.x * limit), maxX: Math.max(origin.x, origin.x + d.x * limit),
      minZ: Math.min(origin.z, origin.z + d.z * limit), maxZ: Math.max(origin.z, origin.z + d.z * limit) };
    for (const id of this.fieldIndex.query(b, this._fieldIds)) {
      const f = this.fields[id];
      for (const [o, v, start, end] of [[origin.x, d.x, f.minX, f.maxX], [origin.z, d.z, f.minZ, f.maxZ]]) {
        if (Math.abs(v) <= EPS) continue;
        const lo = Math.max(start, Math.min(o, o + v * limit)), hi = Math.min(end, Math.max(o, o + v * limit));
        for (let i = Math.ceil((lo - start) / f.step); i <= Math.floor((hi - start) / f.step); i++) events.push((start + i * f.step - o) / v);
      }
      // Triangle diagonal x/step + z/step = integer (00,01,10).
      const speed = (d.x + d.z) / f.step, initial = (origin.x - f.x0 + origin.z - f.z0) / f.step;
      if (Math.abs(speed) > EPS) {
        const end = initial + speed * limit;
        for (let i = Math.ceil(Math.min(initial, end)); i <= Math.floor(Math.max(initial, end)); i++) events.push((i - initial) / speed);
      }
    }
    const store = this.topStore, plane = {};
    for (const id of this.topIndex.query(b, this._topIds)) {
      const p = store.plane(id, plane);
      const denom = d.y - (p?.dx ?? 0) * d.x - (p?.dz ?? 0) * d.z;
      if (Math.abs(denom) <= EPS) continue;
      const ceilingOffset = store.property(id, 'ceilingOffset');
      for (const offset of ceilingOffset ? [0, ceilingOffset] : [0]) {
        const at = (store.heightAt(id, origin.x, origin.z) + offset - origin.y) / denom;
        if (at >= 0 && at <= limit && store.contains(id, origin.x + d.x * at, origin.z + d.z * at)) {
          events.push(at);
          // A tiny registered facet can lie between the field's grid crossings;
          // its exact plane hit must not depend on an interval midpoint landing
          // inside that facet. Support is a real drawn surface, not its AABB.
          if (store.property(id, 'occludes') !== false && (hit === null || at < hit)) hit = at;
        }
      }
    }
    // API-only grade fallbacks have no exposed facet planes. Bounded local
    // subdivision still gives exact flat/linear floor and ceiling intersections.
    if (this.legacyGradeRays) for (let t = 0.5; t < limit; t += 0.5) events.push(t);
    events.sort((a, b) => a - b);
    const probe = { normal: {} };
    const g0 = this.cityGround(origin.x, origin.z, probe, origin.y);
    if (!g0.offCourse && origin.y <= g0.height + EPS) return 0;
    for (let i = 0; i + 1 < events.length; i++) {
      const lo = Math.max(0, events[i]), hi = Math.min(limit, events[i + 1]); if (hi < lo + EPS) continue;
      const mid = (lo + hi) / 2, x = origin.x + d.x * mid, z = origin.z + d.z * mid;
      const g = this.cityGround(x, z, probe, Math.min(origin.y, origin.y + d.y * mid));
      if (g.offCourse) continue;
      const p = g.plane, denom = d.y - (p?.dx ?? 0) * d.x - (p?.dz ?? 0) * d.z;
      if (Math.abs(denom) > EPS) {
        const at = mid + (g.height - origin.y - d.y * mid) / denom;
        if (at >= lo - EPS && at <= hi + EPS) return Math.min(hit ?? Infinity, Math.max(0, at));
      }
      const roof = g.support?.ceiling ?? (g.support?.ceilingOffset ? g.height + g.support.ceilingOffset : this.grade?.roofAt?.(x, z, g.height + 0.1));
      if (Number.isFinite(roof) && Math.abs(denom) > EPS) {
        const at = mid + (roof - origin.y - d.y * mid) / denom;
        if (at >= lo - EPS && at <= hi + EPS) return Math.min(hit ?? Infinity, Math.max(0, at));
      }
    }
    return hit;
  }
}
