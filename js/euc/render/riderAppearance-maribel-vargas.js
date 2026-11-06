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
import { sculptMaribelHair } from './maribelHair.js';
import { BLOCKOUT_COLOURS, RIDER_BLOCKOUT } from '../data/tuning.js';
import { loftGeometry, loftProfile, mergeGeometries, tintOver } from './blockoutKit.js';
import { ATLAS_REGIONS, createMaribelAtlas } from './maribelAtlas.js';
const TORSO_HALF_WIDTH = RIDER_BLOCKOUT.torsoWidth / 2;
const TORSO_HALF_DEPTH = RIDER_BLOCKOUT.torsoDepth / 2;
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
function outboardFace(x, z, side, sharpness) {
    const radius = Math.hypot(x, z);
    return radius > 1e-4 && (x * side) / radius > sharpness;
}
const MARIBEL_BOOT_TOP = 0.62;
const MARIBEL_CUFF_TOP = 0.46;
const MARIBEL_GUARD_TOP = 0.70;
const MARIBEL_CUP_TOP = -0.352;
const MARIBEL_CUP_BOTTOM = -0.012;
const MARIBEL_BICEP_TOP = 0.20;
const MARIBEL_BICEP_BOTTOM = 0.40;
const MARIBEL_LEATHER_SHADE = tintOver(BLOCKOUT_COLOURS.maribelMark, BLOCKOUT_COLOURS.maribelSuit)[0];
const MARIBEL_GUARD_SHADE = MARIBEL_LEATHER_SHADE * 2.4;
const MARIBEL_RIM_SHADE = 0.378;
const MARIBEL_SUIT_TORSO = loftProfile([
    { y: -0.010, halfWidth: 1.060 * TORSO_HALF_WIDTH, halfDepth: 1.020 * TORSO_HALF_DEPTH, square: 2.55 },
    { y: 0.012, halfWidth: 1.025 * TORSO_HALF_WIDTH, halfDepth: 0.985 * TORSO_HALF_DEPTH, square: 2.52 },
    { y: 0.036, halfWidth: 0.965 * TORSO_HALF_WIDTH, halfDepth: 0.935 * TORSO_HALF_DEPTH, square: 2.48 },
    { y: 0.062, halfWidth: 0.900 * TORSO_HALF_WIDTH, halfDepth: 0.885 * TORSO_HALF_DEPTH, square: 2.44 },
    { y: 0.090, halfWidth: 0.845 * TORSO_HALF_WIDTH, halfDepth: 0.850 * TORSO_HALF_DEPTH, z: -0.002, square: 2.4 },
    { y: 0.118, halfWidth: 0.800 * TORSO_HALF_WIDTH, halfDepth: 0.820 * TORSO_HALF_DEPTH, z: -0.004, square: 2.36 },
    { y: 0.148, halfWidth: 0.755 * TORSO_HALF_WIDTH, halfDepth: 0.795 * TORSO_HALF_DEPTH, z: -0.005, square: 2.32 },
    { y: 0.168, halfWidth: 0.723 * TORSO_HALF_WIDTH, halfDepth: 0.780 * TORSO_HALF_DEPTH, z: -0.006, square: 2.3 },
    { y: 0.185, halfWidth: 0.710 * TORSO_HALF_WIDTH, halfDepth: 0.772 * TORSO_HALF_DEPTH, z: -0.006, square: 2.28 },
    { y: 0.205, halfWidth: 0.730 * TORSO_HALF_WIDTH, halfDepth: 0.800 * TORSO_HALF_DEPTH, z: -0.002, square: 2.28 },
    { y: 0.228, halfWidth: 0.768 * TORSO_HALF_WIDTH, halfDepth: 0.845 * TORSO_HALF_DEPTH, z: 0.004, square: 2.27 },
    { y: 0.252, halfWidth: 0.805 * TORSO_HALF_WIDTH, halfDepth: 0.895 * TORSO_HALF_DEPTH, z: 0.011, square: 2.26 },
    { y: 0.276, halfWidth: 0.838 * TORSO_HALF_WIDTH, halfDepth: 0.945 * TORSO_HALF_DEPTH, z: 0.019, square: 2.24 },
    { y: 0.300, halfWidth: 0.862 * TORSO_HALF_WIDTH, halfDepth: 0.995 * TORSO_HALF_DEPTH, z: 0.028, square: 2.22 },
    { y: 0.318, halfWidth: 0.874 * TORSO_HALF_WIDTH, halfDepth: 1.045 * TORSO_HALF_DEPTH, z: 0.036, square: 2.18 },
    { y: 0.336, halfWidth: 0.882 * TORSO_HALF_WIDTH, halfDepth: 1.085 * TORSO_HALF_DEPTH, z: 0.043, square: 2.14 },
    { y: 0.352, halfWidth: 0.886 * TORSO_HALF_WIDTH, halfDepth: 1.075 * TORSO_HALF_DEPTH, z: 0.042, square: 2.16 },
    { y: 0.370, halfWidth: 0.892 * TORSO_HALF_WIDTH, halfDepth: 1.020 * TORSO_HALF_DEPTH, z: 0.034, square: 2.24 },
    { y: 0.388, halfWidth: 0.900 * TORSO_HALF_WIDTH, halfDepth: 0.965 * TORSO_HALF_DEPTH, z: 0.024, square: 2.34 },
    { y: 0.408, halfWidth: 0.908 * TORSO_HALF_WIDTH, halfDepth: 0.930 * TORSO_HALF_DEPTH, z: 0.014, square: 2.44 },
    { y: 0.430, halfWidth: 0.914 * TORSO_HALF_WIDTH, halfDepth: 0.910 * TORSO_HALF_DEPTH, z: 0.008, square: 2.56 },
    { y: 0.452, halfWidth: 0.920 * TORSO_HALF_WIDTH, halfDepth: 0.900 * TORSO_HALF_DEPTH, z: 0.003, square: 2.7 },
    { y: 0.474, halfWidth: 0.906 * TORSO_HALF_WIDTH, halfDepth: 0.868 * TORSO_HALF_DEPTH, z: 0.001, square: 2.78 },
    { y: 0.500, halfWidth: 0.860 * TORSO_HALF_WIDTH, halfDepth: 0.800 * TORSO_HALF_DEPTH, square: 2.8 },
    { y: 0.528, halfWidth: 0.700 * TORSO_HALF_WIDTH, halfDepth: 0.640 * TORSO_HALF_DEPTH, square: 2.5 },
    { y: 0.548, halfWidth: 0.420 * TORSO_HALF_WIDTH, halfDepth: 0.480 * TORSO_HALF_DEPTH, square: 2.3 },
]);
const MARIBEL_SEAT = loftProfile([
    { y: -0.098, halfWidth: 0.840 * TORSO_HALF_WIDTH, halfDepth: 0.840 * TORSO_HALF_DEPTH, square: 2.55 },
    { y: -0.078, halfWidth: 0.955 * TORSO_HALF_WIDTH, halfDepth: 0.905 * TORSO_HALF_DEPTH, square: 2.58 },
    { y: -0.062, halfWidth: 1.020 * TORSO_HALF_WIDTH, halfDepth: 0.945 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.046, halfWidth: 1.062 * TORSO_HALF_WIDTH, halfDepth: 0.972 * TORSO_HALF_DEPTH, square: 2.6 },
    { y: -0.030, halfWidth: 1.080 * TORSO_HALF_WIDTH, halfDepth: 0.980 * TORSO_HALF_DEPTH, square: 2.58 },
    { y: -0.014, halfWidth: 1.048 * TORSO_HALF_WIDTH, halfDepth: 0.972 * TORSO_HALF_DEPTH, square: 2.56 },
    { y: 0.008, halfWidth: 0.985 * TORSO_HALF_WIDTH, halfDepth: 0.935 * TORSO_HALF_DEPTH, square: 2.56 },
    { y: 0.030, halfWidth: 0.950 * TORSO_HALF_WIDTH, halfDepth: 0.900 * TORSO_HALF_DEPTH, square: 2.58 },
]);
const MARIBEL_THIGH = loftProfile([
    { y: 0, halfWidth: 0.0860, halfDepth: 0.0826, square: 2.30 },
    { y: -0.052, halfWidth: 0.0838, halfDepth: 0.0805, square: 2.28 },
    { y: -0.098, halfWidth: 0.0770, halfDepth: 0.0740, square: 2.28 },
    { y: -0.117, halfWidth: 0.0742, halfDepth: 0.0713, square: 2.28 },
    { y: -0.123, halfWidth: 0.0726, halfDepth: 0.0698, square: 2.28 },
    { y: -0.180, halfWidth: 0.0668, halfDepth: 0.0642, square: 2.30 },
    { y: -0.240, halfWidth: 0.0620, halfDepth: 0.0596, square: 2.30 },
    { y: -0.277, halfWidth: 0.0600, halfDepth: 0.0578, square: 2.32 },
    { y: -0.283, halfWidth: 0.0588, halfDepth: 0.0566, square: 2.32 },
    { y: -0.300, halfWidth: 0.0592, halfDepth: 0.0570, square: 2.34 },
    { y: -0.344, halfWidth: 0.0578, halfDepth: 0.0566, square: 2.38 },
    { y: -0.349, halfWidth: 0.0570, halfDepth: 0.0558, square: 2.38 },
    { y: -0.355, halfWidth: 0.0556, halfDepth: 0.0546, square: 2.36 },
    { y: -0.400, halfWidth: 0.0540, halfDepth: 0.0524, square: 2.34 },
]);
const MARIBEL_SHIN = loftProfile([
    { y: 0, halfWidth: 0.0580, halfDepth: 0.0540, square: 2.30 },
    { y: -0.070, halfWidth: 0.0575, halfDepth: 0.0552, square: 2.30 },
    { y: -0.108, halfWidth: 0.0620, halfDepth: 0.0657, z: -0.006, square: 2.32 },
    { y: -0.150, halfWidth: 0.0596, halfDepth: 0.0602, z: -0.003, square: 2.32 },
    { y: -0.1718, halfWidth: 0.0545, halfDepth: 0.0520, square: 2.30 },
    { y: -0.1778, halfWidth: 0.0522, halfDepth: 0.0498, square: 2.30 },
    { y: -0.210, halfWidth: 0.0510, halfDepth: 0.0482, square: 2.30 },
    { y: -0.2326, halfWidth: 0.0500, halfDepth: 0.0470, square: 2.32 },
    { y: -0.2386, halfWidth: 0.0490, halfDepth: 0.0460, square: 2.32 },
    { y: -0.310, halfWidth: 0.0492, halfDepth: 0.0464, square: 2.32 },
    { y: -0.380, halfWidth: 0.0490, halfDepth: 0.0462, square: 2.32 },
]);
const MARIBEL_UPPER_ARM = loftProfile([
    { y: 0, halfWidth: 0.0430, halfDepth: 0.0417, square: 2.30 },
    { y: -0.028, halfWidth: 0.0492, halfDepth: 0.0477, square: 2.25 },
    { y: -0.0545, halfWidth: 0.0498, halfDepth: 0.0478, square: 2.25 },
    { y: -0.0575, halfWidth: 0.0468, halfDepth: 0.0449, square: 2.25 },
    { y: -0.082, halfWidth: 0.0455, halfDepth: 0.0437, square: 2.25 },
    { y: -0.1105, halfWidth: 0.0442, halfDepth: 0.0420, square: 2.25 },
    { y: -0.1135, halfWidth: 0.0468, halfDepth: 0.0445, square: 2.25 },
    { y: -0.140, halfWidth: 0.0440, halfDepth: 0.0418, square: 2.30 },
    { y: -0.172, halfWidth: 0.0412, halfDepth: 0.0387, square: 2.30 },
    { y: -0.2015, halfWidth: 0.0400, halfDepth: 0.0376, square: 2.30 },
    { y: -0.2045, halfWidth: 0.0378, halfDepth: 0.0355, square: 2.30 },
    { y: -0.230, halfWidth: 0.0368, halfDepth: 0.0342, square: 2.35 },
    { y: -0.256, halfWidth: 0.0372, halfDepth: 0.0342, square: 2.40 },
    { y: -0.272, halfWidth: 0.0350, halfDepth: 0.0322, square: 2.30 },
    { y: -0.280, halfWidth: 0.0300, halfDepth: 0.0276, square: 2.20 },
]);
const MARIBEL_FOREARM = loftProfile([
    { y: 0, halfWidth: 0.0378, halfDepth: 0.0362, square: 2.30 },
    { y: -0.030, halfWidth: 0.0400, halfDepth: 0.0378, square: 2.35 },
    { y: -0.058, halfWidth: 0.0392, halfDepth: 0.0366, square: 2.35 },
    { y: -0.092, halfWidth: 0.0360, halfDepth: 0.0332, square: 2.30 },
    { y: -0.1155, halfWidth: 0.0345, halfDepth: 0.0316, square: 2.30 },
    { y: -0.1185, halfWidth: 0.0328, halfDepth: 0.0300, square: 2.30 },
    { y: -0.150, halfWidth: 0.0310, halfDepth: 0.0280, square: 2.30 },
    { y: -0.186, halfWidth: 0.0288, halfDepth: 0.0252, square: 2.40 },
    { y: -0.220, halfWidth: 0.0268, halfDepth: 0.0225, square: 2.50 },
    { y: -0.246, halfWidth: 0.0252, halfDepth: 0.0206, square: 2.55 },
    { y: -0.262, halfWidth: 0.0242, halfDepth: 0.0198, square: 2.50 },
    { y: -0.266, halfWidth: 0.0180, halfDepth: 0.0150, square: 2.40 },
]);
const MARIBEL_NECK = loftProfile([
    { y: -0.048, halfWidth: 0.058, halfDepth: 0.056, square: 2.4 },
    { y: -0.010, halfWidth: 0.051, halfDepth: 0.049, square: 2.3 },
    { y: 0.050, halfWidth: 0.046, halfDepth: 0.044, square: 2.2 },
    { y: 0.098, halfWidth: 0.044, halfDepth: 0.042, square: 2.2 },
]);
const MARIBEL_HELMET = loftProfile([
    { y: 0.052, halfWidth: 0.066, halfDepth: 0.100, square: 2.3, z: 0.000 },
    { y: 0.086, halfWidth: 0.090, halfDepth: 0.110, square: 2.3, z: 0.010 },
    { y: 0.114, halfWidth: 0.104, halfDepth: 0.124, square: 2.5, z: 0.006 },
    { y: 0.152, halfWidth: 0.114, halfDepth: 0.130, square: 2.6, z: 0.008 },
    { y: 0.208, halfWidth: 0.119, halfDepth: 0.134, square: 2.5, z: 0.002 },
    { y: 0.258, halfWidth: 0.109, halfDepth: 0.121, square: 2.3, z: -0.004 },
    { y: 0.300, halfWidth: 0.082, halfDepth: 0.092, square: 2.2, z: -0.010 },
    { y: 0.330, halfWidth: 0.040, halfDepth: 0.048, square: 2.2, z: -0.014 },
    { y: 0.342, halfWidth: 0, halfDepth: 0 },
]);
const MARIBEL_BOOT = loftProfile(BOOT.map((ring) => ({ ...ring, halfWidth: ring.halfWidth * 0.93, halfDepth: ring.halfDepth * 0.95 })));
const MARIBEL_HAND = loftProfile([
    { y: 0.014, halfWidth: 0.0300, halfDepth: 0.0270, square: 2.5 },
    { y: 0.006, halfWidth: 0.0405, halfDepth: 0.0350, square: 2.7 },
    { y: -0.020, halfWidth: 0.0387, halfDepth: 0.0330, square: 2.8 },
    { y: -0.038, halfWidth: 0.0330, halfDepth: 0.0270, square: 2.8 },
    { y: -0.052, halfWidth: 0.0270, halfDepth: 0.0215, square: 2.6 },
    { y: -0.068, halfWidth: 0.0355, halfDepth: 0.0225, square: 3.0 },
    { y: -0.092, halfWidth: 0.0400, halfDepth: 0.0215, square: 3.4 },
    { y: -0.114, halfWidth: 0.0415, halfDepth: 0.0200, square: 3.6 },
    { y: -0.132, halfWidth: 0.0405, halfDepth: 0.0235, square: 3.2 },
    { y: -0.146, halfWidth: 0.0330, halfDepth: 0.0250, square: 2.9 },
    { y: -0.156, halfWidth: 0.0225, halfDepth: 0.0195, square: 2.6 },
    { y: -0.162, halfWidth: 0.0090, halfDepth: 0.0080, square: 2.4 },
    { y: -0.166, halfWidth: 0, halfDepth: 0 },
]);
const maribelThumb = (side) => loftGeometry(loftProfile([
    { y: -0.056, x: -side * 0.0230, z: 0.0060, halfWidth: 0.0135, halfDepth: 0.0150, square: 2.7 },
    { y: -0.070, x: -side * 0.0330, z: 0.0135, halfWidth: 0.0140, halfDepth: 0.0155, square: 2.8 },
    { y: -0.086, x: -side * 0.0395, z: 0.0215, halfWidth: 0.0125, halfDepth: 0.0140, square: 2.7 },
    { y: -0.100, x: -side * 0.0420, z: 0.0285, halfWidth: 0.0100, halfDepth: 0.0115, square: 2.6 },
    { y: -0.108, x: -side * 0.0425, z: 0.0310, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 14 });
const maribelFingersInner = (side) => loftGeometry(loftProfile([
    { y: -0.104, x: -side * 0.0115, z: 0.0035, halfWidth: 0.0175, halfDepth: 0.0180, square: 2.8 },
    { y: -0.124, x: -side * 0.0125, z: 0.0075, halfWidth: 0.0195, halfDepth: 0.0210, square: 3.0 },
    { y: -0.144, x: -side * 0.0130, z: 0.0130, halfWidth: 0.0180, halfDepth: 0.0195, square: 2.9 },
    { y: -0.158, x: -side * 0.0130, z: 0.0180, halfWidth: 0.0125, halfDepth: 0.0140, square: 2.6 },
    { y: -0.166, x: -side * 0.0130, z: 0.0205, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 14 });
const maribelFingersOuter = (side) => loftGeometry(loftProfile([
    { y: -0.104, x: side * 0.0125, z: 0.0030, halfWidth: 0.0160, halfDepth: 0.0170, square: 2.8 },
    { y: -0.122, x: side * 0.0140, z: 0.0068, halfWidth: 0.0175, halfDepth: 0.0195, square: 3.0 },
    { y: -0.138, x: side * 0.0145, z: 0.0115, halfWidth: 0.0155, halfDepth: 0.0175, square: 2.9 },
    { y: -0.150, x: side * 0.0145, z: 0.0155, halfWidth: 0.0105, halfDepth: 0.0120, square: 2.6 },
    { y: -0.157, x: side * 0.0145, z: 0.0175, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 14 });
const MARIBEL_SUIT = Object.freeze({
    colour: BLOCKOUT_COLOURS.maribelSuit,
    roughness: 0.70,
    metalness: 0.0,
});
const MARIBEL_MARK = Object.freeze({
    colour: BLOCKOUT_COLOURS.maribelMark,
    roughness: 0.74,
    metalness: 0.0,
});
const MARIBEL_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.maribelGear,
    roughness: 0.58,
    metalness: 0.0,
});
const MARIBEL_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelPanel, 0.55);
const MARIBEL_YOKE_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelPanel, 0.22);
const MARIBEL_AQUA_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelAqua);
const MARIBEL_CORAL_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelCoral);
const MARIBEL_BOOT_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelGear);
const MARIBEL_GUARD_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelMark, MARIBEL_GUARD_SHADE);
const MARIBEL_ELBOW_RIM_TINT = tintOver(BLOCKOUT_COLOURS.maribelSuit, BLOCKOUT_COLOURS.maribelMark, MARIBEL_RIM_SHADE * 0.7);
const MARIBEL_BOOT_PANEL_TINT = tintOver(BLOCKOUT_COLOURS.maribelGear, BLOCKOUT_COLOURS.maribelGear, 1.34);
const MARIBEL_HIVIS_TINT = tintOver(BLOCKOUT_COLOURS.maribelGear, BLOCKOUT_COLOURS.maribelHiVis);
const MARIBEL_HAIR_TINT = tintOver(BLOCKOUT_COLOURS.maribelMark, BLOCKOUT_COLOURS.maribelHair);
const MARIBEL_HAIR_DARK_TINT = tintOver(BLOCKOUT_COLOURS.maribelMark, 0x1d1712);
const MARIBEL_HAIR_LIGHT_TINT = tintOver(BLOCKOUT_COLOURS.maribelMark, BLOCKOUT_COLOURS.maribelHairLight);
function maribelAccent(side) {
    return side < 0 ? MARIBEL_AQUA_TINT : MARIBEL_CORAL_TINT;
}
function mixTint(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function ramp(value, from, to) {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}
function paintMaribelTorso(geometry) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const radius = Math.hypot(x, z);
        if (radius < 1e-4)
            continue;
        if (Math.abs(x) / radius > 0.86 && y > 0.034 && y < 0.436) {
            colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
            continue;
        }
        const scoop = position.getZ(i) > 0
            ? 0.034 * (1 - ramp(Math.abs(position.getX(i)), 0.018, 0.132))
            : 0;
        const lift = ramp(y, 0.404 - scoop, 0.500 - scoop * 0.4);
        if (lift <= 0.002)
            continue;
        const tint = mixTint([1, 1, 1], MARIBEL_YOKE_TINT, lift);
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintMaribelUpperArm(geometry, side) {
    const length = RIDER_BLOCKOUT.upperArmLength;
    const top = -length * MARIBEL_BICEP_TOP;
    const bottom = -length * MARIBEL_BICEP_BOTTOM;
    const accent = maribelAccent(side);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y <= top && y >= bottom) {
            colour.setXYZ(i, accent[0], accent[1], accent[2]);
            continue;
        }
        if (y > bottom || y < -length * 0.725)
            continue;
        if (!outboardFace(position.getX(i), position.getZ(i), side, 0.70))
            continue;
        colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
    }
}
function paintMaribelForearm(geometry, _side) {
    const length = RIDER_BLOCKOUT.forearmLength;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y > -0.006 || y < -length * 0.45)
            continue;
        const x = position.getX(i);
        const z = position.getZ(i);
        const radius = Math.hypot(x, z);
        if (radius < 1e-4)
            continue;
        if (z / radius > 0.10)
            continue;
        const crest = z / radius < -0.62 && y < -0.030 && y > -0.062;
        const tint = crest ? MARIBEL_ELBOW_RIM_TINT : MARIBEL_GUARD_TINT;
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function paintMaribelThigh(geometry, side) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y <= MARIBEL_CUP_TOP) {
            colour.setXYZ(i, MARIBEL_GUARD_TINT[0], MARIBEL_GUARD_TINT[1], MARIBEL_GUARD_TINT[2]);
            continue;
        }
        if (y <= -0.2395 && y >= -0.2775) {
            const band = maribelAccent(side);
            colour.setXYZ(i, band[0], band[1], band[2]);
            continue;
        }
        if (y > -0.020 || y < -RIDER_BLOCKOUT.thighLength * MARIBEL_GUARD_TOP)
            continue;
        if (!outboardFace(position.getX(i), position.getZ(i), side, 0.55))
            continue;
        colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
    }
}
function paintMaribelShin(geometry, side) {
    const length = RIDER_BLOCKOUT.shinLength;
    const cuffTop = -length * MARIBEL_CUFF_TOP;
    const bootTop = -length * MARIBEL_BOOT_TOP;
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y < bootTop) {
            colour.setXYZ(i, MARIBEL_BOOT_TINT[0], MARIBEL_BOOT_TINT[1], MARIBEL_BOOT_TINT[2]);
            continue;
        }
        if (y < cuffTop) {
            colour.setXYZ(i, MARIBEL_BOOT_TINT[0], MARIBEL_BOOT_TINT[1], MARIBEL_BOOT_TINT[2]);
            continue;
        }
        if (y > MARIBEL_CUP_BOTTOM) {
            colour.setXYZ(i, MARIBEL_GUARD_TINT[0], MARIBEL_GUARD_TINT[1], MARIBEL_GUARD_TINT[2]);
            continue;
        }
        if (!outboardFace(position.getX(i), position.getZ(i), side, 0.55))
            continue;
        colour.setXYZ(i, MARIBEL_PANEL_TINT[0], MARIBEL_PANEL_TINT[1], MARIBEL_PANEL_TINT[2]);
    }
}
function paintMaribelBoot(geometry) {
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
        const ankleBand = t > 0.64 && t < 0.84;
        const toeCap = t < 0.32 && z > 0.055;
        const instepStrap = t > 0.38 && t < 0.52 && z > 0.02;
        if (ankleBand || toeCap || instepStrap) {
            colour.setXYZ(i, MARIBEL_BOOT_PANEL_TINT[0], MARIBEL_BOOT_PANEL_TINT[1], MARIBEL_BOOT_PANEL_TINT[2]);
        }
    }
}
function paintMaribelHand(geometry) {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        if (y > -0.050)
            continue;
        if (position.getZ(i) < -0.006)
            continue;
        if (y < -0.1315)
            continue;
        if (Math.abs(position.getX(i)) > 0.030 && y < -0.070)
            continue;
        colour.setXYZ(i, MARIBEL_HIVIS_TINT[0], MARIBEL_HIVIS_TINT[1], MARIBEL_HIVIS_TINT[2]);
    }
}
function lockLength(u) {
    const wave = 0.5 + 0.5 * Math.cos((u + 0.21) * Math.PI * 2.6);
    const fine = 0.5 + 0.5 * Math.cos((u - 0.37) * Math.PI * 5.3);
    return 0.28 + 0.56 * wave ** 1.2 + 0.16 * fine;
}
function maribelHairCurtain() {
    const rows = [
        { y: 0.050, x: 0.000, z: -0.096, width: 0.058, depth: 0.010, wrap: 0.045 },
        { y: 0.024, x: -0.003, z: -0.112, width: 0.086, depth: 0.016, wrap: 0.038 },
        { y: -0.002, x: -0.004, z: -0.134, width: 0.106, depth: 0.022, wrap: 0.025 },
        { y: -0.026, x: -0.007, z: -0.147, width: 0.118, depth: 0.026, wrap: 0.015 },
        { y: -0.046, x: -0.011, z: -0.146, width: 0.116, depth: 0.025, wrap: 0.009 },
        { y: -0.064, x: -0.014, z: -0.139, width: 0.106, depth: 0.020, wrap: 0.005 },
        { y: -0.080, x: -0.017, z: -0.130, width: 0.092, depth: 0.014, wrap: 0.002 },
        { y: -0.095, x: -0.019, z: -0.121, width: 0.079, depth: 0.008, wrap: 0.000 },
    ];
    const wrapAt = (u) => {
        const t = Math.min(1, Math.abs(u));
        const shell = MARIBEL_HELMET[0].square;
        return 1 - (1 - t ** shell) ** (1 / shell);
    };
    const columns = 13;
    const positions = [];
    const uvs = [];
    const colours = [];
    const indices = [];
    for (const side of [1, -1]) {
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            const v = rowIndex / (rows.length - 1);
            for (let column = 0; column < columns; column += 1) {
                const u01 = column / (columns - 1);
                const u = u01 * 2 - 1;
                const edge = Math.cos(Math.abs(u) * Math.PI * 0.5);
                const tip = Math.max(0, (v - 0.52) / 0.48);
                const hem = -0.046 * tip * tip * lockLength(u);
                const surfaceWave = Math.sin(v * Math.PI * 2.3 + u * Math.PI * 1.7) * 0.0045 * edge;
                const sideDepth = row.depth * (0.32 + 0.68 * edge ** 0.7);
                positions.push(row.x + u * row.width + Math.sin(v * Math.PI * 1.7) * u * 0.003, row.y + hem, row.z + row.wrap * wrapAt(u) + surfaceWave + side * sideDepth);
                uvs.push(u01, 1 - v);
                colours.push(1, 1, 1);
            }
        }
    }
    const surfaceSize = rows.length * columns;
    for (let side = 0; side < 2; side += 1) {
        const offset = side * surfaceSize;
        for (let row = 0; row < rows.length - 1; row += 1) {
            for (let column = 0; column < columns - 1; column += 1) {
                const a = offset + row * columns + column;
                const b = a + 1;
                const c = a + columns;
                const d = c + 1;
                if (side === 0)
                    indices.push(a, c, b, b, c, d);
                else
                    indices.push(a, b, c, b, d, c);
            }
        }
    }
    const close = (a, b) => {
        indices.push(a, a + surfaceSize, b, b, a + surfaceSize, b + surfaceSize);
    };
    for (let column = 0; column < columns - 1; column += 1) {
        close(column + 1, column);
        const bottom = (rows.length - 1) * columns;
        close(bottom + column, bottom + column + 1);
    }
    for (let row = 0; row < rows.length - 1; row += 1) {
        close(row * columns, (row + 1) * columns);
        close((row + 2) * columns - 1, (row + 1) * columns - 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
function paintMaribelHair(geometry) {
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const u = uv.getX(i) * 2 - 1;
        const along = 1 - uv.getY(i);
        const onset = 0.62 - 0.24 * lockLength(u);
        const depth = ramp(along, onset, 0.99) * 0.94;
        const lane = 0.56 + 0.44 * ramp(-0.82 * x - 0.45 * z, -0.04, 0.10);
        const parting = 1 - ramp(Math.abs(x), 0.006, 0.052);
        const tuck = ramp(y, 0.045, 0.105);
        const grooveA = 1 - ramp(Math.abs(x + 0.030), 0.004, 0.019);
        const grooveB = 1 - ramp(Math.abs(x + 0.082), 0.004, 0.017);
        const strandGroove = Math.max(grooveA, grooveB) * ramp(along, 0.10, 0.45);
        const shadow = Math.min(0.34, parting * 0.26 + tuck * 0.26 + strandGroove * 0.10)
            * (1 - depth);
        const lit = mixTint(MARIBEL_HAIR_TINT, MARIBEL_HAIR_LIGHT_TINT, depth * lane);
        const tint = mixTint(lit, MARIBEL_HAIR_DARK_TINT, shadow);
        colour.setXYZ(i, tint[0], tint[1], tint[2]);
    }
}
function maribelHairCap() {
    const parts = [loftGeometry(loftProfile(MARIBEL_HELMET
            .filter((ring) => ring.y >= 0.086 && ring.y <= 0.262)
            .map((ring) => ({
            ...ring,
            halfWidth: ring.halfWidth * 0.90,
            halfDepth: ring.halfDepth * 0.90,
            z: ring.z * 0.90,
        }))), { radialSegments: 24, subdivisions: 1 })];
    parts.push(loftGeometry(loftProfile([
        { y: 0.100, halfWidth: 0.052, halfDepth: 0.032, square: 2.6, z: -0.046 },
        { y: 0.060, halfWidth: 0.054, halfDepth: 0.036, square: 2.5, z: -0.050 },
        { y: 0.020, halfWidth: 0.066, halfDepth: 0.036, square: 2.4, z: -0.050 },
        { y: -0.020, halfWidth: 0.074, halfDepth: 0.032, square: 2.4, z: -0.050 },
        { y: -0.060, halfWidth: 0.066, halfDepth: 0.026, square: 2.4, z: -0.048 },
    ]), { radialSegments: 24, subdivisions: 1 }));
    const cap = mergeGeometries(parts);
    paintMaribelHair(cap);
    for (const part of parts)
        part.dispose();
    return cap;
}
function maribelHair() {
    const curtain = maribelHairCurtain();
    paintMaribelHair(curtain);
    return sculptMaribelHair(curtain);
}
function maribelArmour() {
    const parts = [];
    for (const side of [-1, 1]) {
        parts.push(loftGeometry(loftProfile([
            { y: 0.415, halfWidth: 0.034, halfDepth: 0.050, x: side * 0.146, z: 0.004, square: 2.5 },
            { y: 0.448, halfWidth: 0.046, halfDepth: 0.064, x: side * 0.158, z: 0.005, square: 2.6 },
            { y: 0.478, halfWidth: 0.048, halfDepth: 0.066, x: side * 0.166, z: 0.004, square: 2.6 },
            { y: 0.504, halfWidth: 0.040, halfDepth: 0.054, x: side * 0.170, z: 0.002, square: 2.5 },
            { y: 0.522, halfWidth: 0.020, halfDepth: 0.030, x: side * 0.170, z: 0, square: 2.4 },
        ]), { radialSegments: 12 }));
        parts.push(loftGeometry(loftProfile([
            { y: -0.078, halfWidth: 0.012, halfDepth: 0.038, x: side * 0.165, z: 0.010, square: 2.6 },
            { y: -0.045, halfWidth: 0.008, halfDepth: 0.054, x: side * 0.181, z: 0.012, square: 2.8 },
            { y: -0.012, halfWidth: 0.008, halfDepth: 0.049, x: side * 0.178, z: 0.010, square: 2.7 },
            { y: 0.014, halfWidth: 0.006, halfDepth: 0.032, x: side * 0.169, z: 0.008, square: 2.5 },
        ]), { radialSegments: 20 }));
    }
    const merged = mergeGeometries(parts);
    const position = merged.getAttribute('position');
    const colour = merged.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const crest = y > 0.470 && y < 0.512 ? ramp(y, 0.470, 0.496) : 0;
        const value = MARIBEL_GUARD_SHADE
            + (MARIBEL_RIM_SHADE * 0.78 - MARIBEL_GUARD_SHADE) * crest;
        colour.setXYZ(i, value, value, value);
    }
    for (const part of parts)
        part.dispose();
    return merged;
}
export const MARIBEL_LOOK = Object.freeze({
    id: 'maribel-vargas',
    density: Object.freeze({ limb: 26, torso: 44, head: 32, boot: 22, hand: 24, neck: 16 }),
    atlas: Object.freeze({
        paintInput: () => ({ cache: 'maribelAtlas.ts', args: [] }),
        build: createMaribelAtlas,
        roles: Object.freeze(['accent', 'face']),
        region: (art) => (art !== undefined && art in ATLAS_REGIONS
            ? ATLAS_REGIONS[art]
            : ATLAS_REGIONS.blank),
    }),
    materials: Object.freeze({
        body: MARIBEL_SUIT,
        limbs: MARIBEL_SUIT,
        accent: MARIBEL_MARK,
        head: Object.freeze({
            colour: BLOCKOUT_COLOURS.maribelHelmet,
            roughness: 0.62,
            metalness: 0,
        }),
        face: Object.freeze({
            colour: BLOCKOUT_COLOURS.maribelVisor,
            roughness: 0.05,
            metalness: 0.44,
            emissive: 0x1d4f6b,
            emissiveIntensity: 0.58,
        }),
        gear: MARIBEL_GEAR,
    }),
    profiles: Object.freeze({
        torso: MARIBEL_SUIT_TORSO,
        seat: MARIBEL_SEAT,
        thigh: MARIBEL_THIGH,
        shin: MARIBEL_SHIN,
        upperArm: MARIBEL_UPPER_ARM,
        forearm: MARIBEL_FOREARM,
        neck: MARIBEL_NECK,
        head: MARIBEL_HELMET,
        boot: MARIBEL_BOOT,
        bootSole: BOOT_SOLE,
        hand: MARIBEL_HAND,
    }),
    shades: Object.freeze({ seat: 0.97, legs: 1.0, collar: 1.10, sole: 0.62, neck: 0.74 }),
    build: Object.freeze({
        hand: Object.freeze([maribelThumb, maribelFingersInner, maribelFingersOuter]),
    }),
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
        torso: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'back',
                    u0: -0.66,
                    u1: 0.66,
                    from: 0.135,
                    to: 0.356,
                    uSegments: 12,
                    vSegments: 10,
                    lift: 0.004,
                    sink: -0.009,
                    taper: 0.06,
                    shade: 1,
                    art: 'backMark',
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -1.16,
                    u1: 1.16,
                    from: 0.030,
                    to: 0.478,
                    uSegments: 24,
                    vSegments: 26,
                    lift: 0.004,
                    sink: -0.009,
                    taper: 0.14,
                    shade: 1,
                    art: 'chest',
                }),
            ]),
        }),
        thighPad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -1.14,
                    u1: 1.14,
                    mirrored: true,
                    from: -0.398,
                    to: MARIBEL_CUP_TOP,
                    uSegments: 7,
                    vSegments: 3,
                    lift: 0.016,
                    taper: 0.30,
                    shade: MARIBEL_GUARD_SHADE,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.26,
                    u1: 0.26,
                    from: -0.374,
                    to: -0.344,
                    uSegments: 4,
                    vSegments: 1,
                    lift: 0.021,
                    taper: 0.66,
                    shade: MARIBEL_RIM_SHADE,
                }),
                Object.freeze({
                    anchor: 'outboard',
                    u0: -0.40,
                    u1: 0.40,
                    from: -0.300,
                    to: -0.052,
                    uSegments: 5,
                    vSegments: 8,
                    lift: 0.004,
                    sink: -0.008,
                    taper: 0.10,
                    shade: 1,
                    art: 'legScript',
                    artOn: -1,
                    artElse: 'legPlain',
                }),
            ]),
        }),
        kneePad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([
                Object.freeze({
                    anchor: 'front',
                    u0: -1.14,
                    u1: 1.14,
                    mirrored: true,
                    from: MARIBEL_CUP_BOTTOM,
                    to: 0.000,
                    uSegments: 7,
                    vSegments: 1,
                    lift: 0.018,
                    taper: 0.30,
                    shade: MARIBEL_GUARD_SHADE,
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -0.97,
                    u1: 0.97,
                    mirrored: true,
                    from: -0.108,
                    to: MARIBEL_CUP_BOTTOM,
                    uSegments: 6,
                    vSegments: 4,
                    lift: 0.015,
                    taper: 0.42,
                    shade: 1,
                    art: 'kneeDevice',
                }),
                Object.freeze({
                    anchor: 'front',
                    u0: -Math.PI,
                    u1: Math.PI,
                    from: -0.126,
                    to: -0.110,
                    uSegments: 14,
                    vSegments: 1,
                    lift: 0.018,
                    taper: 0.26,
                    shade: MARIBEL_LEATHER_SHADE * 0.88,
                }),
            ]),
        }),
        head: Object.freeze([
            Object.freeze({
                anchor: 'front',
                u0: -0.70,
                u1: 0.70,
                from: 0.098,
                to: 0.146,
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
                from: 0.274,
                to: 0.292,
                uSegments: 9,
                vSegments: 1,
                lift: 0.007,
                taper: 0.62,
                shade: 0.78,
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
                    u0: -1.22,
                    u1: 1.22,
                    from: 0.148,
                    to: 0.250,
                    bulge: 0.52,
                    bow: -0.010,
                    uSegments: 16,
                    vSegments: 5,
                    lift: 0.008,
                    sink: -0.014,
                    taper: 0.18,
                    art: 'visor',
                }),
            ]),
        }),
    }),
    extras: Object.freeze([
        Object.freeze({
            name: 'rider-armour',
            joint: 'pelvis',
            role: 'accent',
            casts: false,
            build: maribelArmour,
        }),
        Object.freeze({
            name: 'rider-hair-cap',
            joint: 'neck',
            role: 'accent',
            casts: false,
            art: 'hair',
            build: maribelHairCap,
        }),
        Object.freeze({
            name: 'rider-hair',
            joint: 'neck',
            role: 'accent',
            casts: true,
            art: 'hair',
            sways: true,
            build: maribelHair,
        }),
    ]),
    paint: Object.freeze({
        torso: paintMaribelTorso,
        upperArm: paintMaribelUpperArm,
        forearm: paintMaribelForearm,
        thigh: paintMaribelThigh,
        shin: paintMaribelShin,
        boot: paintMaribelBoot,
        hand: paintMaribelHand,
    }),
    armCarriage: Object.freeze({ splay: -0.006, rise: -0.010 }),
});
