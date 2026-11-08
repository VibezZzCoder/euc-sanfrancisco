// SF pursuit geometry queries. These do not own or modify city actors or rider physics.
// The flight controller supplies explicit elevations: SF has stacked roads and tunnels.

const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/**
 * Adapter for the SF sampler, deliberately independent of rendering and traffic.
 * The returned values are scalars, not aliases of the sampler's mutable scratch data.
 */
export function createSfFlightQueries(sampler) {
  if (!sampler || typeof sampler.sampleGround !== 'function' || typeof sampler.raycast !== 'function'
    || typeof sampler.raycastObstacle !== 'function' || typeof sampler.isVolumeClear !== 'function') {
    throw new TypeError('SF flight requires ground, raycast and volume queries');
  }
  const ground = { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'pavement', offCourse: false };
  const origin = { x: 0, y: 0, z: 0 };
  const direction = { x: 0, y: 0, z: 0 };

  function supportAt(x, z, referenceY) {
    if (![x, z, referenceY].every(Number.isFinite)) return null;
    const result = sampler.sampleGround(x, z, ground, referenceY);
    if (!Number.isFinite(result.height)) return null;
    return { height: result.height, offCourse: !!result.offCourse, water: !!result.water,
      registered: !!result.registered };
  }

  function clearLine(a, b) {
    if (!finitePoint(a) || !finitePoint(b)) return false;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-8) return true;
    origin.x = a.x; origin.y = a.y; origin.z = a.z;
    direction.x = dx / distance; direction.y = dy / distance; direction.z = dz / distance;
    return sampler.raycast(origin, direction, distance) === null;
  }

  /**
   * A bounded, conservative candidate check, not a navigation or collision system.
   * Sample the centre and four corners of the upright footprint along the segment, and sweep its
   * centre and side rays at foot/head height, plus solid-only lateral sweeps, so
   * thin physical walls are not skipped between volume samples. Never infer a
   * floor from the globally highest surface.
   */
  // Per-adapter scratch: clearFlight runs several times per officer frame, so it reuses its query
  // body/ray endpoints instead of allocating ~20 objects per call. Same queries, same order.
  const body = { x: 0, z: 0, headingY: 0, halfWidthMetres: 0, halfLengthMetres: 0, minY: 0, maxY: 0, floorY: 0 };
  const lateral = { x: 0, z: 0 }, from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: 0, z: 0 };
  const NO_OPTIONS = Object.freeze({});
  function clearFlight(a, b, { halfWidth = 0.4, halfLength = 0.4, height = 2.1, step = 0.5 } = NO_OPTIONS) {
    if (!finitePoint(a) || !finitePoint(b) || !Number.isFinite(halfWidth) || !Number.isFinite(halfLength)
      || !Number.isFinite(height) || !Number.isFinite(step)
      || halfWidth <= 0 || halfLength <= 0 || height <= 0 || step <= 0) return false;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const distance = Math.hypot(dx, dy, dz);
    // A malformed or teleported candidate must not turn into an unbounded query.
    if (distance > 10) return false;
    const horizontal = Math.hypot(dx, dz);
    const headingY = horizontal > 1e-8 ? Math.atan2(dx, dz) : 0;
    const sideX = Math.cos(headingY), sideZ = -Math.sin(headingY);
    const forwardX = Math.sin(headingY), forwardZ = Math.cos(headingY);
    body.headingY = headingY; body.halfWidthMetres = halfWidth; body.halfLengthMetres = halfLength;
    const count = Math.max(1, Math.ceil(distance / step));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = a.x + dx * t, z = a.z + dz * t, minY = a.y + dy * t;
      const center = sampler.sampleGround(x, z, ground, minY);
      if (!Number.isFinite(center.height) || (!center.offCourse && center.height > minY + 1e-4)) return false;
      // Predict each corner's reference from the selected centre plane, so steep
      // continuous floors remain selectable without ever querying at infinity.
      const normal = center.normal;
      const nx = normal?.x, ny = normal?.y, nz = normal?.z;
      const gx = Number.isFinite(nx) && Number.isFinite(ny) && ny > 1e-8 ? -nx / ny : 0;
      const gz = Number.isFinite(nz) && Number.isFinite(ny) && ny > 1e-8 ? -nz / ny : 0;
      for (let c = 0; c < 4; c++) {
        const side = c < 2 ? -halfWidth : halfWidth, forward = c & 1 ? halfLength : -halfLength;
        const ox = sideX * side + forwardX * forward, oz = sideZ * side + forwardZ * forward;
        const corner = supportAt(x + ox, z + oz, minY + gx * ox + gz * oz);
        if (!corner || (!corner.offCourse && corner.height > minY + 1e-4)) return false;
      }
      body.x = x; body.z = z; body.minY = minY; body.maxY = minY + height; body.floorY = minY;
      if (!sampler.isVolumeClear(body)) return false;
    }
    if (distance < 1e-8) return true;
    direction.x = dx / distance; direction.y = dy / distance; direction.z = dz / distance;
    lateral.x = sideX; lateral.z = sideZ;
    for (let u = 0; u < 3; u++) {
      origin.x = a.x; origin.y = a.y + (u === 0 ? 0.02 : u === 1 ? height / 2 : height); origin.z = a.z;
      if (sampler.raycastObstacle(origin, direction, distance, halfWidth, lateral) !== null) return false;
    }
    for (let k = 0; k < 6; k++) {
      const side = k < 2 ? -halfWidth : k < 4 ? 0 : halfWidth, up = k & 1 ? height : 0.02;
      from.x = a.x + sideX * side; from.y = a.y + up; from.z = a.z + sideZ * side;
      to.x = b.x + sideX * side; to.y = b.y + up; to.z = b.z + sideZ * side;
      if (!clearLine(from, to)) return false;
    }
    return true;
  }

  return { supportAt, clearLine, clearFlight };
}
