// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/eucStepPrimitives.ts + reviewed d37efc0 declarations (MANIFEST.json) (sliced for euc-newyork: see the tool).
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
export const EUC_STEP_PRIMITIVE_FIELDS = Object.freeze([
    'vehicleImpact', 'crashVelocityX', 'crashVelocityZ', 'recoveryRetrySeconds', 'dynamicImpactSpeed', 'dynamicImpactNormalX', 'dynamicImpactNormalZ', 'dynamicSpinApplied', 'dynamicComeBackApplied', 'dynamicStyleHeadingPrevious', 'placementSerial',
    'dynamicPlacementBlocked', 'x', 'y', 'z', 'headingY', 'speed',
    'leanPitch', 'riderPitch', 'slopeLean', 'riderLookYaw', 'riderTurnTwist', 'technicalTurn',
    'longitudinalAccel', 'rollAngle', 'riderLean', 'leanSettle', 'yawRate', 'lateralAccel',
    'lateralLimited', 'wheelSpin', 'distanceTravelled', 'reversing', 'reverseHold', 'contactBrakingConstraint',
    'reverseBlend', 'restHold', 'restFactor', 'grounded', 'surface', 'traction',
    'state', 'lastObstacleNarrow', 'slope', 'slopeAccel', 'rollingResistance', 'lateralLimitG',
    'groundPitch', 'groundRoll', 'suspensionOffset', 'suspensionVelocity', 'suspensionCompression', 'curbAhead',
    'lastStepUp', 'blocked', 'obstacleEscapeArmed', 'collisionImpact', 'offCourse', 'inHazard',
    'inSoftBody', 'launchPadsArmed', 'launchPadLatch', 'launchPadRearmMetres', 'launchPadRearmRidden', 'launchPadVerticalSpeed',
    'justPadLaunched', 'launchPadsShown', 'launchPadRise', 'airborne', 'verticalVelocity', 'airDirX',
    'airDirZ', 'crashTravelX', 'crashTravelZ', 'groundY', 'airTime', 'airApex',
    'compressTimer', 'compressing', 'crouchHold', 'hopCharge', 'hopWasHeld', 'hops',
    'spinRemaining', 'spinDirection', 'spinArmed', 'spinsCount', 'crouch', 'tuck',
    'attackHold', 'attack', 'carveStance', 'absorb', 'airBlend', 'airPitch',
    'landingTimer', 'landingQuality', 'landingImpact', 'landingMisalignment', 'landingScore', 'landingSpeedLoss',
    'landings', 'pedalStrike', 'pedalClearance', 'justTookOff', 'justTouchedDown', 'justHopped',
    'spinSwept', 'flights', 'wallTurnSeconds', 'wallTurnDirection', 'wallTurns', 'comeBackTurn', 'comeBackDirection', 'comeBackFlight', 'comeBackClimb', 'comeBackUpX', 'comeBackUpZ', 'comeBackAirs', 'kickRise', 'kickRun', 'kickOnTop', 'flaggedSlopeRun', 'stylePhaseA', 'stylePhaseB', 'styleGate', 'styleSway',
    'styleHeading', 'styleWeaveRate', 'styleMetres', 'stumbleTime', 'stumbleLength', 'stumbles',
    'styleYaw', 'styleRoll', 'styleStumble', 'wobbleEnergy', 'wobblePhase', 'wobbleYaw',
    'wobbleRoll', 'wobbleSway', 'wobbleRate', 'wobbleProbeDistance', 'wobbleSmoothness', 'wobbleFootCorrection',
    'steerSign', 'steerHold', 'loadFactor', 'powerStage', 'landingLoad', 'tiltBack',
    'tiltBackLatched', 'overspeedFactor', 'overspeedHold', 'crashing', 'crashCause', 'crashMotion',
    'crashTime', 'crashes', 'crashSpeed', 'crashSide', 'crashBlend', 'wheelCrashLean',
    'recoverTimer', 'invulnerableTimer', 'crashFalling', 'crashFallSeconds', 'ragdolling', 'wheelCrashSpin',
    'wheelCrashSpinRate', 'wheelCrashPop', 'wheelCrashPopVelocity', 'safeX', 'safeY', 'safeZ', 'safeHeading',
    'safeHold', 'safeRingCount', 'safeRingNext', 'recoveryRefusedSeconds', 'contactHoldMask', 'contactHoldMaskOlder',
    'airPhaseContactUpdate', 'nativePhaseRetryReserveMetres',
]);
export function copyEucStepPrimitives(to, from) {
    to.vehicleImpact = from.vehicleImpact;
    to.crashVelocityX = from.crashVelocityX;
    to.crashVelocityZ = from.crashVelocityZ;
    to.recoveryRetrySeconds = from.recoveryRetrySeconds;
    to.dynamicImpactSpeed = from.dynamicImpactSpeed;
    to.dynamicImpactNormalX = from.dynamicImpactNormalX;
    to.dynamicImpactNormalZ = from.dynamicImpactNormalZ;
    to.dynamicSpinApplied = from.dynamicSpinApplied;
    to.dynamicComeBackApplied = from.dynamicComeBackApplied;
    to.dynamicStyleHeadingPrevious = from.dynamicStyleHeadingPrevious;
    to.placementSerial = from.placementSerial;
    to.dynamicPlacementBlocked = from.dynamicPlacementBlocked;
    to.x = from.x;
    to.y = from.y;
    to.z = from.z;
    to.headingY = from.headingY;
    to.speed = from.speed;
    to.leanPitch = from.leanPitch;
    to.riderPitch = from.riderPitch;
    to.slopeLean = from.slopeLean;
    to.riderLookYaw = from.riderLookYaw;
    to.riderTurnTwist = from.riderTurnTwist;
    to.technicalTurn = from.technicalTurn;
    to.longitudinalAccel = from.longitudinalAccel;
    to.rollAngle = from.rollAngle;
    to.riderLean = from.riderLean;
    to.leanSettle = from.leanSettle;
    to.yawRate = from.yawRate;
    to.lateralAccel = from.lateralAccel;
    to.lateralLimited = from.lateralLimited;
    to.wheelSpin = from.wheelSpin;
    to.distanceTravelled = from.distanceTravelled;
    to.reversing = from.reversing;
    to.reverseHold = from.reverseHold;
    to.contactBrakingConstraint = from.contactBrakingConstraint;
    to.reverseBlend = from.reverseBlend;
    to.restHold = from.restHold;
    to.restFactor = from.restFactor;
    to.grounded = from.grounded;
    to.surface = from.surface;
    to.traction = from.traction;
    to.state = from.state;
    to.lastObstacleNarrow = from.lastObstacleNarrow;
    to.slope = from.slope;
    to.slopeAccel = from.slopeAccel;
    to.rollingResistance = from.rollingResistance;
    to.lateralLimitG = from.lateralLimitG;
    to.groundPitch = from.groundPitch;
    to.groundRoll = from.groundRoll;
    to.suspensionOffset = from.suspensionOffset;
    to.suspensionVelocity = from.suspensionVelocity;
    to.suspensionCompression = from.suspensionCompression;
    to.curbAhead = from.curbAhead;
    to.lastStepUp = from.lastStepUp;
    to.blocked = from.blocked;
    to.obstacleEscapeArmed = from.obstacleEscapeArmed;
    to.collisionImpact = from.collisionImpact;
    to.offCourse = from.offCourse;
    to.inHazard = from.inHazard;
    to.inSoftBody = from.inSoftBody;
    to.launchPadsArmed = from.launchPadsArmed;
    to.launchPadLatch = from.launchPadLatch;
    to.launchPadRearmMetres = from.launchPadRearmMetres;
    to.launchPadRearmRidden = from.launchPadRearmRidden;
    to.launchPadVerticalSpeed = from.launchPadVerticalSpeed;
    to.justPadLaunched = from.justPadLaunched;
    to.launchPadsShown = from.launchPadsShown;
    to.launchPadRise = from.launchPadRise;
    to.airborne = from.airborne;
    to.verticalVelocity = from.verticalVelocity;
    to.airDirX = from.airDirX;
    to.airDirZ = from.airDirZ;
    to.crashTravelX = from.crashTravelX;
    to.crashTravelZ = from.crashTravelZ;
    to.groundY = from.groundY;
    to.airTime = from.airTime;
    to.airApex = from.airApex;
    to.compressTimer = from.compressTimer;
    to.compressing = from.compressing;
    to.crouchHold = from.crouchHold;
    to.hopCharge = from.hopCharge;
    to.hopWasHeld = from.hopWasHeld;
    to.hops = from.hops;
    to.spinRemaining = from.spinRemaining;
    to.spinDirection = from.spinDirection;
    to.spinArmed = from.spinArmed;
    to.spinsCount = from.spinsCount;
    to.crouch = from.crouch;
    to.tuck = from.tuck;
    to.attackHold = from.attackHold;
    to.attack = from.attack;
    to.carveStance = from.carveStance;
    to.absorb = from.absorb;
    to.airBlend = from.airBlend;
    to.airPitch = from.airPitch;
    to.landingTimer = from.landingTimer;
    to.landingQuality = from.landingQuality;
    to.landingImpact = from.landingImpact;
    to.landingMisalignment = from.landingMisalignment;
    to.landingScore = from.landingScore;
    to.landingSpeedLoss = from.landingSpeedLoss;
    to.landings = from.landings;
    to.pedalStrike = from.pedalStrike;
    to.pedalClearance = from.pedalClearance;
    to.justTookOff = from.justTookOff;
    to.justTouchedDown = from.justTouchedDown;
    to.justHopped = from.justHopped;
    to.spinSwept = from.spinSwept;
    to.flights = from.flights;
    to.wallTurnSeconds = from.wallTurnSeconds;
    to.wallTurnDirection = from.wallTurnDirection;
    to.wallTurns = from.wallTurns;
    to.comeBackTurn = from.comeBackTurn;
    to.comeBackDirection = from.comeBackDirection;
    to.comeBackFlight = from.comeBackFlight;
    to.comeBackClimb = from.comeBackClimb;
    to.comeBackUpX = from.comeBackUpX;
    to.comeBackUpZ = from.comeBackUpZ;
    to.comeBackAirs = from.comeBackAirs;
    to.kickRise = from.kickRise;
    to.kickRun = from.kickRun;
    to.kickOnTop = from.kickOnTop;
    to.flaggedSlopeRun = from.flaggedSlopeRun;
    to.stylePhaseA = from.stylePhaseA;
    to.stylePhaseB = from.stylePhaseB;
    to.styleGate = from.styleGate;
    to.styleSway = from.styleSway;
    to.styleHeading = from.styleHeading;
    to.styleWeaveRate = from.styleWeaveRate;
    to.styleMetres = from.styleMetres;
    to.stumbleTime = from.stumbleTime;
    to.stumbleLength = from.stumbleLength;
    to.stumbles = from.stumbles;
    to.styleYaw = from.styleYaw;
    to.styleRoll = from.styleRoll;
    to.styleStumble = from.styleStumble;
    to.wobbleEnergy = from.wobbleEnergy;
    to.wobblePhase = from.wobblePhase;
    to.wobbleYaw = from.wobbleYaw;
    to.wobbleRoll = from.wobbleRoll;
    to.wobbleSway = from.wobbleSway;
    to.wobbleRate = from.wobbleRate;
    to.wobbleProbeDistance = from.wobbleProbeDistance;
    to.wobbleSmoothness = from.wobbleSmoothness;
    to.wobbleFootCorrection = from.wobbleFootCorrection;
    to.steerSign = from.steerSign;
    to.steerHold = from.steerHold;
    to.loadFactor = from.loadFactor;
    to.powerStage = from.powerStage;
    to.landingLoad = from.landingLoad;
    to.tiltBack = from.tiltBack;
    to.tiltBackLatched = from.tiltBackLatched;
    to.overspeedFactor = from.overspeedFactor;
    to.overspeedHold = from.overspeedHold;
    to.crashing = from.crashing;
    to.crashCause = from.crashCause;
    to.crashMotion = from.crashMotion;
    to.crashTime = from.crashTime;
    to.crashes = from.crashes;
    to.crashSpeed = from.crashSpeed;
    to.crashSide = from.crashSide;
    to.crashBlend = from.crashBlend;
    to.wheelCrashLean = from.wheelCrashLean;
    to.recoverTimer = from.recoverTimer;
    to.invulnerableTimer = from.invulnerableTimer;
    to.crashFalling = from.crashFalling;
    to.crashFallSeconds = from.crashFallSeconds;
    to.ragdolling = from.ragdolling;
    to.wheelCrashSpin = from.wheelCrashSpin;
    to.wheelCrashSpinRate = from.wheelCrashSpinRate;
    to.wheelCrashPop = from.wheelCrashPop;
    to.wheelCrashPopVelocity = from.wheelCrashPopVelocity;
    to.safeX = from.safeX;
    to.safeY = from.safeY;
    to.safeZ = from.safeZ;
    to.safeHeading = from.safeHeading;
    to.safeHold = from.safeHold;
    to.safeRingCount = from.safeRingCount;
    to.safeRingNext = from.safeRingNext;
    to.recoveryRefusedSeconds = from.recoveryRefusedSeconds;
    to.contactHoldMask = from.contactHoldMask;
    to.contactHoldMaskOlder = from.contactHoldMaskOlder;
    to.airPhaseContactUpdate = from.airPhaseContactUpdate;
    to.nativePhaseRetryReserveMetres = from.nativePhaseRetryReserveMetres;
}
