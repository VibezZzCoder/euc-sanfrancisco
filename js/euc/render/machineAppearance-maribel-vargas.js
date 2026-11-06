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
import { ATLAS_REGIONS, createMaribelAtlas } from './maribelAtlas.js';
const MARIBEL_TRIM_BASE = 0xdcdde1;
const MARIBEL_TRIM_DARK = tintOver(MARIBEL_TRIM_BASE, 0x26272c);
const MARIBEL_TRIM_PURPLE = tintOver(MARIBEL_TRIM_BASE, BLOCKOUT_COLOURS.maribelPurple);
const MARIBEL_DECK = tintOver(BLOCKOUT_COLOURS.maribelMachine, 0x141519);
export const MARIBEL_MACHINE_LOOK = {
    machine: 'maribel',
    shell: {
        colour: BLOCKOUT_COLOURS.maribelMachine,
        roughness: 0.48,
        profile: [
            { y: 0.250, halfWidth: 0.052, halfDepth: 0.130, square: 3.0 },
            { y: 0.318, halfWidth: 0.096, halfDepth: 0.212, square: 3.6 },
            { y: 0.372, halfWidth: 0.113, halfDepth: 0.252, square: 4.0 },
            { y: 0.428, halfWidth: 0.116, halfDepth: 0.258, square: 5.0 },
            { y: 0.490, halfWidth: 0.116, halfDepth: 0.256, square: 5.0 },
            { y: 0.500, halfWidth: 0.116, halfDepth: 0.256, square: 5.0 },
            { y: 0.508, halfWidth: 0.112, halfDepth: 0.248, square: 4.6 },
            { y: 0.545, halfWidth: 0.112, halfDepth: 0.244, square: 4.0 },
            { y: 0.582, halfWidth: 0.100, halfDepth: 0.212, square: 3.5 },
            { y: 0.600, halfWidth: 0.074, halfDepth: 0.152, square: 3.0 },
        ],
    },
    top: {
        kind: 'saddle',
        profile: [
            { y: 0.590, halfWidth: 0.070, halfDepth: 0.168, square: 4.6 },
            { y: 0.604, halfWidth: 0.078, halfDepth: 0.182, square: 5.4 },
            { y: 0.618, halfWidth: 0.076, halfDepth: 0.178, z: -0.004, square: 5.6 },
            { y: 0.626, halfWidth: 0.062, halfDepth: 0.150, z: -0.008, square: 4.4 },
        ],
        tint: MARIBEL_DECK,
    },
    pads: {
        colour: BLOCKOUT_COLOURS.maribelPurple,
        roughness: 0.82,
        blocks: [
            [
                { y: 0.026, halfWidth: 0.012, halfDepth: 0.128, z: 0.004, square: 3.2 },
                { y: 0.052, halfWidth: 0.026, halfDepth: 0.146, z: 0.002, square: 3.6 },
                { y: 0.086, halfWidth: 0.028, halfDepth: 0.150, z: 0.000, square: 3.6 },
                { y: 0.116, halfWidth: 0.024, halfDepth: 0.142, z: -0.002, square: 3.4 },
                { y: 0.138, halfWidth: 0.011, halfDepth: 0.120, z: -0.004, square: 3.0 },
            ],
        ],
        segments: 16,
        paintPad: (geometry) => {
            const position = geometry.getAttribute('position');
            const colour = geometry.getAttribute('color');
            for (let i = 0; i < position.count; i += 1) {
                const y = position.getY(i);
                const lift = y > 0.108 ? 1.26 : y < 0.048 ? 0.62 : 1;
                if (lift === 1)
                    continue;
                colour.setXYZ(i, colour.getX(i) * lift, colour.getY(i) * lift, colour.getZ(i) * lift);
            }
        },
    },
    atlas: {
        paintInput: () => ({ cache: 'maribelAtlas.ts', args: [] }),
        build: createMaribelAtlas,
        region: (art) => (art !== undefined && art in ATLAS_REGIONS
            ? ATLAS_REGIONS[art]
            : ATLAS_REGIONS.blank),
    },
    tyre: {
        roughness: 0.86,
        lugs: {
            count: 26,
            rows: [
                { at: -0.86, phase: 0.25 },
                { at: -0.50, phase: 0 },
                { at: 0.02, phase: 0.5 },
                { at: 0.50, phase: 0 },
                { at: 0.86, phase: 0.25 },
            ],
            size: [0.030, 0.008, 0.036],
            shade: 1.22,
        },
    },
    trim: {
        colour: MARIBEL_TRIM_BASE,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.40,
        metalness: 0.10,
        patches: [
            {
                u0: Math.PI / 2 - 0.85,
                u1: Math.PI / 2 + 0.85,
                from: 0.535,
                to: 0.588,
                lift: 0.005,
                sink: -0.010,
                uSegments: 10,
                vSegments: 8,
                tint: MARIBEL_TRIM_PURPLE,
            },
            {
                u0: -Math.PI / 2 - 0.85,
                u1: -Math.PI / 2 + 0.85,
                from: 0.535,
                to: 0.588,
                lift: 0.005,
                sink: -0.010,
                uSegments: 10,
                vSegments: 8,
                tint: MARIBEL_TRIM_PURPLE,
            },
            {
                u0: Math.PI / 2 - 0.62,
                u1: Math.PI / 2 + 0.62,
                from: 0.430,
                to: 0.468,
                lift: 0.005,
                sink: -0.010,
                uSegments: 8,
                vSegments: 2,
                taper: 0.35,
                tint: MARIBEL_TRIM_DARK,
            },
            {
                u0: -0.21,
                u1: 0.13,
                from: 0.272,
                to: 0.427,
                lift: 0.004,
                sink: -0.014,
                uSegments: 8,
                vSegments: 8,
                art: 'machineMark',
            },
            {
                u0: Math.PI - 0.13,
                u1: Math.PI + 0.21,
                from: 0.272,
                to: 0.427,
                lift: 0.004,
                sink: -0.014,
                uSegments: 8,
                vSegments: 8,
                art: 'machineMark',
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
        patches: [{
                u0: -Math.PI / 2 - 0.50,
                u1: -Math.PI / 2 + 0.50,
                from: 0.446,
                to: 0.476,
                lift: 0.004,
                sink: -0.012,
                uSegments: 8,
                vSegments: 2,
                taper: 0.28,
            }],
    }
};
