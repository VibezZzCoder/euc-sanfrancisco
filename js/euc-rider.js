// js/euc-rider.js — EUC Thrills' controller and rider rig, riding San Francisco.
// © 2026 VibezZzCoder — MIT. Derived riding code: EUC Thrills @5f45fff (js/euc/LICENSE).
// Downstream forks: read NOTICE-EUC-THRILLS.md before repurposing participant looks, marks or recordings.
//
// Ownership (EUC_THRILLS_CODE_ARCHITECTURE_GUIDE.md §4, §7, §11):
//   - The city keeps its one variable-dt loop. This module owns a fixed-step accumulator inside it and runs the EUC
//     simulation at SIMULATION.hz (120), at most MAX_CATCH_UP steps per frame; it never starts a loop of its own.
//   - The controller is the authority for where the rider is. The entity's position/heading/speed are written from
//     the interpolated pose every frame for the city's camera, traffic, minimap and HUD; nothing writes them back.
//   - The rig is placed by rig.apply(pose); controllers.js must not copy entity.position into it.
//   - Input: the city's held keys (W/S/A/D, Shift, Space; touch and gamepad blend into the same keys) become an EUC
//     ActionSnapshot. The hop is an edge, buffered for INPUT.actionBufferSeconds and claimed only on a step where the
//     controller can accept it (canAcceptHop / canAcceptSpin), as Game.ts does. keys.reset (R, gamepad B, touch)
//     rights a crashed rider in place.
//   - Per-step edges (hop, landing, kerb/wall impact, crash, recovery) are queued on entity.events for consumers that
//     run once per frame (audio). Consumers call drainEvents(); the queue is capped so nobody has to.
import * as THREE from 'three/webgpu';
import { EucController, createPose, copyPose, lerpPose } from './euc/simulation/EucController.js';
import { NEUTRAL_ACTIONS } from './euc/input/actions.js';
import { SIMULATION, INPUT } from './euc/data/tuning.js';
import { createRidingRig } from './euc/render/ridingRig.js';
import { riderLook } from './euc/render/riderLook.js';
import { machineLook } from './euc/render/machineLook.js';
import { prepareAppearance, releaseAppearanceCaches } from './euc/render/appearanceLoader.js';
import { RIDERS, PLAYABLE_RIDERS, isPlayableRider, rideStyleFor } from './euc-roster.js';
import { RiderPreparation, yieldRiderStage } from './rider-preparation.js';
import { RiderTricks } from './euc-tricks.js';
import { createNearSolids, clearNearSolids, measureNearSolids } from './euc/app/nearSolids.js';
import { findPlacementTarget, placementDepartureClear } from './euc-recovery.js';
import { getCity } from './city-api.js';
import { EUC_HEADLIGHT, headlightBeamScale, createEucHeadlight, placeEucHeadlight } from './euc-headlight.js';

const STEP = 1 / SIMULATION.hz;
export { RIDERS, PLAYABLE_RIDERS, isPlayableRider };
const MAX_EVENTS = 64;
const MAX_CATCH_UP = 6; // bounded catch-up covers main's full 0.05 s clamp at 120 Hz

// Native EUC tuning, including native hill handling and SF's actual 0.15 m kerbs. Keep the donor export alias.
export const EUC_TUNING = Object.freeze({});
export const NYC_TUNING = EUC_TUNING;

/** Startup: await this before the synchronous entity/manager constructor; pass its result as `appearance`. */
export async function prepareEucRider(id = 'cool-rider', { signal } = {}) {
  if (!isPlayableRider(id)) throw new Error('Unknown playable rider: ' + String(id));
  const check = () => { if (signal?.aborted) throw new DOMException('Rider preparation cancelled', 'AbortError'); };
  check();
  await yieldRiderStage(); check();
  const appearance = await prepareAppearance(id, { signal }); check();
  await yieldRiderStage(); check();
  return appearance;
}

/** The rig's headlamp lens: its mesh, its material's own emissive level, and its front centre in the body frame. */
function findLens(rig) {
  let mesh = null;
  rig.group.traverse((o) => {
    if (o.name === 'euc-headlight') mesh = o;
  });
  if (!mesh) return null;
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const lamp = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z)
    .applyMatrix4(mesh.matrix);
  return { mesh, lamp, baseEmissive: mesh.material.emissiveIntensity };
}

