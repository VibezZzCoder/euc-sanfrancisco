// Frozen pre-rejection algorithm from js/audio-acoustics.js at SF 2ff1a7c.
// Differential oracle only: do not update it to match an optimization.
function insidePolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const cuts = [];
function polygonThickness(c, ax, ay, az, bx, by, bz, allowEndInside) {
  const poly = c.polygon, minY = c.minY ?? 0, maxY = c.maxY;
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
  cuts.length = 0;
  cuts.push(lo, hi);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ez = b.z - a.z;
    const denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const qx = a.x - ax, qz = a.z - az;
    const t = (qx * ez - qz * ex) / denominator, u = (qx * dz - qz * dx) / denominator;
    if (t > lo && t < hi && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  let fraction = 0;
  for (let i = 1; i < cuts.length; i++) {
    const mid = (cuts[i - 1] + cuts[i]) / 2;
    if (insidePolygon(poly, ax + dx * mid, az + dz * mid)) fraction += cuts[i] - cuts[i - 1];
  }
  return fraction * Math.hypot(dx, dy, dz);
}
export function thickness(c, ax, ay, az, bx, by, bz, allowEndInside = false) {
  if (c.polygon?.length >= 3) return polygonThickness(c, ax, ay, az, bx, by, bz, allowEndInside);
  let minX = c.minX, maxX = c.maxX, minZ = c.minZ, maxZ = c.maxZ;
  if (c.obb) {
    const o = c.obb;
    const x0 = ax - o.cx, z0 = az - o.cz, x1 = bx - o.cx, z1 = bz - o.cz;
    ax = x0 * o.cs - z0 * o.sn; az = x0 * o.sn + z0 * o.cs;
    bx = x1 * o.cs - z1 * o.sn; bz = x1 * o.sn + z1 * o.cs;
    minX = -o.hx; maxX = o.hx; minZ = -o.hz; maxZ = o.hz;
  }
  const minY = c.minY ?? 0, maxY = c.maxY;
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
  return Math.max(0, exit - enter) * Math.hypot(dx, dy, dz);
}
