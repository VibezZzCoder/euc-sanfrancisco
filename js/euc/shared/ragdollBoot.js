// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/ragdollBoot.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
export const ragdollLegReachMinimum = (upper, lower) => Math.abs(upper - lower) + 1e-6;
export function solveRagdollLimb(hx, hy, hz, fx, fy, fz, forwardX, forwardZ, heading, upper, lower, minimum, maximum, verticalBand, out, poles, poleOffset = 0, projectedPole = false, upperBasis = true, supportBox, normalX = 0, normalY = 1, normalZ = 0, jointOnly = false) {
    let dx = fx - hx, dy = fy - hy, dz = fz - hz, reach = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (reach < minimum) {
        const vertical = dy;
        let horizontal = Math.sqrt(dx * dx + dz * dz);
        if (horizontal < 1e-9) {
            dx = Math.sin(heading);
            dz = Math.cos(heading);
            horizontal = 1;
        }
        const scale = Math.sqrt(Math.max(0, minimum * minimum - vertical * vertical)) / horizontal;
        dx *= scale;
        dz *= scale;
        reach = minimum;
    }
    else if (reach > maximum) {
        const scale = maximum / reach;
        dx *= scale;
        dy *= scale;
        dz *= scale;
        reach = maximum;
    }
    fx = hx + dx;
    fy = hy + dy;
    fz = hz + dz;
    const tx = dx / reach, ty = dy / reach, tz = dz / reach;
    const along = Math.max(-upper, Math.min(upper, (upper * upper - lower * lower + reach * reach) / (2 * reach)));
    const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
    let px = poles?.[poleOffset] ?? 0, py = poles?.[poleOffset + 1] ?? 0, pz = poles?.[poleOffset + 2] ?? 0;
    if (!projectedPole) {
        const poleProjection = px * tx + py * ty + pz * tz;
        px -= tx * poleProjection;
        py -= ty * poleProjection;
        pz -= tz * poleProjection;
    }
    let poleLength = projectedPole ? 1 : Math.sqrt(px * px + py * py + pz * pz);
    if (poleLength < 1e-8) {
        px = -tx * ty;
        py = 1 - ty * ty;
        pz = -tz * ty;
        poleLength = Math.sqrt(px * px + py * py + pz * pz);
        if (poleLength < verticalBand) {
            px = Math.sin(heading) + .25 * forwardX;
            py = 0;
            pz = Math.cos(heading) + .25 * forwardZ;
            const projection = px * tx + pz * tz;
            px -= tx * projection;
            py -= ty * projection;
            pz -= tz * projection;
            poleLength = Math.sqrt(px * px + py * py + pz * pz);
        }
    }
    if (poleLength < 1e-8) {
        px = Math.abs(tx) <= Math.abs(ty) && Math.abs(tx) <= Math.abs(tz) ? 1 : 0;
        py = Math.abs(ty) < Math.abs(tx) && Math.abs(ty) <= Math.abs(tz) ? 1 : 0;
        pz = px || py ? 0 : 1;
        const projection = px * tx + py * ty + pz * tz;
        px -= tx * projection;
        py -= ty * projection;
        pz -= tz * projection;
        poleLength = Math.sqrt(px * px + py * py + pz * pz);
    }
    px /= poleLength;
    py /= poleLength;
    pz /= poleLength;
    out[33] = px;
    out[34] = py;
    out[35] = pz;
    const kx = hx + tx * along + px * offset, ky = hy + ty * along + py * offset, kz = hz + tz * along + pz * offset;
    out[0] = kx;
    out[1] = ky;
    out[2] = kz;
    out[3] = fx;
    out[4] = fy;
    out[5] = fz;
    if (jointOnly)
        return;
    const nx = py * tz - pz * ty, ny = pz * tx - px * tz, nz = px * ty - py * tx;
    if (upperBasis) {
        const ax = (hx - kx) / upper, ay = (hy - ky) / upper, az = (hz - kz) / upper;
        out[6] = nx;
        out[7] = ny;
        out[8] = nz;
        out[9] = ax;
        out[10] = ay;
        out[11] = az;
        out[12] = ny * az - nz * ay;
        out[13] = nz * ax - nx * az;
        out[14] = nx * ay - ny * ax;
    }
    const ux = (kx - fx) / lower, uy = (ky - fy) / lower, uz = (kz - fz) / lower;
    const zx = ny * uz - nz * uy, zy = nz * ux - nx * uz, zz = nx * uy - ny * ux;
    if (supportBox) {
        out[36] = boxGroundSupport(nx * normalX + ny * normalY + nz * normalZ, ux * normalX + uy * normalY + uz * normalZ, zx * normalX + zy * normalY + zz * normalZ, supportBox, normalY);
    }
    else {
        out[15] = nx;
        out[16] = ny;
        out[17] = nz;
        out[18] = ux;
        out[19] = uy;
        out[20] = uz;
        out[21] = zx;
        out[22] = zy;
        out[23] = zz;
    }
}
let cachedPitch = NaN, cachedRoll = NaN, cachedHeading = NaN;
let headingSin = 0, headingCos = 1;
let pitchSin = 0, pitchCos = 1, pitchTan = 0, rollSin = 0, rollCos = 1, rollTan = 0;
export function solveRagdollLeg(hx, hy, hz, fx, fy, fz, forwardX, forwardZ, heading, tuning, out, poles, poleOffset = 0, projectedPole = false, upperBasis = true, supportBox, normalX = 0, normalY = 1, normalZ = 0) {
    solveRagdollLimb(hx, hy, hz, fx, fy, fz, forwardX, forwardZ, heading, tuning.thighLength, tuning.shinLength, ragdollLegReachMinimum(tuning.thighLength, tuning.shinLength), tuning.thighLength + tuning.shinLength - 1e-6, tuning.ragdollKneeVerticalBand, out, poles, poleOffset, projectedPole, upperBasis);
    const dx = out[3] - hx, dz = out[5] - hz, nx = out[15], ny = out[16], nz = out[17], ux = out[18], uy = out[19], uz = out[20], zx = out[21], zy = out[22], zz = out[23];
    if (cachedPitch !== tuning.ragdollBootPitchMax) {
        cachedPitch = tuning.ragdollBootPitchMax;
        pitchSin = Math.sin(cachedPitch);
        pitchCos = Math.cos(cachedPitch);
        pitchTan = pitchSin / pitchCos;
    }
    if (cachedRoll !== tuning.ragdollBootRollMax) {
        cachedRoll = tuning.ragdollBootRollMax;
        rollSin = Math.sin(cachedRoll);
        rollCos = Math.cos(cachedRoll);
        rollTan = rollSin / rollCos;
    }
    const gravityYZ = Math.sqrt(uy * uy + zy * zy);
    const pitchFree = uy > 0 && Math.abs(zy) <= uy * pitchTan;
    const pitchSign = zy < 0 || (zy === 0 && 1 / zy === -Infinity) ? -1 : 1;
    const sx = pitchFree ? zy / gravityYZ : pitchSign * pitchSin, cx = pitchFree ? uy / gravityYZ : pitchCos;
    const rollFree = Math.abs(ny) <= gravityYZ * rollTan;
    const gravitySize = rollFree ? Math.sqrt(ny * ny + gravityYZ * gravityYZ) : 1;
    const sz = rollFree ? -ny / gravitySize : (ny > 0 ? -rollSin : rollSin), cz = rollFree ? gravityYZ / gravitySize : rollCos;
    if (cachedHeading !== heading) {
        cachedHeading = heading;
        headingSin = Math.sin(heading);
        headingCos = Math.cos(heading);
    }
    const yaw = tuning.ragdollBootYawMax * (dx * headingCos - dz * headingSin)
        / Math.sqrt(dx * dx + dz * dz + tuning.ragdollBootYawSoftness * tuning.ragdollBootYawSoftness);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const r0 = cz * cy, r1 = cx * sz * cy + sx * sy, r2 = sx * sz * cy - cx * sy;
    const r3 = -sz, r4 = cx * cz, r5 = sx * cz;
    const r6 = cz * sy, r7 = cx * sz * sy - sx * cy, r8 = sx * sz * sy + cx * cy;
    if (supportBox) {
        const x = nx * normalX + ny * normalY + nz * normalZ;
        const y = ux * normalX + uy * normalY + uz * normalZ;
        const z = zx * normalX + zy * normalY + zz * normalZ;
        out[36] = boxGroundSupport(x * r0 + y * r1 + z * r2, x * r3 + y * r4 + z * r5, x * r6 + y * r7 + z * r8, supportBox, normalY);
        return;
    }
    out[24] = nx * r0 + ux * r1 + zx * r2;
    out[25] = ny * r0 + uy * r1 + zy * r2;
    out[26] = nz * r0 + uz * r1 + zz * r2;
    out[27] = nx * r3 + ux * r4 + zx * r5;
    out[28] = ny * r3 + uy * r4 + zy * r5;
    out[29] = nz * r3 + uz * r4 + zz * r5;
    out[30] = nx * r6 + ux * r7 + zx * r8;
    out[31] = ny * r6 + uy * r7 + zy * r8;
    out[32] = nz * r6 + uz * r7 + zz * r8;
}
const BOOT_TEMP = new Float64Array(36);
export function writeRagdollBootFrame(p, hip, foot, heading, tuning, out, poles, poleOffset = 0) {
    const h = hip * 3, f = foot * 3, upX = p[3] - p[0], upY = p[4] - p[1], upZ = p[5] - p[2];
    const lx = p[9] - p[12], ly = p[10] - p[13], lz = p[11] - p[14];
    solveRagdollLeg(p[h], p[h + 1], p[h + 2], p[f], p[f + 1], p[f + 2], ly * upZ - lz * upY, lx * upY - ly * upX, heading, tuning, BOOT_TEMP, poles, poleOffset);
    for (let i = 0; i < 9; i += 1)
        out[i] = BOOT_TEMP[24 + i];
}
export function ragdollBootGroundSupport(frame, box, normalX, normalY, normalZ, offset = 0) {
    const x = frame[offset + 0] * normalX + frame[offset + 1] * normalY + frame[offset + 2] * normalZ;
    const y = frame[offset + 3] * normalX + frame[offset + 4] * normalY + frame[offset + 5] * normalZ;
    const z = frame[offset + 6] * normalX + frame[offset + 7] * normalY + frame[offset + 8] * normalZ;
    return boxGroundSupport(x, y, z, box, normalY);
}
function boxGroundSupport(x, y, z, box, normalY) {
    return (Math.abs(x) * (box.maxX - box.minX) + Math.abs(y) * (box.maxY - box.minY)
        + Math.abs(z) * (box.maxZ - box.minZ) - x * (box.maxX + box.minX)
        - y * (box.maxY + box.minY) - z * (box.maxZ + box.minZ)) / (2 * Math.max(1e-6, normalY));
}
let cachedPoleBudget = NaN, poleBudgetCos = 1, poleBudgetSin = 0;
export function transportRagdollLegPole(dx, dy, dz, heading, verticalBand, maxTurn, out, offset) {
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, tx = dx / length, ty = dy / length, tz = dz / length;
    let px = out[offset], py = out[offset + 1], pz = out[offset + 2], dot = px * tx + py * ty + pz * tz;
    px -= tx * dot;
    py -= ty * dot;
    pz -= tz * dot;
    let size = Math.sqrt(px * px + py * py + pz * pz);
    if (size < 1e-8) {
        px = Math.sin(heading);
        py = 0;
        pz = Math.cos(heading);
        dot = px * tx + pz * tz;
        px -= tx * dot;
        py -= ty * dot;
        pz -= tz * dot;
        size = Math.sqrt(px * px + py * py + pz * pz);
        if (size < 1e-8) {
            px = Math.abs(tx) <= Math.abs(ty) && Math.abs(tx) <= Math.abs(tz) ? 1 : 0;
            py = Math.abs(ty) < Math.abs(tx) && Math.abs(ty) <= Math.abs(tz) ? 1 : 0;
            pz = px || py ? 0 : 1;
            dot = px * tx + py * ty + pz * tz;
            px -= tx * dot;
            py -= ty * dot;
            pz -= tz * dot;
            size = Math.sqrt(px * px + py * py + pz * pz);
        }
    }
    px /= size;
    py /= size;
    pz /= size;
    if (maxTurn <= 0) {
        out[offset] = px;
        out[offset + 1] = py;
        out[offset + 2] = pz;
        return;
    }
    const gx = -tx * ty, gy = 1 - ty * ty, gz = -tz * ty, groundLength = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (groundLength >= verticalBand) {
        const ux = gx / groundLength, uy = gy / groundLength, uz = gz / groundLength;
        const cosine = Math.max(-1, Math.min(1, px * ux + py * uy + pz * uz));
        if (cachedPoleBudget !== maxTurn) {
            cachedPoleBudget = maxTurn;
            poleBudgetCos = Math.cos(maxTurn);
            poleBudgetSin = Math.sin(maxTurn);
        }
        if (maxTurn >= Math.PI || cosine >= poleBudgetCos) {
            out[offset] = ux;
            out[offset + 1] = uy;
            out[offset + 2] = uz;
            return;
        }
        const cross = tx * (py * uz - pz * uy) + ty * (pz * ux - px * uz) + tz * (px * uy - py * ux);
        const sign = Math.abs(cross) < 1e-10 ? (offset === 0 ? 1 : -1) : Math.sign(cross);
        const c = poleBudgetCos, s = poleBudgetSin * sign;
        const x = px * c + (ty * pz - tz * py) * s, y = py * c + (tz * px - tx * pz) * s;
        pz = pz * c + (tx * py - ty * px) * s;
        px = x;
        py = y;
    }
    out[offset] = px;
    out[offset + 1] = py;
    out[offset + 2] = pz;
}
export function interpolateRagdollJointPoles(first, last, alpha, particles, heading, verticalBand, out) {
    for (let i = 0; i < 12; i += 1)
        out[i] = first[i] + (last[i] - first[i]) * alpha;
    for (let side = 0; side < 4; side += 1) {
        const hip = (3 + side) * 3, foot = (side < 2 ? 9 + side : 5 + side) * 3;
        transportRagdollLegPole(particles[foot] - particles[hip], particles[foot + 1] - particles[hip + 1], particles[foot + 2] - particles[hip + 2], heading, verticalBand, 0, out, side * 3);
    }
}
export function guideRagdollPoleForPlane(hx, hy, hz, fx, fy, fz, upper, lower, groundY, nx, ny, nz, radius, budget, out, at) {
    if (nx * (hx - fx) + ny * (hy - groundY) + nz * (hz - fz)
        - upper * (Math.abs(nx) + Math.abs(ny) + Math.abs(nz)) >= radius)
        return;
    const dx = fx - hx, dy = fy - hy, dz = fz - hz, reach = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (reach < 1e-9)
        return;
    const tx = dx / reach, ty = dy / reach, tz = dz / reach, along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    const circle = Math.sqrt(Math.max(0, upper * upper - along * along));
    if (circle < 1e-9)
        return;
    const dn = nx * tx + ny * ty + nz * tz, gx = nx - dn * tx, gy = ny - dn * ty, gz = nz - dn * tz, size = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (size < 1e-8)
        return;
    const base = nx * (hx - fx) + ny * (hy - groundY) + nz * (hz - fz) + dn * along;
    const required = Math.max(-1, Math.min(1, (radius - base) / (circle * size)));
    const px = out[at], py = out[at + 1], pz = out[at + 2], cosine = Math.max(-1, Math.min(1, (px * gx + py * gy + pz * gz) / size));
    if (cosine >= required)
        return;
    const cross = tx * (py * gz - pz * gy) + ty * (pz * gx - px * gz) + tz * (px * gy - py * gx);
    const angle = Math.min(budget, Math.acos(cosine) - Math.acos(required)) * (Math.abs(cross) < 1e-10 ? (at % 6 === 0 ? 1 : -1) : Math.sign(cross));
    const c = Math.cos(angle), v = Math.sin(angle);
    out[at] = px * c + (ty * pz - tz * py) * v;
    out[at + 1] = py * c + (tz * px - tx * pz) * v;
    out[at + 2] = pz * c + (tx * py - ty * px) * v;
}
