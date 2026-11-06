// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/freeze.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
export function deepFreeze(value) {
    if (value !== null && typeof value === 'object') {
        for (const key of Object.getOwnPropertyNames(value)) {
            deepFreeze(value[key]);
        }
        Object.freeze(value);
    }
    return value;
}
