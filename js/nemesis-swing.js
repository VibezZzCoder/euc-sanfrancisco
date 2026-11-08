// Paddle timing and relative swept contact, adapted from euc-newyork@7cf4ce7
// (© 2026 VibezZzCoder, MIT); PADDLE/CHASE tuning is from EUC Thrills.
import { PADDLE, CHASE } from './euc/data/tuning.js';

export const SWING = Object.freeze({
  windupSeconds: 0.7, activeSeconds: 0.16, recoverSeconds: 0.4, cooldownSeconds: 2.5,
  triggerRange: 7, maxQuarrySpeed: 15, lateral: PADDLE.pivotOffset + PADDLE.reach,
  swoopHeight: 0.1, headDrop: 1.6, leanRoll: 0.35,
  hitRadius: CHASE.riderHitRadius + PADDLE.headRadius, riderHeight: 1.75,
});

const smoothstep = t => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

export function createSwing(tuning = SWING) {
  const t = tuning, span = { windup: t.windupSeconds, active: t.activeSeconds, recover: t.recoverSeconds };
  const state = { phase: 'idle', elapsed: 0, cooldown: 0 };
  const contact = { from: 1, to: 0 };
  const progress = () => span[state.phase] > 0 ? Math.min(1, state.elapsed / span[state.phase]) : 1;
  const rest = PADDLE.startAngle + PADDLE.sweepRadians / 2;
  const start = PADDLE.startAngle, end = PADDLE.startAngle + PADDLE.sweepRadians;
  return {
    state, contact,
    get phase() { return state.phase; },
    get ready() { return state.phase === 'idle' && state.cooldown <= 0; },
    start() { state.phase = 'windup'; state.elapsed = 0; contact.from = 1; contact.to = 0; },
    cancel(cooldown = 1) {
      state.phase = 'idle'; state.elapsed = 0; state.cooldown = cooldown; contact.from = 1; contact.to = 0;
    },
    update(dt) {
      contact.from = 1; contact.to = 0;
      if (!(dt > 0)) return null;
      const until = state.phase === 'windup' ? span.windup - state.elapsed
        : state.phase === 'active' ? -state.elapsed : Infinity;
      if (until <= dt && until + span.active >= 0) {
        contact.from = Math.max(0, until / dt); contact.to = Math.min(1, (until + span.active) / dt);
      }
      state.cooldown = Math.max(0, state.cooldown - dt);
      if (state.phase === 'idle') return null;
      state.elapsed += dt;
      if (state.elapsed < span[state.phase]) return null;
      state.elapsed -= span[state.phase];
      if (state.phase === 'windup') { state.phase = 'active'; return 'strike'; }
      if (state.phase === 'active') { state.phase = 'recover'; return null; }
      state.phase = 'idle'; state.elapsed = 0; state.cooldown = t.cooldownSeconds;
      return 'done';
    },
    get angle() {
      const p = progress();
      switch (state.phase) {
        case 'windup': return rest + (start - rest) * smoothstep(p);
        case 'active': return start + (end - start) * p;
        case 'recover': return end + (rest - end) * smoothstep(p);
        default: return rest;
      }
    },
    get commitment() {
      const p = progress();
      if (state.phase === 'windup') return smoothstep(p);
      if (state.phase === 'active') return 1;
      if (state.phase === 'recover') return 1 - smoothstep(p);
      return 0;
    },
    headTarget(x, y, z, heading, out) {
      const cos = Math.cos(heading), sin = Math.sin(heading), yaw = heading + this.angle;
      out.x = x - cos * PADDLE.pivotOffset + Math.sin(yaw) * PADDLE.reach;
      out.y = y + PADDLE.pivotHeight - t.headDrop * this.commitment;
      out.z = z + sin * PADDLE.pivotOffset + Math.cos(yaw) * PADDLE.reach;
      return out;
    },
  };
}

const FULL_FRAME = Object.freeze({ from: 0, to: 1 });

// Return the closest admitted contact time within the striking interval, or null.
// Exposing the time lets SF test line of sight at the same interpolated 3D poses.
export function sweptContactFraction(ax, ay, az, bx, by, bz, rider, tuning = SWING, previous = rider, interval = FULL_FRAME) {
  let lo = Math.max(0, interval.from), hi = Math.min(1, interval.to);
  if (lo > hi) return null;
  ax -= previous.x; ay -= previous.bottom; az -= previous.z;
  bx -= rider.x; by -= rider.bottom; bz -= rider.z;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const bottom = -PADDLE.headRadius, top = tuning.riderHeight;
  if (Math.abs(dy) < 1e-12) {
    if (ay < bottom || ay > top) return null;
  } else {
    const a = (bottom - ay) / dy, b = (top - ay) / dy;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return null;
  }
  const lengthSq = dx * dx + dz * dz;
  const k = lengthSq > 1e-12 ? Math.max(lo, Math.min(hi, -(ax * dx + az * dz) / lengthSq)) : lo;
  const x = ax + dx * k, z = az + dz * k;
  return x * x + z * z <= tuning.hitRadius * tuning.hitRadius ? k : null;
}

// The whole admitted fraction window {from, to} (height band and hit radius), or null. Lets SF
// try other in-range poses when the closest one is occluded; each sample is re-admitted exactly.
export function sweptContactWindow(ax, ay, az, bx, by, bz, rider, tuning = SWING, previous = rider, interval = FULL_FRAME) {
  let lo = Math.max(0, interval.from), hi = Math.min(1, interval.to);
  if (lo > hi) return null;
  ax -= previous.x; ay -= previous.bottom; az -= previous.z;
  bx -= rider.x; by -= rider.bottom; bz -= rider.z;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const bottom = -PADDLE.headRadius, top = tuning.riderHeight;
  if (Math.abs(dy) < 1e-12) {
    if (ay < bottom || ay > top) return null;
  } else {
    const a = (bottom - ay) / dy, b = (top - ay) / dy;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return null;
  }
  const A = dx * dx + dz * dz, B = 2 * (ax * dx + az * dz), C = ax * ax + az * az - tuning.hitRadius * tuning.hitRadius;
  if (A <= 1e-12) return C <= 0 ? { from: lo, to: hi } : null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const root = Math.sqrt(disc), from = Math.max(lo, (-B - root) / (2 * A)), to = Math.min(hi, (-B + root) / (2 * A));
  return from <= to ? { from, to } : null;
}

// Sweep the drawn face and rider over the same active fraction of the frame.
export function sweptHit(ax, ay, az, bx, by, bz, rider, tuning = SWING, previous = rider, interval = FULL_FRAME) {
  return sweptContactFraction(ax, ay, az, bx, by, bz, rider, tuning, previous, interval) !== null;
}
