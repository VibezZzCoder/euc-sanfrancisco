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
const CORE = [0.045, 0.30, 0.33];
const CAVITY = [0.028, 0.19, 0.21];
const RED_STEEL = [2.1, 0.16, 0.18];
export const RED_RIDER_MACHINE_LOOK = {
    machine: 'red-rider',
    shell: {
        colour: BLOCKOUT_COLOURS.machineRed,
        roughness: 0.42,
        profile: [
            { y: 0.250, halfWidth: 0.052, halfDepth: 0.125, square: 3.0 },
            { y: 0.330, halfWidth: 0.096, halfDepth: 0.185, square: 3.8 },
            { y: 0.430, halfWidth: 0.110, halfDepth: 0.215, square: 4.2 },
            { y: 0.520, halfWidth: 0.108, halfDepth: 0.215, square: 4.4 },
            { y: 0.565, halfWidth: 0.098, halfDepth: 0.195, square: 4.0 },
            { y: 0.595, halfWidth: 0.080, halfDepth: 0.160, square: 3.6 },
        ],
    },
    top: {
        kind: 'saddle',
        profile: [
            { y: 0.578, halfWidth: 0.048, halfDepth: 0.124, square: 3.6 },
            { y: 0.596, halfWidth: 0.068, halfDepth: 0.162, square: 4.2 },
            { y: 0.626, halfWidth: 0.064, halfDepth: 0.156, z: -0.010, square: 4.4 },
            { y: 0.650, halfWidth: 0.050, halfDepth: 0.128, z: -0.020, square: 3.6 },
        ],
        tint: [0.05, 0.30, 0.34],
    },
    trim: {
        colour: BLOCKOUT_COLOURS.machineTrimRed,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.30,
        metalness: 0.15,
        patches: [
            {
                u0: Math.PI / 2 - 0.66,
                u1: Math.PI / 2 + 0.66,
                from: 0.548,
                to: 0.582,
                lift: 0.011,
                sink: -0.010,
                uSegments: 8,
                vSegments: 2,
                taper: 0.22,
            },
            {
                u0: Math.PI / 2 + 0.26,
                u1: Math.PI / 2 + 0.62,
                from: 0.292,
                to: 0.552,
                lift: 0.012,
                sink: -0.010,
                uSegments: 3,
                vSegments: 7,
                taper: 0.08,
            },
            {
                u0: Math.PI / 2 - 0.62,
                u1: Math.PI / 2 - 0.26,
                from: 0.292,
                to: 0.552,
                lift: 0.012,
                sink: -0.010,
                uSegments: 3,
                vSegments: 7,
                taper: 0.08,
            },
            {
                u0: -Math.PI / 2 + 0.30,
                u1: -Math.PI / 2 + 0.62,
                from: 0.292,
                to: 0.574,
                lift: 0.012,
                sink: -0.010,
                uSegments: 3,
                vSegments: 7,
                taper: 0.08,
            },
            {
                u0: -Math.PI / 2 - 0.62,
                u1: -Math.PI / 2 - 0.30,
                from: 0.292,
                to: 0.574,
                lift: 0.012,
                sink: -0.010,
                uSegments: 3,
                vSegments: 7,
                taper: 0.08,
            },
            {
                u0: -0.30,
                u1: 0.30,
                from: 0.548,
                to: 0.580,
                lift: 0.009,
                sink: -0.010,
                uSegments: 4,
                vSegments: 2,
            },
            {
                u0: Math.PI - 0.30,
                u1: Math.PI + 0.30,
                from: 0.548,
                to: 0.580,
                lift: 0.009,
                sink: -0.010,
                uSegments: 4,
                vSegments: 2,
            },
            {
                surface: 'pad',
                u0: -0.70,
                u1: -0.48,
                from: -0.090,
                to: 0.090,
                lift: 0.010,
                sink: -0.008,
                uSegments: 2,
                vSegments: 5,
                taper: 0.08,
            },
            {
                surface: 'pad',
                u0: 0.48,
                u1: 0.70,
                from: -0.090,
                to: 0.090,
                lift: 0.010,
                sink: -0.008,
                uSegments: 2,
                vSegments: 5,
                taper: 0.08,
            },
            {
                surface: 'pad',
                u0: -0.55,
                u1: 0.55,
                from: -0.048,
                to: 0.048,
                lift: 0.010,
                sink: -0.008,
                uSegments: 4,
                vSegments: 3,
            },
            {
                surface: 'pad',
                u0: -0.34,
                u1: 0.34,
                from: -0.002,
                to: 0.024,
                lift: 0.014,
                sink: -0.006,
                uSegments: 3,
                vSegments: 1,
                shade: 0.45,
            },
            { surface: 'pad', u0: -0.50, u1: -0.40, from: 0.028, to: 0.040, lift: 0.016, sink: -0.006, shade: 0.30 },
            { surface: 'pad', u0: 0.40, u1: 0.50, from: 0.028, to: 0.040, lift: 0.016, sink: -0.006, shade: 0.30 },
            { surface: 'pad', u0: -0.50, u1: -0.40, from: -0.040, to: -0.028, lift: 0.016, sink: -0.006, shade: 0.30 },
            { surface: 'pad', u0: 0.40, u1: 0.50, from: -0.040, to: -0.028, lift: 0.016, sink: -0.006, shade: 0.30 },
        ],
    },
    headlight: {
        patches: [{
                u0: Math.PI / 2 - 0.13,
                u1: Math.PI / 2 + 0.13,
                from: 0.497,
                to: 0.537,
                lift: 0.006,
                sink: -0.014,
                uSegments: 6,
                vSegments: 2,
                taper: 0.55,
            }],
        emissive: BLOCKOUT_COLOURS.machineHeadlightCool,
        emissiveIntensity: 1.9,
    },
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            if (y > 0.578) {
                colour.setXYZ(i, 0.05, 0.30, 0.34);
                continue;
            }
            if (y < 0.372) {
                colour.setXYZ(i, CORE[0], CORE[1], CORE[2]);
                continue;
            }
            if (Math.abs(z) < 0.13 && Math.abs(x) > 0.06 && y < 0.548) {
                colour.setXYZ(i, CORE[0], CORE[1], CORE[2]);
                continue;
            }
            if (z > 0.16 && Math.abs(x) < 0.062 && y > 0.490 && y < 0.545) {
                colour.setXYZ(i, CAVITY[0], CAVITY[1], CAVITY[2]);
                continue;
            }
            if (z < -0.15 && Math.abs(x) < 0.07 && y > 0.400) {
                colour.setXYZ(i, CAVITY[0], CAVITY[1], CAVITY[2]);
            }
        }
    },
    paintPedal: (geometry, side) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const y = position.getY(i);
            const inboard = position.getX(i) * -side;
            if (y > 0.015 || inboard > 0.0675) {
                colour.setXYZ(i, RED_STEEL[0], RED_STEEL[1], RED_STEEL[2]);
            }
        }
    },
};
