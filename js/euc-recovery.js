// SF slope-aware adaptation of NYC recovery policy — MIT, © 2026 VibezZzCoder.
// Recovery and checked-placement policy. Queries the existing terrain/bodies; never moves the rider.
import { createGroundSample } from './euc/simulation/world.js';
import { EUC_DYNAMIC_HULL } from './euc-dynamic.js';
import { WHEEL, TERRAIN } from './euc/data/tuning.js';

const MARGIN = 0.15;
const DEPARTURE = 1.2;
const SAMPLE_STEP = 0.2;
const DEFAULT_STEP = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;

function gradient(sample) {
  const n = sample.normal;
  return n && [n.x, n.y, n.z].every(Number.isFinite) && n.y > 1e-4
    ? { x: -n.x / n.y, z: -n.z / n.y } : null;
}

function dry(sampler, x, z, sample) {
  return !sample.offCourse && sample.surface !== 'spill' && sample.traction !== 'spill'
    && !sampler.isOffLimits(x, z, sample.height) && !sampler.isWater(x, z, sample.height);
}

function followsProfile(a, b, step) {
  const dx = b.x - a.x, dz = b.z - a.z, rise = b.y - a.y;
  // Either adjacent tangent may explain a crest/grade change. The step budget
  // measures a discontinuity, not the real rise along a continuous steep hill.
  return Math.min(Math.abs(rise - a.gradient.x * dx - a.gradient.z * dz),
    Math.abs(rise - b.gradient.x * dx - b.gradient.z * dz)) <= step + 1e-6;
}

/** One standing pose using local-plane support, dry footprint and full-height static clearance.
 * registeredSurfaceOnly requires matching city-ground/top registration: even a measured solid extent
 * alone does not prove deliberately registered rideable rooftop support.
 * referenceY selects a layer; Infinity selects the highest surface. No search or movement here.
 */
export function findPlacementTarget(sampler, { x, z, headingY = 0, referenceY = Infinity,
  maxStepUp = DEFAULT_STEP, hull = EUC_DYNAMIC_HULL,
  registeredSurfaceOnly = false }, sample = createGroundSample()) {
  if (![x, z, headingY].every(Number.isFinite) || (!Number.isFinite(referenceY) && referenceY !== Infinity)) return null;
  if (!(maxStepUp >= 0) || !Number.isFinite(maxStepUp)) return null;
  const registered = registeredSurfaceOnly ? { normal: {} } : null;
  const matchesRegistration = (px, pz, y) => !registeredSurfaceOnly
    || Math.abs(sample.height - sampler.cityGround(px, pz, registered, y).height) <= 1e-4;
  sampler.sampleGround(x, z, sample, referenceY);
  const floor = sample.height, slope = gradient(sample);
  if (!Number.isFinite(floor) || !slope || !matchesRegistration(x, z, referenceY) || !dry(sampler, x, z, sample)) return null;
  const hw = hull.halfWidthMetres + MARGIN, hl = hull.halfLengthMetres + MARGIN;
  const c = Math.cos(headingY), s = Math.sin(headingY);
  if (![hw, hl, hull.heightMetres].every(v => Number.isFinite(v) && v > 0)) return null;
  const nx = Math.ceil(2 * hw / SAMPLE_STEP), nz = Math.ceil(2 * hl / SAMPLE_STEP);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const u = -hw + 2 * hw * i / nx, v = -hl + 2 * hl * j / nz;
    const px = x + u * c + v * s, pz = z - u * s + v * c;
    const predicted = floor + slope.x * (px - x) + slope.z * (pz - z);
    sampler.sampleGround(px, pz, sample, predicted);
    if (!Number.isFinite(sample.height) || !gradient(sample) || !matchesRegistration(px, pz, predicted)
      || Math.abs(sample.height - predicted) > maxStepUp + 1e-6 || !dry(sampler, px, pz, sample)) return null;
  }
  const body = { x, z, headingY, halfWidthMetres: hw, halfLengthMetres: hl,
    minY: floor + 0.03, maxY: floor + hull.heightMetres, floorY: floor,
    floorPlane: { x, y: floor, z, dx: slope.x, dz: slope.z }, velocityX: 0, velocityZ: 0 };
  return recoveryVolumeClear(sampler, body) ? { x, y: floor, z, headingY } : null;
}

/** Preflight from an already validated standing target, using recovery's 0.2 m sampling / 1.2 m maximum departure.
 * Moving occupancy is speculative at every sample; neither this helper nor canPlace may move the rider.
 */
