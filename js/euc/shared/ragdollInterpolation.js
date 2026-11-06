// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/ragdollInterpolation.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
export function ragdollInterpolationBlock(fromBlend, toBlend, from, to, endpoint) {
    if (fromBlend <= 0 && toBlend > 0)
        return to;
    if (fromBlend > 0 && toBlend <= 0)
        return from;
    return endpoint === 0 ? from : to;
}