/**
 * The wheel's headlight, on when the cars' are (vehicle-lights.js headlightBeamScale). One spot light made once and
 * kept in the scene for good, so the city's shaders never see the light count change (a rider swap only re-finds the
 * lens). By day it is parked out of sight at zero, as traffic's pooled lights are.
 */
function createHeadlight(scene) {
  const spot = createEucHeadlight();
  spot.name = 'euc-headlight-beam';
  spot.position.set(0, -1000, 0);
  spot.target.position.set(0, -1001, 0);
  scene.add(spot, spot.target);
  let lens = null;
  let lit = -1;
  return {
    spot,
    attach(rig, preparedLens = findLens(rig)) {
      lens = preparedLens;
      lit = -1;
    },
    update() {
      const glow = getCity().cityUniforms.uInteriorGlow.value;
      const beam = headlightBeamScale(glow);
      // The lens follows the cars' lamp glass (actor-models.js nightHeadlamp: smoothstep(0.60, 1.15, glow))
      const t = Math.max(0, Math.min(1, (glow - 0.60) / 0.55));
      const lensOn = t * t * (3 - 2 * t);
      if (lens && lensOn !== lit) {
        lens.mesh.material.emissiveIntensity = lens.baseEmissive * (1 + (EUC_HEADLIGHT.lensNight - 1) * lensOn);
        lit = lensOn;
      }
      if (beam <= 0.001 || !lens) {
        if (spot.intensity !== 0) {
          spot.intensity = 0;
          spot.position.set(0, -1000, 0);
          spot.target.position.set(0, -1001, 0);
        }
        return;
      }
      lens.mesh.updateWorldMatrix(true, false); // the rig was just posed; the scene's own pass comes later
      placeEucHeadlight(spot, lens.lamp, lens.mesh.parent.matrixWorld);
      spot.intensity = EUC_HEADLIGHT.intensity * beam;
    },
    dispose() {
      scene.remove(spot, spot.target);
    },
  };
}

function buildRig(riderId, appearance) {
  let rig;
  try {
    if (appearance && (appearance.look?.id !== riderId || appearance.machine?.machine !== RIDERS[riderId].machine)) {
      throw new Error('Prepared appearance does not match rider: ' + riderId);
    }
    rig = createRidingRig(appearance?.look ?? riderLook(riderId), appearance?.machine ?? machineLook(RIDERS[riderId].machine));
    rig.group.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true; // castShadow is the look's own decision (riderLook.ts rule 3)
    });
    return rig;
  } catch (error) {
    rig?.dispose();
    throw error;
  } finally {
    releaseAppearanceCaches();
  }
}

