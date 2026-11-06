// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/riderLean.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { clamp01, lerp } from '../shared/maths.js';
export function leanBlend(speed, t) {
    const span = t.carveLeanFullSpeed - t.carveLeanSpeed;
    if (!(span > 0))
        return speed >= t.carveLeanFullSpeed ? 1 : 0;
    return clamp01((speed - t.carveLeanSpeed) / span);
}
export function settleTargetFor(rollRate, t) {
    const rate = Math.abs(rollRate);
    const span = t.carveLeanSwingRate - t.carveLeanHoldRate;
    if (!(span > 0))
        return rate >= t.carveLeanSwingRate ? 0 : 1;
    return 1 - clamp01((rate - t.carveLeanHoldRate) / span);
}
export function settleStep(settle, rollRate, dt, t) {
    const target = settleTargetFor(rollRate, t);
    const delta = target - settle;
    const rise = dt / t.carveLeanSettleIn;
    const fall = dt / t.carveLeanSettleOut;
    if (delta > rise)
        return settle + rise;
    if (delta < -fall)
        return settle - fall;
    return target;
}
export function riderRollFor(rollAngle, riderLean, technicalTurn, speed, t, settle = 1) {
    const low = rollAngle * lerp(t.riderUpperBodyRollFactor, t.technicalTurnUpperBodyRollFactor, Math.abs(technicalTurn));
    const blend = leanBlend(speed, t) * settle;
    if (blend <= 0)
        return low;
    if (blend >= 1)
        return riderLean * t.carveLeanShareTop;
    return lerp(low, riderLean * t.carveLeanShareTop, blend);
}
