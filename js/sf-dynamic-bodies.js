(function () {
// SF actor -> native EucDynamicWorld boundary. Metres, absolute NAVD88 Y, heading 0 along +Z.
// Load before traffic.js / sf-transit.js. No renderer or player-movement authority here.
const N = window.NYC;

// Grid keys: pack integer cells within ±2^14 injectively into a non-negative Smi (≤2^30-1).
// Other cells retain their text key; the two key types cannot collide, and ±0 remain equivalent.
const BODY_CELL_OFFSET = 2 ** 14, BODY_CELL_SPAN = 2 ** 15;
const bodyCellKey = (x, z) => x > -BODY_CELL_OFFSET && x < BODY_CELL_OFFSET && z > -BODY_CELL_OFFSET && z < BODY_CELL_OFFSET
  ? (x + BODY_CELL_OFFSET) * BODY_CELL_SPAN + (z + BODY_CELL_OFFSET) : `${x},${z}`;

function createSfDynamicBodyIndex(cellSize = 16) {
  const cells = new Map(), spare = [], used = [];
  const seen = new WeakMap();
  let version = 0, query = 0;
  const stats = { bodies: 0, cells: 0, queryCells: 0, candidates: 0 };
  function begin() {
    for (const bucket of used) { bucket.length = 0; spare.push(bucket); }
    used.length = 0;
    cells.clear();
    stats.bodies = 0;
  }
  function add(body) {
    const s = Math.abs(Math.sin(body.headingY)), c = Math.abs(Math.cos(body.headingY));
    const rx = c * body.halfWidthMetres + s * body.halfLengthMetres;
    const rz = s * body.halfWidthMetres + c * body.halfLengthMetres;
    for (let ix = Math.floor((body.x - rx) / cellSize); ix <= Math.floor((body.x + rx) / cellSize); ix++) {
      for (let iz = Math.floor((body.z - rz) / cellSize); iz <= Math.floor((body.z + rz) / cellSize); iz++) {
        const key = bodyCellKey(ix, iz);
        let bucket = cells.get(key);
        if (!bucket) { bucket = spare.pop() || []; cells.set(key, bucket); used.push(bucket); }
        bucket.push(body);
      }
    }
    stats.bodies++;
  }
  function commit() { stats.cells = cells.size; version++; }
  function dynamicBodiesNear(x, z, radius, out) {
    stats.queryCells = stats.candidates = 0;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0) return;
    query++;
    for (let ix = Math.floor((x - radius) / cellSize); ix <= Math.floor((x + radius) / cellSize); ix++) {
      for (let iz = Math.floor((z - radius) / cellSize); iz <= Math.floor((z + radius) / cellSize); iz++) {
        stats.queryCells++;
        const bucket = cells.get(bodyCellKey(ix, iz));
        if (!bucket) continue;
        for (const b of bucket) {
          if (seen.get(b) === query) continue;
          seen.set(b, query);
          stats.candidates++;
          const dx = x - b.x, dz = z - b.z, s = Math.sin(b.headingY), c = Math.cos(b.headingY);
          const ex = Math.max(0, Math.abs(dx * c - dz * s) - b.halfWidthMetres);
          const ez = Math.max(0, Math.abs(dx * s + dz * c) - b.halfLengthMetres);
          if (ex * ex + ez * ez <= radius * radius) out.push(b);
        }
      }
    }
  }
  return { begin, add, commit, dynamicBodiesNear, bodyVersion: () => version, stats };
}

// Compact longitudinal crash slices from the actual high-detail geometry. Triangles crossing a slice contribute
// their full bounds (conservative at slice seams). Include separately drawn wheels from the same BODY/BUS_SPEC.
function sfVehicleShape(geometry, spec = null) {
  const p = geometry.attributes.position;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const lo = Math.min(box.min.z, spec ? spec.zRear : Infinity);
  const hi = Math.max(box.max.z, spec ? spec.zFront : -Infinity);
  const count = Math.max(1, Math.ceil((hi - lo) / 0.5)), step = (hi - lo) / count;
  const slices = Array.from({ length: count }, (_, i) => ({
    z: lo + (i + 0.5) * step, halfLengthMetres: step / 2,
    halfWidthMetres: 0, minY: Infinity, maxY: -Infinity
  }));
  const index = geometry.index, n = index ? index.count : p.count;
  for (let i = 0; i < n; i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    const z0 = Math.min(p.getZ(a), p.getZ(b), p.getZ(c)), z1 = Math.max(p.getZ(a), p.getZ(b), p.getZ(c));
    const w = Math.max(Math.abs(p.getX(a)), Math.abs(p.getX(b)), Math.abs(p.getX(c)));
    const y0 = Math.min(p.getY(a), p.getY(b), p.getY(c)), y1 = Math.max(p.getY(a), p.getY(b), p.getY(c));
    for (let k = Math.max(0, Math.floor((z0 - lo) / step)); k <= Math.min(count - 1, Math.floor((z1 - lo) / step)); k++) {
      const s = slices[k];
      s.halfWidthMetres = Math.max(s.halfWidthMetres, w); s.minY = Math.min(s.minY, y0); s.maxY = Math.max(s.maxY, y1);
    }
  }
  if (spec) {
    for (const s of slices) {
      if (Math.abs(Math.abs(s.z) - spec.wheelZ) <= spec.wheelRadius + s.halfLengthMetres) {
        s.halfWidthMetres = Math.max(s.halfWidthMetres, spec.wheelX + 0.12);
        s.minY = 0; s.maxY = Math.max(s.maxY, spec.wheelRadius * 2);
      }
    }
  }
  return slices.filter(s => s.maxY >= s.minY);
}

// Native crashProfile slices are relative to (body.x, body.minY, body.z), NOT to the mesh's road origin.
// Re-anchor along the mesh's local Y axis so minY is the true posed lower bound while preserving YXZ pitch/roll.
// This also avoids treating a steep bus as an unpitched Manhattan sedan or double-applying its absolute elevation.
function writeSfVehicleBody(body, profile, x, y, z, headingY, pitch, roll, velocityX, velocityZ) {
  const sp = Math.sin(pitch), cp = Math.cos(pitch), sr = Math.sin(roll), cr = Math.cos(roll);
  // These exact products/absolute values are pose-constant, not slice-constant. Keep their original
  // multiplication order; share only within this call (profiles and poses remain independently mutable).
  const cpcr = cp * cr, spcr = sp * cr;
  const acpsr = Math.abs(cp * sr), acpcr = Math.abs(cpcr), asp = Math.abs(sp);
  const acr = Math.abs(cr), asr = Math.abs(sr), aspsr = Math.abs(sp * sr), aspcr = Math.abs(spcr), acp = Math.abs(cp);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < profile.length; i++) {
    const s = profile[i];
    const cy = (s.minY + s.maxY) / 2, hy = (s.maxY - s.minY) / 2;
    const ly = cpcr * cy - sp * s.z;
    const ry = acpsr * s.halfWidthMetres + acpcr * hy + asp * s.halfLengthMetres;
    min = Math.min(min, ly - ry); max = Math.max(max, ly + ry);
  }
  // SF grades stay upright. The near-vertical fallback uses already-posed slices, below.
  const upright = acpcr > 0.01;
  const anchor = upright ? min / cpcr : 0;
  const ox = -sr * anchor, oz = spcr * anchor;
  const sin = Math.sin(headingY), cos = Math.cos(headingY);
  body.x = x + cos * ox + sin * oz; body.z = z - sin * ox + cos * oz;
  body.headingY = headingY; body.minY = y + min; body.maxY = y + max;
  body.velocityX = velocityX; body.velocityZ = velocityZ; body.kind = 'vehicle';
  body.crashPitch = upright ? pitch : 0; body.crashRoll = upright ? roll : 0;
  const parts = body.crashProfile || (body.crashProfile = []);
  body.halfWidthMetres = body.halfLengthMetres = 0;
  for (let i = 0; i < profile.length; i++) {
    const s = profile[i], cy = (s.minY + s.maxY) / 2, hy = (s.maxY - s.minY) / 2;
    const lx = -sr * cy - ox, lz = spcr * cy + cp * s.z - oz;
    const rx = acr * s.halfWidthMetres + asr * hy;
    const rz = aspsr * s.halfWidthMetres + aspcr * hy + acp * s.halfLengthMetres;
    body.halfWidthMetres = Math.max(body.halfWidthMetres, Math.abs(lx) + rx);
    body.halfLengthMetres = Math.max(body.halfLengthMetres, Math.abs(lz) + rz);
    const part = parts[i] || (parts[i] = {});
    part.z = upright ? s.z : lz;
    part.halfWidthMetres = upright ? s.halfWidthMetres : Math.abs(lx) + rx;
    part.halfLengthMetres = upright ? s.halfLengthMetres : rz;
    if (upright) { part.minY = s.minY - anchor; part.maxY = s.maxY - anchor; }
    else {
      const ly = cpcr * cy - sp * s.z;
      const ry = acpsr * s.halfWidthMetres + acpcr * hy + asp * s.halfLengthMetres;
      part.minY = ly - ry - min; part.maxY = ly + ry - min;
    }
  }
  parts.length = profile.length;
  return body;
}

