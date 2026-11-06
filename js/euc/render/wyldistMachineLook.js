// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/wyldistMachineLook.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
const SHELL_RINGS = [
    { y: 0.250, halfWidth: 0.058, halfDepth: 0.132, square: 3.8 },
    { y: 0.284, halfWidth: 0.086, halfDepth: 0.165, square: 4.6 },
    { y: 0.330, halfWidth: 0.105, halfDepth: 0.192, square: 5.0 },
    { y: 0.392, halfWidth: 0.112, halfDepth: 0.205, square: 5.2 },
    { y: 0.470, halfWidth: 0.112, halfDepth: 0.205, square: 5.2 },
    { y: 0.506, halfWidth: 0.109, halfDepth: 0.197, square: 5.0 },
    { y: 0.530, halfWidth: 0.103, halfDepth: 0.181, square: 4.8 },
    { y: 0.550, halfWidth: 0.093, halfDepth: 0.164, square: 4.6 },
    { y: 0.568, halfWidth: 0.080, halfDepth: 0.145, square: 4.2 },
];
const PAD_RINGS = [
    { y: -0.092, halfWidth: 0.028, halfDepth: 0.040, z: -0.072, square: 3.0 },
    { y: -0.082, halfWidth: 0.024, halfDepth: 0.052, z: -0.071, square: 3.4 },
    { y: -0.045, halfWidth: 0.018, halfDepth: 0.064, z: -0.065, square: 3.6 },
    { y: 0.005, halfWidth: 0.014, halfDepth: 0.072, z: -0.055, square: 3.6 },
    { y: 0.050, halfWidth: 0.011, halfDepth: 0.076, z: -0.042, square: 3.4 },
    { y: 0.080, halfWidth: 0.009, halfDepth: 0.072, z: -0.030, square: 3.0 },
];
const shoulderPanels = [
    [Math.PI / 2 + 0.43, Math.PI / 2 + 0.91],
    [Math.PI / 2 - 0.91, Math.PI / 2 - 0.43],
    [-Math.PI / 2 + 0.43, -Math.PI / 2 + 0.91],
    [-Math.PI / 2 - 0.91, -Math.PI / 2 - 0.43],
].map(([u0, u1]) => ({
    u0: u0, u1: u1, from: 0.533, to: 0.551,
    uSegments: 4, vSegments: 3, uByArc: true,
    lift: 0.003, sink: -0.009, taper: 0.50, shade: 0.74,
}));
export const WYLDIST_MACHINE_LOOK = {
    machine: 'wyldist',
    shell: {
        colour: BLOCKOUT_COLOURS.machineWyldistShell,
        roughness: 0.72,
        profile: SHELL_RINGS,
    },
    top: { kind: 'handle' },
    pads: {
        colour: BLOCKOUT_COLOURS.machineWyldistPad,
        roughness: 0.82,
        blocks: [PAD_RINGS],
        segments: 8,
        paintPad: (geometry) => {
            const position = geometry.getAttribute('position');
            const colour = geometry.getAttribute('color');
            for (let i = 0; i < position.count; i += 1) {
                const y = position.getY(i);
                const shade = y > 0.070 ? 0.78 : y < -0.065 ? 0.64 : 1;
                colour.setXYZ(i, colour.getX(i) * shade, colour.getY(i) * shade, colour.getZ(i) * shade);
            }
        },
    },
    tyre: {
        roughness: 0.90,
        lugs: {
            count: 26,
            rows: [{ at: -0.35, phase: 0 }, { at: 0.35, phase: 0.5 }],
            size: [0.022, 0.004, 0.020],
            shade: 0.74,
        },
    },
    trim: {
        colour: BLOCKOUT_COLOURS.machineWyldistTrim,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.78,
        metalness: 0.06,
        patches: [
            { u0: Math.PI / 2 - 0.105, u1: Math.PI / 2 + 0.105,
                from: 0.280, to: 0.465, uSegments: 4, vSegments: 6,
                lift: 0.004, sink: -0.009, taper: 0.64, shade: 0.56 },
            { u0: -Math.PI / 2 - 0.080, u1: -Math.PI / 2 + 0.080,
                from: 0.280, to: 0.449, uSegments: 4, vSegments: 6,
                lift: 0.004, sink: -0.009, taper: 0.64, shade: 0.50 },
            ...shoulderPanels,
        ],
    },
    headlight: {
        patches: [{
                u0: Math.PI / 2 - 0.140, u1: Math.PI / 2 + 0.140,
                from: 0.486, to: 0.511, lift: 0.004, sink: -0.010,
                uSegments: 6, vSegments: 4, taper: 0.30,
            }],
        emissive: BLOCKOUT_COLOURS.headlight,
        emissiveIntensity: 1.4,
    },
    taillight: {
        patches: [{
                u0: -Math.PI / 2 - 0.039, u1: -Math.PI / 2 + 0.039,
                from: 0.481, to: 0.499, lift: 0.004, sink: -0.010,
                uSegments: 6, vSegments: 3, taper: 0.38,
            }],
    },
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            const rearSpine = z < -0.130 && Math.abs(x) < 0.070 && y > 0.470;
            const frontRecess = z > 0.170 && Math.abs(x) < 0.066 && y > 0.470 && y < 0.529;
            const handle = y > 0.570;
            const shade = rearSpine || frontRecess || handle ? 0.40 : y < 0.310 ? 0.66 : y > 0.528 ? 1.12 : 1;
            colour.setXYZ(i, colour.getX(i) * shade, colour.getY(i) * shade, colour.getZ(i) * shade);
        }
    },
    paintPedal: (geometry) => {
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < colour.count; i += 1) {
            colour.setXYZ(i, colour.getX(i) * 0.18, colour.getY(i) * 0.185, colour.getZ(i) * 0.19);
        }
    },
};
