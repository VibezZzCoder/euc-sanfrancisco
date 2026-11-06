// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/data/riders.ts (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { DRUNK_STYLE, SOBER_STYLE } from './rideStyles.js';
export const CHARACTERS = Object.freeze([
    Object.freeze({
        id: 'cool-rider',
        name: 'Cool Rider',
        blurb: 'Black moto gear, reflective blue, full-face lid. Rides like he has nothing to prove.',
        swatch: '#2f7fe8',
        crashVoice: 'cool-rider',
    }),
    Object.freeze({
        id: 'trollina',
        name: 'Trollina',
        blurb: 'Wild magenta hair, a skater dress over black tights, knee pads and a grin. '
            + 'Started life as a joke drawing and refused to leave.',
        swatch: '#ff3fb4',
        crashVoice: 'trollina',
    }),
    Object.freeze({
        id: 'red-rider',
        name: 'Red Rider',
        blurb: 'Gloss red lid, dark visor, red over black armour, and a wheel he built to match. '
            + 'A real rider, in the game because he asked.',
        swatch: '#e03a3a',
        crashVoice: 'red-rider',
    }),
    Object.freeze({
        id: 'adonisb2',
        name: 'Adonisb2',
        blurb: 'Black kit under big neon-green guards, a mirrored visor, and a wheel that glares back. '
            + 'A real rider, in the game so he could share it.',
        swatch: '#72ec16',
        crashVoice: 'adonisb2',
    }),
    Object.freeze({
        id: 'maribel-vargas',
        name: 'Maribel Vargas',
        blurb: 'Black race leathers, a mirrored blue visor, aqua one side and pink the other, '
            + 'on a purple wheel. A real racer, in the game because she asked.',
        swatch: '#a95ff0',
        crashVoice: 'maribel',
    }),
    Object.freeze({
        id: 'wheel-in-motion',
        name: 'Wheel in Motion',
        blurb: 'Blue lid with yellow stripes over a dark visor, a blue-and-yellow jersey with his '
            + 'mark on the chest, and white knee armour. A real rider with a channel, in the game by permission.',
        swatch: '#f0c419',
        crashVoice: 'wheel-in-motion',
    }),
    Object.freeze({
        id: 'drunkard',
        name: 'The Drunkard',
        blurb: 'A two-can beer hat, three drinking tubes and a backpack full of the wrong drink. '
            + 'Not a real rider — the joke the comments kept asking for, kept off everybody who is.',
        swatch: '#e8951f',
        crashVoice: 'drunkard',
    }),
    Object.freeze({
        id: 'flo-with-zo',
        name: 'FloWithZo',
        blurb: 'Light silver race suit with a cyan band at the hip, a pewter full-face lid over a dark visor, '
            + 'and big white knee armour. A real racer, in the game by permission.',
        swatch: '#23c9d6',
        crashVoice: 'flo-with-zo',
    }),
    Object.freeze({
        id: 'seal-on-a-wheel',
        name: 'Seal on a Wheel',
        blurb: 'Black kit, a light-grey sweatshirt tied at the waist, a red-white-black full-face lid, a backpack '
            + 'and a cyan wheel trimmed hot pink. A real rider, in by permission.',
        swatch: '#e94689',
        crashVoice: 'seal-on-a-wheel',
    }),
    Object.freeze({
        id: 'wyldist',
        name: 'Wyldist',
        blurb: 'Turquoise Hawaiian shirt open at the chest, a red 50 helmet and black cargos, '
            + 'on a charcoal wheel with red accents. A real rider, in by permission.',
        swatch: '#28aad8',
        crashVoice: 'wyldist',
    }),
    Object.freeze({
        id: 'gnarwheel',
        name: 'Gnarwheel',
        blurb: 'Black hoodie and full-face lid, chin camera and white brush logo, on a cyan-and-black wheel with a lime rim. A real rider, in by permission.',
        swatch: '#121418',
        crashVoice: 'gnarwheel',
    }),
]);
export const ALL_CHARACTERS = CHARACTERS;
export const CHARACTER_IDS = Object.freeze(CHARACTERS.map((character) => character.id));
export const DEFAULT_CHARACTER = 'cool-rider';
export function characterSpec(id) {
    return ALL_CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}
export function isPlayableCharacter(id) {
    return CHARACTER_IDS.includes(id);
}
const RIDE_STYLES = Object.freeze({
    'cool-rider': SOBER_STYLE,
    trollina: SOBER_STYLE,
    'red-rider': SOBER_STYLE,
    adonisb2: SOBER_STYLE,
    'maribel-vargas': SOBER_STYLE,
    'wheel-in-motion': SOBER_STYLE,
    drunkard: DRUNK_STYLE,
    'flo-with-zo': SOBER_STYLE,
    'seal-on-a-wheel': SOBER_STYLE,
    wyldist: SOBER_STYLE,
    gnarwheel: SOBER_STYLE,
});
export function rideStyleFor(character, drunk = DRUNK_STYLE) {
    const style = RIDE_STYLES[character] ?? SOBER_STYLE;
    return style === DRUNK_STYLE ? drunk : style;
}
