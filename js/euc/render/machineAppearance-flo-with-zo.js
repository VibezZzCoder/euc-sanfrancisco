// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { tintOver } from './blockoutKit.js';
const FLO_TRIM_BASE = BLOCKOUT_COLOURS.machineFloWithZoTrim;
const FLO_TRIM_ORANGE = tintOver(FLO_TRIM_BASE, BLOCKOUT_COLOURS.machineFloWithZoOrange);
const FLO_DECK = tintOver(BLOCKOUT_COLOURS.machineFloWithZo, 0x1a1c21);
const FLO_CAVITY = [0.28, 0.28, 0.30];
const FLO_CORE = [1.55, 1.55, 1.58];
const FLO_EDGE = [1.28, 1.28, 1.30];
const FLO_DECK_BOTTOM = 0.596;
const FLO_SHELL_RINGS = Object.freeze([
    { y: 0.250, halfWidth: 0.054, halfDepth: 0.134, square: 3.0 },
    { y: 0.310, halfWidth: 0.098, halfDepth: 0.222, square: 3.6 },
    { y: 0.362, halfWidth: 0.112, halfDepth: 0.260, square: 4.2 },
    { y: 0.412, halfWidth: 0.117, halfDepth: 0.270, square: 4.8 },
    { y: 0.456, halfWidth: 0.118, halfDepth: 0.271, square: 4.8 },
    { y: 0.462, halfWidth: 0.118, halfDepth: 0.272, square: 4.8 },
    { y: 0.500, halfWidth: 0.118, halfDepth: 0.272, square: 4.8 },
    { y: 0.530, halfWidth: 0.117, halfDepth: 0.268, square: 4.8 },
    { y: 0.560, halfWidth: 0.114, halfDepth: 0.260, square: 4.5 },
    { y: 0.582, halfWidth: 0.104, halfDepth: 0.236, square: 4.2 },
    { y: 0.596, halfWidth: 0.098, halfDepth: 0.196, square: 4.2 },
    { y: 0.606, halfWidth: 0.086, halfDepth: 0.150, square: 3.8 },
]);
const FLO_PAD_TOP = 0.062;
const FLO_PAD_RINGS = Object.freeze([
    { y: -0.100, halfWidth: 0.017, halfDepth: 0.166, square: 3.2 },
    { y: -0.086, halfWidth: 0.027, halfDepth: 0.190, square: 4.2 },
    { y: -0.010, halfWidth: 0.028, halfDepth: 0.196, square: 4.6 },
    { y: 0.040, halfWidth: 0.027, halfDepth: 0.192, square: 4.2 },
    { y: FLO_PAD_TOP, halfWidth: 0.018, halfDepth: 0.170, square: 3.2 },
]);
const FLO_BAND = { from: 0.250, to: 0.300 };
const FLO_BAND_REAR = -1.24;
const FLO_BAND_NOSE = 1.24;
const FLO_BAND_GAP = 0.10;
const FLO_TAIL_CENTRE = 0.42;
const FLO_TAIL_HALF = 0.135;
const FLO_TAIL_SHAPE = {
    from: 0.440, to: 0.530, lift: 0.006, sink: -0.012, uSegments: 4, vSegments: 4, uByArc: true,
};
function floBand(mirror) {
    const span = (u0, u1) => (mirror ? { u0: Math.PI - u1, u1: Math.PI - u0 } : { u0, u1 });
    const shape = {
        ...FLO_BAND, lift: 0.010, sink: -0.008, uSegments: 6, vSegments: 3, uByArc: true, tint: FLO_TRIM_ORANGE,
    };
    return [
        { ...span(FLO_BAND_REAR, -FLO_BAND_GAP), ...shape },
        { ...span(FLO_BAND_GAP, FLO_BAND_NOSE), ...shape },
    ];
}
export const FLO_WITH_ZO_MACHINE_LOOK = {
    machine: 'flo-with-zo',
    shell: {
        colour: BLOCKOUT_COLOURS.machineFloWithZo,
        roughness: 0.50,
        profile: FLO_SHELL_RINGS,
    },
    top: {
        kind: 'saddle',
        profile: [
            { y: FLO_DECK_BOTTOM, halfWidth: 0.078, halfDepth: 0.152, square: 4.4 },
            { y: 0.616, halfWidth: 0.090, halfDepth: 0.168, square: 5.2 },
            { y: 0.624, halfWidth: 0.070, halfDepth: 0.140, square: 4.2 },
        ],
        tint: FLO_DECK,
    },
    pads: {
        colour: BLOCKOUT_COLOURS.machineFloWithZoTrim,
        roughness: 0.62,
        blocks: [FLO_PAD_RINGS],
        segments: 16,
        paintPad: (geometry) => {
            const position = geometry.getAttribute('position');
            const colour = geometry.getAttribute('color');
            for (let i = 0; i < position.count; i += 1) {
                const y = position.getY(i);
                const lift = y > 0.052 ? 0.78 : y < -0.086 ? 0.62 : 1;
                if (lift === 1)
                    continue;
                colour.setXYZ(i, colour.getX(i) * lift, colour.getY(i) * lift, colour.getZ(i) * lift);
            }
        },
    },
    tyre: {
        roughness: 0.90,
    },
    trim: {
        colour: FLO_TRIM_BASE,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.58,
        metalness: 0.06,
        patches: [
            ...floBand(false),
            ...floBand(true),
            {
                u0: Math.PI / 2 - 0.0185,
                u1: Math.PI / 2 + 0.0185,
                from: 0.463,
                to: 0.499,
                lift: 0.008,
                sink: -0.008,
                uSegments: 6,
                vSegments: 3,
                uByArc: true,
            },
            {
                u0: Math.PI / 2 - 0.020,
                u1: Math.PI / 2 + 0.020,
                from: 0.534,
                to: 0.566,
                lift: 0.010,
                sink: -0.008,
                uSegments: 10,
                vSegments: 5,
                uByArc: true,
                bulge: 1,
                taper: 0.55,
            },
            {
                u0: Math.PI / 2 - 0.016,
                u1: Math.PI / 2 + 0.016,
                from: 0.466,
                to: 0.496,
                lift: 0.012,
                sink: -0.010,
                uSegments: 6,
                vSegments: 3,
                uByArc: true,
                bulge: 0.5,
                taper: 0.5,
                tint: FLO_TRIM_ORANGE,
            },
        ],
    },
    headlight: {
        patches: [{
                u0: Math.PI / 2 - 0.44,
                u1: Math.PI / 2 + 0.44,
                from: 0.502,
                to: 0.530,
                lift: 0.004,
                sink: -0.012,
                uSegments: 6,
                vSegments: 6,
                taper: 0.40,
            }],
        emissive: BLOCKOUT_COLOURS.headlight,
        emissiveIntensity: 1.4,
    },
    taillight: {
        patches: [
            {
                u0: -Math.PI / 2 - FLO_TAIL_CENTRE - FLO_TAIL_HALF,
                u1: -Math.PI / 2 - FLO_TAIL_CENTRE + FLO_TAIL_HALF,
                ...FLO_TAIL_SHAPE,
            },
            {
                u0: -Math.PI / 2 + FLO_TAIL_CENTRE - FLO_TAIL_HALF,
                u1: -Math.PI / 2 + FLO_TAIL_CENTRE + FLO_TAIL_HALF,
                ...FLO_TAIL_SHAPE,
            },
        ],
    },
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            if (y > 0.607 || (y > 0.594 && Math.abs(x) < 0.082 && Math.abs(z) < 0.160)) {
                if (y > 0.618) {
                    const bar = Math.abs(x) < 0.006;
                    const paint = bar ? FLO_EDGE : FLO_CAVITY;
                    colour.setXYZ(i, paint[0], paint[1], paint[2]);
                    continue;
                }
                colour.setXYZ(i, FLO_DECK[0], FLO_DECK[1], FLO_DECK[2]);
                continue;
            }
            if (z > 0.16 && Math.abs(x) < 0.075 && y > 0.494 && y < 0.572) {
                colour.setXYZ(i, FLO_CAVITY[0], FLO_CAVITY[1], FLO_CAVITY[2]);
                continue;
            }
            if (z < -0.15 && Math.abs(x) < 0.075 && y > 0.400) {
                colour.setXYZ(i, FLO_CAVITY[0], FLO_CAVITY[1], FLO_CAVITY[2]);
                continue;
            }
            if (y < 0.300) {
                colour.setXYZ(i, FLO_CORE[0], FLO_CORE[1], FLO_CORE[2]);
                continue;
            }
            if (y > 0.4545 && y < 0.4625 && Math.abs(x) > 0.090) {
                colour.setXYZ(i, FLO_CAVITY[0], FLO_CAVITY[1], FLO_CAVITY[2]);
                continue;
            }
            if (y > 0.330 && y < 0.565 && Math.abs(x) > 0.088) {
                colour.setXYZ(i, colour.getX(i) * 1.45, colour.getY(i) * 1.45, colour.getZ(i) * 1.45);
                continue;
            }
            if (y > 0.574) {
                colour.setXYZ(i, FLO_EDGE[0], FLO_EDGE[1], FLO_EDGE[2]);
            }
        }
    },
};
