// Cheap outdoor obstruction using the same static building bounds as movement. Nearby bounds are cached;
// only audible voices trace them, a few times per second. This deliberately avoids mesh raycasts or audio-rate DSP.
function insidePolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// SF outline buildings can be concave. Integrate only actual prism intervals, not their courtyard-filling AABB.
const cuts = []; // synchronous numeric scratch, retained only to the largest encountered outline
function polygonThickness(c, ax, ay, az, bx, by, bz, allowEndInside, rayLength) {
  const poly = c.polygon, minY = c.minY ?? 0, maxY = c.maxY;
  // Reject only strictly disjoint segment/prism envelopes. Equality and overlapping envelopes
  // still use the exact outline below (including its inside, boundary and concavity rules).
  // SF collider bounds enclose the original polygon; absent optional XZ bounds simply do not reject.
  if ((ax < c.minX && bx < c.minX) || (ax > c.maxX && bx > c.maxX)
    || (az < c.minZ && bz < c.minZ) || (az > c.maxZ && bz > c.maxZ)
    || (ay < minY && by < minY) || (ay > maxY && by > maxY)) return 0;
  if (ay > minY && ay < maxY && insidePolygon(poly, ax, az)) return 0;
  if (!allowEndInside && by > minY && by < maxY && insidePolygon(poly, bx, bz)) return 0;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  let lo = 0, hi = 1;
  if (Math.abs(dy) < 1e-7) { if (ay <= minY || ay >= maxY) return 0; }
  else {
    const a = (minY - ay) / dy, b = (maxY - ay) / dy;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (hi <= lo) return 0;
  }
  let cutCount = 2;
  cuts[0] = lo; cuts[1] = hi;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ez = b.z - a.z;
    const denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const qx = a.x - ax, qz = a.z - az;
    const t = (qx * ez - qz * ex) / denominator, u = (qx * dz - qz * dx) / denominator;
    if (t > lo && t < hi && u >= 0 && u <= 1) cuts[cutCount++] = t;
  }
  // Stable numeric insertion keeps the same cut order without sort's temporary array/boxed comparisons.
  // Use only this call's active prefix; shorter rays must not read the retained high-water tail.
  for (let i = 1; i < cutCount; i++) {
    const value = cuts[i]; let j = i;
    while (j > 0 && cuts[j - 1] > value) { cuts[j] = cuts[j - 1]; j--; }
    cuts[j] = value;
  }
  let fraction = 0;
  for (let i = 1; i < cutCount; i++) {
    const mid = (cuts[i - 1] + cuts[i]) / 2;
    if (insidePolygon(poly, ax + dx * mid, az + dz * mid)) fraction += cuts[i] - cuts[i - 1];
  }
  return fraction * (rayLength ?? Math.hypot(dx, dy, dz));
}

