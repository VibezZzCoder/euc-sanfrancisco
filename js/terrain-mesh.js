(function () {
// js/terrain-mesh.js
// The ground surface: the baked height field (js/terrain.js) as a CPU-built mesh with world y in its vertices (no
// displacement shader, so culling and shadows see the real shape; PLAN.md D4).
// - 64 m chunks, each at its own level of detail by camera distance: 2, 4, 8 or 16 m between vertices, with skirts
//   hanging below their edges to hide the cracks between neighbours at different levels.
// - Chunks are drawn per TILE x TILE m tile: one mesh (one draw) per tile. LOD changes reuse unchanged chunks from
//   the current tile buffers; only changed chunks are generated before ordered typed assembly.
// - The bay: vertices on water drop below the water plane, so the land's edge becomes a steep seawall face.
// - Hills cast shadows through a static 8 m stand-in on the shadow proxy layer (scene-culling.js), drawn back faces
//   only so sunlit slopes don't shadow themselves while the slopes facing away still shade what lies behind them.
// - Material: createTerrainMaterial (asphalt, concrete, lawn, rock, seawall by the ground mask).

const { THREE, Terrain } = window.NYC;
const { createTerrainMaterial } = window.NYC;

const CHUNK = 64;
const TILE = 512;
const LOD_STEPS = [2, 4, 8, 16]; // metres between vertices
const LOD_DIST = [150, 400, 900]; // switch to the next level beyond these distances (m)
const HYSTERESIS = 0.1; // a chunk moves back to the finer level only 10% inside its threshold
const UPDATE_SECONDS = 0.25;
const UPDATE_MOVE = 20;
const WATER_DROP = 4; // metres below the water level for vertices on the bay
const SHADOW_STEP = 8;
const SHADOW_CELL = 500;

// Builder-owned CPU scratch, never geometry storage. Retain only a capped high-water capacity; unusually
// complicated clipping can exceed it temporarily without truncation, then reset drops the oversized allocation.
class TerrainScratchArray {
  constructor(Type, capacity, limit) {
    this.Type = Type;
    this.limit = limit;
    this.array = this.retained = new Type(capacity);
    this.length = 0;
  }
  reserve(count) {
    if (count <= this.array.length) return;
    const capacity = Math.max(count, this.array.length * 2);
    const next = new this.Type(capacity);
    next.set(this.array);
    this.array = next;
    if (capacity <= this.limit) this.retained = next;
  }
  push(a, b, c) {
    const at = this.length;
    this.reserve(at + 3);
    this.array[at] = a; this.array[at + 1] = b; this.array[at + 2] = c;
    this.length = at + 3;
  }
  append(source) {
    const at = this.length;
    this.reserve(at + source.length);
    // Float64 -> Float32 conversion occurs only after all chunk clipping/skirt work has completed.
    this.array.set(source.array.subarray(0, source.length), at);
    this.length += source.length;
  }
  reset() { this.length = 0; this.array = this.retained; }
  dispose() { this.length = 0; this.array = this.retained = null; }
  get bytes() { return this.retained?.byteLength || 0; }
}

function buildTerrainMesh(scene) {
  const T = Terrain;
  const water = T.waterLevel;
  const extentX = (T.w - 1) * T.cell;
  const extentZ = (T.h - 1) * T.cell;
  const nx = Math.ceil(extentX / CHUNK);
  const nz = Math.ceil(extentZ / CHUNK);
  const perTile = TILE / CHUNK;
  const tilesX = Math.ceil(nx / perTile);
  const tilesZ = Math.ceil(nz / perTile);

  // Height of the mesh at a grid point (metres from the data origin, clamped to the data): land as measured, the bay
  // dropped below its surface
  // dropped under a tunnel's floor at its portals too (grade-separation.js carveAt, once it is built: rebuild())
  const surfaceY = (lx, lz) => {
    const i = Math.min(T.w - 1, Math.round(Math.min(lx, extentX) / T.cell));
    const j = Math.min(T.h - 1, Math.round(Math.min(lz, extentZ) / T.cell));
    const y = T.heights[j * T.w + i];
    const G = window.NYC.GradeSeparation;
    const carved = G && G.carveAt(T.originX + i * T.cell, T.originZ + j * T.cell);
    if (carved !== null && carved !== undefined) return Math.min(y, carved);
    return y > water + 0.05 ? y : water - WATER_DROP;
  };

  // Chunk summaries: height range (for distances & culling) and whether any of it is land
  const chunks = [];
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      let lo = Infinity, hi = -Infinity, land = false;
      for (let lz = cz * CHUNK; lz <= (cz + 1) * CHUNK; lz += T.cell) {
        for (let lx = cx * CHUNK; lx <= (cx + 1) * CHUNK; lx += T.cell) {
          const y = surfaceY(lx, lz);
          if (y > water) land = true;
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      }
      // The shared regional collar meets every measured 2 m edge vertex. Coarsening this boundary would reopen
      // the crack even though the collar/support stayed correct. Interior chunks keep their existing LOD policy.
      const seam = !!T.coreTransition && (cx === 0 || cz === 0 || cx === nx - 1 || cz === nz - 1);
      chunks.push({ cx, cz, lo, hi, land, seam, lod: seam ? 0 : LOD_STEPS.length - 1 });
    }
  }

  const material = createTerrainMaterial(makeMaskTexture(), window.NYC.DATA.groundMask.header);
  // Core and region use different measured grids. Do not dither the 8 m regional profile through the physical 2 m
  // core. region.js clips its triangles to this core boundary instead; skirts are presentation-only.
  const group = new THREE.Group();
  group.name = 'SFTerrain';

  // One maximum-LOD halo scratch, shared by sequential chunk builds, not an all-world height/variant cache.
  // Float64 is essential: skirts and tunnel intersections must use the original unrounded heights/normals.
  let heights = new Float64Array((CHUNK / LOD_STEPS[0] + 3) ** 2);
  const chunkPos = new TerrainScratchArray(Float64Array, 4096, 16384);
  const chunkNrm = new TerrainScratchArray(Float64Array, 4096, 16384);
  const chunkIdx = new TerrainScratchArray(Uint32Array, 8192, 32768);
  const stagePos = new TerrainScratchArray(Float32Array, 4096, 262144);
  const stageNrm = new TerrainScratchArray(Float32Array, 4096, 262144);
  const stageIdx = new TerrainScratchArray(Uint32Array, 8192, 524288);
  let changed = new Uint32Array(perTile * perTile * 2);
  let disposed = false;
  let generatedChunks = 0, reusedChunks = 0;

  // Writes one chunk at its level into the arrays: (n + 1)^2 grid vertices, then a skirt along each edge
  function writeChunk(c, pos, nrm, idx) {
    const step = LOD_STEPS[c.lod];
    const n = CHUNK / step;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const base = pos.length / 3;
    const skirt = Math.max(2, step / 2);
    const cuts = (window.NYC.GradeSeparation?.terrainCuts || []).filter(p =>
      p.maxX >= T.originX + x0 && p.minX <= T.originX + x0 + CHUNK &&
      p.maxZ >= T.originZ + z0 && p.minZ <= T.originZ + z0 + CHUNK);
    const regular = ((n + 1) ** 2 + 4 * (n + 1)) * 3;
    pos.reserve(pos.length + regular); nrm.reserve(nrm.length + regular);
    idx.reserve(idx.length + n * n * 6 + n * 24);
    // Chunk-local candidate scratch, including skirts. Preserve source cut order and the Float64 kernel. An AABB
    // miss alone is NOT enough: the old subtractor sometimes subdivides a disjoint triangle. Skip only a proven
    // separating plane, with a rounding margin; otherwise retain those exact legacy vertices/indices/normals.
    const localCuts = [];
    const emit = (a, b, c) => {
      const at = idx.length;
      if (cuts.length) idx.reserve(at + 3); // earlier clipped faces may have consumed the regular-grid reservation
      idx.array[at] = a; idx.array[at + 1] = b; idx.array[at + 2] = c; idx.length = at + 3;
    };
    const face = cuts.length ? (a, b, c) => {
      const p = pos.array;
      const minX = Math.min(p[a * 3], p[b * 3], p[c * 3]), maxX = Math.max(p[a * 3], p[b * 3], p[c * 3]);
      const minZ = Math.min(p[a * 3 + 2], p[b * 3 + 2], p[c * 3 + 2]), maxZ = Math.max(p[a * 3 + 2], p[b * 3 + 2], p[c * 3 + 2]);
      localCuts.length = 0;
      for (const cut of cuts) {
        const overlap = cut.maxX >= minX && cut.minX <= maxX && cut.maxZ >= minZ && cut.minZ <= maxZ;
        let separated = false;
        // The last plane is the ceiling: reject intact upper ground before allocating any polygon vertices.
        for (let i = cut.planes.length - 1; i >= 0; i--) {
          if (overlap && i < cut.planes.length - 1) break;
          const q = cut.planes[i];
          if (q[0] * p[a * 3] + q[1] * p[a * 3 + 1] + q[2] * p[a * 3 + 2] + q[3] < -1e-9 &&
              q[0] * p[b * 3] + q[1] * p[b * 3 + 1] + q[2] * p[b * 3 + 2] + q[3] < -1e-9 &&
              q[0] * p[c * 3] + q[1] * p[c * 3 + 1] + q[2] * p[c * 3 + 2] + q[3] < -1e-9) { separated = true; break; }
        }
        if (!separated) localCuts.push(cut);
      }
      if (localCuts.length) clipTerrainFace(a, b, c, localCuts, pos, nrm, idx);
      else emit(a, b, c);
    } : emit;
    const stride = n + 3;
    for (let b = -1; b <= n + 1; b++) {
      for (let a = -1; a <= n + 1; a++) {
        heights[(b + 1) * stride + a + 1] = surfaceY(Math.max(0, x0 + a * step), Math.max(0, z0 + b * step));
      }
    }
    const yAt = (a, b) => heights[(b + 1) * stride + a + 1];
    const positions = pos.array, normals = nrm.array;
    let at = pos.length;
    for (let b = 0; b <= n; b++) {
      for (let a = 0; a <= n; a++) {
        const y = yAt(a, b);
        positions[at] = T.originX + Math.min(extentX, x0 + a * step);
        positions[at + 1] = y; positions[at + 2] = T.originZ + Math.min(extentZ, z0 + b * step);
        // central differences at this level's spacing (one-sided at the data's edges)
        const gx = (yAt(a + 1, b) - yAt(a - 1, b)) / (2 * step);
        const gz = (yAt(a, b + 1) - yAt(a, b - 1)) / (2 * step);
        const len = Math.hypot(gx, 1, gz);
        normals[at] = -gx / len; normals[at + 1] = 1 / len; normals[at + 2] = -gz / len;
        at += 3;
      }
    }
    pos.length = nrm.length = at;
    const row = n + 1;
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const k = base + b * row + a;
        face(k, k + row, k + 1); face(k + 1, k + row, k + row + 1);
      }
    }
    // skirts: a copy of each edge hanging `skirt` m lower, joined to the edge facing outwards
    const edges = [
      { at: (t) => t, flip: false }, // north edge (b = 0), a = t
      { at: (t) => n * row + t, flip: true }, // south edge
      { at: (t) => t * row, flip: true }, // west edge
      { at: (t) => t * row + n, flip: false } // east edge
    ];
    for (const e of edges) {
      const s0 = pos.length / 3;
      for (let t = 0; t <= n; t++) {
        const k = base + e.at(t);
        pos.push(pos.array[3 * k], pos.array[3 * k + 1] - skirt, pos.array[3 * k + 2]);
        nrm.push(nrm.array[3 * k], nrm.array[3 * k + 1], nrm.array[3 * k + 2]);
      }
      for (let t = 0; t < n; t++) {
        const top0 = base + e.at(t), top1 = base + e.at(t + 1), bot0 = s0 + t, bot1 = s0 + t + 1;
        if (e.flip) { face(top0, bot0, top1); face(top1, bot0, bot1); }
        else { face(top0, top1, bot0); face(top1, bot1, bot0); }
      }
    }
  }

  const tiles = [];
  for (let tz = 0; tz < tilesZ; tz++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const members = chunks.filter((c) => c.land && Math.floor(c.cx / perTile) === tx && Math.floor(c.cz / perTile) === tz);
      if (!members.length) continue;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.name = 'TerrainTile';
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      if (tiles.length) mesh.userData.sharesPipelineWith = tiles[0].mesh;
      group.add(mesh);
      tiles.push({ mesh, members, key: '', ranges: null });
    }
  }

  function rebuildTile(tile, invalidate = false) {
    const key = tile.members.map((c) => c.lod).join('');
    if (!invalidate && key === tile.key) return false;
    const previous = tile.mesh.geometry;
    // Five integers per member: LOD, vertex offset/count, index offset/count. The source of reuse is the current
    // drawing itself, so travelling cannot retain obsolete LOD variants or duplicate persistent vertex buffers.
    const ranges = new Uint32Array(tile.members.length * 5);
    changed.fill(0xffffffff);
    try {
      let vertices = 0, indices = 0;
      for (let i = 0; i < tile.members.length; i++) {
        const c = tile.members[i], r = i * 5;
        let vertexCount, indexCount;
        if (!invalidate && tile.ranges && tile.ranges[r] === c.lod) {
          vertexCount = tile.ranges[r + 2]; indexCount = tile.ranges[r + 4];
          reusedChunks++;
        } else {
          // Keep all shared clipping arithmetic in doubles until the complete chunk (including skirts) is finished.
          // Chunk-local indices are rebased below; triangle, vertex and cut iteration order is unchanged.
          chunkPos.reset(); chunkNrm.reset(); chunkIdx.reset();
          writeChunk(c, chunkPos, chunkNrm, chunkIdx);
          changed[i * 2] = stagePos.length / 3; changed[i * 2 + 1] = stageIdx.length;
          stagePos.append(chunkPos); stageNrm.append(chunkNrm); stageIdx.append(chunkIdx);
          vertexCount = chunkPos.length / 3; indexCount = chunkIdx.length;
          generatedChunks++;
        }
        ranges[r] = c.lod; ranges[r + 1] = vertices; ranges[r + 2] = vertexCount;
        ranges[r + 3] = indices; ranges[r + 4] = indexCount;
        vertices += vertexCount; indices += indexCount;
      }
      const pos = new Float32Array(vertices * 3), nrm = new Float32Array(vertices * 3);
      const idx = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
      for (let i = 0; i < tile.members.length; i++) {
        const r = i * 5, staged = changed[i * 2] !== 0xffffffff;
        const start = staged ? changed[i * 2] : tile.ranges[r + 1];
        const indexStart = staged ? changed[i * 2 + 1] : tile.ranges[r + 3];
        const sourcePos = staged ? stagePos.array : previous.attributes.position.array;
        const sourceNrm = staged ? stageNrm.array : previous.attributes.normal.array;
        const sourceIdx = staged ? stageIdx.array : previous.index.array;
        pos.set(sourcePos.subarray(start * 3, (start + ranges[r + 2]) * 3), ranges[r + 1] * 3);
        nrm.set(sourceNrm.subarray(start * 3, (start + ranges[r + 2]) * 3), ranges[r + 1] * 3);
        // Staged chunk indices remain chunk-local even though several chunks share the staging arena.
        const shift = ranges[r + 1] - (staged ? 0 : start);
        for (let j = 0; j < ranges[r + 4]; j++) idx[ranges[r + 3] + j] = sourceIdx[indexStart + j] + shift;
      }
      const g = new THREE.BufferGeometry();
      // BufferAttribute takes ownership without the extra typed-array copy made by Float32BufferAttribute.
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      previous.dispose();
      tile.mesh.geometry = g;
      tile.ranges = ranges;
      tile.key = key;
      return true;
    } finally {
      chunkPos.reset(); chunkNrm.reset(); chunkIdx.reset();
      stagePos.reset(); stageNrm.reset(); stageIdx.reset();
    }
  }

  // Level of each chunk from the camera's distance to it (with hysteresis)
  function chooseLevels(px, py, pz, rider) {
    for (const c of chunks) {
      if (!c.land) continue;
      const x0 = T.originX + c.cx * CHUNK, z0 = T.originZ + c.cz * CHUNK;
      const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK));
      const dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
      const dy = Math.max(c.lo - py, 0, py - c.hi);
      const d = Math.hypot(dx, dy, dz);
      let lod = 0;
      while (lod < LOD_DIST.length && d > LOD_DIST[lod]) lod++;
      const rd = Math.hypot(Math.max(x0 - rider.x, 0, rider.x - x0 - CHUNK),
        Math.max(z0 - rider.z, 0, rider.z - z0 - CHUNK));
      if (c.seam || rd < 200) lod = 0; // collar boundary and rider-near physical profile stay on the 2 m diagonal
      // stay finer while within the hysteresis band of the threshold just crossed outwards
      if (lod > c.lod && d < LOD_DIST[lod - 1] * (1 + HYSTERESIS)) lod = c.lod;
      c.lod = lod;
    }
  }

  // Optional deferred coarsening (host opt-in through setLodBudget; 0 keeps the original synchronous path). Level
  // selection is unchanged and still runs every gated update. A tile whose selected levels are only COARSER than the
  // levels it currently draws (the camera/rider left) keeps drawing its complete finer geometry and is rebuilt in later
  // updates, in tile order, at least one tile and about `lodBudget` ms per call. Any tile needing a finer level than it
  // draws (approach, seam, 200 m rider protection) rebuilds in the selecting update as before. A deferred rebuild is the
  // unchanged rebuildTile at the latest selected levels, so each publication is complete and byte-identical to the
  // synchronous result for those levels. Drawing-only: physical support/queries never read terrain tiles.
  let lodBudget = 0;
  const deferred = new Set();
  // 1: some member coarser and none finer than drawn; -1: some member finer; 0: drawn levels already match.
  function change(tile) {
    let coarser = 0;
    for (let i = 0; i < tile.members.length; i++) {
      const drawn = tile.ranges[i * 5], lod = tile.members[i].lod;
      if (lod < drawn) return -1;
      if (lod > drawn) coarser = 1;
    }
    return coarser;
  }
  function drainDeferred(all = false) {
    if (!deferred.size) return;
    const start = performance.now();
    for (const tile of tiles) {
      if (!deferred.has(tile)) continue;
      if (rebuildTile(tile)) last.rebuilt++;
      deferred.delete(tile); // only after success: a failed build keeps its complete drawing and retries
      if (!all && performance.now() - start >= lodBudget) break;
    }
  }
  function setLodBudget(ms) {
    if (disposed) return;
    lodBudget = Number.isFinite(ms) && ms > 0 ? ms : 0;
    if (!lodBudget) drainDeferred(true);
  }

  const last = { x: Infinity, y: Infinity, z: Infinity, rx: Infinity, rz: Infinity, t: -Infinity, rebuilt: 0 };
  function update(cameraPosition, elapsed, playerPosition = cameraPosition) {
    if (disposed) return;
    drainDeferred();
    const { x, y, z } = cameraPosition;
    const rider = playerPosition.position || playerPosition;
    const riderMoved = Math.hypot(rider.x - last.rx, rider.z - last.rz) >= UPDATE_MOVE;
    if (elapsed - last.t < UPDATE_SECONDS && !riderMoved) return;
    if (!riderMoved && Math.hypot(x - last.x, y - last.y, z - last.z) < UPDATE_MOVE) return;
    last.x = x; last.y = y; last.z = z; last.rx = rider.x; last.rz = rider.z; last.t = elapsed;
    chooseLevels(x, y, z, rider);
    for (const tile of tiles) {
      const delta = change(tile);
      if (lodBudget > 0 && delta > 0) { deferred.add(tile); continue; }
      deferred.delete(tile);
      if (delta && rebuildTile(tile)) last.rebuilt++;
    }
  }

  // Start at the coarsest level everywhere (a first update() refines around the camera)
  for (const tile of tiles) rebuildTile(tile);

  group.add(...buildShadowCaster(surfaceY, extentX, extentZ));
  scene.add(group);
  console.info(`[terrain] ${chunks.filter((c) => c.land).length} land chunks of ${CHUNK} m in ${tiles.length} tiles`);
  // Every tile built again at its current levels (after grade-separation.js has carved the portals)
  function rebuild() {
    if (disposed) return;
    for (const tile of tiles) rebuildTile(tile, true);
    deferred.clear(); // every tile now draws its current selected levels
  }

  // Terminal CPU ownership only. The host's drained scene teardown owns geometry/material/texture disposal.
  // Call before that scene walk; repeated calls are safe and cannot resurrect terrain buffers.
  function dispose() {
    disposed = true;
    deferred.clear(); // pending work holds no buffers: drawn geometry stays owned by the scene teardown
    heights = null;
    chunkPos.dispose(); chunkNrm.dispose(); chunkIdx.dispose();
    stagePos.dispose(); stageNrm.dispose(); stageIdx.dispose();
    changed = null;
    for (const tile of tiles) tile.ranges = null;
  }

  return {
    group,
    update,
    rebuild,
    dispose,
    setLodBudget,
    deferredTiles: () => deferred.size,
    stats: () => ({
      tiles: tiles.length,
      visibleTiles: tiles.filter((t) => t.mesh.visible).length,
      triangles: tiles.reduce((s, t) => s + t.mesh.geometry.index.count / 3, 0),
      lods: LOD_STEPS.map((_, l) => chunks.filter((c) => c.land && c.lod === l).length),
      rebuilt: last.rebuilt,
      generatedChunks,
      reusedChunks,
      constructionBytes: chunkPos.bytes + chunkNrm.bytes + chunkIdx.bytes + stagePos.bytes + stageNrm.bytes + stageIdx.bytes + (changed?.byteLength || 0),
      reuseBytes: (heights?.byteLength || 0) + tiles.reduce((s, t) => s + (t.ranges?.byteLength || 0), 0)
    })
  };
}

