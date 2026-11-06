// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/EucController.ts + reviewed d37efc0 declarations (MANIFEST.json) (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { proposeRiderPhaseSideProjection, proposeWheelClearOfBodies, proposeWheelSideProjection } from '../shared/riderSideContact.js';
import { EUC, PHYSICS, SIMULATION, TERRAIN, WHEEL, POPULATION, POPULATION_CONTACT, RIDER_CONTACT, RIDER_BLOCKOUT, LAUNCH_PAD, SKATE_TRANSITION } from '../data/tuning.js';
import { SURFACES, SURFACE_IDS } from '../data/surfaces.js';
import { SOBER_STYLE } from '../data/rideStyles.js';
import { approach, clamp, clamp01, lerp } from '../shared/maths.js';
import { EUC_STEP_PRIMITIVE_FIELDS, copyEucStepPrimitives } from './eucStepPrimitives.js';
import { roughnessAt } from './roughness.js';
import { HazardField, NO_HAZARDS } from './hazards.js';
import { CrashRagdoll, RAGDOLL_FLOATS, RD_PELVIS } from './ragdoll.js';
import { ragdollInterpolationBlock } from '../shared/ragdollInterpolation.js';
import { interpolateRagdollJointPoles } from '../shared/ragdollBoot.js';
import { NO_SOFT_BODIES, SoftBodyField } from './softBodies.js';
import { LaunchPadField, NO_LAUNCH_PADS } from './launchPadField.js';
import { lateralCeilingG } from './lateralCeiling.js';
import { riderRollFor, settleStep } from './riderLean.js';
import { copyGroundSample, createGroundSample, } from './world.js';
const HELD_CONTACT_YIELD = Object.freeze({ reason: 'contact', occupantKind: 'cop',
    normalX: 0, normalZ: 0, pending: false, met: false });
const WALL_TURN_NORMAL_Y = Math.cos(SKATE_TRANSITION.wallTurnMinTilt);
const WALL_TURN_ALIGNED = Math.cos(SKATE_TRANSITION.wallTurnAlignedTilt);
const COME_BACK_NORMAL_Y = Math.cos(SKATE_TRANSITION.comeBackMinTilt);
const WALL_TURN_CREST_MIN_REACH = 0.05;
const WALL_TURN_CREST_MARGIN = 0.125;
const COME_BACK_APPROACH = Math.cos(SKATE_TRANSITION.comeBackMaxApproach);
const COME_BACK_LAND_NORMAL_Y = Math.cos(SKATE_TRANSITION.comeBackLandMinTilt);
const KICK_MIN_RISE = Math.tan(SKATE_TRANSITION.kickMinSlope);
const PREPARED_CONTROLLER_STEPS = new WeakMap();
export const EUC_STEP_REFERENCE_FIELDS = Object.freeze([
    'tuning', 'surfaces', 'sampler', 'spawn', 'dynamicWorld', 'dynamicPrevious',
    'dynamicIntent', 'style', 'ground', 'probe', 'obstacleHit', 'standoffOrigin',
    'standoffRay', 'hazards', 'softBodies', 'launchPads', 'ragdoll', 'workingController',
    'activePreparedStep', 'stateRevision', 'collectingNeutralStep', 'reactionController', 'safeRing',
]);
const STEP_REFERENCE_FIELDS = new Set(EUC_STEP_REFERENCE_FIELDS);
let stepPrimitiveListChecked = false;
export function eucStepPrimitiveFieldsOf(controller) {
    const from = controller;
    return Object.freeze(Object.keys(from).filter((key) => {
        if (STEP_REFERENCE_FIELDS.has(key))
            return false;
        if (typeof from[key] === 'object' || typeof from[key] === 'function') {
            throw new Error(`EUC transaction needs an explicit state copy for ${key}`);
        }
        return true;
    }));
}
function groundTiltTarget(normal, headingY, t) {
    const cos = Math.cos(headingY);
    const sin = Math.sin(headingY);
    const localX = cos * normal.x - sin * normal.z;
    const localZ = sin * normal.x + cos * normal.z;
    const targetPitch = clamp(Math.asin(clamp(localZ, -1, 1)), -t.maxGroundTilt, t.maxGroundTilt) * t.groundTiltPitchFollow;
    const targetRoll = clamp(Math.atan2(-localX, Math.max(1e-4, normal.y)), -t.maxGroundTilt, t.maxGroundTilt) * t.groundTiltRollFollow;
    return { pitch: targetPitch, roll: targetRoll };
}
function headOnTravel(tangent, length) {
    return tangent < Math.max(POPULATION_CONTACT.slideMinimumMetres, POPULATION_CONTACT.slideHeadOnShare * length);
}
function heldStepCount(mask) {
    let count = 0;
    for (let value = mask; value !== 0; value &= value - 1)
        count += 1;
    return count;
}
function detachedMotion(request) {
    return Object.freeze({ ...request, previous: Object.freeze({ ...request.previous }),
        proposed: Object.freeze({ ...request.proposed }) });
}
function detachedOccupancyPose(pose) {
    return Object.freeze({
        x: pose.x, y: pose.y, z: pose.z,
        headingY: pose.headingY, groundPitch: pose.groundPitch, groundRoll: pose.groundRoll,
        wheelPitch: pose.wheelPitch, rollAngle: pose.rollAngle, riderRoll: pose.riderRoll,
        riderPitch: pose.riderPitch, riderTurnTwist: pose.riderTurnTwist, technicalTurn: pose.technicalTurn,
        suspensionOffset: pose.suspensionOffset, restFactor: pose.restFactor, reverseBlend: pose.reverseBlend,
        crouch: pose.crouch, tuck: pose.tuck, attack: pose.attack,
        carveStance: pose.carveStance, airBlend: pose.airBlend, airHeight: pose.airHeight,
        wobbleYaw: pose.wobbleYaw, wobbleRoll: pose.wobbleRoll, wobbleFight: pose.wobbleFight,
        wobbleFootCorrection: pose.wobbleFootCorrection, wobbleSway: pose.wobbleSway, pedalStrike: pose.pedalStrike,
        styleYaw: pose.styleYaw, styleRoll: pose.styleRoll, styleSway: pose.styleSway,
        crashBlend: pose.crashBlend, crashLateral: pose.crashLateral, crashForward: pose.crashForward,
        crashDrop: pose.crashDrop, crashTumble: pose.crashTumble, crashRoll: pose.crashRoll,
        wheelCrashSpin: pose.wheelCrashSpin, wheelCrashLean: pose.wheelCrashLean, wheelCrashPop: pose.wheelCrashPop,
        ragdollBlend: pose.ragdollBlend,
        ragdoll: Object.freeze(Array.from(pose.ragdoll)),
        ragdollJointPoles: Object.freeze(pose.ragdollJointPoles ? Array.from(pose.ragdollJointPoles) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    });
}
function detachedPlacement(request) {
    return Object.freeze({ ...request, body: Object.freeze({ ...request.body }),
        occupancyPose: detachedOccupancyPose(request.occupancyPose) });
}
function sameFlatRecord(a, b) {
    const left = a, right = b;
    const keys = Object.keys(left), other = Object.keys(right);
    if (keys.length !== other.length)
        return false;
    let same = 0;
    while (same < keys.length && keys[same] === other[same])
        same += 1;
    if (same === keys.length) {
        const values = Object.values(left), others = Object.values(right);
        for (let index = 0; index < values.length; index += 1)
            if (!Object.is(values[index], others[index]))
                return false;
        return true;
    }
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (!Object.hasOwn(right, key) || !Object.is(left[key], right[key]))
            return false;
    }
    return true;
}
function copyFlatRecord(from, to) {
    const target = to;
    for (const key of Object.keys(target))
        if (!Object.hasOwn(from, key))
            delete target[key];
    Object.assign(to, from);
}
let configurationEpoch = 0;
const CONFIGURATION_COPIES = new WeakMap();
export function defaultSurfaceResponses() {
    const table = {};
    for (const id of SURFACE_IDS) {
        const surface = SURFACES[id];
        table[id] = {
            rollingResistance: surface.rollingResistance,
            grip: surface.grip,
            roughnessAmplitude: surface.roughnessAmplitude,
            roughnessWavelength: surface.roughnessWavelength,
            wobbleInjection: surface.wobbleInjection,
        };
    }
    return table;
}
export function defaultEucTuning() {
    return {
        gravity: PHYSICS.gravity,
        wheelRadius: WHEEL.tyreDiameter / 2,
        maxLeanPitch: EUC.maxLeanPitch,
        leanResponseSeconds: EUC.leanResponseSeconds,
        leanRateLimit: EUC.leanRateLimit,
        leanToAccel: EUC.leanToAccel,
        brakeAuthority: EUC.brakeAuthority,
        dragCoefficient: EUC.dragCoefficient,
        stoppedSpeed: EUC.stoppedSpeed,
        reverseEntrySpeed: EUC.reverseEntrySpeed,
        reverseEngageSeconds: EUC.reverseEngageSeconds,
        maxReverseSpeed: EUC.maxReverseSpeed,
        reverseGlanceFactor: EUC.reverseGlanceFactor,
        reverseSteerTravelRelative: EUC.reverseSteerTravelRelative,
        reversePoseSeconds: EUC.reversePoseSeconds,
        yawRateLow: EUC.yawRateLow,
        yawRateHigh: EUC.yawRateHigh,
        carveSpeed: EUC.carveSpeed,
        yawFalloffExponent: EUC.yawFalloffExponent,
        maxLateralG: EUC.maxLateralG,
        carveGripTopG: EUC.carveGripTopG,
        carveGripExponent: EUC.carveGripExponent,
        carveGripFullSpeed: EUC.carveGripFullSpeed,
        technicalTurnBonusG: EUC.technicalTurnBonusG,
        technicalTurnFadeSpeed: EUC.technicalTurnFadeSpeed,
        technicalTurnSteerStart: EUC.technicalTurnSteerStart,
        technicalTurnSteerFull: EUC.technicalTurnSteerFull,
        turnTechniqueResponseSeconds: EUC.turnTechniqueResponseSeconds,
        gentleTurnTorsoTwist: EUC.gentleTurnTorsoTwist,
        technicalTurnUpperBodyRollFactor: EUC.technicalTurnUpperBodyRollFactor,
        rollResponseSeconds: EUC.rollResponseSeconds,
        riderUpperBodyRollFactor: EUC.riderUpperBodyRollFactor,
        carveLeanSpeed: EUC.carveLeanSpeed,
        carveLeanFullSpeed: EUC.carveLeanFullSpeed,
        carveLeanShareTop: EUC.carveLeanShareTop,
        carveLeanHoldRate: EUC.carveLeanHoldRate,
        carveLeanSwingRate: EUC.carveLeanSwingRate,
        carveLeanSettleIn: EUC.carveLeanSettleIn,
        carveLeanSettleOut: EUC.carveLeanSettleOut,
        maxRiderPitch: EUC.maxRiderPitch,
        riderCruisePitchFactor: EUC.riderCruisePitchFactor,
        riderAccelerationPitchGain: EUC.riderAccelerationPitchGain,
        riderPitchResponseSeconds: EUC.riderPitchResponseSeconds,
        wheelPitchFactor: EUC.wheelPitchFactor,
        riderLookIntoTurn: EUC.riderLookIntoTurn,
        riderLookResponseSeconds: EUC.riderLookResponseSeconds,
        riderSlopeLeanFactor: EUC.riderSlopeLeanFactor,
        riderSlopeLeanFullSpeed: EUC.riderSlopeLeanFullSpeed,
        restDelaySeconds: EUC.restDelaySeconds,
        restResponseSeconds: EUC.restResponseSeconds,
        restReleaseSeconds: EUC.restReleaseSeconds,
        rollingResistanceScale: TERRAIN.rollingResistanceScale,
        curbThreshold: TERRAIN.curbThreshold,
        maxStepUp: WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor,
        curbImpactPerMetre: TERRAIN.curbImpactPerMetre,
        wallScrubDecel: TERRAIN.wallScrubDecel,
        wallStandoff: TERRAIN.wallStandoff,
        wallStandoffRate: TERRAIN.wallStandoffRate,
        obstacleCrashSpeed: EUC.obstacleCrashSpeed,
        feelerDistance: TERRAIN.feelerDistance,
        suspensionFrequencyHz: TERRAIN.suspensionFrequencyHz,
        suspensionDamping: TERRAIN.suspensionDamping,
        suspensionTravel: WHEEL.suspensionTravel,
        groundTiltResponseSeconds: TERRAIN.groundTiltResponseSeconds,
        maxGroundTilt: TERRAIN.maxGroundTilt,
        groundTiltPitchFollow: TERRAIN.groundTiltPitchFollow,
        groundTiltRollFollow: TERRAIN.groundTiltRollFollow,
        hopCompressSeconds: EUC.hopCompressSeconds,
        spinYawRate: EUC.spinYawRate,
        spinSteerThreshold: EUC.spinSteerThreshold,
        hopLaunchSpeed: EUC.hopLaunchSpeed,
        hopChargeSeconds: EUC.hopChargeSeconds,
        hopChargeHeightBonus: EUC.hopChargeHeightBonus,
        hopSuspensionRebound: EUC.hopSuspensionRebound,
        suspensionPreload: EUC.suspensionPreload,
        airYawFactor: EUC.airYawFactor,
        airDragFactor: EUC.airDragFactor,
        airPitchAuthority: EUC.airPitchAuthority,
        airPitchResponseSeconds: EUC.airPitchResponseSeconds,
        airTuck: EUC.airTuck,
        crouchHeldAmount: EUC.crouchHeldAmount,
        crouchResponseSeconds: EUC.crouchResponseSeconds,
        landingAbsorbSeconds: EUC.landingAbsorbSeconds,
        attackThrottle: EUC.attackThrottle,
        attackSpeed: EUC.attackSpeed,
        attackDelaySeconds: EUC.attackDelaySeconds,
        attackRampSeconds: EUC.attackRampSeconds,
        attackResponseSeconds: EUC.attackResponseSeconds,
        carveStanceRoll: EUC.carveStanceRoll,
        carveStanceFullRoll: EUC.carveStanceFullRoll,
        carveStanceSpeed: EUC.carveStanceSpeed,
        carveStanceFullSpeed: EUC.carveStanceFullSpeed,
        carveStanceResponseSeconds: EUC.carveStanceResponseSeconds,
        dropLaunchThreshold: TERRAIN.dropLaunchThreshold,
        landingImpactReference: EUC.landingImpactReference,
        landingMisalignReference: EUC.landingMisalignReference,
        landingSurfaceWeight: EUC.landingSurfaceWeight,
        landingRoughnessReference: EUC.landingRoughnessReference,
        landingHeavyScore: EUC.landingHeavyScore,
        landingWobbleScore: EUC.landingWobbleScore,
        landingCrashScore: EUC.landingCrashScore,
        landingSpeedLossPerScore: EUC.landingSpeedLossPerScore,
        landingMaxSpeedLoss: EUC.landingMaxSpeedLoss,
        landingStateSeconds: EUC.landingStateSeconds,
        landingSuspensionKick: EUC.landingSuspensionKick,
        pedalHeight: WHEEL.pedalHeight,
        pedalHalfSpan: WHEEL.pedalSpan / 2,
        pedalStrikeDecel: EUC.pedalStrikeDecel,
        pedalStrikeGraceAngle: EUC.pedalStrikeGraceAngle,
        pedalStrikeJolt: EUC.pedalStrikeJolt,
        wobbleMasterGain: EUC.wobbleMasterGain,
        wobbleFrequencyHz: EUC.wobbleFrequencyHz,
        wobbleFrequencyAtCrashHz: EUC.wobbleFrequencyAtCrashHz,
        wobbleMaxYaw: EUC.wobbleMaxYaw,
        wobbleMaxRoll: EUC.wobbleMaxRoll,
        wobbleCrashEnergy: EUC.wobbleCrashEnergy,
        wobbleDampingAggressive: EUC.wobbleDampingAggressive,
        wobbleDampingSmooth: EUC.wobbleDampingSmooth,
        wobbleSmoothThrottle: EUC.wobbleSmoothThrottle,
        wobbleSmoothSteerSeconds: EUC.wobbleSmoothSteerSeconds,
        wobbleSmoothResponseSeconds: EUC.wobbleSmoothResponseSeconds,
        wobbleFootCorrectionStart: EUC.wobbleFootCorrectionStart,
        wobbleFootCorrectionDamping: EUC.wobbleFootCorrectionDamping,
        wobbleFootCorrectionResponseSeconds: EUC.wobbleFootCorrectionResponseSeconds,
        wobbleSurfaceGain: EUC.wobbleSurfaceGain,
        wobbleStateEnergy: EUC.wobbleStateEnergy,
        wobbleProbeMetres: EUC.wobbleProbeMetres,
        wobbleProbeEnergy: EUC.wobbleProbeEnergy,
        hazardShallowEnergy: EUC.hazardShallowEnergy,
        hazardShallowSpeedCost: EUC.hazardShallowSpeedCost,
        hazardDeepEnergy: EUC.hazardDeepEnergy,
        hazardDeepSpeedCost: EUC.hazardDeepSpeedCost,
        hazardCrashSpeed: EUC.hazardCrashSpeed,
        powerComfortSpeed: EUC.powerComfortSpeed,
        powerLimitSpeed: EUC.powerLimitSpeed,
        powerSlopeLoad: EUC.powerSlopeLoad,
        powerAccelLoad: EUC.powerAccelLoad,
        powerLandingLoad: EUC.powerLandingLoad,
        powerLandingDecaySeconds: EUC.powerLandingDecaySeconds,
        powerResponseSeconds: EUC.powerResponseSeconds,
        powerReliefSeconds: EUC.powerReliefSeconds,
        powerNoticeLoad: EUC.powerNoticeLoad,
        powerWarnLoad: EUC.powerWarnLoad,
        powerTiltBackLoad: EUC.powerTiltBackLoad,
        powerTiltBackRelease: EUC.powerTiltBackRelease,
        tiltBackLeanBack: EUC.tiltBackLeanBack,
        tiltBackEngageSeconds: EUC.tiltBackEngageSeconds,
        tiltBackReleaseSeconds: EUC.tiltBackReleaseSeconds,
        tiltBackPedalPitch: EUC.tiltBackPedalPitch,
        overspeedBeepShare: EUC.overspeedBeepShare,
        cutoutSpeedShare: EUC.cutoutSpeedShare,
        cutoutHoldSeconds: EUC.cutoutHoldSeconds,
        cutoutEnabled: EUC.cutoutEnabled,
        crashWheelDecel: EUC.crashWheelDecel,
        crashWheelFallSeconds: EUC.crashWheelFallSeconds,
        crashWheelLean: EUC.crashWheelLean,
        crashRecoverEarliestSeconds: EUC.crashRecoverEarliestSeconds,
        crashRecoverAutoSeconds: EUC.crashRecoverAutoSeconds,
        crashHighFallMetres: EUC.crashHighFallMetres,
        crashHighFallSetbackMetres: EUC.crashHighFallSetbackMetres,
        crashRecoverSpeedFactor: EUC.crashRecoverSpeedFactor,
        crashSafeDelaySeconds: EUC.crashSafeDelaySeconds,
        crashSafeWobbleCeiling: EUC.crashSafeWobbleCeiling,
        crashInvulnerableSeconds: EUC.crashInvulnerableSeconds,
        crashRecoverBlendSeconds: EUC.crashRecoverBlendSeconds,
        crashStepOffSpeed: EUC.crashStepOffSpeed,
        crashRunOutSpeed: EUC.crashRunOutSpeed,
        crashSeparationForward: EUC.crashSeparationForward,
        crashSeparationLateral: EUC.crashSeparationLateral,
        crashSeparationSeconds: EUC.crashSeparationSeconds,
        crashRiderDrop: EUC.crashRiderDrop,
        crashRiderTumble: EUC.crashRiderTumble,
        crashSideFallDrop: EUC.crashSideFallDrop,
        crashSideFallRoll: EUC.crashSideFallRoll,
        crashTumbleHz: EUC.crashTumbleHz,
        crashTumbleDampSeconds: EUC.crashTumbleDampSeconds,
        crashTumbleRoll: EUC.crashTumbleRoll,
        crashTumblePitch: EUC.crashTumblePitch,
        crashTumbleBounce: EUC.crashTumbleBounce,
        ragdollEnabled: EUC.ragdollEnabled,
        ragdollBlendSeconds: EUC.ragdollBlendSeconds,
        ragdollDamping: EUC.ragdollDamping,
        ragdollIterations: EUC.ragdollIterations,
        ragdollFriction: EUC.ragdollFriction,
        ragdollRestitution: EUC.ragdollRestitution,
        ragdollCurlGain: EUC.ragdollCurlGain,
        ragdollTuckGain: EUC.ragdollTuckGain,
        ragdollLaunchPop: EUC.ragdollLaunchPop,
        ragdollLaunchPopMax: EUC.ragdollLaunchPopMax,
        ragdollLaunchCarry: EUC.ragdollLaunchCarry,
        ragdollLaunchSide: EUC.ragdollLaunchSide,
        ragdollLaunchTumble: EUC.ragdollLaunchTumble,
        crashLaunchFloor: EUC.crashLaunchFloor,
        ragdollSoftDamping: EUC.ragdollSoftDamping,
        crashWheelFlourishSpeed: EUC.crashWheelFlourishSpeed,
        crashWheelSpinRate: EUC.crashWheelSpinRate,
        crashWheelSpinDampSeconds: EUC.crashWheelSpinDampSeconds,
        crashWheelPopFactor: EUC.crashWheelPopFactor,
        crashWheelPopMax: EUC.crashWheelPopMax,
        crashWheelPopRestitution: EUC.crashWheelPopRestitution,
        softBodyDrag: EUC.softBodyDrag,
        softBodyDragQuadratic: EUC.softBodyDragQuadratic,
        softBodyDragFadeSpeed: EUC.softBodyDragFadeSpeed,
        softBodyWobbleEnergy: EUC.softBodyWobbleEnergy,
    };
}
export const POWER_STAGE_ORDER = Object.freeze(['normal', 'notice', 'warn', 'tiltBack']);
export function createPose() {
    return {
        x: 0,
        y: 0,
        z: 0,
        headingY: 0,
        rollAngle: 0,
        riderRoll: 0,
        riderPitch: 0,
        riderLookYaw: 0,
        riderTurnTwist: 0,
        technicalTurn: 0,
        reverseBlend: 0,
        wheelPitch: 0,
        wheelSpin: 0,
        groundPitch: 0,
        groundRoll: 0,
        suspensionOffset: 0,
        restFactor: 0,
        speed: 0,
        crouch: 0,
        tuck: 0,
        attack: 0,
        carveStance: 0,
        airBlend: 0,
        airHeight: 0,
        groundY: 0,
        pedalStrike: 0,
        wobble: 0,
        wobbleFootCorrection: 0,
        wobbleYaw: 0,
        wobbleRoll: 0,
        wobbleSway: 0,
        wobbleFight: 0,
        alert: 0,
        crashBlend: 0,
        crashForward: 0,
        crashLateral: 0,
        crashDrop: 0,
        crashTumble: 0,
        crashRoll: 0,
        wheelCrashLean: 0,
        wheelCrashSpin: 0,
        wheelCrashPop: 0,
        ragdollBlend: 0,
        ragdoll: new Float32Array(RAGDOLL_FLOATS),
        ragdollJointPoles: new Float32Array(12),
        recoverBlend: 1,
        tiltBack: 0,
        styleSway: 0,
        styleYaw: 0,
        styleRoll: 0,
        styleStumble: 0,
    };
}
const POSE_SCALARS = Object.freeze(Object.entries(createPose())
    .filter(([, value]) => typeof value === 'number')
    .map(([key]) => key));
