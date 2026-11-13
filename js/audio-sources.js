import { getCity, walkSignal } from './city-api.js';

const MOTOR_RANGE = 180;
const SIREN_RANGE = 220;
const PEOPLE_RANGE = 45;
const SIGNAL_RANGE = 35;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const seedAt = (index) => ((Math.imul(index + 1, 2654435761) >>> 0) / 4294967296);

// SF street actors own bodyType; highway actors own kind. Neither owns NYC's engine field.
// These are ambient synthesis classes, not claims about a model's real propulsion (including the robotaxi).
const SF_MOTOR_TYPES = Object.freeze({ taxi: 'sedan', sedan: 'sedan', suv: 'suv', van: 'suv' });
function motorKind(vehicle) {
  if (vehicle.bus === true) return 'bus';
  const kind = vehicle.bodyType ?? vehicle.kind;
  return Object.hasOwn(SF_MOTOR_TYPES, kind) ? SF_MOTOR_TYPES[kind] : null;
}

function roadLoad(speed, acceleration, maxAcceleration) {
  // Constant speed still needs power against rolling resistance and air drag.
  return unit(finite(acceleration) / (Number.isFinite(maxAcceleration) && maxAcceleration > 0 ? maxAcceleration : 1.6)
    + unit(speed / 2) * (0.12 + 0.28 * unit(speed / 30) ** 2));
}

function writeMotor(item, id, kind, x, y, z, speed, load, heading, police, seed, blocked, gain, range) {
  item.id = id;
  item.kind = kind;
  item.x = x;
  item.y = y;
  item.z = z;
  item.speed = Number.isFinite(speed) ? Math.abs(speed) : 0;
  item.load = unit(load);
  item.heading = finite(heading);
  item.police = police;
  item.seed = finite(seed);
  item.blocked = !!blocked;
  item.gain = unit(gain);
  item.range = Number.isFinite(range) && range > 0 ? range : 160;
}

// Bounded insertion keeps only nearby candidates. Records and the public array are reused across collections.
class NearestSources {
  constructor(limit) {
    this.pool = Array.from({ length: limit }, () => ({}));
    this.items = [];
    this.scores = new Float64Array(limit);
  }

  take(score) {
    let i = this.items.length;
    let item;
    if (i < this.pool.length) item = this.pool[i];
    else {
      if (score >= this.scores[i - 1]) return null;
      item = this.items[--i];
    }
    while (i > 0 && score < this.scores[i - 1]) {
      this.items[i] = this.items[i - 1];
      this.scores[i] = this.scores[i - 1];
      i--;
    }
    this.items[i] = item;
    this.scores[i] = score;
    return item;
  }
}

// Read at audio's control rate (10 Hz), after simulation updates. Snapshots remain valid until the next collect().
// IDs are the simulation objects, independent of pooled record order, so voices survive ranking changes/recycling.
// Street sources only: the player's electric unicycle is heard through js/euc-audio.js (motor, wind, tyre, one-shots),
// which audio-system.js drives every frame.
class CityAudioSources {
  constructor({ trafficSystem, highwayTraffic, streetDetails }) {
    this.traffic = trafficSystem;
    this.cars = trafficSystem?.cars ?? [];
    this.buses = trafficSystem?.buses ?? [];
    this.peds = trafficSystem?.peds ?? [];
    this.highwayCars = highwayTraffic?.cars ?? [];
    this.signalSites = streetDetails?.audioSignals ?? [];
    this.motors = new NearestSources(10);
    this.sirens = new NearestSources(2);
    this.people = new NearestSources(6);
    this.signals = new NearestSources(2);
    this.snapshot = {
      motors: this.motors.items, sirens: this.sirens.items,
      people: this.people.items, signals: this.signals.items, traffic: 0
    };
  }

  distanceSq(x, y, z) {
    const dx = x - this.listener.x;
    const dy = y - this.listener.y;
    const dz = z - this.listener.z;
    return dx * dx + dy * dy + dz * dz;
  }

  motor(id, kind, x, y, z, speed, load, heading, police, seed, blocked, gain = 1, range = 160) {
    const d2 = this.distanceSq(x, y, z);
    if (!Number.isFinite(d2)) return;
    if (police && d2 <= SIREN_RANGE * SIREN_RANGE) {
      const siren = this.sirens.take(d2);
      if (siren) writeMotor(siren, id, 'siren', x, y, z, speed, load, heading, true, seed, blocked, 1, 200);
    }
    if (kind === null || d2 > MOTOR_RANGE * MOTOR_RANGE) return;
    const item = this.motors.take(d2);
    if (!item) return;
    writeMotor(item, id, kind, x, y, z, speed, load, heading, police, seed, blocked, gain, range);
  }