// Read only. A native entity supplies controller.dynamicWorld.hull; plain host snapshots may supply hull directly.
function readSfPlayerBody(entity, out) {
  out.active = !!entity;
  if (!entity) return out;
  const controller = entity.controller;
  // Native entities interpolate entity.position only for presentation. Traffic reads the committed simulation pose.
  const nativePose = controller && Number.isFinite(controller.x) && Number.isFinite(controller.y) && Number.isFinite(controller.z);
  const pos = nativePose ? controller : entity.position || entity;
  const hull = entity.hull || controller?.dynamicWorld?.hull;
  const heading = nativePose ? controller.headingY : entity.headingY ?? entity.heading ?? 0;
  const speed = (nativePose ? controller.speed : entity.speed) || 0;
  out.x = pos.x; out.z = pos.z; out.y = pos.y;
  out.headingY = heading;
  out.halfW = hull?.halfWidthMetres ?? 0.35; out.halfL = hull?.halfLengthMetres ?? 0.5;
  out.minY = entity.minY ?? pos.y; out.maxY = entity.maxY ?? pos.y + (hull?.heightMetres ?? 1.9);
  const motionHeading = nativePose ? heading + (controller.wobbleYaw || 0) + (controller.styleYaw || 0) : heading;
  out.vx = entity.velocityX ?? (nativePose && controller.airborne ? controller.airDirX : Math.sin(motionHeading)) * speed + (entity.vx || 0);
  out.vz = entity.velocityZ ?? (nativePose && controller.airborne ? controller.airDirZ : Math.cos(motionHeading)) * speed + (entity.vz || 0);
  return out;
}

