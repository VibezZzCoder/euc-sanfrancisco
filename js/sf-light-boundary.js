// MIT © 2026 VibezZzCoder. Owner-selected light edge policy: checked return, through the native manager only.
export function createLightBoundaryReturn(manager, coverage, onReturn = () => {}) {
  const sample = { normal: {} };
  let safe = null, nextCheck = 0, nextAttempt = 0;
  return { update(elapsed) {
    const e = manager.getActiveEntity(), p = e.position, s = manager.eucSampler;
    s.sampleGround(p.x, p.z, sample, p.y);
    const outside = p.x < coverage.minX || p.x > coverage.maxX || p.z < coverage.minZ || p.z > coverage.maxZ;
    // Actual decks remain usable outside the field too. Core water/ordinary crashes keep native recovery.
    if (outside && !sample.registered) {
      if (!safe || elapsed < nextAttempt) return false;
      nextAttempt = elapsed + .5;
      const result = manager.teleportActiveTo(safe.x, safe.z, safe.heading, safe.y, { exact: true, departure: 1.2 });
      if (result.succeeded) { onReturn(result); return true; }
      return false; // Occupied/refused: keep the rider and camera untouched; retry the checked point later.
    }
    if (sample.registered && !sample.water && !sample.offCourse && Math.abs(p.y - sample.height) < 1
      && elapsed >= nextCheck) {
      nextCheck = elapsed + .5;
      const target = manager.findTeleportPosition(p.x, p.z, e.heading, sample.height, { exact: true });
      if (target) safe = { x: target.x, y: target.y, z: target.z, heading: e.heading };
    }
    return false;
  } };
}
