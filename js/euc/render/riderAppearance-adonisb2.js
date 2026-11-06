// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.js';
import { limbProfile, loftGeometry, loftProfile, mergeGeometries, tintOver } from './blockoutKit.js';
const TORSO_HALF_WIDTH = RIDER_BLOCKOUT.torsoWidth / 2;
const TORSO_HALF_DEPTH = RIDER_BLOCKOUT.torsoDepth / 2;
const JACKET = loftProfile([
    { y: -0.010, halfWidth: 1.03 * TORSO_HALF_WIDTH, halfDepth: 1.01 * TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.018, halfWidth: 0.98 * TORSO_HALF_WIDTH, halfDepth: 0.96 * TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.050, halfWidth: 0.90 * TORSO_HALF_WIDTH, halfDepth: 0.93 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: 0.155, halfWidth: 0.86 * TORSO_HALF_WIDTH, halfDepth: 0.87 * TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.290, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 1.01 * TORSO_HALF_DEPTH, square: 2.6, z: 0.008 },
    { y: 0.400, halfWidth: 1.00 * TORSO_HALF_WIDTH, halfDepth: 0.98 * TORSO_HALF_DEPTH, square: 2.9, z: 0.006 },
    { y: 0.470, halfWidth: 1.00 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 3.1, z: 0.002 },
    { y: 0.500, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.82 * TORSO_HALF_DEPTH, square: 2.9 },
    { y: 0.528, halfWidth: 0.74 * TORSO_HALF_WIDTH, halfDepth: 0.66 * TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.548, halfWidth: 0.44 * TORSO_HALF_WIDTH, halfDepth: 0.50 * TORSO_HALF_DEPTH, square: 2.3 },
]);
const SEAT = loftProfile([
    { y: -0.088, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.80 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
]);
const UPPER_ARM = limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.058, 0.050, 0.043], [0.55], {
    flatten: 0.95,
    square: 2.3,
});
const FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.047, 0.041, 0.033], [0.45], {
    flatten: 0.94,
    square: 2.3,
});
const NECK = loftProfile([
    { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
    { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
    { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
    { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
]);
const HELMET = loftProfile([
    { y: 0.088, halfWidth: 0.070, halfDepth: 0.080, square: 2.3, z: 0.012 },
    { y: 0.118, halfWidth: 0.104, halfDepth: 0.116, square: 2.5, z: 0.012 },
    { y: 0.158, halfWidth: 0.119, halfDepth: 0.130, square: 2.6, z: 0.008 },
    { y: 0.215, halfWidth: 0.124, halfDepth: 0.133, square: 2.5, z: 0.004 },
    { y: 0.268, halfWidth: 0.113, halfDepth: 0.119, square: 2.3 },
    { y: 0.308, halfWidth: 0.084, halfDepth: 0.088, square: 2.2 },
    { y: 0.336, halfWidth: 0.040, halfDepth: 0.042, square: 2.2 },
    { y: 0.348, halfWidth: 0, halfDepth: 0 },
]);
const BOOT = loftProfile([
    { y: -0.098, halfWidth: 0.030, halfDepth: 0.026, square: 2.4 },
    { y: -0.080, halfWidth: 0.052, halfDepth: 0.040, square: 2.7 },
    { y: -0.035, halfWidth: 0.062, halfDepth: 0.047, square: 2.9 },
    { y: 0.020, halfWidth: 0.064, halfDepth: 0.040, square: 2.9 },
    { y: 0.082, halfWidth: 0.060, halfDepth: 0.031, square: 2.9 },
    { y: 0.122, halfWidth: 0.043, halfDepth: 0.022, square: 2.6 },
    { y: 0.142, halfWidth: 0.014, halfDepth: 0.009, square: 2.4 },
]);
const BOOT_SOLE = loftProfile([
    { y: -0.018, halfWidth: 0.060, halfDepth: RIDER_BLOCKOUT.bootLength * 0.44, square: 4.2 },
    { y: -0.003, halfWidth: 0.065, halfDepth: RIDER_BLOCKOUT.bootLength * 0.47, square: 5.2 },
    { y: 0, halfWidth: 0.062, halfDepth: RIDER_BLOCKOUT.bootLength * 0.45, square: 4.6 },
]);
const FULL_GLOVE = loftProfile([
    { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
    { y: -0.016, halfWidth: 0.042, halfDepth: 0.036, square: 2.8 },
    { y: -0.028, halfWidth: 0.034, halfDepth: 0.027, square: 2.8 },
    { y: -0.036, halfWidth: 0.032, halfDepth: 0.025, square: 2.8 },
    { y: -0.046, halfWidth: 0.040, halfDepth: 0.028, square: 2.9 },
    { y: -0.058, halfWidth: 0.045, halfDepth: 0.029, square: 3.0 },
    { y: -0.072, halfWidth: 0.046, halfDepth: 0.030, square: 3.0 },
    { y: -0.098, halfWidth: 0.044, halfDepth: 0.030, square: 3.0, z: 0.004 },
    { y: -0.120, halfWidth: 0.039, halfDepth: 0.027, square: 2.8, z: 0.009 },
    { y: -0.135, halfWidth: 0.027, halfDepth: 0.020, square: 2.5, z: 0.012 },
    { y: -0.143, halfWidth: 0, halfDepth: 0, z: 0.013 },
]);
const fullGloveThumb = (side) => loftGeometry(loftProfile([
    { y: -0.038, x: -side * 0.023, z: 0.006, halfWidth: 0.014, halfDepth: 0.017, square: 2.5 },
    { y: -0.056, x: -side * 0.036, z: 0.012, halfWidth: 0.019, halfDepth: 0.021, square: 2.5 },
    { y: -0.078, x: -side * 0.047, z: 0.022, halfWidth: 0.017, halfDepth: 0.020, square: 2.4 },
    { y: -0.097, x: -side * 0.049, z: 0.027, halfWidth: 0.011, halfDepth: 0.014, square: 2.2 },
    { y: -0.105, x: -side * 0.047, z: 0.029, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });
const ADONISB2_GUARD_TOP = 0.750;
const ADONISB2_CUP_TOP = -0.348;
const ADONISB2_CUP_BOTTOM = -0.013;
const ADONISB2_THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.079, 0.072, 0.061], [0.30, 0.52, ADONISB2_GUARD_TOP, -ADONISB2_CUP_TOP / RIDER_BLOCKOUT.thighLength], { flatten: 0.94, square: 2.4 });
const ADONISB2_BOOT_TOP = 0.66;
const ADONISB2_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.064, 0.058, 0.053], [-ADONISB2_CUP_BOTTOM / RIDER_BLOCKOUT.shinLength, ADONISB2_BOOT_TOP], { flatten: 0.92, square: 2.4 });
const ADONISB2_SUIT = Object.freeze({
    colour: BLOCKOUT_COLOURS.adonisb2Suit,
    roughness: 0.80,
    metalness: 0.0,
});
const ADONISB2_GUARD = Object.freeze({
    colour: BLOCKOUT_COLOURS.adonisb2Guard,
    roughness: 0.86,
    metalness: 0.0,
});
const ADONISB2_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.adonisb2Gear,
    roughness: 0.62,
    metalness: 0.0,
});
const ADONISB2_TROUSER_TINT = tintOver(BLOCKOUT_COLOURS.adonisb2Guard, BLOCKOUT_COLOURS.adonisb2Suit, 0.92);
const ADONISB2_CUFF_TINT = tintOver(BLOCKOUT_COLOURS.adonisb2Guard, BLOCKOUT_COLOURS.adonisb2Gear);
const ADONISB2_CUP_TINT = Object.freeze([0.10, 0.10, 0.10]);
const ADONISB2_BOOT_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.adonisb2Gear, BLOCKOUT_COLOURS.adonisb2Gear, 1.28);
function underAdonisb2Guard(x, z, side) {
    const angle = Math.atan2(side * x, z);
    return angle > -0.55 && angle < 2.30;
}
function paintAdonisb2Thigh(geometry, side) {
    const top = -RIDER_BLOCKOUT.thighLength * ADONISB2_GUARD_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const under = underAdonisb2Guard(position.getX(i), position.getZ(i), side);
        const tint = !under || y > top
            ? ADONISB2_TROUSER_TINT
            : y <= ADONISB2_CUP_TOP
                ? ADONISB2_CUP_TINT
                : null;
        if (tint !== null)
            colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintAdonisb2Shin(geometry, side) {
    const cuff = -RIDER_BLOCKOUT.shinLength * ADONISB2_BOOT_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const tint = y < cuff
            ? ADONISB2_CUFF_TINT
            : !underAdonisb2Guard(position.getX(i), position.getZ(i), side)
                ? ADONISB2_TROUSER_TINT
                : y > ADONISB2_CUP_BOTTOM
                    ? ADONISB2_CUP_TINT
                    : null;
        if (tint !== null)
            colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintAdonisb2Boot(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null)
        return;
    const height = Math.max(1e-3, box.max.y - box.min.y);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const t = (position.getY(i) - box.min.y) / height;
        const z = position.getZ(i);
        const ankleBand = t > 0.62 && t < 0.82;
        const toeCap = t < 0.34 && z > 0.055;
        const instepStrap = t > 0.38 && t < 0.52 && z > 0.02;
        if (ankleBand || toeCap || instepStrap) {
            colour.setXYZ(i, ADONISB2_BOOT_PANEL_TINT[0], ADONISB2_BOOT_PANEL_TINT[1], ADONISB2_BOOT_PANEL_TINT[2]);
        }
    }
}
function adonisb2ShellRing(y) {
    const first = HELMET[0];
    const last = HELMET[HELMET.length - 1];
    if (y <= first.y)
        return first;
    if (y >= last.y)
        return last;
    let lower = first;
    let upper = last;
    for (let i = 1; i < HELMET.length; i += 1) {
        if (HELMET[i].y < y)
            continue;
        lower = HELMET[i - 1];
        upper = HELMET[i];
        break;
    }
    const f = (y - lower.y) / (upper.y - lower.y);
    const blend = (a, b) => a + (b - a) * f;
    return {
        y,
        halfWidth: blend(lower.halfWidth, upper.halfWidth),
        halfDepth: blend(lower.halfDepth, upper.halfDepth),
        x: blend(lower.x, upper.x),
        z: blend(lower.z, upper.z),
        square: blend(lower.square, upper.square),
    };
}
function adonisb2ShellDepth(y, x, sign) {
    const ring = adonisb2ShellRing(y);
    if (ring.halfWidth <= 0)
        return ring.z;
    const t = Math.min(1, Math.abs(x - ring.x) / ring.halfWidth);
    return ring.z + sign * ring.halfDepth * (1 - t ** ring.square) ** (1 / ring.square);
}
function adonisb2ShellWidth(y, z) {
    const ring = adonisb2ShellRing(y);
    if (ring.halfDepth <= 0)
        return ring.halfWidth;
    const t = Math.min(1, Math.abs(z - ring.z) / ring.halfDepth);
    return ring.halfWidth * (1 - t ** ring.square) ** (1 / ring.square);
}
function adonisb2HelmetStripes() {
    const parts = [];
    const stripe = (rings) => {
        parts.push(loftGeometry(loftProfile(rings), { radialSegments: 8 }));
    };
    const CROWN_FRONT = [
        [0.244, 0.015], [0.254, 0.015], [0.266, 0.009],
        [0.282, 0.005], [0.300, 0.003], [0.318, 0.003], [0.3335, 0.003],
    ];
    const CROWN_REAR = [
        [0.3335, 0.003], [0.320, 0.003], [0.302, 0.003],
        [0.280, 0.003], [0.254, 0.004], [0.228, 0.008], [0.206, 0.015],
    ];
    for (const lane of [-1, 0, 1]) {
        const ringAt = ([y, clear], sign, taper) => {
            const x = lane * 0.26 * adonisb2ShellRing(y).halfWidth;
            return {
                y,
                halfWidth: 0.0075 * taper,
                halfDepth: 0.005,
                square: 2.6,
                x,
                z: adonisb2ShellDepth(y, x, sign) + sign * clear,
            };
        };
        const apex = {
            y: 0.3495,
            halfWidth: 0.0055,
            halfDepth: 0.010,
            square: 2.6,
            x: lane * 0.005,
            z: 0,
        };
        stripe([...CROWN_FRONT.map((step, i) => ringAt(step, 1, i === 0 ? 0.7 : 1)), apex]);
        stripe([
            apex,
            ...CROWN_REAR.map((step, i) => ringAt(step, -1, i === CROWN_REAR.length - 1 ? 0.5 : 1)),
        ]);
    }
    for (const side of [-1, 1]) {
        for (let lane = 0; lane < 4; lane += 1) {
            const rings = [];
            for (let step = 0; step <= 3; step += 1) {
                const t = step / 3;
                const y = 0.163 - lane * 0.009 - t * 0.024;
                const z = 0.032 + t * 0.060;
                rings.push({
                    y,
                    halfWidth: 0.004,
                    halfDepth: 0.0085,
                    square: 2.6,
                    x: side * (adonisb2ShellWidth(y, z) + 0.002),
                    z,
                });
            }
            stripe(rings);
        }
    }
    stripe([[0.102, 0.013], [0.118, 0.015], [0.134, 0.015], [0.149, 0.013]]
        .map(([y, clear], i) => ({
        y,
        halfWidth: i === 0 || i === 3 ? 0.009 : 0.012,
        halfDepth: 0.005,
        square: 3.0,
        z: adonisb2ShellDepth(y, 0, 1) + clear,
    })));
    const merged = mergeGeometries(parts);
    for (const part of parts)
        part.dispose();
    return merged;
}
export const ADONISB2_LOOK = Object.freeze({
    id: 'adonisb2',
    materials: Object.freeze({
        body: ADONISB2_SUIT,
        limbs: ADONISB2_SUIT,
        accent: ADONISB2_GUARD,
        head: Object.freeze({
            colour: BLOCKOUT_COLOURS.adonisb2Helmet,
            roughness: 0.24,
            metalness: 0.05,
        }),
        face: Object.freeze({
            colour: BLOCKOUT_COLOURS.adonisb2Visor,
            roughness: 0.06,
            metalness: 0.35,
            emissive: 0x2e3a46,
            emissiveIntensity: 0.40,
        }),
        gear: ADONISB2_GEAR,
    }),
    profiles: Object.freeze({
        torso: JACKET,
        seat: SEAT,
        thigh: ADONISB2_THIGH,
        shin: ADONISB2_SHIN,
        upperArm: UPPER_ARM,
        forearm: FOREARM,
        neck: NECK,
        head: HELMET,
        boot: BOOT,
        bootSole: BOOT_SOLE,
        hand: FULL_GLOVE,
    }),
    shades: Object.freeze({ seat: 0.92, legs: 1.0, collar: 1.12, sole: 0.62, neck: 0.40 }),
    parts: Object.freeze({
        hands: 'gear',
        neck: 'gear',
        kneePad: 'accent',
        legs: 'accent',
        seat: 'body',
    }),
    panels: Object.freeze({
        collar: Object.freeze({
            anchor: 'front',
            u0: 0,
            u1: Math.PI * 2,
            from: 0.502,
            to: 0.545,
            uSegments: 20,
            vSegments: 2,
            lift: 0.011,
            shade: 1.12,
        }),
        shoulders: Object.freeze({
            role: 'gear',
            casts: true,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'back',
                    u0: -0.46,
                    u1: 0.46,
                    from: 0.200,
                    to: 0.452,
                    uSegments: 6,
                    vSegments: 5,
                    lift: 0.050,
                    taper: 0.26,
                    shade: 0.98,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: -0.36,
                    u1: 0.36,
                    from: 0.352,
                    to: 0.440,
                    uSegments: 4,
                    vSegments: 3,
                    lift: 0.060,
                    taper: 0.32,
                    shade: 1.10,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -1.05,
                    u1: 0.04,
                    from: 0.405,
                    to: 0.465,
                    uSegments: 6,
                    vSegments: 3,
                    lift: 0.012,
                    taper: 0.02,
                    skewFrom: 0.440,
                    skewTo: 0.400,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.04,
                    u1: 1.05,
                    from: 0.405,
                    to: 0.465,
                    uSegments: 6,
                    vSegments: 3,
                    lift: 0.012,
                    taper: 0.02,
                    skewFrom: 0.400,
                    skewTo: 0.440,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.42,
                    u1: 0.42,
                    from: 0.425,
                    to: 0.492,
                    uSegments: 4,
                    vSegments: 3,
                    lift: 0.019,
                    taper: 0.26,
                    shade: 1.10,
                }),
            ]),
        }),
        torso: Object.freeze({
            role: 'gear',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: 0.42,
                    u1: 0.72,
                    mirrored: true,
                    from: 0.170,
                    to: 0.438,
                    uSegments: 3,
                    vSegments: 6,
                    lift: 0.010,
                    taper: 0.02,
                    shade: 1.12,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: 0.42,
                    u1: 0.68,
                    mirrored: true,
                    from: 0.286,
                    to: 0.370,
                    uSegments: 3,
                    vSegments: 3,
                    lift: 0.017,
                    taper: 0.16,
                    shade: 1.06,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.055,
                    u1: 0.055,
                    from: 0.075,
                    to: 0.470,
                    uSegments: 1,
                    vSegments: 8,
                    lift: 0.006,
                    taper: 0.10,
                    shade: 1.06,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: 0,
                    u1: Math.PI * 2,
                    from: 0.012,
                    to: 0.062,
                    uSegments: 20,
                    vSegments: 1,
                    lift: 0.010,
                    shade: 1.02,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.20,
                    u1: 0.20,
                    from: 0.008,
                    to: 0.066,
                    uSegments: 3,
                    vSegments: 2,
                    lift: 0.018,
                    taper: 0.30,
                    shade: 1.24,
                }),
            ]),
        }),
        waist: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: 0.46,
                    u1: 0.64,
                    mirrored: true,
                    from: 0.298,
                    to: 0.340,
                    uSegments: 2,
                    vSegments: 2,
                    lift: 0.023,
                    taper: 0.14,
                    shade: 1.04,
                }),
            ]),
        }),
        thighPad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -0.60,
                    u1: 1.90,
                    mirrored: true,
                    from: -0.400,
                    to: -RIDER_BLOCKOUT.thighLength * ADONISB2_GUARD_TOP,
                    uSegments: 8,
                    vSegments: 5,
                    lift: 0.020,
                    taper: 0.30,
                    shade: 1.06,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.60,
                    u1: 1.90,
                    mirrored: true,
                    from: -0.400,
                    to: ADONISB2_CUP_TOP,
                    uSegments: 7,
                    vSegments: 2,
                    lift: 0.030,
                    taper: 0.30,
                    shade: 0.10,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.24,
                    u1: 0.24,
                    from: -0.360,
                    to: -0.320,
                    uSegments: 4,
                    vSegments: 2,
                    lift: 0.024,
                    taper: 0.78,
                    shade: 0.18,
                }),
            ]),
        }),
        kneePad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -0.62,
                    u1: 1.95,
                    mirrored: true,
                    from: -0.150,
                    to: ADONISB2_CUP_BOTTOM,
                    uSegments: 8,
                    vSegments: 2,
                    lift: 0.016,
                    taper: 0.20,
                    shade: 1.06,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.62,
                    u1: 1.95,
                    mirrored: true,
                    from: ADONISB2_CUP_BOTTOM,
                    to: 0.000,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.030,
                    taper: 0.28,
                    shade: 0.10,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.55,
                    u1: 1.45,
                    mirrored: true,
                    from: -0.252,
                    to: ADONISB2_CUP_BOTTOM,
                    uSegments: 7,
                    vSegments: 7,
                    lift: 0.019,
                    taper: 0.42,
                    shade: 1.08,
                }),
                ...[0.16, 0.24, 0.32, 0.40, 0.48].map((centre, i) => {
                    const from = -0.128 - i * 0.0245;
                    return Object.freeze({
                        anchor: 'front',
                        u0: centre - 0.22,
                        u1: centre + 0.22,
                        mirrored: true,
                        from,
                        to: from + 0.016,
                        uSegments: 2,
                        vSegments: 1,
                        lift: 0.023,
                        taper: 0.46,
                        shade: 0.10,
                    });
                }),
                ...[-0.104, -0.148].map((from) => Object.freeze({
                    anchor: 'outboard',
                    u0: -0.24,
                    u1: 0.24,
                    from,
                    to: from + 0.028,
                    uSegments: 4,
                    vSegments: 2,
                    lift: 0.024,
                    taper: 0.78,
                    shade: 0.18,
                })),
                Object.freeze({
                    anchor: 'front',
                    u0: -Math.PI,
                    u1: Math.PI,
                    from: -0.268,
                    to: -0.248,
                    uSegments: 14,
                    vSegments: 1,
                    lift: 0.022,
                    taper: 0.28,
                    shade: 0.16,
                }),
            ]),
        }),
        head: Object.freeze([
            Object.freeze({
                anchor: 'front',
                u0: -0.70,
                u1: 0.70,
                from: 0.098,
                to: 0.152,
                uSegments: 6,
                vSegments: 3,
                lift: 0.015,
                taper: 0.42,
                shade: 0.86,
            }),
            Object.freeze({
                anchor: 'front',
                u0: -0.86,
                u1: 0.86,
                from: 0.236,
                to: 0.256,
                uSegments: 7,
                vSegments: 1,
                lift: 0.011,
                taper: 0.3,
                shade: 0.80,
            }),
            Object.freeze({
                anchor: 'back',
                u0: -0.78,
                u1: 0.78,
                from: 0.150,
                to: 0.206,
                uSegments: 8,
                vSegments: 3,
                lift: 0.012,
                taper: 0.62,
                shade: 1.04,
            }),
            Object.freeze({
                anchor: 'front',
                u0: 0,
                u1: Math.PI * 2,
                from: 0.090,
                to: 0.113,
                uSegments: 18,
                vSegments: 1,
                lift: 0.004,
                shade: 1.08,
            }),
        ]),
        face: Object.freeze({
            role: 'face',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -1.05,
                    u1: 1.05,
                    from: 0.150,
                    to: 0.246,
                    uSegments: 12,
                    vSegments: 4,
                    lift: 0.007,
                    sink: -0.014,
                    taper: 0.18,
                }),
            ]),
        }),
    }),
    extras: Object.freeze([
        Object.freeze({
            name: 'rider-helmet-stripes',
            joint: 'neck',
            role: 'accent',
            casts: false,
            build: adonisb2HelmetStripes,
        }),
    ]),
    build: Object.freeze({ hand: Object.freeze([fullGloveThumb]) }),
    paint: Object.freeze({
        thigh: paintAdonisb2Thigh,
        shin: paintAdonisb2Shin,
        boot: paintAdonisb2Boot,
    }),
    armCarriage: Object.freeze({ splay: 0.012, rise: 0 }),
});
