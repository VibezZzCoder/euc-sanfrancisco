// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { PaintVector3 } from './paintVector.js';
function ringAt(profile, v) {
    const last = profile.length - 1;
    const clamped = Math.min(Math.max(v, 0), last);
    const index = Math.min(Math.floor(clamped), last - 1);
    const f = clamped - index;
    const a = profile[index];
    const b = profile[index + 1];
    return {
        y: a.y + (b.y - a.y) * f,
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * f,
        halfDepth: a.halfDepth + (b.halfDepth - a.halfDepth) * f,
        z: a.z + (b.z - a.z) * f,
        x: a.x + (b.x - a.x) * f,
        square: a.square + (b.square - a.square) * f,
    };
}
export function vAtHeight(profile, y) {
    const last = profile.length - 1;
    if (y <= profile[0].y)
        return 0;
    if (y >= profile[last].y)
        return last;
    for (let i = 1; i <= last; i += 1) {
        const above = profile[i];
        if (y <= above.y) {
            const below = profile[i - 1];
            return i - 1 + (y - below.y) / (above.y - below.y);
        }
    }
    return last;
}
export function loftPoint(profile, u, v, out) {
    const ring = ringAt(profile, v);
    const e = 2 / ring.square;
    const c = Math.cos(u);
    const s = Math.sin(u);
    return out.set(ring.x + ring.halfWidth * Math.sign(c) * Math.abs(c) ** e, ring.y, ring.z + ring.halfDepth * Math.sign(s) * Math.abs(s) ** e);
}
const NORMAL_TANGENT_U = new PaintVector3();
const NORMAL_TANGENT_V = new PaintVector3();
const NORMAL_SAMPLE_A = new PaintVector3();
const NORMAL_SAMPLE_B = new PaintVector3();
export function loftNormal(profile, u, v, out) {
    const du = 1e-3;
    const dv = 1e-3;
    const last = profile.length - 1;
    loftPoint(profile, u + du, v, NORMAL_SAMPLE_A);
    loftPoint(profile, u - du, v, NORMAL_SAMPLE_B);
    NORMAL_TANGENT_U.subVectors(NORMAL_SAMPLE_A, NORMAL_SAMPLE_B);
    const vHigh = Math.min(v + dv, last);
    const vLow = Math.max(v - dv, 0);
    loftPoint(profile, u, vHigh, NORMAL_SAMPLE_A);
    loftPoint(profile, u, vLow, NORMAL_SAMPLE_B);
    NORMAL_TANGENT_V.subVectors(NORMAL_SAMPLE_A, NORMAL_SAMPLE_B);
    out.crossVectors(NORMAL_TANGENT_V, NORMAL_TANGENT_U);
    const length = out.length();
    if (length < 1e-9)
        return out.set(0, v > (last - v) ? 1 : -1, 0);
    return out.multiplyScalar(1 / length);
}
