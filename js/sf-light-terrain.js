// MIT © 2026 VibezZzCoder. Cheap terrain presentation; authoritative 8 m city support stays resident and unchanged.
// This is not core-city/support streaming. One replaceable near-rider drawing patch; no visited-location cache.
import * as THREE from 'three/webgpu';

const bounds = p => ({ x0: p.x0, z0: p.z0, x1: p.x1 ?? p.x0 + ((p.nx ?? p.w) - 1) * p.step,
  z1: p.z1 ?? p.z0 + ((p.nz ?? p.h) - 1) * p.step });
export function lightHeight(g, x, z) {
  const w = g.w ?? g.nx, h = g.nz ?? g.h, H = g.heights ?? g.h;
  let fx = Math.max(0, Math.min(w - 1, (x - g.x0) / g.step)), fz = Math.max(0, Math.min(h - 1, (z - g.z0) / g.step));
  // Only a shortened horizon terminal cell changes. Keep native city/core/collar arithmetic exact.
  if (fx > w - 2 && g.x1 < g.x0 + (w - 1) * g.step) {
    const last = g.x0 + (w - 2) * g.step;
    fx = w - 2 + Math.min(1, (x - last) / (g.x1 - last));
  }
  if (fz > h - 2 && g.z1 < g.z0 + (h - 1) * g.step) {
    const last = g.z0 + (h - 2) * g.step;
    fz = h - 2 + Math.min(1, (z - last) / (g.z1 - last));
  }
  const i = Math.min(w - 2, Math.floor(fx)), j = Math.min(h - 2, Math.floor(fz)), a = fx - i, b = fz - j, k = j * w + i;
  return a + b <= 1 ? H[k] + (H[k + 1] - H[k]) * a + (H[k + w] - H[k]) * b
    : H[k + w + 1] - (H[k + w + 1] - H[k + w]) * (1 - a) - (H[k + w + 1] - H[k + 1]) * (1 - b);
}

function clip(poly, distance) {
  const out = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], da = distance(a), db = distance(b);
    if ((da < 0) !== (db < 0)) { const t = da / (da - db); out.push(a.map((v, k) => v + (b[k] - v) * t)); }
    if (db >= 0) out.push(b);
  }
  return out;
}

