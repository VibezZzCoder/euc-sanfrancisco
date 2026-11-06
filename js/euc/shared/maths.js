// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/maths.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
export function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}
export function clamp01(value) {
    return clamp(value, 0, 1);
}
export function lerp(from, to, t) {
    return from + (to - from) * t;
}
export function approach(current, target, responseSeconds, maxRate, dt) {
    if (dt <= 0)
        return current;
    const blend = responseSeconds > 0 ? 1 - Math.exp(-dt / responseSeconds) : 1;
    const maxDelta = maxRate * dt;
    const delta = clamp((target - current) * blend, -maxDelta, maxDelta);
    return current + delta;
}
export function wrapAngle(radians) {
    const wrapped = (radians + Math.PI) % (Math.PI * 2);
    return (wrapped <= 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}
export function sign(value) {
    return value > 0 ? 1 : value < 0 ? -1 : 0;
}
export function positionHash01(x, z, salt) {
    let h = (Math.round(x * 100) * 374761393
        + Math.round(z * 100) * 668265263
        + salt * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
}
