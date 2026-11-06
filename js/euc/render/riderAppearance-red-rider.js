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
import { limbProfile, loftGeometry, loftProfile, tintOver } from './blockoutKit.js';
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
function paintBands(geometry, bands) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        for (const band of bands) {
            if (y > band.top || y < band.bottom)
                continue;
            colour.setXYZ(i, band.tint[0], band.tint[1], band.tint[2]);
            break;
        }
    }
}
const RED_THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.079, 0.072, 0.061], [0.30, 0.68, 0.78], { flatten: 0.94, square: 2.4 });
const RED_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.064, 0.058, 0.046], [0.55, 0.74], {
    flatten: 0.92,
    square: 2.4,
});
const RED_SUIT = Object.freeze({
    colour: BLOCKOUT_COLOURS.redRiderSuit,
    roughness: 0.68,
    metalness: 0.0,
});
const RED_ARMOUR = Object.freeze({
    colour: BLOCKOUT_COLOURS.redRiderArmour,
    roughness: 0.88,
    metalness: 0.0,
});
const RED_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.redRiderGear,
    roughness: 0.66,
    metalness: 0.0,
});
const RED_GUARD_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderArmour);
const RED_CUFF_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderGear);
const RED_MARK_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderMark, 0.70);
const RED_ACCENT_TINT = tintOver(BLOCKOUT_COLOURS.redRiderSuit, BLOCKOUT_COLOURS.redRiderHelmet);
const RED_KNUCKLE_TINT = tintOver(BLOCKOUT_COLOURS.redRiderGear, BLOCKOUT_COLOURS.redRiderSuit, 1.25);
const RED_BOOT_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.redRiderGear, BLOCKOUT_COLOURS.redRiderGear, 1.7);
function outboardFace(x, z, side, sharpness) {
    const radius = Math.hypot(x, z);
    return radius > 1e-4 && (x * side) / radius > sharpness;
}
function paintRedRiderThigh(geometry, side) {
    const length = RIDER_BLOCKOUT.thighLength;
    paintBands(geometry, [{ top: -length * 0.78, bottom: -Infinity, tint: RED_GUARD_TINT }]);
    if (side < 0)
        return;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y > -length * 0.31 || y < -length * 0.67)
            continue;
        if (!outboardFace(position.getX(i), position.getZ(i), side, 0.88))
            continue;
        colour.setXYZ(i, RED_MARK_TINT[0], RED_MARK_TINT[1], RED_MARK_TINT[2]);
    }
}
function paintRedRiderShin(geometry) {
    const length = RIDER_BLOCKOUT.shinLength;
    paintBands(geometry, [
        { top: Infinity, bottom: -length * 0.55, tint: RED_GUARD_TINT },
        { top: -length * 0.74, bottom: -Infinity, tint: RED_CUFF_TINT },
    ]);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y < -length * 0.50 || y > -length * 0.12)
            continue;
        const x = position.getX(i);
        const z = position.getZ(i);
        const radius = Math.hypot(x, z);
        if (radius > 1e-4 && z / radius > 0.86) {
            colour.setXYZ(i, RED_ACCENT_TINT[0], RED_ACCENT_TINT[1], RED_ACCENT_TINT[2]);
        }
    }
}
function paintRedRiderBoot(geometry) {
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
            colour.setXYZ(i, RED_BOOT_PANEL_TINT[0], RED_BOOT_PANEL_TINT[1], RED_BOOT_PANEL_TINT[2]);
        }
    }
}
function paintRedRiderHand(geometry) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y > -0.030 || y < -0.126)
            continue;
        if (y < -0.050 && y > -0.062)
            continue;
        const z = position.getZ(i);
        const radius = Math.hypot(position.getX(i), z);
        if (radius > 1e-4 && z / radius > 0.10) {
            colour.setXYZ(i, RED_KNUCKLE_TINT[0], RED_KNUCKLE_TINT[1], RED_KNUCKLE_TINT[2]);
        }
    }
}
export const RED_RIDER_LOOK = Object.freeze({
    id: 'red-rider',
    materials: Object.freeze({
        body: RED_SUIT,
        limbs: RED_SUIT,
        accent: RED_ARMOUR,
        head: Object.freeze({
            colour: BLOCKOUT_COLOURS.redRiderHelmet,
            roughness: 0.18,
            metalness: 0.06,
        }),
        face: Object.freeze({
            colour: BLOCKOUT_COLOURS.redRiderVisor,
            roughness: 0.10,
            metalness: 0.42,
        }),
        gear: RED_GEAR,
    }),
    profiles: Object.freeze({
        torso: JACKET,
        seat: SEAT,
        thigh: RED_THIGH,
        shin: RED_SHIN,
        upperArm: UPPER_ARM,
        forearm: FOREARM,
        neck: NECK,
        head: HELMET,
        boot: BOOT,
        bootSole: BOOT_SOLE,
        hand: FULL_GLOVE,
    }),
    shades: Object.freeze({ seat: 0.92, legs: 0.94, collar: 1.10, sole: 0.70, neck: 0.62 }),
    parts: Object.freeze({
        hands: 'gear',
        neck: 'gear',
        kneePad: 'accent',
        legs: 'limbs',
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
            shade: 1.10,
        }),
        shoulders: Object.freeze({
            role: 'accent',
            casts: true,
            patches: Object.freeze([
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
                    shade: 1.22,
                }),
            ]),
        }),
        torso: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: 0.42,
                    u1: 0.75,
                    mirrored: true,
                    from: 0.302,
                    to: 0.438,
                    uSegments: 3,
                    vSegments: 6,
                    lift: 0.010,
                    taper: 0.02,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.46,
                    u1: 0.46,
                    from: 0.306,
                    to: 0.336,
                    uSegments: 4,
                    vSegments: 1,
                    lift: 0.010,
                    taper: 0.16,
                    shade: 0.92,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.10,
                    u1: 0.10,
                    from: 0.300,
                    to: 0.344,
                    uSegments: 2,
                    vSegments: 2,
                    lift: 0.018,
                    taper: 0.18,
                    shade: 1.30,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: 0,
                    u1: Math.PI * 2,
                    from: 0.156,
                    to: 0.222,
                    uSegments: 20,
                    vSegments: 2,
                    lift: 0.009,
                    taper: 0.30,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.42,
                    u1: 0.42,
                    from: 0.208,
                    to: 0.396,
                    uSegments: 5,
                    vSegments: 4,
                    lift: 0.007,
                    taper: 0.26,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.30,
                    u1: -0.06,
                    from: 0.214,
                    to: 0.315,
                    uSegments: 3,
                    vSegments: 4,
                    lift: 0.024,
                    taper: 0.10,
                    shade: 0.86,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.24,
                    u1: -0.10,
                    from: 0.267,
                    to: 0.302,
                    uSegments: 2,
                    vSegments: 1,
                    lift: 0.033,
                    shade: 3.00,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.24,
                    u1: -0.12,
                    from: 0.306,
                    to: 0.340,
                    uSegments: 2,
                    vSegments: 1,
                    lift: 0.034,
                    taper: 0.10,
                    shade: 1.28,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.54,
                    u1: -0.43,
                    from: 0.078,
                    to: 0.166,
                    uSegments: 2,
                    vSegments: 2,
                    lift: 0.011,
                    taper: 0.12,
                }),
                ...[-1, 1].map((side) => Object.freeze({
                    anchor: 'back',
                    u0: side > 0 ? 0.42 : -0.75,
                    u1: side > 0 ? 0.75 : -0.42,
                    from: 0.212,
                    to: 0.438,
                    uSegments: 3,
                    vSegments: 5,
                    lift: 0.010,
                    taper: 0.02,
                })),
            ]),
        }),
        sleeve: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'outboard',
                    u0: -1.30,
                    u1: 1.30,
                    from: -0.052,
                    to: -0.024,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.009,
                    taper: 0.20,
                    skewFrom: -0.052,
                    skewTo: -0.030,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -1.10,
                    u1: 1.10,
                    from: -0.100,
                    to: -0.076,
                    uSegments: 7,
                    vSegments: 1,
                    lift: 0.009,
                    taper: 0.20,
                    skewFrom: -0.100,
                    skewTo: -0.084,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.90,
                    u1: 0.90,
                    from: -0.142,
                    to: -0.122,
                    uSegments: 6,
                    vSegments: 1,
                    lift: 0.009,
                    taper: 0.20,
                    skewFrom: -0.134,
                    skewTo: -0.142,
                }),
            ]),
        }),
        elbowPad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'back',
                    u0: -0.86,
                    u1: 0.86,
                    from: -0.076,
                    to: 0.006,
                    uSegments: 7,
                    vSegments: 4,
                    lift: 0.015,
                    taper: 0.26,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: -Math.PI,
                    u1: Math.PI,
                    from: -0.098,
                    to: -0.080,
                    uSegments: 14,
                    vSegments: 1,
                    lift: 0.008,
                    taper: 0.28,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: -0.72,
                    u1: 0.72,
                    from: -0.184,
                    to: -0.102,
                    uSegments: 6,
                    vSegments: 3,
                    lift: 0.013,
                    taper: 0.24,
                    shade: 1.12,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: -Math.PI,
                    u1: Math.PI,
                    from: -0.216,
                    to: -0.192,
                    uSegments: 14,
                    vSegments: 1,
                    lift: 0.008,
                    taper: 0.28,
                }),
            ]),
        }),
        kneePad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -0.88,
                    u1: 0.88,
                    from: -0.104,
                    to: -0.004,
                    uSegments: 7,
                    vSegments: 4,
                    lift: 0.016,
                    taper: 0.28,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -Math.PI,
                    u1: Math.PI,
                    from: -0.132,
                    to: -0.110,
                    uSegments: 14,
                    vSegments: 1,
                    lift: 0.008,
                    taper: 0.28,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.70,
                    u1: 0.70,
                    from: -0.228,
                    to: -0.140,
                    uSegments: 6,
                    vSegments: 3,
                    lift: 0.013,
                    taper: 0.24,
                    shade: 1.12,
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
                shade: 0.84,
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
                shade: 0.78,
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
                shade: 0.88,
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
                shade: 1.06,
            }),
            ...[0, 1, 2].map((index) => Object.freeze({
                anchor: 'front',
                u0: 0.36 + index * 0.17,
                u1: 0.47 + index * 0.17,
                mirrored: true,
                from: 0.120,
                to: 0.148,
                uSegments: 2,
                vSegments: 1,
                lift: 0.006,
                shade: 0.22,
            })),
        ]),
        face: Object.freeze({
            role: 'face',
            casts: false,
            patches: Object.freeze([Object.freeze({
                    anchor: 'front',
                    u0: -1.05,
                    u1: 1.05,
                    from: 0.158,
                    to: 0.246,
                    uSegments: 12,
                    vSegments: 4,
                    lift: 0.007,
                    sink: -0.014,
                    taper: 0.18,
                })]),
        }),
    }),
    extras: Object.freeze([]),
    build: Object.freeze({ hand: Object.freeze([fullGloveThumb]) }),
    paint: Object.freeze({
        thigh: paintRedRiderThigh,
        shin: paintRedRiderShin,
        boot: paintRedRiderBoot,
        hand: paintRedRiderHand,
    }),
    armCarriage: Object.freeze({ splay: 0.022, rise: 0 }),
});
