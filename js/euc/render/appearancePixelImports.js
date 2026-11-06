// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
const pixelCaches = Object.freeze({ "cool-rider": ["coolRiderAtlas.ts"], "trollina": [], "red-rider": [], "adonisb2": [], "maribel-vargas": ["maribelAtlas.ts"], "wheel-in-motion": ["wimAtlas.ts", "wimMachineAtlas.ts"], "drunkard": ["drunkardAtlas.ts", "drunkardMachineAtlas.ts"], "flo-with-zo": [], "seal-on-a-wheel": ["sealAtlas.ts"], "wyldist": ["wyldistAtlas.ts"], "gnarwheel": ["gnarwheelAtlas.ts"] });
const painters = Object.freeze({
    'coolRiderAtlas.ts': () => import('./pixels/coolRiderAtlas.js'),
    'maribelAtlas.ts': () => import('./pixels/maribelAtlas.js'),
    'wimAtlas.ts': () => import('./pixels/wimAtlas.js'),
    'wimMachineAtlas.ts': () => import('./pixels/wimMachineAtlas.js'),
    'drunkardAtlas.ts': () => import('./pixels/drunkardAtlas.js'),
    'drunkardMachineAtlas.ts': () => import('./pixels/drunkardMachineAtlas.js'),
    'sealAtlas.ts': () => import('./pixels/sealAtlas.js'),
    'wyldistAtlas.ts': () => import('./pixels/wyldistAtlas.js'),
    'gnarwheelAtlas.ts': () => import('./pixels/gnarwheelAtlas.js')
});
export async function paintAppearancePixels(id, inputs) {
    if (!Object.hasOwn(pixelCaches, id))
        throw new Error('Unknown playable appearance: ' + String(id));
    const expected = pixelCaches[id];
    if (!inputs || JSON.stringify(Object.keys(inputs).sort()) !== JSON.stringify([...expected].sort())) {
        throw new Error('Incomplete appearance painting inputs');
    }
    const caches = {};
    for (const cache of expected) {
        if (!Array.isArray(inputs[cache]))
            throw new Error('Invalid appearance painting layout');
        const { paintBank } = await painters[cache]();
        caches[cache] = paintBank(...inputs[cache]);
    }
    return caches;
}
