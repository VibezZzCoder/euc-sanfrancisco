// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
const pixelCaches = Object.freeze({ "cool-rider": ["coolRiderAtlas.ts"], "trollina": [], "red-rider": [], "adonisb2": [], "maribel-vargas": ["maribelAtlas.ts"], "wheel-in-motion": ["wimAtlas.ts", "wimMachineAtlas.ts"], "drunkard": ["drunkardAtlas.ts", "drunkardMachineAtlas.ts"], "flo-with-zo": [], "seal-on-a-wheel": ["sealAtlas.ts"], "wyldist": ["wyldistAtlas.ts"], "gnarwheel": ["gnarwheelAtlas.ts"] });
const loaders = Object.freeze({
    'cool-rider': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-cool-rider.js'), import('./machineAppearance-cool-rider.js')]);
        return { look: r.COOL_RIDER_LOOK, machine: m.STANDARD_MACHINE_LOOK };
    },
    'trollina': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-trollina.js'), import('./machineAppearance-trollina.js')]);
        return { look: r.TROLLINA_LOOK, machine: m.TROLLINA_MACHINE_LOOK };
    },
    'red-rider': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-red-rider.js'), import('./machineAppearance-red-rider.js')]);
        return { look: r.RED_RIDER_LOOK, machine: m.RED_RIDER_MACHINE_LOOK };
    },
    'adonisb2': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-adonisb2.js'), import('./machineAppearance-adonisb2.js')]);
        return { look: r.ADONISB2_LOOK, machine: m.ADONISB2_MACHINE_LOOK };
    },
    'maribel-vargas': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-maribel-vargas.js'), import('./machineAppearance-maribel-vargas.js')]);
        return { look: r.MARIBEL_LOOK, machine: m.MARIBEL_MACHINE_LOOK };
    },
    'wheel-in-motion': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-wheel-in-motion.js'), import('./machineAppearance-wheel-in-motion.js')]);
        return { look: r.WHEEL_IN_MOTION_LOOK, machine: m.WHEEL_IN_MOTION_MACHINE_LOOK };
    },
    'drunkard': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-drunkard.js'), import('./machineAppearance-drunkard.js')]);
        return { look: r.DRUNKARD_LOOK, machine: m.DRUNKARD_MACHINE_LOOK };
    },
    'flo-with-zo': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-flo-with-zo.js'), import('./machineAppearance-flo-with-zo.js')]);
        return { look: r.FLO_WITH_ZO_LOOK, machine: m.FLO_WITH_ZO_MACHINE_LOOK };
    },
    'seal-on-a-wheel': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-seal-on-a-wheel.js'), import('./machineAppearance-seal-on-a-wheel.js')]);
        return { look: r.SEAL_ON_A_WHEEL_LOOK, machine: m.SEAL_ON_A_WHEEL_MACHINE_LOOK };
    },
    'wyldist': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-wyldist.js'), import('./machineAppearance-wyldist.js')]);
        return { look: r.WYLDIST_LOOK, machine: m.WYLDIST_MACHINE_LOOK };
    },
    'gnarwheel': async () => {
        const [r, m] = await Promise.all([import('./riderAppearance-gnarwheel.js'), import('./machineAppearance-gnarwheel.js')]);
        return { look: r.GNARWHEEL_LOOK, machine: m.GNARWHEEL_MACHINE_LOOK };
    }
});
export function isAppearanceId(id) { return Object.hasOwn(loaders, id); }
export function appearancePixelCacheIds(id) { return pixelCaches[id] ?? []; }
export async function importAppearance(id) {
    if (!Object.hasOwn(loaders, id))
        throw new Error('Unknown playable appearance: ' + String(id));
    return loaders[id]();
}
