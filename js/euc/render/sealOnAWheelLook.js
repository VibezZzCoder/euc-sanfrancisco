// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/sealOnAWheelLook.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS as C, RIDER_BLOCKOUT as B } from '../data/tuning.js';
import { limbProfile, loftGeometry, loftPoint, loftProfile, mergeGeometries, patchGeometry, tintOver, vAtHeight, } from './blockoutKit.js';
import { SEAL_REGIONS, createSealAtlas } from './sealAtlas.js';
const SEAL_TORSO_HALF_WIDTH = B.torsoWidth / 2;
const SEAL_TORSO_HALF_DEPTH = B.torsoDepth / 2;
function sealRingAt(profile, y) {
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
function sealLimbAtHeights(length, radii, heights, options) {
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
const SEAL_JACKET = loftProfile([
    { y: -0.010, halfWidth: 1.03 * SEAL_TORSO_HALF_WIDTH, halfDepth: 1.01 * SEAL_TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.018, halfWidth: 0.98 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.96 * SEAL_TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.050, halfWidth: 0.90 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.93 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
    { y: 0.155, halfWidth: 0.86 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.87 * SEAL_TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.290, halfWidth: 0.95 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.99 * SEAL_TORSO_HALF_DEPTH, square: 2.6, z: 0.008 },
    { y: 0.400, halfWidth: 0.98 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.96 * SEAL_TORSO_HALF_DEPTH, square: 2.9, z: 0.006 },
    { y: 0.470, halfWidth: 0.99 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.90 * SEAL_TORSO_HALF_DEPTH, square: 3.1, z: 0.002 },
    { y: 0.500, halfWidth: 0.92 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.82 * SEAL_TORSO_HALF_DEPTH, square: 2.9 },
    { y: 0.528, halfWidth: 0.74 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.66 * SEAL_TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.548, halfWidth: 0.44 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.50 * SEAL_TORSO_HALF_DEPTH, square: 2.3 },
]);
const SEAL_NECK = loftProfile([
    { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
    { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
    { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
    { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
]);
const SEAL_BOOT = loftProfile([
    { y: -0.098, halfWidth: 0.030, halfDepth: 0.026, square: 2.4 },
    { y: -0.080, halfWidth: 0.052, halfDepth: 0.040, square: 2.7 },
    { y: -0.035, halfWidth: 0.062, halfDepth: 0.047, square: 2.9 },
    { y: -0.010, halfWidth: 0.063, halfDepth: 0.044, square: 2.9 },
    { y: 0.020, halfWidth: 0.064, halfDepth: 0.040, square: 2.9 },
    { y: 0.082, halfWidth: 0.060, halfDepth: 0.031, square: 2.9 },
    { y: 0.122, halfWidth: 0.043, halfDepth: 0.022, square: 2.6 },
    { y: 0.142, halfWidth: 0.014, halfDepth: 0.009, square: 2.4 },
]);
const SEAL_BOOT_SOLE = loftProfile([
    { y: -0.018, halfWidth: 0.060, halfDepth: B.bootLength * 0.44, square: 4.2 },
    { y: -0.003, halfWidth: 0.065, halfDepth: B.bootLength * 0.47, square: 5.2 },
    { y: 0, halfWidth: 0.062, halfDepth: B.bootLength * 0.45, square: 4.6 },
]);
const SEAL_GLOVE = loftProfile([
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
const sealThumb = (side) => loftGeometry(loftProfile([
    { y: -0.038, x: -side * 0.023, z: 0.006, halfWidth: 0.014, halfDepth: 0.017, square: 2.5 },
    { y: -0.056, x: -side * 0.036, z: 0.012, halfWidth: 0.019, halfDepth: 0.021, square: 2.5 },
    { y: -0.078, x: -side * 0.047, z: 0.022, halfWidth: 0.017, halfDepth: 0.020, square: 2.4 },
    { y: -0.097, x: -side * 0.049, z: 0.027, halfWidth: 0.011, halfDepth: 0.014, square: 2.2 },
    { y: -0.105, x: -side * 0.047, z: 0.029, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });
export const SEAL_SHELL_TOP = 0.74;
export const SEAL_CUP_TOP = -0.384;
export const SEAL_CUP_BOTTOM = -0.028;
export const SEAL_SHELL_BOTTOM = -0.146;
export const SEAL_BOOT_TOP = 0.80;
export const SEAL_SLEEVE_HEM = 0.34;
export const SEAL_ELBOW_TOP = -0.004;
export const SEAL_ELBOW_BOTTOM = -0.104;
export const SEAL_ELBOW_UPPER = -0.210;
export const SEAL_JERSEY = loftProfile((() => {
    const heights = [-0.010, 0.018];
    for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030)
        heights.push(Math.round(y * 1000) / 1000);
    heights.push(0.500, 0.528, 0.548);
    return [...new Set(heights)].sort((a, b) => a - b).map((y) => sealRingAt(SEAL_JACKET, y));
})());
export const SEAL_HIP_DOME_APEX = 0.060;
const SEAL_HIP_DOME = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [SEAL_HIP_DOME_APEX, 0]]
    .map(([y, scale]) => ({
    y: y,
    halfWidth: 0.079 * scale,
    halfDepth: 0.079 * 0.94 * scale,
    square: 2.4,
}));
export const SEAL_THIGH = loftProfile([
    ...sealLimbAtHeights(B.thighLength, [0.082, 0.076, 0.066], [
        0, -0.040, -0.080, -0.120, -0.160, -0.200, -0.240,
        -B.thighLength * SEAL_SHELL_TOP + 0.002,
        -B.thighLength * SEAL_SHELL_TOP - 0.002,
        -0.320, -0.360, -0.400,
    ], { flatten: 0.94, square: 2.4 }),
    ...SEAL_HIP_DOME,
]);
export const SEAL_SEAT = loftProfile([
    { y: -0.118, halfWidth: 0.76 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.78 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.088, halfWidth: 0.84 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.85 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.055, halfWidth: 0.92 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.91 * SEAL_TORSO_HALF_DEPTH, square: 2.7 },
    { y: -0.020, halfWidth: 0.97 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.95 * SEAL_TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.030, halfWidth: 0.93 * SEAL_TORSO_HALF_WIDTH, halfDepth: 0.90 * SEAL_TORSO_HALF_DEPTH, square: 2.6 },
]);
export const SEAL_SHIN = sealLimbAtHeights(B.shinLength, [0.066, 0.060, 0.055], [
    0, SEAL_CUP_BOTTOM + 0.002, SEAL_CUP_BOTTOM - 0.002,
    -0.060, -0.100,
    SEAL_SHELL_BOTTOM + 0.002, SEAL_SHELL_BOTTOM - 0.002,
    -0.180, -0.220, -0.260,
    -B.shinLength * SEAL_BOOT_TOP + 0.002,
    -B.shinLength * SEAL_BOOT_TOP - 0.002,
    -B.shinLength * SEAL_BOOT_TOP - 0.014,
    -0.345, -0.380,
], { flatten: 0.92, square: 2.4 });
export const SEAL_UPPER_ARM = loftProfile([
    { y: 0.034, halfWidth: 0, halfDepth: 0, square: 2.3 },
    { y: 0.028, halfWidth: 0.030, halfDepth: 0.029, square: 2.3 },
    { y: 0.014, halfWidth: 0.050, halfDepth: 0.048, square: 2.3 },
    ...limbProfile(B.upperArmLength, [0.058, 0.050, 0.043], [], {
        flatten: 0.95,
        square: 2.3,
    }).slice().reverse().filter((ring) => ring.y > SEAL_ELBOW_UPPER + 1e-6),
    ...[-B.upperArmLength * SEAL_SLEEVE_HEM + 0.002, -B.upperArmLength * SEAL_SLEEVE_HEM - 0.002]
        .map((y) => ({ y, halfWidth: 0.0525, halfDepth: 0.0499, square: 2.3 })),
    { y: SEAL_ELBOW_UPPER, halfWidth: 0.045, halfDepth: 0.043, square: 2.3 },
    { y: -0.264, halfWidth: 0.050, halfDepth: 0.047, square: 2.4 },
    { y: -0.280, halfWidth: 0.052, halfDepth: 0.049, square: 2.5 },
    { y: -0.292, halfWidth: 0.040, halfDepth: 0.038, square: 2.4 },
    { y: -0.300, halfWidth: 0, halfDepth: 0, square: 2.3 },
].slice().sort((a, b) => a.y - b.y));
export const SEAL_FOREARM = loftProfile([
    { y: SEAL_ELBOW_TOP, halfWidth: 0.058, halfDepth: 0.055, square: 2.4 },
    { y: -0.026, halfWidth: 0.060, halfDepth: 0.057, square: 2.5 },
    { y: -0.060, halfWidth: 0.057, halfDepth: 0.054, square: 2.45 },
    { y: SEAL_ELBOW_BOTTOM + 0.002, halfWidth: 0.048, halfDepth: 0.045, square: 2.35 },
    { y: SEAL_ELBOW_BOTTOM - 0.002, halfWidth: 0.0475, halfDepth: 0.0446, square: 2.3 },
    ...limbProfile(B.forearmLength, [0.047, 0.041, 0.033], [], {
        flatten: 0.94,
        square: 2.3,
    }).slice().reverse().filter((ring) => ring.y < SEAL_ELBOW_BOTTOM - 0.002 - 1e-6),
].slice().sort((a, b) => a.y - b.y));
export const SEAL_HELMET = loftProfile([
    { y: 0.058, halfWidth: 0.106, halfDepth: 0.096, square: 2.4, z: 0.038 },
    { y: 0.086, halfWidth: 0.114, halfDepth: 0.110, square: 2.5, z: 0.042 },
    { y: 0.110, halfWidth: 0.122, halfDepth: 0.126, square: 2.55, z: 0.024 },
    { y: 0.132, halfWidth: 0.128, halfDepth: 0.136, square: 2.6, z: 0.022 },
    { y: 0.158, halfWidth: 0.132, halfDepth: 0.139, square: 2.6, z: 0.012 },
    { y: 0.212, halfWidth: 0.134, halfDepth: 0.141, square: 2.5, z: 0.004 },
    { y: 0.262, halfWidth: 0.124, halfDepth: 0.128, square: 2.35 },
    { y: 0.286, halfWidth: 0.111, halfDepth: 0.114, square: 2.3 },
    { y: 0.306, halfWidth: 0.093, halfDepth: 0.096, square: 2.25 },
    { y: 0.322, halfWidth: 0.071, halfDepth: 0.074, square: 2.2 },
    { y: 0.334, halfWidth: 0.044, halfDepth: 0.046, square: 2.2 },
    { y: 0.346, halfWidth: 0, halfDepth: 0 },
]);
function sealBodyRingAt(y) {
    const seat = sealRingAt(SEAL_SEAT, y);
    const top = sealRingAt(SEAL_JERSEY, y);
    const useSeat = y <= SEAL_SEAT[SEAL_SEAT.length - 1].y;
    const w = useSeat ? Math.max(seat.halfWidth, top.halfWidth) : top.halfWidth;
    const d = useSeat ? Math.max(seat.halfDepth, top.halfDepth) : top.halfDepth;
    const square = useSeat ? Math.max(seat.square, top.square) : top.square;
    return { halfWidth: w, halfDepth: d, square };
}
export const SEAL_GARMENT_VISIBLE_BOTTOM = 0.072;
export const SEAL_GARMENT_BAND = loftProfile([
    [0.160, 0.99, -0.004, 0.20],
    [0.142, 1.10, -0.008, 0.35],
    [0.118, 1.19, -0.012, 0.35],
    [0.094, 1.22, -0.014, 0.35],
    [SEAL_GARMENT_VISIBLE_BOTTOM, 1.18, -0.012, 0.30],
    [0.062, 0.94, -0.004, 0],
    [0.048, 0.86, -0.004, 0],
    [0.036, 0.62, -0.002, 0],
].map(([y, scale, z, lift]) => {
    const ring = sealBodyRingAt(y);
    return {
        y,
        halfWidth: ring.halfWidth * scale,
        halfDepth: ring.halfDepth * scale,
        z,
        square: Math.min(3.2, ring.square + lift),
    };
}));
const SEAL_TAIL_X = 0.055;
const SEAL_TAIL_Z = -0.178;
export const SEAL_GARMENT_HEM = -0.190;
export const SEAL_GARMENT_TAIL = loftProfile([
    { y: 0.142, halfWidth: 0.115, halfDepth: 0.030, square: 3.0, x: 0.025, z: -0.142 },
    { y: 0.112, halfWidth: 0.132, halfDepth: 0.026, square: 3.2, x: 0.033, z: -0.158 },
    { y: 0.060, halfWidth: 0.139, halfDepth: 0.022, square: 3.6, x: 0.043, z: SEAL_TAIL_Z },
    { y: 0.006, halfWidth: 0.138, halfDepth: 0.020, square: 3.8, x: SEAL_TAIL_X, z: SEAL_TAIL_Z },
    { y: -0.033, halfWidth: 0.133, halfDepth: 0.018, square: 3.8, x: 0.057, z: SEAL_TAIL_Z },
    { y: -0.072, halfWidth: 0.127, halfDepth: 0.017, square: 3.8, x: 0.059, z: SEAL_TAIL_Z },
    { y: -0.112, halfWidth: 0.121, halfDepth: 0.016, square: 3.8, x: 0.060, z: SEAL_TAIL_Z },
    { y: -0.151, halfWidth: 0.117, halfDepth: 0.015, square: 3.8, x: 0.061, z: SEAL_TAIL_Z },
    { y: SEAL_GARMENT_HEM, halfWidth: 0.114, halfDepth: 0.014, square: 3.8, x: 0.061, z: SEAL_TAIL_Z },
    { y: SEAL_GARMENT_HEM - 0.0015, halfWidth: 0.075, halfDepth: 0.008, square: 3.8, x: 0.061, z: SEAL_TAIL_Z },
    { y: SEAL_GARMENT_HEM - 0.002, halfWidth: 0, halfDepth: 0, x: 0.061, z: SEAL_TAIL_Z },
]);
function sealGarmentTail() {
    const geometry = loftGeometry(SEAL_GARMENT_TAIL, { radialSegments: 48 });
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const ring = sealRingAt(SEAL_GARMENT_TAIL, y);
        const across = (position.getX(i) - ring.x) / Math.max(0.001, ring.halfWidth);
        const rear = Math.max(0, Math.min(1, (ring.z - position.getZ(i)) / Math.max(0.001, ring.halfDepth)));
        const fold = (0.5 + 0.5 * Math.cos(across * Math.PI * 3 + 0.25)) * (1 - across * across);
        const gather = Math.min(1, Math.max(0, (0.142 - y) / 0.08));
        position.setZ(i, position.getZ(i) + 0.010 * fold * rear * gather);
        const shade = 1 - 0.18 * fold * rear * gather;
        colour.setXYZ(i, shade, shade, shade);
    }
    geometry.computeVertexNormals();
    return geometry;
}
export const SEAL_KNOT_END = 0.020;
export const SEAL_GARMENT_KNOT_OVER = loftProfile([
    { y: SEAL_KNOT_END - 0.008, halfWidth: 0, halfDepth: 0, x: 0.020, z: 0.150 },
    { y: SEAL_KNOT_END + 0.002, halfWidth: 0.014, halfDepth: 0.013, square: 2.2, x: 0.020, z: 0.150 },
    { y: 0.050, halfWidth: 0.020, halfDepth: 0.018, square: 2.2, x: 0.030, z: 0.148 },
    { y: 0.084, halfWidth: 0.022, halfDepth: 0.020, square: 2.3, x: 0.047, z: 0.144 },
    { y: 0.112, halfWidth: 0.021, halfDepth: 0.019, square: 2.3, x: 0.062, z: 0.138 },
    { y: 0.134, halfWidth: 0.015, halfDepth: 0.014, square: 2.2, x: 0.075, z: 0.132 },
    { y: 0.142, halfWidth: 0, halfDepth: 0, x: 0.079, z: 0.130 },
]);
export const SEAL_GARMENT_KNOT_UNDER = loftProfile([
    { y: SEAL_KNOT_END - 0.008, halfWidth: 0, halfDepth: 0, x: 0.066, z: 0.150 },
    { y: SEAL_KNOT_END + 0.002, halfWidth: 0.014, halfDepth: 0.013, square: 2.2, x: 0.066, z: 0.150 },
    { y: 0.050, halfWidth: 0.020, halfDepth: 0.018, square: 2.2, x: 0.068, z: 0.146 },
    { y: 0.084, halfWidth: 0.022, halfDepth: 0.020, square: 2.3, x: 0.072, z: 0.132 },
    { y: 0.112, halfWidth: 0.021, halfDepth: 0.019, square: 2.3, x: 0.056, z: 0.126 },
    { y: 0.134, halfWidth: 0.015, halfDepth: 0.014, square: 2.2, x: 0.042, z: 0.122 },
    { y: 0.142, halfWidth: 0, halfDepth: 0, x: 0.038, z: 0.120 },
]);
export const SEAL_GARMENT_KNOT = Object.freeze([
    SEAL_GARMENT_KNOT_OVER,
    SEAL_GARMENT_KNOT_UNDER,
]);
const SEAL_SLEEVE_PATCH = Object.freeze([
    { u0: 0.30, u1: 1.55 },
]);
function sealSleeves() {
    const parts = [];
    for (const side of [-1, 1]) {
        for (const span of SEAL_SLEEVE_PATCH) {
            const centre = Math.PI / 2;
            const u0 = centre + side * span.u0;
            const u1 = centre + side * span.u1;
            parts.push(patchGeometry(SEAL_GARMENT_BAND, {
                u0: Math.min(u0, u1),
                u1: Math.max(u0, u1),
                v0: vAtHeight(SEAL_GARMENT_BAND, 0.078),
                v1: vAtHeight(SEAL_GARMENT_BAND, 0.126),
                uSegments: 7,
                vSegments: 2,
                lift: 0.013,
                sink: -0.010,
                taper: 0.34,
                bow: 0.16,
                skew: side * 0.55,
                uByArc: true,
            }));
        }
    }
    return parts;
}
function sealGarment() {
    const band = loftGeometry(SEAL_GARMENT_BAND, { radialSegments: 26 });
    paintSealBand(band);
    return mergeGeometries([
        band,
        sealGarmentTail(),
        ...SEAL_GARMENT_KNOT.map((tube) => loftGeometry(tube, { radialSegments: 10 })),
        ...sealSleeves(),
    ]);
}
const SEAL_PACK_HALF_DEPTH = 0.047;
const SEAL_PACK_Z = (() => {
    const point = new THREE.Vector3();
    let back = Infinity;
    for (const y of [0.20, 0.26, 0.32, 0.38, 0.44]) {
        loftPoint(SEAL_JERSEY, -Math.PI / 2, vAtHeight(SEAL_JERSEY, y), point);
        back = Math.min(back, point.z);
    }
    return back - SEAL_PACK_HALF_DEPTH + 0.010;
})();
export const SEAL_PACK_TOP = 0.462;
export const SEAL_PACK = loftProfile([
    { y: 0.160, halfWidth: 0.062, halfDepth: 0.030, square: 2.6, z: SEAL_PACK_Z },
    { y: 0.176, halfWidth: 0.094, halfDepth: 0.044, square: 3.4, z: SEAL_PACK_Z },
    { y: 0.200, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
    { y: 0.256, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
    { y: 0.312, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
    { y: 0.368, halfWidth: 0.099, halfDepth: SEAL_PACK_HALF_DEPTH, square: 3.6, z: SEAL_PACK_Z },
    { y: 0.410, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: SEAL_PACK_Z },
    { y: 0.436, halfWidth: 0.100, halfDepth: 0.049, square: 3.6, z: SEAL_PACK_Z },
    { y: 0.454, halfWidth: 0.088, halfDepth: 0.043, square: 3.0, z: SEAL_PACK_Z },
    { y: 0.459, halfWidth: 0.060, halfDepth: 0.030, square: 2.6, z: SEAL_PACK_Z },
    { y: SEAL_PACK_TOP, halfWidth: 0, halfDepth: 0, z: SEAL_PACK_Z },
]);
function sealPack() {
    return loftGeometry(SEAL_PACK, { radialSegments: 20 });
}
export const SEAL_STRAP = Object.freeze({
    chestOuter: -1.00,
    chestInner: -0.76,
    crossingFrom: 0.520,
    crossingTo: 0.536,
    wrapFrom: 0.240,
    wrapTo: 0.286,
    packHalfAngle: 0.45,
});
export const SEAL_STRAP_SHADE = 0.95;
const SEAL_TOP = Object.freeze({
    colour: C.sealGear,
    roughness: 0.78,
    metalness: 0,
});
const SEAL_SKIN = Object.freeze({
    colour: C.sealSkin,
    roughness: 0.66,
    metalness: 0,
});
const SEAL_PAD = Object.freeze({
    colour: C.sealPad,
    roughness: 0.55,
    metalness: 0,
});
const SEAL_LID = Object.freeze({
    colour: C.sealGarment,
    roughness: 0.38,
    metalness: 0.08,
});
const SEAL_VISOR = Object.freeze({
    colour: C.sealVisor,
    roughness: 0.30,
    metalness: 0.34,
    emissive: 0x141a24,
    emissiveIntensity: 0.50,
});
const SEAL_KIT = Object.freeze({
    colour: C.sealBoot,
    roughness: 0.56,
    metalness: 0,
});
const SEAL_GARMENT_MATERIAL = Object.freeze({
    colour: C.sealGarment,
    roughness: 0.90,
    metalness: 0,
});
const SEAL_PACK_MATERIAL = Object.freeze({
    colour: C.sealPack,
    roughness: 0.62,
    metalness: 0,
});
export const SEAL_SEAT_SHADE = 0.88;
export const SEAL_SOLE_SHADE = 0.86;
const SEAL_PLAIN = [1, 1, 1];
const SEAL_TROUSER_TINT = tintOver(C.sealGear, C.sealTrouser);
const SEAL_PAD_ON_KIT = tintOver(C.sealGear, C.sealPad);
const SEAL_SLEEVE_TINT = tintOver(C.sealSkin, C.sealGear);
const SEAL_ELBOW_TINT = tintOver(C.sealSkin, C.sealGear);
const SEAL_GLOVE_TINT = tintOver(C.sealGear, C.sealGlove);
const SEAL_GLOVE_RED_TINT = tintOver(C.sealGear, C.sealGloveRed);
const SEAL_NEON_TINT = tintOver(C.sealBoot, C.sealNeon);
const SEAL_LACE_TINT = tintOver(C.sealBoot, C.sealHelmetWhite);
const SEAL_BAND_SHADOW = tintOver(C.sealGarment, C.sealGear);
function paintSealTorso(geometry) {
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i += 1) {
        const tint = Math.abs(colour.getX(i) - SEAL_SEAT_SHADE) < 1e-6 ? SEAL_TROUSER_TINT : SEAL_PLAIN;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
export function paintSealBand(geometry) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const dark = position.getZ(i) > 0 && position.getX(i) < -0.010;
        const tint = dark ? SEAL_BAND_SHADOW : SEAL_PLAIN;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintSealUpperArm(geometry, side) {
    void side;
    const hem = -B.upperArmLength * SEAL_SLEEVE_HEM;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        let tint = SEAL_PLAIN;
        if (y >= hem - 1e-6)
            tint = SEAL_SLEEVE_TINT;
        else if (y <= SEAL_ELBOW_UPPER + 1e-6)
            tint = SEAL_ELBOW_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintSealForearm(geometry, side) {
    void side;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const tint = position.getY(i) >= SEAL_ELBOW_BOTTOM - 1e-6 ? SEAL_ELBOW_TINT : SEAL_PLAIN;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintSealThigh(geometry, side) {
    void side;
    const shellTop = -B.thighLength * SEAL_SHELL_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const tint = position.getY(i) <= shellTop + 1e-6 ? SEAL_PAD_ON_KIT : SEAL_TROUSER_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintSealShin(geometry, side) {
    void side;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const tint = position.getY(i) >= SEAL_SHELL_BOTTOM - 1e-6 ? SEAL_PAD_ON_KIT : SEAL_TROUSER_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintSealBoot(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null)
        return;
    const height = Math.max(1e-3, box.max.y - box.min.y);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        if (Math.abs(colour.getX(i) - SEAL_SOLE_SHADE) < 1e-6)
            continue;
        const t = (position.getY(i) - box.min.y) / height;
        const z = position.getZ(i);
        const rand = (t >= 0.26 && t <= 0.50) || (t < 0.50 && z > 0.090);
        const lace = t > 0.86 && z > -0.045 && z < 0.005 && Math.abs(position.getX(i)) < 0.034;
        const tint = lace ? SEAL_LACE_TINT : rand ? SEAL_NEON_TINT : SEAL_PLAIN;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintSealHand(geometry, side) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const outboard = side * position.getX(i) > 0.020;
        const red = outboard && y <= -0.046 && y >= -0.072;
        const tint = red ? SEAL_GLOVE_RED_TINT : SEAL_GLOVE_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
const patch = (spec) => Object.freeze(spec);
const group = (role, patches) => Object.freeze({
    role,
    casts: false,
    patches: Object.freeze(patches),
});
const SEAL_SHELL_U0 = -1.90;
const SEAL_SHELL_U1 = 0.88;
const SEAL_THIGH_PAD = group('accent', [
    patch({
        anchor: 'front',
        u0: SEAL_SHELL_U0,
        u1: SEAL_SHELL_U1,
        mirrored: true,
        from: -B.thighLength * SEAL_SHELL_TOP,
        to: SEAL_CUP_TOP,
        uSegments: 8,
        vSegments: 4,
        lift: 0.020,
        taper: 0.24,
    }),
    patch({
        anchor: 'front',
        u0: SEAL_SHELL_U0,
        u1: SEAL_SHELL_U1,
        mirrored: true,
        from: -0.418,
        to: SEAL_CUP_TOP,
        uSegments: 7,
        vSegments: 2,
        lift: 0.022,
        taper: 0.30,
    }),
]);
const SEAL_KNEE_PAD = group('accent', [
    patch({
        anchor: 'front',
        u0: SEAL_SHELL_U0,
        u1: SEAL_SHELL_U1,
        mirrored: true,
        from: SEAL_CUP_BOTTOM,
        to: 0.000,
        uSegments: 8,
        vSegments: 1,
        lift: 0.034,
        taper: 0.28,
    }),
    patch({
        anchor: 'front',
        u0: SEAL_SHELL_U0 + 0.06,
        u1: SEAL_SHELL_U1 - 0.06,
        mirrored: true,
        from: SEAL_SHELL_BOTTOM,
        to: SEAL_CUP_BOTTOM,
        uSegments: 8,
        vSegments: 5,
        lift: 0.022,
        taper: 0.38,
        bulge: 0.10,
    }),
    ...[-0.056, -0.108].flatMap((from) => [-0.135, 0.135].map((centre) => patch({
        anchor: 'outboard',
        u0: centre - 0.028,
        u1: centre + 0.028,
        from,
        to: from + 0.014,
        uSegments: 2,
        vSegments: 1,
        lift: 0.0235,
        taper: 0.30,
        shade: 0.74,
    }))),
]);
const SEAL_STRAPS = group('gear', [
    patch({
        anchor: 'front',
        u0: SEAL_STRAP.chestOuter,
        u1: SEAL_STRAP.chestInner,
        mirrored: true,
        from: SEAL_STRAP.wrapFrom,
        to: SEAL_STRAP.crossingTo,
        uSegments: 3,
        vSegments: 7,
        lift: 0.010,
        shade: SEAL_STRAP_SHADE,
    }),
    patch({
        anchor: 'outboard',
        u0: -Math.PI / 2 + SEAL_STRAP.packHalfAngle,
        u1: Math.PI / 2 + SEAL_STRAP.chestOuter,
        mirrored: true,
        from: SEAL_STRAP.wrapFrom,
        to: SEAL_STRAP.wrapTo,
        uSegments: 8,
        vSegments: 1,
        lift: 0.010,
        shade: SEAL_STRAP_SHADE,
    }),
    patch({
        anchor: 'back',
        u0: 0.30,
        u1: 0.54,
        mirrored: true,
        from: 0.400,
        to: SEAL_STRAP.crossingTo,
        uSegments: 3,
        vSegments: 4,
        lift: 0.010,
        shade: SEAL_STRAP_SHADE,
    }),
    patch({
        anchor: 'outboard',
        u0: -Math.PI / 2 + 0.54,
        u1: Math.PI / 2 + SEAL_STRAP.chestOuter,
        mirrored: true,
        from: SEAL_STRAP.crossingFrom,
        to: SEAL_STRAP.crossingTo,
        uSegments: 8,
        vSegments: 1,
        lift: 0.010,
        shade: SEAL_STRAP_SHADE,
    }),
]);
export const SEAL_RIM_TOP = 0.070;
const SEAL_HEAD_PANELS = Object.freeze([
    patch({
        anchor: 'front',
        u0: 0,
        u1: Math.PI * 2,
        from: 0.058,
        to: SEAL_RIM_TOP,
        uSegments: 18,
        vSegments: 1,
        lift: 0.002,
        art: 'rim',
    }),
]);
export const SEAL_VISOR_HALF_SPAN = 1.20;
export const SEAL_VISOR_FROM = 0.130;
export const SEAL_VISOR_TO = 0.216;
const SEAL_FACE = group('face', [
    patch({
        anchor: 'front',
        u0: -SEAL_VISOR_HALF_SPAN,
        u1: SEAL_VISOR_HALF_SPAN,
        from: SEAL_VISOR_FROM,
        to: SEAL_VISOR_TO,
        uSegments: 16,
        vSegments: 5,
        lift: 0.006,
        sink: -0.014,
        taper: 0.26,
        bulge: 0.20,
        shade: 1,
    }),
]);
export const SEAL_SHEET_LAYOUT = Object.freeze({
    head: SEAL_HELMET,
    visor: Object.freeze({
        halfSpan: SEAL_VISOR_HALF_SPAN,
        from: SEAL_VISOR_FROM,
        to: SEAL_VISOR_TO,
    }),
    rimTop: SEAL_RIM_TOP,
});
export const SEAL_ON_A_WHEEL_LOOK = Object.freeze({
    id: 'seal-on-a-wheel',
    density: Object.freeze({ limb: 18, torso: 30, head: 32, boot: 16, hand: 18 }),
    atlas: Object.freeze({
        paintInput: () => ({ cache: 'sealAtlas.ts', args: [SEAL_SHEET_LAYOUT] }),
        build: () => createSealAtlas(SEAL_SHEET_LAYOUT),
        roles: Object.freeze(['head']),
        region: (art) => (art !== undefined && art in SEAL_REGIONS ? SEAL_REGIONS[art] : SEAL_REGIONS.blank),
        lofts: Object.freeze({ head: 'helmet' }),
    }),
    materials: Object.freeze({
        body: SEAL_TOP,
        limbs: SEAL_SKIN,
        accent: SEAL_PAD,
        head: SEAL_LID,
        face: SEAL_VISOR,
        gear: SEAL_KIT,
    }),
    profiles: Object.freeze({
        torso: SEAL_JERSEY,
        seat: SEAL_SEAT,
        thigh: SEAL_THIGH,
        shin: SEAL_SHIN,
        upperArm: SEAL_UPPER_ARM,
        forearm: SEAL_FOREARM,
        neck: SEAL_NECK,
        head: SEAL_HELMET,
        boot: SEAL_BOOT,
        bootSole: SEAL_BOOT_SOLE,
        hand: SEAL_GLOVE,
    }),
    shades: Object.freeze({
        seat: SEAL_SEAT_SHADE,
        legs: 1.0,
        collar: 1.0,
        sole: SEAL_SOLE_SHADE,
        neck: 0.55,
    }),
    parts: Object.freeze({
        hands: 'body',
        neck: 'limbs',
        kneePad: 'accent',
        legs: 'body',
        seat: 'body',
    }),
    panels: Object.freeze({
        torso: SEAL_STRAPS,
        thighPad: Object.freeze({ ...SEAL_THIGH_PAD, ghostSilhouette: true }),
        kneePad: Object.freeze({ ...SEAL_KNEE_PAD, ghostSilhouette: true }),
        head: SEAL_HEAD_PANELS,
        face: SEAL_FACE,
    }),
    build: Object.freeze({ hand: Object.freeze([sealThumb]) }),
    extras: Object.freeze([
        Object.freeze({
            name: 'rider-seal-garment',
            joint: 'pelvis',
            role: 'body',
            material: SEAL_GARMENT_MATERIAL,
            casts: true,
            build: sealGarment,
        }),
        Object.freeze({
            name: 'rider-seal-pack',
            joint: 'pelvis',
            role: 'gear',
            material: SEAL_PACK_MATERIAL,
            casts: true,
            build: sealPack,
        }),
    ]),
    paint: Object.freeze({
        torso: paintSealTorso,
        upperArm: paintSealUpperArm,
        forearm: paintSealForearm,
        thigh: paintSealThigh,
        shin: paintSealShin,
        boot: paintSealBoot,
        hand: paintSealHand,
    }),
    armCarriage: Object.freeze({ splay: 0.014, rise: 0 }),
});
