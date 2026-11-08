// Checked booking placement policy. The host supplies independently surveyed SF sites and owns
// the modal, presentation and persistence; this module never edits a rider or city actor directly.
const valid = p => p && [p.x, p.y, p.z, p.heading].every(Number.isFinite);

/**
 * Intake/release sites are exact, bounded candidates; never use the manager's 256 m general
 * teleport ring for jail staging. teleportActiveTo rechecks static support, live occupancy and
 * the requested departure before the controller commits the move.
 */
export function createSfBookingPlacement({ manager, booking, chase, intake, release, departure = 1.2 }) {
  if (typeof manager?.teleportActiveTo !== 'function' || typeof booking?.arrive !== 'function'
    || typeof booking?.finish !== 'function' || typeof chase?.release !== 'function'
    || !Array.isArray(intake) || !intake.length || !intake.every(valid)
    || !Array.isArray(release) || !release.length || !release.every(valid)
    || !Number.isFinite(departure) || departure < 0) throw new TypeError('invalid SF booking placement contract');
  // Copy coordinates so later authoring/UI changes cannot redirect an in-progress booking.
  const intakeSites = intake.map(p => ({ ...p })), releaseSites = release.map(p => ({ ...p }));
  function trySites(sites) {
    for (const site of sites) {
      const result = manager.teleportActiveTo(site.x, site.z, site.heading, site.y, { exact: true, departure });
      if (result?.succeeded === true) return result;
    }
    return null;
  }
  return {
    transfer() {
      if (booking.state?.phase !== 'captured' || chase.state?.phase !== 'captured') return null;
      const result = trySites(intakeSites);
      if (!result) return null;
      booking.arrive();
      return result;
    },
    // Both Skip and normal release use this same checked departure. A refused move keeps the
    // chase captured and the booking modal active. Caller saves only the successful outside pose.
    release() {
      if (!booking.active || chase.state?.phase !== 'captured') return null;
      const result = trySites(releaseSites);
      if (!result) return null;
      chase.release();
      booking.finish();
      return result;
    },
  };
}
