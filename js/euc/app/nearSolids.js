// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@d37efc0 src/app/nearSolids.ts (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { NEAR_SOLID, TERRAIN, WHEEL } from '../data/tuning.js';
import { createGroundSample } from '../simulation/world.js';
export function faceDirection(index, out) {
    const angle = (2 * Math.PI * index) / NEAR_SOLID.directions;
    out[0] = Math.sin(angle);
    out[1] = Math.cos(angle);
    return out;
}
export function createNearSolids() {
    const entries = NEAR_SOLID.bandHeights.length * NEAR_SOLID.directions;
    return {
        lift: 0,
        along: 0,
        faces: new Float64Array(entries).fill(Number.POSITIVE_INFINITY),
        normals: new Float64Array(2 * entries),
    };
}
export function clearNearSolids(out) {
    out.lift = 0;
    out.along = 0;
    out.faces.fill(Number.POSITIVE_INFINITY);
    out.normals.fill(0);
    return out;
}
const TYRE_RADIUS = WHEEL.tyreDiameter / 2;
const MAX_STEP_UP = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
function checkedVisualTyreRadius(radius) {
    if (!Number.isFinite(radius) || radius < TYRE_RADIUS || radius > TYRE_RADIUS * 2) {
        throw new RangeError('Visual tyre radius must be finite and between one and two native tyre radii');
    }
    return radius <= TYRE_RADIUS + 1e-7 ? TYRE_RADIUS : radius;
}
const scratchSample = createGroundSample();
const rollSample = createGroundSample();
const origin = { x: 0, y: 0, z: 0 };
const direction = { x: 0, y: 0, z: 0 };
const heights = new Float64Array(2 * NEAR_SOLID.liftSamplesPerSide + 1);
const local = [0, 0];
const hitNormal = { x: 0, y: 0, z: 0 };
const hit = { distance: 0, halfExtentX: 0, halfExtentZ: 0, normal: hitNormal };
function heightAt(sampler, x, z, sample, referenceY) {
    return sampler.sampleGround(x, z, sample, referenceY).height;
}
export function tyreStepLift(sampler, x, y, z, forwardX, forwardZ, visualTyreRadius = TYRE_RADIUS) {
    const radius = checkedVisualTyreRadius(visualTyreRadius);
    const perSide = NEAR_SOLID.liftSamplesPerSide;
    const spacing = radius / perSide;
    for (let index = 0; index <= 2 * perSide; index += 1) {
        const s = (index - perSide) * spacing;
        heights[index] = heightAt(sampler, x + forwardX * s, z + forwardZ * s, scratchSample, y);
    }
    let centre = y + TYRE_RADIUS;
    const needed = centre;
    for (let index = 0; index < 2 * perSide; index += 1) {
        const a = heights[index];
        const b = heights[index + 1];
        if (Math.abs(b - a) <= TERRAIN.curbThreshold)
            continue;
        let lowS = (index - perSide) * spacing;
        let highS = lowS + spacing;
        let low = a;
        let high = b;
        if (a > b) {
            [lowS, highS] = [highS, lowS];
            [low, high] = [high, low];
        }
        for (let halving = 0; halving < NEAR_SOLID.edgeBisections; halving += 1) {
            const midS = (lowS + highS) / 2;
            const mid = heightAt(sampler, x + forwardX * midS, z + forwardZ * midS, scratchSample, y);
            if (Math.abs(mid - low) <= Math.abs(high - mid)) {
                lowS = midS;
                low = mid;
            }
            else {
                highS = midS;
                high = mid;
            }
        }
        if (high - low <= TERRAIN.curbThreshold)
            continue;
        const rise = high - y;
        if (rise <= 0 || rise > MAX_STEP_UP + 1e-6)
            continue;
        const s = Math.abs(highS);
        if (s >= radius)
            continue;
        centre = Math.max(centre, high + Math.sqrt(radius * radius - s * s));
    }
    return Math.min(MAX_STEP_UP, Math.max(0, centre - needed));
}
function restingRoll(sampler, pose, forwardX, forwardZ, radius) {
    const settles = (along) => {
        const x = pose.x + forwardX * along;
        const z = pose.z + forwardZ * along;
        return Math.abs(heightAt(sampler, x, z, rollSample, pose.y) - pose.y) <= TERRAIN.curbThreshold
            && tyreStepLift(sampler, x, pose.y, z, forwardX, forwardZ, radius) <= NEAR_SOLID.restLiftMax;
    };
    let best = 0;
    const spacing = radius / NEAR_SOLID.liftSamplesPerSide;
    for (const direction of [-1, 1]) {
        let high = 0;
        for (let step = 1; step <= NEAR_SOLID.liftSamplesPerSide; step += 1) {
            if (settles(direction * step * spacing)) {
                high = step * spacing;
                break;
            }
        }
        if (high === 0)
            continue;
        let low = high - spacing;
        for (let halving = 0; halving < NEAR_SOLID.edgeBisections + 2; halving += 1) {
            const mid = (low + high) / 2;
            if (settles(direction * mid))
                high = mid;
            else
                low = mid;
        }
        if (best === 0 || high < Math.abs(best))
            best = direction * high;
    }
    return best;
}
export function measureNearSolids(sampler, pose, out, visualTyreRadius = TYRE_RADIUS) {
    clearNearSolids(out);
    const radius = checkedVisualTyreRadius(visualTyreRadius);
    if (pose.airHeight > 1e-4 || pose.crashBlend > 0 || pose.ragdollBlend > 0)
        return out;
    const forwardX = Math.sin(pose.headingY);
    const forwardZ = Math.cos(pose.headingY);
    if (Math.abs(pose.groundPitch) < NEAR_SOLID.flatGroundTilt && Math.abs(pose.groundRoll) < NEAR_SOLID.flatGroundTilt) {
        out.lift = tyreStepLift(sampler, pose.x, pose.y, pose.z, forwardX, forwardZ, radius);
        if (out.lift > NEAR_SOLID.restLiftMax && pose.restFactor > 0) {
            const roll = restingRoll(sampler, pose, forwardX, forwardZ, radius);
            if (roll !== 0) {
                out.along = roll * Math.min(1, pose.restFactor / NEAR_SOLID.restGateFull);
                out.lift = tyreStepLift(sampler, pose.x + forwardX * out.along, pose.y, pose.z + forwardZ * out.along, forwardX, forwardZ, radius);
            }
        }
    }
    if (sampler.raycastObstacle === undefined)
        return out;
    const rootX = pose.x + forwardX * out.along;
    const rootZ = pose.z + forwardZ * out.along;
    const bands = NEAR_SOLID.bandHeights;
    const count = NEAR_SOLID.directions;
    const cos = forwardZ;
    const sin = forwardX;
    for (let index = 0; index < count; index += 1) {
        faceDirection(index, local);
        direction.x = local[0] * cos + local[1] * sin;
        direction.y = 0;
        direction.z = -local[0] * sin + local[1] * cos;
        for (let band = 0; band < bands.length; band += 1) {
            origin.x = rootX;
            origin.y = pose.y + out.lift + bands[band];
            origin.z = rootZ;
            const entry = band * count + index;
            const distance = sampler.raycastObstacle(origin, direction, NEAR_SOLID.probeDistance, 0, undefined, hit);
            if (distance === null)
                continue;
            out.faces[entry] = distance;
            const across = Math.hypot(hitNormal.x, hitNormal.z);
            if (across > 0.5) {
                out.normals[2 * entry] = hitNormal.x / across;
                out.normals[2 * entry + 1] = hitNormal.z / across;
            }
            else {
                out.normals[2 * entry] = -direction.x;
                out.normals[2 * entry + 1] = -direction.z;
            }
            hitNormal.x = 0;
            hitNormal.y = 0;
            hitNormal.z = 0;
        }
    }
    return out;
}