function thickness(c, ax, ay, az, bx, by, bz, allowEndInside = false, rayLength) {
  if (c.polygon?.length >= 3) return polygonThickness(c, ax, ay, az, bx, by, bz, allowEndInside, rayLength);
  let minX = c.minX, maxX = c.maxX, minZ = c.minZ, maxZ = c.maxZ;
  if (c.obb) {
    // The transformed endpoint subtraction has its own rounding: never reuse the world-space length here.
    rayLength = undefined;
    const o = c.obb;
    const x0 = ax - o.cx, z0 = az - o.cz, x1 = bx - o.cx, z1 = bz - o.cz;
    ax = x0 * o.cs - z0 * o.sn; az = x0 * o.sn + z0 * o.cs;
    bx = x1 * o.cs - z1 * o.sn; bz = x1 * o.sn + z1 * o.cs;
    minX = -o.hx; maxX = o.hx; minZ = -o.hz; maxZ = o.hz;
  }
  const minY = c.minY ?? 0, maxY = c.maxY;
  // A chase camera can briefly enter a conservative collision box. Do not silence the entire city in that case.
  if (ax > minX && ax < maxX && az > minZ && az < maxZ && ay > minY && ay < maxY) return 0;
  if (!allowEndInside && bx > minX && bx < maxX && bz > minZ && bz < maxZ && by > minY && by < maxY) return 0;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  let enter = 0, exit = 1;
  if (Math.abs(dx) < 1e-7) {
    if (ax <= minX || ax >= maxX) return 0;
  } else {
    const a = (minX - ax) / dx, b = (maxX - ax) / dx;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  if (Math.abs(dz) < 1e-7) {
    if (az <= minZ || az >= maxZ) return 0;
  } else {
    const a = (minZ - az) / dz, b = (maxZ - az) / dz;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  if (Math.abs(dy) < 1e-7) {
    if (ay <= minY || ay >= maxY) return 0;
  } else {
    const a = (minY - ay) / dy, b = (maxY - ay) / dy;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
  }
  return Math.max(0, exit - enter) * (rayLength ?? Math.hypot(dx, dy, dz));
}

class CityAcoustics {
  constructor(controllerManager) {
    this.controllers = controllerManager;
    this.buildings = [];
    this.nextRefresh = 0;
    this.enclosure = 0;
    this.x = Infinity;
    this.y = Infinity;
    this.z = Infinity;
  }

  update(listener, now) {
    if (now < this.nextRefresh && Math.hypot(listener.x - this.x, listener.y - this.y, listener.z - this.z) < 20) return;
    this.x = listener.x; this.y = listener.y; this.z = listener.z;
    this.nextRefresh = now + 0.5;
    this.buildings.length = 0;
    // Obstructions near the listener dominate street-level sound; distant geometry need not join this cache.
    for (const c of this.controllers.nearColliders(this.x, this.z, 200)) {
      if (c.maxY - (c.minY ?? 0) > 3 && c.maxX - c.minX > 2 && c.maxZ - c.minZ > 2) this.buildings.push(c);
    }
    if (this.buildings.length === 0) { this.enclosure = 0; return; }

    // Eight rising probes estimate nearby reflective walls, including their height. Reuse the bounds cache
    // at 2 Hz: narrow streets are enclosed, while parks, waterfronts and positions above roofs are open.
    let covered = 0;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const x = this.x + Math.cos(angle) * 80, z = this.z + Math.sin(angle) * 80;
      let depth = 0;
      const y = this.y + 40;
      const rayLength = Math.hypot(x - this.x, y - this.y, z - this.z);
      for (const c of this.buildings) {
        depth = Math.max(depth, thickness(c, this.x, this.y, this.z, x, y, z, true, rayLength));
        if (depth > 40) break;
      }
      covered += 1 - Math.exp(-depth * 0.1);
    }
    this.enclosure = covered / 8;
  }

  obstruction(source, listener, height = 0) {
    const dx = source.x - listener.x, dz = source.z - listener.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 3 || this.buildings.length === 0) return 0;
    const sideX = -dz / distance * 0.9, sideZ = dx / distance * 0.9;
    let blocked = 0;
    // A small aperture smooths corners: one centre path and two neighbouring paths approximate partial cover.
    for (let ray = -1; ray <= 1; ray++) {
      const ox = sideX * ray, oz = sideZ * ray;
      let depth = 0;
      // Exact shifted endpoints/length are invariant across buildings, not cached across calls or rays.
      // Subtract after adding the aperture offsets; reusing dx/dz would change floating-point rounding.
      const ax = listener.x + ox, ay = listener.y, az = listener.z + oz;
      const bx = source.x + ox, by = source.y + height, bz = source.z + oz;
      const rayLength = Math.hypot(bx - ax, by - ay, bz - az);
      for (const c of this.buildings) {
        depth = Math.max(depth, thickness(c, ax, ay, az, bx, by, bz, false, rayLength));
        if (depth > 10) break;
      }
      blocked += 1 - Math.exp(-depth * 0.45);
    }
    return blocked / 3;
  }
}

export { CityAcoustics };
