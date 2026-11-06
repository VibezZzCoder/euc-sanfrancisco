// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/riderOccupancy.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { ragdollInterpolationBlock } from './ragdollInterpolation.js';
import { interpolateRagdollJointPoles, ragdollLegReachMinimum } from './ragdollBoot.js';
const INACTIVE_JOINT_POLES = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const lensRadius = (upper, lower, squaredReach) => Math.sqrt(Math.max(0, upper * lower * (1 - squaredReach / ((upper + lower) * (upper + lower)))));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal = (a, fallback) => dot(a, a) < 1e-8 ? fallback : scale(a, 1 / Math.hypot(...a));
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function euler(x, y, z) {
    const cx = Math.cos(x / 2), cy = Math.cos(y / 2), cz = Math.cos(z / 2);
    const sx = Math.sin(x / 2), sy = Math.sin(y / 2), sz = Math.sin(z / 2);
    return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}
function mul(a, b) {
    return [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
        a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
        a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
const inverse = (q) => [-q[0], -q[1], -q[2], q[3]];
function rotate(q, p) {
    const t = scale(cross([q[0], q[1], q[2]], p), 2);
    return add(p, add(scale(t, q[3]), cross([q[0], q[1], q[2]], t)));
}
function slerp(a, b, t) {
    let cosine = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (cosine < 0) {
        b = [-b[0], -b[1], -b[2], -b[3]];
        cosine = -cosine;
    }
    if (cosine > 1 - Number.EPSILON)
        return a;
    const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    if (sine < 1e-8) {
        const q = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
        const length = Math.hypot(...q);
        return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
    }
    const angle = Math.atan2(sine, cosine), s0 = Math.sin((1 - t) * angle) / sine, s1 = Math.sin(t * angle) / sine;
    return [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1, a[3] * s0 + b[3] * s1];
}
function basisQuaternion(x, y, z) {
    const trace = x[0] + y[1] + z[2];
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        return [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, 0.25 / s];
    }
    if (x[0] > y[1] && x[0] > z[2]) {
        const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
        return [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
    }
    if (y[1] > z[2]) {
        const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
        return [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
    }
    const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
    return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s];
}
const freshBox = () => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
function point(box, p, radius = 0) {
    box.minX = Math.min(box.minX, p[0] - radius);
    box.maxX = Math.max(box.maxX, p[0] + radius);
    box.minY = Math.min(box.minY, p[1] - radius);
    box.maxY = Math.max(box.maxY, p[1] + radius);
    box.minZ = Math.min(box.minZ, p[2] - radius);
    box.maxZ = Math.max(box.maxZ, p[2] + radius);
}
function transformedBox(box, local, origin, q) {
    for (const x of [local.minX, local.maxX])
        for (const y of [local.minY, local.maxY])
            for (const z of [local.minZ, local.maxZ])
                point(box, add(origin, rotate(q, [x, y, z])));
}
function axialCylinder(box, endpoint, direction, carry) {
    const from = add(endpoint, scale(direction, carry.axialFrom)), to = add(endpoint, scale(direction, carry.axialTo));
    const rx = carry.radial * Math.sqrt(Math.max(0, 1 - direction[0] * direction[0]));
    const ry = carry.radial * Math.sqrt(Math.max(0, 1 - direction[1] * direction[1]));
    const rz = carry.radial * Math.sqrt(Math.max(0, 1 - direction[2] * direction[2]));
    box.minX = Math.min(box.minX, from[0] - rx, to[0] - rx);
    box.maxX = Math.max(box.maxX, from[0] + rx, to[0] + rx);
    box.minY = Math.min(box.minY, from[1] - ry, to[1] - ry);
    box.maxY = Math.max(box.maxY, from[1] + ry, to[1] + ry);
    box.minZ = Math.min(box.minZ, from[2] - rz, to[2] - rz);
    box.maxZ = Math.max(box.maxZ, from[2] + rz, to[2] + rz);
}
function chain(box, origin, target, bend, q, root, upper, lower, radius, endpointRadius, carry, envelope = false, lens) {
    const toward = sub(target, origin), reach = Math.hypot(...toward);
    if (envelope) {
        const carryRadius = carry ? Math.hypot(Math.max(Math.abs(carry.axialFrom), Math.abs(carry.axialTo)), carry.radial) : 0;
        const distalRadius = Math.max(endpointRadius, carryRadius);
        if (lens === undefined)
            point(box, add(root, rotate(q, origin)), upper + radius);
        else
            point(box, add(root, rotate(q, add(origin, scale(toward, upper / (upper + lower))))), Math.max(lens, lensRadius(upper, lower, dot(toward, toward))) + radius);
        point(box, add(root, rotate(q, target)), distalRadius);
        if (reach <= Math.abs(upper - lower))
            point(box, add(root, rotate(q, origin)), upper + lower + distalRadius);
        return target;
    }
    let middle, end;
    if (reach < 1e-9) {
        middle = add(origin, [0, -upper, 0]);
        end = add(middle, [0, -lower, 0]);
    }
    else {
        const direction = scale(toward, 1 / reach);
        const along = clamp((upper * upper - lower * lower + reach * reach) / (2 * reach), -upper, upper);
        const perpendicular = normal(sub(bend, scale(direction, dot(bend, direction))), [0, 0, 1]);
        middle = add(origin, add(scale(direction, along), scale(perpendicular, Math.sqrt(Math.max(0, upper * upper - along * along)))));
        end = add(middle, scale(normal(sub(target, middle), [0, -1, 0]), lower));
    }
    point(box, add(root, rotate(q, origin)), radius);
    point(box, add(root, rotate(q, middle)), radius);
    point(box, add(root, rotate(q, end)), endpointRadius);
    if (carry)
        axialCylinder(box, add(root, rotate(q, end)), rotate(q, normal(sub(end, middle), [0, -1, 0])), carry);
    return end;
}
function prism(component, b, pose) {
    const centreX = (b.minX + b.maxX) / 2, centreY = (b.minY + b.maxY) / 2, centreZ = (b.minZ + b.maxZ) / 2;
    const c = Math.cos(pose.headingY), s = Math.sin(pose.headingY);
    return { ...b, component, centreX, centreY, centreZ,
        x: pose.x + centreX * c + centreZ * s, y: pose.y + centreY, z: pose.z - centreX * s + centreZ * c,
        headingY: pose.headingY, halfWidth: (b.maxX - b.minX) / 2, halfHeight: (b.maxY - b.minY) / 2,
        halfLength: (b.maxZ - b.minZ) / 2, baseY: pose.y + b.minY, topY: pose.y + b.maxY };
}
function wheelOccupancy(p, k) {
    const a = k.stance;
    const groundLean = mul(euler(p.groundPitch, 0, p.groundRoll), euler(p.wheelPitch, 0, -p.rollAngle));
    const machineRoll = -(p.wobbleRoll + p.styleRoll) + a.restWheelLean * p.restFactor - p.wheelCrashLean;
    const machine = mul(groundLean, euler(0, p.wobbleYaw + p.styleYaw + p.wheelCrashSpin, machineRoll));
    const machineOrigin = rotate(groundLean, [0, p.wheelCrashPop, 0]);
    const wheel = freshBox();
    transformedBox(wheel, k.wheelTyre, machineOrigin, machine);
    transformedBox(wheel, k.wheelBody, add(machineOrigin, rotate(machine, [0, p.suspensionOffset, 0])), machine);
    return { groundLean, machineRoll, wheel };
}
function buildOccupancy(p, k, envelope) {
    const a = k.stance, rag = clamp01(p.ragdollBlend), rest = clamp01(p.restFactor), crash = clamp01(p.crashBlend);
    const bootRadius = rag > 0 ? Math.hypot(Math.max(Math.abs(k.boot.minX), Math.abs(k.boot.maxX)), Math.max(Math.abs(k.boot.minY), Math.abs(k.boot.maxY)), Math.max(Math.abs(k.boot.minZ), Math.abs(k.boot.maxZ))) : 0;
    const tight = k.tightLimbs === true && rag <= 0;
    const active = (1 - rest) * (1 - crash), reverse = clamp01(p.reverseBlend) * active;
    const sway = clamp(p.styleSway, -1, 1) * active, wobble = clamp01(p.wobbleFight) * active;
    const { groundLean, machineRoll, wheel } = wheelOccupancy(p, k);
    let root = rotate(groundLean, [p.crashLateral, p.suspensionOffset - p.crashDrop, p.crashForward]);
    let rootQ = mul(groundLean, euler(p.crashTumble, 0, p.crashRoll));
    const headingInverse = euler(0, -p.headingY, 0);
    const particle = (index) => rotate(headingInverse, [p.ragdoll[index * 3] - p.x, p.ragdoll[index * 3 + 1] - p.y, p.ragdoll[index * 3 + 2] - p.z]);
    if (rag > 0) {
        if (p.ragdoll.length < 33)
            throw new Error('Active rider occupancy requires eleven world-space ragdoll particles');
        const pelvis = particle(0), up = normal(sub(particle(1), pelvis), rotate(groundLean, [0, 1, 0]));
        const forward = normal(cross(sub(particle(3), particle(4)), up), rotate(groundLean, [0, 0, 1]));
        const lateral = normal(cross(up, forward), rotate(groundLean, [1, 0, 0]));
        const frame = basisQuaternion(lateral, up, forward);
        root = mix(root, sub(pelvis, rotate(frame, [0, k.hipHeight, 0])), rag);
        rootQ = slerp(rootQ, frame, rag);
    }
    const rootInverse = inverse(rootQ);
    const localParticle = (index) => rotate(rootInverse, sub(particle(index), root));
    const human = freshBox(), amount = Math.min(1, Math.abs(p.rollAngle) / a.carveReactionFullRoll);
    const technical = clamp01(Math.abs(p.technicalTurn)) * active;
    const load = clamp(p.riderPitch / a.loadReactionFullPitch, -1, 1), driving = Math.max(0, load), bracing = Math.max(0, -load);
    const tuck = clamp01(p.tuck) * active, attack = clamp01(p.attack) * active, carving = clamp01(p.carveStance) * active;
    const air = clamp01(p.airBlend) * (1 - rest), settled = Math.max(rest, crash);
    const shift = driving * a.accelHipShiftMax - bracing * a.brakeHipShiftMax;
    const pedalQ = euler(0, p.wobbleYaw + p.styleYaw, machineRoll);
    for (const style of [0, 1]) {
        const squat = Math.min(a.squatMax, a.carveSquatMax * amount * (1 - technical)
            + driving * a.accelSquatMax + bracing * a.brakeSquatMax + clamp01(p.crouch) * (1 - rest) * a.crouchHipDrop
            + tuck * a.tuckHipDrop + attack * a.attackHipDrop * (1 - amount)
            + wobble * a.wobbleHipDrop * (1 + style * k.motion.staggerHips) + reverse * a.reverseSquat);
        const torsoPitch = Math.min(a.tuckTorsoPitchMax, p.riderPitch - p.wheelPitch + a.torsoRestPitch
            + tuck * a.tuckTorsoPitch + Math.max(attack * a.attackTorsoPitch, carving * a.carveStanceTorsoPitch)) * (1 - rag);
        const pelvis = [a.restHipShift * rest * (1 - rag),
            lerp(lerp(k.hipHeight - squat, a.restHipHeight, settled), k.hipHeight, rag),
            (shift - attack * a.attackHipShift) * (1 - settled) * (1 - rag)];
        const pelvisQ = euler(torsoPitch, (p.riderTurnTwist * (1 - reverse) + reverse * a.reverseTorsoTwist) * (1 - rag), (-(p.riderRoll - p.rollAngle) * (1 - style * k.motion.overLean)
            - reverse * a.reverseShoulderRoll - sway * style * k.motion.swayPelvisRoll) * (1 - rag));
        const upperQ = mul(rootQ, pelvisQ), upperRoot = add(root, rotate(rootQ, pelvis));
        const expansion = rag * k.headLollExpansion;
        transformedBox(human, { ...k.torso, minX: k.torso.minX - expansion, maxX: k.torso.maxX + expansion,
            minZ: k.torso.minZ - expansion, maxZ: k.torso.maxZ + expansion }, upperRoot, upperQ);
        if (k.head)
            point(human, add(upperRoot, rotate(upperQ, [0, k.head.y, k.head.z])), k.head.radius + expansion);
        for (const side of [-1, 1]) {
            for (const role of (envelope ? ['inside', 'outside', 'neutral'] : ['actual'])) {
                const inside = role === 'inside' || (role === 'actual' && Math.sign(p.rollAngle) === side);
                const outside = role === 'outside' || (role === 'actual' && Math.sign(p.rollAngle) === -side);
                const drop = squat + (inside ? a.carveInsideHipDropMax * amount * (1 - technical) : 0)
                    + (outside ? a.technicalTurnOutsideHipDropMax * amount * technical : 0);
                let hip = [side * a.torsoWidth * 0.26 + a.restHipShift * rest,
                    lerp(k.hipHeight - drop, a.restHipHeight, settled), shift * (1 - settled)];
                hip = [lerp(hip[0], side * a.torsoWidth * 0.26, rag), lerp(hip[1], k.hipHeight, rag), hip[2] * (1 - rag)];
                const pedal = rotate(pedalQ, [side * a.stanceHalfWidth, k.pedalHeight + a.ankleAbovePedal, 0]);
                const settling = Math.max(side > 0 ? rest : 0, crash);
                for (const outboard of (envelope ? [side * a.crashFootOutboard, a.restFootOutboard]
                    : [crash > (side > 0 ? rest : 0) ? side * a.crashFootOutboard : a.restFootOutboard])) {
                    for (const struck of (envelope ? [0, 1] : [Number(Math.sign(p.pedalStrike) === side)])) {
                        const footAdjust = -side * clamp(p.wobbleSway, -1, 1) * clamp01(p.wobbleFootCorrection) * active * a.wobbleFootAdjust;
                        let foot = [lerp(pedal[0], outboard, settling),
                            lerp(pedal[1] + a.pedalStrikeFootLift * struck, a.ankleAbovePedal - p.suspensionOffset, settling),
                            lerp(pedal[2] + footAdjust, -a.restFootBack, settling)];
                        if (rag > 0)
                            foot = mix(foot, localParticle(side > 0 ? 9 : 10), rag);
                        const open = Math.max(inside ? a.carveInsideKneeOpen * amount * (1 - technical) : 0, side < 0 ? a.restPedalKneeOpen * rest : 0);
                        const ragUp = rotate(inverse(mul(inverse(groundLean), rootQ)), [0, 1, 0]);
                        const bend = rag > 0 ? normal(add([0, 0, 0.35], scale(ragUp, rag)), [0, 0, 1]) : normal([side * open, 0, 1], [0, 0, 1]);
                        const end = chain(human, hip, foot, bend, rootQ, root, a.thighLength, a.shinLength, k.legRadius, k.legRadius, undefined, envelope, tight ? 0 : undefined);
                        if (rag <= 0)
                            transformedBox(human, k.boot, add(root, rotate(rootQ, end)), mul(rootQ, pedalQ));
                        else {
                            point(human, add(root, rotate(rootQ, end)), bootRadius);
                            if ((!envelope || ragdollLegReachMinimum(a.thighLength, a.shinLength) + bootRadius > a.thighLength + k.legRadius)
                                && Math.hypot(...sub(foot, hip)) < ragdollLegReachMinimum(a.thighLength, a.shinLength))
                                point(human, add(root, rotate(rootQ, hip)), ragdollLegReachMinimum(a.thighLength, a.shinLength) + bootRadius);
                        }
                        if (!tight && (envelope || p.airHeight > 0 || p.airBlend > 0)) {
                            point(human, add(root, rotate(rootQ, hip)), (a.thighLength + k.legRadius) * (1 - rag));
                            let freed = [pedal[0] + side * a.oneFootOutboard, pedal[1] + a.oneFootRise, pedal[2] - a.oneFootTrail];
                            freed = mix(foot, freed, active * (1 - rag));
                            const freeEnd = chain(human, hip, freed, bend, rootQ, root, a.thighLength, a.shinLength, k.legRadius, k.legRadius, undefined, envelope);
                            if (rag <= 0)
                                transformedBox(human, k.boot, add(root, rotate(rootQ, freeEnd)), mul(rootQ, pedalQ));
                            else {
                                point(human, add(root, rotate(rootQ, freeEnd)), bootRadius);
                                if ((!envelope || ragdollLegReachMinimum(a.thighLength, a.shinLength) + bootRadius > a.thighLength + k.legRadius)
                                    && Math.hypot(...sub(freed, hip)) < ragdollLegReachMinimum(a.thighLength, a.shinLength))
                                    point(human, add(root, rotate(rootQ, hip)), ragdollLegReachMinimum(a.thighLength, a.shinLength) + bootRadius);
                            }
                        }
                    }
                }
                const splay = (driving + bracing) * a.armLoadSplay + amount * (inside ? -a.armCarveInsideTuck : a.armCarveOutsideSplay)
                    + air * a.airArmSplay + wobble * a.wobbleArmSplay * (1 + style * k.motion.staggerArms) + crash * a.crashArmSplay
                    + sway * side * style * k.motion.swayArmSplay + tuck * a.tuckArmSplay + attack * a.attackArmSplay
                    + (inside ? 0 : carving * a.carveStanceOutsideSplay) + reverse * a.reverseArmSplay;
                const forward = bracing * a.armBrakeForward - driving * a.armAccelBack - tuck * a.tuckArmBack - attack * a.attackArmBack
                    + (inside ? -carving * a.carveStanceInsideBack : carving * a.carveStanceOutsideForward) + sway * side * style * k.motion.swayArmSwing;
                const rise = (inside ? 0 : amount * a.armCarveOutsideRise) + air * a.airArmRise
                    + wobble * a.wobbleArmRise * (1 + style * k.motion.staggerArms) - tuck * a.tuckArmDrop - attack * a.attackArmDrop
                    + (inside ? carving * a.carveStanceInsideRise : -carving * a.carveStanceOutsideDrop) + crash * a.crashArmRise;
                const shoulder = [side * a.shoulderHalfWidth, a.torsoLength, 0];
                let armLens;
                if (tight) {
                    const nearest = (first, second) => Math.max(Math.min(first, second), Math.min(0, Math.max(first, second)));
                    const out = a.armSplay + (side < 0 ? a.armAsymmetrySplay : 0) + splay;
                    const drop = rise - (a.upperArmLength + a.forearmLength) * a.armHangFraction;
                    const x = nearest(out + k.carriage.minSplay, out + k.carriage.maxSplay), y = nearest(drop + k.carriage.minRise, drop + k.carriage.maxRise);
                    const z = a.handForward + (side < 0 ? a.armAsymmetryForward : 0) + forward;
                    armLens = lensRadius(a.upperArmLength, a.forearmLength, x * x + y * y + z * z);
                }
                else
                    point(human, add(upperRoot, rotate(upperQ, shoulder)), a.upperArmLength + k.armRadius);
                for (const carriage of [k.carriage.minSplay, k.carriage.maxSplay])
                    for (const carriageRise of [k.carriage.minRise, k.carriage.maxRise]) {
                        let hand = [side * (a.shoulderHalfWidth + a.armSplay + (side < 0 ? a.armAsymmetrySplay : 0) + carriage + splay),
                            a.torsoLength - (a.upperArmLength + a.forearmLength) * a.armHangFraction + carriageRise + rise,
                            a.handForward + (side < 0 ? a.armAsymmetryForward : 0) + forward];
                        if (rag > 0)
                            hand = mix(hand, rotate(inverse(pelvisQ), sub(localParticle(side > 0 ? 7 : 8), pelvis)), rag);
                        chain(human, shoulder, hand, [0, 0, -1], upperQ, upperRoot, a.upperArmLength, a.forearmLength, k.armRadius, k.handRadius, k.handCarry, envelope, armLens);
                        const minimum = (a.upperArmLength + a.forearmLength) * a.ragdollArmMinReach;
                        if (rag > 0) {
                            const carryRadius = k.handCarry ? Math.hypot(Math.max(Math.abs(k.handCarry.axialFrom), Math.abs(k.handCarry.axialTo)), k.handCarry.radial) : 0;
                            if ((!envelope || minimum + Math.max(k.handRadius, carryRadius) > a.upperArmLength + k.armRadius)
                                && Math.hypot(...sub(hand, shoulder)) < minimum)
                                point(human, add(upperRoot, rotate(upperQ, shoulder)), minimum + Math.max(k.handRadius, carryRadius));
                        }
                        point(human, add(upperRoot, rotate(upperQ, hand)), k.handRadius);
                        if (Math.hypot(...sub(hand, shoulder)) < Math.abs(a.upperArmLength - a.forearmLength))
                            point(human, add(upperRoot, rotate(upperQ, shoulder)), a.upperArmLength + a.forearmLength + k.handRadius);
                    }
            }
        }
    }
    return { wheel: prism('wheel', wheel, p), human: prism('human', human, p) };
}
export function buildRiderWheelOccupancy(pose, coefficients) {
    if (clamp01(pose.ragdollBlend) > 0 && pose.ragdoll.length < 33)
        throw new Error('Active rider occupancy requires eleven world-space ragdoll particles');
    return prism('wheel', wheelOccupancy(pose, coefficients).wheel, pose);
}
export function buildRiderOccupancy(pose, coefficients) {
    return buildOccupancy(pose, coefficients, false);
}
export function buildRiderOccupancyEnvelope(pose, coefficients) {
    return buildOccupancy(pose, coefficients, true);
}
export function interpolateRiderOccupancyPose(a, b, t) {
    t = clamp01(t);
    const result = { ...a };
    for (const key of Object.keys(a)) {
        if (key !== 'ragdoll' && key !== 'ragdollJointPoles' && typeof a[key] === 'number' && typeof b[key] === 'number')
            result[key] = lerp(a[key], b[key], t);
    }
    const first = ragdollInterpolationBlock(a.ragdollBlend, b.ragdollBlend, a.ragdoll, b.ragdoll, 0);
    const last = ragdollInterpolationBlock(a.ragdollBlend, b.ragdollBlend, a.ragdoll, b.ragdoll, 1);
    const ragdoll = new Float64Array(Math.max(first.length, last.length));
    for (let index = 0; index < ragdoll.length; index += 1)
        ragdoll[index] = lerp(first[index], last[index], t);
    result.ragdoll = ragdoll;
    const poles = new Float64Array(12);
    if (result.ragdollBlend > 0) {
        const firstPole = ragdollInterpolationBlock(a.ragdollBlend, b.ragdollBlend, a.ragdollJointPoles ?? INACTIVE_JOINT_POLES, b.ragdollJointPoles ?? INACTIVE_JOINT_POLES, 0);
        const lastPole = ragdollInterpolationBlock(a.ragdollBlend, b.ragdollBlend, a.ragdollJointPoles ?? INACTIVE_JOINT_POLES, b.ragdollJointPoles ?? INACTIVE_JOINT_POLES, 1);
        interpolateRagdollJointPoles(firstPole, lastPole, t, ragdoll, result.headingY, 0, poles);
    }
    result.ragdollJointPoles = poles;
    return result;
}
function frozenCopy(value) {
    if (value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return Object.freeze(value.map((item) => frozenCopy(item)));
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)])));
}
export function createRiderOccupancyTrajectory(previous, current, coefficients) {
    const first = ragdollInterpolationBlock(previous.ragdollBlend, current.ragdollBlend, previous.ragdoll, current.ragdoll, 0);
    const last = ragdollInterpolationBlock(previous.ragdollBlend, current.ragdollBlend, previous.ragdoll, current.ragdoll, 1);
    const firstPole = ragdollInterpolationBlock(previous.ragdollBlend, current.ragdollBlend, previous.ragdollJointPoles ?? INACTIVE_JOINT_POLES, current.ragdollJointPoles ?? INACTIVE_JOINT_POLES, 0);
    const lastPole = ragdollInterpolationBlock(previous.ragdollBlend, current.ragdollBlend, previous.ragdollJointPoles ?? INACTIVE_JOINT_POLES, current.ragdollJointPoles ?? INACTIVE_JOINT_POLES, 1);
    const a = frozenCopy({ ...previous, ragdoll: Array.from(first), ragdollJointPoles: Array.from(firstPole) });
    const b = frozenCopy({ ...current, ragdoll: Array.from(last), ragdollJointPoles: Array.from(lastPole) });
    coefficients = frozenCopy(coefficients);
    const intervalInput = Object.freeze({ previous: a, current: b, coefficients });
    const from = buildRiderOccupancy(a, coefficients), to = buildRiderOccupancy(b, coefficients);
    let travel = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    for (const component of ['wheel', 'human'])
        travel = Math.max(travel, Math.hypot(to[component].x - from[component].x, to[component].y - from[component].y, to[component].z - from[component].z));
    const radius = coefficients.hipHeight + coefficients.torso.maxY + coefficients.handRadius;
    for (const angle of ['headingY', 'groundPitch', 'groundRoll', 'wheelPitch', 'rollAngle', 'riderRoll', 'riderPitch',
        'riderTurnTwist', 'wobbleYaw', 'wobbleRoll', 'styleYaw', 'styleRoll', 'crashTumble', 'crashRoll', 'wheelCrashSpin', 'wheelCrashLean'])
        travel += Math.abs(b[angle] - a[angle]) * radius;
    if (a.ragdollBlend > 0 || b.ragdollBlend > 0) {
        for (let index = 0; index < Math.min(a.ragdoll.length, b.ragdoll.length); index += 3)
            travel = Math.max(travel, Math.hypot(b.ragdoll[index] - a.ragdoll[index], b.ragdoll[index + 1] - a.ragdoll[index + 1], b.ragdoll[index + 2] - a.ragdoll[index + 2]));
    }
    const poseAt = (amount) => interpolateRiderOccupancyPose(a, b, amount);
    return { from, to, intervalInput, poseAt,
        envelopeFrom: buildRiderOccupancyEnvelope(a, coefficients), envelopeTo: buildRiderOccupancyEnvelope(b, coefficients),
        recommendedSubsteps: Math.max(1, Math.ceil(travel / coefficients.trajectoryPointStep)),
        at: (amount) => buildRiderOccupancy(poseAt(amount), coefficients),
        envelopeAt: (amount) => buildRiderOccupancyEnvelope(poseAt(amount), coefficients) };
}
