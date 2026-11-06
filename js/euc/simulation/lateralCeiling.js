// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/lateralCeiling.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { clamp01, lerp } from '../shared/maths.js';
export function lateralCeilingG(speed, t) {
    const v = Math.abs(speed);
    if (v <= t.carveSpeed)
        return t.maxLateralG;
    if (v >= t.carveGripFullSpeed)
        return t.carveGripTopG;
    const span = t.carveGripFullSpeed - t.carveSpeed;
    if (!(span > 0))
        return t.carveGripTopG;
    const u = clamp01((v - t.carveSpeed) / span);
    return lerp(t.maxLateralG, t.carveGripTopG, t.carveGripExponent > 0
        ? u ** t.carveGripExponent
        : u);
}
