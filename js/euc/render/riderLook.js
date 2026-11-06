// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/riderLook.ts (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
export const MOTION_STILL = Object.freeze({
    swayPelvisRoll: 0,
    swayHeadTilt: 0,
    swayArmSplay: 0,
    swayArmSwing: 0,
    staggerArms: 0,
    staggerHips: 0,
    staggerHeadLoll: 0,
    sipNeckPitch: 0,
    overLean: 0,
});
import { preparedRiderLook } from './appearanceRegistry.js';
export function riderLook(id) { return preparedRiderLook(id); }