export function placementDepartureClear(sampler, target, { departure = 0,
  maxStepUp = DEFAULT_STEP, ...support } = {}, canPlace = () => true) {
  if (!Number.isFinite(departure) || departure < 0 || departure > DEPARTURE) return false;
  const steps = Math.ceil(departure / SAMPLE_STEP), h = target.headingY;
  const sample = createGroundSample();
  sampler.sampleGround(target.x, target.z, sample, target.y);
  let previous = { ...target, gradient: gradient(sample) };
  if (!previous.gradient) return false;
  for (let i = 0; i <= steps; i++) {
    const distance = steps ? departure * i / steps : 0;
    const p = i === 0 ? target : findPlacementTarget(sampler, { ...support, maxStepUp,
      x: target.x + Math.sin(h) * distance, z: target.z + Math.cos(h) * distance, headingY: h,
      referenceY: previous.y + (previous.gradient.x * Math.sin(h) + previous.gradient.z * Math.cos(h)) * (steps ? departure / steps : 0) });
    if (!p || !canPlace(p)) return false;
    sampler.sampleGround(p.x, p.z, sample, p.y);
    const current = { ...p, gradient: gradient(sample) };
    if (!current.gradient || !followsProfile(previous, current, maxStepUp)) return false;
    // Solid sweeps catch a thin wall between standing samples; terrain slope is
    // deliberately not a horizontal obstacle ray.
    if (i > 0 && !segmentClear(sampler, previous, current)) return false;
    previous = current;
  }
  return true;
}

function segmentClear(sampler, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length = Math.hypot(dx, dy, dz);
  if (length < 1e-8) return true;
  return sampler.raycastObstacle({ x: a.x, y: a.y + DEFAULT_STEP + 0.03, z: a.z },
    { x: dx, y: dy, z: dz }, length) === null;
}

/** Full standing volume through the sampler's sparse method-based query. */
export function recoveryVolumeClear(sampler, body) {
  return typeof sampler.isVolumeClear === 'function' && sampler.isVolumeClear(body);
}

/** Prefer the fallen body's floor, then recorded safe floors. null means wait and retry, never force a placement. */
export function findRecoveryTarget(sampler, { fallen, safePoints = [], headingY = 0, maxStepUp = DEFAULT_STEP, hull = EUC_DYNAMIC_HULL }, canPlace = () => true) {
  const sample = createGroundSample();
  const ground = (x, z, y) => sampler.sampleGround(x, z, sample, y);
  const isDry = (x, z, y) => !sampler.isOffLimits(x, z, y) && !sampler.isWater(x, z, y)
    && !sample.offCourse && sample.surface !== 'spill' && sample.traction !== 'spill';

  function supported(x, z, y, heading) {
    const g = ground(x, z, y);
    if (!Number.isFinite(g.height) || Math.abs(g.height - y) > maxStepUp + 1e-6 || !gradient(g) || !isDry(x, z, y)) return null;
    return findPlacementTarget(sampler, { x, z, headingY: heading, referenceY: y, maxStepUp, hull }, sample);
  }

  function connected(a, b, heading, dynamic) {
    const length = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(length / SAMPLE_STEP));
    ground(a.x, a.z, a.y);
    let previous = { ...a, gradient: gradient(sample) };
    if (!previous.gradient) return false;
    // Include the origin: a blocked landing must not hop across a wall to a nearby candidate.
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
      const expected = previous.y + previous.gradient.x * (x - previous.x) + previous.gradient.z * (z - previous.z);
      const p = supported(x, z, expected, heading);
      if (!p || (dynamic && !canPlace(p))) return false;
      ground(p.x, p.z, p.y);
      const current = { ...p, gradient: gradient(sample) };
      if (!current.gradient || !followsProfile(previous, current, maxStepUp) || !segmentClear(sampler, previous, current)) return false;
      previous = current;
    }
    return true;
  }

  function tryAround(anchor) {
    for (const radius of [0, 0.75, 1.5]) {
      for (let i = 0; i < (radius ? 8 : 1); i++) {
        const angle = headingY + i * Math.PI / 4;
        const x = anchor.x + Math.sin(angle) * radius, z = anchor.z + Math.cos(angle) * radius;
        for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
          const h = anchor.headingY + turn;
          ground(anchor.x, anchor.z, anchor.y);
          const slope = gradient(sample); if (!slope) continue;
          const p = supported(x, z, anchor.y + slope.x * (x - anchor.x) + slope.z * (z - anchor.z), h);
          if (!p || !canPlace(p) || (radius && !connected(anchor, p, h, false))) continue;
          const end = { x: p.x + Math.sin(h) * DEPARTURE, y: p.y, z: p.z + Math.cos(h) * DEPARTURE };
          if (connected(p, end, h, true)) return p;
        }
      }
    }
    return null;
  }

  if (fallen && [fallen.x, fallen.y, fallen.z].every(Number.isFinite)) {
    ground(fallen.x, fallen.z, fallen.y);
    // No upward snap to a bridge/lid; no recovery mid-fall or from a submerged floor.
    if (sample.height <= fallen.y + 0.03 && fallen.y - sample.height <= 1.1 && isDry(fallen.x, fallen.z, fallen.y)) {
      const found = tryAround({ ...fallen, y: sample.height, headingY });
      if (found) return found;
    }
  }
  for (const point of safePoints) {
    const found = tryAround(point);
    if (found) return found;
  }
  return null;
}
