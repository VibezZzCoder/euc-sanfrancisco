// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/ragdollContact.ts (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
const EPS = 1e-8;
export function pointMeetsContactPlanes(x, y, z, planes, count, at = 0) {
    for (let i = 0; i < count; i++) {
        const b = at + i * 4;
        if (planes[b] * x + planes[b + 1] * y + planes[b + 2] * z < planes[b + 3] - EPS)
            return false;
    }
    return true;
}
export function nearestContactCircle(cx, cy, cz, ax, ay, az, radius, px, py, pz, planes, count, out, at = 0) {
    if (radius < EPS) {
        if (!pointMeetsContactPlanes(cx, cy, cz, planes, count))
            return false;
        out[at] = cx;
        out[at + 1] = cy;
        out[at + 2] = cz;
        return true;
    }
    const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;
    const x = cx + radius * px, y = cy + radius * py, z = cz + radius * pz;
    if (pointMeetsContactPlanes(x, y, z, planes, count)) {
        out[at] = x;
        out[at + 1] = y;
        out[at + 2] = z;
        return true;
    }
    let best = -Infinity, bestX = 0, bestY = 0, bestZ = 0;
    for (let i = 0; i < count; i++) {
        const b = i * 4, nx = planes[b], ny = planes[b + 1], nz = planes[b + 2];
        const a = nx * px + ny * py + nz * pz, v = nx * qx + ny * qy + nz * qz, d = (planes[b + 3] - nx * cx - ny * cy - nz * cz) / radius, squared = a * a + v * v;
        if (d > Math.sqrt(squared) + EPS)
            return false;
        if (squared < EPS * EPS || d * d > squared + EPS)
            continue;
        const along = d / squared, cross = Math.sqrt(Math.max(0, squared - d * d)) / squared;
        for (let sign = 1; sign >= -1; sign -= 2) {
            const cosine = a * along - sign * v * cross, sine = v * along + sign * a * cross;
            if (cosine < best - EPS)
                continue;
            const candidateX = cx + radius * (px * cosine + qx * sine), candidateY = cy + radius * (py * cosine + qy * sine), candidateZ = cz + radius * (pz * cosine + qz * sine);
            if (pointMeetsContactPlanes(candidateX, candidateY, candidateZ, planes, count) && cosine > best + EPS) {
                best = cosine;
                bestX = candidateX;
                bestY = candidateY;
                bestZ = candidateZ;
            }
        }
    }
    if (best === -Infinity)
        return false;
    out[at] = bestX;
    out[at + 1] = bestY;
    out[at + 2] = bestZ;
    return true;
}
function sphereCandidate(x, y, z, cx, cy, cz, tx, ty, tz, planes, count, out, at) {
    const score = (x - cx) * tx + (y - cy) * ty + (z - cz) * tz;
    if (score <= out[at + 3] + EPS || !pointMeetsContactPlanes(x, y, z, planes, count))
        return;
    out[at] = x;
    out[at + 1] = y;
    out[at + 2] = z;
    out[at + 3] = score;
}
export function nearestContactSphere(cx, cy, cz, radius, tx, ty, tz, planes, count, out, at = 0) {
    let dx = tx - cx, dy = ty - cy, dz = tz - cz, length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length < EPS) {
        dx = 0;
        dy = 1;
        dz = 0;
        length = 1;
    }
    dx /= length;
    dy /= length;
    dz /= length;
    const x = cx + radius * dx, y = cy + radius * dy, z = cz + radius * dz;
    if (pointMeetsContactPlanes(x, y, z, planes, count)) {
        out[at] = x;
        out[at + 1] = y;
        out[at + 2] = z;
        out[at + 3] = radius;
        return true;
    }
    out[at + 3] = -Infinity;
    for (let i = 0; i < count; i++) {
        const b = i * 4, nx = planes[b], ny = planes[b + 1], nz = planes[b + 2], d = planes[b + 3] - nx * cx - ny * cy - nz * cz;
        if (d > radius + EPS)
            return false;
        if (d < -radius - EPS)
            continue;
        const circle = Math.sqrt(Math.max(0, radius * radius - d * d)), projection = dx * nx + dy * ny + dz * nz;
        let px = dx - nx * projection, py = dy - ny * projection, pz = dz - nz * projection, pLength = Math.sqrt(px * px + py * py + pz * pz);
        if (pLength < EPS) {
            px = Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz) ? 1 : 0;
            py = Math.abs(ny) < Math.abs(nx) && Math.abs(ny) <= Math.abs(nz) ? 1 : 0;
            pz = px || py ? 0 : 1;
            const dot = px * nx + py * ny + pz * nz;
            px -= dot * nx;
            py -= dot * ny;
            pz -= dot * nz;
            pLength = Math.sqrt(px * px + py * py + pz * pz);
        }
        px *= circle / pLength;
        py *= circle / pLength;
        pz *= circle / pLength;
        sphereCandidate(cx + nx * d + px, cy + ny * d + py, cz + nz * d + pz, cx, cy, cz, dx, dy, dz, planes, count, out, at);
        if (projection > 1 - EPS || projection < -1 + EPS)
            sphereCandidate(cx + nx * d - px, cy + ny * d - py, cz + nz * d - pz, cx, cy, cz, dx, dy, dz, planes, count, out, at);
        for (let j = i + 1; j < count; j++) {
            const e = j * 4, mx = planes[e], my = planes[e + 1], mz = planes[e + 2], v = planes[e + 3] - mx * cx - my * cy - mz * cz, dot = nx * mx + ny * my + nz * mz, det = 1 - dot * dot;
            if (det < EPS * EPS)
                continue;
            const a = (d - dot * v) / det, beta = (v - dot * d) / det, bx = nx * a + mx * beta, by = ny * a + my * beta, bz = nz * a + mz * beta;
            const remaining = radius * radius - bx * bx - by * by - bz * bz;
            if (remaining < -EPS)
                continue;
            const scale = Math.sqrt(Math.max(0, remaining) / det), qx = (ny * mz - nz * my) * scale, qy = (nz * mx - nx * mz) * scale, qz = (nx * my - ny * mx) * scale;
            sphereCandidate(cx + bx + qx, cy + by + qy, cz + bz + qz, cx, cy, cz, dx, dy, dz, planes, count, out, at);
            sphereCandidate(cx + bx - qx, cy + by - qy, cz + bz - qz, cx, cy, cz, dx, dy, dz, planes, count, out, at);
        }
    }
    return out[at + 3] !== -Infinity;
}
export const RAGDOLL_BOX_STRIDE = 9;
export function contactBoxFace(records, box, face, out, at = 0) {
    const sfPrism = records.sfContacts?.get(box);
    if (sfPrism)
        return sfPrism.face(face, out, at);
    const cx = records[box + 1], cy = records[box + 2], cz = records[box + 3], c = records[box + 7], s = records[box + 8], axis = face >> 1, sign = face & 1 ? 1 : -1;
    const nx = axis === 0 ? c * sign : axis === 2 ? s * sign : 0, ny = axis === 1 ? sign : 0, nz = axis === 0 ? -s * sign : axis === 2 ? c * sign : 0;
    out[at] = nx;
    out[at + 1] = ny;
    out[at + 2] = nz;
    out[at + 3] = nx * cx + ny * cy + nz * cz + records[box + 4 + axis];
}
export function contactSegmentOverlapsBox(ax, ay, az, bx, by, bz, radius, records, box) {
    const sfPrism = records.sfContacts?.get(box);
    if (sfPrism)
        return sfPrism.segment(ax, ay, az, bx, by, bz, radius);
    const c = records[box + 7], s = records[box + 8], dx = ax - records[box + 1], dz = az - records[box + 3];
    const sx = c * dx - s * dz, sy = ay - records[box + 2], sz = s * dx + c * dz, tx = c * (bx - ax) - s * (bz - az), ty = by - ay, tz = s * (bx - ax) + c * (bz - az);
    let enter = 0, exit = 1;
    for (let axis = 0; axis < 3; axis++) {
        const start = axis === 0 ? sx : axis === 1 ? sy : sz, delta = axis === 0 ? tx : axis === 1 ? ty : tz, half = records[box + 4 + axis] + radius;
        if (delta === 0) {
            if (start < -half || start > half)
                return false;
            continue;
        }
        let near = (-half - start) / delta, far = (half - start) / delta;
        if (near > far) {
            const swap = near;
            near = far;
            far = swap;
        }
        enter = Math.max(enter, near);
        exit = Math.min(exit, far);
        if (enter > exit)
            return false;
    }
    return true;
}
export function contactCapsuleOverlapsBox(ax, ay, az, bx, by, bz, radius, records, box, breaks, contact) {
    const sfPrism = records.sfContacts?.get(box);
    if (sfPrism)
        return sfPrism.capsule(ax, ay, az, bx, by, bz, radius, contact);
    if (!contactSegmentOverlapsBox(ax, ay, az, bx, by, bz, radius, records, box))
        return false;
    const c = records[box + 7], s = records[box + 8], dx = ax - records[box + 1], dz = az - records[box + 3];
    const sx = c * dx - s * dz, sy = ay - records[box + 2], sz = s * dx + c * dz, tx = c * (bx - ax) - s * (bz - az), ty = by - ay, tz = s * (bx - ax) + c * (bz - az);
    breaks[0] = 0;
    breaks[1] = 1;
    let count = 2;
    for (let axis = 0; axis < 3; axis++) {
        const start = axis === 0 ? sx : axis === 1 ? sy : sz, delta = axis === 0 ? tx : axis === 1 ? ty : tz, half = records[box + 4 + axis];
        if (Math.abs(delta) < EPS)
            continue;
        for (let sign = -1; sign <= 1; sign += 2) {
            const t = (sign * half - start) / delta;
            if (t <= 0 || t >= 1)
                continue;
            let at = count;
            while (at > 0 && breaks[at - 1] > t) {
                breaks[at] = breaks[at - 1];
                at--;
            }
            breaks[at] = t;
            count++;
        }
    }
    const squared = radius * radius;
    let best = Infinity, bestT = 0, ex = 0, ey = 0, ez = 0;
    for (let interval = 0; interval < count - 1; interval++) {
        const first = breaks[interval], last = breaks[interval + 1], mid = (first + last) * .5;
        let a = 0, b = 0;
        for (let axis = 0; axis < 3; axis++) {
            const start = axis === 0 ? sx : axis === 1 ? sy : sz, delta = axis === 0 ? tx : axis === 1 ? ty : tz, half = records[box + 4 + axis], value = start + delta * mid;
            if (value >= -half && value <= half)
                continue;
            const offset = start - (value < 0 ? -half : half);
            a += delta * delta;
            b += offset * delta;
        }
        const t = a > EPS ? Math.max(first, Math.min(last, -b / a)) : first;
        const x = Math.max(0, Math.abs(sx + tx * t) - records[box + 4]), y = Math.max(0, Math.abs(sy + ty * t) - records[box + 5]), z = Math.max(0, Math.abs(sz + tz * t) - records[box + 6]);
        const distance = x * x + y * y + z * z;
        if (distance < squared - EPS) {
            if (contact === undefined)
                return true;
            if (distance < best) {
                best = distance;
                bestT = t;
                const px = sx + tx * t, py = sy + ty * t, pz = sz + tz * t;
                ex = px - Math.max(-records[box + 4], Math.min(records[box + 4], px));
                ey = py - Math.max(-records[box + 5], Math.min(records[box + 5], py));
                ez = pz - Math.max(-records[box + 6], Math.min(records[box + 6], pz));
            }
        }
    }
    if (best === Infinity)
        return false;
    const length = Math.sqrt(best);
    if (length > EPS) {
        contact[0] = (c * ex + s * ez) / length;
        contact[1] = ey / length;
        contact[2] = (-s * ex + c * ez) / length;
        contact[3] = radius - length;
        contact[4] = ax + (bx - ax) * bestT;
        contact[5] = ay + (by - ay) * bestT;
        contact[6] = az + (bz - az) * bestT;
    }
    else {
        let depth = Infinity, bestNX = 0, bestNY = 0, bestNZ = 0;
        for (let face = 0; face < 6; face++) {
            const axis = face >> 1, sign = face & 1 ? 1 : -1, nx = axis === 0 ? sign : 0, ny = axis === 1 ? sign : 0, nz = axis === 2 ? sign : 0;
            const first = nx * sx + ny * sy + nz * sz, last = first + nx * tx + ny * ty + nz * tz, need = records[box + 4 + axis] + radius - Math.min(first, last);
            if (need < depth) {
                depth = need;
                bestNX = nx;
                bestNY = ny;
                bestNZ = nz;
            }
        }
        for (let i = 0; i < 3; i++)
            for (let j = i + 1; j < 3; j++)
                for (let si = -1; si <= 1; si += 2)
                    for (let sj = -1; sj <= 1; sj += 2) {
                        const di = si * (i === 0 ? tx : i === 1 ? ty : tz), dj = sj * (j === 0 ? tx : j === 1 ? ty : tz);
                        if (di * dj >= 0)
                            continue;
                        const size = Math.sqrt(di * di + dj * dj), wi = Math.abs(dj) / size, wj = Math.abs(di) / size;
                        const nx = (i === 0 ? si * wi : 0) + (j === 0 ? sj * wj : 0), ny = (i === 1 ? si * wi : 0) + (j === 1 ? sj * wj : 0), nz = (i === 2 ? si * wi : 0) + (j === 2 ? sj * wj : 0);
                        const offset = records[box + 4 + i] * wi + records[box + 4 + j] * wj, first = nx * sx + ny * sy + nz * sz, last = first + nx * tx + ny * ty + nz * tz, need = offset + radius - Math.min(first, last);
                        if (need < depth) {
                            depth = need;
                            bestNX = nx;
                            bestNY = ny;
                            bestNZ = nz;
                        }
                    }
        contact[0] = c * bestNX + s * bestNZ;
        contact[1] = bestNY;
        contact[2] = -s * bestNX + c * bestNZ;
        contact[3] = depth;
        contact[4] = ax + (bx - ax) * bestT;
        contact[5] = ay + (by - ay) * bestT;
        contact[6] = az + (bz - az) * bestT;
    }
    return true;
}
export function contactOrientedBoxSupport(nx, ny, nz, basis, basisAt, minX, maxX, minY, maxY, minZ, maxZ) {
    const x = nx * basis[basisAt] + ny * basis[basisAt + 1] + nz * basis[basisAt + 2], y = nx * basis[basisAt + 3] + ny * basis[basisAt + 4] + nz * basis[basisAt + 5], z = nx * basis[basisAt + 6] + ny * basis[basisAt + 7] + nz * basis[basisAt + 8];
    return x * (x >= 0 ? maxX : minX) + y * (y >= 0 ? maxY : minY) + z * (z >= 0 ? maxZ : minZ);
}
export function contactOrientedBoxOverlaps(px, py, pz, basis, basisAt, minX, maxX, minY, maxY, minZ, maxZ, records, box, scratch) {
    const sfPrism = records.sfContacts?.get(box);
    if (sfPrism)
        return sfPrism.oriented(px, py, pz, basis, basisAt, minX, maxX, minY, maxY, minZ, maxZ);
    const ox = (minX + maxX) * .5, oy = (minY + maxY) * .5, oz = (minZ + maxZ) * .5, bhx = (maxX - minX) * .5, bhy = (maxY - minY) * .5, bhz = (maxZ - minZ) * .5;
    const wx = px + basis[basisAt] * ox + basis[basisAt + 3] * oy + basis[basisAt + 6] * oz - records[box + 1], wy = py + basis[basisAt + 1] * ox + basis[basisAt + 4] * oy + basis[basisAt + 7] * oz - records[box + 2], wz = pz + basis[basisAt + 2] * ox + basis[basisAt + 5] * oy + basis[basisAt + 8] * oz - records[box + 3], c = records[box + 7], s = records[box + 8];
    scratch[9] = c * wx - s * wz;
    scratch[10] = wy;
    scratch[11] = s * wx + c * wz;
    for (let j = 0; j < 3; j++) {
        const b = basisAt + j * 3;
        scratch[j] = c * basis[b] - s * basis[b + 2];
        scratch[3 + j] = basis[b + 1];
        scratch[6 + j] = s * basis[b] + c * basis[b + 2];
    }
    for (let i = 0; i < 3; i++) {
        const r = records[box + 4 + i] + Math.abs(scratch[i * 3]) * bhx + Math.abs(scratch[i * 3 + 1]) * bhy + Math.abs(scratch[i * 3 + 2]) * bhz;
        if (Math.abs(scratch[9 + i]) > r + EPS)
            return false;
    }
    for (let j = 0; j < 3; j++) {
        const r = (j === 0 ? bhx : j === 1 ? bhy : bhz) + records[box + 4] * Math.abs(scratch[j]) + records[box + 5] * Math.abs(scratch[3 + j]) + records[box + 6] * Math.abs(scratch[6 + j]);
        if (Math.abs(scratch[9] * scratch[j] + scratch[10] * scratch[3 + j] + scratch[11] * scratch[6 + j]) > r + EPS)
            return false;
    }
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            const k = (i + 1) % 3, l = (i + 2) % 3, m = (j + 1) % 3, n = (j + 2) % 3;
            const value = Math.abs(scratch[9 + l] * scratch[k * 3 + j] - scratch[9 + k] * scratch[l * 3 + j]);
            const r = records[box + 4 + k] * Math.abs(scratch[l * 3 + j]) + records[box + 4 + l] * Math.abs(scratch[k * 3 + j])
                + (m === 0 ? bhx : m === 1 ? bhy : bhz) * Math.abs(scratch[i * 3 + n]) + (n === 0 ? bhx : n === 1 ? bhy : bhz) * Math.abs(scratch[i * 3 + m]);
            if (value > r + EPS)
                return false;
        }
    return true;
}
export function contactOrientedBoxContact(px, py, pz, basis, basisAt, minX, maxX, minY, maxY, minZ, maxZ, records, box, scratch, out) {
    const sfPrism = records.sfContacts?.get(box);
    if (sfPrism)
        return sfPrism.oriented(px, py, pz, basis, basisAt, minX, maxX, minY, maxY, minZ, maxZ, out);
    if (!contactOrientedBoxOverlaps(px, py, pz, basis, basisAt, minX, maxX, minY, maxY, minZ, maxZ, records, box, scratch))
        return false;
    const hx = (maxX - minX) * .5, hy = (maxY - minY) * .5, hz = (maxZ - minZ) * .5, c = records[box + 7], s = records[box + 8];
    let best = Infinity;
    for (let axis = 0; axis < 15; axis++) {
        let nx = 0, ny = 0, nz = 0;
        if (axis < 3) {
            nx = axis === 0 ? 1 : 0;
            ny = axis === 1 ? 1 : 0;
            nz = axis === 2 ? 1 : 0;
        }
        else if (axis < 6) {
            const j = axis - 3;
            nx = scratch[j];
            ny = scratch[3 + j];
            nz = scratch[6 + j];
        }
        else {
            const i = Math.floor((axis - 6) / 3), j = (axis - 6) % 3;
            nx = i === 1 ? scratch[6 + j] : i === 2 ? -scratch[3 + j] : 0;
            ny = i === 2 ? scratch[j] : i === 0 ? -scratch[6 + j] : 0;
            nz = i === 0 ? scratch[3 + j] : i === 1 ? -scratch[j] : 0;
        }
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (length < EPS)
            continue;
        const signed = nx * scratch[9] + ny * scratch[10] + nz * scratch[11];
        const a = Math.abs(nx) * records[box + 4] + Math.abs(ny) * records[box + 5] + Math.abs(nz) * records[box + 6], b = Math.abs(nx * scratch[0] + ny * scratch[3] + nz * scratch[6]) * hx + Math.abs(nx * scratch[1] + ny * scratch[4] + nz * scratch[7]) * hy + Math.abs(nx * scratch[2] + ny * scratch[5] + nz * scratch[8]) * hz;
        const depth = (a + b - Math.abs(signed)) / length;
        if (depth <= EPS)
            return false;
        if (depth < best) {
            best = depth;
            const sign = signed >= 0 ? 1 : -1;
            out[0] = (c * nx + s * nz) * sign / length;
            out[1] = ny * sign / length;
            out[2] = (-s * nx + c * nz) * sign / length;
            out[3] = depth;
        }
    }
    return best !== Infinity;
}