// NYC traffic.js @ 9c4cfc9 / runtime cf56976: bounded shove, pause and track return.
// SF admits these only after a native contact, not from NYC's flat-world 0.9 m proximity trigger.
function resetSfPedestrianReaction(p) {
  p.bumpOX = p.bumpOZ = p.bumpVX = p.bumpVZ = p.bumpCooldown = 0;
  p.dodge = 0;
  p.bumped = 0;
  p.reactionEpoch = (p.reactionEpoch || 0) + 1;
}
function reactSfPedestrian(speed, nx, nz) {
  const p = this.source;
  if (!p?.placed || p.bumpCooldown > 0 || ![speed, nx, nz].every(Number.isFinite) || speed <= 1.5) return false;
  const length = Math.hypot(nx, nz);
  if (length < 1e-9) return false;
  p.interruptConversation?.(p);
  const push = Math.min(4.5, 1.2 + speed * 0.6);
  p.bumpVX = nx / length * push; p.bumpVZ = nz / length * push;
  p.v = 0;
  p.pause = Math.max(p.pause, 2.2);
  p.bumpCooldown = 3;
  p.bumped = (p.bumped || 0) + 1;
  return true;
}

// NYC's 3 m anticipation / 0.6 m lateral step, adapted to SF's own floor and clear corridor.
// Awareness may stop or sidestep; only publishContacts may increment bumped / start an impact shove.
function dodgeSfPedestrian(p, dt, player, ground, clear) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  let target = 0;
  if (player.active) {
    const dx = p.x - player.x, dz = p.z - player.z, d2 = dx * dx + dz * dz;
    if (d2 < 16 && Number.isFinite(player.minY)
      && Math.abs(ground(p, player.x, player.z) - player.minY) < 0.6
      && clear(p.x, p.z, player.x, player.z)) {
      const px = -p.uz, pz = p.ux, speed = Math.hypot(player.vx, player.vz);
      if (speed > 2) {
        const fx = player.vx / speed, fz = player.vz / speed;
        const ahead = dx * fx + dz * fz, side = dx * fz - dz * fx;
        if (ahead > -0.3 && ahead < 3 && Math.abs(side) < 1.3) {
          const away = (px * fz - pz * fx) * (side >= 0 ? 1 : -1);
          if (Math.abs(away) > 0.3) target = away > 0 ? 0.6 : -0.6;
        }
      }
      if (target === 0) {
        const toward = -(dx * p.ux + dz * p.uz) * p.dir;
        const lateral = -(dx * px + dz * pz);
        if (toward > 0 && toward < 1.8 && Math.abs(lateral) < 0.9) target = lateral >= 0 ? -0.6 : 0.6;
      }
      if (d2 < 0.81) { p.v = 0; p.pause = Math.max(p.pause, 0.6); }
    }
  }
  if (target !== 0) p.interruptConversation?.(p);
  if (target === 0 && !p.dodge) return;
  const next = (p.dodge || 0) + Math.max(-1.4 * dt, Math.min(1.4 * dt, target - (p.dodge || 0)));
  const x = -p.uz * next, z = p.ux * next;
  if (!sfPedestrianOffsetClear(p, x, z, ground, clear)) { p.dodge = 0; return; }
  p.dodge = next; p.x += x; p.z += z;
}

