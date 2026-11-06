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
import { WIM_REGIONS, createWimAtlas } from './wimAtlas.js';
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
const NECK = loftProfile([
    { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
    { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
    { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
    { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
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
const fullGloveThumb = (side) => loftGeometry(loftProfile([
    { y: -0.038, x: -side * 0.023, z: 0.006, halfWidth: 0.014, halfDepth: 0.017, square: 2.5 },
    { y: -0.056, x: -side * 0.036, z: 0.012, halfWidth: 0.019, halfDepth: 0.021, square: 2.5 },
    { y: -0.078, x: -side * 0.047, z: 0.022, halfWidth: 0.017, halfDepth: 0.020, square: 2.4 },
    { y: -0.097, x: -side * 0.049, z: 0.027, halfWidth: 0.011, halfDepth: 0.014, square: 2.2 },
    { y: -0.105, x: -side * 0.047, z: 0.029, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });
const WIM_GUARD_TOP = 0.735;
const WIM_CUP_TOP = -0.380;
const WIM_CUP_BOTTOM = -0.030;
const WIM_BOOT_TOP = 0.72;
function ringOf(profile, y) {
    const first = profile[0];
    const last = profile[profile.length - 1];
    if (y <= first.y)
        return first;
    if (y >= last.y)
        return last;
    let lower = first;
    let upper = last;
    for (let i = 1; i < profile.length; i += 1) {
        if (profile[i].y < y)
            continue;
        lower = profile[i - 1];
        upper = profile[i];
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
const WIM_JERSEY = loftProfile((() => {
    const heights = [-0.010, 0.018];
    for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030)
        heights.push(Math.round(y * 1000) / 1000);
    heights.push(0.500, 0.528, 0.548);
    return heights.map((y) => ringOf(JACKET, y));
})());
function limbAtHeights(length, radii, heights, options) {
    const [top, mid, end] = radii;
    const radiusAt = (t) => (t < 0.5 ? top + (mid - top) * (t / 0.5) : mid + (end - mid) * ((t - 0.5) / 0.5));
    const rings = heights.map((y) => {
        const radius = radiusAt(Math.min(1, Math.max(0, -y / length)));
        return { y, halfWidth: radius, halfDepth: radius * options.flatten, square: options.square };
    });
    for (const [t, scale] of [[0.5, 0.86], [0.85, 0.54], [1, 0]]) {
        rings.push({
            y: -length - end * 0.55 * t,
            halfWidth: end * scale,
            halfDepth: end * scale * options.flatten,
            square: options.square,
        });
    }
    return loftProfile(rings);
}
const WIM_HIP_DOME_APEX = 0.060;
const WIM_HIP_DOME = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [WIM_HIP_DOME_APEX, 0]].map(([y, scale]) => ({
    y: y,
    halfWidth: 0.079 * scale,
    halfDepth: 0.079 * 0.94 * scale,
    square: 2.4,
}));
const WIM_THIGH = loftProfile([
    ...limbAtHeights(RIDER_BLOCKOUT.thighLength, [0.079, 0.072, 0.061], [
        0, -0.040, -0.080, -0.120, -0.160, -0.200, -0.240, -0.270,
        -RIDER_BLOCKOUT.thighLength * WIM_GUARD_TOP + 0.002,
        -RIDER_BLOCKOUT.thighLength * WIM_GUARD_TOP - 0.002,
        -0.300, -0.320, -0.340, -0.360, -0.380, -0.400,
    ], { flatten: 0.94, square: 2.4 }),
    ...WIM_HIP_DOME,
]);
const WIM_SEAT = loftProfile([
    { y: -0.118, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.78 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.088, halfWidth: 0.84 * TORSO_HALF_WIDTH, halfDepth: 0.85 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
]);
const WIM_SHIN = limbAtHeights(RIDER_BLOCKOUT.shinLength, [0.064, 0.058, 0.053], [
    0, WIM_CUP_BOTTOM + 0.002, WIM_CUP_BOTTOM - 0.002,
    -0.050, -0.080, -0.110, -0.140, -0.170, -0.200, -0.224, -0.250,
    -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP + 0.002,
    -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP - 0.002,
    -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP - 0.014,
    -0.300, -0.340, -0.380,
], { flatten: 0.92, square: 2.4 });
const WIM_UPPER_ARM = loftProfile([
    { y: 0.034, halfWidth: 0, halfDepth: 0 },
    { y: 0.028, halfWidth: 0.030, halfDepth: 0.029, square: 2.3 },
    { y: 0.014, halfWidth: 0.050, halfDepth: 0.048, square: 2.3 },
    ...limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.058, 0.050, 0.043], [], {
        flatten: 0.95,
        square: 2.3,
    }).slice().reverse(),
]);
const WIM_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.047, 0.041, 0.033], [], {
    flatten: 0.94,
    square: 2.3,
});
const WIM_HELMET = loftProfile([
    { y: 0.058, halfWidth: 0.088, halfDepth: 0.072, square: 2.3, z: 0.012 },
    { y: 0.088, halfWidth: 0.094, halfDepth: 0.086, square: 2.4, z: 0.018 },
    { y: 0.112, halfWidth: 0.104, halfDepth: 0.118, square: 2.5, z: 0.022 },
    { y: 0.132, halfWidth: 0.112, halfDepth: 0.128, square: 2.6, z: 0.020 },
    { y: 0.158, halfWidth: 0.119, halfDepth: 0.130, square: 2.6, z: 0.010 },
    { y: 0.215, halfWidth: 0.124, halfDepth: 0.133, square: 2.5, z: 0.004 },
    { y: 0.268, halfWidth: 0.113, halfDepth: 0.119, square: 2.3 },
    { y: 0.290, halfWidth: 0.101, halfDepth: 0.106, square: 2.25 },
    { y: 0.308, halfWidth: 0.084, halfDepth: 0.088, square: 2.2 },
    { y: 0.324, halfWidth: 0.064, halfDepth: 0.067, square: 2.2 },
    { y: 0.336, halfWidth: 0.040, halfDepth: 0.042, square: 2.2 },
    { y: 0.348, halfWidth: 0, halfDepth: 0 },
]);
const WIM_PRINT = Object.freeze({
    colour: BLOCKOUT_COLOURS.wheelInMotionPrint,
    roughness: 0.82,
    metalness: 0.0,
});
const WIM_LID = Object.freeze({
    colour: BLOCKOUT_COLOURS.wheelInMotionPrint,
    roughness: 0.46,
    metalness: 0.0,
});
const WIM_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.wheelInMotionGear,
    roughness: 0.62,
    metalness: 0.0,
});
const WIM_TROUSER_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionBlue);
const WIM_GUARD_SHADE = 1.30;
const WIM_GUARD_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGuard, WIM_GUARD_SHADE);
const WIM_CAP_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGear);
const WIM_BOOT_TINT = WIM_CAP_TINT;
const WIM_BOOT_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionGear, BLOCKOUT_COLOURS.wheelInMotionGear, 2.2);
const WIM_BOOT_PANEL_ON_SHIN_TINT = tintOver(BLOCKOUT_COLOURS.wheelInMotionPrint, BLOCKOUT_COLOURS.wheelInMotionGear, 2.2);
function underWimGuard(x, z, side) {
    const angle = Math.atan2(side * x, z);
    return angle > -0.75 && angle < 2.60;
}
function paintWimThigh(geometry, side) {
    const top = -RIDER_BLOCKOUT.thighLength * WIM_GUARD_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const under = underWimGuard(position.getX(i), position.getZ(i), side);
        const tint = !under || y > top
            ? WIM_TROUSER_TINT
            : y <= WIM_CUP_TOP
                ? WIM_CAP_TINT
                : WIM_GUARD_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintWimShin(geometry, side) {
    const cuff = -RIDER_BLOCKOUT.shinLength * WIM_BOOT_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const x = position.getX(i);
        const z = position.getZ(i);
        let tint;
        if (y < cuff) {
            const collar = y > cuff - 0.016;
            const laces = z > 0 && Math.abs(x) < 0.017 * (Math.hypot(x, z) / 0.05);
            tint = collar || laces ? WIM_BOOT_PANEL_ON_SHIN_TINT : WIM_BOOT_TINT;
        }
        else if (!underWimGuard(x, z, side)) {
            tint = WIM_TROUSER_TINT;
        }
        else if (y > WIM_CUP_BOTTOM) {
            tint = WIM_CAP_TINT;
        }
        else {
            tint = WIM_GUARD_TINT;
        }
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintWimBoot(geometry) {
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
        const x = position.getX(i);
        const ankleBand = t > 0.62 && t < 0.82;
        const toeCap = t < 0.34 && z > 0.055;
        const laces = t > 0.36 && t < 0.62 && z > 0.02 && Math.abs(x) < 0.014;
        if (ankleBand || toeCap || laces) {
            colour.setXYZ(i, WIM_BOOT_PANEL_TINT[0], WIM_BOOT_PANEL_TINT[1], WIM_BOOT_PANEL_TINT[2]);
        }
    }
}
const WIM_GLOVE = loftProfile([
    { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
    { y: -0.016, halfWidth: 0.044, halfDepth: 0.038, square: 2.8 },
    { y: -0.022, halfWidth: 0.046, halfDepth: 0.040, square: 2.8 },
    { y: -0.028, halfWidth: 0.043, halfDepth: 0.037, square: 2.8 },
    { y: -0.036, halfWidth: 0.031, halfDepth: 0.024, square: 2.8 },
    { y: -0.046, halfWidth: 0.036, halfDepth: 0.026, square: 2.85 },
    { y: -0.058, halfWidth: 0.041, halfDepth: 0.022, square: 2.85 },
    { y: -0.072, halfWidth: 0.040, halfDepth: 0.022, square: 2.9 },
    { y: -0.088, halfWidth: 0.039, halfDepth: 0.024, square: 2.9, z: 0.003 },
    { y: -0.110, halfWidth: 0.036, halfDepth: 0.025, square: 2.9, z: 0.008 },
    { y: -0.128, halfWidth: 0.030, halfDepth: 0.022, square: 2.7, z: 0.011 },
    { y: -0.138, halfWidth: 0.019, halfDepth: 0.015, square: 2.4, z: 0.013 },
    { y: -0.143, halfWidth: 0, halfDepth: 0, z: 0.014 },
]);
function paintWimHand(geometry) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const z = position.getZ(i);
        const cuff = y > -0.024 && y < -0.012;
        const knuckles = y < -0.040 && y > -0.062 && z > 0.012;
        if (cuff || knuckles)
            colour.setXYZ(i, WIM_BOOT_PANEL_TINT[0], WIM_BOOT_PANEL_TINT[1], WIM_BOOT_PANEL_TINT[2]);
    }
}
const WIM_SEAT_SHADE = 0.86;
function paintWimTorso(geometry) {
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i += 1) {
        if (Math.abs(colour.getX(i) - WIM_SEAT_SHADE) > 1e-6)
            continue;
        colour.setXYZ(i, WIM_TROUSER_TINT[0], WIM_TROUSER_TINT[1], WIM_TROUSER_TINT[2]);
    }
}
const WIM_THIGH_SHELL = Object.freeze({
    u0: -1.95,
    u1: 0.90,
    from: -0.400,
    to: -0.300,
});
const WIM_SHIN_PLATE = Object.freeze({ u0: -2.00, u1: 0.70, from: -0.224, to: WIM_CUP_BOTTOM });
const WIM_PACK_STICKER = Object.freeze({ u0: -0.34, u1: 0.34, from: 0.270, to: 0.395 });
const WIM_SHEET_LAYOUT = Object.freeze({
    torso: WIM_JERSEY,
    upperArm: WIM_UPPER_ARM,
    forearm: WIM_FOREARM,
    thigh: WIM_THIGH,
    shin: WIM_SHIN,
    head: WIM_HELMET,
    thighShell: WIM_THIGH_SHELL,
    shinPlate: WIM_SHIN_PLATE,
    packSticker: WIM_PACK_STICKER,
    chestMark: Object.freeze({ width: 0.190, bottom: 0.328 }),
});
export const WHEEL_IN_MOTION_LOOK = Object.freeze({
    id: 'wheel-in-motion',
    density: Object.freeze({ limb: 18, torso: 30, head: 32 }),
    atlas: Object.freeze({
        paintInput: () => ({ cache: 'wimAtlas.ts', args: [WIM_SHEET_LAYOUT] }),
        build: () => createWimAtlas(WIM_SHEET_LAYOUT),
        roles: Object.freeze(['body', 'limbs', 'accent', 'face', 'head']),
        region: (art) => (art !== undefined && art in WIM_REGIONS ? WIM_REGIONS[art] : WIM_REGIONS.blank),
        lofts: Object.freeze({ torso: 'jersey', upperArm: 'sleeve', forearm: 'forearm', head: 'helmet' }),
    }),
    materials: Object.freeze({
        body: WIM_PRINT,
        limbs: WIM_PRINT,
        accent: WIM_PRINT,
        head: WIM_LID,
        face: Object.freeze({
            colour: BLOCKOUT_COLOURS.wheelInMotionLens,
            roughness: 0.10,
            metalness: 0.30,
            emissive: 0x10161c,
            emissiveIntensity: 0.30,
        }),
        gear: WIM_GEAR,
    }),
    profiles: Object.freeze({
        torso: WIM_JERSEY,
        seat: WIM_SEAT,
        thigh: WIM_THIGH,
        shin: WIM_SHIN,
        upperArm: WIM_UPPER_ARM,
        forearm: WIM_FOREARM,
        neck: NECK,
        head: WIM_HELMET,
        boot: BOOT,
        bootSole: BOOT_SOLE,
        hand: WIM_GLOVE,
    }),
    shades: Object.freeze({ seat: WIM_SEAT_SHADE, legs: 1.0, collar: 1.0, sole: 1.9, neck: 0.42 }),
    parts: Object.freeze({
        hands: 'gear',
        neck: 'gear',
        kneePad: 'body',
        legs: 'limbs',
        seat: 'body',
    }),
    panels: Object.freeze({
        shoulders: Object.freeze({
            role: 'gear',
            casts: true,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'back',
                    u0: -0.44,
                    u1: 0.44,
                    from: 0.150,
                    to: 0.448,
                    uSegments: 6,
                    vSegments: 6,
                    lift: 0.060,
                    taper: 0.30,
                    shade: 0.98,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: -0.34,
                    u1: 0.34,
                    from: 0.362,
                    to: 0.436,
                    uSegments: 4,
                    vSegments: 3,
                    lift: 0.068,
                    taper: 0.34,
                    shade: 1.10,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: 0.30,
                    u1: 0.54,
                    mirrored: true,
                    from: 0.400,
                    to: 0.536,
                    uSegments: 3,
                    vSegments: 4,
                    lift: 0.010,
                    shade: 1.08,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -1.03,
                    u1: 0.57,
                    mirrored: true,
                    from: 0.520,
                    to: 0.536,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.010,
                    shade: 1.08,
                }),
            ]),
        }),
        torso: Object.freeze({
            role: 'gear',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -1.00,
                    u1: -0.76,
                    mirrored: true,
                    from: 0.240,
                    to: 0.536,
                    uSegments: 3,
                    vSegments: 7,
                    lift: 0.010,
                    shade: 1.08,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -Math.PI / 2 + 0.44,
                    u1: 0.57,
                    mirrored: true,
                    from: 0.240,
                    to: 0.286,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.010,
                    shade: 1.08,
                }),
            ]),
        }),
        waist: Object.freeze({
            role: 'body',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'back',
                    u0: WIM_PACK_STICKER.u0,
                    u1: WIM_PACK_STICKER.u1,
                    from: WIM_PACK_STICKER.from,
                    to: WIM_PACK_STICKER.to,
                    uSegments: 4,
                    vSegments: 3,
                    lift: 0.065,
                    sink: -0.020,
                    taper: 0.10,
                    shade: 1,
                    art: 'packMark',
                }),
            ]),
        }),
        thighPad: Object.freeze({
            role: 'body',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: WIM_THIGH_SHELL.u0,
                    u1: WIM_THIGH_SHELL.u1,
                    mirrored: true,
                    from: WIM_THIGH_SHELL.from,
                    to: WIM_THIGH_SHELL.to,
                    uSegments: 8,
                    vSegments: 5,
                    lift: 0.015,
                    taper: 0.26,
                    shade: WIM_GUARD_SHADE,
                    art: 'guardUpper',
                    artOn: -1,
                    artElse: 'guardPlain',
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: WIM_THIGH_SHELL.u0,
                    u1: WIM_THIGH_SHELL.u1,
                    mirrored: true,
                    from: -0.400,
                    to: WIM_CUP_TOP,
                    uSegments: 7,
                    vSegments: 2,
                    lift: 0.032,
                    taper: 0.30,
                    shade: 1,
                    art: 'cap',
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.16,
                    u1: 0.16,
                    from: -0.400,
                    to: WIM_THIGH_SHELL.to + 0.004,
                    uSegments: 2,
                    vSegments: 4,
                    lift: 0.026,
                    taper: 0.10,
                    shade: WIM_GUARD_SHADE,
                    art: 'guardFlat',
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.24,
                    u1: 0.24,
                    from: -0.372,
                    to: -0.332,
                    uSegments: 4,
                    vSegments: 2,
                    lift: 0.031,
                    taper: 0.78,
                    shade: WIM_GUARD_SHADE,
                    art: 'guardFlat',
                }),
            ]),
        }),
        kneePad: Object.freeze({
            role: 'body',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: WIM_THIGH_SHELL.u0,
                    u1: WIM_THIGH_SHELL.u1,
                    mirrored: true,
                    from: WIM_CUP_BOTTOM,
                    to: 0.000,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.038,
                    taper: 0.28,
                    shade: 1,
                    art: 'cap',
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: WIM_SHIN_PLATE.u0,
                    u1: WIM_SHIN_PLATE.u1,
                    mirrored: true,
                    from: WIM_SHIN_PLATE.from,
                    to: WIM_SHIN_PLATE.to,
                    uSegments: 7,
                    vSegments: 7,
                    lift: 0.018,
                    taper: 0.40,
                    shade: WIM_GUARD_SHADE,
                    art: 'guardLower',
                }),
                ...[-0.104, -0.148].map((from) => Object.freeze({
                    anchor: 'outboard',
                    u0: -0.24,
                    u1: 0.24,
                    from,
                    to: from + 0.028,
                    uSegments: 4,
                    vSegments: 2,
                    lift: 0.027,
                    taper: 0.78,
                    shade: WIM_GUARD_SHADE,
                    art: 'guardFlat',
                })),
                Object.freeze({
                    anchor: 'front',
                    u0: -Math.PI,
                    u1: Math.PI,
                    from: -0.240,
                    to: -0.226,
                    uSegments: 14,
                    vSegments: 1,
                    lift: 0.020,
                    taper: 0.28,
                    shade: 1,
                    art: 'cap',
                }),
            ]),
        }),
        head: Object.freeze([
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
                art: 'blue',
            }),
            Object.freeze({
                anchor: 'front',
                u0: 0,
                u1: Math.PI * 2,
                from: 0.058,
                to: 0.076,
                uSegments: 18,
                vSegments: 1,
                lift: 0.004,
                shade: 1.08,
                art: 'blue',
            }),
        ]),
        face: Object.freeze({
            role: 'face',
            casts: false,
            patches: Object.freeze([Object.freeze({
                    anchor: 'front',
                    u0: -0.80,
                    u1: 0.80,
                    from: 0.149,
                    to: 0.243,
                    uSegments: 9,
                    vSegments: 3,
                    lift: 0.007,
                    sink: -0.014,
                    taper: 0.22,
                    art: 'lens',
                })]),
        }),
    }),
    extras: Object.freeze([]),
    build: Object.freeze({ hand: Object.freeze([fullGloveThumb]) }),
    paint: Object.freeze({
        torso: paintWimTorso,
        thigh: paintWimThigh,
        shin: paintWimShin,
        boot: paintWimBoot,
        hand: paintWimHand,
    }),
    armCarriage: Object.freeze({ splay: 0.012, rise: 0 }),
});
