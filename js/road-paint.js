(function () {
// js/road-paint.js
// Road markings generated from the drivable road network (js/road-network.js), so the paint matches where traffic
// actually drives and stops: dashed lane lines, double yellow centre lines on two-way roads, stop bars and continental
// crosswalks (curb to curb, where traffic.js walks its pedestrians) at the junctions with signals or stop signs, and
// green bike lanes where the DataSF Bike Network has class II lanes or class IV separated ones (GEO.bikeways, P4.4:
// along both curbs, or along the curb on the right of a one-way lane's travel; a white buffer line on buffered ones);
// and the track beds and rails of the surface rail lines, with the cable slot along the cable-car lines. Every strip is a ribbon draped on the terrain
// (js/terrain.js), a vertex pair every metre.

const { THREE, CROSSWALK, createRoadPaintMaterial, blockAt } = window.NYC;

const WHITE = new THREE.Color(0xe6e2d6);
const YELLOW = new THREE.Color(0xe8ad22);
const GREEN = new THREE.Color(0x2a8a4e);
const STEEL = new THREE.Color(0x8d8f91);
const TRACK_BED = new THREE.Color(0x4d4a45);
const SLOT = new THREE.Color(0x141414);
const GAUGE = 1.435; // standard gauge, between the rails' centres (near enough)
const HEIGHT = 0.012; // above the asphalt
const STEP = 1; // metres between the vertex pairs of a strip
// Shader-expanded bounds: NYC @9c4cfc9 (MIT, © 2026 Mr.doob).
const MAX_WIDEN = 16; // createRoadPaintMaterial's screen-space clamp
const PAINT_LEAF_TRIANGLES = 256;
// Re-selection slack: draw an ordered superset selected with frustum planes pushed out this far, and keep it
// while it still covers every leaf the tight frustum needs. Leaves fully outside the tight frustum add no
// pixels (bounds already include the 16x widening), so output is unchanged while index copies/uploads drop
// from ~every moving frame to once per this much travel/turn (measured: per-frame re-copy cost 1–2.5 ms CPU).
const PAINT_MARGIN = 24;
// Above this share of all leaves, drawing the complete stream beats compacting it.
const PAINT_FULL_SHARE = 0.8;

// One transparent render item, original vertices and original primitive order. Only its index prefix changes.
// Defined outside buildRoadPaint so the render hook cannot retain the large temporary construction arrays.
function installOrderedPaintCulling(mesh) {
  const geometry = mesh.geometry, index = geometry.index, target = index.array, count = index.count;
  if (count === 0) return;
  let original = target.slice(); // immutable source; target remains the one existing GPU index buffer
  const leafSize = PAINT_LEAF_TRIANGLES * 3, leaves = Math.ceil(count / leafSize);
  let base = 1;
  while (base < leaves) base *= 2;
  let bounds = new Float64Array(base * 2 * 6);
  let selected = new Uint32Array(leaves), previous = new Uint32Array(leaves), member = new Uint8Array(leaves).fill(1);
  let sourceViews = new Array(leaves);
  const positions = geometry.attributes.position.array, sides = geometry.attributes.side.array;
  for (let node = 0; node < base * 2; node++) {
    const o = node * 6;
    bounds[o] = bounds[o + 1] = bounds[o + 2] = Infinity;
    bounds[o + 3] = bounds[o + 4] = bounds[o + 5] = -Infinity;
  }
  for (let leaf = 0; leaf < leaves; leaf++) {
    const start = leaf * leafSize, end = Math.min(count, start + leafSize), o = (base + leaf) * 6;
    sourceViews[leaf] = original.subarray(start, end); // construction-only views, never new views per frame
    previous[leaf] = leaf;
    for (let j = start; j < end; j++) {
      const v = original[j], p = v * 3, s = v * 2;
      const x = positions[p], y = positions[p + 1], z = positions[p + 2];
      const wx = x + sides[s] * (MAX_WIDEN - 1), wz = z + sides[s + 1] * (MAX_WIDEN - 1);
      bounds[o] = Math.min(bounds[o], x, wx); bounds[o + 1] = Math.min(bounds[o + 1], y);
      bounds[o + 2] = Math.min(bounds[o + 2], z, wz);
      bounds[o + 3] = Math.max(bounds[o + 3], x, wx); bounds[o + 4] = Math.max(bounds[o + 4], y);
      bounds[o + 5] = Math.max(bounds[o + 5], z, wz);
    }
    const magnitude = Math.max(Math.abs(bounds[o]), Math.abs(bounds[o + 1]), Math.abs(bounds[o + 2]),
      Math.abs(bounds[o + 3]), Math.abs(bounds[o + 4]), Math.abs(bounds[o + 5]));
    const pad = .01 + magnitude * 2 ** -21; // Float32 widening/clip-edge allowance, including wide track beds
    for (let axis = 0; axis < 3; axis++) { bounds[o + axis] -= pad; bounds[o + axis + 3] += pad; }
  }
  for (let node = base - 1; node > 0; node--) {
    const o = node * 6, left = node * 12, right = left + 6;
    for (let axis = 0; axis < 3; axis++) {
      bounds[o + axis] = Math.min(bounds[left + axis], bounds[right + axis]);
      bounds[o + axis + 3] = Math.max(bounds[left + axis + 3], bounds[right + axis + 3]);
    }
  }
  const clip = new THREE.Matrix4(), previousClip = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const uploadRange = { start: 0, count: 0 }; // native backends clear the array; reuse the range object too
  let previousCount = leaves, selectedCount = 0, validClip = false, coordinateSystem, reversedDepth, disposed = false;
  let neededAtSelect = leaves; // tight leaf count when the drawn superset was chosen
  const before = mesh.onBeforeRender;
  // Pending ranges survive skipped consumption: merge into one covering [start, end) range.
  function dirtyRange(start, end) {
    for (let i = 0; i < index.updateRanges.length; i++) {
      const range = index.updateRanges[i];
      start = Math.min(start, range.start); end = Math.max(end, range.start + range.count);
    }
    index.clearUpdateRanges(); uploadRange.start = start; uploadRange.count = end - start;
    index.updateRanges.push(uploadRange); index.needsUpdate = true;
  }
  function fullStream() {
    if (previousCount !== leaves) {
      target.set(original); dirtyRange(0, count);
      for (let i = 0; i < leaves; i++) previous[i] = i;
      previousCount = leaves;
    }
    member.fill(1); neededAtSelect = leaves;
    geometry.setDrawRange(0, count);
    validClip = false;
  }
  // -1 outside, 0 intersecting, 1 fully inside. Typed node bounds avoid per-node Box3/Vector allocations.
  function classify(node) {
    const o = node * 6;
    const minX = bounds[o], minY = bounds[o + 1], minZ = bounds[o + 2];
    const maxX = bounds[o + 3], maxY = bounds[o + 4], maxZ = bounds[o + 5];
    let inside = 1;
    for (let i = 0; i < 6; i++) {
      const plane = frustum.planes[i], n = plane.normal;
      if (n.x * (n.x > 0 ? maxX : minX) + n.y * (n.y > 0 ? maxY : minY) + n.z * (n.z > 0 ? maxZ : minZ) + plane.constant < 0) return -1;
      if (n.x * (n.x > 0 ? minX : maxX) + n.y * (n.y > 0 ? minY : maxY) + n.z * (n.z > 0 ? minZ : maxZ) + plane.constant < 0) inside = 0;
    }
    return inside;
  }
  function visit(node, first, end) {
    if (first >= leaves) return;
    const classification = classify(node);
    if (classification < 0) return;
    if (classification === 1 || node >= base) {
      const last = Math.min(end, leaves);
      for (let leaf = first; leaf < last; leaf++) selected[selectedCount++] = leaf;
    } else {
      const middle = (first + end) / 2;
      visit(node * 2, first, middle); visit(node * 2 + 1, middle, end); // left-to-right SOURCE order
    }
  }
  function onBeforeRender(renderer, scene, camera, geo, material, group) {
    // e27dfa9 renderObject invokes this BEFORE _renderObjectDirect captures drawRange and updates geometries.
    // The observer tracks index.version; retain StaticDrawUsage so identical selections do not upload again.
    before.call(this, renderer, scene, camera, geo, material, group);
    if (disposed) return;
    // The host disables culling for warmup. CompileAsync calls this hook before uploading too. Array views use
    // the full stream rather than choosing one eye's frustum; this game normally supplies a perspective camera.
    if (renderer?._precompilationState != null || !this.frustumCulled || camera.isArrayCamera) { fullStream(); return; }
    clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld);
    if (validClip && coordinateSystem === camera.coordinateSystem && reversedDepth === camera.reversedDepth && clip.equals(previousClip)) return;
    previousClip.copy(clip); coordinateSystem = camera.coordinateSystem; reversedDepth = camera.reversedDepth; validClip = true;
    frustum.setFromProjectionMatrix(clip, coordinateSystem, reversedDepth);
    selectedCount = 0; visit(1, 0, base);
    const needed = selectedCount;
    let covered = true;
    for (let i = 0; covered && i < needed; i++) if (!member[selected[i]]) covered = false;
    // The drawn superset still covers the view and is not mostly waste: no copying or upload.
    if (covered && needed * 2 >= neededAtSelect) return;
    for (let i = 0; i < 6; i++) frustum.planes[i].constant += PAINT_MARGIN;
    selectedCount = 0; visit(1, 0, base);
    if (selectedCount >= leaves * PAINT_FULL_SHARE) { for (let i = 0; i < leaves; i++) selected[i] = i; selectedCount = leaves; }
    neededAtSelect = needed;
    for (let i = 0; i < previousCount; i++) member[previous[i]] = 0;
    for (let i = 0; i < selectedCount; i++) member[selected[i]] = 1;
    // Unchanged leading leaves keep their bytes; copy/upload only from the first difference. Every leaf
    // before that position is full-size (the short last leaf can only be the final entry).
    let first = 0;
    while (first < selectedCount && first < previousCount && selected[first] === previous[first]) first++;
    if (first === selectedCount && first === previousCount) return;
    let written = first * leafSize;
    if (first === selectedCount && first > 0) written = (first - 1) * leafSize + sourceViews[selected[first - 1]].length;
    const start = written;
    for (let i = first; i < selectedCount; i++) {
      const leaf = selected[i], source = sourceViews[leaf];
      target.set(source, written); written += source.length; previous[i] = leaf;
    }
    previousCount = selectedCount;
    geometry.setDrawRange(0, written);
    // An empty or pure-truncation selection changes only drawRange; pending bytes remain pending.
    if (written > start) dirtyRange(start, written);
  }
  mesh.onBeforeRender = onBeforeRender;
  function dispose() {
    if (disposed) return;
    // Geometry.dispose normally ends this scene. Restore a complete CPU stream as well so re-uploading the same
    // geometry later remains valid; release the private source/hierarchy while native disposal frees its GPU index.
    fullStream(); disposed = true;
    if (mesh.onBeforeRender === onBeforeRender) mesh.onBeforeRender = before;
    geometry.removeEventListener('dispose', dispose);
    original = bounds = selected = previous = member = sourceViews = null;
  }
  geometry.addEventListener('dispose', dispose);
}

// Preserve source-order blending of overlapping SF rail/paint ribbons.
function buildRoadPaint(scene, network) {
  // Phone memory: the markings (~1.6 M vertices) used to grow plain JS number arrays and then copy them into Float32
  // attributes, holding both at once. The pass below only records each strip; the exact vertex/index counts then size
  // typed arrays that `emit` fills with the same values, in the same order (Float32 rounding happens on write, as in
  // Float32BufferAttribute's copy).
  const calls = [];
  let vertexCount = 0, indexCount = 0;
  let position, normal, side, paint, colors, index, vp = 0, ip = 0;
  const T = window.NYC.Terrain;
  const loaded = T && T.loaded;
  const n = { x: 0, y: 1, z: 0 };

  // Strip w wide from a to b, with a dash pattern (period, duty cycle) running along it, on the ground (and on the curb
  // islands' tops, `onIslands`)
  function strip(ax, az, bx, bz, w, col, period = 1, duty = 1, onIslands = false, lift = 0) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return;
    const steps = Math.max(1, Math.ceil(len / STEP));
    calls.push([ax, az, bx, bz, w, col, period, duty, onIslands, lift]);
    vertexCount += 2 * (steps + 1); indexCount += 6 * steps;
  }
  function emit(ax, az, bx, bz, w, col, period, duty, onIslands, lift) {
    const len = Math.hypot(bx - ax, bz - az);
    const sx = ((az - bz) / len) * w * 0.5;
    const sz = ((bx - ax) / len) * w * 0.5;
    const steps = Math.max(1, Math.ceil(len / STEP));
    const i0 = vp;
    for (let k = 0; k <= steps; k++) {
      const u = (len * k) / steps;
      const x = ax + ((bx - ax) * k) / steps;
      const z = az + ((bz - az) * k) / steps;
      for (const s of [-1, 1]) {
        const px = x + sx * s, pz = z + sz * s;
        const island = onIslands && blockAt(px, pz) ? window.NYC.CURB_H : 0;
        position[vp * 3] = px; position[vp * 3 + 1] = (loaded ? T.groundAt(px, pz) : 0) + island + HEIGHT + lift; position[vp * 3 + 2] = pz;
        if (loaded) T.normalAt(px, pz, n);
        normal[vp * 3] = n.x; normal[vp * 3 + 1] = n.y; normal[vp * 3 + 2] = n.z;
        side[vp * 2] = sx * s; side[vp * 2 + 1] = sz * s;
        paint[vp * 3] = u; paint[vp * 3 + 1] = period; paint[vp * 3 + 2] = duty;
        colors[vp * 3] = col.r; colors[vp * 3 + 1] = col.g; colors[vp * 3 + 2] = col.b;
        vp++;
      }
      if (k > 0) {
        const i = i0 + 2 * (k - 1);
        index[ip++] = i; index[ip++] = i + 1; index[ip++] = i + 3; index[ip++] = i; index[ip++] = i + 3; index[ip++] = i + 2;
      }
    }
  }
  // How far the roadway reaches either side of the point s along edge e (to the first curb island), like the
  // crosswalk tracks of traffic.js: [left, right]
  function curbs(e, s) {
    const x = e.sx + e.dx * s, z = e.sz + e.dz * s;
    const reach = (dir) => {
      for (let r = 0; r < e.half + 8; r += 0.25) if (blockAt(x + e.rx * r * dir, z + e.rz * r * dir)) return r;
      return e.half;
    };
    return [reach(-1), reach(1)];
  }

  // Edges run between stop lines; s is measured from the start one and o to the right of the centre line
  const at = (e, s, o) => [e.sx + e.dx * s + e.rx * o, e.sz + e.dz * s + e.rz * o];
  const along = (e, o, w, col, period, duty) => strip(...at(e, 0.9, o), ...at(e, e.len - 0.9, o), w, col, period, duty);
  const across = (e, s, o0, o1, w, col, period, duty) => strip(...at(e, s, o0), ...at(e, s, o1), w, col, period, duty);

  // Bike lanes (GEO.bikeways) by 16 m grid cell, segment by segment, to find the one running along a road
  const BIKE_CELL = 16;
  const bikeGrid = new Map();
  for (const b of window.NYC.GEO.bikeways || []) {
    for (let i = 2; i < b.pts.length; i += 2) {
      const ax = b.pts[i - 2], az = b.pts[i - 1], bx = b.pts[i], bz = b.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const seg = { b, ax, az, ux: (bx - ax) / L, uz: (bz - az) / L, L };
      for (let t = 0; t <= L; t += BIKE_CELL / 2) {
        const k = Math.floor((ax + seg.ux * t) / BIKE_CELL) * 100000 + Math.floor((az + seg.uz * t) / BIKE_CELL);
        if (!bikeGrid.has(k)) bikeGrid.set(k, new Set());
        bikeGrid.get(k).add(seg);
      }
    }
  }
  // the bike lane along edge e: its segments within 4 m of e's centreline at a quarter, half & three quarters, running
  // within 25 degrees of it (at two of the three); with the drawing direction's sign against e
  function bikewayAlong(e) {
    const hits = new Map();
    for (const f of [0.25, 0.5, 0.75]) {
      const [x, z] = at(e, e.len * f, 0);
      const seen = new Set();
      for (const seg of bikeGrid.get(Math.floor(x / BIKE_CELL) * 100000 + Math.floor(z / BIKE_CELL)) || []) {
        if (seen.has(seg.b)) continue;
        const dot = seg.ux * e.dx + seg.uz * e.dz;
        if (Math.abs(dot) < 0.9) continue;
        const t = Math.max(0, Math.min(seg.L, (x - seg.ax) * seg.ux + (z - seg.az) * seg.uz));
        if (Math.hypot(seg.ax + seg.ux * t - x, seg.az + seg.uz * t - z) > 4) continue;
        seen.add(seg.b);
        const h = hits.get(seg.b) || { n: 0, sign: Math.sign(dot) };
        h.n++;
        hits.set(seg.b, h);
      }
    }
    for (const [b, h] of hits) if (h.n >= 2) return { b, sign: h.sign };
    return null;
  }

  // The one or two directed edges of each road between a pair of intersections
  let bikeLanes = 0;
  const roads = new Map();
  for (const e of network.edges) {
    if (e.bore) continue; // paint is draped on the terrain: tunnels and bridges have their own (grade-separation.js)
    const key = Math.min(e.from.id, e.to.id) * 65536 + Math.max(e.from.id, e.to.id);
    if (roads.has(key)) roads.get(key).push(e);
    else roads.set(key, [e]);
  }

  for (const [e, back] of roads.values()) {
    // Lanes of both directions, measured to the right of e, left to right
    const lanes = e.lanes.map((o) => ({ o, dir: 1 }));
    if (back) for (const o of back.lanes) lanes.push({ o: -o, dir: -1 });
    lanes.sort((p, q) => p.o - q.o);

    // Dashed white between lanes going the same way, double yellow between opposing ones
    // (nothing across a median or a lane closed off by an obstacle)
    for (let k = 0; k + 1 < lanes.length; k++) {
      const p = lanes[k];
      const q = lanes[k + 1];
      if (q.o - p.o > 4.5) continue;
      const mid = (p.o + q.o) / 2;
      if (p.dir === q.dir) {
        along(e, mid, 0.13, WHITE, 12, 0.25);
      } else {
        along(e, mid - 0.12, 0.11, YELLOW);
        along(e, mid + 0.12, 0.11, YELLOW);
      }
    }

    // Bike lanes: a 1.6 m green lane with white edge lines, outside a 2.4 m parking lane (class II, where it fits
    // beside the traffic lanes) or against the curb (class IV, separated); a buffered one gets a line 0.9 m further in
    const bike = bikewayAlong(e);
    if (bike) {
      const curbR = e.half, curbL = -(back ? back.half : e.half);
      // a one-way bike lane runs on the right of its travel: travel along e when the drawing runs with e and side is 1
      const sides = bike.b.side === 0 ? [1, -1] : [bike.b.side * bike.sign > 0 ? 1 : -1];
      for (const sign of sides) {
        const curb = sign > 0 ? curbR : curbL;
        const outer = sign > 0 ? lanes[lanes.length - 1].o : lanes[0].o; // the traffic lane nearest this curb
        let c = curb - sign * (bike.b.cls === 4 ? 1.1 : 3.2);
        if ((c - outer) * sign < 2.4) c = curb - sign * 1.1;
        if ((c - outer) * sign < 1.6) continue; // no room beside the traffic
        along(e, c, 1.6, GREEN);
        along(e, c - sign * 0.86, 0.12, WHITE);
        along(e, c + sign * 0.86, 0.12, WHITE);
        if (bike.b.buffered && (c - sign * 1.76 - outer) * sign > 1.2) along(e, c - sign * 1.76, 0.12, WHITE);
        bikeLanes++;
      }
    }

    // Stop bars across the lanes arriving at a signal or a stop sign, from the centre line (or median) to the curb
    const controlled = (node, f) => node.signal || (f && f.stop);
    for (const f of back ? [e, back] : [e]) {
      if (!controlled(f.to, f)) continue;
      const left = back ? Math.max(0, f.lanes[0] - 1.8) : -f.half;
      across(f, f.len - 0.35, left + 0.1, f.half - 0.1, 0.45, WHITE);
    }

    // Continental crosswalks curb to curb, between the stop lines and the junctions with signals or stop signs
    if (e.from.signal || e.from.stop) {
      const [l, r] = curbs(e, -CROSSWALK / 2);
      across(e, -CROSSWALK / 2, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    }
    if (e.to.signal || e.to.stop) {
      const [l, r] = curbs(e, e.len + CROSSWALK / 2);
      across(e, e.len + CROSSWALK / 2, -l, r, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    }
  }

  // Surface rail (GEO.rail, P3.4): a track bed and two rails along each line, on the street or its rail median
  for (const r of window.NYC.GEO.rail || []) {
    for (let i = 2; i < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = [r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1]];
      const L = Math.hypot(bx - ax, bz - az) || 1, ox = (az - bz) / L, oz = (bx - ax) / L;
      strip(ax, az, bx, bz, 2.6, TRACK_BED, 1, 1, true);
      for (const s of [-GAUGE / 2, GAUGE / 2]) strip(ax + ox * s, az + oz * s, bx + ox * s, bz + oz * s, 0.08, STEEL, 1, 1, true, 0.004);
    }
  }

  // The cable cars' slot between their rails (GEO.transit cable-car runs, P4.6): a dark line down the track's middle
  for (const t of window.NYC.GEO.transit || []) {
    if (t.kind !== 'cablecar') continue;
    for (let i = 2; i < t.pts.length; i += 2) strip(t.pts[i - 2], t.pts[i - 1], t.pts[i], t.pts[i + 1], 0.05, SLOT, 1, 1, true, 0.006);
  }

  position = new Float32Array(vertexCount * 3); normal = new Float32Array(vertexCount * 3); side = new Float32Array(vertexCount * 2);
  paint = new Float32Array(vertexCount * 3); colors = new Float32Array(vertexCount * 3);
  // Same index type three's setIndex(array) picks: Uint32 once any index reaches 65535.
  index = vertexCount - 1 >= 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  for (const c of calls) emit(...c);
  calls.length = 0;
  if (vp !== vertexCount || ip !== indexCount) throw new Error('Road paint sizing mismatch');
  const material = createRoadPaintMaterial();
  const attributes = { position: [position, 3], normal: [normal, 3], color: [colors, 3], side: [side, 2], paint: [paint, 3] };
  function makeMesh(data, indices, name) {
    const geometry = new THREE.BufferGeometry();
    for (const [key, [values, size]] of Object.entries(data)) geometry.setAttribute(key, new THREE.BufferAttribute(values, size));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    // Bound the uploaded Float32 positions + side vectors, not a nominal cell.
    // SF's full-width track beds/crosswalks can expand much further than 16 m.
    let pad = 0;
    const sides = geometry.attributes.side.array;
    for (let i = 0; i < sides.length; i += 2) pad = Math.max(pad, Math.hypot(sides[i], sides[i + 1]) * (MAX_WIDEN - 1));
    pad += 0.01;
    geometry.boundingBox.expandByScalar(pad);
    geometry.boundingSphere.radius += pad;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.renderOrder = -1; // under contact shadows and headlight beams
    return mesh;
  }
  const result = makeMesh(attributes, index, 'RoadMarkings');
  installOrderedPaintCulling(result);
  scene.add(result);
  console.info(`[paint] ${bikeLanes} bike lanes along ${roads.size} roads`);
  return result;
}

Object.assign(window.NYC, { buildRoadPaint });
})();
