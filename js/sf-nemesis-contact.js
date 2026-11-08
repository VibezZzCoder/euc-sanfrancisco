// Admits drawn-paddle contacts into the rider controller; never changes actor/rider position.
// The swept face/rider test follows euc-newyork@7cf4ce7/js/nemesis.js (© 2026 VibezZzCoder, MIT).
import { sweptContactFraction, SWING } from './nemesis-swing.js';

const validFace = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const validRider = p => p && [p.x, p.z, p.bottom].every(Number.isFinite);

/**
 * Record one drawn frame at a time. Caller resets at a new swing and on hidden/frozen/placement
 * boundaries. Sight at the computed contact time is an additional SF layer check, not a substitute
 * for the controller's own collision policy.
 */
export function createSfPaddleContact(queries, director) {
  if (!queries || typeof queries.clearLine !== 'function' || !director || typeof director.knockedDown !== 'function') {
    throw new TypeError('SF paddle contact requires line queries and a chase director');
  }
  let previousFace = null, previousRider = null, struck = false, serial;
  function reset() { previousFace = previousRider = null; struck = false; serial = undefined; }
  function clearBetween(face, rider) {
    const y = rider.bottom + Math.max(0.05, Math.min(SWING.riderHeight, face.y - rider.bottom));
    return queries.clearLine(face, { x: rider.x, y, z: rider.z });
  }
  function frame({ face, rider, interval, controller, placementSerial, enabled = true }) {
    if (!validFace(face) || !validRider(rider)) { previousFace = previousRider = null; return false; }
    const moved = previousRider && Math.hypot(rider.x - previousRider.x, rider.bottom - previousRider.bottom,
      rider.z - previousRider.z) > 5;
    if (!enabled || (serial !== undefined && placementSerial !== serial) || moved) previousFace = previousRider = null;
    serial = placementSerial;
    let accepted = false;
    if (enabled && previousFace && previousRider && !struck && interval
      && director.state?.phase === 'chasing' && director.state.recovery <= 0 && !controller?.crashed
      && typeof controller?.hardKnock === 'function') {
      const t = sweptContactFraction(previousFace.x, previousFace.y, previousFace.z, face.x, face.y, face.z,
        rider, SWING, previousRider, interval);
      if (t !== null) {
        const contactFace = { x: previousFace.x + (face.x - previousFace.x) * t,
          y: previousFace.y + (face.y - previousFace.y) * t, z: previousFace.z + (face.z - previousFace.z) * t };
        const contactRider = { x: previousRider.x + (rider.x - previousRider.x) * t,
          bottom: previousRider.bottom + (rider.bottom - previousRider.bottom) * t,
          z: previousRider.z + (rider.z - previousRider.z) * t };
        if (clearBetween(contactFace, contactRider)
          && controller.hardKnock(face.x - previousFace.x, face.z - previousFace.z)) {
          struck = true;
          accepted = director.knockedDown();
        }
      }
    }
    // Never bridge a disabled frame; this also prevents a freeze from creating a long sweep.
    if (enabled) {
      previousFace = { x: face.x, y: face.y, z: face.z };
      previousRider = { x: rider.x, bottom: rider.bottom, z: rider.z };
    }
    return accepted;
  }
  return { frame, reset, get struck() { return struck; } };
}
