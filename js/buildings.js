(function () {
// js/buildings.js
// San Francisco's real footprints, facade masses and physical roof details.
// The quadtree streams cornices and HVAC around the camera; physical support is
// registered once, independently of visibility. SF fronts/crowns live in sf-buildings.js.

const { THREE, GEO, blockAt } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const { Fn, vec2, color, uv, normalWorldGeometry, abs, fract, step, smoothstep, max, min, mix, length, fwidth } = window.NYC.TSL;
const { createPreWarBuildingMaterial, createCurtainWallMaterial, createFacadeBoxes, filteredPulse, WALL_KINDS } = window.NYC;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Retain the exported name used by the city bridge and diagnostic consumers.
class ManhattanQuadtree {
  constructor(bounds, capacity = 6, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.items = [];
    this.divided = false;
    this.nw = null;
    this.ne = null;
    this.sw = null;
    this.se = null;
  }

  containsPoint(x, z) {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  intersectsCircle(cx, cz, radius) {
    const b = this.bounds;
    const closestX = Math.max(b.minX, Math.min(cx, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(cz, b.maxZ));
    const dx = cx - closestX;
    const dz = cz - closestZ;
    return (dx * dx + dz * dz) <= (radius * radius);
  }

  subdivide() {
    const b = this.bounds;
    const midX = (b.minX + b.maxX) * 0.5;
    const midZ = (b.minZ + b.maxZ) * 0.5;
    const nextDepth = this.depth + 1;

    this.nw = new ManhattanQuadtree({ minX: b.minX, maxX: midX, minZ: b.minZ, maxZ: midZ }, this.capacity, this.maxDepth, nextDepth);
    this.ne = new ManhattanQuadtree({ minX: midX, maxX: b.maxX, minZ: b.minZ, maxZ: midZ }, this.capacity, this.maxDepth, nextDepth);
    this.sw = new ManhattanQuadtree({ minX: b.minX, maxX: midX, minZ: midZ, maxZ: b.maxZ }, this.capacity, this.maxDepth, nextDepth);
    this.se = new ManhattanQuadtree({ minX: midX, maxX: b.maxX, minZ: midZ, maxZ: b.maxZ }, this.capacity, this.maxDepth, nextDepth);
    this.divided = true;

    for (const item of this.items) {
      this._insertIntoChildren(item);
    }
    this.items.length = 0;
  }

  _insertIntoChildren(item) {
    if (this.nw.containsPoint(item.cx, item.cz)) return this.nw.insert(item);
    if (this.ne.containsPoint(item.cx, item.cz)) return this.ne.insert(item);
    if (this.sw.containsPoint(item.cx, item.cz)) return this.sw.insert(item);
    if (this.se.containsPoint(item.cx, item.cz)) return this.se.insert(item);
    return false;
  }

  insert(item) {
    if (!this.containsPoint(item.cx, item.cz)) return false;

    if (!this.divided) {
      if (this.items.length < this.capacity || this.depth >= this.maxDepth) {
        this.items.push(item);
        return true;
      }
      this.subdivide();
    }
    return this._insertIntoChildren(item);
  }

  queryRange(cx, cz, radius, found = []) {
    if (!this.intersectsCircle(cx, cz, radius)) return found;

    const rSq = radius * radius;
    if (!this.divided) {
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        const dx = item.cx - cx;
        const dz = item.cz - cz;
        if (dx * dx + dz * dz <= rSq) {
          found.push(item);
        }
      }
      return found;
    }

    this.nw.queryRange(cx, cz, radius, found);
    this.ne.queryRange(cx, cz, radius, found);
    this.sw.queryRange(cx, cz, radius, found);
    this.se.queryRange(cx, cz, radius, found);
    return found;
  }
}

// Subtract tunnel footprints only after grade construction has supplied the actual
// bore profiles. These small convex prisms are shared by the facade and EUC bodies;
// navigation keeps its original building reservations. No building IDs or portal
// coordinates participate in the repair. MIT; retain the city notices in NOTICE.md.
function finishBuildingTunnelOpenings(batches, colliders, grade) {
  const ride = window.NYC.ride, RG = window.NYC.RideGeometry;
  // grade-separation floorQuad's 24 cm slab plus its 2 mm support offset.
  // The floor slab replaces the foundation here; keep the original mass beneath
  // its underside, rather than leaving a second foundation surface in the road.
  const floorSlabDepth = .242;
  const bounds = p => ({ minX: Math.min(...p.map(v => v.x)), maxX: Math.max(...p.map(v => v.x)),
    minZ: Math.min(...p.map(v => v.z)), maxZ: Math.max(...p.map(v => v.z)) });
  const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
  const area = p => {
    let a = 0;
    for (let i = 1; i + 1 < p.length; i++) a += (p[i].x - p[0].x) * (p[i + 1].z - p[0].z) - (p[i].z - p[0].z) * (p[i + 1].x - p[0].x);
    return Math.abs(a) / 2;
  };
  const split = (poly, plane) => {
    const inside = [], outside = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i], da = plane[0] * a.x + plane[2] * a.z + plane[3], db = plane[0] * b.x + plane[2] * b.z + plane[3];
      if ((da < 0) !== (db < 0)) {
        const t = da / (da - db), p = { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
        inside.push(p); outside.push(p);
      }
      (db >= 0 ? inside : outside).push(b);
    }
    return [inside, outside];
  };
  const intersection = (poly, planes) => {
    for (const plane of planes) { poly = split(poly, plane)[0]; if (poly.length < 3) break; }
    return poly;
  };
  const hull = points => {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
    const half = list => {
      const out = [];
      for (const p of list) {
        while (out.length > 1) {
          const a = out[out.length - 2], b = out[out.length - 1];
          if ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) > 1e-10) break;
          out.pop();
        }
        out.push(p);
      }
      out.pop(); return out;
    };
    return half(sorted).concat(half(sorted.reverse())).reverse();
  };
  const floorTops = (ride?.tops || []).filter(t => t.replacesTerrain).map(t => ({ ...bounds(t.poly), top: t }));
  // The sparse index avoids a city-masses × tunnel-stations scan. It is construction
  // scratch, released on return; neither sampler nor actor queries retain it.
  const grid = new Map(), cell = 64;
  for (const c of grade?.terrainCuts || []) {
    const sides = c.planes.filter(p => p[1] === 0), roof = c.planes.find(p => p[1] < 0);
    if (sides.length !== 4 || !roof) continue;
    const cut = { ...c, sides, roof, floors: floorTops.filter(t => overlaps(c, t)) };
    for (let x = Math.floor(c.minX / cell); x <= Math.floor(c.maxX / cell); x++)
      for (let z = Math.floor(c.minZ / cell); z <= Math.floor(c.maxZ / cell); z++) {
        const key = `${x},${z}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(cut);
      }
  }
  const removedFoundations = new Set();
  const stats = { masses: 0, parts: 0, foundations: 0 };
  if (!grid.size) return stats;
  for (const { mesh, items } of batches) {
    const removed = new Set();
    for (let id = 0; id < items.length; id++) {
      const b = items[id], bottom = b.y - b.h / 2, top = b.y + b.h / 2;
      const ex = (Math.abs(Math.cos(b.ry || 0)) * b.w + Math.abs(Math.sin(b.ry || 0)) * b.d) / 2;
      const ez = (Math.abs(Math.sin(b.ry || 0)) * b.w + Math.abs(Math.cos(b.ry || 0)) * b.d) / 2;
      const bb = { minX: b.x - ex, maxX: b.x + ex, minZ: b.z - ez, maxZ: b.z + ez };
      const nearby = new Set();
      for (let x = Math.floor(bb.minX / cell); x <= Math.floor(bb.maxX / cell); x++)
        for (let z = Math.floor(bb.minZ / cell); z <= Math.floor(bb.maxZ / cell); z++)
          for (const c of grid.get(`${x},${z}`) || []) if (overlaps(bb, c)) nearby.add(c);
      if (!nearby.size) continue;
      const poly = RG.boxPoly({ x: b.x, z: b.z }, { x: b.w / 2, z: b.d / 2 }, b.ry || 0);
      const cuts = [];
      let low = Infinity, high = -Infinity, highestFloor = -Infinity;
      for (const c of nearby) {
        const p = intersection(poly, c.sides);
        if (area(p) < 1e-8) continue;
        const roof = Math.max(...p.map(v => -(c.roof[0] * v.x + c.roof[2] * v.z + c.roof[3]) / c.roof[1]));
        if (roof <= bottom) continue;
        let floor = Infinity;
        for (const f of c.floors) {
          // Registered floor facets have the source grade and include joined mouths.
          // Evaluate their planes on this bounded cell. The min-slab/max-roof
          // envelope is local to this one source mass,
          // NOT a new actor, traffic or global city height layer.
          if (!overlaps(bounds(p), f)) continue;
          for (const v of p) {
            const y = f.top.plane ? f.top.plane.y + f.top.plane.dx * (v.x - f.top.plane.x) + f.top.plane.dz * (v.z - f.top.plane.z) : f.top.top;
            floor = Math.min(floor, y); highestFloor = Math.max(highestFloor, y);
          }
        }
        if (!Number.isFinite(floor) || floor - floorSlabDepth >= top) continue;
        cuts.push(c); low = Math.min(low, floor - floorSlabDepth); high = Math.max(high, roof);
      }
      // This repair owns masses spanning the supported roadway (including their
      // foundation). Buildings wholly above that floor are not the demonstrated
      // facade obstruction, even if a conservative roof estimate grazes their base.
      if (!cuts.length || bottom > highestFloor + .02) continue;
      low = Math.max(bottom, low); high = Math.min(top, high);
      let remaining = [poly];
      for (const c of cuts) {
        const next = [];
        for (let p of remaining) {
          if (area(intersection(p, c.sides)) < 1e-8) { next.push(p); continue; }
          // Keep outside fragments in source order; only the final inside is void.
          for (const plane of c.sides) {
            const [inside, outside] = split(p, plane);
            if (area(outside) > 1e-8) next.push(outside);
            p = inside;
            if (area(p) < 1e-8) break;
          }
        }
        remaining = next;
      }
      // Adjacent station cuts can leave many coplanar strips. Merge only when the
      // convex hull has exactly the sum of their areas (never fill a concavity).
      let merged = true;
      while (merged) {
        merged = false;
        for (let i = 0; i < remaining.length && !merged; i++) for (let j = i + 1; j < remaining.length; j++) {
          const joined = hull([...remaining[i], ...remaining[j]]);
          if (Math.abs(area(joined) - area(remaining[i]) - area(remaining[j])) > 1e-7) continue;
          remaining[i] = joined; remaining.splice(j, 1); merged = true; break;
        }
      }
      const parts = [];
      if (low > bottom) parts.push({ outer: poly, minY: bottom, maxY: low });
      for (const outer of remaining) parts.push({ outer, minY: low, maxY: high });
      if (high < top) parts.push({ outer: poly, minY: high, maxY: top });

      // Render each exact convex remnant in the ORIGINAL unit-box frame. That
      // frame and copied instance attributes keep facade bays, seeds, paint,
      // plinths and storeys anchored. Internal partition faces are buried in the
      // retained solid; no face crosses the opening. No shader discard/collision
      // exemption, per-frame work, new material or other-instance recolouring.
      const pos = [], normals = [], uvs = [], cs = Math.cos(b.ry || 0), sn = Math.sin(b.ry || 0);
      const local = (p, y) => [(cs * (p.x - b.x) - sn * (p.z - b.z)) / b.w, (y - b.y) / b.h,
        (sn * (p.x - b.x) + cs * (p.z - b.z)) / b.d];
      const face = (points, nx, ny, nz) => {
        const n = new THREE.Vector3(b.w * (cs * nx - sn * nz), b.h * ny, b.d * (sn * nx + cs * nz)).normalize();
        for (let i = 1; i + 1 < points.length; i++) {
          const tri = [points[0], points[i], points[i + 1]], a = new THREE.Vector3(...tri[0]), d = new THREE.Vector3(...tri[1]).sub(a), e = new THREE.Vector3(...tri[2]).sub(a);
          const cross = d.cross(e);
          if (cross.lengthSq() < 1e-24) continue;
          if (cross.dot(n) < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
          for (const p of tri) {
            pos.push(...p); normals.push(n.x, n.y, n.z);
            // BoxGeometry's six face UV projections, also used on the new reveals.
            if (Math.abs(n.y) > .5) uvs.push(p[0] + .5, .5 - Math.sign(n.y) * p[2]);
            else if (Math.abs(n.x) > Math.abs(n.z)) uvs.push(.5 - Math.sign(n.x) * p[2], p[1] + .5);
            else uvs.push(.5 + Math.sign(n.z) * p[0], p[1] + .5);
          }
        }
      };
      for (const p of parts) {
        face(p.outer.map(v => local(v, p.maxY)), 0, 1, 0);
        face(p.outer.map(v => local(v, p.minY)), 0, -1, 0);
        for (let i = 0; i < p.outer.length; i++) {
          const a = p.outer[i], d = p.outer[(i + 1) % p.outer.length];
          // boxPoly and split preserve clockwise XZ winding.
          face([local(a, p.minY), local(d, p.minY), local(d, p.maxY), local(a, p.maxY)], a.z - d.z, 0, d.x - a.x);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      for (const [key, attr] of Object.entries(mesh.geometry.attributes)) if (attr.isInstancedBufferAttribute) {
        geometry.setAttribute(key, new THREE.InstancedBufferAttribute(attr.array.slice(id * attr.itemSize, (id + 1) * attr.itemSize), attr.itemSize, attr.normalized));
      }
      const replacement = new THREE.InstancedMesh(geometry, mesh.material, 1), matrix = new THREE.Matrix4();
      mesh.getMatrixAt(id, matrix); replacement.setMatrixAt(0, matrix);
      replacement.name = 'SFBuildingTunnelOpening';
      replacement.castShadow = mesh.castShadow; replacement.receiveShadow = mesh.receiveShadow;
      mesh.parent.add(replacement);
      removed.add(id); stats.masses++; stats.parts += parts.length;

      const clippedBodies = (y0, y1) => parts.map(p => ({ ...p, minY: Math.max(y0, p.minY), maxY: Math.min(y1, p.maxY),
        surface: 'pavement', support: false })).filter(p => p.maxY > p.minY);
      const close = (a, v) => Math.abs(a - v) < 1e-7;
      for (const c of colliders) if (c.obb && close(c.obb.cx, b.x) && close(c.obb.cz, b.z) && close(c.obb.hx * 2, b.w) && close(c.obb.hz * 2, b.d)
        && close(c.obb.cs, cs) && close(c.obb.sn, sn) && c.minY < top && c.maxY > bottom) {
        c.parts = clippedBodies(c.minY, c.maxY);
      }
      for (const c of ride.solids) if (close(c.centre.x, b.x) && close(c.centre.z, b.z) && close(c.halfExtents.x * 2, b.w)
        && close(c.halfExtents.z * 2, b.d) && close(c.rotationY, b.ry || 0)
        && c.centre.y - c.halfExtents.y >= bottom - 1e-7 && c.centre.y + c.halfExtents.y <= top + 1e-7) {
        removedFoundations.add(c); stats.foundations++;
        ride.prisms.push(...clippedBodies(c.centre.y - c.halfExtents.y, c.centre.y + c.halfExtents.y));
      }
    }
    if (removed.size) {
      // Compact original instance bytes, including their original seeds. Shrinking
      // count removes the old mass rather than hiding it with a degenerate matrix.
      const attrs = [mesh.instanceMatrix, ...Object.values(mesh.geometry.attributes).filter(a => a.isInstancedBufferAttribute)];
      let write = 0;
      for (let read = 0; read < mesh.count; read++) if (!removed.has(read)) {
        for (const a of attrs) if (write !== read) a.array.copyWithin(write * a.itemSize, read * a.itemSize, (read + 1) * a.itemSize);
        write++;
      }
      mesh.count = write;
      for (const a of attrs) a.needsUpdate = true;
      mesh.boundingBox = mesh.boundingSphere = null;
    }
  }
  if (removedFoundations.size) {
    let write = 0;
    for (const c of ride.solids) if (!removedFoundations.has(c)) ride.solids[write++] = c;
    ride.solids.length = write;
  }
  return stats;
}

// SF-only: the former opts.sf switch has no non-SF runtime consumer in this fork.
function buildCityBlocks(scene) {
  const group = new THREE.Group();
  group.name = 'ManhattanCityBlocks';
  const colliders = [];

  // Re-seeded per building below. Keep the seed and draw order: roof gear is visible.
  let rand = mulberry32(10019);
  const range = (a, b) => a + (b - a) * rand();

  const quadtree = new ManhattanQuadtree({
    minX: GEO.box.x0 - 50,
    maxX: GEO.box.x1 + 50,
    minZ: GEO.box.z0 - 50,
    maxZ: GEO.box.z1 + 50
  }, 6, 9);
  const allBlocks = [];

  // Painted masonry, row houses and warehouses, followed by the three curtain walls.
  const facades = [
    [createPreWarBuildingMaterial, { windowWidth: 2.4, floorHeight: 3.7, litProbability: 0.5, warmth: 0.82, seed: 12.4, paint: true }],
    [createPreWarBuildingMaterial, { windowWidth: 1.7, floorHeight: 3.3, windowRatioX: 0.56, windowRatioY: 0.62, cornerPier: 0.5, litProbability: 0.45, warmth: 0.88, seed: 27.8, paint: true }],
    [createPreWarBuildingMaterial, { windowWidth: 3.4, floorHeight: 4.4, windowRatioX: 0.7, windowRatioY: 0.6, cornerPier: 0.9, litProbability: 0.15, warmth: 0.7, seed: 41.2, paint: true, muntins: true }],
    [createCurtainWallMaterial, {
      glassTint: 0x1a3a52,
      frameTint: 0x3b4c5b,
      windowWidth: 2.7,
      floorHeight: 3.9,
      litProbability: 0.60,
      warmth: 0.52,
      reflectivity: 0.92,
      seed: 63.5
    }],
    [createCurtainWallMaterial, {
      glassTint: 0x242220,
      frameTint: 0x3c3631,
      windowWidth: 2.5,
      floorHeight: 3.8,
      litProbability: 0.64,
      warmth: 0.72,
      reflectivity: 0.88,
      seed: 81.9
    }],
    [createCurtainWallMaterial, {
      glassTint: 0x264664,
      frameTint: 0xb0bcc8,
      windowWidth: 2.9,
      floorHeight: 4.1,
      litProbability: 0.58,
      warmth: 0.48,
      reflectivity: 0.95,
      seed: 94.3
    }]
  ];
  const materials = facades.map(([create, opts]) => create({ ...opts, boxLocal: true }));
  const storeys = facades.map(([, opts]) => opts.floorHeight);
  const buckets = materials.map(() => []);

  // Real footprints and lidar heights, including exact concave outlines, party walls,
  // hill-relative floors, podiums, crowns and SF fronts. No Manhattan block-height cap.
  function buildSFMasses() {
    const { header, table, verts, masses } = window.NYC.DATA.buildings;
    const T = window.NYC.Terrain;
    const F = header.fields.length;
    const FRONT_REACH = 12;
    const PARTY_GAP = 0.5;
    const FOUNDATION = 1.0;
    const ride = window.NYC.RideGeometry;
    const PLINTH_MIN = 0.6;
    const PODIUM_STOREYS = 4; // estimate (PLAN.md P4-3)
    const CROWN_MIN = 6;
    const hash = (a, b) => Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1;

    // Footprints typed `landmark` under a modelled landmark (js/landmarks.js, built first) are left to the model (P5.1)
    const covered = new Set();
    const typeCol = header.fields.indexOf('type'), landmarkType = header.types.indexOf('landmark');
    if (window.NYC.landmarkCovers && typeCol >= 0) {
      for (let i = 0; i < header.count; i++) {
        if (table[i * F + typeCol] !== landmarkType) continue;
        const ringStart = table[i * F + 3], ringCount = table[i * F + 4];
        let sx = 0, sz = 0;
        for (let k = 0; k < ringCount; k++) { sx += verts[2 * (ringStart + k)]; sz += verts[2 * (ringStart + k) + 1]; }
        if (window.NYC.landmarkCovers(sx / ringCount, sz / ringCount)) covered.add(i);
      }
    }

    // Every mass, and a grid over them for the party-wall and front tests
    const all = [];
    for (let i = 0; i < header.count; i++) {
      const r = table.subarray(i * F, i * F + F);
      const [, , , , , theta, start, count] = r;
      const cs = Math.cos(theta), sn = Math.sin(theta);
      for (let k = start; k < start + count; k++) {
        const [cx, cz, w, d] = masses.subarray(k * 4, k * 4 + 4);
        all.push({ i, cx, cz, w, d, cs, sn });
      }
    }
    const CELL = 32;
    const grid = new Map();
    for (const m of all) {
      if (covered.has(m.i)) continue;
      const ex = Math.abs(m.cs) * m.w * 0.5 + Math.abs(m.sn) * m.d * 0.5;
      const ez = Math.abs(m.sn) * m.w * 0.5 + Math.abs(m.cs) * m.d * 0.5;
      for (let gx = Math.floor((m.cx - ex) / CELL); gx <= Math.floor((m.cx + ex) / CELL); gx++) {
        for (let gz = Math.floor((m.cz - ez) / CELL); gz <= Math.floor((m.cz + ez) / CELL); gz++) {
          const key = gx * 100000 + gz;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(m);
        }
      }
    }
    // the mass (other than `self`) containing (x, z), if any; local = R_y(-θ)(p - c)
    const massAt = (x, z, self) => {
      for (const m of grid.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)) || []) {
        if (m === self) continue;
        const dx = x - m.cx, dz = z - m.cz;
        if (Math.abs(dx * m.cs - dz * m.sn) <= m.w * 0.5 && Math.abs(dx * m.sn + dz * m.cs) <= m.d * 0.5) return m;
      }
      return null;
    };
    const onRoadway = (x, z) => T.groundAt(x, z) > T.waterLevel + 0.05 && !blockAt(x, z);
    // createFacadeBoxes `faces` order: local -x, +x, -z, +z; outward world normal of local (lx, lz) = R_y(θ)(lx, lz)
    const WALLS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    function wallKind(m, lx, lz, shops) {
      const nx = lx * m.cs + lz * m.sn, nz = -lx * m.sn + lz * m.cs;
      const half = lx ? m.w * 0.5 : m.d * 0.5;
      const len = lx ? m.d : m.w;
      // along the wall: R_y(θ)(lz, lx) rotated a quarter turn
      const ax = -lz * m.cs + lx * m.sn, az = lz * m.sn + lx * m.cs;
      const at = (u, out) => [m.cx + nx * (half + out) + ax * u * len, m.cz + nz * (half + out) + az * u * len];
      const samples = [-0.35, 0, 0.35];
      let party = 0;
      for (const u of samples) if (massAt(...at(u, PARTY_GAP), m)) party++;
      if (party >= 2) return WALL_KINDS.lotLine;
      for (const u of samples) {
        for (let o = 1.5; o <= FRONT_REACH; o += 1.5) {
          const [x, z] = at(u, o);
          if (massAt(x, z, m)) break;
          if (onRoadway(x, z)) return shops ? WALL_KINDS.shop : WALL_KINDS.entry;
        }
      }
      return WALL_KINDS.rear;
    }

    // P4.1 classes (data/buildings-<box>.bin, tools/building-rules.json) -> material, paint & storey height (P4.2, P4.3):
    // row houses, flats, apartments & sheds are painted (1); warehouses and SoMa's low offices brick & concrete (2);
    // towers by the Tall Building Inventory's facade material (glass and metal: curtain walls by era; concrete, stone &
    // terracotta: masonry 0 in panels), unknown ones half each; midrise, civic and the rest masonry (0)
    const FI = Object.fromEntries(header.fields.map((f, k) => [f, k]));
    const typeName = (v) => header.types[v] || 'apartment';
    const FACADE_PAINT = { 2: [0xb9b4aa, 0xc8c2b4, 0xa9a7a2, 0xd2cab8], 3: [0xd6ccb8, 0xc9bda4, 0xe0d8c6], 5: [0xe2d6c0, 0xd9c9ab] }; // concrete, stone, terracotta
    const { sfPaint } = window.NYC.SFStyle;
    const details = { bays: [], garages: [], steps: [], gables: [], spires: [] };
    function styleOf(i, type, palette, era, facade, height) {
      const h1 = hash(i, 3.1), h2 = hash(i, 7.7), h3 = hash(i, 11.3);
      let mat = 0;
      let paint = sfPaint(type, palette, h1, h2, h3);
      if (type === 'rowhouse' || type === 'flats' || type === 'apartment' || type === 'shed') mat = 1;
      else if (type === 'warehouse' || (type === 'office-low' && palette === 4)) mat = 2;
      else if (type === 'tower' || type === 'landmark' || (type === 'midrise' && height >= 45)) {
        const glass = facade === 1 || facade === 4 || (facade === 0 && hash(i, 2.9) < 0.5);
        if (glass) mat = facade === 4 || era === 4 ? 5 : era === 3 ? 4 : 3 + Math.floor(hash(i, 5.5) * 2);
        else if (FACADE_PAINT[facade]) paint = [FACADE_PAINT[facade][Math.floor(h1 * FACADE_PAINT[facade].length)], 0xe8e2d4, window.NYC.SFStyle.SURFACE.panel, paint[3]];
      }
      return { mat, paint };
    }

    const polyGeos = [];
    let massCount = 0;
    for (let i = 0; i < header.count; i++) {
      if (covered.has(i)) { massCount += table[i * F + 7]; continue; } // massCount: the masses' index in `all`
      const rec = table.subarray(i * F, i * F + F);
      const [base, roof, , ringStart, ringCount, theta, start, count, shopsFlag] = rec;
      const type = typeName(rec[FI.type]);
      const pts = [];
      for (let k = 0; k < ringCount; k++) pts.push({ x: verts[2 * (ringStart + k)], z: verts[2 * (ringStart + k) + 1] });
      const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const height = roof - base;
      const tone = hash(i, base);
      const { mat, paint } = styleOf(i, type, rec[FI.palette], rec[FI.era], rec[FI.facade], height);
      const storeyH = rec[FI.storeyH] || (type === 'tower' ? 3.9 : 0);
      const blk = {
        id: `sf_${i}`, cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5, minX, maxX, minZ, maxZ, district: 'sf', ry: theta,
        cornices: [], hvacUnits: [],
        footprints: [{ x0: minX, x1: maxX, z0: minZ, z1: maxZ, h: height, tone, pts }], maxH: height
      };
      rand = mulberry32((Math.imul(Math.round(blk.cx * 4), 73856093) ^ Math.imul(Math.round(blk.cz * 4), 19349663) ^ 10019) >>> 0);
      const bottom = base - FOUNDATION;
      if (count === 0) {
        // badly covered by rectangles: the outline itself, world-u facades counted from its base
        const shape = new THREE.Shape();
        pts.forEach((p, k) => (k ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)));
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: roof - bottom, bevelEnabled: false, curveSegments: 1 });
        g.rotateX(-Math.PI / 2);
        g.translate(0, bottom, 0);
        const ng = g.index ? g.toNonIndexed() : g;
        ng.deleteAttribute('uv');
        const n = ng.attributes.position.count;
        const bb = new Float32Array(n * 3);
        const pw = new Float32Array(n * 4), pt = new Float32Array(n * 4);
        const cw = new THREE.Color(paint[0]), ct = new THREE.Color(paint[1]);
        for (let k = 0; k < n; k++) {
          bb[k * 3] = base;
          pw.set([cw.r, cw.g, cw.b, paint[2]], k * 4);
          pt.set([ct.r, ct.g, ct.b, paint[3]], k * 4);
        }
        ng.setAttribute('boxBase', new THREE.BufferAttribute(bb, 3));
        ng.setAttribute('paintWall', new THREE.BufferAttribute(pw, 4));
        ng.setAttribute('paintTrim', new THREE.BufferAttribute(pt, 4));
        polyGeos.push(ng);
        colliders.push({ minX, maxX, minZ, maxZ, minY: base, maxY: roof, polygon: pts, buildingId: i });
        // The existing exact polygon is the main body. Only its missing foundation is new.
        ride?.addPrism(pts, bottom, base);
        ride?.addTop(pts, roof, 'pavement', { layered: true });
      }
      const cs = Math.cos(theta), sn = Math.sin(theta);
      let top = null;
      let topBox = null;
      // towers (P4.3): a podium where the Tall Building Inventory's tower plan is under 3/4 of its base plan: the
      // largest mass rises as a centred tower of that share from PODIUM_STOREYS storeys up (an estimate: the inventory
      // has no podium height), the building's other masses stop there
      let biggest = -1;
      for (let k = start; k < start + count; k++) if (biggest < 0 || all[k].w * all[k].d > all[biggest].w * all[biggest].d) biggest = k;
      const podiumShare = type === 'tower' ? rec[FI.podium] : 0;
      const podiumTop = podiumShare > 0 && podiumShare < 0.75 ? Math.min(base + PODIUM_STOREYS * (storeyH || storeys[mat]), base + height * 0.4) : roof;
      for (let k = start; k < start + count; k++) {
        const m = all[massCount++];
        // lowest & highest ground under the mass (corners, edge midpoints & centre)
        let g0 = Infinity, g1 = -Infinity;
        for (const u of [-0.5, 0, 0.5]) {
          for (const v of [-0.5, 0, 0.5]) {
            const lx = u * m.w, lz = v * m.d;
            const g = T.groundAt(m.cx + lx * cs + lz * sn, m.cz - lx * sn + lz * cs);
            g0 = Math.min(g0, g);
            g1 = Math.max(g1, g);
          }
        }
        g0 = Math.max(g0, base);
        const plinth = g1 - g0 > PLINTH_MIN ? Math.min(g1 - g0, roof - g0 - (storeyH || storeys[mat])) : 0;
        const box = {
          x: m.cx, y: (bottom + roof) * 0.5, z: m.cz, w: m.w, h: roof - bottom, d: m.d, ry: theta, tone,
          base: g0, plinth: Math.max(0, plinth), storeyH, paint,
          faces: WALLS.map(([lx, lz]) => wallKind(m, lx, lz, shopsFlag > 0))
        };
        const collider = (mm, maxY, foundation = true) => {
          if (ride) {
            const centre = { x: mm.cx, y: (bottom + base) / 2, z: mm.cz };
            const half = { x: mm.w / 2, y: FOUNDATION / 2, z: mm.d / 2 };
            if (foundation) ride.addBox(centre, half, theta);
            ride.addTop(ride.boxPoly(centre, half, theta), maxY, 'pavement', { layered: true });
          }
          colliders.push({
            minX: mm.cx - (Math.abs(cs) * mm.w + Math.abs(sn) * mm.d) * 0.5, maxX: mm.cx + (Math.abs(cs) * mm.w + Math.abs(sn) * mm.d) * 0.5,
            minZ: mm.cz - (Math.abs(sn) * mm.w + Math.abs(cs) * mm.d) * 0.5, maxZ: mm.cz + (Math.abs(sn) * mm.w + Math.abs(cs) * mm.d) * 0.5,
            minY: base, maxY, obb: { cx: mm.cx, cz: mm.cz, hx: mm.w * 0.5, hz: mm.d * 0.5, cs, sn }
          });
        };
        if (podiumTop < roof) {
          // the podium part of every mass, and the tower over the largest
          box.h = podiumTop - bottom;
          box.y = (bottom + podiumTop) * 0.5;
          buckets[mat].push(box);
          collider(m, podiumTop);
          if (k === biggest) {
            const f = Math.max(0.4, Math.sqrt(podiumShare));
            const tm = { cx: m.cx, cz: m.cz, w: m.w * f, d: m.d * f };
            const tower = { ...box, y: (podiumTop + roof) * 0.5, w: tm.w, h: roof - podiumTop, d: tm.d, plinth: Math.max(0, box.plinth), faces: [WALL_KINDS.entry, WALL_KINDS.entry, WALL_KINDS.entry, WALL_KINDS.entry] };
            buckets[mat].push(tower);
            collider(tm, roof, false);
            top = tm;
            topBox = tower;
          }
          continue;
        }
        buckets[mat].push(box);
        collider(m, roof);
        if (mat <= 2 && m.w > 3 && m.d > 3) blk.cornices.push({ x: m.cx, y: roof, z: m.cz, w: m.w + 1.0, h: 0.8, d: m.d + 1.0 });
        if (!top || m.w * m.d > top.w * top.d) { top = m; topBox = box; }
      }
      // row houses, flats & apartments: bay windows, garage door, stoop & false-front gable on the main front (sf-buildings.js)
      if (mat === 1 && topBox && (type === 'rowhouse' || type === 'flats' || type === 'apartment')) {
        window.NYC.sfFrontDetails(details, topBox, {
          i, roof, bays: rec[FI.bays], garage: rec[FI.garage] > 0, storey: storeys[1], windowWidth: facades[1][1].windowWidth,
          cornerPier: facades[1][1].cornerPier, groundAt: (x, z) => T.groundAt(x, z), roadAt: onRoadway, gable: type !== 'apartment' && hash(i, 13.7) < 0.3, hash: (a) => hash(i, a)
        });
      }
      // warehouses: roll-up doors & loading docks; civic buildings: a colonnade (sf-buildings.js)
      if (topBox && (type === 'warehouse' || type === 'civic')) {
        window.NYC[type === 'warehouse' ? 'sfWarehouseFront' : 'sfCivicFront'](details, topBox, {
          roof, storey: storeyH || storeys[mat], groundAt: (x, z) => T.groundAt(x, z), roadAt: onRoadway, hash: (a) => hash(i, a)
        });
      }
      // towers & midrise: the crown the lidar's highest return shows over the main roof (peak - roof > CROWN_MIN m):
      // a penthouse up to 12 m, a setback storey block up to 45 m, higher a setback and a spire (sf-buildings.js)
      const crown = rec[2] - roof;
      if (top && topBox && crown > CROWN_MIN && (type === 'tower' || type === 'midrise' || type === 'landmark')) {
        window.NYC.sfCrown(details, blk, topBox, { roof, crown, storey: storeyH || storeys[mat], bucket: buckets[mat] });
      } else if (top && top.w >= 6 && top.d >= 6 && !(type === 'rowhouse' || type === 'flats' || type === 'shed')) {
        // a bulkhead / mechanical penthouse on the largest roof (not on row houses, flats and sheds)
        const hw = Math.min(top.w - 1.2, Math.max(2.4, top.w * range(0.25, 0.45)));
        const hd = Math.min(top.d - 1.2, Math.max(2.4, top.d * range(0.25, 0.45)));
        blk.hvacUnits.push({ x: top.cx, y: roof, z: top.cz, w: hw, h: height >= 45 ? range(3.4, 5.8) : range(2.4, 3.2), d: hd });
      }
      quadtree.insert(blk);
      allBlocks.push(blk);
    }
    for (const b of details.bays) {
      buckets[1].push(b);
      ride?.addBox({ x: b.x, y: b.y, z: b.z }, { x: b.w / 2, y: b.h / 2, z: b.d / 2 }, b.ry || 0,
        { top: true, layered: true });
    }
    // Register all authored roof gear once; streamed instance visibility never owns contact.
    for (const blk of allBlocks) {
      for (const c of blk.cornices) ride?.addBox({ x: c.x, y: c.y - c.h * 0.6, z: c.z },
        { x: c.w / 2, y: c.h / 2, z: c.d / 2 }, blk.ry || 0, { top: true, layered: true });
      for (const u of blk.hvacUnits) ride?.addBox({ x: u.x, y: u.y + u.h / 2, z: u.z },
        { x: u.w / 2, y: u.h / 2, z: u.d / 2 }, blk.ry || 0, { top: true, layered: true });
    }
    window.NYC.buildSFDetailMeshes(group, details);
    if (polyGeos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(polyGeos, false), createPreWarBuildingMaterial({ ...facades[0][1], groundBase: true }));
      mesh.name = 'SFBuildingOutlines';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    console.info(`[buildings] v1: ${header.count} footprints (${covered.size} left to landmark models), ${massCount} masses, ${polyGeos.length} outlines`);
  }

  buildSFMasses();

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  let pendingTunnelBatches = [];
  buckets.forEach((items, matIdx) => {
    if (items.length === 0) return;
    const inst = createFacadeBoxes(materials[matIdx], items);
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
    pendingTunnelBatches.push({ mesh: inst, items });
  });
  let tunnelOpeningStats;
  function finishTunnelOpenings(grade) {
    if (!pendingTunnelBatches) return tunnelOpeningStats;
    tunnelOpeningStats = finishBuildingTunnelOpenings(pendingTunnelBatches, colliders, grade);
    pendingTunnelBatches = null;
    return tunnelOpeningStats;
  }

  // Quadtree-streamed high-detail pools. Only these two kinds are produced by SF.
  const MAX_CORNICES = 7000;
  const MAX_HVAC = 1600;
  const corniceMat = new THREE.MeshStandardNodeMaterial({ color: 0xc8bca6, roughness: 0.78, metalness: 0.08 });
  const corniceInst = new THREE.InstancedMesh(unitBox, corniceMat, MAX_CORNICES);
  corniceInst.castShadow = true;
  corniceInst.receiveShadow = true;
  corniceInst.frustumCulled = false;
  group.add(corniceInst);

  // Rooftop mechanical penthouses & HVAC chillers with top exhaust fans & side louvers.
  const hvacMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.52, metalness: 0.45 });
  hvacMat.colorNode = Fn(() => {
    const u = uv();
    const isTop = step(0.7, normalWorldGeometry.y);
    const fan1 = length(u.sub(vec2(0.3, 0.5)));
    const fan2 = length(u.sub(vec2(0.7, 0.5)));
    const fanDist = min(fan1, fan2);
    const inFanWell = smoothstep(0.19, 0.17, fanDist);
    // slop-newyork d720d3a: average subpixel fan rings and louvre slats instead of letting them shimmer at a distance
    const fanCoord = fanDist.mul(16.0);
    const fanRing = filteredPulse(fract(fanCoord), 0.4835, 0.5165, fwidth(fanCoord)).mul(inFanWell);
    const topCol = mix(color(0x889098), color(0x1b2026), inFanWell.mul(0.82).sub(fanRing.mul(0.45)));

    const inLouverBox = step(0.12, u.x).mul(step(u.x, 0.88)).mul(step(0.18, u.y)).mul(step(u.y, 0.82));
    const slatCoord = u.y.mul(14.0);
    const louverSlat = filteredPulse(fract(slatCoord), 0.45, 1.0, fwidth(slatCoord)).mul(inLouverBox);
    const panelSeam = smoothstep(0.03, 0.0, abs(fract(u.x.mul(3.0)).sub(0.5)));
    const sideCol = mix(color(0x7c848c), color(0x282e36), max(louverSlat.mul(0.72), panelSeam.mul(0.35)));
    return mix(sideCol, topCol, isTop);
  })();
  const hvacInst = new THREE.InstancedMesh(unitBox, hvacMat, MAX_HVAC);
  hvacInst.castShadow = hvacInst.receiveShadow = true;
  hvacInst.frustumCulled = false;
  group.add(hvacInst);

  let lastStreamX = Infinity;
  let lastStreamZ = Infinity;
  let activeBlockCount = 0;
  const STREAM_RADIUS = 560;

  // Streaming rewrites only the active prefix; unused pool capacity need not cross the GPU queue.
  function flagRange(attribute, count) {
    if (count === 0) return;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }

  function update(focusX, focusZ, force = false) {
    const dx = focusX - lastStreamX;
    const dz = focusZ - lastStreamZ;
    if (!force && (dx * dx + dz * dz) < 324) {
      // Player moved less than 18m since last Quadtree stream update
      return;
    }
    lastStreamX = focusX;
    lastStreamZ = focusZ;

    const nearbyBlocks = quadtree.queryRange(focusX, focusZ, STREAM_RADIUS);
    // Sort closest blocks first so if any pool hits capacity, closest blocks around the player always win
    nearbyBlocks.sort((a, b) => {
      const da = (a.cx - focusX) * (a.cx - focusX) + (a.cz - focusZ) * (a.cz - focusZ);
      const db = (b.cx - focusX) * (b.cx - focusX) + (b.cz - focusZ) * (b.cz - focusZ);
      return da - db;
    });
    activeBlockCount = nearbyBlocks.length;
    let corniceCount = 0;
    let hvacCount = 0;

    for (let bIdx = 0; bIdx < nearbyBlocks.length; bIdx++) {
      const blk = nearbyBlocks[bIdx];
      dummy.rotation.set(0, blk.ry || 0, 0);

      // Stone cornices hung just below the roof line so the roof keeps its own material.
      for (let i = 0; i < blk.cornices.length && corniceCount < MAX_CORNICES; i++) {
        const c = blk.cornices[i];
        dummy.position.set(c.x, c.y - c.h * 0.6, c.z);
        dummy.scale.set(c.w, c.h, c.d);
        dummy.updateMatrix();
        corniceInst.setMatrixAt(corniceCount++, dummy.matrix);
      }

      for (let i = 0; i < blk.hvacUnits.length && hvacCount < MAX_HVAC; i++) {
        const u = blk.hvacUnits[i];
        dummy.position.set(u.x, u.y + u.h * 0.5, u.z);
        dummy.scale.set(u.w, u.h, u.d);
        dummy.updateMatrix();
        hvacInst.setMatrixAt(hvacCount++, dummy.matrix);
      }
    }
    dummy.rotation.set(0, 0, 0);

    corniceInst.count = corniceCount;
    flagRange(corniceInst.instanceMatrix, corniceCount);
    hvacInst.count = hvacCount;
    flagRange(hvacInst.instanceMatrix, hvacCount);
  }

  // Preserve the initial stream; main updates it to the active camera before rendering.
  update(0, 62, true);

  scene.add(group);
  return {
    group,
    colliders,
    quadtree,
    allBlocks,
    finishTunnelOpenings,
    update,
    getActiveBlockCount: () => activeBlockCount
  };
}

Object.assign(window.NYC, { ManhattanQuadtree, buildCityBlocks });
})();
