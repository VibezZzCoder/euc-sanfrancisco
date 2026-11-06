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
import { loftProfile, tintOver } from './blockoutKit.js';
import { createWimMachineAtlas, wimMachineRegion } from './wimMachineAtlas.js';
const WIM_TRIM_BASE = BLOCKOUT_COLOURS.machineWheelInMotionTrim;
const WIM_TRIM_ORANGE = tintOver(WIM_TRIM_BASE, BLOCKOUT_COLOURS.wheelInMotionOrange);
const WIM_TRIM_BLUE = tintOver(WIM_TRIM_BASE, BLOCKOUT_COLOURS.machineWheelInMotionBlue);
const WIM_TRIM_LOUVRE = tintOver(WIM_TRIM_BASE, 0x0c6ea4);
const WIM_LOUVRES = Object.freeze([
    ...[[-Math.PI / 2 + 0.36, -Math.PI / 2 + 0.66], [-Math.PI / 2 - 0.66, -Math.PI / 2 - 0.36]].flatMap(([u0, u1]) => ([0.420, 0.454, 0.526].map((from) => ({
        u0, u1, from, to: from + 0.014, lift: 0.016, sink: -0.008, uSegments: 2, vSegments: 1, tint: WIM_TRIM_LOUVRE,
    })))),
    ...[[Math.PI / 2 + 0.38, Math.PI / 2 + 0.66], [Math.PI / 2 - 0.66, Math.PI / 2 - 0.38]].flatMap(([u0, u1]) => ([0.372, 0.406, 0.440].map((from) => ({
        u0, u1, from, to: from + 0.014, lift: 0.016, sink: -0.008, uSegments: 2, vSegments: 1, tint: WIM_TRIM_LOUVRE,
    })))),
]);
const WIM_DECK = tintOver(BLOCKOUT_COLOURS.machineWheelInMotion, 0x121317);
const WIM_CORE = [1.85, 1.85, 1.90];
const WIM_CAVITY = [0.28, 0.28, 0.30];
const WIM_EDGE = [1.30, 1.30, 1.32];
const WIM_DECK_BOTTOM = 0.596;
const WIM_SHELL_RINGS = Object.freeze([
    { y: 0.250, halfWidth: 0.052, halfDepth: 0.130, square: 3.0 },
    { y: 0.318, halfWidth: 0.098, halfDepth: 0.216, square: 3.8 },
    { y: 0.372, halfWidth: 0.114, halfDepth: 0.254, square: 4.6 },
    { y: 0.428, halfWidth: 0.116, halfDepth: 0.262, square: 5.2 },
    { y: 0.488, halfWidth: 0.116, halfDepth: 0.262, square: 5.2 },
    { y: 0.500, halfWidth: 0.116, halfDepth: 0.262, square: 5.2 },
    { y: 0.508, halfWidth: 0.112, halfDepth: 0.254, square: 4.8 },
    { y: 0.545, halfWidth: 0.112, halfDepth: 0.254, square: 4.8 },
    { y: 0.575, halfWidth: 0.112, halfDepth: 0.254, square: 4.8 },
    { y: 0.592, halfWidth: 0.088, halfDepth: 0.192, square: 3.6 },
    { y: 0.604, halfWidth: 0.070, halfDepth: 0.150, square: 3.0 },
]);
const WIM_MACHINE_PLATE = Object.freeze({ u0: 0.005, u1: 0.45, from: 0.512, to: 0.572 });
const WIM_PAD_TOP = 0.062;
const WIM_PAD_RINGS = Object.freeze([
    { y: -0.098, halfWidth: 0.016, halfDepth: 0.150, square: 3.4 },
    { y: -0.084, halfWidth: 0.027, halfDepth: 0.168, square: 4.0 },
    { y: 0.000, halfWidth: 0.028, halfDepth: 0.170, square: 4.2 },
    { y: 0.050, halfWidth: 0.027, halfDepth: 0.166, square: 4.0 },
    { y: WIM_PAD_TOP, halfWidth: 0.016, halfDepth: 0.146, square: 3.4 },
]);
const WIM_MACHINE_LAYOUT = Object.freeze({
    shell: loftProfile(WIM_SHELL_RINGS.map((ring) => ({ ...ring }))),
    plate: WIM_MACHINE_PLATE,
    pad: loftProfile(WIM_PAD_RINGS.map((ring) => ({ ...ring }))),
});
export const WHEEL_IN_MOTION_MACHINE_LOOK = {
    machine: 'wheel-in-motion',
    shell: {
        colour: BLOCKOUT_COLOURS.machineWheelInMotion,
        roughness: 0.50,
        profile: WIM_SHELL_RINGS,
    },
    top: {
        kind: 'saddle',
        profile: [
            { y: WIM_DECK_BOTTOM, halfWidth: 0.064, halfDepth: 0.158, square: 4.8 },
            { y: 0.610, halfWidth: 0.074, halfDepth: 0.176, square: 5.6 },
            { y: 0.618, halfWidth: 0.058, halfDepth: 0.146, square: 4.4 },
        ],
        tint: WIM_DECK,
    },
    pads: {
        colour: BLOCKOUT_COLOURS.machineWheelInMotionTrim,
        roughness: 0.62,
        blocks: [WIM_PAD_RINGS],
        art: 'pads',
        segments: 16,
        paintPad: (geometry) => {
            const position = geometry.getAttribute('position');
            const colour = geometry.getAttribute('color');
            for (let i = 0; i < position.count; i += 1) {
                const y = position.getY(i);
                const lift = y > 0.052 ? 1.24 : y < -0.086 ? 0.66 : 1;
                if (lift === 1)
                    continue;
                colour.setXYZ(i, colour.getX(i) * lift, colour.getY(i) * lift, colour.getZ(i) * lift);
            }
        },
    },
    atlas: {
        paintInput: () => ({ cache: 'wimMachineAtlas.ts', args: [WIM_MACHINE_LAYOUT] }),
        build: () => createWimMachineAtlas(WIM_MACHINE_LAYOUT),
        region: wimMachineRegion,
    },
    tyre: {
        roughness: 0.90,
    },
    trim: {
        colour: WIM_TRIM_BASE,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.58,
        metalness: 0.06,
        patches: [
            {
                u0: WIM_MACHINE_PLATE.u0,
                u1: WIM_MACHINE_PLATE.u1,
                from: WIM_MACHINE_PLATE.from,
                to: WIM_MACHINE_PLATE.to,
                lift: 0.004,
                sink: -0.014,
                uSegments: 8,
                vSegments: 6,
                uByArc: true,
                art: 'plate',
            },
            {
                u0: Math.PI - WIM_MACHINE_PLATE.u1,
                u1: Math.PI - WIM_MACHINE_PLATE.u0,
                from: WIM_MACHINE_PLATE.from,
                to: WIM_MACHINE_PLATE.to,
                lift: 0.004,
                sink: -0.014,
                uSegments: 8,
                vSegments: 6,
                uByArc: true,
                art: 'plate',
            },
            {
                u0: -0.62,
                u1: -0.02,
                from: 0.510,
                to: 0.580,
                lift: 0.010,
                sink: -0.008,
                uSegments: 4,
                vSegments: 3,
                taper: 0.06,
                tint: WIM_TRIM_BLUE,
            },
            {
                u0: Math.PI + 0.02,
                u1: Math.PI + 0.62,
                from: 0.510,
                to: 0.580,
                lift: 0.010,
                sink: -0.008,
                uSegments: 4,
                vSegments: 3,
                taper: 0.06,
                tint: WIM_TRIM_BLUE,
            },
            {
                u0: -Math.PI / 2 + 0.30,
                u1: -Math.PI / 2 + 0.72,
                from: 0.400,
                to: 0.560,
                lift: 0.012,
                sink: -0.010,
                uSegments: 4,
                vSegments: 6,
                taper: 0.08,
                tint: WIM_TRIM_BLUE,
            },
            {
                u0: -Math.PI / 2 - 0.72,
                u1: -Math.PI / 2 - 0.30,
                from: 0.400,
                to: 0.560,
                lift: 0.012,
                sink: -0.010,
                uSegments: 4,
                vSegments: 6,
                taper: 0.08,
                tint: WIM_TRIM_BLUE,
            },
            {
                u0: Math.PI / 2 + 0.32,
                u1: Math.PI / 2 + 0.72,
                from: 0.262,
                to: 0.496,
                lift: 0.012,
                sink: -0.010,
                uSegments: 4,
                vSegments: 6,
                taper: 0.08,
                tint: WIM_TRIM_BLUE,
            },
            {
                u0: Math.PI / 2 - 0.72,
                u1: Math.PI / 2 - 0.32,
                from: 0.262,
                to: 0.496,
                lift: 0.012,
                sink: -0.010,
                uSegments: 4,
                vSegments: 6,
                taper: 0.08,
                tint: WIM_TRIM_BLUE,
            },
            ...WIM_LOUVRES,
            {
                u0: Math.PI / 2 - 0.30,
                u1: Math.PI / 2 + 0.30,
                from: 0.430,
                to: 0.468,
                lift: 0.040,
                sink: -0.010,
                uSegments: 6,
                vSegments: 2,
                taper: 0.55,
                tint: WIM_TRIM_ORANGE,
            },
            {
                u0: -Math.PI / 2 + 0.32,
                u1: -Math.PI / 2 + 0.72,
                from: 0.262,
                to: 0.392,
                lift: 0.036,
                sink: -0.010,
                uSegments: 4,
                vSegments: 4,
                taper: 0.45,
                tint: WIM_TRIM_ORANGE,
            },
            {
                u0: -Math.PI / 2 - 0.72,
                u1: -Math.PI / 2 - 0.32,
                from: 0.262,
                to: 0.392,
                lift: 0.036,
                sink: -0.010,
                uSegments: 4,
                vSegments: 4,
                taper: 0.45,
                tint: WIM_TRIM_ORANGE,
            },
            {
                u0: -Math.PI / 2 + 0.30,
                u1: -Math.PI / 2 + 0.72,
                from: 0.560,
                to: 0.596,
                lift: 0.036,
                sink: -0.010,
                uSegments: 4,
                vSegments: 3,
                taper: 0.50,
                tint: WIM_TRIM_ORANGE,
            },
            {
                u0: -Math.PI / 2 - 0.72,
                u1: -Math.PI / 2 - 0.30,
                from: 0.560,
                to: 0.596,
                lift: 0.036,
                sink: -0.010,
                uSegments: 4,
                vSegments: 3,
                taper: 0.50,
                tint: WIM_TRIM_ORANGE,
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
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            if (y > 0.605
                || (y > WIM_DECK_BOTTOM && Math.abs(x) < 0.066 && Math.abs(z) < 0.160)) {
                colour.setXYZ(i, WIM_DECK[0], WIM_DECK[1], WIM_DECK[2]);
                continue;
            }
            if (z > 0.16 && Math.abs(x) < 0.075 && y > 0.494 && y < 0.540) {
                colour.setXYZ(i, WIM_CAVITY[0], WIM_CAVITY[1], WIM_CAVITY[2]);
                continue;
            }
            if (z < -0.15 && Math.abs(x) < 0.075 && y > 0.400) {
                colour.setXYZ(i, WIM_CAVITY[0], WIM_CAVITY[1], WIM_CAVITY[2]);
                continue;
            }
            if (y < 0.336) {
                colour.setXYZ(i, WIM_CORE[0], WIM_CORE[1], WIM_CORE[2]);
                continue;
            }
            if (y > 0.574) {
                colour.setXYZ(i, WIM_EDGE[0], WIM_EDGE[1], WIM_EDGE[2]);
            }
        }
    },
    paintPedal: (geometry) => {
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < colour.count; i += 1) {
            colour.setXYZ(i, colour.getX(i) * 0.16, colour.getY(i) * 0.16, colour.getZ(i) * 0.165);
        }
    },
};