function geometry(field, rect, spacing, water, cuts, skirt = false) {
  const nx = Math.ceil((rect.x1 - rect.x0) / spacing), nz = Math.ceil((rect.z1 - rect.z0) / spacing), row = nx + 1;
  const positions = [], indices = [], colors = [], color = new THREE.Color(), green = new THREE.Color(0x667553), rock = new THREE.Color(0x797569);
  const add = p => { const id = positions.length / 3; positions.push(...p);
    color.copy(green).lerp(rock, Math.min(1, Math.max(0, p[1] - 200) / 600)); colors.push(color.r, color.g, color.b); return id; };
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = Math.min(rect.x1, rect.x0 + i * spacing), z = Math.min(rect.z1, rect.z0 + j * spacing), y = lightHeight(field, x, z);
    add([x, y > water + .05 ? y : water - 4, z]);
  }
  const point = i => positions.slice(i * 3, i * 3 + 3);
  const triangle = (a, b, c) => {
    const p = [point(a), point(b), point(c)];
    if (p.every(v => v[1] <= water)) return;
    const x0 = Math.min(...p.map(v => v[0])), x1 = Math.max(...p.map(v => v[0]));
    const z0 = Math.min(...p.map(v => v[2])), z1 = Math.max(...p.map(v => v[2]));
    const overlaps = cuts.filter(r => x1 > r.x0 && x0 < r.x1 && z1 > r.z0 && z0 < r.z1);
    if (!overlaps.length) { indices.push(a, b, c); return; }
    let pieces = [p];
    for (const cut of overlaps) {
      const next = [];
      for (let inside of pieces) for (const d of [v => v[0] - cut.x0, v => cut.x1 - v[0], v => v[2] - cut.z0, v => cut.z1 - v[2]]) {
        if (inside.length < 3) break;
        const outside = clip(inside, v => -d(v));
        if (outside.length >= 3) next.push(outside);
        inside = clip(inside, d);
      }
      pieces = next;
    }
    for (const poly of pieces) { const ids = poly.map(add); for (let i = 1; i + 1 < ids.length; i++) indices.push(ids[0], ids[i], ids[i + 1]); }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * row + i; triangle(k, k + row, k + 1); triangle(k + 1, k + row, k + row + 1);
  }
  if (skirt) for (const edge of [Array.from({ length: row }, (_, i) => i), Array.from({ length: row }, (_, i) => nz * row + i),
    Array.from({ length: nz + 1 }, (_, i) => i * row), Array.from({ length: nz + 1 }, (_, i) => i * row + nx)]) {
    const bottom = edge.map(k => { const p = point(k); p[1] -= 32; return add(p); });
    for (let i = 0; i + 1 < edge.length; i++) { triangle(edge[i], bottom[i], edge[i + 1]); triangle(edge[i + 1], bottom[i], bottom[i + 1]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.sfStaticGeometry = true;
  return g;
}

export function buildLightTerrain(scene, city) {
  const { city: land, horizon, waterLevel } = city.DATA.lightTerrain, T = city.Terrain;
  const group = new THREE.Group(); group.name = 'SFLightTerrain'; scene.add(group);
  const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1 });
  const landRect = bounds(land), core = { x0: T.originX, z0: T.originZ,
    x1: T.originX + (T.w - 1) * T.cell, z1: T.originZ + (T.h - 1) * T.cell };
  const patches = T.patches.filter(p => p !== T.patches.at(-1) && p.rect && p.step < land.step);
  const cuts = [core, ...patches.map(bounds)];
  const mesh = (field, rect, spacing, exclusions, skirt = false) => {
    const m = new THREE.Mesh(geometry(field, rect, spacing, waterLevel, exclusions, skirt), material);
    m.name = 'SFRegionGroundChunk'; m.receiveShadow = false; m.castShadow = false; group.add(m); return m;
  };
  const outer = mesh(land, landRect, 64, cuts);
  mesh(horizon, bounds(horizon), horizon.step, [landRect]);
  // Fine landmark patches are drawn by existing SFGround; shared 2 m core collar is drawn here.
  for (const p of T.coreTransition?.patches || []) mesh(p, bounds(p), p.step, [core, ...patches.filter(q => !q.coreTransition).map(bounds)]);
  let local = null, key = '', disposed = false;
  return { group, disposeTerrainCache() { disposed = true; }, stats: () => ({ tier: 'light', localPatches: local ? 1 : 0 }),
    update(_camera, _elapsed, rider) {
      if (disposed || !rider || !Number.isFinite(rider.x) || !Number.isFinite(rider.z)) return;
      const cx = Math.floor(rider.x / 256) * 256, cz = Math.floor(rider.z / 256) * 256, next = `${cx},${cz}`;
      if (next === key) return;
      const r = { x0: Math.max(landRect.x0, cx - 512), z0: Math.max(landRect.z0, cz - 512),
        x1: Math.min(landRect.x1, cx + 512), z1: Math.min(landRect.z1, cz + 512) };
      const needed = r.x1 > r.x0 && r.z1 > r.z0 && !(r.x0 >= core.x0 && r.x1 <= core.x1 && r.z0 >= core.z0 && r.z1 <= core.z1);
      // Build replacements before publication; only the current attached meshes are owned, never a history of LODs.
      const near = needed ? geometry(land, r, land.step, waterLevel, cuts, true) : null;
      let coarse;
      try { coarse = geometry(land, landRect, 64, waterLevel, needed ? [...cuts, r] : cuts); }
      catch (e) { near?.dispose(); throw e; }
      const old = outer.geometry; outer.geometry = coarse; old.dispose();
      if (local) { group.remove(local); local.geometry.dispose(); local = null; }
      if (near) { local = new THREE.Mesh(near, material); local.name = 'SFRegionGroundChunk'; group.add(local); }
      key = next;
    } };
}
