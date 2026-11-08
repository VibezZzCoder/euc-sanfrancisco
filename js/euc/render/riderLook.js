// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/riderLook.ts (sliced for euc-newyork: see the tool).
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
export const MOTION_STILL = Object.freeze({
    swayPelvisRoll: 0,
    swayHeadTilt: 0,
    swayArmSplay: 0,
    swayArmSwing: 0,
    staggerArms: 0,
    staggerHips: 0,
    staggerHeadLoll: 0,
    sipNeckPitch: 0,
    overLean: 0,
});
const TORSO_HALF_WIDTH = RIDER_BLOCKOUT.torsoWidth / 2;
const TORSO_HALF_DEPTH = RIDER_BLOCKOUT.torsoDepth / 2;
const SEAT = loftProfile([
    { y: -0.088, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.80 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
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
const GLOVE = loftProfile([
    { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
    { y: -0.022, halfWidth: 0.046, halfDepth: 0.040, square: 2.8 },
    { y: -0.040, halfWidth: 0.041, halfDepth: 0.037, square: 2.8 },
    { y: -0.082, halfWidth: 0.039, halfDepth: 0.034, square: 2.9 },
    { y: -0.098, halfWidth: 0.023, halfDepth: 0.020, square: 2.6 },
    { y: -0.105, halfWidth: 0, halfDepth: 0 },
]);
const TROLLINA_NECK = loftProfile([
    { y: -0.040, halfWidth: 0.050, halfDepth: 0.049, square: 2.3 },
    { y: 0.010, halfWidth: 0.044, halfDepth: 0.043, square: 2.2 },
    { y: 0.060, halfWidth: 0.041, halfDepth: 0.040, square: 2.2 },
    { y: 0.098, halfWidth: 0.043, halfDepth: 0.042, square: 2.2 },
]);
const COP_TORSO = loftProfile([
    { y: -0.010, halfWidth: 1.08 * TORSO_HALF_WIDTH, halfDepth: 1.05 * TORSO_HALF_DEPTH, square: 2.9 },
    { y: 0.035, halfWidth: 1.03 * TORSO_HALF_WIDTH, halfDepth: 1.02 * TORSO_HALF_DEPTH, square: 2.9 },
    { y: 0.145, halfWidth: 0.98 * TORSO_HALF_WIDTH, halfDepth: 1.00 * TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.285, halfWidth: 1.04 * TORSO_HALF_WIDTH, halfDepth: 1.06 * TORSO_HALF_DEPTH, square: 2.8, z: 0.010 },
    { y: 0.405, halfWidth: 1.10 * TORSO_HALF_WIDTH, halfDepth: 1.04 * TORSO_HALF_DEPTH, square: 3.0, z: 0.006 },
    { y: 0.485, halfWidth: 1.04 * TORSO_HALF_WIDTH, halfDepth: 0.94 * TORSO_HALF_DEPTH, square: 3.0 },
    { y: 0.525, halfWidth: 0.83 * TORSO_HALF_WIDTH, halfDepth: 0.76 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.548, halfWidth: 0.48 * TORSO_HALF_WIDTH, halfDepth: 0.52 * TORSO_HALF_DEPTH, square: 2.4 },
]);
const COP_THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.086, 0.078, 0.068], [0.52, 0.80], {
    flatten: 0.95,
    square: 2.5,
});
const COP_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.075, 0.063, 0.048], [0.30, 0.58, 0.655], {
    flatten: 0.93,
    square: 2.4,
});
const COP_UPPER_ARM = limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.066, 0.057, 0.045], [0.55], {
    flatten: 0.96,
    square: 2.4,
});
const COP_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.053, 0.046, 0.035], [0.45], {
    flatten: 0.95,
    square: 2.3,
});
const COP_HEAD = loftProfile([
    { y: 0.088, halfWidth: 0.050, halfDepth: 0.055, square: 2.4, z: 0.010 },
    { y: 0.116, halfWidth: 0.077, halfDepth: 0.083, square: 2.5, z: 0.012 },
    { y: 0.158, halfWidth: 0.101, halfDepth: 0.108, square: 2.5, z: 0.010 },
    { y: 0.207, halfWidth: 0.108, halfDepth: 0.114, square: 2.5, z: 0.004 },
    { y: 0.253, halfWidth: 0.103, halfDepth: 0.108, square: 2.4 },
    { y: 0.291, halfWidth: 0.085, halfDepth: 0.089, square: 2.3 },
    { y: 0.316, halfWidth: 0.045, halfDepth: 0.047, square: 2.2 },
    { y: 0.326, halfWidth: 0, halfDepth: 0 },
]);
const COP_HELMET = loftProfile([
    { y: 0.202, halfWidth: 0.112, halfDepth: 0.128, square: 2.5, z: 0.002 },
    { y: 0.214, halfWidth: 0.130, halfDepth: 0.148, square: 2.7, z: 0.006 },
    { y: 0.248, halfWidth: 0.126, halfDepth: 0.144, square: 2.5, z: 0.000 },
    { y: 0.302, halfWidth: 0.115, halfDepth: 0.128, square: 2.4, z: -0.010 },
    { y: 0.346, halfWidth: 0.086, halfDepth: 0.098, square: 2.3, z: -0.020 },
    { y: 0.374, halfWidth: 0.042, halfDepth: 0.048, square: 2.2, z: -0.028 },
    { y: 0.384, halfWidth: 0, halfDepth: 0, z: -0.030 },
]);
function tinted(geometry, tint) {
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i += 1)
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    return geometry;
}
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
function copFaceParts() {
    const parts = [loftGeometry(COP_HEAD, { radialSegments: 18 })];
    const skin = BLOCKOUT_COLOURS.copSkin;
    for (const side of [-1, 1]) {
        parts.push(loftGeometry(loftProfile([
            { y: 0.170, halfWidth: 0.022, halfDepth: 0.004, square: 2.8, x: side * 0.043, z: 0.108 },
            { y: 0.180, halfWidth: 0.038, halfDepth: 0.008, square: 3.2, x: side * 0.043, z: 0.112 },
            { y: 0.215, halfWidth: 0.038, halfDepth: 0.008, square: 3.2, x: side * 0.043, z: 0.112 },
            { y: 0.225, halfWidth: 0.022, halfDepth: 0.004, square: 2.8, x: side * 0.043, z: 0.108 },
        ]), { radialSegments: 8, shade: 0.28 }));
        parts.push(tinted(loftGeometry(loftProfile([
            { y: 0.177, halfWidth: 0.019, halfDepth: 0.003, square: 2.8, x: side * 0.043, z: 0.1135 },
            { y: 0.186, halfWidth: 0.030, halfDepth: 0.005, square: 3.0, x: side * 0.043, z: 0.116 },
            { y: 0.210, halfWidth: 0.030, halfDepth: 0.005, square: 3.0, x: side * 0.043, z: 0.116 },
            { y: 0.218, halfWidth: 0.019, halfDepth: 0.003, square: 2.8, x: side * 0.043, z: 0.1135 },
        ]), { radialSegments: 8 }), [1.06, 1.24, 1.46]));
        parts.push(loftGeometry(loftProfile([
            { y: 0.190, halfWidth: 0.004, halfDepth: 0.002, square: 2.4, x: side * 0.0385, z: 0.117 },
            { y: 0.198, halfWidth: 0.0085, halfDepth: 0.003, square: 2.6, x: side * 0.0385, z: 0.1185 },
            { y: 0.206, halfWidth: 0.004, halfDepth: 0.002, square: 2.4, x: side * 0.0385, z: 0.117 },
        ]), { radialSegments: 8, shade: 0.10 }));
        parts.push(loftGeometry(loftProfile([
            { y: 0.166, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: side * 0.096, z: 0.008 },
            { y: 0.186, halfWidth: 0.013, halfDepth: 0.018, square: 2.3, x: side * 0.104, z: 0.010 },
            { y: 0.208, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: side * 0.098, z: 0.008 },
        ]), { radialSegments: 8, shade: 0.96 }));
        parts.push(loftGeometry(loftProfile([
            { y: 0.104, halfWidth: 0.005, halfDepth: 0.011, square: 2.4, x: side * 0.024, z: 0.096 },
            { y: 0.148, halfWidth: 0.005, halfDepth: 0.013, square: 2.4, x: side * 0.062, z: 0.070 },
            { y: 0.198, halfWidth: 0.006, halfDepth: 0.014, square: 2.4, x: side * 0.090, z: 0.024 },
        ]), { radialSegments: 6, shade: 0.22 }));
    }
    parts.push(loftGeometry(loftProfile([
        { y: 0.190, halfWidth: 0.014, halfDepth: 0.004, square: 3, z: 0.116 },
        { y: 0.197, halfWidth: 0.026, halfDepth: 0.006, square: 3, z: 0.118 },
        { y: 0.204, halfWidth: 0.014, halfDepth: 0.004, square: 3, z: 0.116 },
    ]), { radialSegments: 6, shade: 0.28 }));
    parts.push(loftGeometry(loftProfile([
        { y: 0.148, halfWidth: 0.010, halfDepth: 0.006, square: 2.4, z: 0.106 },
        { y: 0.160, halfWidth: 0.015, halfDepth: 0.009, square: 2.5, z: 0.119 },
        { y: 0.176, halfWidth: 0.011, halfDepth: 0.006, square: 2.4, z: 0.112 },
    ]), { radialSegments: 8, shade: 1.06 }));
    parts.push(tinted(loftGeometry(loftProfile([
        { y: 0.126, halfWidth: 0.030, halfDepth: 0.006, square: 2.8, z: 0.112 },
        { y: 0.138, halfWidth: 0.066, halfDepth: 0.013, square: 3.4, z: 0.118 },
        { y: 0.150, halfWidth: 0.056, halfDepth: 0.011, square: 3.2, z: 0.117 },
        { y: 0.160, halfWidth: 0.022, halfDepth: 0.005, square: 2.8, z: 0.111 },
    ]), { radialSegments: 10 }), tintOver(skin, 0x54371c)));
    parts.push(tinted(loftGeometry(loftProfile([
        { y: 0.106, halfWidth: 0.009, halfDepth: 0.003, square: 2.6, z: 0.106 },
        { y: 0.112, halfWidth: 0.017, halfDepth: 0.005, square: 2.8, z: 0.110 },
        { y: 0.119, halfWidth: 0.013, halfDepth: 0.004, square: 2.6, z: 0.108 },
    ]), { radialSegments: 8 }), tintOver(skin, 0x552018)));
    parts.push(tinted(loftGeometry(loftProfile([
        { y: 0.098, halfWidth: 0.050, halfDepth: 0.032, square: 2.4, z: -0.058 },
        { y: 0.150, halfWidth: 0.076, halfDepth: 0.044, square: 2.5, z: -0.066 },
        { y: 0.205, halfWidth: 0.084, halfDepth: 0.046, square: 2.5, z: -0.060 },
        { y: 0.236, halfWidth: 0.062, halfDepth: 0.036, square: 2.4, z: -0.048 },
    ]), { radialSegments: 12 }), tintOver(skin, 0x54371c)));
    return mergeGeometries(parts);
}
const COP_SKIN = Object.freeze({
    colour: BLOCKOUT_COLOURS.copSkin,
    roughness: 0.76,
    metalness: 0.0,
});
const COP_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.copGear,
    roughness: 0.7,
    metalness: 0.0,
});
const COP_TORSO_MARKINGS = Object.freeze([
    ...Array.from({ length: 24 }, (_, index) => {
        const column = index % 12;
        const row = Math.floor(index / 12);
        return Object.freeze({
            anchor: 'front',
            u0: (column / 12) * Math.PI * 2,
            u1: ((column + 1) / 12) * Math.PI * 2,
            from: row === 0 ? 0.300 : 0.336,
            to: row === 0 ? 0.336 : 0.372,
            uSegments: 2,
            vSegments: 1,
            lift: 0.010,
            shade: (column + row) % 2 === 0 ? 2.6 : 0.82,
        });
    }),
    Object.freeze({
        anchor: 'back',
        u0: 0,
        u1: Math.PI * 2,
        from: 0.045,
        to: 0.100,
        uSegments: 20,
        vSegments: 1,
        lift: 0.009,
        shade: 0.16,
    }),
    Object.freeze({
        anchor: 'front',
        u0: 0.50,
        u1: 0.85,
        mirrored: true,
        from: 0.048,
        to: 0.102,
        uSegments: 2,
        vSegments: 1,
        lift: 0.014,
        shade: 0.24,
        taper: 0.12,
    }),
    Object.freeze({
        anchor: 'back',
        u0: 0.28,
        u1: 0.60,
        mirrored: true,
        from: 0.048,
        to: 0.100,
        uSegments: 2,
        vSegments: 1,
        lift: 0.013,
        shade: 0.22,
        taper: 0.12,
    }),
    Object.freeze({
        anchor: 'front',
        u0: -0.10,
        u1: 0.10,
        from: 0.052,
        to: 0.095,
        uSegments: 2,
        vSegments: 1,
        lift: 0.015,
        shade: 1.9,
    }),
    Object.freeze({
        anchor: 'front',
        u0: -0.14,
        u1: 0.14,
        from: 0.298,
        to: 0.372,
        uSegments: 2,
        vSegments: 2,
        lift: 0.016,
        shade: 0.14,
        taper: 0.10,
    }),
    Object.freeze({
        anchor: 'front',
        u0: -0.52,
        u1: -0.28,
        from: 0.430,
        to: 0.492,
        uSegments: 2,
        vSegments: 2,
        lift: 0.017,
        shade: 0.16,
    }),
    Object.freeze({
        anchor: 'front',
        u0: -0.46,
        u1: -0.40,
        from: 0.150,
        to: 0.435,
        uSegments: 1,
        vSegments: 6,
        lift: 0.012,
        shade: 0.18,
    }),
    Object.freeze({
        anchor: 'front',
        u0: 0.28,
        u1: 0.62,
        from: 0.392,
        to: 0.458,
        uSegments: 3,
        vSegments: 3,
        lift: 0.016,
        taper: 0.34,
        shade: 2.3,
    }),
]);
const COP_SHORTS_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copShirt, 0.88);
const COP_PAD_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copGear, 0.92);
const COP_SOCK_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copShirt, 0.78);
const COP_SOCK_RING_TINT = tintOver(BLOCKOUT_COLOURS.copSkin, BLOCKOUT_COLOURS.copHiVis);
function paintCopThigh(geometry) {
    const length = RIDER_BLOCKOUT.thighLength;
    paintBands(geometry, [
        { top: Infinity, bottom: -length * 0.52, tint: COP_SHORTS_TINT },
        { top: -length * 0.80, bottom: -Infinity, tint: COP_PAD_TINT },
    ]);
}
function paintCopShin(geometry) {
    const length = RIDER_BLOCKOUT.shinLength;
    paintBands(geometry, [
        { top: Infinity, bottom: -length * 0.30, tint: COP_PAD_TINT },
        { top: -length * 0.58, bottom: -length * 0.655, tint: COP_SOCK_RING_TINT },
        { top: -length * 0.655, bottom: -Infinity, tint: COP_SOCK_TINT },
    ]);
}
const COP_LACE_TINT = [1.65, 1.68, 1.75];
const COP_HEEL_TINT = tintOver(BLOCKOUT_COLOURS.copGear, BLOCKOUT_COLOURS.copHiVis, 0.38);
function paintCopBoot(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const height = Math.max(1e-3, box.max.y - box.min.y);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const t = (position.getY(i) - box.min.y) / height;
        const z = position.getZ(i);
        if (t > 0.40 && z > 0.030) {
            colour.setXYZ(i, COP_LACE_TINT[0], COP_LACE_TINT[1], COP_LACE_TINT[2]);
        }
        else if (t > 0.18 && t < 0.42 && z < -0.078) {
            colour.setXYZ(i, COP_HEEL_TINT[0], COP_HEEL_TINT[1], COP_HEEL_TINT[2]);
        }
    }
}
export const COP_LOOK = Object.freeze({
    id: 'cop',
    materials: Object.freeze({
        body: Object.freeze({
            colour: BLOCKOUT_COLOURS.copShirt,
            roughness: 0.72,
            metalness: 0.0,
        }),
        limbs: COP_SKIN,
        accent: Object.freeze({
            colour: BLOCKOUT_COLOURS.copHiVis,
            roughness: 0.44,
            metalness: 0.0,
            emissive: 0x3a3208,
            emissiveIntensity: 0.5,
        }),
        head: Object.freeze({
            colour: BLOCKOUT_COLOURS.copHelmet,
            roughness: 0.42,
            metalness: 0.03,
        }),
        face: Object.freeze({
            colour: BLOCKOUT_COLOURS.copBand,
            roughness: 0.54,
            metalness: 0.04,
        }),
        gear: COP_GEAR,
    }),
    profiles: Object.freeze({
        torso: COP_TORSO,
        seat: SEAT,
        thigh: COP_THIGH,
        shin: COP_SHIN,
        upperArm: COP_UPPER_ARM,
        forearm: COP_FOREARM,
        neck: TROLLINA_NECK,
        head: COP_HELMET,
        boot: BOOT,
        bootSole: BOOT_SOLE,
        hand: GLOVE,
    }),
    shades: Object.freeze({ seat: 0.88, legs: 1, collar: 1.1, sole: 0.72, neck: 1 }),
    parts: Object.freeze({
        hands: 'gear',
        kneePad: 'gear',
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
            shade: 1.1,
        }),
        shoulders: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'outboard',
                    u0: -1.28,
                    u1: 1.28,
                    from: 0.372,
                    to: 0.520,
                    uSegments: 10,
                    vSegments: 4,
                    lift: 0.011,
                    taper: 0.22,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.72,
                    u1: 0.72,
                    from: 0.372,
                    to: 0.512,
                    uSegments: 6,
                    vSegments: 4,
                    lift: 0.009,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: -0.72,
                    u1: 0.72,
                    from: 0.372,
                    to: 0.512,
                    uSegments: 6,
                    vSegments: 4,
                    lift: 0.009,
                }),
            ]),
        }),
        torso: Object.freeze({
            role: 'face',
            casts: false,
            patches: COP_TORSO_MARKINGS,
        }),
        head: Object.freeze([
            Object.freeze({
                anchor: 'front',
                u0: -0.60,
                u1: 0.60,
                from: 0.206,
                to: 0.230,
                uSegments: 6,
                vSegments: 2,
                lift: 0.017,
                taper: 0.35,
                shade: 1.03,
            }),
            Object.freeze({
                anchor: 'front',
                u0: -0.18,
                u1: 0.18,
                from: 0.236,
                to: 0.342,
                uSegments: 3,
                vSegments: 5,
                lift: 0.008,
                shade: 0.18,
            }),
            Object.freeze({
                anchor: 'front',
                u0: 0.38,
                u1: 0.62,
                mirrored: true,
                from: 0.244,
                to: 0.326,
                uSegments: 2,
                vSegments: 4,
                lift: 0.007,
                shade: 0.25,
            }),
            Object.freeze({
                anchor: 'front',
                u0: 0.68,
                u1: 0.88,
                mirrored: true,
                from: 0.242,
                to: 0.312,
                uSegments: 2,
                vSegments: 3,
                lift: 0.007,
                shade: 0.25,
            }),
            Object.freeze({
                anchor: 'back',
                u0: 0.26,
                u1: 0.46,
                mirrored: true,
                from: 0.252,
                to: 0.318,
                uSegments: 2,
                vSegments: 3,
                lift: 0.007,
                shade: 0.22,
            }),
            Object.freeze({
                anchor: 'back',
                u0: -0.92,
                u1: 0.92,
                from: 0.208,
                to: 0.228,
                uSegments: 8,
                vSegments: 1,
                lift: 0.010,
                shade: 0.88,
            }),
        ]),
    }),
    extras: Object.freeze([Object.freeze({
            name: 'rider-cop-face',
            joint: 'neck',
            role: 'limbs',
            casts: false,
            build: copFaceParts,
        })]),
    paint: Object.freeze({
        thigh: paintCopThigh,
        shin: paintCopShin,
        boot: paintCopBoot,
    }),
    armCarriage: Object.freeze({ splay: 0.04, rise: -0.01 }),
});
import { preparedRiderLook } from './appearanceRegistry.js';
export function riderLook(id) { return id === 'cop' ? COP_LOOK : preparedRiderLook(id); }