export function lerpPose(from, to, alpha, out) {
    const fromBlend = from.ragdollBlend, toBlend = to.ragdollBlend;
    for (const key of POSE_SCALARS) {
        const a = from[key];
        const b = to[key];
        out[key] = a + (b - a) * alpha;
    }
    const blend = out.ragdollBlend;
    if (blend > 0) {
        const first = ragdollInterpolationBlock(fromBlend, toBlend, from.ragdoll, to.ragdoll, 0);
        const last = ragdollInterpolationBlock(fromBlend, toBlend, from.ragdoll, to.ragdoll, 1);
        for (let index = 0; index < out.ragdoll.length; index += 1) {
            out.ragdoll[index] = first[index] + (last[index] - first[index]) * alpha;
        }
        const firstPole = ragdollInterpolationBlock(fromBlend, toBlend, from.ragdollJointPoles, to.ragdollJointPoles, 0);
        const lastPole = ragdollInterpolationBlock(fromBlend, toBlend, from.ragdollJointPoles, to.ragdollJointPoles, 1);
        interpolateRagdollJointPoles(firstPole, lastPole, alpha, out.ragdoll, out.headingY, RIDER_BLOCKOUT.ragdollKneeVerticalBand, out.ragdollJointPoles);
    }
    else
        out.ragdollJointPoles.fill(0);
}
export function copyPose(from, to) {
    to.x = from.x;
    to.y = from.y;
    to.z = from.z;
    to.headingY = from.headingY;
    to.rollAngle = from.rollAngle;
    to.riderRoll = from.riderRoll;
    to.riderPitch = from.riderPitch;
    to.riderLookYaw = from.riderLookYaw;
    to.riderTurnTwist = from.riderTurnTwist;
    to.technicalTurn = from.technicalTurn;
    to.reverseBlend = from.reverseBlend;
    to.wheelPitch = from.wheelPitch;
    to.wheelSpin = from.wheelSpin;
    to.groundPitch = from.groundPitch;
    to.groundRoll = from.groundRoll;
    to.suspensionOffset = from.suspensionOffset;
    to.restFactor = from.restFactor;
    to.speed = from.speed;
    to.crouch = from.crouch;
    to.tuck = from.tuck;
    to.attack = from.attack;
    to.carveStance = from.carveStance;
    to.airBlend = from.airBlend;
    to.airHeight = from.airHeight;
    to.groundY = from.groundY;
    to.pedalStrike = from.pedalStrike;
    to.wobble = from.wobble;
    to.wobbleFootCorrection = from.wobbleFootCorrection;
    to.wobbleYaw = from.wobbleYaw;
    to.wobbleRoll = from.wobbleRoll;
    to.wobbleSway = from.wobbleSway;
    to.wobbleFight = from.wobbleFight;
    to.alert = from.alert;
    to.crashBlend = from.crashBlend;
    to.crashForward = from.crashForward;
    to.crashLateral = from.crashLateral;
    to.crashDrop = from.crashDrop;
    to.crashTumble = from.crashTumble;
    to.crashRoll = from.crashRoll;
    to.wheelCrashLean = from.wheelCrashLean;
    to.wheelCrashSpin = from.wheelCrashSpin;
    to.wheelCrashPop = from.wheelCrashPop;
    to.ragdollBlend = from.ragdollBlend;
    to.ragdoll.set(from.ragdoll);
    if (from.ragdollBlend > 0)
        to.ragdollJointPoles.set(from.ragdollJointPoles);
    else
        to.ragdollJointPoles.fill(0);
    to.recoverBlend = from.recoverBlend;
    to.tiltBack = from.tiltBack;
    to.styleSway = from.styleSway;
    to.styleYaw = from.styleYaw;
    to.styleRoll = from.styleRoll;
    to.styleStumble = from.styleStumble;
}
export class EucController {
    tuning;
    surfaces;
    workingController = null;
    reactionController = null;
    activePreparedStep = null;
    stateRevision = 0;
    collectingNeutralStep = false;
    sampler;
    spawn;
    dynamicWorld;
    dynamicPrevious = null;
    dynamicIntent = null;
    dynamicImpactSpeed = 0;
    vehicleImpact = false;
    crashVelocityX = 0;
    crashVelocityZ = 0;
    recoveryRetrySeconds = 0;
    dynamicImpactNormalX = 0;
    dynamicImpactNormalZ = 0;
    dynamicSpinApplied = 0;
    dynamicComeBackApplied = 0;
    dynamicStyleHeadingPrevious = 0;
    placementSerial = 0;
    dynamicPlacementBlocked = false;
    style = SOBER_STYLE;
    x = 0;
    y = 0;
    z = 0;
    headingY = 0;
    speed = 0;
    leanPitch = 0;
    riderPitch = 0;
    slopeLean = 0;
    riderLookYaw = 0;
    riderTurnTwist = 0;
    technicalTurn = 0;
    longitudinalAccel = 0;
    rollAngle = 0;
    riderLean = 0;
    leanSettle = 1;
    yawRate = 0;
    lateralAccel = 0;
    lateralLimited = false;
    wheelSpin = 0;
    distanceTravelled = 0;
    reversing = false;
    reverseHold = 0;
    contactBrakingConstraint = false;
    reverseBlend = 0;
    restHold = 0;
    restFactor = 0;
    grounded = true;
    surface = 'pavement';
    traction = 'pavement';
    state = 'mounted';
    ground = createGroundSample();
    probe = createGroundSample();
    obstacleHit = {
        distance: 0,
        halfExtentX: Infinity,
        halfExtentZ: Infinity,
    };
    lastObstacleNarrow = false;
    standoffOrigin = { x: 0, y: 0, z: 0 };
    standoffRay = { x: 0, y: 0, z: 0 };
    slope = 0;
    slopeAccel = 0;
    rollingResistance = 0;
    lateralLimitG = 0;
    groundPitch = 0;
    groundRoll = 0;
    suspensionOffset = 0;
    suspensionVelocity = 0;
    suspensionCompression = 0;
    curbAhead = 0;
    lastStepUp = 0;
    blocked = false;
    obstacleEscapeArmed = false;
    collisionImpact = 0;
    offCourse = false;
    hazards;
    inHazard = false;
    softBodies;
    inSoftBody = false;
    launchPads;
    launchPadsArmed = false;
    launchPadLatch = false;
    launchPadRearmMetres = 0;
    launchPadRearmRidden = false;
    launchPadVerticalSpeed = LAUNCH_PAD.verticalSpeed;
    justPadLaunched = false;
    launchPadsShown = false;
    launchPadRise = 0;
    airborne = false;
    verticalVelocity = 0;
    airDirX = 0;
    airDirZ = 1;
    crashTravelX = 0;
    crashTravelZ = 1;
    groundY = 0;
    airTime = 0;
    airApex = 0;
    compressTimer = 0;
    compressing = false;
    crouchHold = 0;
    hopCharge = 0;
    hopWasHeld = false;
    hops = 0;
    spinRemaining = 0;
    spinDirection = 1;
    spinArmed = false;
    spinsCount = 0;
    crouch = 0;
    tuck = 0;
    attackHold = 0;
    attack = 0;
    carveStance = 0;
    absorb = 0;
    airBlend = 0;
    airPitch = 0;
    landingTimer = 0;
    landingQuality = 'none';
    landingImpact = 0;
    landingMisalignment = 0;
    landingScore = 0;
    landingSpeedLoss = 0;
    landings = 0;
    pedalStrike = 0;
    pedalClearance = 0;
    justTookOff = false;
    justTouchedDown = false;
    justHopped = false;
    spinSwept = false;
    flights = 0;
    stylePhaseA = 0;
    stylePhaseB = 0;
    styleGate = 0;
    styleSway = 0;
    styleHeading = 0;
    styleWeaveRate = 0;
    styleMetres = 0;
    stumbleTime = 0;
    stumbleLength = 0;
    stumbles = 0;
    styleYaw = 0;
    styleRoll = 0;
    styleStumble = 0;
    wobbleEnergy = 0;
    wobblePhase = 0;
    wobbleYaw = 0;
    wobbleRoll = 0;
    wobbleSway = 0;
    wobbleRate = 0;
    wobbleProbeDistance = 0;
    wobbleSmoothness = 0;
    wobbleFootCorrection = 0;
    steerSign = 0;
    steerHold = 0;
    loadFactor = 0;
    powerStage = 'normal';
    landingLoad = 0;
    tiltBack = 0;
    tiltBackLatched = false;
    overspeedFactor = 0;
    overspeedHold = 0;
    crashing = false;
    crashCause = 'none';
    crashMotion = 'none';
    crashTime = 0;
    crashes = 0;
    crashSpeed = 0;
    crashSide = 1;
    crashBlend = 0;
    wheelCrashLean = 0;
    recoverTimer = 0;
    invulnerableTimer = 0;
    crashFalling = false;
    crashFallSeconds = 0;
    ragdoll = new CrashRagdoll();
    ragdolling = false;
    wheelCrashSpin = 0;
    wheelCrashSpinRate = 0;
    wheelCrashPop = 0;
    wheelCrashPopVelocity = 0;
    safeX = 0;
    safeY = 0;
    safeZ = 0;
    safeHeading = 0;
    safeHold = 0;
    safeRing = new Float64Array(4 * POPULATION_CONTACT.recoveryRingPoints);
    safeRingCount = 0;
    safeRingNext = 0;
    recoveryRefusedSeconds = 0;
    contactHoldMask = 0;
    contactHoldMaskOlder = 0;
    constructor(sampler, options = {}) {
        this.sampler = sampler;
        this.tuning = { ...defaultEucTuning(), ...options.tuning };
        this.surfaces = { ...defaultSurfaceResponses(), ...options.surfaces };
        this.spawn = options.spawn ?? { position: { x: 0, y: 0, z: 0 }, headingY: 0 };
        this.hazards = options.hazards ?? NO_HAZARDS;
        this.softBodies = options.softBodies ?? NO_SOFT_BODIES;
        this.launchPads = options.launchPads ?? NO_LAUNCH_PADS;
        this.setDynamicWorld(options.dynamicWorld);
        if (!this.reset())
            throw new Error('EUC initial placement is blocked by the dynamic world');
    }
    prepareStep(dt, actions) {
        if (!Number.isFinite(dt) || dt < 0)
            throw new RangeError('EUC prepared step needs a finite nonnegative dt');
        this.invalidatePreparedStep();
        let working = this.workingController;
        if (!working) {
            working = new EucController(this.sampler, {
                hazards: this.hazards, softBodies: this.softBodies, launchPads: this.launchPads,
            });
            working.style = { ...this.style };
            this.workingController = working;
        }
        working.copyStepConfigurationFrom(this);
        working.copyMutableStateFrom(this);
        const record = {
            owner: this, token: undefined,
            revision: this.stateRevision, dt, actions: Object.freeze({ ...actions }),
            motionRequests: [], placementRequests: [], resolvedMotionRequests: [], resolvedPlacementRequests: [],
            intent: null, placementBlocked: false, discontinuitySerial: this.placementSerial,
            ready: false, held: false, committed: false, published: false, contactResponded: false, notifications: [], didPlace: undefined,
        };
        const token = Object.freeze({
            get motionRequests() { return record.motionRequests; },
            get placementRequests() { return record.placementRequests; },
            get resolvedMotionRequests() { return record.resolvedMotionRequests; },
            get resolvedPlacementRequests() { return record.resolvedPlacementRequests; },
            get dynamicMotionIntent() { return record.intent; },
            get placementBlocked() { return record.placementBlocked; },
            get discontinuitySerial() { return record.discontinuitySerial; },
            get ready() { return record.ready; },
            get held() { return record.held; },
        });
        record.token = token;
        PREPARED_CONTROLLER_STEPS.set(token, record);
        this.activePreparedStep = record;
        const motions = [], placements = [];
        working.dynamicWorld = this.dynamicWorld ? {
            hull: { ...this.dynamicWorld.hull },
            resolveMotion: (request) => { motions.push(detachedMotion(request)); return null; },
            canPlace: (request) => { placements.push(detachedPlacement(request)); return true; },
        } : undefined;
        working.collectingNeutralStep = true;
        try {
            working.step(dt, record.actions);
            this.requirePreparedStep(token, 'epoch');
            record.motionRequests = Object.freeze(motions);
            record.placementRequests = Object.freeze(placements);
            this.capturePreparedFacts(record, working);
        }
        catch (error) {
            this.activePreparedStep = null;
            throw error;
        }
        finally {
            working.collectingNeutralStep = false;
        }
        return token;
    }
    resolvePreparedStep(token, world = this.dynamicWorld) {
        const record = this.requirePreparedStep(token);
        if (record.held)
            throw new Error('EUC held prepared step cannot resume within its fixed tick');
        record.ready = false;
        this.validateDynamicWorld(world);
        const working = this.workingController;
        working.copyMutableStateFrom(this);
        record.notifications.length = 0;
        record.didPlace = world?.didPlace;
        const motions = [], placements = [];
        working.dynamicWorld = world ? {
            hull: { ...world.hull }, ragObstacles: world.ragObstacles, ragObstacleBodies: world.ragObstacleBodies, crashObstacleBodies: world.crashObstacleBodies, occupantKind: world.occupantKind,
            resolveMotion: world.resolveMotion ? (request) => {
                const detached = detachedMotion(request);
                motions.push(detached);
                const result = world.resolveMotion(detached);
                return result && request.kind === 'standoff' ? { ...result, chargeImpact: false } : result;
            } : undefined,
            canPlace: world.canPlace ? (request) => {
                const detached = detachedPlacement(request);
                placements.push(detached);
                return world.canPlace(detached);
            } : undefined,
            didPlace: (request) => {
                const detached = detachedPlacement(request);
                if (!world.canPlace)
                    placements.push(detached);
                record.notifications.push(detached);
            },
        } : undefined;
        working.step(record.dt, record.actions);
        this.requirePreparedStep(token);
        record.resolvedMotionRequests = Object.freeze(motions);
        record.resolvedPlacementRequests = Object.freeze(placements);
        this.capturePreparedFacts(record, working);
        record.ready = true;
    }
    holdPreparedStep(token) {
        const record = this.requirePreparedStep(token);
        record.ready = false;
        const working = this.workingController;
        working.copyMutableStateFrom(this);
        working.dynamicWorld = this.dynamicWorld;
        working.dynamicPrevious = null;
        working.dynamicIntent = null;
        working.dynamicImpactSpeed = 0;
        working.dynamicImpactNormalX = 0;
        working.dynamicImpactNormalZ = 0;
        working.dynamicSpinApplied = 0;
        working.dynamicComeBackApplied = 0;
        working.justTookOff = false;
        working.justTouchedDown = false;
        working.justHopped = false;
        working.justPadLaunched = false;
        working.collisionImpact = 0;
        record.notifications.length = 0;
        record.didPlace = undefined;
        record.resolvedMotionRequests = Object.freeze([]);
        record.resolvedPlacementRequests = Object.freeze([]);
        this.capturePreparedFacts(record, working);
        record.held = true;
        record.ready = true;
    }
    writePreparedPose(token, target) {
        this.requirePreparedStep(token);
        this.workingController.writePose(target);
    }
    commitPreparedStep(token, publishPlacements = true) {
        const record = this.requirePreparedStep(token, true);
        if (!record.ready)
            throw new Error('EUC prepared step must resolve before commit');
        this.copyMutableStateFrom(this.workingController);
        record.committed = true;
        record.ready = false;
        this.activePreparedStep = null;
        this.stateRevision += 1;
        if (publishPlacements)
            this.publishPreparedPlacements(token);
    }
    publishPreparedPlacements(token) {
        const record = PREPARED_CONTROLLER_STEPS.get(token);
        if (!record || record.owner !== this || !record.committed || record.published) {
            throw new Error('EUC placement journal is uncommitted, foreign or already published');
        }
        record.published = true;
        for (const placement of record.notifications)
            record.didPlace?.(placement);
    }
    invalidatePreparedStep() {
        this.stateRevision += 1;
        if (this.activePreparedStep)
            this.activePreparedStep.ready = false;
        this.activePreparedStep = null;
    }
    requirePreparedStep(token, configuration = false) {
        const record = PREPARED_CONTROLLER_STEPS.get(token);
        if (!record || record.owner !== this || record.committed || this.activePreparedStep !== record
            || record.revision !== this.stateRevision
            || (configuration && !this.sameStepConfiguration(this.workingController, configuration === 'epoch'))) {
            throw new Error('EUC prepared step is stale, foreign or already committed');
        }
        return record;
    }
    capturePreparedFacts(record, working) {
        record.intent = working.dynamicIntent ? detachedMotion(working.dynamicIntent) : null;
        record.placementBlocked = working.dynamicPlacementBlocked;
        record.discontinuitySerial = working.placementSerial;
    }
    copyStepConfigurationFrom(source) {
        const copied = CONFIGURATION_COPIES.get(this);
        if (copied === undefined || copied.source !== source || copied.epoch !== configurationEpoch
            || !source.sameConfigurationFields(this)) {
            copyFlatRecord(source.tuning, this.tuning);
            for (const id of SURFACE_IDS)
                copyFlatRecord(source.surfaces[id], this.surfaces[id]);
            copyFlatRecord(source.style, this.style);
            CONFIGURATION_COPIES.set(this, { source, epoch: configurationEpoch });
        }
        this.spawn = { ...source.spawn, position: { ...source.spawn.position } };
    }
    sameConfigurationFields(other) {
        if (!sameFlatRecord(this.tuning, other.tuning) || !sameFlatRecord(this.style, other.style))
            return false;
        for (const id of SURFACE_IDS)
            if (!sameFlatRecord(this.surfaces[id], other.surfaces[id]))
                return false;
        return true;
    }
    sameStepConfiguration(other, epoch = false) {
        const copied = epoch ? CONFIGURATION_COPIES.get(other) : undefined;
        return (copied !== undefined && copied.source === this && copied.epoch === configurationEpoch
            || this.sameConfigurationFields(other))
            && this.spawn.headingY === other.spawn.headingY && sameFlatRecord(this.spawn.position, other.spawn.position);
    }
    copyMutableStateFrom(source) {
        const copyRagdoll = source.ragdolling || this.ragdolling;
        if (!stepPrimitiveListChecked) {
            const fields = eucStepPrimitiveFieldsOf(source), listed = new Set(EUC_STEP_PRIMITIVE_FIELDS);
            const missing = fields.filter((key) => !listed.has(key));
            const discovered = new Set(fields);
            const stale = EUC_STEP_PRIMITIVE_FIELDS.filter((key) => !discovered.has(key));
            if (missing.length || stale.length) {
                throw new Error(`EUC transaction primitive list is stale: unlisted ${missing.join(', ') || 'none'}; `
                    + `absent ${stale.join(', ') || 'none'}. Regenerate src/simulation/eucStepPrimitives.ts with node tools/gen-step-primitives.mjs`);
            }
            stepPrimitiveListChecked = true;
        }
        copyEucStepPrimitives(this, source);
        copyGroundSample(source.ground, this.ground);
        copyGroundSample(source.probe, this.probe);
        Object.assign(this.obstacleHit, source.obstacleHit);
        Object.assign(this.standoffOrigin, source.standoffOrigin);
        Object.assign(this.standoffRay, source.standoffRay);
        this.dynamicPrevious = source.dynamicPrevious ? { ...source.dynamicPrevious } : null;
        this.dynamicIntent = source.dynamicIntent ? { ...source.dynamicIntent,
            previous: { ...source.dynamicIntent.previous }, proposed: { ...source.dynamicIntent.proposed } } : null;
        if (copyRagdoll)
            this.ragdoll.copyStateFrom(source.ragdoll);
        this.safeRing.set(source.safeRing);
    }
    validateDynamicWorld(world) {
        if (world && (![world.hull.halfWidthMetres, world.hull.halfLengthMetres, world.hull.heightMetres]
            .every(Number.isFinite) || world.hull.halfWidthMetres <= 0
            || world.hull.halfLengthMetres <= 0 || world.hull.heightMetres <= 0)) {
            throw new RangeError('EUC dynamic hull must have finite positive dimensions');
        }
    }
    admitPhysicalReaction(kind, reaction, rejected, acceptResult) {
        const canReact = this.dynamicWorld.canReact;
        let working = this.reactionController;
        if (!working) {
            working = new EucController(this.sampler, {
                hazards: this.hazards, softBodies: this.softBodies, launchPads: this.launchPads,
            });
            working.style = { ...this.style };
            this.reactionController = working;
        }
        working.copyStepConfigurationFrom(this);
        working.copyMutableStateFrom(this);
        working.dynamicWorld = undefined;
        const previous = createPose();
        this.writePose(previous);
        const revision = this.stateRevision, workingRevision = working.stateRevision;
        const result = reaction(working), proposed = createPose();
        working.writePose(proposed);
        if (acceptResult && !acceptResult(result))
            return rejected;
        const accepted = canReact(Object.freeze({ kind, previous: detachedOccupancyPose(previous),
            proposed: detachedOccupancyPose(proposed) }));
        if (this.stateRevision !== revision || !this.sameStepConfiguration(working)) {
            throw new Error('EUC physical reaction query must not mutate its controller');
        }
        if (!accepted)
            return rejected;
        const advance = working.stateRevision - workingRevision;
        if (advance > 0) {
            this.invalidatePreparedStep();
            this.stateRevision += advance - 1;
        }
        this.copyMutableStateFrom(working);
        return result;
    }
    setDynamicWorld(world) {
        this.validateDynamicWorld(world);
        this.invalidatePreparedStep();
        this.dynamicWorld = world ? { ...world, hull: { ...world.hull } } : undefined;
        this.dynamicPrevious = null;
        this.dynamicIntent = null;
        this.dynamicImpactSpeed = 0;
        this.vehicleImpact = false;
        this.dynamicPlacementBlocked = false;
    }
    setLaunchPadsArmed(on) {
        if (on === this.launchPadsArmed)
            return;
        this.invalidatePreparedStep();
        this.launchPadsArmed = on;
        if (on)
            this.launchPadLatch = this.launchPads.inFootprint(this.x, this.z);
    }
    setLaunchPadsShown(on) {
        if (on === this.launchPadsShown)
            return;
        this.invalidatePreparedStep();
        this.launchPadsShown = on;
    }
    get launchPadShown() { return this.launchPadsShown || this.launchPadsArmed; }
    launchPadRiseAt(x, z) {
        return this.launchPadsShown || this.launchPadsArmed ? this.launchPads.riseAt(x, z) : 0;
    }
    settleGroundY() {
        const rise = this.launchPadRiseAt(this.x, this.z);
        this.launchPadRise = rise;
        this.groundY = rise === 0 ? this.ground.height : this.ground.height + rise;
    }
    setLaunchPadVerticalSpeed(metresPerSecond) {
        if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) {
            throw new RangeError('launch pad vertical speed must be finite and positive');
        }
        if (metresPerSecond === this.launchPadVerticalSpeed)
            return;
        this.invalidatePreparedStep();
        this.launchPadVerticalSpeed = metresPerSecond;
    }
    get launchPadArmed() { return this.launchPadsArmed; }
    get launchPadCount() { return this.launchPads.count; }
    get discontinuitySerial() { return this.placementSerial; }
    placementOccupancyPose(spawn) {
        const ground = createGroundSample();
        this.sampler.sampleGround(spawn.position.x, spawn.position.z, ground, spawn.position.y);
        return this.proposedPlacementOccupancyPose(spawn.position.x, spawn.position.z, spawn.headingY, ground);
    }
    get placementBlocked() { return this.dynamicPlacementBlocked; }
    get dynamicMotionIntent() {
        return this.dynamicIntent ? { ...this.dynamicIntent,
            previous: { ...this.dynamicIntent.previous }, proposed: { ...this.dynamicIntent.proposed } } : null;
    }
    setTuning(values) {
        this.invalidatePreparedStep();
        configurationEpoch += 1;
        Object.assign(this.tuning, values);
    }
    setRideStyle(style) {
        this.invalidatePreparedStep();
        configurationEpoch += 1;
        const wasStyled = isStyled(this.style);
        this.style = style;
        if (isStyled(style) !== wasStyled) {
            this.clearStyleMotion();
            this.stylePhaseA = 0;
            this.stylePhaseB = 0;
            this.styleMetres = 0;
            this.stumbles = 0;
        }
    }
    get rideStyle() {
        return this.style;
    }
    setSurfaceResponse(id, values) {
        const surface = this.surfaces[id];
        if (surface === undefined)
            return;
        this.invalidatePreparedStep();
        configurationEpoch += 1;
        Object.assign(surface, values);
    }
    reset(spawn, initialSpeed = 0) {
        this.invalidatePreparedStep();
        const destination = spawn ?? this.spawn;
        const placementReason = this.placementSerial === 0 ? 'construct' : 'reset';
        if (!this.dynamicPlacementClear(destination.position.x, destination.position.z, destination.headingY, initialSpeed, placementReason, destination.position.y))
            return false;
        if (spawn)
            this.spawn = spawn;
        this.y = this.spawn.position.y;
        this.x = this.spawn.position.x;
        this.z = this.spawn.position.z;
        this.headingY = this.spawn.headingY;
        this.speed = initialSpeed;
        this.leanPitch = 0;
        this.riderPitch = 0;
        this.slopeLean = 0;
        this.riderLookYaw = 0;
        this.riderTurnTwist = 0;
        this.technicalTurn = 0;
        this.longitudinalAccel = 0;
        this.rollAngle = 0;
        this.riderLean = 0;
        this.leanSettle = 1;
        this.yawRate = 0;
        this.lateralAccel = 0;
        this.lateralLimited = false;
        this.wheelSpin = 0;
        this.distanceTravelled = 0;
        this.reversing = false;
        this.reverseHold = 0;
        this.reverseBlend = 0;
        this.restHold = 0;
        this.restFactor = 0;
        this.state = 'mounted';
        this.slope = 0;
        this.slopeAccel = 0;
        this.suspensionOffset = 0;
        this.suspensionVelocity = 0;
        this.suspensionCompression = 0;
        this.curbAhead = 0;
        this.lastStepUp = 0;
        this.blocked = false;
        this.obstacleEscapeArmed = false;
        this.collisionImpact = 0;
        this.inHazard = false;
        this.inSoftBody = false;
        this.launchPadLatch = this.launchPads.inFootprint(this.x, this.z);
        this.launchPadRearmMetres = LAUNCH_PAD.rearmMetres;
        this.launchPadRearmRidden = false;
        this.justPadLaunched = false;
        this.airborne = false;
        this.verticalVelocity = 0;
        this.airDirX = Math.sin(this.headingY);
        this.airDirZ = Math.cos(this.headingY);
        this.airTime = 0;
        this.airApex = 0;
        this.compressTimer = 0;
        this.compressing = false;
        this.crouchHold = 0;
        this.hopCharge = 0;
        this.hopWasHeld = false;
        this.hops = 0;
        this.spinRemaining = 0;
        this.spinArmed = false;
        this.spinsCount = 0;
        this.crouch = 0;
        this.tuck = 0;
        this.attackHold = 0;
        this.attack = 0;
        this.carveStance = 0;
        this.absorb = 0;
        this.airBlend = 0;
        this.airPitch = 0;
        this.landingTimer = 0;
        this.landingQuality = 'none';
        this.landingImpact = 0;
        this.landingMisalignment = 0;
        this.landingScore = 0;
        this.landingSpeedLoss = 0;
        this.landings = 0;
        this.pedalStrike = 0;
        this.justTookOff = false;
        this.justTouchedDown = false;
        this.justHopped = false;
        this.spinSwept = false;
        this.clearTransitionMotion();
        this.wallTurns = 0;
        this.comeBackAirs = 0;
        this.crashes = 0;
        this.stumbles = 0;
        this.clearInstability();
        this.crashCause = 'none';
        this.crashMotion = 'none';
        this.safeX = this.x;
        this.safeY = this.y;
        this.safeZ = this.z;
        this.safeHeading = this.headingY;
        this.safeHold = 0;
        this.safeRingCount = 0;
        this.safeRingNext = 0;
        this.clearContactRecovery();
        this.sampler.sampleGround(this.x, this.z, this.ground, this.y);
        this.settleGroundY();
        this.y = this.groundY;
        this.surface = this.ground.surface;
        this.traction = this.ground.traction ?? this.ground.surface;
        this.offCourse = this.ground.offCourse;
        this.grounded = true;
        this.pedalClearance = Math.atan2(this.tuning.pedalHeight, this.tuning.pedalHalfSpan);
        const response = this.surfaceResponse();
        this.rollingResistance = response.rollingResistance * this.tuning.rollingResistanceScale;
        this.lateralLimitG = lateralCeilingG(this.speed, this.tuning) * response.grip;
        this.writeGroundTilt(1);
        this.suspensionOffset = roughnessAt(this.x, this.z, response.roughnessAmplitude, response.roughnessWavelength);
        this.placementSerial += 1;
        this.dynamicPlacementBlocked = false;
        this.dynamicPrevious = null;
        this.dynamicIntent = null;
        this.notifyDynamicPlacement(placementReason, initialSpeed);
        return true;
    }
    airPhaseContactUpdate = false;
    step(dt, actions) {
        if (dt > 0 && this.sampler.needsWaterRecovery?.(this.x, this.z, this.y)) {
            this.invalidatePreparedStep();
            this.dynamicPrevious = null;
            this.dynamicIntent = null;
            this.justTookOff = this.justTouchedDown = this.justHopped = this.justPadLaunched = false;
            this.collisionImpact = 0;
            this.recoveryRetrySeconds = Math.max(0, this.recoveryRetrySeconds - dt);
            this.respawn(true);
            return;
        }
        const bodies = this.airborne && !this.crashing ? (this.dynamicWorld?.ragObstacleBodies?.() ?? this.dynamicWorld?.ragObstacles ?? []) : [];
        const before = bodies.length && dt > 0 ? createPose() : null, serial = this.placementSerial;
        if (before)
            this.writePose(before);
        this.airPhaseContactUpdate = before !== null;
        try {
            this.stepNative(dt, actions);
        }
        finally {
            this.airPhaseContactUpdate = false;
        }
        if (before && this.placementSerial === serial) {
            this.constrainNativePhaseSideContact(before, bodies, this.dynamicWorld?.occupantKind === 'human');
            if (!this.crashing)
                this.updateSafePosition(dt);
        }
    }
    stepNative(dt, actions) {
        if (dt <= 0)
            return;
        this.invalidatePreparedStep();
        this.recordContactHold(false);
        const t = this.tuning;
        this.dynamicIntent = null;
        this.dynamicSpinApplied = 0;
        this.dynamicComeBackApplied = 0;
        this.dynamicStyleHeadingPrevious = this.styleHeading;
        this.dynamicPrevious = this.dynamicWorld?.resolveMotion
            ? this.dynamicBody(this.x, this.z, this.y, this.headingY, this.speed * (this.airborne ? this.airDirX : Math.sin(this.headingY + this.wobbleYaw + this.styleYaw)), this.speed * (this.airborne ? this.airDirZ : Math.cos(this.headingY + this.wobbleYaw + this.styleYaw))) : null;
        const throttle = clamp(safeAxis(actions.throttle), -1, 1);
        const steer = clamp(safeAxis(actions.steer), -1, 1);
        this.justTookOff = false;
        this.justTouchedDown = false;
        this.justHopped = false;
        this.justPadLaunched = false;
        this.collisionImpact = 0;
        if (this.crashing) {
            this.stepCrash(dt, throttle, steer, actions.crouch);
            return;
        }
        const previousSpeed = this.speed;
        const response = this.surfaceResponse();
        const forwardX = Math.sin(this.headingY);
        const forwardZ = Math.cos(this.headingY);
        this.stepHop(dt, actions);
        const airborne = this.airborne;
        this.stepPower(dt);
        const leanCeiling = lerp(t.maxLeanPitch, -t.tiltBackLeanBack, this.tiltBack);
        this.leanPitch = approach(this.leanPitch, airborne ? 0 : Math.min(throttle * t.maxLeanPitch, leanCeiling), t.leanResponseSeconds, t.leanRateLimit, dt);
        const demand = Math.sin(this.leanPitch);
        const idle = Math.abs(demand) < 0.01;
        const braking = !airborne
            && !idle && demand * this.speed < 0 && Math.abs(this.speed) > t.stoppedSpeed;
        const accel = airborne ? 0 : (braking ? t.brakeAuthority : t.leanToAccel) * demand;
        this.slopeAccel = airborne
            ? 0
            : slopeAccelFor(this.ground.normal, forwardX, forwardZ, t.gravity);
        this.slope = this.slopeAccel === 0
            ? 0
            : Math.asin(clamp(-this.slopeAccel / t.gravity, -1, 1));
        const pull = airborne || this.sampler.transitionAt === undefined ? accel : this.faceBrake(accel, throttle);
        let speed = this.speed + (pull + this.slopeAccel) * dt;
        this.rollingResistance = airborne
            ? 0
            : response.rollingResistance * t.rollingResistanceScale;
        const drag = t.dragCoefficient * (airborne ? t.airDragFactor : 1);
        const resist = (drag * speed * speed + this.rollingResistance) * dt;
        if (speed > 0)
            speed = Math.max(0, speed - resist);
        else if (speed < 0)
            speed = Math.min(0, speed + resist);
        if (airborne) {
            this.reverseHold = 0;
        }
        else if (!this.reversing) {
            const askingBackward = throttle < -0.01;
            if (askingBackward && Math.abs(this.speed) <= t.reverseEntrySpeed) {
                this.reverseHold += dt;
            }
            else {
                this.reverseHold = 0;
            }
            if (this.reverseHold >= t.reverseEngageSeconds && askingBackward) {
                this.reversing = true;
            }
            if (speed < 0)
                speed = 0;
        }
        else {
            this.reverseHold = 0;
            speed = Math.max(speed, -t.maxReverseSpeed);
            if (throttle >= 0 && speed >= -t.stoppedSpeed) {
                this.reversing = false;
                if (speed < 0)
                    speed = 0;
            }
        }
        const speedFactor = clamp01(Math.abs(speed) / t.carveSpeed) ** t.yawFalloffExponent;
        const maxYawRate = lerp(t.yawRateLow, t.yawRateHigh, speedFactor);
        const steeringArmed = airborne
            || Math.abs(speed) > t.stoppedSpeed
            || this.obstacleEscapeArmed;
        const travelRelative = t.reverseSteerTravelRelative > 0 && speed < 0 ? -1 : 1;
        const steeredYawRate = steeringArmed
            ? -steer * maxYawRate * (airborne ? t.airYawFactor : 1) * travelRelative
            : 0;
        this.stepStyle(dt, steer, speed, airborne);
        const requestedYawRate = this.styleWeaveRate === 0
            ? steeredYawRate
            : steeredYawRate + this.styleWeaveRate;
        this.lateralLimitG = lateralCeilingG(speed, t) * response.grip;
        const absSteer = Math.abs(steer);
        const hardSteer = clamp01((absSteer - t.technicalTurnSteerStart)
            / Math.max(1e-6, t.technicalTurnSteerFull - t.technicalTurnSteerStart));
        const techniqueFade = 1 - clamp01(Math.abs(speed) / Math.max(1e-6, t.technicalTurnFadeSpeed));
        const technicalLimitG = t.technicalTurnBonusG
            * hardSteer
            * techniqueFade
            * response.grip;
        const steeringLimit = (this.lateralLimitG + technicalLimitG) * t.gravity;
        let yawRate = requestedYawRate;
        let lateralAccel = 0;
        let lateralLimited = false;
        if (!airborne) {
            const absSpeed = Math.abs(speed);
            if (absSpeed > 1e-6) {
                const magnitude = Math.abs(requestedYawRate);
                const direction = requestedYawRate < 0 ? -1 : 1;
                const delivered = Math.min(magnitude, steeringLimit / absSpeed);
                lateralLimited = delivered < magnitude - 1e-12;
                yawRate = direction * delivered;
                lateralAccel = speed * yawRate;
            }
        }
        this.yawRate = yawRate;
        this.lateralAccel = lateralAccel;
        this.lateralLimited = lateralLimited;
        this.headingY += yawRate * dt;
        if (this.styleWeaveRate !== 0) {
            let steeredDelivered = steeredYawRate;
            if (!airborne && Math.abs(speed) > 1e-6) {
                const magnitude = Math.abs(steeredYawRate);
                steeredDelivered = (steeredYawRate < 0 ? -1 : 1)
                    * Math.min(magnitude, steeringLimit / Math.abs(speed));
            }
            this.styleHeading += (yawRate - steeredDelivered) * dt;
        }
        if (airborne && this.spinRemaining > 0) {
            const sweep = Math.min(this.spinRemaining, t.spinYawRate * dt);
            if (this.dynamicPrevious)
                this.dynamicSpinApplied = sweep;
            this.headingY += sweep * this.spinDirection;
            this.spinRemaining -= sweep;
            if (this.spinRemaining <= 0)
                this.spinSwept = true;
        }
        if (airborne) {
            if (this.comeBackTurn > 0) {
                const sweep = Math.min(this.comeBackTurn, (Math.PI / SKATE_TRANSITION.comeBackTurnSeconds) * dt);
                this.headingY += sweep * this.comeBackDirection;
                if (this.dynamicPrevious)
                    this.dynamicComeBackApplied = sweep;
                this.comeBackTurn -= sweep;
            }
        }
        else if (this.sampler.transitionAt !== undefined) {
            this.stepWallTurn(dt, throttle, steer, speed);
        }
        const leanTarget = Math.atan(lateralAccel / t.gravity);
        const ordinaryLimit = (t.maxLateralG * response.grip + technicalLimitG) * t.gravity;
        const bankAccel = Math.abs(lateralAccel) > ordinaryLimit
            ? (lateralAccel < 0 ? -ordinaryLimit : ordinaryLimit)
            : lateralAccel;
        const bankTarget = Math.atan(bankAccel / t.gravity);
        const rollBefore = this.rollAngle;
        this.rollAngle = approach(this.rollAngle, bankTarget, t.rollResponseSeconds, Infinity, dt);
        this.leanSettle = settleStep(this.leanSettle, dt > 0 ? (this.rollAngle - rollBefore) / dt : 0, dt, t);
        this.riderLean = approach(this.riderLean, leanTarget, t.rollResponseSeconds, Infinity, dt);
        const technicalTarget = airborne || Math.abs(speed) <= 1e-6
            ? 0
            : Math.sign(lateralAccel) * hardSteer * techniqueFade;
        this.technicalTurn = approach(this.technicalTurn, technicalTarget, t.turnTechniqueResponseSeconds, Infinity, dt);
        const gentleSteer = absSteer <= 1e-6
            ? 0
            : clamp01(absSteer / Math.max(1e-6, t.technicalTurnSteerStart)) * (1 - hardSteer);
        const gentleTarget = airborne || this.reversing
            ? 0
            : -Math.sign(steer) * gentleSteer * t.gentleTurnTorsoTwist;
        this.riderTurnTwist = approach(this.riderTurnTwist, gentleTarget, t.turnTechniqueResponseSeconds, Infinity, dt);
        this.updatePedalStrike(airborne);
        if (this.pedalStrike !== 0) {
            const scrub = t.pedalStrikeDecel * Math.abs(this.pedalStrike) * dt;
            speed = speed > 0 ? Math.max(0, speed - scrub) : Math.min(0, speed + scrub);
        }
        if (!airborne)
            this.lateralAccel = speed * yawRate;
        this.stepWobble(dt, throttle, steer, speed, airborne, response);
        const activeAcceleration = airborne
            ? 0
            : throttle > 0
                ? Math.max(0, this.longitudinalAccel)
                : throttle < 0
                    ? Math.min(0, this.longitudinalAccel)
                    : 0;
        const reversePoseActive = this.reversing || this.reverseHold > 0;
        const riderPitchTarget = airborne || reversePoseActive ? 0 : clamp(this.leanPitch * t.riderCruisePitchFactor
            + activeAcceleration * t.riderAccelerationPitchGain, -t.maxRiderPitch, t.maxRiderPitch);
        if (!this.contactBrakingConstraint)
            this.riderPitch = approach(this.riderPitch, riderPitchTarget, t.riderPitchResponseSeconds, t.leanRateLimit, dt);
        this.airPitch = approach(this.airPitch, airborne ? throttle * t.airPitchAuthority : 0, t.airPitchResponseSeconds, Infinity, dt);
        const slopeLeanTarget = this.slope
            * t.riderSlopeLeanFactor
            * clamp01(Math.abs(this.speed) / Math.max(1e-6, t.riderSlopeLeanFullSpeed));
        this.slopeLean = approach(this.slopeLean, slopeLeanTarget, t.groundTiltResponseSeconds, Infinity, dt);
        this.riderLookYaw = approach(this.riderLookYaw, -steer * t.riderLookIntoTurn, t.riderLookResponseSeconds, Infinity, dt);
        const reverseTarget = this.reversing
            ? 1
            : t.reverseGlanceFactor
                * clamp01(this.reverseHold / Math.max(1e-6, t.reverseEngageSeconds));
        if (!this.contactBrakingConstraint)
            this.reverseBlend = approach(this.reverseBlend, reverseTarget, t.reversePoseSeconds, Infinity, dt);
        const previousY = this.y;
        const travelHeading = this.headingY + this.wobbleYaw + this.styleYaw;
        let comeBack = false;
        if (!airborne && this.sampler.transitionAt !== undefined) {
            comeBack = this.comeBackAtLip(Math.sin(travelHeading) * speed * dt, Math.cos(travelHeading) * speed * dt, speed, steer);
            if (comeBack)
                speed = SKATE_TRANSITION.comeBackDriftSpeed;
        }
        const flying = airborne || comeBack;
        if (flying) {
            this.verticalVelocity -= t.gravity * dt;
            this.y += this.verticalVelocity * dt;
            this.airTime += dt;
        }
        const travelX = flying ? this.airDirX : Math.sin(travelHeading);
        const travelZ = flying ? this.airDirZ : Math.cos(travelHeading);
        const intended = speed * dt;
        if (intended !== 0) {
            this.crashTravelX = travelX * Math.sign(intended);
            this.crashTravelZ = travelZ * Math.sign(intended);
        }
        const moved = this.advance(travelX * intended, travelZ * intended, dt, speed, flying);
        speed = moved.speed;
        this.collisionImpact = moved.impactSpeed;
        if (flying && !comeBack && this.blocked && !this.comeBackFlight && this.verticalVelocity > 0
            && intended !== 0 && this.sampler.transitionAt !== undefined
            && this.comeBackAgainstFace(travelX * Math.sign(intended), travelZ * Math.sign(intended), intended > 0, steer)) {
            speed = this.speed;
        }
        this.surface = this.ground.surface;
        this.traction = this.ground.traction ?? this.ground.surface;
        this.offCourse = this.ground.offCourse;
        this.settleGroundY();
        let landed = false;
        if (flying) {
            if (this.y <= this.groundY && this.verticalVelocity <= 0) {
                const fall = this.verticalVelocity;
                speed = this.land(speed, this.surfaceResponse());
                landed = true;
                if (this.comeBackFlight)
                    speed = this.comeBackTouchdown(speed, fall);
            }
            else if (this.y - this.groundY > this.airApex) {
                this.airApex = this.y - this.groundY;
            }
        }
        else if (moved.excess < -t.dropLaunchThreshold) {
            this.leaveGround(previousY, this.transitionLaunch(speed, speed * Math.sin(this.slope)), travelX, travelZ);
        }
        else {
            this.y = this.groundY;
            if (this.sampler.transitionAt !== undefined) {
                this.stepKickLatch(travelX * Math.sign(intended), travelZ * Math.sign(intended), moved.distance);
            }
            this.stepLaunchPad(speed, travelX, travelZ, dt, throttle !== 0 || steer !== 0);
        }
        this.grounded = !this.airborne;
        let hazardCrash = false;
        let hazardStruck = false;
        const hazard = this.airborne ? null : this.hazards.at(this.x, this.z);
        if (hazard !== null && !this.inHazard) {
            hazardStruck = true;
            const deep = hazard.kind === 'potholeDeep';
            if (deep && Math.abs(speed) >= t.hazardCrashSpeed) {
                hazardCrash = true;
            }
            else {
                this.injectWobble(deep ? t.hazardDeepEnergy : t.hazardShallowEnergy);
                const cost = deep ? t.hazardDeepSpeedCost : t.hazardShallowSpeedCost;
                speed = speed >= 0
                    ? Math.max(0, speed - cost)
                    : Math.min(0, speed + cost);
            }
        }
        this.inHazard = hazard !== null;
        let softStruck = false;
        const inFoliage = !this.airborne
            && !this.softBodies.empty
            && this.softBodies.contains(this.x, this.y, this.z);
        if (inFoliage) {
            if (!this.inSoftBody) {
                softStruck = true;
                this.injectWobble(t.softBodyWobbleEnergy);
            }
            const constant = t.softBodyDrag
                * clamp01(Math.abs(speed) / Math.max(1e-6, t.softBodyDragFadeSpeed));
            const drag = (constant + t.softBodyDragQuadratic * speed * speed) * dt;
            speed = speed >= 0 ? Math.max(0, speed - drag) : Math.min(0, speed + drag);
        }
        this.inSoftBody = inFoliage;
        this.speed = speed;
        this.longitudinalAccel = landed || hazardStruck || softStruck || comeBack
            ? 0
            : (speed - previousSpeed) / dt;
        this.wheelSpin += (moved.keptX * travelX + moved.keptZ * travelZ) / t.wheelRadius;
        this.distanceTravelled += moved.distance;
        this.writeGroundTilt(dt);
        this.stepCrouch(dt, actions);
        this.stepRidingStances(dt, throttle);
        this.stepSuspension(dt, response);
        this.readFeeler(Math.sin(this.headingY), Math.cos(this.headingY));
        this.airBlend = approach(this.airBlend, this.airborne ? 1 : 0, t.crouchResponseSeconds, Infinity, dt);
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
        }
        else if (hazardCrash) {
            this.beginCrash('hazard', speed);
        }
        else if (this.collisionImpact >= t.obstacleCrashSpeed) {
            const dynamicSide = this.dynamicImpactSpeed >= t.obstacleCrashSpeed
                && this.dynamicImpactSpeed >= this.collisionImpact
                ? Math.sign(this.dynamicImpactNormalX * Math.cos(this.headingY)
                    - this.dynamicImpactNormalZ * Math.sin(this.headingY)) : 0;
            this.beginCrash('obstacle', speed, dynamicSide);
        }
        else if (this.wobbleEnergy >= t.wobbleCrashEnergy) {
            this.beginCrash(this.pedalStrike !== 0 ? 'pedalStrike' : 'wobble', speed);
        }
        else if (landed && this.landingQuality === 'crash') {
            this.beginCrash('landing', speed);
        }
        else if (this.overspeedHold >= t.cutoutHoldSeconds) {
            this.beginCrash('cutout', speed);
        }
        if (this.landingTimer > 0)
            this.landingTimer = Math.max(0, this.landingTimer - dt);
        if (this.recoverTimer > 0)
            this.recoverTimer = Math.max(0, this.recoverTimer - dt);
        if (this.crashing)
            this.state = 'crashing';
        else if (this.airborne)
            this.state = 'airborne';
        else if (this.compressing)
            this.state = 'compressing';
        else if (this.recoverTimer > 0)
            this.state = 'recovering';
        else if (this.landingTimer > 0)
            this.state = 'landing';
        else if (this.tiltBackLatched)
            this.state = 'tiltBack';
        else if (braking)
            this.state = 'braking';
        else if (this.pedalStrike !== 0)
            this.state = 'pedalStrike';
        else if (this.wobbleEnergy >= t.wobbleStateEnergy)
            this.state = 'wobbling';
        else if (Math.abs(speed) <= t.stoppedSpeed && !this.reversing)
            this.state = 'mounted';
        else if (idle)
            this.state = 'coasting';
        else
            this.state = 'rolling';
        const wantsRest = this.state === 'mounted'
            && Math.abs(throttle) < 0.01
            && Math.abs(steer) < 0.01;
        this.restHold = wantsRest ? this.restHold + dt : 0;
        const resting = this.restHold >= t.restDelaySeconds;
        this.restFactor = approach(this.restFactor, resting ? 1 : 0, resting ? t.restResponseSeconds : t.restReleaseSeconds, Infinity, dt);
        if (!this.airPhaseContactUpdate)
            this.updateSafePosition(dt);
    }
    updateSafePosition(dt) {
        const t = this.tuning;
        const safe = this.grounded
            && !this.crashing
            && !this.offCourse
            && !this.blocked
            && !this.compressing
            && !this.inHazard
            && !this.inSoftBody
            && !((this.launchPadsArmed || this.launchPadsShown)
                && (this.launchPads.inFootprint(this.x, this.z) || this.launchPads.riseAt(this.x, this.z) > 0
                    || this.launchPads.holdsSafePoint(this.x, this.z, this.ground.height)))
            && this.surface !== 'spill'
            && this.wobbleEnergy < t.crashSafeWobbleCeiling
            && this.tiltBack < 1e-6
            && Math.abs(this.speed) > t.stoppedSpeed
            && this.sampler.transitionAt?.(this.x, this.z, this.y) !== true;
        if (!safe) {
            this.safeHold = 0;
            return;
        }
        this.safeHold = Math.min(this.safeHold + dt, t.crashSafeDelaySeconds);
        if (this.safeHold < t.crashSafeDelaySeconds)
            return;
        this.safeX = this.x;
        this.safeY = this.y;
        this.safeZ = this.z;
        this.safeHeading = this.headingY;
        this.rememberSafePoint();
    }
    rememberSafePoint() {
        const ring = this.safeRing, size = POPULATION_CONTACT.recoveryRingPoints;
        if (this.safeRingCount > 0) {
            const newest = ((this.safeRingNext + size - 1) % size) * 4;
            if (Math.hypot(this.safeX - ring[newest], this.safeZ - ring[newest + 1])
                < POPULATION_CONTACT.recoveryRingSpacingMetres)
                return;
        }
        const slot = this.safeRingNext * 4;
        ring[slot] = this.safeX;
        ring[slot + 1] = this.safeZ;
        ring[slot + 2] = this.safeHeading;
        ring[slot + 3] = this.safeY;
        this.safeRingNext = (this.safeRingNext + 1) % size;
        this.safeRingCount = Math.min(this.safeRingCount + 1, size);
    }
    stepPower(dt) {
        const t = this.tuning;
        this.landingLoad = approach(this.landingLoad, 0, t.powerLandingDecaySeconds, Infinity, dt);
        const speed = Math.abs(this.speed);
        const speedTerm = clamp01((speed - t.powerComfortSpeed)
            / Math.max(1e-6, t.powerLimitSpeed - t.powerComfortSpeed));
        const slopeTerm = Math.max(0, Math.sin(this.slope))
            * t.powerSlopeLoad
            * clamp01(speed / Math.max(1e-6, t.powerLimitSpeed));
        const accelTerm = Math.max(0, this.longitudinalAccel)
            / Math.max(1e-6, t.leanToAccel) * t.powerAccelLoad;
        const demand = this.airborne
            ? this.landingLoad
            : speedTerm + slopeTerm + accelTerm + this.landingLoad;
        this.loadFactor = approach(this.loadFactor, demand, demand > this.loadFactor ? t.powerResponseSeconds : t.powerReliefSeconds, Infinity, dt);
        if (this.tiltBackLatched) {
            if (this.loadFactor < t.powerTiltBackLoad * t.powerTiltBackRelease) {
                this.tiltBackLatched = false;
            }
        }
        else if (this.loadFactor >= t.powerTiltBackLoad) {
            this.tiltBackLatched = true;
        }
        this.tiltBack = approach(this.tiltBack, this.tiltBackLatched ? 1 : 0, this.tiltBackLatched ? t.tiltBackEngageSeconds : t.tiltBackReleaseSeconds, Infinity, dt);
        this.powerStage = this.tiltBackLatched
            ? 'tiltBack'
            : this.loadFactor >= t.powerWarnLoad
                ? 'warn'
                : this.loadFactor >= t.powerNoticeLoad
                    ? 'notice'
                    : 'normal';
        this.stepOverspeed(dt, speed);
    }
    stepOverspeed(dt, speed) {
        const t = this.tuning;
        if (t.cutoutEnabled < 0.5) {
            this.overspeedFactor = 0;
            this.overspeedHold = 0;
            return;
        }
        const top = this.derivedTopSpeed;
        const from = top * t.overspeedBeepShare;
        const to = top * t.cutoutSpeedShare;
        this.overspeedFactor = to > from ? clamp01((speed - from) / (to - from)) : 0;
        if (speed >= to && !this.airborne) {
            this.overspeedHold += dt;
        }
        else {
            this.overspeedHold = 0;
        }
    }
    stepWobble(dt, throttle, steer, speed, airborne, response) {
        const t = this.tuning;
        const before = this.wobbleEnergy;
        const steerSign = Math.abs(steer) < 0.01 ? 0 : steer > 0 ? 1 : -1;
        if (steerSign !== this.steerSign) {
            this.steerSign = steerSign;
            this.steerHold = 0;
        }
        else {
            this.steerHold += dt;
        }
        const smooth = Math.abs(throttle) <= t.wobbleSmoothThrottle
            && this.steerHold >= t.wobbleSmoothSteerSeconds
            ? 1
            : 0;
        this.wobbleSmoothness = approach(this.wobbleSmoothness, smooth, t.wobbleSmoothResponseSeconds, Infinity, dt);
        const footCorrectionTarget = !airborne
            && this.wobbleEnergy >= t.wobbleFootCorrectionStart
            ? 1
            : 0;
        this.wobbleFootCorrection = approach(this.wobbleFootCorrection, footCorrectionTarget, t.wobbleFootCorrectionResponseSeconds, Infinity, dt);
        if (this.invulnerableTimer > 0) {
            this.wobbleEnergy = 0;
            this.wobblePhase = 0;
            this.wobbleYaw = 0;
            this.wobbleRoll = 0;
            this.wobbleSway = 0;
            this.wobbleRate = 0;
            this.wobbleFootCorrection = 0;
            return;
        }
        if (!airborne) {
            const injection = response.wobbleInjection * Math.abs(speed) * t.wobbleSurfaceGain;
            this.wobbleEnergy += injection * clamp01(t.wobbleMasterGain) * dt;
        }
        if (t.wobbleProbeMetres > 0 && !airborne) {
            this.wobbleProbeDistance += Math.abs(speed) * dt;
            if (this.wobbleProbeDistance >= t.wobbleProbeMetres) {
                this.wobbleProbeDistance -= t.wobbleProbeMetres;
                this.injectWobble(t.wobbleProbeEnergy);
            }
        }
        const damping = lerp(t.wobbleDampingAggressive, t.wobbleDampingSmooth, this.wobbleSmoothness)
            + this.wobbleFootCorrection * t.wobbleFootCorrectionDamping;
        this.wobbleEnergy = Math.max(0, this.wobbleEnergy - damping * this.wobbleEnergy * dt);
        this.wobbleRate = (this.wobbleEnergy - before) / dt;
        const level = clamp01(this.wobbleEnergy / Math.max(1e-6, t.wobbleCrashEnergy));
        const frequency = lerp(t.wobbleFrequencyHz, t.wobbleFrequencyAtCrashHz, level);
        this.wobblePhase += 2 * Math.PI * frequency * dt;
        if (this.wobblePhase >= 2 * Math.PI)
            this.wobblePhase -= 2 * Math.PI;
        this.wobbleSway = airborne ? 0 : Math.sin(this.wobblePhase);
        this.wobbleYaw = t.wobbleMaxYaw * level * this.wobbleSway + 0;
        this.wobbleRoll = t.wobbleMaxRoll * level * this.wobbleSway + 0;
    }
    stepStyle(dt, steer, speed, airborne) {
        const s = this.style;
        const t = this.tuning;
        const riding = !airborne && !this.crashing && this.invulnerableTimer <= 0;
        const wobbleFree = 1 - clamp01(this.wobbleEnergy / Math.max(1e-6, t.wobbleStateEnergy));
        const pace = clamp01((speed - s.weaveSpeedFloor) / Math.max(1e-6, s.weaveSpeedFull - s.weaveSpeedFloor));
        const handsOff = (1 - Math.abs(steer)) ** 2;
        const gateTarget = riding ? pace * (2 - pace) * wobbleFree * handsOff : 0;
        this.styleGate += (gateTarget - this.styleGate) * Math.min(1, s.weaveFadeRate * dt);
        this.stylePhaseA += 2 * Math.PI * s.weaveRateA * dt;
        if (this.stylePhaseA >= 2 * Math.PI)
            this.stylePhaseA -= 2 * Math.PI;
        this.stylePhaseB += 2 * Math.PI * s.weaveRateB * dt;
        if (this.stylePhaseB >= 2 * Math.PI)
            this.stylePhaseB -= 2 * Math.PI;
        const oscillator = (Math.cos(this.stylePhaseA) + Math.cos(this.stylePhaseB)) / 2;
        this.styleSway = this.styleGate * oscillator + 0;
        const excursionHold = Math.min(1, s.weaveSpeedFull / Math.max(1e-6, Math.abs(speed)));
        const target = s.weaveHeading * excursionHold * this.styleSway + 0;
        const maxRate = s.weaveHeading * s.weaveFadeRate;
        this.styleWeaveRate = clamp((target - this.styleHeading) / dt, -maxRate, maxRate) + 0;
        if (this.stumbleTime < this.stumbleLength) {
            this.stumbleTime += dt;
            if (!riding || this.stumbleTime >= this.stumbleLength) {
                this.stumbleTime = this.stumbleLength;
                this.styleStumble = 0;
                this.styleYaw = 0;
                this.styleRoll = 0;
            }
            else {
                const along = this.stumbleTime / this.stumbleLength;
                const envelope = Math.sin(Math.PI * along) * wobbleFree;
                const shimmy = Math.sin(2 * Math.PI * s.stumbleRate * (this.stumbleTime - this.stumbleLength / 2));
                this.styleStumble = envelope;
                this.styleYaw = s.stumbleYaw * envelope * shimmy + 0;
                this.styleRoll = s.stumbleRoll * envelope * shimmy + 0;
            }
        }
        else {
            this.styleStumble = 0;
            this.styleYaw = 0;
            this.styleRoll = 0;
        }
        if (riding && s.stumbleEvery > 0) {
            this.styleMetres += Math.abs(speed) * dt;
            if (this.styleMetres >= s.stumbleEvery
                && speed >= s.weaveSpeedFloor
                && wobbleFree > 0.99
                && this.stumbleTime >= this.stumbleLength) {
                this.styleMetres = 0;
                this.stumbleTime = 0;
                this.stumbleLength = s.stumbleSeconds;
                this.stumbles += 1;
            }
        }
    }
    clearStyleMotion() {
        this.styleGate = 0;
        this.styleSway = 0;
        this.styleHeading = 0;
        this.styleWeaveRate = 0;
        this.stumbleTime = this.stumbleLength;
        this.styleStumble = 0;
        this.styleYaw = 0;
        this.styleRoll = 0;
    }
    injectWobble(energy) {
        if (!(energy > 0) || this.crashing || this.invulnerableTimer > 0)
            return;
        this.wobbleEnergy += energy * clamp01(this.tuning.wobbleMasterGain);
    }
    beginCrash(cause, speed, side = 0, motion, glance = 0, bodyY) {
        const t = this.tuning;
        const highFall = bodyY === undefined && this.airborne
            && this.y - this.groundY > t.crashHighFallMetres;
        this.crashFalling = highFall;
        this.crashFallSeconds = 0;
        this.crashing = true;
        this.crashCause = cause;
        this.crashSpeed = Math.abs(speed);
        this.crashes += 1;
        this.crashTime = 0;
        this.recoveryRetrySeconds = 0;
        this.crashBlend = 0;
        this.wheelCrashLean = 0;
        this.recoverTimer = 0;
        this.state = 'crashing';
        this.crashMotion = motion ?? (cause === 'cutout'
            ? 'faceplant'
            : cause === 'pedalStrike'
                || cause === 'obstacle'
                || cause === 'struck'
                || this.crashSpeed > t.crashRunOutSpeed
                ? 'sideFall'
                : this.crashSpeed > t.crashStepOffSpeed
                    ? 'runOut'
                    : 'stepOff');
        this.crashSide = side !== 0
            ? side
            : this.pedalStrike !== 0
                ? Math.sign(this.pedalStrike)
                : this.rollAngle !== 0
                    ? Math.sign(this.rollAngle)
                    : 1;
        this.ragdolling = t.ragdollEnabled >= 0.5;
        if (this.ragdolling) {
            const setback = highFall ? t.crashHighFallSetbackMetres : 0;
            const vehicleLaunch = cause === 'obstacle' && motion === undefined && this.vehicleImpact
                && this.dynamicImpactSpeed >= this.collisionImpact && !highFall;
            this.ragdoll.seed({
                x: this.x - (highFall ? this.crashTravelX : Math.sin(this.headingY)) * setback,
                y: bodyY ?? (highFall ? this.y : this.groundY),
                z: this.z - (highFall ? this.crashTravelZ : Math.cos(this.headingY)) * setback,
                headingY: this.headingY,
                rollAngle: this.rollAngle,
                riderPitch: this.riderPitch,
                hipDrop: this.crouch * 0.2,
                speed: highFall ? 0 : speed,
                cause: this.crashMotion,
                intoSolid: cause === 'obstacle' && motion === undefined,
                velocityX: vehicleLaunch ? this.crashVelocityX : undefined,
                velocityZ: vehicleLaunch ? this.crashVelocityZ : undefined,
                side: this.crashSide,
                glance,
            }, t, 1 / SIMULATION.hz);
        }
        if ((cause === 'obstacle'
            || this.crashMotion === 'sideFall'
            || this.crashMotion === 'faceplant')
            && this.crashSpeed >= t.crashWheelFlourishSpeed) {
            this.wheelCrashSpinRate = -this.crashSide * t.crashWheelSpinRate;
            this.wheelCrashPopVelocity = Math.min(this.crashSpeed * t.crashWheelPopFactor, t.crashWheelPopMax);
            this.wheelCrashPop = 0;
            this.wheelCrashSpin = 0;
        }
        this.leanPitch = 0;
        this.compressing = false;
        this.compressTimer = 0;
        this.crouchHold = 0;
        this.hopCharge = 0;
        this.hopWasHeld = false;
        this.spinRemaining = 0;
        this.spinArmed = false;
        this.reversing = false;
        this.reverseHold = 0;
        this.restHold = 0;
        this.restFactor = 0;
        this.yawRate = 0;
        this.lateralAccel = 0;
        this.lateralLimited = false;
        this.pedalStrike = 0;
        this.tiltBackLatched = false;
        this.overspeedFactor = 0;
        this.overspeedHold = 0;
        this.wobbleEnergy = 0;
        this.wobblePhase = 0;
        this.wobbleYaw = 0;
        this.wobbleRoll = 0;
        this.wobbleSway = 0;
        this.wobbleRate = 0;
        this.wobbleSmoothness = 0;
        this.wobbleFootCorrection = 0;
        this.clearStyleMotion();
    }
    stepCrash(dt, throttle, steer, crouch) {
        const t = this.tuning;
        const contactBodies = this.dynamicWorld?.ragObstacleBodies?.(this.ragdolling
            ? { x: this.ragdoll.positions[RD_PELVIS * 3], z: this.ragdoll.positions[RD_PELVIS * 3 + 2] } : undefined)
            ?? this.dynamicWorld?.ragObstacles ?? [];
        const contactBefore = contactBodies.length ? createPose() : null;
        if (contactBefore)
            this.writePose(contactBefore);
        this.crashTime += dt;
        this.recoveryRetrySeconds = Math.max(0, this.recoveryRetrySeconds - dt);
        const response = this.surfaceResponse();
        const forwardX = Math.sin(this.headingY);
        const forwardZ = Math.cos(this.headingY);
        this.slopeAccel = slopeAccelFor(this.ground.normal, forwardX, forwardZ, t.gravity);
        this.slope = this.slopeAccel === 0
            ? 0
            : Math.asin(clamp(-this.slopeAccel / t.gravity, -1, 1));
        this.rollingResistance = response.rollingResistance * t.rollingResistanceScale;
        let speed = this.speed + this.slopeAccel * dt;
        const resist = (t.crashWheelDecel
            + this.rollingResistance
            + t.dragCoefficient * speed * speed) * dt;
        if (speed > 0)
            speed = Math.max(0, speed - resist);
        else if (speed < 0)
            speed = Math.min(0, speed + resist);
        const falling = this.crashFalling;
        if (falling) {
            this.verticalVelocity -= t.gravity * dt;
            this.y += this.verticalVelocity * dt;
        }
        const intended = speed * dt;
        const moved = this.advance(forwardX * intended, forwardZ * intended, dt, speed, falling);
        speed = moved.speed;
        this.collisionImpact = this.dynamicImpactSpeed;
        this.speed = speed;
        this.longitudinalAccel = 0;
        this.surface = this.ground.surface;
        this.traction = this.ground.traction ?? this.ground.surface;
        this.offCourse = this.ground.offCourse;
        this.settleGroundY();
        if (falling && this.y > this.groundY) {
            this.grounded = false;
        }
        else {
            if (falling) {
                this.crashFalling = false;
                this.verticalVelocity = 0;
            }
            this.y = this.groundY;
            this.grounded = true;
        }
        this.wheelSpin += (moved.keptX * forwardX + moved.keptZ * forwardZ) / t.wheelRadius;
        this.distanceTravelled += moved.distance;
        this.writeGroundTilt(dt);
        this.stepSuspension(dt, response);
        this.crashBlend = approach(this.crashBlend, 1, t.crashSeparationSeconds, Infinity, dt);
        this.wheelCrashLean = approach(this.wheelCrashLean, t.crashWheelLean, t.crashWheelFallSeconds, Infinity, dt);
        if (this.ragdolling) {
            let bodyTuning = t;
            if (this.crashFalling || this.crashFallSeconds > 0) {
                const pelvis = this.ragdoll.positions, under = createGroundSample();
                const pelvisY = pelvis[RD_PELVIS * 3 + 1];
                this.sampler.sampleGround(pelvis[RD_PELVIS * 3], pelvis[RD_PELVIS * 3 + 2], under, pelvis[RD_PELVIS * 3 + 1]);
                const floor = under.height <= pelvisY ? under.height : this.groundY;
                if (pelvisY - floor > t.crashHighFallMetres) {
                    this.crashFallSeconds += dt;
                    bodyTuning = { ...t, ragdollDamping: 0 };
                }
            }
            this.ragdoll.step(dt, this.crashTime - this.crashFallSeconds, this.x, this.z, this.sampler, this.softBodies, bodyTuning, this.dynamicWorld?.crashObstacleBodies?.({ x: this.ragdoll.positions[RD_PELVIS * 3], z: this.ragdoll.positions[RD_PELVIS * 3 + 2] }) ?? contactBodies, this.headingY);
        }
        if (this.wheelCrashPop > 0 || this.wheelCrashPopVelocity !== 0) {
            this.wheelCrashPopVelocity -= t.gravity * dt;
            this.wheelCrashPop += this.wheelCrashPopVelocity * dt;
            if (this.wheelCrashPop <= 0) {
                this.wheelCrashPop = 0;
                this.wheelCrashPopVelocity = this.wheelCrashPopVelocity < -0.8
                    ? -this.wheelCrashPopVelocity * t.crashWheelPopRestitution
                    : 0;
            }
        }
        this.wheelCrashSpin += this.wheelCrashSpinRate * dt;
        this.wheelCrashSpinRate = approach(this.wheelCrashSpinRate, 0, t.crashWheelSpinDampSeconds, Infinity, dt);
        this.rollAngle = approach(this.rollAngle, 0, t.rollResponseSeconds, Infinity, dt);
        this.riderLean = approach(this.riderLean, 0, t.rollResponseSeconds, Infinity, dt);
        this.riderPitch = approach(this.riderPitch, 0, t.riderPitchResponseSeconds, Infinity, dt);
        this.slopeLean = approach(this.slopeLean, 0, t.groundTiltResponseSeconds, Infinity, dt);
        this.airPitch = approach(this.airPitch, 0, t.airPitchResponseSeconds, Infinity, dt);
        this.riderLookYaw = approach(this.riderLookYaw, 0, t.riderLookResponseSeconds, Infinity, dt);
        this.riderTurnTwist = approach(this.riderTurnTwist, 0, t.turnTechniqueResponseSeconds, Infinity, dt);
        this.technicalTurn = approach(this.technicalTurn, 0, t.turnTechniqueResponseSeconds, Infinity, dt);
        this.reverseBlend = approach(this.reverseBlend, 0, t.reversePoseSeconds, Infinity, dt);
        this.crouch = approach(this.crouch, 0, t.crouchResponseSeconds, Infinity, dt);
        this.tuck = approach(this.tuck, 0, t.crouchResponseSeconds, Infinity, dt);
        this.attackHold = 0;
        this.attack = approach(this.attack, 0, t.attackResponseSeconds, Infinity, dt);
        this.carveStance = approach(this.carveStance, 0, t.carveStanceResponseSeconds, Infinity, dt);
        this.absorb = approach(this.absorb, 0, t.landingAbsorbSeconds, Infinity, dt);
        this.airBlend = approach(this.airBlend, 0, t.crouchResponseSeconds, Infinity, dt);
        this.tiltBack = approach(this.tiltBack, 0, t.tiltBackReleaseSeconds, Infinity, dt);
        this.loadFactor = approach(this.loadFactor, 0, t.powerReliefSeconds, Infinity, dt);
        this.landingLoad = approach(this.landingLoad, 0, t.powerLandingDecaySeconds, Infinity, dt);
        this.powerStage = 'normal';
        this.overspeedFactor = 0;
        this.overspeedHold = 0;
        this.landingTimer = 0;
        this.state = 'crashing';
        if (contactBefore)
            this.constrainCrashWheelSideContact(contactBefore, contactBodies);
        const asked = Math.abs(throttle) > 0.01 || Math.abs(steer) > 0.01 || crouch;
        const ready = this.crashTime >= t.crashRecoverEarliestSeconds;
        if (!this.crashFalling && ((ready && asked) || this.crashTime >= t.crashRecoverAutoSeconds))
            this.respawn();
    }
    constrainCrashWheelSideContact(before, bodies) {
        const proposed = createPose();
        this.writePose(proposed);
        const skin = proposeWheelSideProjection(before, proposed, bodies, RIDER_CONTACT, POPULATION.contactSkinMetres);
        const contact = skin && (skin.x !== 0 || skin.z !== 0)
            ? proposeWheelSideProjection(before, proposed, bodies, RIDER_CONTACT, POPULATION.contactSkinMetres + POPULATION.nativePhaseRetryReserveMetres) : skin;
        if (!contact)
            return false;
        if (contact.x === 0 && contact.z === 0)
            return true;
        return this.projectCrashWheelSideContact(before, contact, true);
    }
    constrainNativePhaseSideContact(before, bodies, crashes = false) {
        const proposed = createPose();
        this.writePose(proposed);
        const retry = this.nativePhaseRetryReserveMetres > 0;
        const skin = retry ? null : proposeRiderPhaseSideProjection(before, proposed, bodies, RIDER_CONTACT, POPULATION.contactSkinMetres);
        const contact = retry || (skin && (skin.x !== 0 || skin.z !== 0))
            ? proposeRiderPhaseSideProjection(before, proposed, bodies, RIDER_CONTACT, POPULATION.contactSkinMetres + POPULATION.nativePhaseRetryReserveMetres) : skin;
        if (!contact)
            return false;
        if (contact.x === 0 && contact.z === 0)
            return true;
        if (this.ragdolling && !this.ragdoll.canProjectSideContact(contact.x, contact.z, this.sampler))
            return false;
        let closing = 0, normalX = 0, normalZ = 0;
        const speed = this.speed, forwardX = this.airborne ? this.airDirX : Math.sin(this.headingY), forwardZ = this.airborne ? this.airDirZ : Math.cos(this.headingY);
        for (const normal of contact.normals) {
            const into = -speed * (forwardX * normal.x + forwardZ * normal.z);
            if (into > closing) {
                closing = into;
                normalX = normal.x;
                normalZ = normal.z;
            }
        }
        if (!this.projectCrashWheelSideContact(before, contact))
            return false;
        if (this.ragdolling)
            return this.ragdoll.projectSideContact(contact.x, contact.z, contact.normals, this.sampler);
        if (crashes && !this.crashing && this.airborne && this.invulnerableTimer <= 0 && closing >= this.tuning.obstacleCrashSpeed) {
            this.collisionImpact = closing;
            this.crashInAir(normalX, normalZ, 'faceplant', this.tuning.ragdollLaunchSide, speed);
        }
        return true;
    }
    projectCrashWheelSideContact(before, projection, followGround = false) {
        const { x: dx, z: dz } = projection;
        this.sampler.sampleGround(this.x + dx, this.z + dz, this.probe, this.y);
        const lying = followGround && this.crashing && !this.airborne;
        if ((lying ? Math.abs(this.probe.height - this.ground.height) > this.tuning.maxStepUp
            : this.probe.height !== this.ground.height || this.probe.normal.x !== this.ground.normal.x
                || this.probe.normal.y !== this.ground.normal.y || this.probe.normal.z !== this.ground.normal.z
                || this.probe.surface !== this.ground.surface || this.probe.traction !== this.ground.traction)
            || this.probe.offCourse !== this.ground.offCourse
            || this.obstacleWithinWheelRadius(dx, dz))
            return false;
        const oldX = this.x, oldZ = this.z, forwardX = this.airborne ? this.airDirX : Math.sin(this.headingY), forwardZ = this.airborne ? this.airDirZ : Math.cos(this.headingY);
        this.commit(dx, dz, true);
        if (lying) {
            this.settleGroundY();
            this.y = this.groundY;
        }
        this.wheelSpin += (dx * forwardX + dz * forwardZ) / this.tuning.wheelRadius;
        this.distanceTravelled += Math.hypot(this.x - before.x, this.z - before.z) - Math.hypot(oldX - before.x, oldZ - before.z);
        let velocityX = this.speed * forwardX, velocityZ = this.speed * forwardZ;
        for (const normal of projection.normals) {
            const incoming = velocityX * normal.x + velocityZ * normal.z;
            if (incoming < 0) {
                velocityX -= incoming * normal.x;
                velocityZ -= incoming * normal.z;
            }
        }
        if (this.airborne) {
            const magnitude = Math.hypot(velocityX, velocityZ), sign = this.speed < 0 ? -1 : 1;
            this.speed = magnitude * sign;
            if (magnitude > 0) {
                this.airDirX = velocityX / this.speed;
                this.airDirZ = velocityZ / this.speed;
            }
        }
        else
            this.speed = velocityX * forwardX + velocityZ * forwardZ;
        this.blocked = true;
        return true;
    }
    recover() {
        if (!this.crashing || this.crashFalling || this.crashTime < this.tuning.crashRecoverEarliestSeconds)
            return false;
        return this.respawn();
    }
    respawn(atRest = false) {
        const t = this.tuning;
        if (this.sampler.findRecoveryTarget && this.recoveryRetrySeconds > 0)
            return false;
        let restored = atRest ? 0 : this.fallenRecoverySpeed(this.crashSpeed * t.crashRecoverSpeedFactor);
        const target = this.recoveryTarget(restored);
        if (!target)
            return false;
        restored = this.recoverySpeedAt(target.x, target.z, target.y, restored);
        this.y = target.y;
        this.x = target.x;
        this.z = target.z;
        this.headingY = target.headingY;
        this.speed = restored;
        this.leanPitch = 0;
        this.riderPitch = 0;
        this.slopeLean = 0;
        this.riderLookYaw = 0;
        this.riderTurnTwist = 0;
        this.technicalTurn = 0;
        this.longitudinalAccel = 0;
        this.rollAngle = 0;
        this.riderLean = 0;
        this.leanSettle = 1;
        this.yawRate = 0;
        this.lateralAccel = 0;
        this.lateralLimited = false;
        this.reversing = false;
        this.reverseHold = 0;
        this.reverseBlend = 0;
        this.restHold = 0;
        this.restFactor = 0;
        this.blocked = false;
        this.collisionImpact = 0;
        this.inHazard = false;
        this.inSoftBody = false;
        this.launchPadLatch = this.launchPads.inFootprint(this.x, this.z);
        this.launchPadRearmMetres = LAUNCH_PAD.rearmMetres;
        this.launchPadRearmRidden = true;
        this.justPadLaunched = false;
        this.lastStepUp = 0;
        this.curbAhead = 0;
        this.slope = 0;
        this.slopeAccel = 0;
        this.airborne = false;
        this.verticalVelocity = 0;
        this.airTime = 0;
        this.airApex = 0;
        this.airDirX = Math.sin(this.headingY);
        this.airDirZ = Math.cos(this.headingY);
        this.airPitch = 0;
        this.airBlend = 0;
        this.compressing = false;
        this.compressTimer = 0;
        this.crouchHold = 0;
        this.hopCharge = 0;
        this.hopWasHeld = false;
        this.spinRemaining = 0;
        this.spinArmed = false;
        this.spinSwept = false;
        this.clearTransitionMotion();
        this.crouch = 0;
        this.tuck = 0;
        this.attackHold = 0;
        this.attack = 0;
        this.carveStance = 0;
        this.absorb = 0;
        this.landingTimer = 0;
        this.pedalStrike = 0;
        this.clearInstability();
        this.invulnerableTimer = t.crashInvulnerableSeconds;
        this.recoverTimer = t.crashRecoverBlendSeconds;
        this.safeHold = 0;
        this.state = 'recovering';
        this.sampler.sampleGround(this.x, this.z, this.ground, this.y);
        this.settleGroundY();
        this.y = this.groundY;
        this.surface = this.ground.surface;
        this.traction = this.ground.traction ?? this.ground.surface;
        this.offCourse = this.ground.offCourse;
        this.grounded = true;
        const response = this.surfaceResponse();
        this.rollingResistance = response.rollingResistance * t.rollingResistanceScale;
        this.lateralLimitG = lateralCeilingG(this.speed, t) * response.grip;
        this.writeGroundTilt(1);
        this.suspensionVelocity = 0;
        this.suspensionCompression = 0;
        this.suspensionOffset = roughnessAt(this.x, this.z, response.roughnessAmplitude, response.roughnessWavelength);
        this.placementSerial += 1;
        this.dynamicPlacementBlocked = false;
        this.dynamicPrevious = null;
        this.dynamicIntent = null;
        this.clearContactRecovery();
        this.notifyDynamicPlacement('recover', restored);
        return true;
    }
    clearContactRecovery() {
        this.recoveryRefusedSeconds = 0;
        this.contactHoldMask = 0;
        this.contactHoldMaskOlder = 0;
    }
    recoverySpeedAt(x, z, referenceY, shipped) {
        return this.sampler.restartsAtRest?.(x, z, referenceY) === true ? 0 : shipped;
    }
    fallenRecoverySpeed(shipped) {
        if (!this.sampler.restartsAtRest)
            return shipped;
        const p = this.ragdoll.positions;
        const x = this.ragdolling ? p[RD_PELVIS * 3] : this.x;
        const z = this.ragdolling ? p[RD_PELVIS * 3 + 2] : this.z;
        const referenceY = this.ragdolling ? p[RD_PELVIS * 3 + 1] : this.y;
        const ground = this.sampler.sampleGround(x, z, this.probe, referenceY);
        const floorY = ground.height;
        if (!Number.isFinite(floorY) || floorY > referenceY + 0.03 || referenceY - floorY > 1.1
            || ground.offCourse || ground.surface === 'spill' || ground.traction === 'spill' || ground.normal.y < 0.9)
            return shipped;
        const speed = this.recoverySpeedAt(x, z, floorY, shipped);
        if (speed === shipped)
            return shipped;
        if (this.sampler.findPlacementTarget) {
            const support = this.sampler.findPlacementTarget({ x, z, referenceY, headingY: this.headingY,
                maxStepUp: this.tuning.maxStepUp, hull: this.dynamicWorld?.hull });
            if (!support || Math.abs(support.y - floorY) > 1e-5)
                return shipped;
        }
        return speed;
    }
    recoveryTarget(restored) {
        if (this.sampler.findRecoveryTarget) {
            if (this.recoveryRetrySeconds > 0)
                return null;
            this.recoveryRetrySeconds = 0.2;
            const safePoints = [{ x: this.safeX, y: this.safeY, z: this.safeZ, headingY: this.safeHeading }];
            const size = POPULATION_CONTACT.recoveryRingPoints;
            for (let age = 0; age < this.safeRingCount; age++) {
                const slot = ((this.safeRingNext + size - 1 - age) % size) * 4;
                if (this.safeRing[slot] === this.safeX && this.safeRing[slot + 1] === this.safeZ && this.safeRing[slot + 3] === this.safeY)
                    continue;
                safePoints.push({ x: this.safeRing[slot], y: this.safeRing[slot + 3], z: this.safeRing[slot + 1], headingY: this.safeRing[slot + 2] });
            }
            const p = this.ragdoll.positions;
            return this.sampler.findRecoveryTarget({
                fallen: this.ragdolling ? { x: p[RD_PELVIS * 3], y: p[RD_PELVIS * 3 + 1], z: p[RD_PELVIS * 3 + 2] } : { x: this.x, y: this.y, z: this.z },
                safePoints, headingY: this.headingY, maxStepUp: this.tuning.maxStepUp, hull: this.dynamicWorld?.hull,
            }, target => this.dynamicPlacementClear(target.x, target.z, target.headingY, restored, 'recover', target.y));
        }
        if (this.dynamicPlacementClear(this.safeX, this.safeZ, this.safeHeading, restored, 'recover')) {
            return { x: this.safeX, y: this.safeY, z: this.safeZ, headingY: this.safeHeading };
        }
        if (this.recoveryRefusedSeconds < POPULATION_CONTACT.recoveryFallbackSeconds)
            return null;
        const ring = this.safeRing, size = POPULATION_CONTACT.recoveryRingPoints;
        for (let age = 0; age < this.safeRingCount; age += 1) {
            const slot = ((this.safeRingNext + size - 1 - age) % size) * 4;
            const x = ring[slot], z = ring[slot + 1], headingY = ring[slot + 2];
            if (x === this.safeX && z === this.safeZ)
                continue;
            if (this.dynamicPlacementClear(x, z, headingY, restored, 'recover', ring[slot + 3]))
                return { x, y: ring[slot + 3], z, headingY };
        }
        const lateralX = Math.cos(this.safeHeading), lateralZ = -Math.sin(this.safeHeading);
        for (const offset of POPULATION_CONTACT.recoveryLateralMetres) {
            const x = this.safeX + lateralX * offset, z = this.safeZ + lateralZ * offset;
            if (this.recoveryOffsetStaticallyClear(x, z)
                && this.dynamicPlacementClear(x, z, this.safeHeading, restored, 'recover'))
                return { x, y: this.safeY, z, headingY: this.safeHeading };
        }
        return null;
    }
    recoveryOffsetStaticallyClear(x, z) {
        const t = this.tuning, ground = createGroundSample();
        this.sampler.sampleGround(this.safeX, this.safeZ, ground, this.safeY);
        const height = ground.height;
        this.sampler.sampleGround(x, z, ground, this.safeY);
        if (ground.offCourse || ground.surface === 'spill' || Math.abs(ground.height - height) > t.maxStepUp)
            return false;
        const raycastObstacle = this.sampler.raycastObstacle;
        if (raycastObstacle === undefined)
            return true;
        const dx = x - this.safeX, dz = z - this.safeZ, length = Math.hypot(dx, dz);
        return raycastObstacle.call(this.sampler, { x: this.safeX, y: height + t.maxStepUp + 1e-6, z: this.safeZ }, { x: dx, y: 0, z: dz }, length + t.pedalHalfSpan, t.wheelRadius, { x: Math.sin(this.safeHeading), y: 0, z: Math.cos(this.safeHeading) }) === null;
    }
    clearInstability() {
        this.wobbleEnergy = 0;
        this.wobblePhase = 0;
        this.wobbleYaw = 0;
        this.wobbleRoll = 0;
        this.wobbleSway = 0;
        this.wobbleRate = 0;
        this.wobbleSmoothness = 0;
        this.wobbleFootCorrection = 0;
        this.wobbleProbeDistance = 0;
        this.steerSign = 0;
        this.steerHold = 0;
        this.clearStyleMotion();
        this.stylePhaseA = 0;
        this.stylePhaseB = 0;
        this.styleMetres = 0;
        this.loadFactor = 0;
        this.landingLoad = 0;
        this.powerStage = 'normal';
        this.tiltBack = 0;
        this.tiltBackLatched = false;
        this.overspeedFactor = 0;
        this.overspeedHold = 0;
        this.crashing = false;
        this.crashTime = 0;
        this.recoveryRetrySeconds = 0;
        this.crashBlend = 0;
        this.crashSpeed = 0;
        this.crashSide = 1;
        this.wheelCrashLean = 0;
        this.recoverTimer = 0;
        this.invulnerableTimer = 0;
        this.crashFalling = false;
        this.crashFallSeconds = 0;
        this.ragdolling = false;
        this.wheelCrashSpin = 0;
        this.wheelCrashSpinRate = 0;
        this.wheelCrashPop = 0;
        this.wheelCrashPopVelocity = 0;
    }
    dynamicBody(x, z, y, headingY, velocityX, velocityZ) {
        const hull = this.dynamicWorld.hull;
        return { x, z, headingY, minY: y, maxY: y + hull.heightMetres,
            halfWidthMetres: hull.halfWidthMetres, halfLengthMetres: hull.halfLengthMetres,
            velocityX, velocityZ };
    }
    proposedPlacementOccupancyPose(x, z, headingY, ground) {
        const pose = createPose();
        pose.x = x;
        pose.y = ground.height;
        pose.z = z;
        pose.headingY = headingY;
        const tilt = groundTiltTarget(ground.normal, headingY, this.tuning);
        pose.groundPitch = tilt.pitch;
        pose.groundRoll = tilt.roll;
        const response = this.surfaces[ground.traction ?? ground.surface] ?? this.surfaces.pavement;
        pose.suspensionOffset = roughnessAt(x, z, response.roughnessAmplitude, response.roughnessWavelength);
        return detachedOccupancyPose(pose);
    }
    dynamicPlacementClear(x, z, headingY, speed, reason, referenceY = reason === 'recover' ? this.safeY : this.y) {
        if (reason === 'recover')
            speed = this.recoverySpeedAt(x, z, referenceY, speed);
        const canPlace = this.dynamicWorld?.canPlace;
        if (!canPlace)
            return true;
        this.sampler.sampleGround(x, z, this.probe, referenceY);
        const clear = canPlace({ reason, initialSpeedMetresPerSecond: speed,
            discontinuitySerial: this.placementSerial + 1,
            occupancyPose: this.proposedPlacementOccupancyPose(x, z, headingY, this.probe),
            body: this.dynamicBody(x, z, this.probe.height, headingY, Math.sin(headingY) * speed, Math.cos(headingY) * speed) });
        this.dynamicPlacementBlocked = !clear;
        return clear;
    }
    notifyDynamicPlacement(reason, speed) {
        const didPlace = this.dynamicWorld?.didPlace;
        if (!didPlace)
            return;
        const pose = createPose();
        this.writePose(pose);
        didPlace({ reason, initialSpeedMetresPerSecond: speed, discontinuitySerial: this.placementSerial,
            occupancyPose: detachedOccupancyPose(pose),
            body: this.dynamicBody(this.x, this.z, this.y, this.headingY, Math.sin(this.headingY) * speed, Math.cos(this.headingY) * speed) });
    }
    resolveDynamicCandidate(deltaX, deltaZ, dt, airborne, excess, kind = 'move') {
        const resolver = this.dynamicWorld?.resolveMotion;
        if (!resolver)
            return { deltaX, deltaZ, excess, fraction: 1, blocked: false };
        const previous = kind === 'move' && this.dynamicPrevious ? { ...this.dynamicPrevious }
            : this.dynamicBody(this.x, this.z, airborne ? this.y : this.ground.height, this.headingY, 0, 0);
        const request = { kind, dt, previous,
            proposed: this.dynamicBody(this.x + deltaX, this.z + deltaZ, airborne ? this.y : this.probe.height, this.headingY, kind === 'move' ? deltaX / dt : 0, kind === 'move' ? deltaZ / dt : 0),
            airborne, crashing: this.crashing };
        const result = resolver(request);
        if (kind === 'move')
            this.dynamicIntent = { ...request,
                previous: { ...request.previous }, proposed: { ...request.proposed } };
        if (result === null)
            return { deltaX, deltaZ, excess, fraction: 1, blocked: false };
        if (![result.allowedMoveFraction, result.normalX, result.normalZ,
            result.closingSpeedMetresPerSecond].every(Number.isFinite)
            || result.closingSpeedMetresPerSecond < 0) {
            throw new RangeError('EUC dynamic motion result must contain finite physical numbers');
        }
        const fraction = clamp01(result.allowedMoveFraction);
        const keptX = deltaX * fraction, keptZ = deltaZ * fraction;
        let clippedExcess = excess;
        if (fraction < 1 && (deltaX !== 0 || deltaZ !== 0)) {
            clippedExcess = this.excessAt(keptX, keptZ, airborne);
            const ceiling = airborne ? 0 : this.tuning.maxStepUp;
            if (clippedExcess > ceiling
                || (kind === 'standoff' && Math.abs(this.probe.height - this.ground.height) > this.tuning.maxStepUp)
                || this.obstacleWithinWheelRadius(keptX, keptZ, deltaX, deltaZ)) {
                this.sampler.sampleGround(this.x, this.z, this.probe, this.y);
                if (kind === 'move')
                    this.dynamicIntent = null;
                this.clipDynamicHeading(kind, 0);
                return { deltaX: 0, deltaZ: 0, excess: 0, fraction: 0, blocked: true };
            }
        }
        if (result.chargeImpact !== false) {
            if (result.closingSpeedMetresPerSecond > this.dynamicImpactSpeed) {
                this.dynamicImpactSpeed = result.closingSpeedMetresPerSecond;
                this.vehicleImpact = result.vehicleImpact === true && Number.isFinite(result.crashVelocityX) && Number.isFinite(result.crashVelocityZ);
                this.crashVelocityX = this.vehicleImpact ? result.crashVelocityX : 0;
                this.crashVelocityZ = this.vehicleImpact ? result.crashVelocityZ : 0;
                this.dynamicImpactNormalX = result.normalX;
                this.dynamicImpactNormalZ = result.normalZ;
            }
        }
        this.clipDynamicHeading(kind, fraction);
        return { deltaX: keptX, deltaZ: keptZ, excess: clippedExcess, fraction, blocked: true };
    }
    clipDynamicHeading(kind, fraction) {
        if (kind !== 'move' || fraction >= 1 || !this.dynamicPrevious)
            return;
        this.headingY = lerp(this.dynamicPrevious.headingY, this.headingY, fraction);
        this.yawRate *= fraction;
        this.lateralAccel *= fraction;
        this.styleHeading = lerp(this.dynamicStyleHeadingPrevious, this.styleHeading, fraction);
        if (this.dynamicComeBackApplied > 0)
            this.comeBackTurn += this.dynamicComeBackApplied * (1 - fraction);
        if (this.dynamicSpinApplied > 0) {
            this.spinRemaining += this.dynamicSpinApplied * (1 - fraction);
            if (this.spinRemaining > 0)
                this.spinSwept = false;
        }
    }
    advance(deltaX, deltaZ, dt, speed, airborne) {
        const t = this.tuning;
        this.blocked = false;
        this.lastStepUp = 0;
        this.dynamicImpactSpeed = 0;
        this.vehicleImpact = false;
        this.dynamicImpactNormalX = 0;
        this.dynamicImpactNormalZ = 0;
        const ceiling = airborne ? 0 : t.maxStepUp;
        if (deltaX === 0 && deltaZ === 0) {
            this.sampler.sampleGround(this.x, this.z, this.ground, this.y);
            if (this.dynamicWorld?.resolveMotion) {
                copyGroundSample(this.ground, this.probe);
                const dynamic = this.resolveDynamicCandidate(0, 0, dt, airborne, 0);
                if (dynamic.blocked)
                    this.blocked = true;
            }
            this.applyWallStandoff(dt, airborne);
            return { speed, distance: 0, excess: 0, keptX: 0, keptZ: 0, impactSpeed: this.dynamicImpactSpeed };
        }
        const full = this.excessAt(deltaX, deltaZ, airborne);
        const fullHasClearance = !this.obstacleWithinWheelRadius(deltaX, deltaZ);
        const fullObstacleNarrow = this.lastObstacleNarrow;
        if (full <= ceiling && fullHasClearance) {
            this.obstacleEscapeArmed = false;
            const dynamic = this.resolveDynamicCandidate(deltaX, deltaZ, dt, airborne, full);
            if (dynamic.blocked) {
                this.blocked = true;
                this.obstacleEscapeArmed = true;
            }
            this.commit(dynamic.deltaX, dynamic.deltaZ, true);
            this.applyWallStandoff(dt, airborne);
            let next = speed;
            if (!airborne && dynamic.excess > t.curbThreshold) {
                this.lastStepUp = dynamic.excess;
                const cost = dynamic.excess * t.curbImpactPerMetre;
                next = speed > 0 ? Math.max(0, speed - cost) : Math.min(0, speed + cost);
            }
            if (dynamic.blocked) {
                const intoObstacle = 1 - dynamic.fraction;
                const scrub = t.wallScrubDecel * intoObstacle * intoObstacle * dt;
                next = next > 0 ? Math.max(0, next - scrub) : Math.min(0, next + scrub);
            }
            return {
                speed: next,
                distance: Math.hypot(dynamic.deltaX, dynamic.deltaZ),
                excess: dynamic.excess,
                keptX: dynamic.deltaX,
                keptZ: dynamic.deltaZ,
                impactSpeed: this.dynamicImpactSpeed,
            };
        }
        this.blocked = true;
        if (!fullHasClearance)
            this.obstacleEscapeArmed = true;
        const excessAlongX = this.excessAt(deltaX, 0, airborne);
        const excessAlongZ = this.excessAt(0, deltaZ, airborne);
        const clearAlongX = !fullObstacleNarrow && excessAlongX <= ceiling
            && !this.obstacleWithinWheelRadius(deltaX, 0, deltaX, deltaZ);
        const clearAlongZ = !fullObstacleNarrow && excessAlongZ <= ceiling
            && !this.obstacleWithinWheelRadius(0, deltaZ, deltaX, deltaZ);
        let slideX = 0;
        let slideZ = 0;
        let slideExcess = 0;
        if (clearAlongX) {
            slideX = deltaX;
            slideExcess = excessAlongX;
        }
        else if (clearAlongZ) {
            slideZ = deltaZ;
            slideExcess = excessAlongZ;
        }
        if (this.dynamicWorld?.resolveMotion) {
            if (slideX === 0 && slideZ === 0)
                this.sampler.sampleGround(this.x, this.z, this.probe, this.y);
            else
                slideExcess = this.excessAt(slideX, slideZ, airborne);
            const dynamic = this.resolveDynamicCandidate(slideX, slideZ, dt, airborne, slideExcess);
            slideX = dynamic.deltaX;
            slideZ = dynamic.deltaZ;
            slideExcess = dynamic.excess;
        }
        if (slideX === 0 && slideZ === 0) {
            this.sampler.sampleGround(this.x, this.z, this.ground, this.y);
        }
        else {
            this.commit(slideX, slideZ, false);
        }
        this.applyWallStandoff(dt, airborne);
        const length = Math.hypot(deltaX, deltaZ);
        const kept = Math.hypot(slideX, slideZ);
        const intoWall = length > 0 ? clamp01(1 - kept / length) : 1;
        const scrub = t.wallScrubDecel * intoWall * intoWall * dt;
        const next = speed > 0 ? Math.max(0, speed - scrub) : Math.min(0, speed + scrub);
        return {
            speed: next,
            distance: kept,
            excess: slideExcess,
            keptX: slideX,
            keptZ: slideZ,
            impactSpeed: Math.max(airborne && fullHasClearance ? 0 : Math.abs(speed) * intoWall, this.dynamicImpactSpeed),
        };
    }
    applyWallStandoff(dt, airborne) {
        if (this.collectingNeutralStep)
            return;
        const t = this.tuning;
        const standoff = t.wallStandoff;
        const raycastObstacle = this.sampler.raycastWheelObstacle ?? this.sampler.raycastObstacle;
        if (airborne || standoff <= 0 || raycastObstacle === undefined)
            return;
        const originY = this.y + t.maxStepUp + 1e-6;
        const leftX = Math.cos(this.headingY);
        const leftZ = -Math.sin(this.headingY);
        this.standoffOrigin.x = this.x;
        this.standoffOrigin.y = originY;
        this.standoffOrigin.z = this.z;
        this.standoffRay.x = leftX;
        this.standoffRay.z = leftZ;
        const left = raycastObstacle.call(this.sampler, this.standoffOrigin, this.standoffRay, standoff);
        this.standoffRay.x = -leftX;
        this.standoffRay.z = -leftZ;
        const right = raycastObstacle.call(this.sampler, this.standoffOrigin, this.standoffRay, standoff);
        if (left === null && right === null)
            return;
        const shortLeft = left === null ? 0 : standoff - left;
        const shortRight = right === null ? 0 : standoff - right;
        let push = shortRight - shortLeft;
        const cap = t.wallStandoffRate * dt;
        if (push > cap)
            push = cap;
        else if (push < -cap)
            push = -cap;
        if (push === 0)
            return;
        const nextX = this.x + leftX * push;
        const nextZ = this.z + leftZ * push;
        this.sampler.sampleGround(nextX, nextZ, this.probe, this.y);
        if (Math.abs(this.probe.height - this.ground.height) > t.maxStepUp)
            return;
        if (this.dynamicWorld?.resolveMotion) {
            const dynamic = this.resolveDynamicCandidate(leftX * push, leftZ * push, dt, false, this.probe.height - this.ground.height, 'standoff');
            if (dynamic.blocked)
                this.blocked = true;
            if (dynamic.deltaX === 0 && dynamic.deltaZ === 0)
                return;
            this.x += dynamic.deltaX;
            this.z += dynamic.deltaZ;
        }
        else {
            this.x = nextX;
            this.z = nextZ;
        }
        copyGroundSample(this.probe, this.ground);
        this.blocked = true;
    }
    obstacleWithinWheelRadius(deltaX, deltaZ, envelopeDeltaX = deltaX, envelopeDeltaZ = deltaZ) {
        const raycastObstacle = this.sampler.raycastWheelObstacle ?? this.sampler.raycastObstacle;
        this.lastObstacleNarrow = false;
        if (raycastObstacle === undefined)
            return false;
        const horizontal = Math.hypot(deltaX, deltaZ);
        if (horizontal === 0)
            return false;
        const normal = this.ground.normal;
        let rise = normal.y > 1e-4
            ? -(normal.x * deltaX + normal.z * deltaZ) / normal.y
            : 0;
        if (rise < 0 && this.sampler.transitionAt?.(this.x, this.z, this.y) === true)
            rise = 0;
        const distance = Math.hypot(deltaX, rise, deltaZ) + this.tuning.wheelRadius;
        const hit = raycastObstacle.call(this.sampler, {
            x: this.x,
            y: this.y + this.tuning.maxStepUp + 1e-6,
            z: this.z,
        }, { x: deltaX, y: rise, z: deltaZ }, distance, this.tuning.pedalHalfSpan, { x: -envelopeDeltaZ, y: 0, z: envelopeDeltaX }, this.obstacleHit);
        if (hit !== null) {
            this.lastObstacleNarrow = Math.max(this.obstacleHit.halfExtentX, this.obstacleHit.halfExtentZ) <= this.tuning.pedalHalfSpan;
        }
        return hit !== null && hit <= distance;
    }
    excessAt(deltaX, deltaZ, airborne = false) {
        this.sampler.sampleGround(this.x + deltaX, this.z + deltaZ, this.probe, this.y);
        if (airborne)
            return this.probe.height - this.y;
        const normal = this.ground.normal;
        const predicted = normal.y > 1e-4
            ? -(normal.x * deltaX + normal.z * deltaZ) / normal.y
            : 0;
        return this.probe.height - (this.y - this.launchPadRise) - predicted;
    }
    commit(deltaX, deltaZ, fromProbe) {
        this.x += deltaX;
        this.z += deltaZ;
        if (fromProbe)
            copyGroundSample(this.probe, this.ground);
        else
            this.sampler.sampleGround(this.x, this.z, this.ground, this.y);
    }
    writeGroundTilt(dt) {
        const t = this.tuning;
        const { pitch: targetPitch, roll: targetRoll } = groundTiltTarget(this.ground.normal, this.headingY, t);
        if (dt >= 1) {
            this.groundPitch = targetPitch;
            this.groundRoll = targetRoll;
            return;
        }
        this.groundPitch = approach(this.groundPitch, targetPitch, t.groundTiltResponseSeconds, Infinity, dt);
        this.groundRoll = approach(this.groundRoll, targetRoll, t.groundTiltResponseSeconds, Infinity, dt);
    }
    stepSuspension(dt, response) {
        const t = this.tuning;
        const preload = this.airborne ? 0 : this.crouch * t.suspensionPreload;
        const input = roughnessAt(this.x, this.z, response.roughnessAmplitude, response.roughnessWavelength) - preload;
        const omega = 2 * Math.PI * t.suspensionFrequencyHz;
        const acceleration = -omega * omega * (this.suspensionOffset - input)
            - 2 * t.suspensionDamping * omega * this.suspensionVelocity;
        this.suspensionVelocity += acceleration * dt;
        this.suspensionOffset += this.suspensionVelocity * dt;
        const travel = t.suspensionTravel;
        if (this.suspensionOffset > travel) {
            this.suspensionOffset = travel;
            if (this.suspensionVelocity > 0)
                this.suspensionVelocity = 0;
        }
        else if (this.suspensionOffset < -travel) {
            this.suspensionOffset = -travel;
            if (this.suspensionVelocity < 0)
                this.suspensionVelocity = 0;
        }
        this.suspensionCompression = input - this.suspensionOffset;
    }
    readFeeler(forwardX, forwardZ) {
        const distance = this.tuning.feelerDistance;
        const deltaX = forwardX * distance;
        const deltaZ = forwardZ * distance;
        const excess = this.excessAt(deltaX, deltaZ);
        this.curbAhead = Math.abs(excess) > this.tuning.curbThreshold ? excess : 0;
    }
    stepHop(dt, actions) {
        const t = this.tuning;
        const requested = actions.hop && !this.hopWasHeld;
        this.hopWasHeld = actions.hop;
        if (this.airborne) {
            if (requested && this.canAcceptSpin) {
                this.spinArmed = true;
                this.spinRemaining = Math.PI;
                this.spinDirection = actions.steer >= t.spinSteerThreshold
                    ? -1
                    : 1;
                if (this.comeBackTurn > 0)
                    this.spinDirection = this.comeBackDirection;
                this.spinsCount += 1;
            }
            this.compressTimer = 0;
            this.compressing = false;
            this.crouchHold = 0;
            return;
        }
        if (this.compressing) {
            this.compressTimer = Math.max(0, this.compressTimer - dt);
            if (this.compressTimer === 0)
                this.launchHop(actions.steer);
            return;
        }
        if (requested) {
            this.hopCharge = clamp01(this.crouchHold / Math.max(1e-6, t.hopChargeSeconds));
            this.compressing = true;
            this.compressTimer = t.hopCompressSeconds;
            this.crouchHold = 0;
            if (this.compressTimer <= 0)
                this.launchHop(actions.steer);
            return;
        }
        if (actions.crouch) {
            this.crouchHold = Math.min(this.crouchHold + dt, t.hopChargeSeconds);
        }
        else {
            this.crouchHold = 0;
        }
    }
    launchHop(steer) {
        const t = this.tuning;
        const launch = t.hopLaunchSpeed * Math.sqrt(1 + t.hopChargeHeightBonus * this.hopCharge);
        const forwardX = Math.sin(this.headingY);
        const forwardZ = Math.cos(this.headingY);
        const sense = this.speed < 0 ? -1 : 1;
        if (this.sampler.transitionAt !== undefined
            && Math.abs(this.speed) >= SKATE_TRANSITION.comeBackMinSpeed
            && (this.comeBackClimb > 0 || this.ground.normal.y < COME_BACK_NORMAL_Y)
            && this.updateComeBackClimb(forwardX * sense, forwardZ * sense)) {
            this.startComeBack(forwardX * sense, forwardZ * sense, this.speed, launch + Math.abs(this.speed) * this.comeBackClimb, clamp(safeAxis(steer), -1, 1));
        }
        else {
            this.leaveGround(this.y, this.transitionHop(launch, this.speed, this.speed * Math.sin(this.slope)), 0, 0);
        }
        this.compressing = false;
        this.compressTimer = 0;
        this.crouchHold = 0;
        this.hops += 1;
        this.justHopped = true;
        this.suspensionVelocity += launch * t.hopSuspensionRebound;
    }
    stepLaunchPad(speed, travelX, travelZ, dt, riding) {
        const pads = this.launchPads;
        if (pads.count === 0)
            return;
        const index = pads.at(this.x, this.z);
        if (index >= 0) {
            if (this.launchPadsArmed && !this.launchPadLatch && this.launchPadRearmMetres <= 0
                && !this.crashing && Math.abs(speed) >= LAUNCH_PAD.minimumLaunchSpeed) {
                this.leaveGround(this.groundY, this.launchPadTakeoffSpeed(speed, pads.dropAt(index) + this.launchPadRise), travelX, travelZ);
                this.justPadLaunched = true;
            }
            this.launchPadLatch = true;
            return;
        }
        if (!pads.inFootprint(this.x, this.z)) {
            this.launchPadLatch = false;
            if (riding || !this.launchPadRearmRidden) {
                this.launchPadRearmMetres = Math.max(0, this.launchPadRearmMetres - Math.abs(speed) * dt);
            }
        }
    }
    launchPadTakeoffSpeed(speed, dropMetres) {
        const reach = LAUNCH_PAD.maximumFlightMetres;
        const v = Math.max(Math.abs(speed), LAUNCH_PAD.minimumLaunchSpeed);
        return Math.min(this.launchPadVerticalSpeed, (this.tuning.gravity * reach) / (2 * v) - (dropMetres * v) / reach);
    }
    leaveGround(fromY, verticalVelocity, directionX, directionZ) {
        const length = Math.hypot(directionX, directionZ);
        if (length > 1e-9) {
            this.airDirX = directionX / length;
            this.airDirZ = directionZ / length;
        }
        else {
            this.airDirX = Math.sin(this.headingY);
            this.airDirZ = Math.cos(this.headingY);
        }
        this.y = fromY;
        this.verticalVelocity = verticalVelocity;
        this.airborne = true;
        this.grounded = false;
        this.airTime = 0;
        this.airApex = 0;
        this.justTookOff = true;
        this.spinSwept = false;
        this.flights += 1;
        this.comeBackFlight = false;
        this.comeBackTurn = 0;
        this.wallTurnSeconds = 0;
        this.comeBackClimb = 0;
        this.kickRise = 0;
        this.kickOnTop = false;
        this.flaggedSlopeRun = Infinity;
    }
    land(speed, response) {
        const t = this.tuning;
        const normal = this.ground.normal;
        const forwardX = Math.sin(this.headingY);
        const forwardZ = Math.cos(this.headingY);
        const velocityX = speed * this.airDirX;
        const velocityZ = speed * this.airDirZ;
        const impact = Math.max(0, -(velocityX * normal.x + this.verticalVelocity * normal.y + velocityZ * normal.z));
        const alignment = clamp(this.airDirX * forwardX + this.airDirZ * forwardZ, -1, 1);
        const misalignment = this.spinArmed
            ? Math.abs(Math.PI - Math.acos(alignment))
            : Math.acos(alignment);
        const score = impact / Math.max(1e-6, t.landingImpactReference)
            + misalignment / Math.max(1e-6, t.landingMisalignReference)
            + t.landingSurfaceWeight
                * (response.roughnessAmplitude / Math.max(1e-6, t.landingRoughnessReference));
        const loss = clamp((score - t.landingHeavyScore) * t.landingSpeedLossPerScore, 0, t.landingMaxSpeedLoss);
        this.landingQuality = score >= t.landingCrashScore
            ? 'crash'
            : score >= t.landingWobbleScore
                ? 'wobble'
                : score >= t.landingHeavyScore
                    ? 'heavy'
                    : 'clean';
        this.landingImpact = impact;
        this.landingMisalignment = misalignment;
        this.landingScore = score;
        this.landingSpeedLoss = loss;
        this.landings += 1;
        this.landingTimer = t.landingStateSeconds;
        this.justTouchedDown = true;
        this.y = this.groundY;
        this.verticalVelocity = 0;
        this.airborne = false;
        this.grounded = true;
        this.airTime = 0;
        this.airApex = 0;
        this.suspensionVelocity -= impact * t.landingSuspensionKick;
        this.absorb = clamp01(impact / Math.max(1e-6, t.landingImpactReference));
        this.landingLoad = Math.min(this.landingLoad + (impact / Math.max(1e-6, t.landingImpactReference)) * t.powerLandingLoad, t.powerLandingLoad * 2);
        const landed = speed * alignment * (1 - loss);
        if (this.spinArmed) {
            this.reversing = landed < -t.stoppedSpeed;
            this.spinArmed = false;
            this.spinRemaining = 0;
        }
        return landed;
    }
    updatePedalStrike(airborne) {
        const t = this.tuning;
        const previous = this.pedalStrike;
        this.pedalClearance = Math.atan2(t.pedalHeight, t.pedalHalfSpan);
        const overlap = Math.abs(this.rollAngle) - this.pedalClearance - t.pedalStrikeGraceAngle;
        if (airborne || overlap <= 0) {
            this.pedalStrike = 0;
            return;
        }
        this.pedalStrike = this.rollAngle > 0 ? overlap : -overlap;
        if (previous === 0)
            this.suspensionVelocity += t.pedalStrikeJolt;
    }
    stepCrouch(dt, actions) {
        const t = this.tuning;
        const heldOnGround = !this.airborne && actions.crouch;
        const heldCompression = !this.compressing && heldOnGround;
        const target = this.compressing
            ? 1
            : this.airborne
                ? t.airTuck
                : heldCompression
                    ? t.crouchHeldAmount
                    : 0;
        this.crouch = approach(this.crouch, target, t.crouchResponseSeconds, Infinity, dt);
        this.absorb = approach(this.absorb, 0, t.landingAbsorbSeconds, Infinity, dt);
        this.tuck = approach(this.tuck, heldOnGround ? 1 : 0, t.crouchResponseSeconds, Infinity, dt);
    }
    stepRidingStances(dt, throttle) {
        const t = this.tuning;
        const riding = !this.airborne && this.crashBlend <= 0 && this.reverseBlend <= 0;
        const driving = riding && throttle >= t.attackThrottle && this.speed >= t.attackSpeed;
        this.attackHold = driving ? this.attackHold + dt : 0;
        const charged = clamp01((this.attackHold - t.attackDelaySeconds) / Math.max(1e-6, t.attackRampSeconds));
        this.attack = approach(this.attack, driving ? charged : 0, t.attackResponseSeconds, Infinity, dt);
        const hard = clamp01((Math.abs(this.rollAngle) - t.carveStanceRoll)
            / Math.max(1e-6, t.carveStanceFullRoll - t.carveStanceRoll));
        const fast = clamp01((this.speed - t.carveStanceSpeed)
            / Math.max(1e-6, t.carveStanceFullSpeed - t.carveStanceSpeed));
        this.carveStance = approach(this.carveStance, riding ? hard * fast : 0, t.carveStanceResponseSeconds, Infinity, dt);
    }
    surfaceResponse() {
        return this.surfaces[this.traction] ?? this.surfaces.pavement;
    }
    get tookOff() {
        return this.justTookOff;
    }
    get hopped() {
        return this.justHopped;
    }
    get padLaunched() {
        return this.justPadLaunched;
    }
    get canAcceptHop() {
        return !this.airborne && !this.compressing && !this.crashing;
    }
    get canAcceptSpin() {
        return this.airborne && !this.crashing && !this.spinArmed && this.verticalVelocity > 0;
    }
    get spinCompleted() {
        return this.spinSwept;
    }
    get isGrounded() { return this.grounded; }
    get crashed() {
        return this.crashing;
    }
    get stumbleCount() {
        return this.stumbles;
    }
    get touchedDown() {
        return this.justTouchedDown;
    }
    get lastLandingImpact() {
        return this.landingImpact;
    }
    get lastLandingQuality() {
        return this.landingQuality;
    }
    get pedalStrikeDepth() {
        return this.pedalStrike;
    }
    get currentSurface() {
        return this.surface;
    }
    get curbHeightAhead() {
        return this.curbAhead;
    }
    get lateralLimit() {
        return this.lateralLimitG;
    }
    get groundClearance() {
        return this.y - this.groundY;
    }
    get verticalRate() {
        return this.verticalVelocity;
    }
    get secondsToTouchdown() {
        if (this.crashing || !this.airborne)
            return 0;
        const gravity = this.tuning.gravity;
        if (!(gravity > 0))
            return Infinity;
        const height = Math.max(0, this.y - this.groundY);
        const normal = this.ground.normal;
        const gradient = normal.y > 1e-4
            ? -(normal.x * this.airDirX + normal.z * this.airDirZ) / normal.y
            : 0;
        const rate = this.verticalVelocity - Math.abs(this.speed) * gradient;
        return (rate + Math.sqrt(rate * rate + 2 * gravity * height)) / gravity;
    }
    get flightIndex() {
        return this.flights;
    }
    jolt(velocity) {
        if (!Number.isFinite(velocity))
            return;
        this.invalidatePreparedStep();
        this.suspensionVelocity += velocity;
    }
    shedSpeed(metresPerSecond) {
        if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0)
            return;
        this.invalidatePreparedStep();
        this.speed = this.speed >= 0
            ? Math.max(0, this.speed - metresPerSecond)
            : Math.min(0, this.speed + metresPerSecond);
    }
    bump(pushX, pushZ, speedCost) {
        if (this.crashing || this.invulnerableTimer > 0)
            return;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('bump', working => working.bump(pushX, pushZ, speedCost), undefined);
        this.invalidatePreparedStep();
        const forwardX = Math.sin(this.headingY);
        const forwardZ = Math.cos(this.headingY);
        this.speed += pushX * forwardX + pushZ * forwardZ;
        this.softKnock(speedCost);
    }
    separate(deltaX, deltaZ) {
        if (this.crashing)
            return;
        if (deltaX === 0 && deltaZ === 0)
            return;
        if (this.sampler.transitionAt?.(this.x, this.z, this.y) === true && !this.airborne
            && (this.comeBackClimb > 0 || this.ground.normal.y < COME_BACK_NORMAL_Y)
            && this.sampler.transitionAt(this.x + deltaX, this.z + deltaZ, this.y) !== true)
            return;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('separate', working => working.separate(deltaX, deltaZ), undefined);
        this.invalidatePreparedStep();
        const nextX = this.x + deltaX;
        const nextZ = this.z + deltaZ;
        this.sampler.sampleGround(nextX, nextZ, this.probe, this.y);
        if (Math.abs(this.probe.height - this.ground.height) > this.tuning.maxStepUp)
            return;
        this.x = nextX;
        this.z = nextZ;
        copyGroundSample(this.probe, this.ground);
    }
    softKnock(speedCost) {
        if (this.crashed)
            return;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('softKnock', working => working.softKnock(speedCost), undefined);
        this.invalidatePreparedStep();
        this.injectWobble(this.tuning.softBodyWobbleEnergy);
        this.shedSpeed(speedCost);
    }
    hardKnock(travelX, travelZ) {
        if (this.crashing || this.invulnerableTimer > 0)
            return false;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('hardKnock', working => working.hardKnock(travelX, travelZ), false);
        this.invalidatePreparedStep();
        const lateral = travelX * Math.cos(this.headingY) - travelZ * Math.sin(this.headingY);
        const side = lateral > 0 ? 1 : lateral < 0 ? -1 : 0;
        this.beginCrash('struck', this.speed, side);
        return true;
    }
    respondToHeldPhysicalContact(token, held = HELD_CONTACT_YIELD) {
        if (held.reason === 'placement')
            return this.respondToRefusedRecovery(token);
        if (this.crashing)
            return this.respondToHeldPhysicalSettlement(token, held);
        if (held.pending && this.awaitContactProof(token))
            return { admitted: true, inputAdvanced: false };
        if (this.airborne)
            return this.respondToHeldPhysicalSettlement(token, held);
        const record = PREPARED_CONTROLLER_STEPS.get(token);
        if (!record || record.owner !== this || !record.committed || !record.held || record.published || record.contactResponded) {
            throw new Error('EUC contact response needs its unpublished committed held token exactly once');
        }
        record.contactResponded = true;
        const response = this.respondToGroundedContact(record, held);
        if (!response.inputAdvanced)
            this.recordContactHold(false);
        return response;
    }
    respondToGroundedContact(record, held) {
        const braking = record.actions.throttle < -0.01 && !record.actions.hop && !this.crashing && !this.airborne;
        const actions = Object.freeze({ ...record.actions, steer: 0 });
        const integrate = (working) => working.stepContactBrakingRelease(record.dt, actions);
        const advanceInput = () => this.dynamicWorld?.canReact
            ? this.admitPhysicalReaction('contactInput', integrate, false, result => result) : integrate(this);
        const rider = held.occupantKind === 'human';
        if (rider && held.met && this.contactClosingSpeed(held) >= this.tuning.obstacleCrashSpeed
            && this.crashFromPhysicalContact(held))
            return { admitted: true, inputAdvanced: false };
        if (braking && this.reversing && this.speed < 0 && advanceInput())
            return { admitted: true, inputAdvanced: true };
        const move = record.motionRequests.find(request => request.kind === 'move');
        const moveX = move ? move.proposed.x - move.previous.x : 0, moveZ = move ? move.proposed.z - move.previous.z : 0;
        const into = moveX * held.normalX + moveZ * held.normalZ;
        const headOn = into < 0 && headOnTravel(Math.hypot(moveX - into * held.normalX, moveZ - into * held.normalZ), Math.hypot(moveX, moveZ));
        const normals = [{ x: held.normalX, z: held.normalZ }, ...(headOn ? [] : [{ x: held.faceX ?? held.normalX, z: held.faceZ ?? held.normalZ }])]
            .filter((normal, index, all) => (normal.x !== 0 || normal.z !== 0) && (index === 0 || normal.x !== all[0].x || normal.z !== all[0].z));
        for (const normal of normals)
            for (const standoff of rider ? POPULATION_CONTACT.slideStandoffMetres : [0]) {
                const slide = (working) => working.stepContactSlide(record.dt, record.actions, normal.x, normal.z, rider, standoff);
                if (this.dynamicWorld?.canReact ? this.admitPhysicalReaction('contactInput', slide, false, result => result) : slide(this)) {
                    return { admitted: true, inputAdvanced: true };
                }
            }
        const admitted = rider && !braking ? this.scrubPhysicalContact(held, record.dt) : this.yieldPhysicalContact();
        if (!admitted)
            return { admitted, inputAdvanced: false };
        if (braking)
            return { admitted, inputAdvanced: advanceInput() };
        const pivot = Object.freeze({ ...record.actions, throttle: 0, hop: false });
        const turn = (working) => working.stepContactPivot(record.dt, pivot);
        const tryTurn = () => this.dynamicWorld?.canReact ? this.admitPhysicalReaction('contactInput', turn, false, result => result) : turn(this);
        const backX = held.normalX * POPULATION_CONTACT.pivotBackOffMetres, backZ = held.normalZ * POPULATION_CONTACT.pivotBackOffMetres;
        const back = (working) => working.stepContactBackOff(backX, backZ);
        const tryBack = () => (backX !== 0 || backZ !== 0)
            && (this.dynamicWorld?.canReact ? this.admitPhysicalReaction('contactInput', back, false, result => result) : back(this));
        const turned = rider && this.speed === 0 && Math.abs(record.actions.steer) > 0.01 && (tryTurn() || (tryBack() && tryTurn()));
        return { admitted, inputAdvanced: turned };
    }
    physicalContactReachable(token, fraction) {
        const record = PREPARED_CONTROLLER_STEPS.get(token), move = record?.motionRequests.find(request => request.kind === 'move');
        if (!record || record.owner !== this || !move || this.crashing || this.airborne)
            return true;
        const t = this.tuning, deltaX = (move.proposed.x - move.previous.x) * fraction, deltaZ = (move.proposed.z - move.previous.z) * fraction;
        const ground = createGroundSample(), length = Math.hypot(deltaX, deltaZ);
        for (let i = 1, samples = Math.min(64, Math.ceil(length / 0.05)); i <= samples; i += 1) {
            this.sampler.sampleGround(this.x + deltaX * i / samples, this.z + deltaZ * i / samples, ground, this.y);
            if (ground.height - this.ground.height > t.maxStepUp)
                return false;
        }
        const raycastObstacle = this.sampler.raycastObstacle;
        if (length === 0 || raycastObstacle === undefined)
            return true;
        return raycastObstacle.call(this.sampler, { x: this.x, y: this.y + t.maxStepUp + 1e-6, z: this.z }, { x: deltaX, y: 0, z: deltaZ }, length, t.pedalHalfSpan) === null;
    }
    stepContactBackOff(deltaX, deltaZ) {
        if (this.crashing || this.airborne)
            return false;
        this.invalidatePreparedStep();
        this.sampler.sampleGround(this.x + deltaX, this.z + deltaZ, this.probe, this.y);
        if (Math.abs(this.probe.height - this.ground.height) > this.tuning.maxStepUp || this.probe.offCourse
            || this.obstacleWithinWheelRadius(deltaX, deltaZ))
            return false;
        this.x += deltaX;
        this.z += deltaZ;
        copyGroundSample(this.probe, this.ground);
        return true;
    }
    contactClosingSpeed(held) {
        const into = -Math.sign(this.speed) * (Math.sin(this.headingY) * held.normalX + Math.cos(this.headingY) * held.normalZ);
        return into > 0 ? Math.abs(this.speed) * into : 0;
    }
    crashFromPhysicalContact(held) {
        if (this.crashing || this.airborne || this.invulnerableTimer > 0)
            return false;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('contactYield', working => working.crashFromPhysicalContact(held), false);
        this.invalidatePreparedStep();
        const side = Math.sign(held.normalX * Math.cos(this.headingY) - held.normalZ * Math.sin(this.headingY));
        this.collisionImpact = this.contactClosingSpeed(held);
        this.blocked = true;
        this.beginCrash('obstacle', this.speed, side, 'faceplant', this.tuning.ragdollLaunchSide);
        return true;
    }
    scrubPhysicalContact(held, dt) {
        if (this.crashing || this.airborne)
            return false;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('contactYield', working => working.scrubPhysicalContact(held, dt), false);
        this.invalidatePreparedStep();
        const impact = this.contactClosingSpeed(held);
        if (impact > 0 || !held.met)
            this.shedSpeed(this.tuning.wallScrubDecel * dt);
        this.blocked = true;
        this.obstacleEscapeArmed = true;
        this.collisionImpact = held.met ? impact : 0;
        return true;
    }
    stepContactSlide(dt, actions, normalX, normalZ, slide, standoff) {
        if (this.crashing || this.airborne)
            return false;
        const x = this.x, z = this.z;
        this.step(dt, actions);
        if (this.crashing || this.airborne)
            return false;
        const deltaX = this.x - x, deltaZ = this.z - z, length = Math.hypot(deltaX, deltaZ), along = deltaX * normalX + deltaZ * normalZ;
        if (length === 0)
            return false;
        if (along >= 0)
            return true;
        if (!slide)
            return false;
        const tangent = Math.hypot(deltaX - along * normalX, deltaZ - along * normalZ);
        if (headOnTravel(tangent, length))
            return false;
        const height = this.ground.height;
        const blockedOut = (deltaX, deltaZ) => {
            this.sampler.sampleGround(this.x + deltaX, this.z + deltaZ, this.probe, this.y);
            return Math.abs(this.probe.height - height) > this.tuning.maxStepUp || this.probe.offCourse !== this.ground.offCourse
                || this.obstacleWithinWheelRadius(deltaX, deltaZ);
        };
        let out = standoff - along;
        if (blockedOut(out * normalX, out * normalZ)) {
            out = -along;
            if (blockedOut(out * normalX, out * normalZ))
                return false;
        }
        const backX = out * normalX, backZ = out * normalZ;
        this.sampler.sampleGround(this.x + backX, this.z + backZ, this.probe, this.y);
        this.commit(backX, backZ, true);
        this.y += this.ground.height - height;
        this.groundY = this.ground.height;
        const forwardX = Math.sin(this.headingY), forwardZ = Math.cos(this.headingY);
        this.wheelSpin += (backX * forwardX + backZ * forwardZ) / this.tuning.wheelRadius;
        this.distanceTravelled += Math.hypot(this.x - x, this.z - z) - length;
        const into = Math.max(0, 1 - tangent / length);
        const scrub = this.tuning.wallScrubDecel * into * into * dt;
        this.speed = this.speed > 0 ? Math.max(0, this.speed - scrub) : Math.min(0, this.speed + scrub);
        this.blocked = true;
        this.obstacleEscapeArmed = true;
        return this.x !== x || this.z !== z;
    }
    awaitContactProof(token) {
        const record = PREPARED_CONTROLLER_STEPS.get(token);
        if (!record || record.owner !== this || !record.committed || !record.held || record.published || record.contactResponded) {
            throw new Error('EUC contact response needs its unpublished committed held token exactly once');
        }
        if (this.contactHeldSeconds(record.dt) + record.dt > POPULATION_CONTACT.holdWatchdogSeconds + 1e-9)
            return false;
        record.contactResponded = true;
        this.invalidatePreparedStep();
        this.recordContactHold(true);
        return true;
    }
    recordContactHold(held) {
        this.contactHoldMaskOlder = ((this.contactHoldMaskOlder << 1) | (this.contactHoldMask >>> 29)) & 0x3fffffff;
        this.contactHoldMask = ((this.contactHoldMask << 1) | (held ? 1 : 0)) & 0x3fffffff;
    }
    contactHeldSeconds(dt) {
        return (heldStepCount(this.contactHoldMask) + heldStepCount(this.contactHoldMaskOlder)) * dt;
    }
    stepContactPivot(dt, actions) {
        if (this.crashing || this.airborne || this.speed !== 0)
            return false;
        const headingY = this.headingY;
        this.step(dt, actions);
        return !this.crashing && !this.airborne && this.headingY !== headingY;
    }
    stepContactBrakingRelease(dt, actions) {
        if (this.crashing || this.airborne || this.speed > 0 || (this.speed < 0 && !this.reversing))
            return false;
        this.contactBrakingConstraint = true;
        try {
            this.step(dt, actions);
        }
        finally {
            this.contactBrakingConstraint = false;
        }
        return !this.crashing && !this.airborne;
    }
    settlePhysicalContact() {
        if (!this.crashing && !this.airborne)
            return false;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('contactSettle', working => working.settlePhysicalContact(), false);
        this.invalidatePreparedStep();
        this.speed = 0;
        this.wheelCrashSpinRate = 0;
        if (this.ragdolling)
            this.ragdoll.constrainHorizontalContactVelocity();
        this.blocked = true;
        this.collisionImpact = 0;
        return true;
    }
    respondToHeldPhysicalSettlement(token, held) {
        const record = PREPARED_CONTROLLER_STEPS.get(token);
        if (!record || record.owner !== this || !record.committed || !record.held || record.published || record.contactResponded) {
            throw new Error('EUC settlement response needs its unpublished committed held token exactly once');
        }
        record.contactResponded = true;
        if (this.crashing)
            return { admitted: true, inputAdvanced: this.advanceNativeContactFall(record) || this.advanceNativeContactFall(record, undefined, false) };
        if (this.advanceNativeContactFall(record))
            return { admitted: true, inputAdvanced: true };
        if (held.reason === 'contact' && !held.pending && held.occupantKind === 'human'
            && this.contactClosingSpeed(held) >= this.tuning.obstacleCrashSpeed && this.crashFromAirContact(held)) {
            return { admitted: true, inputAdvanced: false };
        }
        const admitted = this.settlePhysicalContact();
        if (admitted && this.advanceNativeContactFall(record))
            return { admitted, inputAdvanced: true };
        const neutral = Object.freeze({ ...record.actions, throttle: 0, steer: 0 });
        if (admitted && this.advanceNativeContactFall(record, working => { working.step(record.dt, neutral); return true; })) {
            return { admitted, inputAdvanced: true };
        }
        this.invalidatePreparedStep();
        this.recordContactHold(true);
        if (this.contactHeldSeconds(record.dt) >= POPULATION_CONTACT.holdWatchdogSeconds - 1e-9)
            this.bailFromHeldAir(held);
        return { admitted, inputAdvanced: false };
    }
    bailFromHeldAir(held) {
        this.invalidatePreparedStep();
        this.collisionImpact = 0;
        this.blocked = true;
        this.crashInAir(held.normalX, held.normalZ, 'sideFall', 0);
        this.wheelCrashPopVelocity = 0;
    }
    crashFromAirContact(held) {
        if (this.crashing || !this.airborne || this.invulnerableTimer > 0)
            return false;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('contactYield', working => working.crashFromAirContact(held), false);
        this.invalidatePreparedStep();
        this.collisionImpact = this.contactClosingSpeed(held);
        this.blocked = true;
        this.crashInAir(held.normalX, held.normalZ, 'faceplant', this.tuning.ragdollLaunchSide);
        return true;
    }
    crashInAir(normalX, normalZ, motion, glance, speed = this.speed) {
        const side = Math.sign(normalX * Math.cos(this.headingY) - normalZ * Math.sin(this.headingY));
        const height = Math.max(0, this.y - this.ground.height);
        const bodies = this.dynamicWorld?.ragObstacleBodies?.() ?? this.dynamicWorld?.ragObstacles ?? [];
        const hung = bodies.length ? createPose() : null;
        if (hung)
            this.writePose(hung);
        this.beginCrash('obstacle', speed, side, motion, glance, this.ground.height + height);
        this.settleGroundY();
        this.y = this.groundY;
        this.wheelCrashPop = height;
        const clear = hung && proposeWheelClearOfBodies(hung, bodies, RIDER_CONTACT, POPULATION.contactSkinMetres + POPULATION.nativePhaseRetryReserveMetres);
        if (hung && clear && (clear.x !== 0 || clear.z !== 0))
            this.projectCrashWheelSideContact(hung, clear);
    }
    respondToRefusedRecovery(token) {
        const record = PREPARED_CONTROLLER_STEPS.get(token);
        if (!record || record.owner !== this || !record.committed || !record.held || record.published || record.contactResponded) {
            throw new Error('EUC recovery response needs its unpublished committed held token exactly once');
        }
        record.contactResponded = true;
        this.recordContactHold(false);
        if (!this.crashing || !record.placementRequests.some(request => request.reason === 'recover'))
            return { admitted: false, inputAdvanced: false };
        this.invalidatePreparedStep();
        this.recoveryRefusedSeconds += record.dt;
        if (this.recoveryRefusedSeconds < POPULATION_CONTACT.recoveryFallbackSeconds)
            return { admitted: true, inputAdvanced: false };
        return { admitted: true, inputAdvanced: this.advanceNativeContactFall(record, working => working.respawn()) };
    }
    nativePhaseRetryReserveMetres = 0;
    advanceNativeContactFall(record, integrate = working => { working.step(record.dt, record.actions); return true; }, admit = true) {
        let working = this.reactionController;
        if (!working) {
            working = new EucController(this.sampler, {
                hazards: this.hazards, softBodies: this.softBodies, launchPads: this.launchPads,
            });
            working.style = { ...this.style };
            this.reactionController = working;
        }
        working.copyStepConfigurationFrom(this);
        working.copyMutableStateFrom(this);
        const world = this.dynamicWorld, placements = [], notifications = [];
        let placementDenied = false;
        working.dynamicWorld = world ? {
            hull: { ...world.hull }, ragObstacles: world.ragObstacles, ragObstacleBodies: world.ragObstacleBodies, crashObstacleBodies: world.crashObstacleBodies, occupantKind: world.occupantKind, resolveMotion: () => null,
            canPlace: request => {
                const detached = detachedPlacement(request);
                placements.push(detached);
                const clear = world.canPlace?.(detached) ?? false;
                placementDenied = !clear;
                return clear;
            },
            didPlace: request => notifications.push(detachedPlacement(request)),
        } : undefined;
        const before = createPose();
        this.writePose(before);
        const revision = this.stateRevision, serial = this.placementSerial;
        working.nativePhaseRetryReserveMetres = POPULATION.nativePhaseRetryReserveMetres;
        let progressed;
        try {
            progressed = integrate(working);
        }
        finally {
            working.nativePhaseRetryReserveMetres = 0;
        }
        if (!progressed)
            return false;
        const proposed = createPose();
        working.writePose(proposed);
        const discontinuous = working.placementSerial !== serial;
        const inputAdvanced = discontinuous
            ? (!world || (placements.length > 0 && !placementDenied && notifications.length > 0))
            : !admit || (world?.canReact?.(Object.freeze({ kind: 'contactClock', previous: detachedOccupancyPose(before), proposed: detachedOccupancyPose(proposed) })) ?? true);
        if (this.stateRevision !== revision || !this.sameStepConfiguration(working))
            throw new Error('Settlement query mutated its controller');
        if (!inputAdvanced)
            return false;
        this.invalidatePreparedStep();
        this.copyMutableStateFrom(working);
        record.notifications.push(...notifications);
        record.didPlace = world?.didPlace;
        record.resolvedPlacementRequests = Object.freeze([...record.resolvedPlacementRequests, ...placements]);
        record.discontinuitySerial = this.placementSerial;
        record.placementBlocked = this.dynamicPlacementBlocked;
        return true;
    }
    yieldPhysicalContact() {
        if (this.crashing || this.airborne)
            return false;
        if (this.dynamicWorld?.canReact)
            return this.admitPhysicalReaction('contactYield', working => working.yieldPhysicalContact(), false);
        this.invalidatePreparedStep();
        this.shedSpeed(Math.abs(this.speed));
        this.blocked = true;
        this.obstacleEscapeArmed = true;
        return true;
    }
    get lastHopCharge() {
        return this.hopCharge;
    }
    get powerLoad() {
        return this.loadFactor;
    }
    get offRoute() {
        return this.offCourse;
    }
    get powerWarning() {
        return this.powerStage;
    }
    get derivedTopSpeed() {
        const t = this.tuning;
        return Math.sqrt((t.leanToAccel * Math.sin(t.maxLeanPitch)) / Math.max(1e-9, t.dragCoefficient));
    }
    get overspeed() {
        return this.overspeedFactor;
    }
    get overspeedHeld() {
        return this.overspeedHold;
    }
    get wobbleLevel() {
        return clamp01(this.wobbleEnergy / Math.max(1e-6, this.tuning.wobbleCrashEnergy));
    }
    get obstacleImpact() {
        return this.collisionImpact;
    }
    writePose(target) {
        const t = this.tuning;
        const tiltPitch = this.tiltBack * t.tiltBackPedalPitch;
        target.x = this.x;
        target.y = this.y;
        target.z = this.z;
        target.headingY = this.headingY;
        target.rollAngle = this.rollAngle;
        target.riderRoll = riderRollFor(this.rollAngle, this.riderLean, this.technicalTurn, this.speed, t, this.leanSettle);
        target.riderPitch = this.riderPitch + this.slopeLean + this.airPitch - tiltPitch;
        target.riderLookYaw = this.riderLookYaw;
        target.riderTurnTwist = this.riderTurnTwist;
        target.technicalTurn = this.technicalTurn;
        target.reverseBlend = this.reverseBlend;
        target.wheelPitch = this.riderPitch * t.wheelPitchFactor + this.airPitch - tiltPitch;
        target.wheelSpin = this.wheelSpin;
        target.groundPitch = this.groundPitch;
        target.groundRoll = this.groundRoll;
        target.suspensionOffset = this.suspensionOffset;
        target.restFactor = this.restFactor;
        target.speed = this.speed;
        target.crouch = clamp01(this.crouch + this.absorb);
        target.tuck = this.tuck;
        target.attack = this.attack;
        target.carveStance = this.carveStance;
        target.airBlend = this.airBlend;
        target.airHeight = this.y - this.groundY;
        target.groundY = this.groundY;
        target.pedalStrike = this.pedalStrike;
        target.wobble = clamp01(this.wobbleEnergy / Math.max(1e-6, t.wobbleCrashEnergy));
        target.wobbleFootCorrection = this.wobbleFootCorrection;
        target.wobbleYaw = this.wobbleYaw;
        target.wobbleRoll = this.wobbleRoll;
        target.wobbleSway = this.wobbleSway;
        target.styleSway = this.styleSway;
        target.styleYaw = this.styleYaw;
        target.styleRoll = this.styleRoll;
        target.styleStumble = this.styleStumble;
        target.wobbleFight = clamp01((this.wobbleEnergy - t.wobbleStateEnergy)
            / Math.max(1e-6, t.wobbleCrashEnergy - t.wobbleStateEnergy));
        target.alert = Math.max(ladder(this.wobbleEnergy, [
            t.wobbleStateEnergy * 0.5,
            t.wobbleStateEnergy,
            t.wobbleCrashEnergy,
        ]), ladder(this.loadFactor, [t.powerNoticeLoad, t.powerWarnLoad, t.powerTiltBackLoad]));
        target.tiltBack = this.tiltBack;
        target.recoverBlend = clamp01(1 - this.recoverTimer / Math.max(1e-6, t.crashRecoverBlendSeconds));
        target.wheelCrashSpin = this.wheelCrashSpin;
        target.wheelCrashPop = this.wheelCrashPop;
        if (this.ragdolling) {
            target.ragdollBlend = Math.min(1, this.crashTime / Math.max(1e-6, t.ragdollBlendSeconds));
            target.ragdoll.set(this.ragdoll.positions);
            target.ragdollJointPoles.set(this.ragdoll.jointPoles);
        }
        else {
            target.ragdollBlend = 0;
            target.ragdollJointPoles.fill(0);
        }
        const blend = this.crashBlend;
        target.crashBlend = blend;
        if (blend <= 0) {
            target.crashForward = 0;
            target.crashLateral = 0;
            target.crashDrop = 0;
            target.crashTumble = 0;
            target.crashRoll = 0;
            target.wheelCrashLean = 0;
            return;
        }
        const sideFall = this.crashMotion === 'sideFall';
        const reach = this.crashCause === 'obstacle'
            ? 0
            : sideFall
                ? 0.5
                : this.crashMotion === 'runOut'
                    ? 1
                    : this.crashMotion === 'faceplant'
                        ? 0.85
                        : 0.35;
        const spread = sideFall ? 1 : this.crashMotion === 'stepOff' ? 0.5 : 0.18;
        target.crashForward = t.crashSeparationForward * reach * blend;
        target.crashLateral = this.crashSide * t.crashSeparationLateral * spread * blend;
        const wave = Math.sin(2 * Math.PI * t.crashTumbleHz * this.crashTime)
            * Math.exp(-this.crashTime / Math.max(1e-6, t.crashTumbleDampSeconds));
        const bounce = t.crashTumbleBounce * Math.max(0, wave) * blend;
        if (sideFall) {
            target.crashDrop = t.crashSideFallDrop * blend - bounce;
            target.crashTumble = 0;
            target.crashRoll = this.crashSide
                * (t.crashSideFallRoll * blend + t.crashTumbleRoll * wave * blend);
        }
        else {
            target.crashDrop = t.crashRiderDrop * blend - bounce * 0.5;
            target.crashTumble = (t.crashRiderTumble + t.crashTumblePitch * wave) * blend;
            target.crashRoll = 0;
        }
        target.wheelCrashLean = this.crashSide * this.wheelCrashLean;
    }
    snapshot() {
        const t = this.tuning;
        const tiltPitch = this.tiltBack * t.tiltBackPedalPitch;
        return {
            state: this.state,
            position: { x: this.x, y: this.y, z: this.z },
            headingY: this.headingY,
            speed: this.speed,
            speedKph: this.speed * 3.6,
            longitudinalAccel: this.longitudinalAccel,
            leanPitch: this.leanPitch,
            riderPitch: this.riderPitch + this.slopeLean + this.airPitch - tiltPitch,
            slopeLean: this.slopeLean,
            restFactor: this.restFactor,
            riderLookYaw: this.riderLookYaw,
            riderTurnTwist: this.riderTurnTwist,
            technicalTurn: this.technicalTurn,
            attack: this.attack,
            carveStance: this.carveStance,
            wheelPitch: this.riderPitch * t.wheelPitchFactor + this.airPitch - tiltPitch,
            rollAngle: this.rollAngle,
            riderRoll: riderRollFor(this.rollAngle, this.riderLean, this.technicalTurn, this.speed, t, this.leanSettle),
            riderLean: this.riderLean,
            leanSettle: this.leanSettle,
            yawRate: this.yawRate,
            lateralAccel: this.lateralAccel,
            lateralLimited: this.lateralLimited,
            reversing: this.reversing,
            reverseBlend: this.reverseBlend,
            grounded: this.grounded,
            surface: this.surface,
            wheelSpin: this.wheelSpin,
            distanceTravelled: this.distanceTravelled,
            offCourse: this.offCourse,
            groundNormal: { ...this.ground.normal },
            slope: this.slope,
            slopeAccel: this.slopeAccel,
            rollingResistance: this.rollingResistance,
            lateralLimitG: this.lateralLimitG,
            suspensionOffset: this.suspensionOffset,
            suspensionCompression: this.suspensionCompression,
            curbAhead: this.curbAhead,
            lastStepUp: this.lastStepUp,
            blocked: this.blocked,
            collisionImpact: this.collisionImpact,
            compressing: this.compressing,
            hopCharge: this.hopCharge,
            crouchCharge: clamp01(this.crouchHold / Math.max(1e-6, this.tuning.hopChargeSeconds)),
            hops: this.hops,
            spins: this.spinsCount,
            spinning: this.spinArmed,
            verticalVelocity: this.verticalVelocity,
            airHeight: this.y - this.groundY,
            airApex: this.airApex,
            airTime: this.airTime,
            airMisalignment: this.airborne
                ? Math.acos(clamp(this.airDirX * Math.sin(this.headingY) + this.airDirZ * Math.cos(this.headingY), -1, 1))
                : 0,
            landingQuality: this.landingQuality,
            landingImpact: this.landingImpact,
            landingMisalignment: this.landingMisalignment,
            landingScore: this.landingScore,
            landingSpeedLoss: this.landingSpeedLoss,
            landings: this.landings,
            pedalStrike: this.pedalStrike,
            pedalClearance: this.pedalClearance,
            wobbleEnergy: this.wobbleEnergy,
            wobbleYaw: this.wobbleYaw,
            wobbleRoll: this.wobbleRoll,
            wobbleRate: this.wobbleRate,
            wobbleSmoothness: this.wobbleSmoothness,
            wobbleFootCorrection: this.wobbleFootCorrection,
            styleSway: this.styleSway,
            styleHeading: this.styleHeading,
            styleWeaveRate: this.styleWeaveRate,
            styleYaw: this.styleYaw,
            styleRoll: this.styleRoll,
            styleStumble: this.styleStumble,
            stumbles: this.stumbles,
            loadFactor: this.loadFactor,
            powerStage: this.powerStage,
            tiltBack: this.tiltBack,
            overspeed: this.overspeedFactor,
            overspeedHeld: this.overspeedHold,
            crashed: this.crashing,
            crashCause: this.crashCause,
            crashMotion: this.crashMotion,
            ragdolling: this.ragdolling,
            inFoliage: this.inSoftBody,
            crashTime: this.crashing ? this.crashTime : 0,
            crashes: this.crashes,
            recoveryReady: this.crashing && !this.crashFalling && this.crashTime >= t.crashRecoverEarliestSeconds,
            invulnerable: this.invulnerableTimer,
            safePosition: { x: this.safeX, y: this.safeY, z: this.safeZ },
            safeHeading: this.safeHeading,
        };
    }
    wallTurnSeconds = 0;
    wallTurnDirection = 1;
    wallTurns = 0;
    comeBackTurn = 0;
    comeBackDirection = 1;
    comeBackFlight = false;
    comeBackClimb = 0;
    comeBackUpX = 0;
    comeBackUpZ = 0;
    comeBackAirs = 0;
    kickRise = 0;
    kickRun = 0;
    kickOnTop = false;
    flaggedSlopeRun = Infinity;
    transitionLaunch(speed, shipped) {
        const rule = SKATE_TRANSITION;
        if (this.kickArmed()) {
            return Math.max(shipped, Math.min(Math.abs(speed) * this.kickRise, rule.kickMaxVerticalSpeed));
        }
        if (this.onFlaggedSlope() && shipped > rule.crestMaxVerticalSpeed)
            return rule.crestMaxVerticalSpeed;
        return shipped;
    }
    onFlaggedSlope() {
        return this.flaggedSlopeRun <= SKATE_TRANSITION.crestWindowMetres;
    }
    kickArmed() {
        return this.kickRise !== 0 && this.kickOnTop && this.kickRun <= SKATE_TRANSITION.kickLaunchWindowMetres;
    }
    transitionHop(launch, speed, shipped) {
        if (!this.onFlaggedSlope() && !this.kickArmed())
            return launch + shipped;
        return Math.min(launch + this.transitionLaunch(speed, shipped), Math.max(launch, SKATE_TRANSITION.hopMaxVerticalSpeed));
    }
    stepKickLatch(dirX, dirZ, distance) {
        const normal = this.ground.normal;
        const flagged = this.sampler.transitionAt(this.x, this.z, this.y);
        const across = Math.hypot(normal.x, normal.z);
        this.flaggedSlopeRun = flagged && across >= 1e-9 ? 0 : this.flaggedSlopeRun + distance;
        if (flagged && across < 1e-9) {
            if (this.kickRise === 0)
                return;
            this.kickRun += distance;
            this.kickOnTop = true;
            return;
        }
        const rise = normal.y > 0 ? -(normal.x * dirX + normal.z * dirZ) : 0;
        if (!flagged || rise < KICK_MIN_RISE * normal.y) {
            this.kickRise = 0;
            this.kickOnTop = false;
            return;
        }
        const sine = rise / Math.hypot(rise, normal.y);
        this.kickRise = this.kickOnTop || this.kickRun > SKATE_TRANSITION.kickLaunchWindowMetres
            ? sine : Math.max(this.kickRise, sine);
        this.kickRun = 0;
        this.kickOnTop = false;
    }
    stepWallTurn(dt, throttle, steer, speed) {
        const rule = SKATE_TRANSITION;
        const normal = this.ground.normal;
        if (this.wallTurnSeconds <= 0) {
            if (normal.y >= WALL_TURN_NORMAL_Y || Math.abs(speed) > rule.wallTurnSpeed)
                return;
            if (this.reversing || this.compressing || throttle < -0.01)
                return;
            const drive = throttle > 0.01
                ? this.tuning.leanToAccel * Math.sin(clamp01(throttle) * this.tuning.maxLeanPitch) : 0;
            if (throttle > 0.01 && this.slopeAccel + drive > 0)
                return;
            const across = Math.hypot(normal.x, normal.z);
            const facingDown = (Math.sin(this.headingY) * normal.x + Math.cos(this.headingY) * normal.z) / across;
            if (facingDown >= WALL_TURN_ALIGNED)
                return;
            if (!this.sampler.transitionAt(this.x, this.z, this.y))
                return;
            const decel = -(this.slopeAccel + drive);
            if (speed > 0 && decel > 0) {
                const reach = Math.max(WALL_TURN_CREST_MIN_REACH, (speed * speed) / (2 * decel)) + WALL_TURN_CREST_MARGIN;
                const aheadX = this.x + Math.sin(this.headingY) * reach;
                const aheadZ = this.z + Math.cos(this.headingY) * reach;
                if (!this.sampler.transitionAt(aheadX, aheadZ, this.y))
                    return;
                if (this.sampler.sampleGround(aheadX, aheadZ, this.probe, this.y).normal.y >= WALL_TURN_NORMAL_Y)
                    return;
            }
            this.wallTurnSeconds = rule.wallTurnSeconds;
            this.wallTurnDirection = steer > 0.01 ? -1 : 1;
            this.wallTurns += 1;
        }
        const across = Math.hypot(normal.x, normal.z);
        if (throttle < -0.01 || across < 1e-6) {
            this.wallTurnSeconds = 0;
            return;
        }
        const fallLine = Math.atan2(normal.x, normal.z);
        let delta = fallLine - this.headingY;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        if (Math.abs(delta) > Math.PI - 1e-3)
            delta = this.wallTurnDirection * (Math.PI - 1e-3);
        this.headingY += delta * Math.min(1, dt / this.wallTurnSeconds);
        this.wallTurnSeconds = Math.max(0, this.wallTurnSeconds - dt);
    }
    faceBrake(accel, throttle) {
        const slope = this.slopeAccel;
        if (accel * slope >= 0)
            return accel;
        if (!(this.speed * slope > 0 || (slope > 0 && throttle < -0.01)))
            return accel;
        if (this.ground.normal.y >= WALL_TURN_NORMAL_Y || !this.sampler.transitionAt(this.x, this.z, this.y))
            return accel;
        const most = SKATE_TRANSITION.faceBrakeShare * Math.abs(slope);
        return clamp(accel, -most, most);
    }
    comeBackAtLip(deltaX, deltaZ, speed, steer) {
        const normal = this.ground.normal;
        if (this.comeBackClimb === 0 && normal.y >= COME_BACK_NORMAL_Y)
            return false;
        const length = Math.hypot(deltaX, deltaZ);
        if (length < 1e-9)
            return false;
        if (!this.updateComeBackClimb(deltaX / length, deltaZ / length))
            return false;
        if (Math.abs(speed) < SKATE_TRANSITION.comeBackMinSpeed)
            return false;
        if (this.sampler.transitionAt(this.x + deltaX, this.z + deltaZ, this.y)
            && !(this.excessAt(deltaX, deltaZ) < -this.tuning.dropLaunchThreshold))
            return false;
        this.startComeBack(deltaX / length, deltaZ / length, speed, Math.abs(speed) * this.comeBackClimb, steer);
        return true;
    }
    updateComeBackClimb(dirX, dirZ) {
        const normal = this.ground.normal;
        const across = Math.hypot(normal.x, normal.z);
        const rise = -(normal.x * dirX + normal.z * dirZ);
        const level = across < 1e-9;
        if ((level ? this.comeBackClimb === 0 : rise <= 0) || !this.sampler.transitionAt(this.x, this.z, this.y)) {
            this.comeBackClimb = 0;
            return false;
        }
        if (!level && normal.y < COME_BACK_NORMAL_Y && across > this.comeBackClimb && rise / across > COME_BACK_APPROACH) {
            this.comeBackClimb = across;
            this.comeBackUpX = -normal.x / across;
            this.comeBackUpZ = -normal.z / across;
        }
        if (this.comeBackClimb === 0)
            return false;
        if (this.comeBackUpX * dirX + this.comeBackUpZ * dirZ <= COME_BACK_APPROACH) {
            this.comeBackClimb = 0;
            return false;
        }
        return true;
    }
    startComeBack(dirX, dirZ, speed, vertical, steer) {
        const rule = SKATE_TRANSITION;
        const upX = this.comeBackUpX;
        const upZ = this.comeBackUpZ;
        this.leaveGround(this.y, Math.min(vertical, rule.comeBackMaxVerticalSpeed), -dirX, -dirZ);
        this.speed = rule.comeBackDriftSpeed;
        this.reversing = false;
        this.reverseHold = 0;
        this.wallTurnSeconds = 0;
        this.comeBackFlight = true;
        this.comeBackTurn = speed > 0 ? Math.PI : 0;
        const fallLine = Math.atan2(-upX, -upZ) - this.headingY;
        this.comeBackDirection = steer >= this.tuning.spinSteerThreshold ? -1
            : steer <= -this.tuning.spinSteerThreshold ? 1
                : Math.sin(fallLine) < 0 ? -1 : 1;
        this.comeBackAirs += 1;
        this.alignComeBackWithSpin();
    }
    comeBackAgainstFace(dirX, dirZ, forward, steer) {
        const rule = SKATE_TRANSITION;
        const aheadX = this.x + dirX * 0.25;
        const aheadZ = this.z + dirZ * 0.25;
        if (!this.sampler.transitionAt(aheadX, aheadZ, this.y))
            return false;
        const face = this.sampler.sampleGround(aheadX, aheadZ, this.probe, this.y);
        const normal = face.normal;
        if (normal.y >= COME_BACK_NORMAL_Y || face.height <= this.y)
            return false;
        const across = Math.hypot(normal.x, normal.z);
        if (-(normal.x * dirX + normal.z * dirZ) / across <= COME_BACK_APPROACH)
            return false;
        const vertical = Math.min(this.verticalVelocity, rule.comeBackMaxVerticalSpeed);
        const flight = (2 * vertical) / this.tuning.gravity;
        const turn = forward && flight >= rule.comeBackTurnSeconds * 1.25;
        this.verticalVelocity = vertical;
        this.comeBackUpX = -normal.x / across;
        this.comeBackUpZ = -normal.z / across;
        if (!forward || turn) {
            this.airDirX = -dirX;
            this.airDirZ = -dirZ;
            this.speed = rule.comeBackDriftSpeed;
        }
        else {
            this.airDirX = Math.sin(this.headingY);
            this.airDirZ = Math.cos(this.headingY);
            this.speed = 0;
        }
        this.comeBackFlight = true;
        this.comeBackTurn = turn ? Math.PI : 0;
        const fallLine = Math.atan2(normal.x, normal.z) - this.headingY;
        this.comeBackDirection = steer >= this.tuning.spinSteerThreshold ? -1
            : steer <= -this.tuning.spinSteerThreshold ? 1
                : Math.sin(fallLine) < 0 ? -1 : 1;
        this.comeBackAirs += 1;
        this.alignComeBackWithSpin();
        return true;
    }
    alignComeBackWithSpin() {
        if (this.comeBackTurn > 0 && this.spinRemaining > 0)
            this.comeBackDirection = this.spinDirection;
    }
    comeBackTouchdown(speed, fall) {
        this.comeBackFlight = false;
        this.comeBackTurn = 0;
        const normal = this.ground.normal;
        if (normal.y >= COME_BACK_LAND_NORMAL_Y)
            return speed;
        const along = SKATE_TRANSITION.comeBackLandShare * Math.abs(fall) * Math.sqrt(1 - normal.y * normal.y);
        const facingDown = Math.sin(this.headingY) * normal.x + Math.cos(this.headingY) * normal.z;
        if (facingDown >= 0)
            return Math.max(speed, along);
        this.reversing = true;
        return Math.min(speed, -along);
    }
    clearTransitionMotion() {
        this.dynamicComeBackApplied = 0;
        this.wallTurnSeconds = 0;
        this.comeBackTurn = 0;
        this.comeBackFlight = false;
        this.comeBackClimb = 0;
        this.kickRise = 0;
        this.kickRun = 0;
        this.kickOnTop = false;
        this.flaggedSlopeRun = Infinity;
    }
    get wallTurnCount() {
        return this.wallTurns;
    }
    get comeBackAirCount() {
        return this.comeBackAirs;
    }
    get inComeBackAir() {
        return this.comeBackFlight;
    }
}
function isStyled(style) {
    for (const value of Object.values(style))
        if (value !== 0)
            return true;
    return false;
}
export function slopeAccelFor(normal, forwardX, forwardZ, gravity) {
    const alongNormal = forwardX * normal.x + forwardZ * normal.z;
    if (alongNormal === 0)
        return 0;
    const tangentX = forwardX - alongNormal * normal.x;
    const tangentY = -alongNormal * normal.y;
    const tangentZ = forwardZ - alongNormal * normal.z;
    const length = Math.hypot(tangentX, tangentY, tangentZ);
    if (length <= 1e-6)
        return 0;
    return -gravity * (tangentY / length);
}
export function ladder(value, rungs) {
    if (!(value > 0) || rungs.length === 0)
        return 0;
    const span = 1 / rungs.length;
    let low = 0;
    for (let i = 0; i < rungs.length; i += 1) {
        const high = Math.max(rungs[i], low + 1e-6);
        if (value < high)
            return (i + (value - low) / (high - low)) * span;
        low = high;
    }
    return 1;
}
function safeAxis(value) {
    return Number.isFinite(value) ? value : 0;
}
