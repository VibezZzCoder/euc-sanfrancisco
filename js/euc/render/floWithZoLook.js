// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/floWithZoLook.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS as C, RIDER_BLOCKOUT as B } from '../data/tuning.js';
import { limbProfile, loftGeometry, loftProfile, tintOver, } from './blockoutKit.js';
const FLO_TORSO_HALF_WIDTH = B.torsoWidth / 2;
const FLO_TORSO_HALF_DEPTH = B.torsoDepth / 2;
function floRingAt(profile, y) {
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
function floLimbAtHeights(length, radii, heights, options) {
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
function floWithRingsAt(profile, heights) {
    return loftProfile([...profile, ...heights.map((y) => floRingAt(profile, y))]
        .slice()
        .sort((a, b) => a.y - b.y));
}
const FLO_JACKET = loftProfile([
    { y: -0.010, halfWidth: 1.03 * FLO_TORSO_HALF_WIDTH, halfDepth: 1.01 * FLO_TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.018, halfWidth: 0.98 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.96 * FLO_TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.050, halfWidth: 0.90 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.93 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
    { y: 0.155, halfWidth: 0.86 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.87 * FLO_TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.290, halfWidth: 0.97 * FLO_TORSO_HALF_WIDTH, halfDepth: 1.01 * FLO_TORSO_HALF_DEPTH, square: 2.6, z: 0.008 },
    { y: 0.400, halfWidth: 1.00 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.98 * FLO_TORSO_HALF_DEPTH, square: 2.9, z: 0.006 },
    { y: 0.470, halfWidth: 1.00 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.90 * FLO_TORSO_HALF_DEPTH, square: 3.1, z: 0.002 },
    { y: 0.500, halfWidth: 0.93 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.82 * FLO_TORSO_HALF_DEPTH, square: 2.9 },
    { y: 0.528, halfWidth: 0.74 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.66 * FLO_TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.548, halfWidth: 0.44 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.50 * FLO_TORSO_HALF_DEPTH, square: 2.3 },
]);
const FLO_NECK = loftProfile([
    { y: -0.048, halfWidth: 0.070, halfDepth: 0.068, square: 2.4 },
    { y: -0.010, halfWidth: 0.062, halfDepth: 0.060, square: 2.3 },
    { y: 0.050, halfWidth: 0.055, halfDepth: 0.053, square: 2.2 },
    { y: 0.098, halfWidth: 0.052, halfDepth: 0.050, square: 2.2 },
]);
const FLO_BOOT = loftProfile([
    { y: -0.098, halfWidth: 0.030, halfDepth: 0.026, square: 2.4 },
    { y: -0.080, halfWidth: 0.052, halfDepth: 0.040, square: 2.7 },
    { y: -0.035, halfWidth: 0.062, halfDepth: 0.047, square: 2.9 },
    { y: 0.020, halfWidth: 0.064, halfDepth: 0.040, square: 2.9 },
    { y: 0.082, halfWidth: 0.060, halfDepth: 0.031, square: 2.9 },
    { y: 0.122, halfWidth: 0.043, halfDepth: 0.022, square: 2.6 },
    { y: 0.142, halfWidth: 0.014, halfDepth: 0.009, square: 2.4 },
]);
const FLO_BOOT_SOLE = loftProfile([
    { y: -0.018, halfWidth: 0.060, halfDepth: B.bootLength * 0.44, square: 4.2 },
    { y: -0.003, halfWidth: 0.065, halfDepth: B.bootLength * 0.47, square: 5.2 },
    { y: 0, halfWidth: 0.062, halfDepth: B.bootLength * 0.45, square: 4.6 },
]);
export const FLO_GUARD_TOP = 0.735;
export const FLO_CUP_TOP = -0.380;
export const FLO_CUP_BOTTOM = -0.030;
export const FLO_BOOT_TOP = 0.82;
export const FLO_BAND_TOP = 0.070;
export const FLO_BAND_FRONT_STOP = 0.020;
const FLO_BAND_HIP = 0.120;
const FLO_BAND_TAPER = 0.024;
const FLO_GOLD_HIP_STOP = 0.87;
export const FLO_VEST_TOP = 0.410;
export const FLO_VEST_BOTTOM = 0.075;
const FLO_VEST_SEAM = 0.055;
const FLO_VEST_BINDING_ROW = 0.0021;
const FLO_BACK_STRIP_BOTTOM = 0.335;
const FLO_BACK_STRIP_TOP = 0.455;
const FLO_BACK_STRIP_INBOARD = -0.060;
const FLO_BACK_STRIP_OUTBOARD = -0.115;
export const FLO_COLLAR_BASE = 0.526;
export const FLO_THIGH_PANEL_TOP = -0.060;
export const FLO_THIGH_PANEL_BOTTOM = -0.250;
const FLO_SHOULDER_CAP_BOTTOM = -0.060;
export const FLO_JERSEY = loftProfile((() => {
    const heights = [-0.010, 0.018];
    for (let y = 0.050; y < 0.470 + 1e-6; y += 0.030)
        heights.push(Math.round(y * 1000) / 1000);
    heights.push(0.500, 0.528, 0.548);
    for (const boundary of [FLO_BAND_TOP, FLO_VEST_BOTTOM, FLO_VEST_TOP, FLO_COLLAR_BASE]) {
        heights.push(boundary - 0.002, boundary + 0.002);
    }
    return [...new Set(heights)].sort((a, b) => a - b).map((y) => floRingAt(FLO_JACKET, y));
})());
export const FLO_HIP_DOME_APEX = 0.060;
const FLO_HIP_DOME = [[0.018, 0.90], [0.036, 0.78], [0.050, 0.52], [FLO_HIP_DOME_APEX, 0]]
    .map(([y, scale]) => ({
    y: y,
    halfWidth: 0.079 * scale,
    halfDepth: 0.079 * 0.94 * scale,
    square: 2.4,
}));
export const FLO_THIGH = loftProfile([
    ...floLimbAtHeights(B.thighLength, [0.079, 0.072, 0.061], [
        0, -0.040,
        FLO_THIGH_PANEL_TOP + 0.002, FLO_THIGH_PANEL_TOP - 0.002,
        -0.080, -0.120, -0.160, -0.200, -0.240,
        FLO_THIGH_PANEL_BOTTOM + 0.002, FLO_THIGH_PANEL_BOTTOM - 0.002,
        -0.270,
        -B.thighLength * FLO_GUARD_TOP + 0.002,
        -B.thighLength * FLO_GUARD_TOP - 0.002,
        -0.300, -0.320, -0.340, -0.360, -0.380, -0.400,
    ], { flatten: 0.94, square: 2.4 }),
    ...FLO_HIP_DOME,
]);
export const FLO_SEAT = loftProfile([
    { y: -0.118, halfWidth: 0.76 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.78 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.088, halfWidth: 0.84 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.85 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.055, halfWidth: 0.92 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.91 * FLO_TORSO_HALF_DEPTH, square: 2.7 },
    { y: -0.020, halfWidth: 0.97 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.95 * FLO_TORSO_HALF_DEPTH, square: 2.7 },
    { y: 0.030, halfWidth: 0.93 * FLO_TORSO_HALF_WIDTH, halfDepth: 0.90 * FLO_TORSO_HALF_DEPTH, square: 2.6 },
]);
export const FLO_SHIN = floLimbAtHeights(B.shinLength, [0.064, 0.058, 0.053], [
    0, FLO_CUP_BOTTOM + 0.002, FLO_CUP_BOTTOM - 0.002,
    -0.050, -0.080, -0.110, -0.140, -0.170, -0.200, -0.224, -0.250, -0.280,
    -B.shinLength * FLO_BOOT_TOP + 0.002,
    -B.shinLength * FLO_BOOT_TOP - 0.002,
    -B.shinLength * FLO_BOOT_TOP - 0.014,
    -0.345, -0.380,
], { flatten: 0.92, square: 2.4 });
export const FLO_UPPER_ARM = floWithRingsAt(loftProfile([
    { y: 0.034, halfWidth: 0, halfDepth: 0 },
    { y: 0.028, halfWidth: 0.030, halfDepth: 0.029, square: 2.3 },
    { y: 0.014, halfWidth: 0.050, halfDepth: 0.048, square: 2.3 },
    ...limbProfile(B.upperArmLength, [0.058, 0.050, 0.043], [], {
        flatten: 0.95,
        square: 2.3,
    }).slice().reverse(),
]), [FLO_SHOULDER_CAP_BOTTOM + 0.002, FLO_SHOULDER_CAP_BOTTOM - 0.002, -0.105, -0.135, -0.165, -0.195, -0.225]);
export const FLO_FOREARM = floWithRingsAt(limbProfile(B.forearmLength, [0.047, 0.041, 0.033], [], {
    flatten: 0.94,
    square: 2.3,
}), [-0.035, -0.060, -0.085, -0.115, -0.145, -0.180, -0.215]);
export const FLO_HELMET = loftProfile([
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
export const FLO_GLOVE = loftProfile([
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
const floThumb = (side) => loftGeometry(loftProfile([
    { y: -0.038, x: -side * 0.023, z: 0.006, halfWidth: 0.014, halfDepth: 0.017, square: 2.5 },
    { y: -0.056, x: -side * 0.036, z: 0.012, halfWidth: 0.019, halfDepth: 0.021, square: 2.5 },
    { y: -0.078, x: -side * 0.047, z: 0.022, halfWidth: 0.017, halfDepth: 0.020, square: 2.4 },
    { y: -0.097, x: -side * 0.049, z: 0.027, halfWidth: 0.011, halfDepth: 0.014, square: 2.2 },
    { y: -0.105, x: -side * 0.047, z: 0.029, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });
const FLO_SUIT = Object.freeze({
    colour: C.floWithZoSilver,
    roughness: 0.38,
    metalness: 0,
});
const FLO_GUARD = Object.freeze({
    colour: C.floWithZoGuard,
    roughness: 0.55,
    metalness: 0,
});
const FLO_LID = Object.freeze({
    colour: C.floWithZoBronze,
    roughness: 0.34,
    metalness: 0.25,
});
const FLO_LENS = Object.freeze({
    colour: C.floWithZoLens,
    roughness: 0.32,
    metalness: 0.35,
    emissive: 0x1a2028,
    emissiveIntensity: 0.55,
});
const FLO_GEAR = Object.freeze({
    colour: C.floWithZoGear,
    roughness: 0.62,
    metalness: 0,
});
export const FLO_SEAT_SHADE = 0.86;
export const FLO_GUARD_SHADE = 1.12;
export const FLO_CUP_SHADE = 0.30;
export const FLO_SOLE_SHADE = 1.45;
const FLO_SILVER = [1, 1, 1];
const FLO_PANEL_TINT = tintOver(C.floWithZoSilver, C.floWithZoPanel);
const FLO_COLLAR_SHADE = 0.76;
const FLO_COLLAR_TINT = tintOver(C.floWithZoSilver, C.floWithZoPanel, FLO_COLLAR_SHADE);
const FLO_SLEEVE_TINT = [0.70, 0.70, 0.70];
const FLO_BINDING_TINT = [0.75, 0.75, 0.75];
const FLO_BACK_STRIP_TINT = [1.13, 1.13, 1.13];
const FLO_CYAN_TINT = tintOver(C.floWithZoSilver, C.floWithZoCyan);
const FLO_GOLD_TINT = tintOver(C.floWithZoSilver, C.floWithZoGold);
const FLO_CUP_TINT = tintOver(C.floWithZoSilver, C.floWithZoGuard, FLO_CUP_SHADE);
const FLO_SHOE_TINT = tintOver(C.floWithZoGear, C.floWithZoSilver);
const FLO_RAND_TINT = tintOver(C.floWithZoGear, C.floWithZoGear, FLO_SOLE_SHADE);
function floBandTopAt(x) {
    if (x < 0)
        return FLO_BAND_TOP;
    const reach = Math.min(1, x / FLO_BAND_HIP);
    return FLO_BAND_TOP - FLO_BAND_TAPER * (1 - reach);
}
function floFabric(geometry, part) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    const ridge = (distance, width) => Math.exp(-((distance / width) ** 2));
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const silver = Math.abs(colour.getX(i) - 1) < 1e-5
            && Math.abs(colour.getY(i) - 1) < 1e-5
            && Math.abs(colour.getZ(i) - 1) < 1e-5;
        const panel = FLO_PANEL_TINT.every((value, axis) => Math.abs(colour.getComponent(i, axis) - value) < 1e-5);
        if (!silver && !panel)
            continue;
        let valley = 0;
        if (part === 'torso') {
            if (y < 0.065 || y > 0.49)
                continue;
            const across = Math.abs(x) / FLO_TORSO_HALF_WIDTH;
            valley = 0.32 * ridge(y - (0.13 + 0.30 * x), 0.022)
                + 0.25 * ridge(y - (0.23 - 0.23 * x), 0.026)
                + 0.20 * ridge(y - (0.37 + 0.18 * x), 0.020);
            valley += 0.16 * across ** 3;
        }
        else if (part === 'arm') {
            if (y > -0.025 || y < -0.225)
                continue;
            valley = 0.33 * ridge(y + 0.070 + x * 0.6 + z * 0.3, 0.017)
                + 0.27 * ridge(y + 0.135 - x * 0.7, 0.019)
                + 0.20 * ridge(y + 0.195 + z * 0.7, 0.016);
        }
        else {
            if (y > -0.080 || y < -0.260)
                continue;
            valley = 0.30 * ridge(y + 0.130 + x * 0.45, 0.019)
                + 0.23 * ridge(y + 0.215 - z * 0.5, 0.021);
        }
        valley = Math.min(0.48, valley) * (panel ? 0.55 : 1);
        colour.setXYZ(i, colour.getX(i) * (1 - valley), colour.getY(i) * (1 - valley * 0.94), colour.getZ(i) * (1 - valley * 0.82));
        const radius = Math.hypot(x, z);
        if (radius > 0.01) {
            const inset = 0.008 * valley;
            position.setX(i, x * (1 - inset / radius));
            position.setZ(i, z * (1 - inset / radius));
        }
    }
    geometry.computeVertexNormals();
}
function paintFloForearm(geometry) {
    floFabric(geometry, 'arm');
}
function paintFloTorso(geometry) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        if (Math.abs(colour.getX(i) - FLO_SEAT_SHADE) < 1e-6) {
            colour.setXYZ(i, FLO_SILVER[0], FLO_SILVER[1], FLO_SILVER[2]);
            continue;
        }
        const y = position.getY(i);
        const x = position.getX(i);
        const z = position.getZ(i);
        let tint = FLO_SILVER;
        if (y >= FLO_COLLAR_BASE - 1e-6) {
            tint = FLO_COLLAR_TINT;
        }
        else if (y <= floBandTopAt(x) + 1e-6
            && Math.abs(x) > 1e-6
            && z < FLO_BAND_FRONT_STOP
            && !(x > FLO_GOLD_HIP_STOP * floRingAt(FLO_JACKET, y).halfWidth)) {
            tint = x < 0 ? FLO_CYAN_TINT : FLO_GOLD_TINT;
        }
        else if (z > FLO_VEST_SEAM
            && y >= FLO_VEST_BOTTOM - FLO_VEST_BINDING_ROW
            && y <= FLO_VEST_TOP + FLO_VEST_BINDING_ROW) {
            const edge = Math.abs(y - FLO_VEST_TOP) <= FLO_VEST_BINDING_ROW
                || Math.abs(y - FLO_VEST_BOTTOM) <= FLO_VEST_BINDING_ROW;
            tint = edge ? FLO_BINDING_TINT : FLO_PANEL_TINT;
        }
        else if (z < 0
            && x <= FLO_BACK_STRIP_INBOARD
            && x >= FLO_BACK_STRIP_OUTBOARD
            && y >= FLO_BACK_STRIP_BOTTOM
            && y <= FLO_BACK_STRIP_TOP) {
            tint = FLO_BACK_STRIP_TINT;
        }
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
    floFabric(geometry, 'torso');
}
function paintFloUpperArm(geometry, side) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        if (position.getY(i) < FLO_SHOULDER_CAP_BOTTOM - 1e-6)
            continue;
        if (side * position.getX(i) < -1e-6)
            continue;
        colour.setXYZ(i, FLO_PANEL_TINT[0], FLO_PANEL_TINT[1], FLO_PANEL_TINT[2]);
    }
    floFabric(geometry, 'arm');
}
function paintFloThigh(geometry, side) {
    const guardTop = -B.thighLength * FLO_GUARD_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        let tint = FLO_SILVER;
        if (y <= guardTop + 1e-6) {
            tint = FLO_CUP_TINT;
        }
        else if (y <= FLO_THIGH_PANEL_TOP + 1e-6
            && y >= FLO_THIGH_PANEL_BOTTOM - 1e-6
            && side * position.getX(i) > 0) {
            tint = FLO_PANEL_TINT;
        }
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
    floFabric(geometry, 'thigh');
}
function paintFloShin(geometry, side) {
    void side;
    const cuff = -B.shinLength * FLO_BOOT_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        let tint = FLO_SLEEVE_TINT;
        if (y < cuff)
            tint = FLO_SILVER;
        else if (y >= FLO_CUP_BOTTOM)
            tint = FLO_CUP_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintFloBoot(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null)
        return;
    const height = Math.max(1e-3, box.max.y - box.min.y);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        if (Math.abs(colour.getX(i) - FLO_SOLE_SHADE) < 1e-6)
            continue;
        const t = (position.getY(i) - box.min.y) / height;
        const toe = t < 0.45 && position.getZ(i) > 0.085;
        const heel = t < 0.55 && position.getZ(i) < -0.060;
        const tint = t < 0.42 || toe || heel ? FLO_RAND_TINT : FLO_SHOE_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
const patch = (spec) => Object.freeze(spec);
const group = (role, patches) => Object.freeze({
    role,
    casts: false,
    patches: Object.freeze(patches),
});
const FLO_SHELL_U0 = -1.95;
const FLO_SHELL_U1 = 0.90;
const FLO_PLATE_U0 = -2.00;
const FLO_PLATE_U1 = 0.70;
const FLO_THIGH_PAD = group('accent', [
    patch({
        anchor: 'front',
        u0: FLO_SHELL_U0,
        u1: FLO_SHELL_U1,
        mirrored: true,
        from: -0.400,
        to: -0.300,
        uSegments: 8,
        vSegments: 5,
        lift: 0.015,
        taper: 0.26,
        shade: FLO_GUARD_SHADE,
    }),
    patch({
        anchor: 'front',
        u0: FLO_SHELL_U0,
        u1: FLO_SHELL_U1,
        mirrored: true,
        from: -0.428,
        to: FLO_CUP_TOP,
        uSegments: 7,
        vSegments: 2,
        lift: 0.032,
        taper: 0.30,
        shade: FLO_GUARD_SHADE,
    }),
    patch({
        anchor: 'outboard',
        u0: -0.12,
        u1: 0.12,
        from: -0.400,
        to: -0.296,
        uSegments: 2,
        vSegments: 4,
        lift: 0.026,
        taper: 0.10,
        shade: FLO_CUP_SHADE,
    }),
    patch({
        anchor: 'outboard',
        u0: -0.34,
        u1: 0.34,
        from: -0.386,
        to: -0.320,
        uSegments: 5,
        vSegments: 3,
        lift: 0.031,
        taper: 0.35,
        shade: FLO_GUARD_SHADE,
    }),
]);
const FLO_KNEE_PAD = group('accent', [
    patch({
        anchor: 'front',
        u0: FLO_SHELL_U0,
        u1: FLO_SHELL_U1,
        mirrored: true,
        from: FLO_CUP_BOTTOM,
        to: 0.000,
        uSegments: 8,
        vSegments: 1,
        lift: 0.038,
        taper: 0.28,
        shade: FLO_GUARD_SHADE,
    }),
    patch({
        anchor: 'front',
        u0: FLO_PLATE_U0,
        u1: FLO_PLATE_U1,
        mirrored: true,
        from: -0.224,
        to: FLO_CUP_BOTTOM,
        uSegments: 7,
        vSegments: 7,
        lift: 0.018,
        taper: 0.40,
        shade: FLO_GUARD_SHADE,
    }),
    patch({
        anchor: 'front',
        u0: FLO_PLATE_U0,
        u1: FLO_PLATE_U1,
        mirrored: true,
        from: -0.262,
        to: -0.222,
        uSegments: 7,
        vSegments: 2,
        lift: 0.024,
        taper: 0.20,
        shade: FLO_CUP_SHADE,
    }),
    patch({
        anchor: 'front',
        u0: -1.90,
        u1: 0.66,
        mirrored: true,
        from: -0.300,
        to: -0.240,
        uSegments: 7,
        vSegments: 3,
        lift: 0.016,
        taper: 0.34,
        shade: FLO_GUARD_SHADE,
    }),
    patch({
        anchor: 'front',
        u0: -1.90,
        u1: 0.66,
        mirrored: true,
        from: -0.318,
        to: -0.278,
        uSegments: 7,
        vSegments: 2,
        lift: 0.024,
        taper: 0.20,
        shade: FLO_CUP_SHADE,
    }),
    ...[-0.104, -0.148].map((from) => patch({
        anchor: 'outboard',
        u0: -0.24,
        u1: 0.24,
        from,
        to: from + 0.028,
        uSegments: 4,
        vSegments: 2,
        lift: 0.027,
        taper: 0.78,
        shade: FLO_CUP_SHADE,
    })),
]);
const FLO_ELBOW_PAD = group('body', [
    patch({
        anchor: 'back',
        u0: -0.70,
        u1: 0.70,
        from: -0.100,
        to: -0.012,
        uSegments: 5,
        vSegments: 2,
        lift: 0.006,
        taper: 0.30,
        shade: 0.65,
    }),
]);
const FLO_BOSS_CENTRE = Math.PI / 2 - 0.33;
const FLO_BOSS_HALF_SPAN = 0.22;
const FLO_BOSS_DISC_HALF_SPAN = 0.10;
const FLO_HEAD_PANELS = Object.freeze([
    patch({
        anchor: 'front',
        u0: 0,
        u1: Math.PI * 2,
        from: 0.058,
        to: 0.068,
        uSegments: 18,
        vSegments: 1,
        lift: 0.002,
        shade: 0.45,
    }),
    ...[-1, 1].map((side) => patch({
        anchor: 'front',
        u0: side * FLO_BOSS_CENTRE - FLO_BOSS_HALF_SPAN,
        u1: side * FLO_BOSS_CENTRE + FLO_BOSS_HALF_SPAN,
        from: 0.170,
        to: 0.200,
        uSegments: 5,
        vSegments: 2,
        lift: 0.008,
        taper: 0.25,
        shade: 1.06,
    })),
    ...[-1, 1].map((side) => patch({
        anchor: 'front',
        u0: side * FLO_BOSS_CENTRE - FLO_BOSS_DISC_HALF_SPAN,
        u1: side * FLO_BOSS_CENTRE + FLO_BOSS_DISC_HALF_SPAN,
        from: 0.178,
        to: 0.192,
        uSegments: 3,
        vSegments: 1,
        lift: 0.013,
        taper: 0.55,
        shade: 0.80,
    })),
]);
const FLO_VISOR_HALF_SPAN = 1.20;
const FLO_FACE = group('face', [
    patch({
        anchor: 'front',
        u0: -FLO_VISOR_HALF_SPAN,
        u1: FLO_VISOR_HALF_SPAN,
        from: 0.104,
        to: 0.203,
        uSegments: 16,
        vSegments: 5,
        lift: 0.006,
        sink: -0.014,
        taper: 0.26,
        bulge: 0.20,
        shade: 1,
    }),
]);
export const FLO_WITH_ZO_LOOK = Object.freeze({
    id: 'flo-with-zo',
    density: Object.freeze({ limb: 18, torso: 30, head: 32, hand: 18 }),
    materials: Object.freeze({
        body: FLO_SUIT,
        limbs: FLO_SUIT,
        accent: FLO_GUARD,
        head: FLO_LID,
        face: FLO_LENS,
        gear: FLO_GEAR,
    }),
    profiles: Object.freeze({
        torso: FLO_JERSEY,
        seat: FLO_SEAT,
        thigh: FLO_THIGH,
        shin: FLO_SHIN,
        upperArm: FLO_UPPER_ARM,
        forearm: FLO_FOREARM,
        neck: FLO_NECK,
        head: FLO_HELMET,
        boot: FLO_BOOT,
        bootSole: FLO_BOOT_SOLE,
        hand: FLO_GLOVE,
    }),
    shades: Object.freeze({ seat: FLO_SEAT_SHADE, legs: 1.0, collar: 1.0, sole: FLO_SOLE_SHADE, neck: 0.42 }),
    parts: Object.freeze({
        hands: 'gear',
        neck: 'gear',
        kneePad: 'accent',
        legs: 'limbs',
        seat: 'body',
    }),
    panels: Object.freeze({
        elbowPad: FLO_ELBOW_PAD,
        thighPad: Object.freeze({ ...FLO_THIGH_PAD, ghostSilhouette: true }),
        kneePad: Object.freeze({ ...FLO_KNEE_PAD, ghostSilhouette: true }),
        head: FLO_HEAD_PANELS,
        face: FLO_FACE,
    }),
    extras: Object.freeze([]),
    build: Object.freeze({ hand: Object.freeze([floThumb]) }),
    paint: Object.freeze({
        torso: paintFloTorso,
        upperArm: paintFloUpperArm,
        forearm: paintFloForearm,
        thigh: paintFloThigh,
        shin: paintFloShin,
        boot: paintFloBoot,
    }),
    armCarriage: Object.freeze({ splay: 0.012, rise: 0 }),
});