function sfPedestrianOffsetClear(p, x, z, ground, clear) {
  if (![x, z].every(Number.isFinite) || !clear(p.x, p.z, p.x + x, p.z + z)) return false;
  const distance = Math.hypot(x, z), steps = Math.max(1, Math.ceil(distance / 0.2));
  let last = ground(p, p.x, p.z);
  if (!Number.isFinite(last)) return false;
  for (let i = 1; i <= steps; i++) {
    const y = ground(p, p.x + x * i / steps, p.z + z * i / steps);
    if (!Number.isFinite(y) || Math.abs(y - last) > 0.4 + 2 * distance / steps) return false;
    last = y;
  }
  return true;
}
// Called after walk() restores the original track position. No timers outside the ordinary traffic clock.
function stepSfPedestrianReaction(p, dt, ground, clear) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  p.bumpCooldown = Math.max(0, (p.bumpCooldown || 0) - dt);
  if (!p.bumpOX && !p.bumpOZ && !p.bumpVX && !p.bumpVZ) return;
  const ox = p.bumpOX || 0, oz = p.bumpOZ || 0;
  let x = ox + (p.bumpVX || 0) * dt, z = oz + (p.bumpVZ || 0) * dt;
  const k = Math.exp(-7 * dt);
  p.bumpVX = (p.bumpVX || 0) * k; p.bumpVZ = (p.bumpVZ || 0) * k;
  if (Math.hypot(p.bumpVX, p.bumpVZ) < 0.05) {
    p.bumpVX = p.bumpVZ = 0;
    const off = Math.hypot(x, z), step = 0.5 * dt;
    if (off <= step) x = z = 0;
    else if (p.pause <= 0.6) { x -= x / off * step; z -= z / off * step; }
  }
  const distance = Math.hypot(x, z);
  if (distance > 0.75) { x *= 0.75 / distance; z *= 0.75 / distance; }
  // Keep real grades, but don't shove into furniture or over a terrain/layer discontinuity.
  if (!sfPedestrianOffsetClear(p, x, z, ground, clear)) {
    p.bumpOX = p.bumpOZ = p.bumpVX = p.bumpVZ = 0;
    return;
  }
  p.bumpOX = x; p.bumpOZ = z;
  p.x += x; p.z += z;
}

