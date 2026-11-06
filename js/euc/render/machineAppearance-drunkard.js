// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { BLOCKOUT_COLOURS, WHEEL } from '../data/tuning.js';
import { loftProfile, tintOver } from './blockoutKit.js';
import { createDrunkardMachineAtlas, drunkardMachineRegion } from './drunkardMachineAtlas.js';
const STANDARD_MACHINE_LOOK = {
    machine: 'standard',
    shell: { colour: BLOCKOUT_COLOURS.shell, roughness: 0.45 },
    top: { kind: 'handle' },
    trim: {
        colour: BLOCKOUT_COLOURS.accent,
        emissive: 0x1c4f9c,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.2,
        patches: [
            {
                u0: -0.55,
                u1: 0.55,
                from: 0.545,
                to: 0.575,
                lift: 0.005,
                sink: -0.010,
                uSegments: 8,
                vSegments: 2,
            },
            {
                u0: Math.PI - 0.55,
                u1: Math.PI + 0.55,
                from: 0.545,
                to: 0.575,
                lift: 0.005,
                sink: -0.010,
                uSegments: 8,
                vSegments: 2,
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
};
const DRUNKARD_TRIM_BASE = BLOCKOUT_COLOURS.machineDrunkardTrim;
const DRUNKARD_TRIM_AMBER = tintOver(DRUNKARD_TRIM_BASE, BLOCKOUT_COLOURS.machineDrunkardAmber);
const DRUNKARD_CAVITY = [0.30, 0.30, 0.32];
const DRUNKARD_PAD_RINGS = Object.freeze([
    [-1.00, 0.34, 0.68, 2.4],
    [-0.80, 0.92, 0.87, 2.9],
    [-0.22, 1.00, 1.00, 3.2],
    [0.16, 0.97, 0.99, 3.2],
    [0.55, 0.86, 0.93, 2.9],
    [0.86, 0.60, 0.78, 2.6],
    [1.00, 0.30, 0.62, 2.3],
].map(([t, thick, length, square]) => ({
    y: t * (WHEEL.padHeight / 2),
    halfWidth: WHEEL.padThickness * 0.8 * thick,
    halfDepth: (WHEEL.padLength / 2) * length,
    square,
})));
const DRUNKARD_PAD_SEGMENTS = 12;
const DRUNKARD_MACHINE_LAYOUT = Object.freeze({
    pad: loftProfile(DRUNKARD_PAD_RINGS.map((ring) => ({ ...ring }))),
    segments: DRUNKARD_PAD_SEGMENTS,
});
const DRUNKARD_SHOULDER_SPLIT = 0.30;
const DRUNKARD_SHOULDER_REAR = -1.05;
const DRUNKARD_SHOULDER_NOSE = 1.10;
const DRUNKARD_SHOULDER = { from: 0.545, to: 0.575 };
function drunkardFlank(mirror) {
    const span = (u0, u1) => (mirror ? { u0: Math.PI - u1, u1: Math.PI - u0 } : { u0, u1 });
    return [
        {
            ...span(DRUNKARD_SHOULDER_REAR, DRUNKARD_SHOULDER_SPLIT),
            ...DRUNKARD_SHOULDER,
            lift: 0.005,
            sink: -0.010,
            uSegments: 8,
            vSegments: 3,
        },
        {
            ...span(DRUNKARD_SHOULDER_SPLIT, DRUNKARD_SHOULDER_NOSE),
            ...DRUNKARD_SHOULDER,
            lift: 0.005,
            sink: -0.010,
            uSegments: 6,
            vSegments: 3,
            tint: DRUNKARD_TRIM_AMBER,
        },
        {
            ...span(DRUNKARD_SHOULDER_REAR, 0.96),
            from: 0.286,
            to: 0.350,
            lift: 0.006,
            sink: -0.010,
            uSegments: 10,
            vSegments: 3,
        },
        {
            ...span(0.62, 0.96),
            from: 0.350,
            to: 0.500,
            lift: 0.006,
            sink: -0.010,
            uSegments: 4,
            vSegments: 4,
        },
    ];
}
export const DRUNKARD_MACHINE_LOOK = {
    machine: 'drunkard',
    shell: {
        colour: BLOCKOUT_COLOURS.machineDrunkard,
        roughness: 0.48,
    },
    top: { kind: 'handle' },
    pads: {
        colour: DRUNKARD_TRIM_BASE,
        roughness: 0.72,
        blocks: [DRUNKARD_PAD_RINGS],
        art: 'pads',
        segments: DRUNKARD_PAD_SEGMENTS,
    },
    atlas: {
        paintInput: () => ({ cache: 'drunkardMachineAtlas.ts', args: [DRUNKARD_MACHINE_LAYOUT] }),
        build: () => createDrunkardMachineAtlas(DRUNKARD_MACHINE_LAYOUT),
        region: drunkardMachineRegion,
    },
    trim: {
        colour: DRUNKARD_TRIM_BASE,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.58,
        metalness: 0.06,
        patches: [
            ...drunkardFlank(false),
            ...drunkardFlank(true),
            {
                u0: Math.PI / 2 + 0.12,
                u1: Math.PI / 2 + 0.58,
                from: 0.395,
                to: 0.485,
                lift: 0.006,
                sink: -0.010,
                uSegments: 4,
                vSegments: 4,
                taper: 0.30,
                tint: DRUNKARD_TRIM_AMBER,
            },
            {
                u0: Math.PI / 2 - 0.58,
                u1: Math.PI / 2 - 0.12,
                from: 0.395,
                to: 0.485,
                lift: 0.006,
                sink: -0.010,
                uSegments: 4,
                vSegments: 4,
                taper: 0.30,
                tint: DRUNKARD_TRIM_AMBER,
            },
        ],
    },
    headlight: {
        patches: STANDARD_MACHINE_LOOK.headlight.patches,
        emissive: BLOCKOUT_COLOURS.headlight,
        emissiveIntensity: 1.4,
    },
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            if (z > 0.16 && Math.abs(x) < 0.075 && y > 0.390 && y < 0.540) {
                colour.setXYZ(i, DRUNKARD_CAVITY[0], DRUNKARD_CAVITY[1], DRUNKARD_CAVITY[2]);
                continue;
            }
            if (z < -0.15 && Math.abs(x) < 0.075 && y > 0.400) {
                colour.setXYZ(i, DRUNKARD_CAVITY[0], DRUNKARD_CAVITY[1], DRUNKARD_CAVITY[2]);
            }
        }
    },
    paintPedal: (geometry) => {
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < colour.count; i += 1) {
            colour.setXYZ(i, colour.getX(i) * 0.20, colour.getY(i) * 0.185, colour.getZ(i) * 0.16);
        }
    },
};
