// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/roughness.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
const TAU = Math.PI * 2;
const PRIMARY_X = 0.63;
const PRIMARY_Z = 0.78;
const SECONDARY_X = -0.81;
const SECONDARY_Z = 0.59;
const SECONDARY_SCALE = 0.37;
const SECONDARY_PHASE = 1.7;
const PRIMARY_WEIGHT = 0.62;
const SECONDARY_WEIGHT = 0.38;
export function roughnessAt(x, z, amplitude, wavelength) {
    if (amplitude <= 0 || wavelength <= 0)
        return 0;
    const primary = ((x * PRIMARY_X + z * PRIMARY_Z) / wavelength) * TAU;
    const secondary = ((x * SECONDARY_X + z * SECONDARY_Z) / (wavelength * SECONDARY_SCALE)) * TAU
        + SECONDARY_PHASE;
    return amplitude * (PRIMARY_WEIGHT * Math.sin(primary) + SECONDARY_WEIGHT * Math.sin(secondary));
}
