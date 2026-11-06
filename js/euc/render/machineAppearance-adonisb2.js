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
const ADONISB2_NOSE_HALF_WIDTH = 0.114;
const ADONISB2_NOSE_SQUARE = 4.6;
function adonisb2NosePhi(x) {
    const t = Math.min(1, Math.abs(x) / ADONISB2_NOSE_HALF_WIDTH) ** (ADONISB2_NOSE_SQUARE / 2);
    return Math.asin(t);
}
function adonisb2NoseU(x, side) {
    return Math.PI / 2 + side * adonisb2NosePhi(x);
}
function adonisb2NosePair({ inner, outer, ...rest }) {
    const skew = rest.skew ?? 0;
    return [
        { ...rest, u0: adonisb2NoseU(outer, -1), u1: adonisb2NoseU(inner, -1), skew },
        { ...rest, u0: adonisb2NoseU(inner, 1), u1: adonisb2NoseU(outer, 1), skew: -skew },
    ];
}
function adonisb2NoseSpan({ half, ...rest }) {
    return { ...rest, u0: adonisb2NoseU(half, -1), u1: adonisb2NoseU(half, 1) };
}
const ADONISB2_TRIM = BLOCKOUT_COLOURS.machineAdonisb2Trim;
const ADONISB2_TRIM_GREEN = tintOver(ADONISB2_TRIM, BLOCKOUT_COLOURS.machineAdonisb2Green);
const ADONISB2_TRIM_BLUE = tintOver(ADONISB2_TRIM, BLOCKOUT_COLOURS.machineAdonisb2Blue);
const ADONISB2_TRIM_TEAL = tintOver(ADONISB2_TRIM, BLOCKOUT_COLOURS.machineAdonisb2Teal);
const ADONISB2_INK = 0.010;
const ADONISB2_IRIS = 0.30;
const ADONISB2_STRUCTURE = 0.075;
const ADONISB2_NOSE_RING = 0.040;
const ADONISB2_EYE = Object.freeze({
    sclera: Object.freeze({ inner: 0.009, outer: 0.058, from: 0.496, to: 0.538 }),
    iris: Object.freeze({ inner: 0.022, outer: 0.046, from: 0.507, to: 0.535 }),
    pupil: Object.freeze({ inner: 0.027, outer: 0.039, from: 0.510, to: 0.526 }),
    lash: Object.freeze({ inner: 0.008, outer: 0.061, from: 0.532, to: 0.538 }),
});
const ADONISB2_BROW = Object.freeze({
    inner: 0.001, outer: 0.008, from: 0.550, to: 0.554, skew: -0.50,
});
const ADONISB2_EYE_LOW = adonisb2NosePhi(ADONISB2_EYE.sclera.inner);
const ADONISB2_EYE_HIGH = adonisb2NosePhi(ADONISB2_EYE.sclera.outer);
const ADONISB2_EYE_MID = (ADONISB2_EYE_LOW + ADONISB2_EYE_HIGH) / 2;
const ADONISB2_EYE_TILT = 0.50 / (ADONISB2_EYE_HIGH - ADONISB2_EYE_LOW);
function adonisb2EyePatch(part, rest) {
    const low = adonisb2NosePhi(part.inner);
    const high = adonisb2NosePhi(part.outer);
    const rise = ADONISB2_EYE_TILT * ((low + high) / 2 - ADONISB2_EYE_MID) * ADONISB2_NOSE_RING;
    return {
        ...rest,
        inner: part.inner,
        outer: part.outer,
        from: part.from + rise,
        to: part.to + rise,
        skew: -ADONISB2_EYE_TILT * (high - low),
    };
}
const ADONISB2_CORE = [0.60, 0.60, 0.62];
const ADONISB2_CAVITY = [0.26, 0.26, 0.28];
const ADONISB2_EDGE = [1.28, 1.28, 1.30];
const ADONISB2_SEAT = tintOver(BLOCKOUT_COLOURS.machineAdonisb2, 0x141519);
const ADONISB2_SEAT_BOTTOM = 0.556;
export const ADONISB2_MACHINE_LOOK = {
    machine: 'adonisb2',
    shell: {
        colour: BLOCKOUT_COLOURS.machineAdonisb2,
        roughness: 0.52,
        profile: [
            { y: 0.250, halfWidth: 0.050, halfDepth: 0.120, square: 3.2 },
            { y: 0.322, halfWidth: 0.086, halfDepth: 0.188, square: 4.0 },
            { y: 0.378, halfWidth: 0.112, halfDepth: 0.226, square: 4.6 },
            { y: 0.418, halfWidth: 0.114, halfDepth: 0.230, square: 4.6 },
            { y: 0.458, halfWidth: 0.114, halfDepth: 0.230, square: 4.6 },
            { y: 0.498, halfWidth: 0.114, halfDepth: 0.229, square: 4.6 },
            { y: 0.538, halfWidth: 0.112, halfDepth: 0.226, square: 4.6 },
            { y: 0.578, halfWidth: 0.098, halfDepth: 0.196, square: 4.2 },
            { y: 0.598, halfWidth: 0.072, halfDepth: 0.146, square: 3.4 },
        ],
    },
    top: {
        kind: 'saddle',
        profile: [
            { y: ADONISB2_SEAT_BOTTOM, halfWidth: 0.044, halfDepth: 0.126, square: 3.6 },
            { y: 0.598, halfWidth: 0.052, halfDepth: 0.148, square: 3.8 },
            { y: 0.620, halfWidth: 0.078, halfDepth: 0.196, z: -0.012, square: 4.4 },
            { y: 0.638, halfWidth: 0.082, halfDepth: 0.204, z: -0.026, square: 4.8 },
            { y: 0.649, halfWidth: 0.058, halfDepth: 0.162, z: -0.042, square: 3.8 },
        ],
        tint: ADONISB2_SEAT,
    },
    tyre: {
        lugs: {
            count: 18,
            rows: [
                { at: -0.62, phase: 0 },
                { at: 0, phase: 0.5 },
                { at: 0.62, phase: 0 },
            ],
            size: [0.048, 0.016, 0.022],
            shade: 2.4,
        },
    },
    trim: {
        colour: ADONISB2_TRIM,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.38,
        metalness: 0.08,
        patches: [
            adonisb2NoseSpan({
                half: 0.066,
                from: 0.454,
                to: 0.566,
                lift: 0.026,
                sink: -0.010,
                uSegments: 6,
                vSegments: 4,
                tint: ADONISB2_TRIM_GREEN,
            }),
            ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.sclera, {
                lift: 0.030,
                sink: 0.010,
                uSegments: 4,
                vSegments: 2,
            })),
            ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.iris, {
                lift: 0.032,
                sink: 0.012,
                uSegments: 3,
                vSegments: 2,
                shade: ADONISB2_IRIS,
            })),
            ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.pupil, {
                lift: 0.035,
                sink: 0.014,
                uSegments: 2,
                vSegments: 1,
                shade: ADONISB2_INK,
            })),
            ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.lash, {
                lift: 0.034,
                sink: 0.020,
                uSegments: 4,
                vSegments: 1,
                shade: ADONISB2_INK,
            })),
            ...adonisb2NosePair({
                ...ADONISB2_BROW,
                lift: 0.030,
                sink: 0.020,
                uSegments: 2,
                vSegments: 1,
                shade: ADONISB2_INK,
            }),
            adonisb2NoseSpan({
                half: 0.016,
                from: 0.454,
                to: 0.470,
                lift: 0.028,
                sink: 0.014,
                uSegments: 2,
                vSegments: 1,
                shade: ADONISB2_INK,
            }),
            ...[0.378, 0.398, 0.418].flatMap((base) => adonisb2NosePair({
                inner: 0.002,
                outer: 0.020,
                from: base,
                to: base + 0.010,
                lift: 0.010,
                sink: -0.006,
                uSegments: 2,
                vSegments: 1,
                skew: -0.20,
                tint: ADONISB2_TRIM_BLUE,
            })),
            ...adonisb2NosePair({
                inner: 0.022,
                outer: 0.064,
                from: 0.344,
                to: 0.362,
                lift: 0.012,
                sink: -0.008,
                uSegments: 3,
                vSegments: 1,
                tint: ADONISB2_TRIM_GREEN,
            }),
            ...adonisb2NosePair({
                inner: 0.074,
                outer: 0.092,
                from: 0.354,
                to: 0.366,
                lift: 0.011,
                sink: -0.008,
                uSegments: 2,
                vSegments: 1,
                tint: ADONISB2_TRIM_TEAL,
            }),
            {
                u0: -0.62,
                u1: 0.62,
                from: 0.544,
                to: 0.566,
                lift: 0.010,
                sink: -0.010,
                uSegments: 8,
                vSegments: 1,
                tint: ADONISB2_TRIM_GREEN,
            },
            {
                u0: Math.PI - 0.62,
                u1: Math.PI + 0.62,
                from: 0.544,
                to: 0.566,
                lift: 0.010,
                sink: -0.010,
                uSegments: 8,
                vSegments: 1,
                tint: ADONISB2_TRIM_GREEN,
            },
            {
                u0: -Math.PI / 2 + 0.28,
                u1: -Math.PI / 2 + 0.62,
                from: 0.372,
                to: 0.556,
                lift: 0.012,
                sink: -0.010,
                uSegments: 3,
                vSegments: 5,
                taper: 0.10,
                shade: ADONISB2_STRUCTURE,
            },
            {
                u0: -Math.PI / 2 - 0.62,
                u1: -Math.PI / 2 - 0.28,
                from: 0.372,
                to: 0.556,
                lift: 0.012,
                sink: -0.010,
                uSegments: 3,
                vSegments: 5,
                taper: 0.10,
                shade: ADONISB2_STRUCTURE,
            },
        ],
    },
    headlight: {
        patches: [
            ...adonisb2NosePair({
                inner: 0.024,
                outer: 0.062,
                from: 0.372,
                to: 0.436,
                lift: 0.008,
                sink: -0.014,
                uSegments: 3,
                vSegments: 4,
            }),
        ],
        emissive: BLOCKOUT_COLOURS.headlight,
        emissiveIntensity: 1.2,
    },
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            if (y > 0.599
                || (y > ADONISB2_SEAT_BOTTOM && Math.abs(x) < 0.062 && Math.abs(z) < 0.160)) {
                colour.setXYZ(i, ADONISB2_SEAT[0], ADONISB2_SEAT[1], ADONISB2_SEAT[2]);
                continue;
            }
            if (z > 0.16 && Math.abs(x) < 0.075 && y > 0.360 && y < 0.470) {
                colour.setXYZ(i, ADONISB2_CAVITY[0], ADONISB2_CAVITY[1], ADONISB2_CAVITY[2]);
                continue;
            }
            if (z < -0.15 && Math.abs(x) < 0.075 && y > 0.400) {
                colour.setXYZ(i, ADONISB2_CAVITY[0], ADONISB2_CAVITY[1], ADONISB2_CAVITY[2]);
                continue;
            }
            if (y < 0.336) {
                colour.setXYZ(i, ADONISB2_CORE[0], ADONISB2_CORE[1], ADONISB2_CORE[2]);
                continue;
            }
            if (y > 0.560) {
                colour.setXYZ(i, ADONISB2_EDGE[0], ADONISB2_EDGE[1], ADONISB2_EDGE[2]);
            }
        }
    },
    paintPedal: (geometry) => {
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < colour.count; i += 1) {
            colour.setXYZ(i, colour.getX(i) * 0.11, colour.getY(i) * 0.11, colour.getZ(i) * 0.115);
        }
    },
};
