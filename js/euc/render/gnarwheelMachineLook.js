// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/gnarwheelMachineLook.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { BLOCKOUT_COLOURS as C } from '../data/tuning.js';
import { tintOver } from './blockoutKit.js';
export const GNARWHEEL_MACHINE_LOOK = Object.freeze({
    machine: 'gnarwheel',
    shell: { colour: C.gnarwheelMachine, roughness: .60, profile: [
            { y: .250, halfWidth: .052, halfDepth: .125, square: 3.0 },
            { y: .330, halfWidth: .096, halfDepth: .185, square: 3.8 },
            { y: .430, halfWidth: .110, halfDepth: .215, square: 4.2 },
            { y: .520, halfWidth: .108, halfDepth: .215, square: 4.4 },
            { y: .565, halfWidth: .098, halfDepth: .195, square: 4.0 },
            { y: .595, halfWidth: .080, halfDepth: .160, square: 3.6 },
        ] },
    top: { kind: 'saddle', tint: tintOver(C.gnarwheelMachine, C.gnarwheelCyan), profile: [
            { y: .578, halfWidth: .066, halfDepth: .142, square: 3.6 },
            { y: .596, halfWidth: .083, halfDepth: .170, square: 4.2 },
            { y: .626, halfWidth: .082, halfDepth: .167, z: -.008, square: 4.4 },
            { y: .650, halfWidth: .066, halfDepth: .146, z: -.014, square: 3.6 },
        ] },
    pads: { colour: C.gnarwheelCyan, roughness: .70, segments: 16, blocks: [[
                { y: -.100, halfWidth: .016, halfDepth: .052, z: -.075, square: 3.0 },
                { y: -.084, halfWidth: .028, halfDepth: .068, z: -.072, square: 3.8 },
                { y: -.045, halfWidth: .028, halfDepth: .080, z: -.064, square: 4.0 },
                { y: .010, halfWidth: .024, halfDepth: .084, z: -.052, square: 3.8 },
                { y: .055, halfWidth: .020, halfDepth: .080, z: -.038, square: 3.4 },
                { y: .085, halfWidth: .010, halfDepth: .066, z: -.024, square: 3.0 },
            ]] },
    trim: { colour: C.gnarwheelMachine, emissive: 0, emissiveIntensity: 0,
        roughness: .62, metalness: .05, patches: [
            ...[0, Math.PI].map(centre => ({ u0: centre - .30, u1: centre + .30,
                from: .510, to: .530, uSegments: 8, vSegments: 3,
                lift: .002, sink: -.006, shade: .78 })),
        ] },
    tyre: { roughness: .92, rimAccent: { colour: C.gnarwheelLime, radius: .198, width: .008 } },
    headlight: { emissive: C.headlight, emissiveIntensity: 1.2, patches: [{
                u0: Math.PI / 2 - .15, u1: Math.PI / 2 + .15, from: .547, to: .567,
                uSegments: 8, vSegments: 3, lift: .003, sink: -.006, taper: .25,
            }] },
    taillight: { patches: [{ u0: -Math.PI / 2 - .12, u1: -Math.PI / 2 + .12,
                from: .557, to: .575, uSegments: 8, vSegments: 3, lift: .003, sink: -.006, taper: .25 }] },
});