export function createEucEntity(scene, sampler, { x, y, z, referenceY = y, heading = 0, rider = 'cool-rider', dynamicWorld, appearance } = {}) {
  if (!isPlayableRider(rider)) throw new Error('Unknown playable rider: ' + String(rider));
  if (![x, z, heading].every(Number.isFinite) || !Number.isFinite(referenceY)
    || (y !== undefined && !Number.isFinite(y))) throw new Error('SF spawn requires finite XZ, heading and Y/referenceY');
  let riderId = rider;
  const ground = sampler.sampleGround(x, z, { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'pavement', offCourse: false }, referenceY);
  if (!Number.isFinite(ground.height)) throw new Error('SF spawn has no finite support');
  const controller = new EucController(sampler, {
    spawn: { position: { x, y: ground.height, z }, headingY: heading },
    tuning: EUC_TUNING,
    dynamicWorld,
  });
  controller.setRideStyle(rideStyleFor(riderId));
  const previous = createPose();
  const current = createPose();
  const render = createPose();
  const tricks = new RiderTricks();
  const nearSolids = createNearSolids();
  let lastViewTime = null;
  const resetClearance = () => {
    clearNearSolids(nearSolids);
    rig.setNearSolids(0, nearSolids.faces, 0, 0, nearSolids.normals);
    lastViewTime = null;
  };
  controller.writePose(current);
  copyPose(current, previous);
  copyPose(current, render);

  const constructionStart = performance.now();
  let rig = buildRig(riderId, appearance);
  let headlight;
  try {
    rig.apply(render);
    const lens = findLens(rig);
    headlight = createHeadlight(scene);
    headlight.attach(rig, lens);
    scene.add(rig.group);
  } catch (error) {
    scene.remove(rig.group);
    rig.dispose();
    headlight?.dispose();
    throw error;
  }

  let accumulator = 0;
  let simSeconds = 0;
  let hopPendingUntil = -1;
  let hopWasHeld = false;
  let resetWasHeld = false;
  let recoveryPending = false;
  let wasCrashed = controller.crashed;
  let lastStumbleCount = controller.stumbleCount;
  let disposed = false;
  let disposal = null;
  const events = [];
  const pushEvent = (e) => {
    if (events.length >= MAX_EVENTS) events.shift();
    events.push(e);
  };

  const entity = {
    type: 'euc',
    label: RIDERS[riderId].name,
    riderId,
    mesh: rig.group,
    rig,
    controller,
    tricks,
    events,
    position: new THREE.Vector3(x, ground.height, z),
    heading,
    speed: 0,
    // cameras.js looks at y + offset + 1.55 for riders. Looking at the rider's chest keeps the wheel above the HUD.
    cameraTargetOffset: new THREE.Vector3(0, -0.3, 0),
    chaseDistance: 4.8,
    chaseHeight: 1.9,
    pose: render,
    headlight: headlight.spot,
    constructionMs: performance.now() - constructionStart,

    /** Every animation callback: advance fixed steps and interpolate the authoritative physical pose. */
    update(dt, keys) {
      if (disposed) return;
      const throttle = (keys.forward ? Number(keys.forward) : 0) - (keys.backward ? Number(keys.backward) : 0);
      // EUC: positive steer is the rider's right. The city's "left" key turns toward +heading.
      const steer = (keys.right ? Number(keys.right) : 0) - (keys.left ? Number(keys.left) : 0);
      const hopHeld = !!keys.up;
      if (keys.hopPressed || (hopHeld && !hopWasHeld)) hopPendingUntil = simSeconds + INPUT.actionBufferSeconds;
      hopWasHeld = hopHeld;

      const resetHeld = !!keys.reset;
      if ((keys.resetPressed || (resetHeld && !resetWasHeld)) && controller.crashed) recoveryPending = true;
      resetWasHeld = resetHeld;

      // Clamp incoming time, not the sum: a late callback must retain the prior fractional step.
      // At most 50 ms enters per callback, so six steps leave only a substep, never catch-up debt.
      accumulator += Number.isFinite(dt) ? Math.min(Math.max(0, dt), MAX_CATCH_UP * STEP) : 0;
      const steps = Math.min(MAX_CATCH_UP, Math.floor(accumulator / STEP + 1e-9));
      for (let i = 0; i < steps; i++) {
        accumulator = Math.max(0, accumulator - STEP);
        let hop = false;
        if (hopPendingUntil >= simSeconds && (controller.canAcceptHop || controller.canAcceptSpin)) {
          hop = true;
          hopPendingUntil = -1;
        }
        copyPose(current, previous);
        const placementSerial = controller.placementSerial;
        controller.step(STEP, {
          ...NEUTRAL_ACTIONS,
          throttle: Math.max(-1, Math.min(1, throttle)),
          steer: Math.max(-1, Math.min(1, steer)),
          crouch: !!keys.boost,
          hop,
          hopHeld,
        });
        controller.dynamicWorld?.publishContacts?.(controller);
        if (recoveryPending) controller.recover();
        if (!controller.crashed) recoveryPending = false;
        controller.writePose(current);
        // Recovery is one placement, not an interpolated flight from the old wheel position.
        if (controller.placementSerial !== placementSerial) {
          copyPose(current, previous);
          copyPose(current, render);
          tricks.reset();
          resetClearance();
          rig.setTrickPose(0, 0);
          hopPendingUntil = -1;
          lastStumbleCount = controller.stumbleCount;
          events.length = 0;
        }
        tricks.step(STEP, controller, current, hopHeld, !!keys.boost);
        simSeconds += STEP;
        this.recordEdges();
      }

      lerpPose(previous, current, accumulator / STEP, render);
      tricks.apply(render, accumulator / STEP, rig);

      this.position.set(render.x, render.y, render.z);
      this.heading = render.headingY;
      this.speed = render.speed;
    },

    /** Presentation is measured/posed once per submitted view, never on skipped or hidden callbacks. */
    prepareView(now = performance.now()) {
      if (disposed) return;
      const seconds = lastViewTime === null ? 0 : Math.min(0.05, Math.max(0, (now - lastViewTime) * 0.001));
      lastViewTime = now;
      measureNearSolids(sampler, render, nearSolids, rig.visualTyreRadius);
      rig.setNearSolids(nearSolids.lift, nearSolids.faces, nearSolids.along, seconds, nearSolids.normals);
      rig.apply(render);
      rig.applyStatus(render.alert ?? 0, simSeconds, 1 - (render.recoverBlend ?? 0));
      headlight.update();
    },

    /** Queue this step's one-shot edges for per-frame consumers. */
    recordEdges() {
      if (controller.tookOff) pushEvent({ type: 'hop', charge: controller.lastHopCharge });
      if (controller.touchedDown) {
        pushEvent({ type: 'land', impact: controller.lastLandingImpact, surface: controller.currentSurface });
      }
      if (controller.obstacleImpact > 0) pushEvent({ type: 'impact', speed: controller.obstacleImpact });
      const crashed = controller.crashed;
      if (crashed && !wasCrashed) pushEvent({ type: 'crash', speed: Math.abs(current.speed), rider: riderId });
      else if (!crashed && wasCrashed) pushEvent({ type: 'recover' });
      wasCrashed = crashed;
      const stumbleCount = controller.stumbleCount;
      if (stumbleCount > lastStumbleCount) pushEvent({ type: 'stumble', rider: riderId });
      lastStumbleCount = stumbleCount;
    },

    /** Take every queued edge since the last call. */
    drainEvents() {
      return events.splice(0, events.length);
    },

    /** Resolve a compiled, off-scene candidate; the host commits it together with its separately prepared audio. */
    prepareRider(id, options) {
      if (!isPlayableRider(id)) return Promise.reject(new Error('Unknown playable rider: ' + String(id)));
      return preparation.prepareRider(id, options);
    },

    cancelRiderPreparation() {
      return preparation.cancel();
    },

    /** Async convenience for callers that have no second resource to commit. Prefer prepareRider for audio coordination. */
    async setRider(id, options) {
      const candidate = await this.prepareRider(id, options);
      try { return candidate.commit(); } finally { candidate.dispose(); }
    },

    /** Place the rider and reset interpolation only on success. Checked callers may preflight departure (0–1.2 m). */
    placeAt(px, pz, h = this.heading, referenceY = this.position.y, { requireClear = false, departure = 0 } = {}) {
      if (disposed) return false;
      if (![px, pz, h].every(Number.isFinite) || (!Number.isFinite(referenceY) && referenceY !== Infinity)) return false;
      const placementWorld = controller.dynamicWorld;
      const support = { maxStepUp: controller.tuning.maxStepUp, hull: placementWorld?.hull };
      const target = requireClear ? findPlacementTarget(sampler, { x: px, z: pz, headingY: h, referenceY, ...support }) : null;
      if (requireClear && !target) return false;
      const g = sampler.sampleGround(px, pz, { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'pavement', offCourse: false }, target?.y ?? referenceY);
      if (!Number.isFinite(g.height) || (target && Math.abs(g.height - target.y) > 1e-4)) return false;
      // Booking/checked teleports opt into recovery's occupancy admission locally. Ordinary resets retain their
      // native policy. Speculative admission must happen before reset (which mutates controller transaction state).
      if (requireClear && !placementDepartureClear(sampler, target, { ...support, departure }, (p) => {
        if (!placementWorld?.canPlace) return true;
        const floor = p === target ? g : sampler.sampleGround(p.x, p.z,
          { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'pavement', offCourse: false }, p.y);
        return placementWorld.canPlace({ reason: 'recover', initialSpeedMetresPerSecond: 0,
          discontinuitySerial: controller.placementSerial + 1,
          occupancyPose: controller.proposedPlacementOccupancyPose(p.x, p.z, h, floor),
          body: controller.dynamicBody(p.x, p.z, p.y, h, 0, 0) });
      })) return false;
      const placed = controller.reset({ position: { x: px, y: g.height, z: pz }, headingY: h });
      if (!placed) return false;
      controller.writePose(current);
      copyPose(current, previous);
      copyPose(current, render);
      tricks.reset();
      resetClearance();
      rig.setTrickPose(0, 0);
      accumulator = 0;
      recoveryPending = false;
      hopPendingUntil = -1;
      hopWasHeld = resetWasHeld = false;
      lastStumbleCount = controller.stumbleCount;
      events.length = 0;
      const wasDown = wasCrashed;
      wasCrashed = controller.crashed;
      if (wasDown && !wasCrashed) pushEvent({ type: 'recover' });
      rig.apply(render);
      headlight.update();
      this.position.set(render.x, render.y, render.z);
      this.heading = render.headingY;
      this.speed = 0;
      return placed;
    },

    clearInput(held = {}) {
      tricks.cancel();
      hopPendingUntil = -1;
      hopWasHeld = !!held.up;
      resetWasHeld = !!held.reset;
      recoveryPending = false;
    },

    dispose() {
      if (disposal) return disposal;
      disposed = true;
      this.clearInput();
      events.length = 0;
      // The renderer owner MUST await this promise before disposing its renderer/context.
      disposal = preparation.dispose().then(() => {
        scene.remove(rig.group);
        try { rig.dispose(); } finally {
          headlight.dispose();
          releaseAppearanceCaches();
        }
      });
      return disposal;
    },
  };
  const preparation = new RiderPreparation({
    prepare: prepareAppearance,
    release: releaseAppearanceCaches,
    construct(id, preparedAppearance) {
      const candidateRig = buildRig(id, preparedAppearance);
      try {
        candidateRig.setTrickPose(0, 0);
        candidateRig.apply(current);
        const lens = findLens(candidateRig);
        return { rig: candidateRig, group: candidateRig.group, lens, dispose() {
          candidateRig.group.removeFromParent();
          candidateRig.dispose();
        } };
      } catch (error) { candidateRig.dispose(); throw error; }
    },
    install(id, candidate) {
      if (disposed) return false;
      const oldRig = rig;
      const nextStyle = rideStyleFor(id);
      // Validate the candidate's final presentation before mutating committed controller/style identity.
      const nextPose = createPose();
      controller.writePose(nextPose);
      if (nextStyle !== controller.rideStyle || id === 'drunkard') {
        nextPose.styleSway = nextPose.styleYaw = nextPose.styleRoll = nextPose.styleStumble = 0;
      }
      candidate.rig.setTrickPose(0, 0);
      candidate.rig.apply(nextPose);
      // A confirmed same-rider rebuild also starts a fresh special-style history without resetting motion.
      if (id === 'drunkard' && controller.rideStyle === nextStyle) controller.setRideStyle(rideStyleFor('cool-rider'));
      controller.setRideStyle(nextStyle);
      controller.writePose(current);
      copyPose(current, previous);
      copyPose(current, render);
      tricks.reset();
      // Do not credit the old rider's unfinished flight to the replacement.
      if (!controller.isGrounded) { tricks.flight = controller.flightIndex; tricks.cancel(); }
      accumulator = 0;
      hopPendingUntil = -1;
      recoveryPending = false;
      wasCrashed = controller.crashed;
      lastStumbleCount = controller.stumbleCount;
      events.length = 0;
      rig = candidate.rig;
      resetClearance();
      riderId = id;
      scene.remove(oldRig.group);
      scene.add(rig.group);
      headlight.attach(rig, candidate.lens);
      headlight.update();
      entity.rig = rig;
      entity.mesh = rig.group;
      entity.riderId = riderId;
      entity.label = RIDERS[riderId].name;
      entity.position.set(render.x, render.y, render.z);
      entity.heading = render.headingY;
      entity.speed = render.speed;
      oldRig.dispose();
      releaseAppearanceCaches();
      return true;
    },
  });
  return entity;
}
