// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/data/surfaces.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { deepFreeze } from '../shared/freeze.js';
export const MATERIALS = deepFreeze({
    pavement: {
        id: 'pavement', albedo: 0x797b7e, roughness: 0.95, metalness: 0.0, mottle: 0.075, encroach: 0,
    },
    roughPavement: {
        id: 'roughPavement', albedo: 0x6d6e6c, roughness: 0.98, metalness: 0.0, mottle: 0.12,
        encroach: 0.22,
    },
    brick: {
        id: 'brick', albedo: 0x6f5046, roughness: 0.88, metalness: 0.0, mottle: 0.13, encroach: 0,
        paving: { module: 2.8, contrast: 0.06 },
    },
    grass: {
        id: 'grass', albedo: 0x435f3c, roughness: 1.0, metalness: 0.0, mottle: 0.20, encroach: 1.0,
    },
    gravel: {
        id: 'gravel', albedo: 0x78746e, roughness: 1.0, metalness: 0.0, mottle: 0.19, encroach: 0.65,
    },
    dirt: {
        id: 'dirt', albedo: 0x685a4a, roughness: 0.98, metalness: 0.0, mottle: 0.17, encroach: 0.75,
    },
    wood: {
        id: 'wood', albedo: 0x615343, roughness: 0.72, metalness: 0.0, mottle: 0.11, encroach: 0,
    },
    spill: {
        id: 'spill', albedo: 0x62666c, roughness: 0.62, metalness: 0.0, mottle: 0.14,
        encroach: 0.85,
    },
    concrete: {
        id: 'concrete', albedo: 0x92928d, roughness: 0.92, metalness: 0.0, mottle: 0.04, encroach: 0,
    },
    stone: {
        id: 'stone', albedo: 0x807b74, roughness: 0.9, metalness: 0.0, mottle: 0.06, encroach: 0,
    },
    metal: {
        id: 'metal', albedo: 0x5a5a5e, roughness: 0.45, metalness: 0.65, mottle: 0.0, encroach: 0,
    },
    signalRed: {
        id: 'signalRed', albedo: 0xb03531, roughness: 0.7, metalness: 0.0, mottle: 0.05, encroach: 0,
    },
});
export const SURFACES = deepFreeze({
    pavement: {
        id: 'pavement',
        label: 'pavement',
        rollingResistance: 0.35,
        grip: 1.0,
        roughnessAmplitude: 0.004,
        roughnessWavelength: 3.0,
        particle: 'none',
        tyreAudio: 'tyre-smooth',
        wobbleInjection: 0,
        material: 'pavement',
    },
    roughPavement: {
        id: 'roughPavement',
        label: 'rough pavement',
        rollingResistance: 0.85,
        grip: 0.92,
        roughnessAmplitude: 0.020,
        roughnessWavelength: 2.2,
        particle: 'none',
        tyreAudio: 'tyre-coarse',
        wobbleInjection: 0,
        material: 'roughPavement',
    },
    brick: {
        id: 'brick',
        label: 'brick',
        rollingResistance: 0.55,
        grip: 0.96,
        roughnessAmplitude: 0.012,
        roughnessWavelength: 1.6,
        particle: 'none',
        tyreAudio: 'tyre-brick',
        wobbleInjection: 0,
        material: 'brick',
    },
    grass: {
        id: 'grass',
        label: 'grass',
        rollingResistance: 2.80,
        grip: 0.70,
        roughnessAmplitude: 0.032,
        roughnessWavelength: 2.6,
        particle: 'grassClipping',
        tyreAudio: 'tyre-grass',
        wobbleInjection: 0,
        material: 'grass',
    },
    gravel: {
        id: 'gravel',
        label: 'gravel',
        rollingResistance: 1.90,
        grip: 0.58,
        roughnessAmplitude: 0.040,
        roughnessWavelength: 1.9,
        particle: 'dust',
        tyreAudio: 'tyre-gravel',
        wobbleInjection: 0,
        material: 'gravel',
    },
    dirt: {
        id: 'dirt',
        label: 'dirt',
        rollingResistance: 1.10,
        grip: 0.80,
        roughnessAmplitude: 0.026,
        roughnessWavelength: 3.1,
        particle: 'dust',
        tyreAudio: 'tyre-dirt',
        wobbleInjection: 0,
        material: 'dirt',
    },
    wood: {
        id: 'wood',
        label: 'wood bridge',
        rollingResistance: 0.45,
        grip: 0.86,
        roughnessAmplitude: 0.010,
        roughnessWavelength: 2.4,
        particle: 'splinter',
        tyreAudio: 'tyre-wood',
        wobbleInjection: 0,
        material: 'wood',
    },
    spill: {
        id: 'spill',
        label: 'liquid spill',
        rollingResistance: 1.20,
        grip: 0.35,
        roughnessAmplitude: 0.002,
        roughnessWavelength: 4.0,
        particle: 'splash',
        tyreAudio: 'tyre-spill',
        wobbleInjection: 11,
        material: 'spill',
    },
});
export const SURFACE_IDS = deepFreeze(Object.keys(SURFACES));
export const HAZARD_SURFACE_IDS = deepFreeze(['spill']);
export const TERRAIN_SURFACE_IDS = deepFreeze(SURFACE_IDS.filter((id) => !HAZARD_SURFACE_IDS.includes(id)));
export function surfaceProperties(id) {
    return SURFACES[id] ?? SURFACES.pavement;
}
export function materialAppearance(id) {
    return MATERIALS[id] ?? MATERIALS.pavement;
}
