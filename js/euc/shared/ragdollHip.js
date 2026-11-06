// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/ragdollHip.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
let cachedFlex = NaN, cachedBack = NaN, cachedSplay = NaN;
let flexSin = 0, flexCos = 1, backSin = 0, backCos = 1, splaySin = 0;
export function projectRagdollHipDirection(x, y, z, flex, back, splay, out, at = 0) {
    if (cachedFlex !== flex) {
        cachedFlex = flex;
        flexSin = Math.sin(flex);
        flexCos = Math.cos(flex);
    }
    if (cachedBack !== back) {
        cachedBack = back;
        backSin = Math.sin(back);
        backCos = Math.cos(back);
    }
    if (cachedSplay !== splay) {
        cachedSplay = splay;
        splaySin = Math.sin(splay);
    }
    const goalX = Math.max(-splaySin, Math.min(splaySin, x)), yz = Math.sqrt(y * y + z * z), goalYZ = Math.sqrt(Math.max(0, 1 - goalX * goalX));
    let goalY = -1, goalZ = 0;
    if (yz > 1e-8) {
        goalY = y / yz;
        goalZ = z / yz;
        const pitch = Math.atan2(goalZ, -goalY);
        if (pitch > flex || pitch < -back) {
            if (-goalY * flexCos + goalZ * flexSin >= -goalY * backCos - goalZ * backSin) {
                goalY = -flexCos;
                goalZ = flexSin;
            }
            else {
                goalY = -backCos;
                goalZ = -backSin;
            }
        }
    }
    goalY *= goalYZ;
    goalZ *= goalYZ;
    out[at] = goalX;
    out[at + 1] = goalY;
    out[at + 2] = goalZ;
    let ax = y * goalZ - z * goalY, ay = z * goalX - x * goalZ, az = x * goalY - y * goalX, size = Math.sqrt(ax * ax + ay * ay + az * az);
    const cosine = Math.max(-1, Math.min(1, x * goalX + y * goalY + z * goalZ));
    const angle = size < 1e-8 && cosine < 0 ? Math.PI : Math.atan2(size, cosine);
    if (size < 1e-8) {
        if (cosine >= 0) {
            out[at + 3] = 0;
            out[at + 4] = 0;
            out[at + 5] = 0;
            out[at + 6] = 0;
            return;
        }
        ax = y;
        ay = -x;
        az = 0;
        size = Math.sqrt(ax * ax + ay * ay);
        if (size < 1e-8) {
            ax = 0;
            ay = z;
            az = -y;
            size = Math.sqrt(ay * ay + az * az);
        }
    }
    out[at + 3] = ax / size;
    out[at + 4] = ay / size;
    out[at + 5] = az / size;
    out[at + 6] = angle;
}
let cachedFrameTurn = NaN, frameCos = 1, frameSin = 0;
export function capRagdollFrameRotation(start, goal, maximum) {
    if (!(maximum < Math.PI))
        return;
    if (cachedFrameTurn !== maximum) {
        cachedFrameTurn = maximum;
        frameCos = Math.cos(maximum);
        frameSin = Math.sin(maximum);
    }
    let trace = 0;
    for (let i = 0; i < 9; i++)
        trace += start[i] * goal[i];
    if ((trace - 1) * .5 >= frameCos)
        return;
    let ax = 0, ay = 0, az = 0;
    for (let b = 0; b < 9; b += 3) {
        ax += start[b + 1] * goal[b + 2] - start[b + 2] * goal[b + 1];
        ay += start[b + 2] * goal[b] - start[b] * goal[b + 2];
        az += start[b] * goal[b + 1] - start[b + 1] * goal[b];
    }
    let size = Math.sqrt(ax * ax + ay * ay + az * az);
    if (size < 1e-8) {
        const r00 = goal[0] * start[0] + goal[3] * start[3] + goal[6] * start[6], r11 = goal[1] * start[1] + goal[4] * start[4] + goal[7] * start[7], r22 = goal[2] * start[2] + goal[5] * start[5] + goal[8] * start[8];
        const r01 = goal[0] * start[1] + goal[3] * start[4] + goal[6] * start[7], r10 = goal[1] * start[0] + goal[4] * start[3] + goal[7] * start[6], r02 = goal[0] * start[2] + goal[3] * start[5] + goal[6] * start[8], r20 = goal[2] * start[0] + goal[5] * start[3] + goal[8] * start[6], r12 = goal[1] * start[2] + goal[4] * start[5] + goal[7] * start[8], r21 = goal[2] * start[1] + goal[5] * start[4] + goal[8] * start[7];
        if (r00 >= r11 && r00 >= r22) {
            ax = Math.sqrt(Math.max(0, (r00 + 1) * .5));
            ay = (r01 + r10) / (4 * ax);
            az = (r02 + r20) / (4 * ax);
        }
        else if (r11 >= r22) {
            ay = Math.sqrt(Math.max(0, (r11 + 1) * .5));
            ax = (r01 + r10) / (4 * ay);
            az = (r12 + r21) / (4 * ay);
        }
        else {
            az = Math.sqrt(Math.max(0, (r22 + 1) * .5));
            ax = (r02 + r20) / (4 * az);
            ay = (r12 + r21) / (4 * az);
        }
        size = Math.sqrt(ax * ax + ay * ay + az * az);
    }
    ax /= size;
    ay /= size;
    az /= size;
    for (let b = 0; b < 9; b += 3) {
        const x = start[b], y = start[b + 1], z = start[b + 2], dot = (ax * x + ay * y + az * z) * (1 - frameCos);
        goal[b] = x * frameCos + (ay * z - az * y) * frameSin + ax * dot;
        goal[b + 1] = y * frameCos + (az * x - ax * z) * frameSin + ay * dot;
        goal[b + 2] = z * frameCos + (ax * y - ay * x) * frameSin + az * dot;
    }
}
