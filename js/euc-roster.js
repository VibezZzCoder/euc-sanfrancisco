// NYC Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Identity only: importing this module never imports an appearance or constructs a rig.
// Downstream forks: read NOTICE-EUC-THRILLS.md before repurposing participant identities/assets.
import { ALL_CHARACTERS, CHARACTER_IDS, isPlayableCharacter, rideStyleFor } from './euc/data/riders.js';
import { machineForCharacter, machineSpec } from './euc/data/machines.js';

export const RIDERS = Object.freeze(Object.fromEntries(ALL_CHARACTERS.map(character => {
  const machine = machineForCharacter(character.id);
  const wheel = machineSpec(machine);
  return [character.id, Object.freeze({ ...character, machine, wheelName: wheel.name, wheelBlurb: wheel.blurb })];
})));
export const PLAYABLE_RIDERS = CHARACTER_IDS;
export const isPlayableRider = isPlayableCharacter;
export { rideStyleFor };
