// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/launchPadField.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LAUNCH_PAD, WHEEL } from '../data/tuning.js';
const OCTAGON_APOTHEM = Math.cos(Math.PI / 8);
const DIAGONAL = Math.SQRT1_2;
export const LAUNCH_PAD_ROLL_RADIUS = WHEEL.tyreDiameter / 2;
export function launchPadSkirtRun() {
    return LAUNCH_PAD.domeFootRadiusMetres * OCTAGON_APOTHEM - LAUNCH_PAD.triggerRadiusMetres;
}
function knotOut(k) {
    return k === 0 ? 0 : k === 3 ? 1 : LAUNCH_PAD.domeKnees[k - 1][0];
}
function knotHeight(k) {
    return k === 0 ? 1 : k === 3 ? 0 : LAUNCH_PAD.domeKnees[k - 1][1];
}
export function launchPadDomeRise(p, top, base) {
    if (!(p < base))
        return 0;
    const height = LAUNCH_PAD.domeHeightMetres;
    if (p <= top)
        return height + LAUNCH_PAD.domeCrownMetres * (1 - p / top);
    const out = (p - top) / (base - top);
    for (let k = 0; k < 3; k += 1) {
        const o0 = knotOut(k), o1 = knotOut(k + 1);
        if (out <= o1) {
            const h0 = knotHeight(k), h1 = knotHeight(k + 1);
            return height * (h0 + ((h1 - h0) * (out - o0)) / (o1 - o0));
        }
    }
    return 0;
}
export function launchPadRideRise(p, top, base, r = LAUNCH_PAD_ROLL_RADIUS) {
    if (!(p < base + r))
        return 0;
    let best = launchPadDomeRise(p, top, base);
    if (!(r > 0))
        return best;
    const height = LAUNCH_PAD.domeHeightMetres;
    for (let piece = 0; piece < 4; piece += 1) {
        let qa, qb, ha, hb;
        if (piece === 0) {
            qa = 0;
            qb = top;
            ha = height + LAUNCH_PAD.domeCrownMetres;
            hb = height;
        }
        else {
            const k = piece - 1;
            qa = top + (base - top) * knotOut(k);
            qb = top + (base - top) * knotOut(k + 1);
            ha = height * knotHeight(k);
            hb = height * knotHeight(k + 1);
        }
        const lo = qa > p - r ? qa : p - r, hi = qb < p + r ? qb : p + r;
        if (lo > hi)
            continue;
        const m = (hb - ha) / (qb - qa);
        let q = p + (r * m) / Math.sqrt(1 + m * m);
        if (q < lo)
            q = lo;
        else if (q > hi)
            q = hi;
        const d = q - p;
        const here = ha + m * (q - qa) + Math.sqrt(Math.max(0, r * r - d * d)) - r;
        if (here > best)
            best = here;
    }
    return best;
}
export function octagonalDistance(localX, localZ) {
    const ax = Math.abs(localX), az = Math.abs(localZ);
    const axis = ax > az ? ax : az;
    const diagonal = (ax + az) * DIAGONAL;
    return axis > diagonal ? axis : diagonal;
}
export class LaunchPadField {
    count;
    ids;
    xs;
    zs;
    triggerSquared;
    footprint;
    footprintSquared;
    drops;
    cosYaw;
    sinYaw;
    tops;
    bases;
    reaches;
    maxHoldSafeMetres;
    holdCount;
    holdXs;
    holdZs;
    holdSquared;
    holdFloors;
    constructor(pads = []) {
        const count = pads.length;
        this.count = count;
        this.xs = new Float64Array(count);
        this.zs = new Float64Array(count);
        this.triggerSquared = new Float64Array(count);
        this.footprint = new Float64Array(count);
        this.footprintSquared = new Float64Array(count);
        this.drops = new Float64Array(count);
        this.cosYaw = new Float64Array(count);
        this.sinYaw = new Float64Array(count);
        this.tops = new Float64Array(count);
        this.bases = new Float64Array(count);
        this.reaches = new Float64Array(count);
        const run = launchPadSkirtRun();
        const ids = [];
        let holdCount = 0, maxHold = 0;
        for (let index = 0; index < count; index += 1) {
            const pad = pads[index];
            const yaw = pad.yaw ?? 0;
            if (!Number.isFinite(pad.x) || !Number.isFinite(pad.z) || !Number.isFinite(yaw)) {
                throw new RangeError(`launch pad ${pad.id} needs a finite position and yaw`);
            }
            if (!(pad.triggerRadius > 0) || !Number.isFinite(pad.triggerRadius)
                || !(pad.footprintRadius > 0) || !Number.isFinite(pad.footprintRadius)) {
                throw new RangeError(`launch pad ${pad.id} needs finite positive radii`);
            }
            if (!(pad.triggerRadius < pad.footprintRadius * OCTAGON_APOTHEM)) {
                throw new RangeError(`launch pad ${pad.id} trigger must lie strictly inside its footprint octagon`);
            }
            if (!Number.isFinite(pad.dropMetres) || pad.dropMetres < 0) {
                throw new RangeError(`launch pad ${pad.id} needs a finite non-negative drop`);
            }
            const hold = pad.holdSafeMetres ?? 0;
            if (!Number.isFinite(hold) || hold < 0) {
                throw new RangeError(`launch pad ${pad.id} needs a finite non-negative safe-point hold`);
            }
            if (hold > 0) {
                if (pad.y === undefined || !Number.isFinite(pad.y)) {
                    throw new RangeError(`launch pad ${pad.id} holds safe points and needs a finite ground height`);
                }
                holdCount += 1;
                if (hold > maxHold)
                    maxHold = hold;
            }
            ids.push(pad.id);
            this.xs[index] = pad.x;
            this.zs[index] = pad.z;
            this.triggerSquared[index] = pad.triggerRadius * pad.triggerRadius;
            this.footprint[index] = pad.footprintRadius;
            this.footprintSquared[index] = pad.footprintRadius * pad.footprintRadius;
            this.drops[index] = pad.dropMetres;
            this.cosYaw[index] = Math.cos(yaw);
            this.sinYaw[index] = Math.sin(yaw);
            this.tops[index] = pad.triggerRadius;
            this.bases[index] = pad.triggerRadius + run;
            this.reaches[index] = (pad.triggerRadius + run + LAUNCH_PAD_ROLL_RADIUS) / OCTAGON_APOTHEM;
        }
        this.ids = Object.freeze(ids);
        this.maxHoldSafeMetres = maxHold;
        this.holdCount = holdCount;
        this.holdXs = new Float64Array(holdCount);
        this.holdZs = new Float64Array(holdCount);
        this.holdSquared = new Float64Array(holdCount);
        this.holdFloors = new Float64Array(holdCount);
        let slot = 0;
        for (let index = 0; index < count; index += 1) {
            const pad = pads[index];
            const hold = pad.holdSafeMetres ?? 0;
            if (!(hold > 0))
                continue;
            this.holdXs[slot] = pad.x;
            this.holdZs[slot] = pad.z;
            this.holdSquared[slot] = hold * hold;
            this.holdFloors[slot] = pad.y - LAUNCH_PAD.holdSafeDropMetres;
            slot += 1;
        }
        Object.freeze(this);
    }
    holdsSafePoint(x, z, groundY) {
        if (this.maxHoldSafeMetres === 0)
            return false;
        for (let index = 0; index < this.holdCount; index += 1) {
            if (!(groundY >= this.holdFloors[index]))
                continue;
            const dx = x - this.holdXs[index];
            const dz = z - this.holdZs[index];
            if (dx * dx + dz * dz <= this.holdSquared[index])
                return true;
        }
        return false;
    }
    at(x, z) {
        for (let index = 0; index < this.count; index += 1) {
            const dx = x - this.xs[index];
            const dz = z - this.zs[index];
            if (dx * dx + dz * dz <= this.triggerSquared[index])
                return index;
        }
        return -1;
    }
    inFootprint(x, z) {
        for (let index = 0; index < this.count; index += 1) {
            const dx = x - this.xs[index];
            if (dx > this.footprint[index] || dx < -this.footprint[index])
                continue;
            const dz = z - this.zs[index];
            if (dx * dx + dz * dz <= this.footprintSquared[index])
                return true;
        }
        return false;
    }
    riseAt(x, z) {
        let rise = 0;
        for (let index = 0; index < this.count; index += 1) {
            const reach = this.reaches[index];
            const dx = x - this.xs[index];
            if (dx > reach || dx < -reach)
                continue;
            const dz = z - this.zs[index];
            if (dz > reach || dz < -reach)
                continue;
            const cos = this.cosYaw[index], sin = this.sinYaw[index];
            const p = octagonalDistance(dx * cos - dz * sin, dx * sin + dz * cos);
            const here = launchPadRideRise(p, this.tops[index], this.bases[index]);
            if (here > rise)
                rise = here;
        }
        return rise;
    }
    dropAt(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.count) {
            throw new RangeError(`launch pad index ${index} is out of range`);
        }
        return this.drops[index];
    }
    idAt(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.count) {
            throw new RangeError(`launch pad index ${index} is out of range`);
        }
        return this.ids[index];
    }
}
export const NO_LAUNCH_PADS = new LaunchPadField();