// NYC traffic.js meet/endConversation, with SF curb-island identity instead of NYC route.block.
// A private random stream avoids consuming the vehicle route/spawn stream when social choices are added.
function createSfPedestrianSocial({ ground, clear, blockAt, random = null }) {
  let seed = 0x5f202611, nextMeeting = 0;
  const rand = random || (() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
  const cells = new Map();
  function interrupt(p, clock) {
    const pair = p.conversation;
    if (!pair) return;
    for (const person of [pair.a, pair.b]) {
      if (person.conversation === pair) person.conversation = null;
      person.socialTime = clock + 30 + rand() * 60;
    }
    pair.remaining = 0;
  }
  function reset(p, clock) {
    interrupt(p, clock);
    p.conversation = null;
    p.socialTime = clock + 5 + rand() * 15;
  }
  function update(peds, dt, clock) {
    if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(clock)) return;
    for (const p of peds) {
      const pair = p.conversation;
      if (!pair || pair.a !== p) continue;
      pair.remaining -= dt;
      if (pair.remaining <= 0 || !pair.a.placed || !pair.b.placed || pair.a.bumpCooldown > 0
        || pair.b.bumpCooldown > 0 || pair.a.dodge || pair.b.dodge) interrupt(p, clock);
    }
    if (clock < nextMeeting) return;
    nextMeeting = clock + 1;
    cells.clear();
    for (const p of peds) {
      if (!p.placed || p.node || p.conversation || clock < p.socialTime || p.t < 6 || p.t > p.len - 6
        || p.pause > 0 || p.bumpCooldown > 0 || p.dodge) continue;
      const block = blockAt(p.x, p.z);
      if (!block || block.rail) continue;
      const ix = Math.floor(p.x / 2), iz = Math.floor(p.z / 2);
      let partner = null;
      for (let dx = -1; dx <= 1 && !partner; dx++) for (let dz = -1; dz <= 1 && !partner; dz++) {
        const peers = cells.get(`${ix + dx}:${iz + dz}`);
        if (!peers) continue;
        for (const q of peers) {
          const distance = Math.hypot(p.x - q.x, p.z - q.z);
          // The host's blockAt/pedGround are read-only spatial queries. Reject
          // ineligible peers before sampling either floor; keep candidate/RNG order.
          if (q.conversation || block !== blockAt(q.x, q.z) || distance < 0.75 || distance > 2) continue;
          const peerFloor = ground(q, q.x, q.z), sharedFloor = ground(p, q.x, q.z);
          if (!Number.isFinite(peerFloor) || !Number.isFinite(sharedFloor) || Math.abs(sharedFloor - peerFloor) > 0.3
            || !sfPedestrianOffsetClear(p, q.x - p.x, q.z - p.z, ground, clear) || rand() > 0.15) continue;
          partner = q; break;
        }
      }
      if (partner) {
        p.conversation = partner.conversation = { a: p, b: partner, remaining: 6 + rand() * 6 };
        p.v = partner.v = 0;
      } else {
        const key = `${ix}:${iz}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(p);
      }
    }
  }
  return { reset, interrupt, update };
}

Object.assign(N, { createSfDynamicBodyIndex, sfVehicleShape, writeSfVehicleBody, readSfPlayerBody,
  resetSfPedestrianReaction, reactSfPedestrian, stepSfPedestrianReaction, dodgeSfPedestrian, createSfPedestrianSocial });
})();
