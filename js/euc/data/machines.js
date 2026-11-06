// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/data/machines.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { WHEEL } from './tuning.js';
export const MACHINES = Object.freeze([
    Object.freeze({
        id: 'standard',
        name: 'Standard wheel',
        blurb: 'The fictional suspension EUC the game has always shipped. '
            + 'Grey shell, blue accents, one honest headlight.',
    }),
    Object.freeze({
        id: 'trollina',
        name: "Trollina's wheel",
        blurb: 'The standard suspension EUC in Trollina pink. Same machine, '
            + 'louder joke.',
    }),
    Object.freeze({
        id: 'red-rider',
        name: "Red Rider's wheel",
        blurb: 'Red bodywork over black, a saddle, and his name on the side. '
            + 'Built by hand, and it shows.',
    }),
    Object.freeze({
        id: 'adonisb2',
        name: "Adonisb2's wheel",
        blurb: 'Blocky black off-road bodywork on a knobby tyre, a saddle, '
            + 'two cream lamps, and a green plate that glares back.',
    }),
    Object.freeze({
        id: 'maribel',
        name: "Maribel's wheel",
        blurb: 'Tall black performance bodywork, a purple pad stack over a '
            + 'treaded street tyre, and her grinning devil on both flanks.',
    }),
    Object.freeze({
        id: 'wheel-in-motion',
        name: "Wheel in Motion's wheel",
        blurb: 'Tall black performance bodywork under cyan-blue pads and orange '
            + 'power pads, his mark on both flanks. Loud on purpose.',
    }),
    Object.freeze({
        id: 'drunkard',
        name: "The Drunkard's wheel",
        blurb: 'The standard body in dark brown under amber pads, a hop cone on '
            + 'each, cream trim. Beer-themed, and still a wheel.',
    }),
    Object.freeze({
        id: 'flo-with-zo',
        name: "FloWithZo's wheel",
        blurb: 'A graphite performance body between two pale side shells, on pale '
            + 'pedals, with a low orange band and a badge on the nose.',
    }),
    Object.freeze({
        id: 'seal-on-a-wheel',
        name: "Seal on a Wheel's wheel",
        blurb: 'A bright cyan body in stacked slabs with dark windows cut through '
            + 'the flanks, hot pink bars and corner wedges, black pedals.',
    }),
    Object.freeze({
        id: 'wyldist',
        name: "Wyldist's wheel",
        blurb: 'Compact charcoal bodywork with chamfered shoulders, angular red '
            + 'side pads, a dark road tyre and black pedals.',
    }),
    Object.freeze({
        id: 'gnarwheel',
        name: "Gnarwheel's wheel",
        blurb: 'Tall black performance body, cyan seat and pads, circular tyre and lime rim accent.',
    }),
]);
export const MACHINE_IDS = Object.freeze(MACHINES.map((machine) => machine.id));
export const DEFAULT_MACHINE = 'standard';
export const MACHINE_CONTRACT = Object.freeze([
    'tyreDiameter',
    'pedalSpan',
    'pedalHeight',
    'suspensionTravel',
]);
export function machineContract() {
    return Object.freeze({
        tyreDiameter: WHEEL.tyreDiameter,
        pedalSpan: WHEEL.pedalSpan,
        pedalHeight: WHEEL.pedalHeight,
        suspensionTravel: WHEEL.suspensionTravel,
    });
}
export function machineForCharacter(character) {
    if (character === 'trollina')
        return 'trollina';
    if (character === 'red-rider')
        return 'red-rider';
    if (character === 'adonisb2')
        return 'adonisb2';
    if (character === 'maribel-vargas')
        return 'maribel';
    if (character === 'wheel-in-motion')
        return 'wheel-in-motion';
    if (character === 'drunkard')
        return 'drunkard';
    if (character === 'flo-with-zo')
        return 'flo-with-zo';
    if (character === 'seal-on-a-wheel')
        return 'seal-on-a-wheel';
    if (character === 'wyldist')
        return 'wyldist';
    if (character === 'gnarwheel')
        return 'gnarwheel';
    return DEFAULT_MACHINE;
}
export function machineSpec(id) {
    return MACHINES.find((machine) => machine.id === id) ?? MACHINES[0];
}
