// MIT © 2026 VibezZzCoder. A boot-only world/resource choice, independent of effects and resolution.
export function createWorldTierPolicy(phone, params = new URLSearchParams()) {
  const explicit = params.get('tier');
  const name = explicit === 'full' || explicit === 'light' ? explicit
    : phone && params.get('region') !== '1' ? 'light' : 'full';
  return Object.freeze({ name, light: name === 'light',
    regionEnabled: name === 'full' && params.get('region') !== '0' });
}
