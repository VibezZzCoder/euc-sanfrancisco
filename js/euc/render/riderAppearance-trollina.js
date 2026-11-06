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
import { limbProfile, loftGeometry, loftProfile, mergeGeometries } from './blockoutKit.js';
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
const TROLLINA_HALF_WIDTH = 0.86 * TORSO_HALF_WIDTH;
const TROLLINA_HALF_DEPTH = 0.84 * TORSO_HALF_DEPTH;
const DRESS = loftProfile([
    { y: -0.062, halfWidth: 2.410 * TROLLINA_HALF_WIDTH, halfDepth: 2.305 * TROLLINA_HALF_DEPTH, square: 3.45, z: 0.036 },
    { y: -0.046, halfWidth: 2.329 * TROLLINA_HALF_WIDTH, halfDepth: 2.226 * TROLLINA_HALF_DEPTH, square: 3.38, z: 0.033 },
    { y: 0.008, halfWidth: 1.726 * TROLLINA_HALF_WIDTH, halfDepth: 1.629 * TROLLINA_HALF_DEPTH, square: 3.10, z: 0.024 },
    { y: 0.092, halfWidth: 1.190 * TROLLINA_HALF_WIDTH, halfDepth: 1.212 * TROLLINA_HALF_DEPTH, square: 2.68, z: 0.010 },
    { y: 0.166, halfWidth: 0.83 * TROLLINA_HALF_WIDTH, halfDepth: 0.88 * TROLLINA_HALF_DEPTH, square: 2.25 },
    { y: 0.212, halfWidth: 0.74 * TROLLINA_HALF_WIDTH, halfDepth: 0.84 * TROLLINA_HALF_DEPTH, square: 2.2 },
    { y: 0.268, halfWidth: 0.82 * TROLLINA_HALF_WIDTH, halfDepth: 0.92 * TROLLINA_HALF_DEPTH, square: 2.2 },
    { y: 0.330, halfWidth: 0.93 * TROLLINA_HALF_WIDTH, halfDepth: 1.10 * TROLLINA_HALF_DEPTH, square: 2.1, z: 0.013 },
    { y: 0.392, halfWidth: 0.94 * TROLLINA_HALF_WIDTH, halfDepth: 1.00 * TROLLINA_HALF_DEPTH, square: 2.2, z: 0.009 },
    { y: 0.438, halfWidth: 0.90 * TROLLINA_HALF_WIDTH, halfDepth: 0.90 * TROLLINA_HALF_DEPTH, square: 2.3, z: 0.004 },
    { y: 0.472, halfWidth: 0.78 * TROLLINA_HALF_WIDTH, halfDepth: 0.80 * TROLLINA_HALF_DEPTH, square: 2.3 },
    { y: 0.498, halfWidth: 0.78 * TROLLINA_HALF_WIDTH, halfDepth: 0.72 * TROLLINA_HALF_DEPTH, square: 2.2 },
    { y: 0.522, halfWidth: 0.68 * TROLLINA_HALF_WIDTH, halfDepth: 0.58 * TROLLINA_HALF_DEPTH, square: 2.2 },
    { y: 0.540, halfWidth: 0.34 * TROLLINA_HALF_WIDTH, halfDepth: 0.36 * TROLLINA_HALF_DEPTH, square: 2.2 },
]);
const TROLLINA_SEAT = loftProfile([
    { y: -0.098, halfWidth: 1.18 * TROLLINA_HALF_WIDTH, halfDepth: 1.00 * TROLLINA_HALF_DEPTH, square: 2.6 },
    { y: -0.050, halfWidth: 1.22 * TROLLINA_HALF_WIDTH, halfDepth: 1.04 * TROLLINA_HALF_DEPTH, square: 2.6 },
    { y: 0.008, halfWidth: 1.16 * TROLLINA_HALF_WIDTH, halfDepth: 1.00 * TROLLINA_HALF_DEPTH, square: 2.5 },
    { y: 0.060, halfWidth: 1.00 * TROLLINA_HALF_WIDTH, halfDepth: 0.90 * TROLLINA_HALF_DEPTH, square: 2.4 },
]);
const TROLLINA_THIGH = limbProfile(RIDER_BLOCKOUT.thighLength, [0.070, 0.062, 0.052], [], {
    flatten: 0.96,
    square: 2.2,
});
const TROLLINA_SHIN = limbProfile(RIDER_BLOCKOUT.shinLength, [0.054, 0.048, 0.039], [], {
    flatten: 0.95,
    square: 2.2,
});
const TROLLINA_UPPER_ARM = limbProfile(RIDER_BLOCKOUT.upperArmLength, [0.044, 0.037, 0.032], [], {
    flatten: 0.96,
    square: 2.1,
});
const TROLLINA_FOREARM = limbProfile(RIDER_BLOCKOUT.forearmLength, [0.034, 0.030, 0.027], [], {
    flatten: 0.96,
    square: 2.1,
});
const TROLLINA_SLEEVE = loftProfile([
    { y: -0.100, halfWidth: 0.047, halfDepth: 0.044, square: 2.3 },
    { y: -0.085, halfWidth: 0.064, halfDepth: 0.054, square: 2.4 },
    { y: -0.050, halfWidth: 0.075, halfDepth: 0.060, square: 2.4 },
    { y: -0.008, halfWidth: 0.082, halfDepth: 0.061, square: 2.3 },
    { y: 0.022, halfWidth: 0.045, halfDepth: 0.032, square: 2.2 },
]);
const TROLLINA_HAND = loftProfile([
    { y: 0, halfWidth: 0.028, halfDepth: 0.026, square: 2.4 },
    { y: -0.020, halfWidth: 0.034, halfDepth: 0.030, square: 2.7 },
    { y: -0.048, halfWidth: 0.036, halfDepth: 0.031, square: 2.8 },
    { y: -0.070, halfWidth: 0.035, halfDepth: 0.029, square: 2.9 },
    { y: -0.098, halfWidth: 0.034, halfDepth: 0.028, square: 2.9, z: 0.004 },
    { y: -0.118, halfWidth: 0.030, halfDepth: 0.024, square: 2.8, z: 0.008 },
    { y: -0.130, halfWidth: 0.020, halfDepth: 0.016, square: 2.5, z: 0.011 },
    { y: -0.137, halfWidth: 0, halfDepth: 0, z: 0.012 },
]);
const trollinaThumb = (side) => loftGeometry(loftProfile([
    { y: -0.034, x: -side * 0.019, z: 0.005, halfWidth: 0.011, halfDepth: 0.014, square: 2.5 },
    { y: -0.050, x: -side * 0.029, z: 0.010, halfWidth: 0.015, halfDepth: 0.017, square: 2.5 },
    { y: -0.070, x: -side * 0.038, z: 0.019, halfWidth: 0.014, halfDepth: 0.016, square: 2.4 },
    { y: -0.088, x: -side * 0.040, z: 0.024, halfWidth: 0.009, halfDepth: 0.011, square: 2.2 },
    { y: -0.095, x: -side * 0.038, z: 0.026, halfWidth: 0, halfDepth: 0 },
]), { radialSegments: 12 });
const TROLLINA_NECK = loftProfile([
    { y: -0.040, halfWidth: 0.050, halfDepth: 0.049, square: 2.3 },
    { y: 0.010, halfWidth: 0.044, halfDepth: 0.043, square: 2.2 },
    { y: 0.060, halfWidth: 0.041, halfDepth: 0.040, square: 2.2 },
    { y: 0.098, halfWidth: 0.043, halfDepth: 0.042, square: 2.2 },
]);
const TROLLINA_HEAD = loftProfile([
    { y: 0.090, halfWidth: 0.046, halfDepth: 0.050, square: 2.3, z: 0.008 },
    { y: 0.116, halfWidth: 0.070, halfDepth: 0.076, square: 2.4, z: 0.010 },
    { y: 0.152, halfWidth: 0.087, halfDepth: 0.094, square: 2.4, z: 0.008 },
    { y: 0.200, halfWidth: 0.094, halfDepth: 0.100, square: 2.4, z: 0.003 },
    { y: 0.246, halfWidth: 0.090, halfDepth: 0.095, square: 2.3 },
    { y: 0.284, halfWidth: 0.072, halfDepth: 0.076, square: 2.2 },
    { y: 0.306, halfWidth: 0.034, halfDepth: 0.036, square: 2.2 },
    { y: 0.316, halfWidth: 0, halfDepth: 0 },
]);
function hairSpike(length, thickness) {
    const profile = loftProfile([
        { y: 0, halfWidth: thickness, halfDepth: thickness * 0.86, square: 2.2 },
        { y: length * 0.34, halfWidth: thickness * 0.74, halfDepth: thickness * 0.64, square: 2.2, z: length * 0.12 },
        { y: length * 0.72, halfWidth: thickness * 0.40, halfDepth: thickness * 0.34, square: 2.1, z: length * 0.07 },
        { y: length, halfWidth: 0, halfDepth: 0 },
    ]);
    return loftGeometry(profile, { radialSegments: 5 });
}
const TROLLINA_MANE = loftProfile([
    { y: 0.105, halfWidth: 0.078, halfDepth: 0.062, square: 2.3, z: -0.038 },
    { y: 0.158, halfWidth: 0.126, halfDepth: 0.094, square: 2.4, z: -0.033 },
    { y: 0.205, halfWidth: 0.142, halfDepth: 0.105, square: 2.4, z: -0.030 },
    { y: 0.252, halfWidth: 0.142, halfDepth: 0.108, square: 2.4, z: -0.024 },
    { y: 0.300, halfWidth: 0.120, halfDepth: 0.100, square: 2.3, z: -0.014 },
    { y: 0.338, halfWidth: 0.082, halfDepth: 0.078, square: 2.2, z: -0.004 },
    { y: 0.366, halfWidth: 0.036, halfDepth: 0.036, square: 2.2, z: 0.002 },
    { y: 0.378, halfWidth: 0, halfDepth: 0 },
]);
const TROLLINA_FRINGE = loftProfile([
    { y: 0.252, halfWidth: 0.086, halfDepth: 0.052, square: 2.4, z: 0.052 },
    { y: 0.290, halfWidth: 0.104, halfDepth: 0.064, square: 2.4, z: 0.046 },
    { y: 0.330, halfWidth: 0.096, halfDepth: 0.060, square: 2.3, z: 0.032 },
    { y: 0.360, halfWidth: 0.052, halfDepth: 0.040, square: 2.2, z: 0.012 },
    { y: 0.375, halfWidth: 0, halfDepth: 0 },
]);
function trollinaHair() {
    const parts = [
        loftGeometry(TROLLINA_MANE, { radialSegments: 16 }),
        loftGeometry(TROLLINA_FRINGE, { radialSegments: 12 }),
    ];
    let seed = 0x7d0011a;
    const random = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const up = new THREE.Vector3(0, 1, 0);
    const centre = new THREE.Vector3(0, 0.255, -0.020);
    const radius = 0.105;
    for (let i = 0; i < 36; i += 1) {
        const around = ((i + 0.5) / 36 + 0.09 * (random() - 0.5)) * Math.PI * 2;
        const climb = -0.12 + 1.12 * random() ** 0.6;
        const lift = Math.sin(climb * Math.PI * 0.5);
        const out = Math.cos(climb * Math.PI * 0.5);
        const direction = new THREE.Vector3(Math.sin(around) * out, lift, Math.cos(around) * out - 0.18).normalize();
        const length = 0.13 + 0.18 * random();
        const spike = hairSpike(length, 0.013 + 0.010 * random());
        spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
        spike.translate(centre.x + direction.x * radius * 0.78, centre.y + direction.y * radius * 0.78, centre.z + direction.z * radius * 0.78);
        parts.push(spike);
    }
    for (let i = 0; i < 12; i += 1) {
        const around = Math.PI + (((i + 0.5) / 12) - 0.5) * 2.4 + 0.12 * (random() - 0.5);
        const climb = 0.18 + 0.5 * random();
        const lift = Math.sin(climb * Math.PI * 0.5);
        const out = Math.cos(climb * Math.PI * 0.5);
        const direction = new THREE.Vector3(Math.sin(around) * out, lift, Math.cos(around) * out - 0.30).normalize();
        const spike = hairSpike(0.12 + 0.14 * random(), 0.013 + 0.009 * random());
        spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
        spike.translate(centre.x + direction.x * radius * 0.78, centre.y + direction.y * radius * 0.78, centre.z + direction.z * radius * 0.78);
        parts.push(spike);
    }
    const nape = new THREE.Vector3(0, 0.205, -0.045);
    for (let i = 0; i < 8; i += 1) {
        const around = Math.PI + (((i + 0.5) / 8) - 0.5) * 2.6 + 0.15 * (random() - 0.5);
        const droop = -(0.18 + 0.5 * random());
        const direction = new THREE.Vector3(Math.sin(around) * 0.85, droop, Math.cos(around) * 0.85 - 0.30).normalize();
        const strand = hairSpike(0.20 + 0.10 * random(), 0.016 + 0.008 * random());
        strand.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
        strand.translate(nape.x + direction.x * 0.070, nape.y + direction.y * 0.070, nape.z + direction.z * 0.070);
        parts.push(strand);
    }
    return mergeGeometries(parts);
}
function trollinaFaceParts() {
    const ball = (halfWidth) => loftProfile([
        { y: -halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
        { y: -halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
        { y: -halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
        { y: halfWidth * 0.28, halfWidth: halfWidth * 0.96, halfDepth: halfWidth * 0.96, square: 2 },
        { y: halfWidth * 0.78, halfWidth: halfWidth * 0.60, halfDepth: halfWidth * 0.60, square: 2 },
        { y: halfWidth * 1.1, halfWidth: 0, halfDepth: 0 },
    ]);
    const parts = [];
    for (const side of [-1, 1]) {
        const sclera = loftGeometry(ball(0.026), { radialSegments: 12 });
        sclera.scale(1, 1.06, 0.40);
        sclera.translate(side * 0.041, 0.206, 0.089);
        parts.push(sclera);
        const pupil = loftGeometry(ball(0.0115), { radialSegments: 10, shade: 0.05 });
        pupil.scale(1, 1.1, 0.5);
        pupil.translate(side * 0.037, 0.204, 0.0995);
        parts.push(pupil);
        const brow = hairSpike(0.040, 0.0046);
        brow.scale(1, 1, 0.5);
        brow.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(side * 0.90, 0.44, 0).normalize()));
        brow.translate(side * 0.020, 0.2415, 0.0935);
        const colours = brow.getAttribute('color');
        for (let i = 0; i < colours.count; i += 1)
            colours.setXYZ(i, 0.06, 0.06, 0.06);
        parts.push(brow);
    }
    const mouth = loftGeometry(ball(0.019), { radialSegments: 12, shade: 0.1 });
    mouth.scale(1.9, 0.8, 0.5);
    mouth.translate(0, 0.151, 0.093);
    parts.push(mouth);
    return mergeGeometries(parts);
}
const TROLLINA_SKIN = Object.freeze({
    colour: BLOCKOUT_COLOURS.trollinaSkin,
    roughness: 0.74,
    metalness: 0.0,
});
const TROLLINA_GEAR = Object.freeze({
    colour: BLOCKOUT_COLOURS.trollinaGear,
    roughness: 0.68,
    metalness: 0.0,
});
export const TROLLINA_LOOK = Object.freeze({
    id: 'trollina',
    materials: Object.freeze({
        body: Object.freeze({
            colour: BLOCKOUT_COLOURS.trollinaDress,
            roughness: 0.66,
            metalness: 0.0,
            emissive: 0x3a0a26,
            emissiveIntensity: 0.28,
        }),
        limbs: TROLLINA_SKIN,
        accent: Object.freeze({
            colour: BLOCKOUT_COLOURS.trollinaHair,
            roughness: 0.52,
            metalness: 0.0,
            emissive: 0x4a0f30,
            emissiveIntensity: 0.30,
        }),
        head: TROLLINA_SKIN,
        face: Object.freeze({
            colour: BLOCKOUT_COLOURS.trollinaFace,
            roughness: 0.24,
            metalness: 0.06,
        }),
        gear: TROLLINA_GEAR,
    }),
    profiles: Object.freeze({
        torso: DRESS,
        seat: TROLLINA_SEAT,
        thigh: TROLLINA_THIGH,
        shin: TROLLINA_SHIN,
        upperArm: TROLLINA_UPPER_ARM,
        forearm: TROLLINA_FOREARM,
        neck: TROLLINA_NECK,
        head: TROLLINA_HEAD,
        boot: BOOT,
        bootSole: BOOT_SOLE,
        hand: TROLLINA_HAND,
        sleeve: TROLLINA_SLEEVE,
    }),
    shades: Object.freeze({ seat: 1.12, legs: 1.12, collar: 1, sole: 0.74, neck: 1 }),
    parts: Object.freeze({
        hands: 'gear',
        kneePad: 'accent',
        legs: 'gear',
        seat: 'gear',
    }),
    panels: Object.freeze({
        waist: Object.freeze({
            role: 'gear',
            casts: false,
            patches: Object.freeze([Object.freeze({
                    anchor: 'back',
                    u0: 0,
                    u1: Math.PI * 2,
                    from: 0.192,
                    to: 0.230,
                    uSegments: 22,
                    vSegments: 1,
                    lift: 0.006,
                    sink: -0.006,
                })]),
        }),
        kneePad: Object.freeze({
            role: 'accent',
            casts: false,
            patches: Object.freeze([Object.freeze({
                    anchor: 'front',
                    u0: -0.78,
                    u1: 0.78,
                    from: -0.086,
                    to: -0.010,
                    uSegments: 6,
                    vSegments: 3,
                    lift: 0.015,
                    taper: 0.26,
                })]),
        }),
        head: Object.freeze([]),
    }),
    build: Object.freeze({ hand: Object.freeze([trollinaThumb]) }),
    extras: Object.freeze([
        Object.freeze({
            name: 'rider-hair',
            joint: 'neck',
            role: 'accent',
            casts: true,
            build: trollinaHair,
        }),
        Object.freeze({
            name: 'rider-face',
            joint: 'neck',
            role: 'face',
            casts: false,
            build: trollinaFaceParts,
        }),
    ]),
    armCarriage: Object.freeze({ splay: 0.16, rise: 0.12 }),
});
