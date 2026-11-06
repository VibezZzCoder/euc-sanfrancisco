// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Explicit boundary to SF's ordered classic scripts. The host loads/initializes the city before importing main.
export function getCity() {
  const city = globalThis.window?.NYC;
  if (!city) throw new Error('Initialize the San Francisco city before importing the EUC host');
  return city;
}

export function isTypingInField(event) {
  return !!getCity().isTypingInField(event);
}

export function signalPhase(time, isAvenue) {
  return getCity().signalPhase(time, isAvenue);
}

export function walkSignal(time, isAvenue) {
  return getCity().walkSignal(time, isAvenue);
}

/** Market/Montgomery's authored road arrival, with a real NAVD88 layer reference, never Manhattan's y=0. */
export function getSfSpawn(city = getCity()) {
  const arrival = city.TELEPORT_LOCATIONS?.market;
  if (!arrival || ![arrival.x, arrival.z, arrival.heading].every(Number.isFinite)) {
    throw new Error('San Francisco Market Street spawn is unavailable');
  }
  const y = Number.isFinite(arrival.y) ? arrival.y : city.Terrain?.loaded
    ? city.Terrain.groundAt(arrival.x, arrival.z) : NaN;
  if (!Number.isFinite(y)) throw new Error('Load SF terrain before constructing the rider');
  return { x: arrival.x, y, z: arrival.z, heading: arrival.heading, referenceY: y };
}
