// SF pursuit knowledge: only an admitted sighting may update the remembered rider coordinates.
// This module does not move the officer, query the live rider, or own any city actors.

const valid = p => p && [p.x, p.y, p.z, p.heading].every(Number.isFinite);

export function createSfPursuitMemory() {
  let known = null;
  return {
    /** Explicitly seed an ambush or update from a fresh line-of-sight observation. */
    observe(observation, sees) {
      // Do not inspect observation at all when hidden: callers can pass their live object safely.
      if (!sees || !valid(observation)) return false;
      known = { x: observation.x, y: observation.y, z: observation.z, heading: observation.heading };
      return true;
    },
    clear() { known = null; },
    /** Independent snapshot: presentation/search callers cannot mutate remembered information. */
    lastSeen() { return known ? { ...known } : null; },
    /** Deterministic local search anchors, on the last observed layer, without promising a clear route. */
    searchAnchors(queries, distances = [0, 12, 24]) {
      if (!known || !queries || typeof queries.supportAt !== 'function' || !Array.isArray(distances)) return [];
      const anchors = [];
      const fx = Math.sin(known.heading), fz = Math.cos(known.heading);
      for (const distance of distances) {
        if (!Number.isFinite(distance) || distance < 0 || distance > 50) continue;
        const x = known.x + fx * distance, z = known.z + fz * distance;
        // Walk the reference floor in short increments: a hill can rise far more than 5 m
        // over a block, but an abrupt layer jump must not become an imaginary ramp.
        const steps = Math.max(1, Math.ceil(distance / 3));
        let y = known.y, floor = null, ok = true;
        for (let i = 0; i <= (distance === 0 ? 0 : steps); i++) {
          const d = distance * i / steps;
          floor = queries.supportAt(known.x + fx * d, known.z + fz * d, y);
          if (!floor || floor.offCourse || floor.water || !Number.isFinite(floor.height)
            || Math.abs(floor.height - y) > (i === 0 ? 5 : 2.5)) { ok = false; break; }
          y = floor.height;
        }
        if (ok) anchors.push({ x, y, z });
      }
      return anchors;
    },
  };
}