// Polygon minus a convex tunnel volume. Construction-only and restricted to overlapping chunks. Preserve the
// original triangle/vertex normals outside the cavity; clip skirts too, or a chunk boundary can seal the opening.
function clipTerrainFace(a, b, c, cuts, pos, nrm, idx, preserveOutside = false) {
  const distance = (p, v) => p[0] * v.x + p[1] * v.y + p[2] * v.z + p[3];
  const vertex = k => ({ x: pos.array[k * 3], y: pos.array[k * 3 + 1], z: pos.array[k * 3 + 2],
    nx: nrm.array[k * 3], ny: nrm.array[k * 3 + 1], nz: nrm.array[k * 3 + 2], index: k });
  const clip = (poly, plane, sign) => {
    const out = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j], q = poly[i], dp = distance(plane, p) * sign, dq = distance(plane, q) * sign;
      if ((dp < 0) !== (dq < 0)) {
        const u = dp / (dp - dq), v = {};
        for (const key of ['x', 'y', 'z', 'nx', 'ny', 'nz']) v[key] = p[key] + (q[key] - p[key]) * u;
        out.push(v);
      }
      if (dq >= 0) out.push(q);
    }
    return out;
  };
  let pieces = [[vertex(a), vertex(b), vertex(c)]];
  for (const cut of cuts) {
    const next = [];
    for (let inside of pieces) {
      if (cut.planes.some(p => inside.every(v => distance(p, v) < 0))) { next.push(inside); continue; }
      // Static Drape surfaces also own ride tops: disjoint/tangent faces must keep their original indices/normals.
      // Leave the terrain/skirt path unchanged. Drape's caller rejects triangle AABBs before entering this kernel.
      if (preserveOutside) {
        if (cut.planes.some(p => inside.every(v => distance(p, v) <= 0))) { next.push(inside); continue; }
        let overlap = inside;
        for (const plane of cut.planes) {
          overlap = clip(overlap, plane, 1);
          if (overlap.length < 3) break;
        }
        let area = 0;
        for (let i = 1; i + 1 < overlap.length; i++) {
          const p = overlap[0], q = overlap[i], r = overlap[i + 1];
          const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
          const vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
          area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        }
        if (area <= 1e-10) { next.push(inside); continue; }
      }
      for (const plane of cut.planes) {
        if (inside.length < 3) break;
        const outside = clip(inside, plane, -1);
        if (outside.length >= 3) next.push(outside);
        inside = clip(inside, plane, 1);
      }
    }
    pieces = next;
  }
  for (const poly of pieces) {
    const ids = poly.map(v => {
      if (v.index !== undefined) return v.index;
      const k = pos.length / 3, length = Math.hypot(v.nx, v.ny, v.nz) || 1;
      pos.push(v.x, v.y, v.z); nrm.push(v.nx / length, v.ny / length, v.nz / length);
      return k;
    });
    for (let i = 1; i + 1 < ids.length; i++) idx.push(ids[0], ids[i], ids[i + 1]);
  }
}

