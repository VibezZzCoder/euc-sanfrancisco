// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.js';
import { limbProfile, loftGeometry, loftNormal, loftPoint, loftProfile, mergeGeometries, shaded, tintOver, vAtHeight } from './blockoutKit.js';
import { DRUNKARD_REGIONS, KIT_LABEL, KIT_PEAK, KIT_PLAIN, KIT_STRAP, PACK_PLAIN, createDrunkardAtlas, handCanPageS, hatFoamEdge } from './drunkardAtlas.js';
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
function tinted(geometry, tint) {
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i += 1)
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    return geometry;
}
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
const DRUNKARD_PRINT = Object.freeze({
    colour: BLOCKOUT_COLOURS.drunkardPrint,
    roughness: 0.80,
    metalness: 0.0,
});
const DRUNKARD_LID = Object.freeze({
    colour: BLOCKOUT_COLOURS.drunkardPrint,
    roughness: 0.44,
    metalness: 0.0,
});
const DRUNKARD_SKIN = Object.freeze({
    colour: BLOCKOUT_COLOURS.drunkardSkin,
    roughness: 0.74,
    metalness: 0.0,
});
const DRUNKARD_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.drunkardGear,
    roughness: 0.66,
    metalness: 0.0,
});
const DRUNKARD_AMBER_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardAmber);
const DRUNKARD_BROWN_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardBrown);
const DRUNKARD_GEAR_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardGear);
const DRUNKARD_GEAR_LINE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardGear, 1.6);
const DRUNKARD_BOOT_LINE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardGear, BLOCKOUT_COLOURS.drunkardGear, 1.6);
const DRUNKARD_CREAM_TINT = [1, 1, 1];
const DRUNKARD_GARMENT_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardIvory);
const DRUNKARD_HOP_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardHop);
const DRUNKARD_STUBBLE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0xb6885f);
const DRUNKARD_HAIR_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x4f3a2c);
const DRUNKARD_GOATEE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x6b563f);
const DRUNKARD_LIP_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0xa8705c);
const DRUNKARD_EAR_SHADE = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x8a6446);
const DRUNKARD_LENS_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, BLOCKOUT_COLOURS.drunkardLens);
const DRUNKARD_FRAME_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x33292c);
const DRUNKARD_PALE_LIFT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, BLOCKOUT_COLOURS.drunkardPrint);
const DRUNKARD_MOUTH_TINT = tintOver(BLOCKOUT_COLOURS.drunkardSkin, 0x5e2f24);
const DRUNKARD_NOSE_TINT = [1.14, 1.12, 1.09];
const DRUNKARD_BELLY_CENTRE = 0.190;
const DRUNKARD_BELLY_SPREAD = 0.115;
const DRUNKARD_BELLY_DEPTH = 0.22;
const DRUNKARD_JERSEY = loftProfile((() => {
    const heights = [-0.010, 0.018];
    for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030)
        heights.push(Math.round(y * 1000) / 1000);
    heights.push(0.500, 0.528, 0.548);
    return heights.map((y) => {
        const ring = ringOf(JACKET, y);
        const bump = Math.exp(-(((y - DRUNKARD_BELLY_CENTRE) / DRUNKARD_BELLY_SPREAD) ** 2));
        const deeper = ring.halfDepth * DRUNKARD_BELLY_DEPTH * bump;
        return {
            ...ring,
            halfWidth: ring.halfWidth * (1 + 0.06 * bump),
            halfDepth: ring.halfDepth + deeper,
            z: ring.z + deeper,
        };
    });
})());
const DRUNKARD_PAD_TOP = 0.87;
const DRUNKARD_THIGH_BLOCK_TOP = 0.33;
const DRUNKARD_PAD_BOTTOM = -0.088;
const DRUNKARD_BOOT_TOP = 0.72;
const DRUNKARD_HIP_DOME_APEX = 0.060;
const DRUNKARD_HIP_DOME = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [DRUNKARD_HIP_DOME_APEX, 0]].map(([y, scale]) => ({
    y: y,
    halfWidth: 0.083 * scale,
    halfDepth: 0.083 * 0.94 * scale,
    square: 2.4,
}));
const DRUNKARD_THIGH = loftProfile([
    ...limbAtHeights(RIDER_BLOCKOUT.thighLength, [0.083, 0.076, 0.064], [
        0, -0.040, -0.080, -0.120, -0.160, -0.200, -0.240, -0.280, -0.320,
        -RIDER_BLOCKOUT.thighLength * DRUNKARD_PAD_TOP + 0.002,
        -RIDER_BLOCKOUT.thighLength * DRUNKARD_PAD_TOP - 0.002,
        -0.375, -0.400,
    ], { flatten: 0.94, square: 2.4 }),
    ...DRUNKARD_HIP_DOME,
]);
const DRUNKARD_SEAT = loftProfile([
    { y: -0.118, halfWidth: 0.76 * TORSO_HALF_WIDTH, halfDepth: 0.78 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.088, halfWidth: 0.84 * TORSO_HALF_WIDTH, halfDepth: 0.85 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.055, halfWidth: 0.92 * TORSO_HALF_WIDTH, halfDepth: 0.91 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: -0.020, halfWidth: 0.97 * TORSO_HALF_WIDTH, halfDepth: 0.95 * TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.030, halfWidth: 0.93 * TORSO_HALF_WIDTH, halfDepth: 0.90 * TORSO_HALF_DEPTH, square: 2.6 },
]);
const DRUNKARD_SHIN = limbAtHeights(RIDER_BLOCKOUT.shinLength, [0.066, 0.060, 0.054], [
    0, -0.040, DRUNKARD_PAD_BOTTOM + 0.002, DRUNKARD_PAD_BOTTOM - 0.002,
    -0.120, -0.150, -0.180, -0.210, -0.235, -0.256,
    -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP + 0.002,
    -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP - 0.002,
    -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP - 0.014,
    -0.310, -0.340, -0.380,
], { flatten: 0.92, square: 2.4 });
const DRUNKARD_UPPER_ARM = loftProfile([
    { y: 0.034, halfWidth: 0, halfDepth: 0 },
    { y: 0.028, halfWidth: 0.032, halfDepth: 0.031, square: 2.3 },
    { y: 0.014, halfWidth: 0.053, halfDepth: 0.051, square: 2.3 },
    ...limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.062, 0.053, 0.045], [], {
        flatten: 0.95,
        square: 2.3,
    }).slice().reverse(),
]);
const DRUNKARD_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.050, 0.043, 0.035], [], {
    flatten: 0.94,
    square: 2.3,
});
const DRUNKARD_HAT = loftProfile([
    { y: 0.208, halfWidth: 0.110, halfDepth: 0.118, square: 2.5, z: 0.008 },
    { y: 0.218, halfWidth: 0.126, halfDepth: 0.136, square: 2.6, z: 0.010 },
    { y: 0.240, halfWidth: 0.129, halfDepth: 0.139, square: 2.6, z: 0.008 },
    { y: 0.270, halfWidth: 0.130, halfDepth: 0.140, square: 2.5, z: 0.004 },
    { y: 0.305, halfWidth: 0.121, halfDepth: 0.129, square: 2.4 },
    { y: 0.338, halfWidth: 0.101, halfDepth: 0.107, square: 2.3 },
    { y: 0.364, halfWidth: 0.070, halfDepth: 0.074, square: 2.2 },
    { y: 0.380, halfWidth: 0.032, halfDepth: 0.034, square: 2.2 },
    { y: 0.388, halfWidth: 0, halfDepth: 0 },
]);
const DRUNKARD_HAT_WIDEST = Math.max(...DRUNKARD_HAT.map((ring) => ring.halfWidth));
const DRUNKARD_HEAD_INSET = 0.012;
const DRUNKARD_HEAD = loftProfile([
    { y: 0.086, halfWidth: 0.050, halfDepth: 0.054, square: 2.4, z: 0.016 },
    { y: 0.104, halfWidth: 0.076, halfDepth: 0.082, square: 2.5, z: 0.016 },
    { y: 0.128, halfWidth: 0.094, halfDepth: 0.100, square: 2.5, z: 0.014 },
    { y: 0.160, halfWidth: 0.106, halfDepth: 0.112, square: 2.5, z: 0.010 },
    { y: 0.200, halfWidth: 0.111, halfDepth: 0.117, square: 2.5, z: 0.006 },
    ...DRUNKARD_HAT.filter((ring) => ring.y >= 0.240).map((ring) => ({
        y: ring.y,
        halfWidth: Math.max(0, ring.halfWidth - DRUNKARD_HEAD_INSET),
        halfDepth: Math.max(0, ring.halfDepth - DRUNKARD_HEAD_INSET),
        square: ring.square,
        z: ring.z,
    })),
]);
function frontAt(profile, y) {
    const ring = ringOf(profile, y);
    return ring.z + ring.halfDepth;
}
function surfaceZAt(profile, y, x) {
    const ring = ringOf(profile, y);
    const a = Math.abs(x - ring.x) / Math.max(1e-6, ring.halfWidth);
    if (a >= 1)
        return ring.z;
    return ring.z + ring.halfDepth * (1 - a ** ring.square) ** (1 / ring.square);
}
const DRUNKARD_MOUTH_HALF = 0.064;
const DRUNKARD_MOUTH_Y = 0.128;
const DRUNKARD_MOUTH_CORNER_RISE = 0.023;
function drunkardMouthCorner(side) {
    const x = side * (DRUNKARD_MOUTH_HALF + 0.010);
    const y = DRUNKARD_MOUTH_Y + DRUNKARD_MOUTH_CORNER_RISE;
    return new THREE.Vector3(x, y, surfaceZAt(DRUNKARD_HEAD, y, x) + 0.002);
}
const DRUNKARD_KIT = Object.freeze({
    canRadius: 0.045,
    canHeight: 0.165,
    canStandoff: 0.012,
    canBottom: 0.200,
    canAxisX: DRUNKARD_HAT_WIDEST + 0.012 + 0.045,
    canZ: 0.006,
    tubeRadius: 0.013,
    strawRadius: 0.0068,
    ferrule: Object.freeze({ half: 0.0175, length: 0.014 }),
    peak: Object.freeze({ y: 0.2135, z: 0.0316, halfWidth: 0.139, halfDepth: 0.1704 }),
    bracket: Object.freeze({ y: 0.282, half: 0.022 }),
    strap: Object.freeze({ centre: 0.46, height: 0.036, proud: 0.005 }),
    cradle: Object.freeze({ bar: 0.007, cupDrop: 0.018, railBury: 0.002 }),
    foam: Object.freeze({ crown: 0.014, temple: 0.006, gradeFrom: 0.270, gradeTo: 0.320, lip: 0.003, columns: 48, rows: 5 }),
    mouthCorner: drunkardMouthCorner,
    tube: (side) => [
        new THREE.Vector3(side * (DRUNKARD_HAT_WIDEST + 0.012 + 0.045), 0.352, 0.006),
        new THREE.Vector3(side * 0.205, 0.420, 0.000),
        new THREE.Vector3(side * 0.160, 0.492, -0.030),
        new THREE.Vector3(side * 0.205, 0.505, -0.075),
        new THREE.Vector3(side * 0.262, 0.430, -0.125),
        new THREE.Vector3(side * 0.260, 0.300, -0.150),
        new THREE.Vector3(side * 0.236, 0.174, -0.118),
        new THREE.Vector3(side * 0.200, 0.158, -0.040),
        new THREE.Vector3(side * 0.136, 0.146, 0.030),
    ],
    straw: (side) => [
        new THREE.Vector3(side * 0.136, 0.146, 0.030),
        new THREE.Vector3(side * 0.100, 0.152, 0.080),
        drunkardMouthCorner(side),
        new THREE.Vector3(side * 0.052, DRUNKARD_MOUTH_Y + 0.004, surfaceZAt(DRUNKARD_HEAD, DRUNKARD_MOUTH_Y + 0.004, side * 0.052) - 0.009),
    ],
});
const DRUNKARD_CAN = loftProfile((() => {
    const r = DRUNKARD_KIT.canRadius;
    const h = DRUNKARD_KIT.canHeight;
    return [
        { y: 0, halfWidth: 0, halfDepth: 0 },
        { y: h * 0.024, halfWidth: r * 0.82, halfDepth: r * 0.82, square: 2 },
        { y: h * 0.072, halfWidth: r, halfDepth: r, square: 2 },
        { y: h * 0.262, halfWidth: r, halfDepth: r, square: 2 },
        { y: h * 0.452, halfWidth: r, halfDepth: r, square: 2 },
        { y: h * 0.642, halfWidth: r, halfDepth: r, square: 2 },
        { y: h * 0.832, halfWidth: r, halfDepth: r, square: 2 },
        { y: h * 0.912, halfWidth: r * 0.91, halfDepth: r * 0.91, square: 2 },
        { y: h * 0.968, halfWidth: r * 0.82, halfDepth: r * 0.82, square: 2 },
        { y: h, halfWidth: 0, halfDepth: 0 },
    ];
})());
function foldOnto(geometry, rect) {
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, rect.s0 + uv.getX(i) * (rect.s1 - rect.s0), rect.t0 + uv.getY(i) * (rect.t1 - rect.t0));
    }
    uv.needsUpdate = true;
    return geometry;
}
function sweptTube(points, radius, tint, segments) {
    const curve = new THREE.CatmullRomCurve3([...points], false, 'centripetal');
    const along = segments ?? Math.max(22, Math.round(curve.getLength() / 0.024));
    const tube = shaded(new THREE.TubeGeometry(curve, along, radius, 6, false));
    return tinted(tube, tint);
}
function collarAlong(at, axis, half, length, tint) {
    const collar = tinted(loftGeometry(loftProfile([
        { y: -length / 2, halfWidth: half * 0.9, halfDepth: half * 0.9, square: 2 },
        { y: -length / 2 + 0.002, halfWidth: half, halfDepth: half, square: 2 },
        { y: length / 2 - 0.002, halfWidth: half, halfDepth: half, square: 2 },
        { y: length / 2, halfWidth: half * 0.9, halfDepth: half * 0.9, square: 2 },
    ]), { radialSegments: 8, capBottom: true, capTop: true }), tint);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    collar.applyQuaternion(turn);
    collar.translate(at.x, at.y, at.z);
    return collar;
}
function drunkardHatKit() {
    const parts = [];
    const { canAxisX, canBottom, canZ, canRadius, canHeight } = DRUNKARD_KIT;
    const inCanFrame = (side, geometry) => {
        geometry.rotateY(side * Math.PI / 2);
        geometry.translate(side * canAxisX, canBottom, canZ);
        return geometry;
    };
    for (const side of [-1, 1]) {
        const can = inCanFrame(side, loftGeometry(DRUNKARD_CAN, { radialSegments: 14, splitSeam: true }));
        parts.push(foldOnto(can, KIT_LABEL));
        const tubeKnots = DRUNKARD_KIT.tube(side);
        const strawKnots = DRUNKARD_KIT.straw(side);
        parts.push(foldOnto(sweptTube(tubeKnots, DRUNKARD_KIT.tubeRadius, DRUNKARD_AMBER_TINT), KIT_PLAIN));
        const strawCurve = new THREE.CatmullRomCurve3([...strawKnots], false, 'centripetal');
        const joint = strawKnots[0];
        const tangent = strawCurve.getTangentAt(0);
        parts.push(foldOnto(collarAlong(joint, tangent, DRUNKARD_KIT.ferrule.half, DRUNKARD_KIT.ferrule.length, DRUNKARD_GEAR_LINE_TINT), KIT_PLAIN));
        parts.push(foldOnto(sweptTube(strawKnots, DRUNKARD_KIT.strawRadius, DRUNKARD_GARMENT_TINT), KIT_PLAIN));
        const apex = canBottom + canHeight;
        const grommet = tinted(loftGeometry(loftProfile([
            { y: apex - 0.0065, halfWidth: 0.020, halfDepth: 0.020, square: 2, x: side * canAxisX, z: canZ },
            { y: apex + 0.004, halfWidth: 0.021, halfDepth: 0.021, square: 2, x: side * canAxisX, z: canZ },
            { y: apex + 0.008, halfWidth: 0.0235, halfDepth: 0.0235, square: 2, x: side * canAxisX, z: canZ },
            { y: apex + 0.011, halfWidth: 0.0175, halfDepth: 0.0175, square: 2, x: side * canAxisX, z: canZ },
        ]), { radialSegments: 10, capBottom: true, capTop: true }), DRUNKARD_GEAR_TINT);
        parts.push(foldOnto(grommet, KIT_PLAIN));
        const { y: bracketY, half } = DRUNKARD_KIT.bracket;
        const flank = ringOf(DRUNKARD_HAT, bracketY).halfWidth;
        const inboardFace = canAxisX - canRadius;
        const bracketX = side * ((flank - 0.006 + inboardFace + 0.004) / 2);
        const reach = (inboardFace + 0.004 - (flank - 0.006)) / 2;
        const bracket = tinted(loftGeometry(loftProfile([
            { y: bracketY - half, halfWidth: reach, halfDepth: 0.011, square: 3.5, x: bracketX, z: canZ },
            { y: bracketY + half, halfWidth: reach, halfDepth: 0.011, square: 3.5, x: bracketX, z: canZ },
        ]), { radialSegments: 8, capBottom: true, capTop: true }), DRUNKARD_GEAR_TINT);
        parts.push(foldOnto(bracket, KIT_PLAIN));
        const { centre, height, proud } = DRUNKARD_KIT.strap;
        const strapY = canHeight * centre;
        const strapRing = ringOf(DRUNKARD_CAN, strapY);
        const strapHalf = strapRing.halfWidth + proud;
        const strap = loftGeometry(loftProfile([
            { y: strapY - height / 2, halfWidth: strapHalf - 0.002, halfDepth: strapHalf - 0.002, square: 2 },
            { y: strapY - height / 2 + 0.002, halfWidth: strapHalf, halfDepth: strapHalf, square: 2 },
            { y: strapY + height / 2 - 0.002, halfWidth: strapHalf, halfDepth: strapHalf, square: 2 },
            { y: strapY + height / 2, halfWidth: strapHalf - 0.002, halfDepth: strapHalf - 0.002, square: 2 },
        ]), { radialSegments: 14, capBottom: true, capTop: true });
        parts.push(foldOnto(inCanFrame(side, strap), KIT_STRAP));
        const { bar, cupDrop, railBury } = DRUNKARD_KIT.cradle;
        const cupHalf = canRadius + proud;
        const cup = loftGeometry(loftProfile([
            { y: -cupDrop, halfWidth: cupHalf, halfDepth: cupHalf, square: 2 },
            { y: 0.004, halfWidth: cupHalf, halfDepth: cupHalf, square: 2 },
        ]), { radialSegments: 14, capBottom: true, capTop: true });
        parts.push(foldOnto(inCanFrame(side, tinted(cup, DRUNKARD_GEAR_TINT)), KIT_PLAIN));
        const railX = side * (canAxisX + canRadius - railBury);
        const rail = tinted(loftGeometry(loftProfile([
            { y: canBottom - cupDrop + 0.002, halfWidth: bar, halfDepth: bar * 2, square: 3.5, x: railX, z: canZ },
            { y: canBottom + strapY + height / 2, halfWidth: bar, halfDepth: bar * 2, square: 3.5, x: railX, z: canZ },
        ]), { radialSegments: 8, capBottom: true, capTop: true }), DRUNKARD_GEAR_TINT);
        parts.push(foldOnto(rail, KIT_PLAIN));
    }
    parts.push(foldOnto(drunkardHatFoam(), KIT_PLAIN));
    const { y, z, halfWidth, halfDepth } = DRUNKARD_KIT.peak;
    const peak = loftGeometry(loftProfile([
        { y: y - 0.0075, halfWidth: 0, halfDepth: 0, z },
        { y: y - 0.004, halfWidth: halfWidth * 0.95, halfDepth: halfDepth * 0.95, square: 2.3, z },
        { y, halfWidth, halfDepth, square: 2.3, z },
        { y: y + 0.004, halfWidth: halfWidth * 0.95, halfDepth: halfDepth * 0.95, square: 2.3, z },
        { y: y + 0.0075, halfWidth: 0, halfDepth: 0, z },
    ]), { radialSegments: 20 });
    parts.push(foldOnto(peak, KIT_PEAK));
    return mergeGeometries(parts);
}
function drunkardHatFoam() {
    const { columns, rows, crown, temple, gradeFrom, gradeTo, lip } = DRUNKARD_KIT.foam;
    const proud = (y) => {
        const grade = Math.min(1, Math.max(0, (y - gradeFrom) / (gradeTo - gradeFrom)));
        return temple + (crown - temple) * grade;
    };
    const apexV = DRUNKARD_HAT.length - 1;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const rowCount = rows + 2;
    for (let j = 0; j < rowCount; j += 1) {
        for (let k = 0; k <= columns; k += 1) {
            const s = k / columns;
            const u = s * Math.PI * 2;
            const edge = hatFoamEdge(s);
            const rimV = vAtHeight(DRUNKARD_HAT, edge);
            const v = j === 0
                ? vAtHeight(DRUNKARD_HAT, edge - lip)
                : rimV + (apexV - rimV) * ((j - 1) / rows);
            loftPoint(DRUNKARD_HAT, u, v, point);
            loftNormal(DRUNKARD_HAT, u, v, normal);
            const out = j === 0 ? 0 : proud(point.y);
            point.addScaledVector(normal, out);
            positions.push(point.x, point.y, point.z);
            normals.push(normal.x, normal.y, normal.z);
            uvs.push(s, j / (rowCount - 1));
        }
    }
    const at = (row, k) => row * (columns + 1) + k;
    for (let j = 0; j < rowCount - 1; j += 1) {
        for (let k = 0; k < columns; k += 1) {
            const a = at(j, k);
            const b = at(j, k + 1);
            const c = at(j + 1, k);
            const d = at(j + 1, k + 1);
            indices.push(a, d, b, a, c, d);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return shaded(geometry);
}
const DRUNKARD_EAR = Object.freeze([
    { y: 0.164, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: 0.104, z: 0.006 },
    { y: 0.184, halfWidth: 0.013, halfDepth: 0.018, square: 2.3, x: 0.114, z: 0.008 },
    { y: 0.206, halfWidth: 0.009, halfDepth: 0.013, square: 2.2, x: 0.108, z: 0.006 },
]);
function drunkardBall(halfWidth) {
    return loftProfile([
        { y: -halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
        { y: -halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
        { y: -halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
        { y: halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
        { y: halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
        { y: halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
    ]);
}
function drunkardFaceParts() {
    const head = loftGeometry(DRUNKARD_HEAD, { radialSegments: 22 });
    {
        const position = head.getAttribute('position');
        const colour = head.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const y = position.getY(i);
            const z = position.getZ(i);
            if (y > 0.092 && y < 0.150 && z > 0.02) {
                colour.setXYZ(i, DRUNKARD_STUBBLE_TINT[0], DRUNKARD_STUBBLE_TINT[1], DRUNKARD_STUBBLE_TINT[2]);
            }
            else if (y <= 0.200 && ((y > 0.170 && z < 0.045) || (y > 0.150 && z < 0.010) || (y > 0.118 && z < -0.060))) {
                colour.setXYZ(i, DRUNKARD_HAIR_TINT[0], DRUNKARD_HAIR_TINT[1], DRUNKARD_HAIR_TINT[2]);
            }
        }
    }
    const parts = [head];
    const front = (y) => frontAt(DRUNKARD_HEAD, y);
    for (const side of [-1, 1]) {
        parts.push(tinted(loftGeometry(loftProfile([
            { y: 0.174, halfWidth: 0.024, halfDepth: 0.005, square: 3.0, x: side * 0.051, z: front(0.174) - 0.006 },
            { y: 0.182, halfWidth: 0.038, halfDepth: 0.010, square: 3.2, x: side * 0.051, z: front(0.182) - 0.002 },
            { y: 0.210, halfWidth: 0.038, halfDepth: 0.010, square: 3.2, x: side * 0.051, z: front(0.210) - 0.002 },
            { y: 0.218, halfWidth: 0.024, halfDepth: 0.005, square: 3.0, x: side * 0.051, z: front(0.218) - 0.006 },
        ]), { radialSegments: 10 }), DRUNKARD_FRAME_TINT));
        parts.push(tinted(loftGeometry(loftProfile([
            { y: 0.180, halfWidth: 0.020, halfDepth: 0.004, square: 3.0, x: side * 0.051, z: front(0.180) + 0.001 },
            { y: 0.187, halfWidth: 0.031, halfDepth: 0.007, square: 3.1, x: side * 0.051, z: front(0.187) + 0.003 },
            { y: 0.205, halfWidth: 0.031, halfDepth: 0.007, square: 3.1, x: side * 0.051, z: front(0.205) + 0.003 },
            { y: 0.212, halfWidth: 0.020, halfDepth: 0.004, square: 3.0, x: side * 0.051, z: front(0.212) + 0.001 },
        ]), { radialSegments: 10 }), DRUNKARD_LENS_TINT));
        const glint = tinted(loftGeometry(drunkardBall(0.0075), { radialSegments: 8 }), DRUNKARD_PALE_LIFT);
        glint.scale(1.5, 0.7, 0.45);
        glint.translate(side * 0.065, 0.203, front(0.203) + 0.0105);
        parts.push(glint);
        const ear = loftGeometry(loftProfile(DRUNKARD_EAR.map((ring) => ({ ...ring, x: side * ring.x }))), { radialSegments: 10, shade: 0.96 });
        {
            const position = ear.getAttribute('position');
            const colour = ear.getAttribute('color');
            for (let i = 0; i < position.count; i += 1) {
                if (position.getY(i) < DRUNKARD_EAR[0].y + 1e-6)
                    colour.setXYZ(i, 0.88, 0.88, 0.88);
            }
        }
        parts.push(ear);
        parts.push(tinted(loftGeometry(loftProfile([[0.172, 0], [0.184, 1], [0.198, 2]].map(([y, i]) => {
            const ring = DRUNKARD_EAR[i];
            return { y, halfWidth: 0.0045, halfDepth: 0.0085, square: 2.2, x: side * (ring.x + ring.halfWidth - 0.004), z: ring.z + 0.002 };
        })), { radialSegments: 6 }), DRUNKARD_EAR_SHADE));
    }
    parts.push(tinted(loftGeometry(loftProfile([
        { y: 0.199, halfWidth: 0.014, halfDepth: 0.005, square: 3, z: front(0.199) + 0.002 },
        { y: 0.2065, halfWidth: 0.026, halfDepth: 0.007, square: 3, z: front(0.2065) + 0.004 },
        { y: 0.214, halfWidth: 0.014, halfDepth: 0.005, square: 3, z: front(0.214) + 0.002 },
    ]), { radialSegments: 6 }), DRUNKARD_FRAME_TINT));
    parts.push(tinted(loftGeometry(loftProfile([
        { y: 0.146, halfWidth: 0.011, halfDepth: 0.007, square: 2.4, z: front(0.146) + 0.002 },
        { y: 0.160, halfWidth: 0.017, halfDepth: 0.011, square: 2.5, z: front(0.160) + 0.012 },
        { y: 0.178, halfWidth: 0.012, halfDepth: 0.007, square: 2.4, z: front(0.178) + 0.004 },
    ]), { radialSegments: 8 }), DRUNKARD_NOSE_TINT));
    parts.push(drunkardAcross({
        halfWidth: DRUNKARD_MOUTH_HALF, y: DRUNKARD_MOUTH_Y, halfHeight: 0.016, thickness: 0.010,
        sink: -0.004, rise: DRUNKARD_MOUTH_CORNER_RISE, tint: DRUNKARD_MOUTH_TINT,
    }));
    parts.push(drunkardAcross({
        halfWidth: 0.055, y: DRUNKARD_MOUTH_Y + 0.0035, halfHeight: 0.0055, thickness: 0.006,
        sink: 0.0045, rise: DRUNKARD_MOUTH_CORNER_RISE * 0.85, tint: DRUNKARD_PALE_LIFT,
    }));
    parts.push(drunkardAcross({
        halfWidth: 0.050, y: DRUNKARD_MOUTH_Y - 0.0185, halfHeight: 0.0045, thickness: 0.006,
        sink: 0.001, rise: DRUNKARD_MOUTH_CORNER_RISE * 0.6, tint: DRUNKARD_LIP_TINT,
    }));
    parts.push(drunkardAcross({
        halfWidth: 0.026, y: 0.1478, halfHeight: 0.0032, thickness: 0.006,
        sink: 0.002, rise: 0.004, tint: DRUNKARD_GOATEE_TINT,
    }));
    parts.push(tinted(loftGeometry(loftProfile([
        { y: 0.052, halfWidth: 0, halfDepth: 0, z: frontAt(NECK, 0.052) + 0.019 },
        { y: 0.061, halfWidth: 0.007, halfDepth: 0.008, square: 2.4, z: frontAt(NECK, 0.061) + 0.021 },
        { y: 0.070, halfWidth: 0.012, halfDepth: 0.010, square: 2.5, z: frontAt(NECK, 0.070) + 0.023 },
        { y: 0.080, halfWidth: 0.017, halfDepth: 0.011, square: 2.5, z: frontAt(NECK, 0.080) + 0.025 },
        { y: 0.090, halfWidth: 0.022, halfDepth: 0.012, square: 2.6, z: front(0.090) + 0.002 },
        { y: 0.099, halfWidth: 0.026, halfDepth: 0.011, square: 2.6, z: front(0.099) + 0.001 },
        { y: 0.1065, halfWidth: 0.023, halfDepth: 0.008, square: 2.6, z: front(0.1065) - 0.001 },
    ]), { radialSegments: 10 }), DRUNKARD_GOATEE_TINT));
    return mergeGeometries(parts);
}
function drunkardAcross(spec) {
    const stations = 13;
    const rings = [];
    for (let i = 0; i < stations; i += 1) {
        const t = -1 + (2 * i) / (stations - 1);
        const x = t * spec.halfWidth;
        const y = spec.y + spec.rise * t * t;
        const height = spec.halfHeight * Math.max(0, 1 - t * t) ** 0.3;
        rings.push({
            y: x,
            halfWidth: Math.max(0, height),
            halfDepth: spec.thickness / 2,
            square: 2.2,
            x: -y,
            z: surfaceZAt(DRUNKARD_HEAD, y, x) + spec.sink,
        });
    }
    const geometry = loftGeometry(loftProfile(rings), { radialSegments: 10 });
    geometry.rotateZ(-Math.PI / 2);
    return tinted(geometry, spec.tint);
}
const DRUNKARD_PACK_HALF_DEPTH = 0.045;
const DRUNKARD_PACK_Z = (() => {
    const point = new THREE.Vector3();
    let back = Infinity;
    for (const y of [0.20, 0.26, 0.32, 0.38, 0.44]) {
        loftPoint(DRUNKARD_JERSEY, -Math.PI / 2, vAtHeight(DRUNKARD_JERSEY, y), point);
        back = Math.min(back, point.z);
    }
    return back - DRUNKARD_PACK_HALF_DEPTH + 0.010;
})();
const DRUNKARD_BOX_TOP = 0.446;
const DRUNKARD_PACK = loftProfile([
    { y: 0.168, halfWidth: 0.060, halfDepth: 0.028, square: 2.6, z: DRUNKARD_PACK_Z },
    { y: 0.182, halfWidth: 0.092, halfDepth: 0.043, square: 3.4, z: DRUNKARD_PACK_Z },
    { y: 0.205, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: 0.255, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: 0.305, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: 0.355, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: 0.405, halfWidth: 0.096, halfDepth: DRUNKARD_PACK_HALF_DEPTH, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: 0.418, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: DRUNKARD_BOX_TOP, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: DRUNKARD_PACK_Z },
    { y: 0.452, halfWidth: 0.088, halfDepth: 0.043, square: 3.0, z: DRUNKARD_PACK_Z },
    { y: 0.458, halfWidth: 0.060, halfDepth: 0.030, square: 2.6, z: DRUNKARD_PACK_Z },
    { y: 0.462, halfWidth: 0, halfDepth: 0, z: DRUNKARD_PACK_Z },
]);
const DRUNKARD_STRAP_SHADE = 1.60;
const DRUNKARD_VALVE_TINT = tintOver(BLOCKOUT_COLOURS.drunkardPrint, BLOCKOUT_COLOURS.drunkardIvory, 0.45);
const DRUNKARD_STRAP = Object.freeze({
    chestOuter: -1.00,
    chestInner: -0.76,
    crossingFrom: 0.520,
    crossingTo: 0.536,
    wrapFrom: 0.240,
    wrapTo: 0.286,
    packHalfAngle: 0.45,
});
const DRUNKARD_HOSE_RADIUS = 0.012;
const DRUNKARD_VALVE = (() => {
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const v = vAtHeight(DRUNKARD_JERSEY, 0.478);
    loftPoint(DRUNKARD_JERSEY, Math.PI / 2 + 0.90, v, point);
    loftNormal(DRUNKARD_JERSEY, Math.PI / 2 + 0.90, v, normal);
    return point.addScaledVector(normal, 0.020);
})();
const DRUNKARD_HOSE_LIFT = 0.010 + DRUNKARD_HOSE_RADIUS + 0.0055;
function drunkardOnJersey(u, y) {
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const v = vAtHeight(DRUNKARD_JERSEY, y);
    loftPoint(DRUNKARD_JERSEY, u, v, point);
    loftNormal(DRUNKARD_JERSEY, u, v, normal);
    return point.addScaledVector(normal, DRUNKARD_HOSE_LIFT);
}
const DRUNKARD_VALVE_HALF_WIDTH = 0.019;
const DRUNKARD_HOSE = Object.freeze({
    radius: DRUNKARD_HOSE_RADIUS,
    crossingX: -0.132,
    valve: DRUNKARD_VALVE,
    valveHalfWidth: DRUNKARD_VALVE_HALF_WIDTH,
    valveTint: DRUNKARD_VALVE_TINT,
    strapShade: DRUNKARD_STRAP_SHADE,
    points: () => [
        new THREE.Vector3(-0.100 + 0.008, DRUNKARD_BOX_TOP - 0.006, DRUNKARD_PACK_Z - 0.006),
        drunkardOnJersey(-2.231, 0.488),
        drunkardOnJersey(-3.060, 0.508),
        drunkardOnJersey(2.309, 0.497),
        DRUNKARD_VALVE.clone(),
    ],
});
function drunkardPack() {
    const pack = loftGeometry(DRUNKARD_PACK, { radialSegments: 24, splitSeam: true });
    const hose = foldOnto(sweptTube(DRUNKARD_HOSE.points(), DRUNKARD_HOSE_RADIUS, DRUNKARD_AMBER_TINT), PACK_PLAIN);
    const { x, y, z } = DRUNKARD_HOSE.valve;
    const valve = tinted(loftGeometry(loftProfile([
        { y: y - 0.017, halfWidth: 0, halfDepth: 0, x, z },
        { y: y - 0.013, halfWidth: 0.014, halfDepth: 0.012, square: 2.4, x, z },
        { y: y - 0.002, halfWidth: DRUNKARD_VALVE_HALF_WIDTH, halfDepth: 0.015, square: 2.6, x, z },
        { y: y + 0.010, halfWidth: 0.017, halfDepth: 0.014, square: 2.4, x, z },
        { y: y + 0.016, halfWidth: 0, halfDepth: 0, x, z },
    ]), { radialSegments: 10 }), DRUNKARD_VALVE_TINT);
    return mergeGeometries([pack, hose, foldOnto(valve, PACK_PLAIN)]);
}
const DRUNKARD_HAND_CAN = Object.freeze({
    radius: 0.045,
    top: -0.055,
    bottom: -0.220,
    z: 0.018,
    x: 0.008,
});
const DRUNKARD_DENSITY = Object.freeze({ limb: 18, torso: 30, head: 28, hand: 12 });
const DRUNKARD_GLOVE = loftProfile([
    { y: 0, halfWidth: 0.040, halfDepth: 0.035, square: 2.6 },
    { y: -0.016, halfWidth: 0.044, halfDepth: 0.038, square: 2.8 },
    { y: -0.022, halfWidth: 0.046, halfDepth: 0.040, square: 2.8 },
    { y: -0.028, halfWidth: 0.043, halfDepth: 0.037, square: 2.8 },
    { y: -0.036, halfWidth: 0.031, halfDepth: 0.024, square: 2.8 },
    { y: -0.046, halfWidth: 0.036, halfDepth: 0.026, square: 2.85 },
    { y: -0.058, halfWidth: 0.041, halfDepth: 0.022, square: 2.85 },
    { y: -0.072, halfWidth: 0.040, halfDepth: 0.022, square: 2.9 },
    { y: -0.088, halfWidth: 0.033, halfDepth: 0.024, square: 2.8 },
    { y: -0.098, halfWidth: 0.023, halfDepth: 0.020, square: 2.6 },
    { y: -0.105, halfWidth: 0, halfDepth: 0 },
]);
const DRUNKARD_GLOVE_VERTICES = (() => {
    const glove = loftGeometry(DRUNKARD_GLOVE, { radialSegments: DRUNKARD_DENSITY.hand });
    const count = glove.getAttribute('position').count;
    glove.dispose();
    return count;
})();
function emptyPart() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
    return geometry;
}
function drunkardFreeFingers(side) {
    if (side > 0)
        return emptyPart();
    return loftGeometry(loftProfile([
        { y: -0.076, halfWidth: 0.038, halfDepth: 0.023, square: 2.9, z: 0.002 },
        { y: -0.098, halfWidth: 0.037, halfDepth: 0.024, square: 2.9, z: 0.006 },
        { y: -0.118, halfWidth: 0.033, halfDepth: 0.023, square: 2.8, z: 0.011 },
        { y: -0.133, halfWidth: 0.023, halfDepth: 0.017, square: 2.5, z: 0.014 },
        { y: -0.141, halfWidth: 0, halfDepth: 0, z: 0.015 },
    ]), { radialSegments: DRUNKARD_DENSITY.hand });
}
function drunkardThumb(side) {
    return side > 0 ? emptyPart() : fullGloveThumb(side);
}
const DRUNKARD_FREE_HAND_VERTICES = (() => {
    const parts = [drunkardFreeFingers(-1), drunkardThumb(-1)];
    const count = parts.reduce((total, part) => total + part.getAttribute('position').count, 0);
    for (const part of parts)
        part.dispose();
    return count;
})();
const DRUNKARD_HAND_CAN_RIM = 0.010;
const DRUNKARD_HAND_CAN_LINE = 0.004;
const DRUNKARD_HAND_CAN_TOP_BAND = 0.080;
const DRUNKARD_HAND_CAN_DRIP = 0.012;
const DRUNKARD_HAND_CAN_BANDS = Object.freeze({
    rim: DRUNKARD_HAND_CAN_RIM,
    line: DRUNKARD_HAND_CAN_LINE,
    top: DRUNKARD_HAND_CAN.top - DRUNKARD_HAND_CAN.bottom - DRUNKARD_HAND_CAN_TOP_BAND,
    drip: DRUNKARD_HAND_CAN_DRIP,
});
const DRUNKARD_HAND_CAN_PROFILE = loftProfile((() => {
    const { radius, top, bottom, z } = DRUNKARD_HAND_CAN;
    const height = top - bottom;
    const { rim, line, top: cream } = DRUNKARD_HAND_CAN_BANDS;
    const full = { halfWidth: radius, halfDepth: radius, square: 2, z };
    const barrel = [];
    for (let k = 0; k <= 4; k += 1)
        barrel.push({ y: rim + line + ((cream - rim - line) * k) / 4, ...full });
    return [
        { y: 0, halfWidth: 0, halfDepth: 0, z },
        { y: 0.003, halfWidth: radius * 0.82, halfDepth: radius * 0.82, square: 2, z },
        { y: rim, ...full },
        ...barrel,
        { y: height - 0.011, halfWidth: radius * 0.91, halfDepth: radius * 0.91, square: 2, z },
        { y: height - 0.004, halfWidth: radius * 0.82, halfDepth: radius * 0.82, square: 2, z },
        { y: height, halfWidth: 0, halfDepth: 0, z },
    ];
})());
function drunkardHandCan(side) {
    if (side < 0)
        return emptyPart();
    const can = loftGeometry(DRUNKARD_HAND_CAN_PROFILE, { radialSegments: 12, splitSeam: true });
    can.translate(side * DRUNKARD_HAND_CAN.x, DRUNKARD_HAND_CAN.bottom, 0);
    return can;
}
const DRUNKARD_CAN_VERTICES = (() => {
    const can = drunkardHandCan(1);
    const count = can.getAttribute('position').count;
    can.dispose();
    return count;
})();
const DRUNKARD_GRIP = Object.freeze({ finger: 0.008, thumb: 0.009, upper: -0.079, lower: -0.097 });
function drunkardHandGrip(side) {
    if (side < 0)
        return emptyPart();
    const { finger, thumb, upper, lower } = DRUNKARD_GRIP;
    const { radius, z: canZ, x: canX } = DRUNKARD_HAND_CAN;
    const at = (deg, bury, y) => {
        const a = (deg * Math.PI) / 180;
        return new THREE.Vector3(side * (canX + Math.sin(a) * (radius - bury)), y, canZ + Math.cos(a) * (radius - bury));
    };
    const bar = (y, rootDeg) => [
        at(rootDeg, 0.008, y),
        at(-65, 0.002, y),
        at(-21, 0.002, y - 0.002),
        at(26, 0.002, y - 0.002),
        at(69, 0.002, y),
    ];
    const parts = [
        sweptTube(bar(upper, -100), finger, DRUNKARD_GEAR_TINT, 6),
        sweptTube(bar(lower, -92), finger, DRUNKARD_GEAR_TINT, 6),
        sweptTube([
            at(101, 0.008, -0.058),
            at(86, 0.004, -0.070),
            at(63, 0.004, -0.084),
        ], thumb, DRUNKARD_GEAR_TINT, 6),
    ];
    return mergeGeometries(parts);
}
const DRUNKARD_SEAT_SHADE = 0.86;
function paintDrunkardTorso(geometry) {
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i += 1) {
        if (Math.abs(colour.getX(i) - DRUNKARD_SEAT_SHADE) > 1e-6)
            continue;
        colour.setXYZ(i, DRUNKARD_AMBER_TINT[0], DRUNKARD_AMBER_TINT[1], DRUNKARD_AMBER_TINT[2]);
    }
}
function underDrunkardPad(x, z) {
    return Math.abs(Math.atan2(x, z)) < 1.20;
}
const DRUNKARD_PANEL = Object.freeze({ inner: 0.18, outer: 0.92 });
const DRUNKARD_THIGH_BLOCK_END = 2.10;
function onDrunkardPanel(x, z, side) {
    const angle = Math.atan2(side * x, z);
    return angle > DRUNKARD_PANEL.inner && angle < DRUNKARD_PANEL.outer;
}
function paintDrunkardThigh(geometry, side) {
    const padTop = -RIDER_BLOCKOUT.thighLength * DRUNKARD_PAD_TOP;
    const blockTop = -RIDER_BLOCKOUT.thighLength * DRUNKARD_THIGH_BLOCK_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const x = position.getX(i);
        const z = position.getZ(i);
        const outer = Math.atan2(side * x, z);
        const tint = y <= padTop && underDrunkardPad(x, z)
            ? DRUNKARD_BROWN_TINT
            : y <= blockTop && outer >= DRUNKARD_PANEL.outer && outer < DRUNKARD_THIGH_BLOCK_END
                ? DRUNKARD_BROWN_TINT
                : onDrunkardPanel(x, z, side) && y > padTop + 0.02
                    ? DRUNKARD_GARMENT_TINT
                    : DRUNKARD_AMBER_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintDrunkardShin(geometry, side) {
    const cuff = -RIDER_BLOCKOUT.shinLength * DRUNKARD_BOOT_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const x = position.getX(i);
        const z = position.getZ(i);
        let tint;
        if (y < cuff) {
            const collar = y > cuff - 0.016;
            const laces = z > 0 && Math.abs(x) < 0.016 * (Math.hypot(x, z) / 0.05);
            tint = collar || laces ? DRUNKARD_GARMENT_TINT : DRUNKARD_AMBER_TINT;
        }
        else if (y >= DRUNKARD_PAD_BOTTOM && underDrunkardPad(x, z)) {
            tint = DRUNKARD_BROWN_TINT;
        }
        else if (onDrunkardPanel(x, z, side) && y < DRUNKARD_PAD_BOTTOM - 0.02) {
            tint = DRUNKARD_GARMENT_TINT;
        }
        else {
            tint = DRUNKARD_AMBER_TINT;
        }
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintDrunkardBoot(geometry) {
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
        const laces = t > 0.36 && t < 0.62 && z > 0.02 && Math.abs(x) < 0.014;
        if (ankleBand || laces) {
            colour.setXYZ(i, DRUNKARD_BOOT_LINE_TINT[0], DRUNKARD_BOOT_LINE_TINT[1], DRUNKARD_BOOT_LINE_TINT[2]);
        }
    }
}
function paintDrunkardHand(geometry, side) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    const uv = geometry.getAttribute('uv');
    const blank = DRUNKARD_REGIONS.blank;
    const page = DRUNKARD_REGIONS.handCan;
    const palm = DRUNKARD_GLOVE_VERTICES + (side < 0 ? DRUNKARD_FREE_HAND_VERTICES : 0);
    const can = palm + (side > 0 ? DRUNKARD_CAN_VERTICES : 0);
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        let tint;
        if (i < palm) {
            const z = position.getZ(i);
            const cuff = y > -0.024 && y < -0.012;
            const knuckles = y < -0.040 && y > -0.062 && z > 0.012;
            tint = cuff ? DRUNKARD_HOP_TINT : knuckles ? DRUNKARD_GEAR_LINE_TINT : DRUNKARD_GEAR_TINT;
        }
        else if (i < can) {
            tint = DRUNKARD_CREAM_TINT;
            const u01 = (uv.getX(i) - blank.u0) / (blank.u1 - blank.u0);
            const v01 = (uv.getY(i) - blank.v0) / (blank.v1 - blank.v0);
            uv.setXY(i, page.u0 + (page.u1 - page.u0) * handCanPageS(u01), page.v0 + (page.v1 - page.v0) * v01);
        }
        else {
            tint = DRUNKARD_GEAR_TINT;
        }
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
    uv.needsUpdate = true;
}
const DRUNKARD_KNEE_PAD = Object.freeze({ u0: -0.58, u1: 0.58, from: DRUNKARD_PAD_BOTTOM + 0.002, to: -0.010, lift: 0.022 });
const DRUNKARD_SHEET_LAYOUT = Object.freeze({
    torso: DRUNKARD_JERSEY,
    upperArm: DRUNKARD_UPPER_ARM,
    forearm: DRUNKARD_FOREARM,
    shin: DRUNKARD_SHIN,
    hat: DRUNKARD_HAT,
    chestHop: Object.freeze({ width: 0.118, centre: 0.370 }),
    kneePad: DRUNKARD_KNEE_PAD,
    can: DRUNKARD_CAN,
    handCan: DRUNKARD_HAND_CAN_PROFILE,
    handCanBands: DRUNKARD_HAND_CAN_BANDS,
    pack: DRUNKARD_PACK,
});
export const DRUNKARD_LOOK = Object.freeze({
    id: 'drunkard',
    density: DRUNKARD_DENSITY,
    atlas: Object.freeze({
        paintInput: () => ({ cache: 'drunkardAtlas.ts', args: [DRUNKARD_SHEET_LAYOUT] }),
        build: () => createDrunkardAtlas(DRUNKARD_SHEET_LAYOUT),
        roles: Object.freeze(['body', 'head']),
        region: (art) => (art !== undefined && art in DRUNKARD_REGIONS ? DRUNKARD_REGIONS[art] : DRUNKARD_REGIONS.blank),
        lofts: Object.freeze({ torso: 'jersey', upperArm: 'sleeve', forearm: 'forearm', head: 'hat' }),
    }),
    materials: Object.freeze({
        body: DRUNKARD_PRINT,
        limbs: DRUNKARD_PRINT,
        accent: DRUNKARD_SKIN,
        head: DRUNKARD_LID,
        face: DRUNKARD_SKIN,
        gear: DRUNKARD_GEAR,
    }),
    profiles: Object.freeze({
        torso: DRUNKARD_JERSEY,
        seat: DRUNKARD_SEAT,
        thigh: DRUNKARD_THIGH,
        shin: DRUNKARD_SHIN,
        upperArm: DRUNKARD_UPPER_ARM,
        forearm: DRUNKARD_FOREARM,
        neck: NECK,
        head: DRUNKARD_HAT,
        boot: BOOT,
        bootSole: BOOT_SOLE,
        hand: DRUNKARD_GLOVE,
    }),
    shades: Object.freeze({ seat: DRUNKARD_SEAT_SHADE, legs: 1.0, collar: 1.0, sole: 0.78, neck: 1.0 }),
    parts: Object.freeze({
        hands: 'body',
        neck: 'accent',
        kneePad: 'body',
        legs: 'limbs',
        seat: 'body',
    }),
    panels: Object.freeze({
        torso: Object.freeze({
            role: 'gear',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: DRUNKARD_STRAP.chestOuter,
                    u1: DRUNKARD_STRAP.chestInner,
                    mirrored: true,
                    from: DRUNKARD_STRAP.wrapFrom,
                    to: DRUNKARD_STRAP.crossingTo,
                    uSegments: 3,
                    vSegments: 7,
                    lift: 0.010,
                    shade: DRUNKARD_STRAP_SHADE,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -Math.PI / 2 + DRUNKARD_STRAP.packHalfAngle,
                    u1: Math.PI / 2 + DRUNKARD_STRAP.chestOuter,
                    mirrored: true,
                    from: DRUNKARD_STRAP.wrapFrom,
                    to: DRUNKARD_STRAP.wrapTo,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.010,
                    shade: DRUNKARD_STRAP_SHADE,
                }),
                Object.freeze({
                    anchor: 'back',
                    u0: 0.30,
                    u1: 0.54,
                    mirrored: true,
                    from: 0.400,
                    to: DRUNKARD_STRAP.crossingTo,
                    uSegments: 3,
                    vSegments: 4,
                    lift: 0.010,
                    shade: DRUNKARD_STRAP_SHADE,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -Math.PI / 2 + 0.54,
                    u1: Math.PI / 2 + DRUNKARD_STRAP.chestOuter,
                    mirrored: true,
                    from: DRUNKARD_STRAP.crossingFrom,
                    to: DRUNKARD_STRAP.crossingTo,
                    uSegments: 8,
                    vSegments: 1,
                    lift: 0.010,
                    shade: DRUNKARD_STRAP_SHADE,
                }),
            ]),
        }),
        kneePad: Object.freeze({
            role: 'body',
            casts: false,
            patches: Object.freeze([Object.freeze({
                    anchor: 'front',
                    u0: DRUNKARD_KNEE_PAD.u0,
                    u1: DRUNKARD_KNEE_PAD.u1,
                    from: DRUNKARD_KNEE_PAD.from,
                    to: DRUNKARD_KNEE_PAD.to,
                    uSegments: 10,
                    vSegments: 5,
                    lift: DRUNKARD_KNEE_PAD.lift,
                    taper: 0.36,
                    bulge: 0.20,
                    shade: 1,
                    art: 'knee',
                })]),
        }),
        head: Object.freeze([]),
    }),
    extras: Object.freeze([
        Object.freeze({
            name: 'rider-drunkard-hat-kit',
            joint: 'neck',
            role: 'body',
            casts: true,
            art: 'kit',
            build: drunkardHatKit,
        }),
        Object.freeze({
            name: 'rider-drunkard-face',
            joint: 'neck',
            role: 'accent',
            casts: true,
            build: drunkardFaceParts,
        }),
        Object.freeze({
            name: 'rider-drunkard-pack',
            joint: 'pelvis',
            role: 'body',
            casts: true,
            art: 'pack',
            build: drunkardPack,
        }),
    ]),
    build: Object.freeze({
        hand: Object.freeze([drunkardFreeFingers, drunkardThumb, drunkardHandCan, drunkardHandGrip]),
    }),
    paint: Object.freeze({
        torso: paintDrunkardTorso,
        thigh: paintDrunkardThigh,
        shin: paintDrunkardShin,
        boot: paintDrunkardBoot,
        hand: paintDrunkardHand,
    }),
    armCarriage: Object.freeze({ splay: 0.050, rise: 0.015 }),
    motion: Object.freeze({
        swayPelvisRoll: 0.12,
        swayHeadTilt: 0.20,
        swayArmSplay: 0.07,
        swayArmSwing: 0.04,
        staggerArms: 0.8,
        staggerHips: 0.6,
        staggerHeadLoll: 0.20,
        sipNeckPitch: 0.35,
        overLean: 0.25,
    }),
});