  person(id, x, y, z, speed, grounded, rig) {
    const d2 = this.distanceSq(x, y, z);
    if (!Number.isFinite(d2) || d2 > PEOPLE_RANGE * PEOPLE_RANGE) return;
    const item = this.people.take(d2);
    if (!item) return;
    item.id = id;
    item.x = x;
    item.y = y;
    item.z = z;
    item.speed = Number.isFinite(speed) ? Math.abs(speed) : 0;
    item.grounded = grounded;
    item.seed = finite(rig?.seed, seedAt(id.index ?? 0));
    item.phase = finite(rig?.phase);
    item.conversation = id.conversation || null;
    item.bumped = finite(id.bumped); // Accepted native impacts only, not proximity/dodging.
    item.reactionEpoch = finite(id.reactionEpoch); // A recycled walker starts a new observation baseline.
    // Logical ground remains authoritative even if presentation/culling did not solve this rig's feet.
    const left = rig?.feet?.[0], right = rig?.feet?.[1];
    const currentFoot = (foot) => Number.isFinite(foot?.px) && Number.isFinite(foot?.py) && Number.isFinite(foot?.pz)
      && Math.hypot(foot.px - x, foot.pz - z) < 1.5
      && Math.abs(foot.py - y) < 1;
    const leftValid = currentFoot(left), rightValid = currentFoot(right);
    item.leftX = leftValid ? left.px : x; item.leftY = leftValid ? left.py : y; item.leftZ = leftValid ? left.pz : z;
    item.rightX = rightValid ? right.px : x; item.rightY = rightValid ? right.py : y; item.rightZ = rightValid ? right.pz : z;
  }

  streetVehicles(vehicles, elapsed, seedOffset) {
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v.edge || v.disabled) continue;
      const kind = motorKind(v);
      const y = v.y + 0.7; // SF logical road pose includes hill, tunnel and bridge elevation.
      const d2 = this.distanceSq(v.x, y, v.z);
      const range = v.isNYPD ? SIREN_RANGE : MOTOR_RANGE;
      if (!Number.isFinite(d2) || d2 > range * range) continue;
      if (d2 <= MOTOR_RANGE * MOTOR_RANGE) {
        this.snapshot.traffic += (1 - d2 / (MOTOR_RANGE * MOTOR_RANGE)) * (0.2 + 0.8 * unit(v.speed / 12));
      }
      const green = !v.edge.to.signal || getCity().signalGroupPhase(
        finite(elapsed) + finite(v.edge.to.signalOffset), v.edge.axisIndex, v.edge.to.groupCount) === 'green';
      const blocked = v.wait > 2 && v.speed < 0.5 && v.gap < 8 && v.leaderSpeed < 0.5 && green && !v.conn && !v.yielding;
      this.motor(v, kind, v.x, y, v.z,
        v.speed, roadLoad(v.speed, v.acc, v.driver?.a), finite(v.yaw) + finite(v.yawOffset), !!v.isNYPD, seedAt(seedOffset + i), blocked);
    }
  }

  collect(listenerPosition, elapsed) {
    this.listener = listenerPosition;
    this.motors.items.length = this.sirens.items.length = this.people.items.length = this.signals.items.length = 0;
    this.snapshot.traffic = 0;

    this.streetVehicles(this.cars, elapsed, 100);
    this.streetVehicles(this.buses, elapsed, 1000);
    for (let i = 0; i < this.highwayCars.length; i++) {
      const car = this.highwayCars[i];
      // Negative NAVD88 Y is not a hidden/underwater test. Obstruction handles genuine tunnels.
      // SF computes finite logical poses at construction and every update, independently of render admission.
      // It has no placed flag. The distance check below rejects a genuinely unlocated/invalid record.
      if (car.placed === false || car.audioHidden === true) continue;
      const d2 = this.distanceSq(car.x, car.y + 0.7, car.z);
      if (!Number.isFinite(d2) || d2 > MOTOR_RANGE * MOTOR_RANGE) continue;
      this.snapshot.traffic += (1 - d2 / (MOTOR_RANGE * MOTOR_RANGE)) * (0.2 + 0.8 * unit(car.v / 12));
      this.motor(car, motorKind(car), car.x, car.y + 0.7, car.z,
        car.v, roadLoad(car.v, car.acc, 1.6), car.yaw, false, seedAt(2000 + i), car.v < 0.5);
    }
    this.snapshot.traffic = unit(this.snapshot.traffic / 16);

    for (let i = 0; i < this.peds.length; i++) {
      const ped = this.peds[i];
      if (!ped.placed) continue;
      if ((ped.x - this.listener.x) ** 2 + (ped.z - this.listener.z) ** 2 > PEOPLE_RANGE * PEOPLE_RANGE) continue;
      const city = getCity();
      const t = (ped.x - ped.ax) * ped.ux + (ped.z - ped.az) * ped.uz;
      const logicalY = this.traffic.pedestrianGroundY?.(ped, ped.x, ped.z) ?? ped.dynamicBody?.minY;
      const y = Number.isFinite(logicalY) ? logicalY
        : city.Terrain.groundAt(ped.x, ped.z) + (ped.node && t > 2 && t < ped.len - 2 ? 0 : city.CURB_H);
      this.person(ped, ped.x, y, ped.z, ped.v, true, ped.rig);
    }
    for (let i = 0; i < this.signalSites.length; i++) {
      const site = this.signalSites[i];
      const d2 = this.distanceSq(site.x, site.y, site.z);
      if (!Number.isFinite(d2) || d2 > SIGNAL_RANGE * SIGNAL_RANGE) continue;
      const item = this.signals.take(d2);
      if (!item) continue;
      item.id = site;
      item.x = site.x;
      item.y = site.y;
      item.z = site.z;
      item.walk = walkSignal(finite(elapsed) + finite(site.signalOffset), site.isAvenue);
      item.seed = seedAt(10000 + i);
    }
    return this.snapshot;
  }
}

export { CityAudioSources };