// The ground mask as a single-channel texture, read texel by texel
function makeMaskTexture() {
  const { header, mask } = window.NYC.DATA.groundMask;
  const tex = new THREE.DataTexture(mask, header.w, header.h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// Hills' shadows: the surface at SHADOW_STEP m, cut into SHADOW_CELL m cells on the shadow proxy layer
// Like scene-culling.js's static stand-ins, use a private actual-position box without changing shared geometry
// bounds or layout. Keep this builder standalone; scene-culling is evaluated later in the classic-script seam.
function setTerrainShadowBoxCulling(mesh) {
  const local = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const x = Math.max(Math.abs(local.min.x), Math.abs(local.max.x));
  const y = Math.max(Math.abs(local.min.y), Math.abs(local.max.y));
  const z = Math.max(Math.abs(local.min.z), Math.abs(local.max.z));
  const world = new THREE.Box3();
  mesh.intersectsFrustum = function (frustum) {
    if (typeof frustum.intersectsBox !== 'function') return THREE.Mesh.prototype.intersectsFrustum.call(this, frustum);
    // Re-read the renderer-current world transform, including changed/reparented terrain groups. Scale the tiny
    // Float32 margin by operation magnitudes, not just the result (large translations can cancel local positions).
    const e = this.matrixWorld.elements;
    const margin = .001 + 2 ** -21 * Math.max(
      Math.abs(e[0]) * x + Math.abs(e[4]) * y + Math.abs(e[8]) * z + Math.abs(e[12]),
      Math.abs(e[1]) * x + Math.abs(e[5]) * y + Math.abs(e[9]) * z + Math.abs(e[13]),
      Math.abs(e[2]) * x + Math.abs(e[6]) * y + Math.abs(e[10]) * z + Math.abs(e[14]));
    world.copy(local).applyMatrix4(this.matrixWorld).expandByScalar(margin);
    return frustum.intersectsBox(world);
  };
}

function buildShadowCaster(surfaceY, extentX, extentZ) {
  const T = Terrain;
  const material = new THREE.MeshBasicNodeMaterial({ color: 0x000000, side: THREE.FrontSide });
  material.shadowSide = THREE.BackSide;
  material.name = 'ShadowProxy';
  const meshes = [];
  for (let z0 = 0; z0 < extentZ; z0 += SHADOW_CELL) {
    for (let x0 = 0; x0 < extentX; x0 += SHADOW_CELL) {
      const nxs = Math.ceil(Math.min(SHADOW_CELL, extentX - x0) / SHADOW_STEP);
      const nzs = Math.ceil(Math.min(SHADOW_CELL, extentZ - z0) / SHADOW_STEP);
      const pos = [];
      const idx = [];
      for (let b = 0; b <= nzs; b++) {
        for (let a = 0; a <= nxs; a++) {
          const lx = Math.min(extentX, x0 + a * SHADOW_STEP), lz = Math.min(extentZ, z0 + b * SHADOW_STEP);
          pos.push(T.originX + lx, surfaceY(lx, lz), T.originZ + lz);
        }
      }
      for (let b = 0; b < nzs; b++) {
        for (let a = 0; a < nxs; a++) {
          const k = b * (nxs + 1) + a;
          idx.push(k, k + nxs + 1, k + 1, k + 1, k + nxs + 1, k + nxs + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.name = 'ShadowProxy';
      mesh.layers.set(window.NYC.SHADOW_PROXY_LAYER);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData.shadowProxy = true;
      setTerrainShadowBoxCulling(mesh);
      if (meshes.length) mesh.userData.sharesPipelineWith = meshes[0];
      meshes.push(mesh);
    }
  }
  return meshes;
}

Object.assign(window.NYC, { buildTerrainMesh, clipTerrainFace });
})();
