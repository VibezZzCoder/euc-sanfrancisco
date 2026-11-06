// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/ridingRig.ts + reviewed d37efc0 declarations (MANIFEST.json) (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { NEAR_SOLID, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.js';
import { clamp01 } from '../shared/maths.js';
import { RD_CHEST, RD_FOOT_L, RD_FOOT_R, RD_HAND_L, RD_HAND_R, RD_HEAD, RD_HIP_L, RD_HIP_R, RD_PELVIS, } from '../simulation/ragdoll.js';
import { createBlockoutEUC } from './euc.js';
import { STANDARD_MACHINE_LOOK } from './machineLook.js';
import { armEaseForSpeed, createPlaceholderRider, createStanceInput } from './rider.js';
import { riderLook, MOTION_STILL } from './riderLook.js';
import { consolidateRig } from './rigConsolidation.js';
export const BAKED_PAIRS = Object.freeze([
    Object.freeze(['euc-pad-right', 'euc-pad-left']),
    Object.freeze(['euc-pedal-right', 'euc-pedal-left']),
]);
export function createRidingRig(look = riderLook('cool-rider'), machine = STANDARD_MACHINE_LOOK, options = {}) {
    const group = new THREE.Group();
    group.name = 'riding-rig';
    const motion = look.motion ?? MOTION_STILL;
    const groundPivot = new THREE.Group();
    groundPivot.name = 'riding-ground-pivot';
    group.add(groundPivot);
    const leanPivot = new THREE.Group();
    leanPivot.name = 'riding-lean-pivot';
    groundPivot.add(leanPivot);
    const euc = createBlockoutEUC(machine);
    const rider = createPlaceholderRider(look);
    leanPivot.add(euc.group);
    leanPivot.add(rider.root);
    const consolidation = options.consolidate === false
        ? null
        : consolidateRig(group, { bake: BAKED_PAIRS, castUnion: true });
    const tyrePositions = euc.tyre.geometry.getAttribute('position');
    let visualTyreRadius = WHEEL.tyreDiameter / 2;
    for (let index = 0; index < tyrePositions.count; index += 1) {
        const radius = Math.hypot(tyrePositions.getX(index), tyrePositions.getZ(index));
        if (!Number.isFinite(radius) || radius > WHEEL.tyreDiameter)
            throw new RangeError('Invalid selected visual tyre geometry');
        visualTyreRadius = Math.max(visualTyreRadius, radius);
    }
    const stance = createStanceInput();
    let lastAirHeight = 0;
    let settlingAfterApply = false;
    let trickOneFoot = 0;
    let trickSide = 0;
    const bandCount = NEAR_SOLID.bandHeights.length;
    const directionCount = NEAR_SOLID.directions;
    let solidLift = 0;
    let solidAlong = 0;
    let solidSeconds = 0;
    let solidAny = false;
    const solidFaces = new Float64Array(bandCount * directionCount).fill(Number.POSITIVE_INFINITY);
    const solidNormals = new Float64Array(2 * bandCount * directionCount);
    const worldNormals = new Float64Array(2 * bandCount * directionCount);
    let solidHasNormals = false;
    const nearest = new Float64Array(bandCount * directionCount);
    const offsets = new Float64Array(bandCount * directionCount);
    let posed = new Float64Array(0);
    const directionX = new Float64Array(directionCount);
    const directionZ = new Float64Array(directionCount);
    for (let index = 0; index < directionCount; index += 1) {
        const angle = (2 * Math.PI * index) / directionCount;
        directionX[index] = Math.sin(angle);
        directionZ[index] = Math.cos(angle);
    }
    const push = [0, 0];
    let hull = null;
    const groupInverse = new THREE.Matrix4();
    const toRoot = new THREE.Matrix4();
    const ragLean = new THREE.Matrix4();
    const ragStage = new THREE.Matrix4();
    const ragEuler = new THREE.Euler();
    const ragPelvis = new THREE.Vector3();
    const ragUp = new THREE.Vector3();
    const ragLateral = new THREE.Vector3();
    const ragForward = new THREE.Vector3();
    const ragBasis = new THREE.Matrix4();
    const ragQuat = new THREE.Quaternion();
    const ragOffset = new THREE.Vector3();
    const ragRootPos = new THREE.Vector3();
    const ragRootInverse = new THREE.Quaternion();
    const ragWorldRootInverse = new THREE.Quaternion();
    const ragParentInverse = new THREE.Quaternion();
    const ragBootQuaternion = new THREE.Quaternion();
    const ragLocal = (pose, index, out) => {
        const base = index * 3;
        return out
            .set(pose.ragdoll[base], pose.ragdoll[base + 1], pose.ragdoll[base + 2])
            .applyMatrix4(ragLean);
    };
    const buildHull = () => {
        const count = NEAR_SOLID.hullDirections;
        const golden = Math.PI * (3 - Math.sqrt(5));
        const axes = [];
        for (let index = 0; index < count; index += 1) {
            const y = 1 - (2 * (index + 0.5)) / count;
            const radius = Math.sqrt(1 - y * y);
            axes.push([Math.cos(golden * index) * radius, y, Math.sin(golden * index) * radius]);
        }
        const entries = [];
        rider.root.traverse((object) => {
            const mesh = object;
            if (mesh.isMesh !== true)
                return;
            const position = mesh.geometry.getAttribute('position');
            if (position === undefined || position.count === 0)
                return;
            const chosen = new Set();
            for (const [ax, ay, az] of axes) {
                let best = 0;
                let most = Number.NEGATIVE_INFINITY;
                for (let index = 0; index < position.count; index += 1) {
                    const along = position.getX(index) * ax + position.getY(index) * ay + position.getZ(index) * az;
                    if (along > most) {
                        most = along;
                        best = index;
                    }
                }
                chosen.add(best);
            }
            const points = new Float32Array(chosen.size * 3);
            let write = 0;
            for (const index of chosen) {
                points[write] = position.getX(index);
                points[write + 1] = position.getY(index);
                points[write + 2] = position.getZ(index);
                write += 3;
            }
            entries.push({ mesh, points });
        });
        return entries;
    };
    const shown = (mesh) => {
        for (let node = mesh; node !== null && node !== rider.root; node = node.parent) {
            if (!node.visible)
                return false;
        }
        return true;
    };
    const facePushFor = (pose) => {
        let localX = 0;
        let localZ = 0;
        const sin = Math.sin(pose.headingY);
        const cos = Math.cos(pose.headingY);
        if (solidAny) {
            hull ??= buildHull();
            let total = 0;
            for (const entry of hull)
                total += entry.points.length / 3;
            if (posed.length < total * 3)
                posed = new Float64Array(total * 3);
            group.updateMatrixWorld(true);
            groupInverse.copy(group.matrixWorld).invert();
            const heights = NEAR_SOLID.bandHeights;
            let write = 0;
            for (const entry of hull) {
                if (!shown(entry.mesh))
                    continue;
                toRoot.multiplyMatrices(groupInverse, entry.mesh.matrixWorld);
                const e = toRoot.elements;
                const points = entry.points;
                for (let read = 0; read < points.length; read += 3) {
                    const px = points[read];
                    const py = points[read + 1];
                    const pz = points[read + 2];
                    const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
                    let band = 0;
                    while (band + 1 < bandCount && y >= heights[band + 1])
                        band += 1;
                    posed[write] = e[0] * px + e[4] * py + e[8] * pz + e[12];
                    posed[write + 1] = band;
                    posed[write + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
                    write += 3;
                }
            }
            for (let entry = 0; entry < solidFaces.length; entry += 1) {
                const face = solidFaces[entry];
                if (!(face < Number.POSITIVE_INFINITY))
                    continue;
                const index = entry % directionCount;
                const band = (entry - index) / directionCount;
                let normalX = -directionX[index];
                let normalZ = -directionZ[index];
                if (solidHasNormals && (worldNormals[2 * entry] !== 0 || worldNormals[2 * entry + 1] !== 0)) {
                    const wx = worldNormals[2 * entry];
                    const wz = worldNormals[2 * entry + 1];
                    normalX = wx * cos - wz * sin;
                    normalZ = wx * sin + wz * cos;
                }
                solidNormals[2 * entry] = normalX;
                solidNormals[2 * entry + 1] = normalZ;
                offsets[entry] = face * (directionX[index] * normalX + directionZ[index] * normalZ);
                let least = Number.POSITIVE_INFINITY;
                for (let read = 0; read < write; read += 3) {
                    if (posed[read + 1] !== band)
                        continue;
                    const reach = posed[read] * normalX + posed[read + 2] * normalZ;
                    if (reach < least)
                        least = reach;
                }
                nearest[entry] = least;
            }
            for (let pass = 0; pass < NEAR_SOLID.solveIterations; pass += 1) {
                for (let entry = 0; entry < solidFaces.length; entry += 1) {
                    if (!(solidFaces[entry] < Number.POSITIVE_INFINITY) || nearest[entry] === Number.POSITIVE_INFINITY)
                        continue;
                    const normalX = solidNormals[2 * entry];
                    const normalZ = solidNormals[2 * entry + 1];
                    const short = offsets[entry] + NEAR_SOLID.faceGap - (nearest[entry] + localX * normalX + localZ * normalZ);
                    if (short > 0) {
                        localX += normalX * short;
                        localZ += normalZ * short;
                    }
                }
            }
            const length = Math.hypot(localX, localZ);
            if (length > NEAR_SOLID.maxPush) {
                localX *= NEAR_SOLID.maxPush / length;
                localZ *= NEAR_SOLID.maxPush / length;
            }
        }
        const targetX = localX * cos + localZ * sin;
        const targetZ = -localX * sin + localZ * cos;
        if (Math.hypot(targetX, targetZ) >= Math.hypot(push[0], push[1]) - 1e-9 || !(solidSeconds > 0)) {
            push[0] = targetX;
            push[1] = targetZ;
        }
        else {
            const keep = Math.exp(-solidSeconds / NEAR_SOLID.releaseSeconds);
            push[0] = targetX + (push[0] - targetX) * keep;
            push[1] = targetZ + (push[1] - targetZ) * keep;
            if (solidAny) {
                const easedX = push[0] * cos - push[1] * sin;
                const easedZ = push[0] * sin + push[1] * cos;
                for (let entry = 0; entry < solidFaces.length; entry += 1) {
                    if (!(solidFaces[entry] < Number.POSITIVE_INFINITY) || nearest[entry] === Number.POSITIVE_INFINITY)
                        continue;
                    const reach = nearest[entry] + easedX * solidNormals[2 * entry] + easedZ * solidNormals[2 * entry + 1];
                    if (reach < offsets[entry] + NEAR_SOLID.faceGap - 1e-9) {
                        push[0] = targetX;
                        push[1] = targetZ;
                        break;
                    }
                }
            }
        }
    };
    const self = {
        group,
        groundPivot,
        leanPivot,
        euc,
        rider,
        consolidation,
        resetCrashPose() { rider.resetCrashPose(); },
        apply(pose) {
            const crashing = pose.crashBlend > 0 || pose.ragdollBlend > 0;
            const excluded = crashing || pose.airHeight > 1e-4;
            const lift = excluded ? 0 : solidLift;
            const along = excluded ? 0 : solidAlong;
            const sin = Math.sin(pose.headingY);
            const cos = Math.cos(pose.headingY);
            group.position.set(pose.x + sin * along, pose.y + lift, pose.z + cos * along);
            group.rotation.y = pose.headingY;
            groundPivot.rotation.x = pose.groundPitch;
            groundPivot.rotation.z = pose.groundRoll;
            leanPivot.rotation.z = -pose.rollAngle;
            leanPivot.rotation.x = pose.wheelPitch;
            euc.group.rotation.y = pose.wobbleYaw + pose.styleYaw + pose.wheelCrashSpin;
            euc.group.position.y = pose.wheelCrashPop;
            euc.body.position.y = pose.suspensionOffset;
            rider.root.position.set(pose.crashLateral, pose.suspensionOffset - pose.crashDrop, pose.crashForward);
            rider.root.rotation.set(pose.crashTumble, 0, pose.crashRoll);
            const rag = clamp01(pose.ragdollBlend);
            stance.ragdollBlend = rag;
            if (rag > 0) {
                ragLean.makeRotationY(pose.headingY).setPosition(group.position);
                ragEuler.set(pose.groundPitch, 0, pose.groundRoll);
                ragLean.multiply(ragStage.makeRotationFromEuler(ragEuler));
                ragEuler.set(pose.wheelPitch, 0, -pose.rollAngle);
                ragLean.multiply(ragStage.makeRotationFromEuler(ragEuler));
                ragLean.invert();
                ragLocal(pose, RD_PELVIS, ragPelvis);
                ragLocal(pose, RD_CHEST, ragUp).sub(ragPelvis);
                ragLocal(pose, RD_HIP_L, ragLateral);
                ragLocal(pose, RD_HIP_R, ragOffset);
                ragLateral.sub(ragOffset);
                if (ragUp.lengthSq() < 1e-8)
                    ragUp.set(0, 1, 0);
                ragUp.normalize();
                ragForward.crossVectors(ragLateral, ragUp);
                if (ragForward.lengthSq() < 1e-8)
                    ragForward.set(0, 0, 1);
                ragForward.normalize();
                ragLateral.crossVectors(ragUp, ragForward).normalize();
                ragQuat.setFromRotationMatrix(ragBasis.makeBasis(ragLateral, ragUp, ragForward));
                ragOffset.set(0, RIDER.hipHeight, 0).applyQuaternion(ragQuat);
                ragRootPos.copy(ragPelvis).sub(ragOffset);
                rider.root.position.lerp(ragRootPos, rag);
                rider.root.quaternion.slerp(ragQuat, rag);
                ragRootInverse.copy(rider.root.quaternion).invert();
                ragLocal(pose, RD_HEAD, stance.ragdollHead)
                    .sub(rider.root.position).applyQuaternion(ragRootInverse);
                ragLocal(pose, RD_HAND_L, stance.ragdollHandL)
                    .sub(rider.root.position).applyQuaternion(ragRootInverse);
                ragLocal(pose, RD_HAND_R, stance.ragdollHandR)
                    .sub(rider.root.position).applyQuaternion(ragRootInverse);
                ragLocal(pose, RD_FOOT_L, stance.ragdollFootL)
                    .sub(rider.root.position).applyQuaternion(ragRootInverse);
                ragLocal(pose, RD_FOOT_R, stance.ragdollFootR)
                    .sub(rider.root.position).applyQuaternion(ragRootInverse);
                ragWorldRootInverse.copy(ragRootInverse)
                    .multiply(ragParentInverse.setFromRotationMatrix(ragLean));
                stance.ragdollJointPoles.set(pose.ragdollJointPoles);
                stance.ragdollHeadingY = pose.headingY;
                stance.ragdollRootWorldQuaternion.copy(ragWorldRootInverse).invert();
                stance.ragdollRootWorldPosition.copy(rider.root.position).applyMatrix4(ragStage.copy(ragLean).invert());
                stance.ragdollForwardWorld.copy(ragForward).applyQuaternion(ragBootQuaternion.copy(ragParentInverse).invert());
                stance.ragdollUp.set(0, 1, 0).applyQuaternion(ragWorldRootInverse);
            }
            euc.tyre.rotation.x = pose.wheelSpin;
            euc.group.rotation.z = -(pose.wobbleRoll + pose.styleRoll)
                + RIDER_BLOCKOUT.restWheelLean * pose.restFactor
                - pose.wheelCrashLean;
            const reverseStance = clamp01(pose.reverseBlend)
                * (1 - clamp01(pose.restFactor))
                * (1 - clamp01(pose.crashBlend));
            const styleSway = clamp01(1 - clamp01(pose.restFactor))
                * (1 - clamp01(pose.crashBlend))
                * Math.max(-1, Math.min(1, pose.styleSway));
            rider.pelvis.rotation.z = (-(pose.riderRoll - pose.rollAngle) * (1 - motion.overLean)
                - reverseStance * RIDER_BLOCKOUT.reverseShoulderRoll
                - styleSway * motion.swayPelvisRoll) * (1 - rag);
            stance.rollAngle = pose.rollAngle;
            stance.riderPitch = pose.riderPitch;
            stance.torsoPitch = pose.riderPitch - pose.wheelPitch + RIDER_BLOCKOUT.torsoRestPitch;
            stance.turnTwist = pose.riderTurnTwist;
            stance.technicalTurn = pose.technicalTurn;
            stance.lookYaw = pose.riderLookYaw - pose.riderTurnTwist;
            stance.reverse = pose.reverseBlend;
            stance.restFactor = pose.restFactor;
            stance.groundY = -pose.suspensionOffset - lift;
            stance.crouch = pose.crouch;
            stance.tuck = pose.tuck;
            stance.attack = pose.attack;
            stance.carveStance = pose.carveStance;
            stance.airBlend = pose.airBlend;
            stance.falling = pose.airHeight > 0 && pose.airHeight < lastAirHeight;
            lastAirHeight = pose.airHeight;
            stance.pedalStrike = pose.pedalStrike;
            stance.wobbleFootCorrection = pose.wobbleFootCorrection;
            stance.wobbleYaw = pose.wobbleYaw + pose.styleYaw;
            stance.pedalRoll = euc.group.rotation.z;
            stance.wobbleSway = pose.wobbleSway;
            stance.wobbleFight = Math.max(pose.wobbleFight, pose.styleStumble);
            stance.styleSway = pose.styleSway;
            stance.crash = pose.crashBlend;
            stance.oneFoot = trickOneFoot;
            stance.oneFootSide = trickSide;
            stance.armEase = armEaseForSpeed(pose.speed);
            settlingAfterApply = stance.falling;
            rider.applyStanceReaction(stance);
            if (excluded) {
                push[0] = 0;
                push[1] = 0;
            }
            else {
                facePushFor(pose);
                if (push[0] !== 0 || push[1] !== 0) {
                    group.position.x += push[0];
                    group.position.z += push[1];
                    group.updateMatrixWorld(true);
                }
            }
        },
        get settling() {
            return settlingAfterApply;
        },
        applyStatus(alert, seconds, boot = 0) {
            euc.setStatus(alert, seconds, boot);
        },
        setTrickPose(amount, side) {
            trickOneFoot = clamp01(amount);
            trickSide = trickOneFoot > 0 ? Math.sign(side) : 0;
        },
        setNearSolids(lift, faces, along = 0, seconds = 0, normals) {
            solidLift = Number.isFinite(lift) && lift > 0 ? lift : 0;
            solidAlong = Number.isFinite(along) ? along : 0;
            solidSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
            solidHasNormals = normals !== undefined;
            for (let entry = 0; entry < worldNormals.length; entry += 1) {
                const value = normals?.[entry];
                worldNormals[entry] = value === undefined || !Number.isFinite(value) ? 0 : value;
            }
            solidAny = false;
            for (let entry = 0; entry < solidFaces.length; entry += 1) {
                const face = faces[entry];
                const value = face === undefined || Number.isNaN(face) ? Number.POSITIVE_INFINITY : face;
                solidFaces[entry] = value;
                if (value < Number.POSITIVE_INFINITY)
                    solidAny = true;
            }
        },
        get visualTyreRadius() { return visualTyreRadius; },
        get nearPush() {
            return push;
        },
        dispose() {
            euc.dispose();
            rider.dispose();
            consolidation?.dispose();
            group.removeFromParent();
        },
    };
    return self;
}
export function pedalEdgeWorld(pose, side, out) {
    const lateral = side * (WHEEL.pedalSpan / 2);
    const height = WHEEL.pedalHeight + pose.suspensionOffset;
    const cos = Math.cos(pose.rollAngle);
    const sin = Math.sin(pose.rollAngle);
    const localX = lateral * cos + height * sin;
    const localY = height * cos - lateral * sin;
    const headingCos = Math.cos(pose.headingY);
    const headingSin = Math.sin(pose.headingY);
    return out.set(pose.x + localX * headingCos, pose.y + localY, pose.z - localX * headingSin);
}
