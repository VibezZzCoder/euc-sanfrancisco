// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { tintOver } from './blockoutKit.js';
const SEAL_TRIM_BASE = BLOCKOUT_COLOURS.machineSealTrim;
const SEAL_TRIM_PINK = tintOver(SEAL_TRIM_BASE, BLOCKOUT_COLOURS.machineSealPink);
const SEAL_DECK = tintOver(BLOCKOUT_COLOURS.machineSealCyan, 0x0d5c78);
const SEAL_CAVITY = tintOver(BLOCKOUT_COLOURS.machineSealCyan, 0x101318);
const SEAL_WINDOW = tintOver(BLOCKOUT_COLOURS.machineSealCyan, 0x15181e);
const SEAL_FOOT = [0.74, 0.72, 0.72];
const SEAL_EDGE = [1.18, 1.10, 1.08];
const SEAL_SHELL_RINGS = Object.freeze([
    { y: 0.250, halfWidth: 0.052, halfDepth: 0.126, square: 3.0 },
    { y: 0.296, halfWidth: 0.092, halfDepth: 0.192, square: 3.8 },
    { y: 0.302, halfWidth: 0.095, halfDepth: 0.198, square: 4.0 },
    { y: 0.336, halfWidth: 0.110, halfDepth: 0.226, square: 6.6 },
    { y: 0.396, halfWidth: 0.117, halfDepth: 0.243, square: 7.0 },
    { y: 0.452, halfWidth: 0.118, halfDepth: 0.248, square: 7.0 },
    { y: 0.502, halfWidth: 0.118, halfDepth: 0.246, square: 7.0 },
    { y: 0.508, halfWidth: 0.118, halfDepth: 0.245, square: 7.0 },
    { y: 0.550, halfWidth: 0.115, halfDepth: 0.238, square: 6.8 },
    { y: 0.556, halfWidth: 0.113, halfDepth: 0.234, square: 6.6 },
    { y: 0.568, halfWidth: 0.107, halfDepth: 0.218, square: 6.5 },
    { y: 0.574, halfWidth: 0.106, halfDepth: 0.216, square: 6.45 },
    { y: 0.578, halfWidth: 0.105, halfDepth: 0.212, square: 6.4 },
    { y: 0.592, halfWidth: 0.096, halfDepth: 0.178, square: 4.2 },
    { y: 0.602, halfWidth: 0.082, halfDepth: 0.140, square: 3.8 },
]);
const SEAL_PAD_TOP = 0.062;
const SEAL_PAD_RINGS = Object.freeze([
    { y: -0.100, halfWidth: 0.017, halfDepth: 0.132, square: 3.2 },
    { y: -0.082, halfWidth: 0.026, halfDepth: 0.152, square: 4.2 },
    { y: -0.010, halfWidth: 0.028, halfDepth: 0.160, square: 4.8 },
    { y: 0.042, halfWidth: 0.027, halfDepth: 0.154, square: 4.4 },
    { y: SEAL_PAD_TOP, halfWidth: 0.018, halfDepth: 0.134, square: 3.2 },
]);
const SEAL_BAR = { from: 0.300, to: 0.344 };
const SEAL_BAR_REAR = -1.24;
const SEAL_BAR_NOSE = 1.24;
const SEAL_BAR_GAP = 0.10;
function sealSpan(u0, u1, mirror) {
    return mirror ? { u0: Math.PI - u1, u1: Math.PI - u0 } : { u0, u1 };
}
function sealBar(mirror) {
    const shape = {
        ...SEAL_BAR, lift: 0.018, sink: -0.008, uSegments: 6, vSegments: 3, uByArc: true, tint: SEAL_TRIM_PINK,
    };
    return [
        { ...sealSpan(SEAL_BAR_REAR, -SEAL_BAR_GAP, mirror), ...shape },
        { ...sealSpan(SEAL_BAR_GAP, SEAL_BAR_NOSE, mirror), ...shape },
    ];
}
function sealWedge(centre, mirror) {
    return {
        ...sealSpan(centre - 0.74, centre - 0.32, mirror),
        from: 0.268,
        to: 0.352,
        lift: 0.034,
        sink: -0.010,
        uSegments: 4,
        vSegments: 4,
        uByArc: true,
        taper: 0.45,
        tint: SEAL_TRIM_PINK,
    };
}
export const SEAL_ON_A_WHEEL_MACHINE_LOOK = {
    machine: 'seal-on-a-wheel',
    shell: {
        colour: BLOCKOUT_COLOURS.machineSealCyan,
        roughness: 0.68,
        profile: SEAL_SHELL_RINGS,
    },
    top: {
        kind: 'saddle',
        profile: [
            { y: 0.596, halfWidth: 0.086, halfDepth: 0.144, square: 4.4 },
            { y: 0.610, halfWidth: 0.096, halfDepth: 0.158, square: 5.0 },
            { y: 0.620, halfWidth: 0.074, halfDepth: 0.130, square: 4.2 },
        ],
        tint: SEAL_DECK,
    },
    pads: {
        colour: BLOCKOUT_COLOURS.machineSealPad,
        roughness: 0.62,
        blocks: [SEAL_PAD_RINGS],
        segments: 16,
        paintPad: (geometry) => {
            const position = geometry.getAttribute('position');
            const colour = geometry.getAttribute('color');
            for (let i = 0; i < position.count; i += 1) {
                const y = position.getY(i);
                const lift = y > 0.052 ? 0.84 : y < -0.082 ? 0.66 : 1;
                if (lift === 1)
                    continue;
                colour.setXYZ(i, colour.getX(i) * lift, colour.getY(i) * lift, colour.getZ(i) * lift);
            }
        },
    },
    tyre: {
        roughness: 0.90,
    },
    trim: {
        colour: SEAL_TRIM_BASE,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.58,
        metalness: 0.06,
        patches: [
            ...sealBar(false),
            ...sealBar(true),
            sealWedge(Math.PI / 2, false),
            sealWedge(Math.PI / 2, true),
            sealWedge(-Math.PI / 2, false),
            sealWedge(-Math.PI / 2, true),
            ...[false, true].map((mirror) => ({
                ...sealSpan(-Math.PI / 2 + 0.36, -Math.PI / 2 + 1.10, mirror),
                from: 0.430,
                to: 0.478,
                lift: 0.026,
                sink: -0.010,
                uSegments: 5,
                vSegments: 3,
                uByArc: true,
                taper: 0.35,
                tint: SEAL_TRIM_PINK,
            })),
            ...[false, true].map((mirror) => ({
                ...sealSpan(-Math.PI / 2 + 0.36, -Math.PI / 2 + 1.02, mirror),
                from: 0.562,
                to: 0.594,
                lift: 0.020,
                sink: -0.014,
                uSegments: 4,
                vSegments: 3,
                uByArc: true,
                taper: 0.50,
                tint: SEAL_TRIM_PINK,
            })),
            {
                u0: Math.PI / 2 - 0.36,
                u1: Math.PI / 2 + 0.36,
                from: 0.534,
                to: 0.572,
                lift: 0.014,
                sink: -0.010,
                uSegments: 8,
                vSegments: 3,
                uByArc: true,
                taper: 0.30,
                tint: SEAL_TRIM_PINK,
            },
        ],
    },
    headlight: {
        patches: [{
                u0: Math.PI / 2 - 0.100,
                u1: Math.PI / 2 + 0.100,
                from: 0.482,
                to: 0.510,
                lift: 0.004,
                sink: -0.012,
                uSegments: 6,
                vSegments: 6,
                taper: 0.40,
            }],
        emissive: BLOCKOUT_COLOURS.headlight,
        emissiveIntensity: 1.4,
    },
    taillight: {
        patches: [{
                u0: -Math.PI / 2 - 0.030,
                u1: -Math.PI / 2 + 0.030,
                from: 0.500,
                to: 0.521,
                lift: 0.004,
                sink: -0.012,
                uSegments: 6,
                vSegments: 2,
                taper: 0.45,
            }],
    },
    paintShell: (geometry) => {
        const position = geometry.getAttribute('position');
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < position.count; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            if (y > 0.594) {
                const core = y > 0.612 && Math.abs(x) < 0.040;
                const paint = core ? SEAL_CAVITY : SEAL_DECK;
                colour.setXYZ(i, paint[0], paint[1], paint[2]);
                continue;
            }
            if (z > 0.155 && Math.abs(x) < 0.082 && y > 0.470 && y < 0.535) {
                colour.setXYZ(i, SEAL_CAVITY[0], SEAL_CAVITY[1], SEAL_CAVITY[2]);
                continue;
            }
            if (z < -0.15 && Math.abs(x) < 0.082 && y > 0.400) {
                colour.setXYZ(i, SEAL_CAVITY[0], SEAL_CAVITY[1], SEAL_CAVITY[2]);
                continue;
            }
            if (y < 0.299) {
                colour.setXYZ(i, SEAL_FOOT[0], SEAL_FOOT[1], SEAL_FOOT[2]);
                continue;
            }
            if (y > 0.505 && y < 0.571 && Math.abs(x) > 0.095 && Math.abs(z) < 0.165) {
                colour.setXYZ(i, SEAL_WINDOW[0], SEAL_WINDOW[1], SEAL_WINDOW[2]);
                continue;
            }
            if (y > 0.576) {
                colour.setXYZ(i, SEAL_EDGE[0], SEAL_EDGE[1], SEAL_EDGE[2]);
            }
        }
    },
    paintPedal: (geometry) => {
        const colour = geometry.getAttribute('color');
        for (let i = 0; i < colour.count; i += 1) {
            colour.setXYZ(i, colour.getX(i) * 0.14, colour.getY(i) * 0.145, colour.getZ(i) * 0.15);
        }
    },
};
