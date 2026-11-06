// NYC Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Presentation/recognition only. Native one-foot timing is vendored from EUC Thrills
// @5f45fff19b258e140833841ba2473069af751a12, src/app/oneFootPose.ts.
// The tuck reuses that airborne dwell/return lifecycle with a separate held control.
import { createOneFootPose, stepOneFootFromController, resetOneFoot, cancelOneFoot } from './euc/app/oneFootPose.js';

export const TRICK_FEEDBACK_SECONDS = 2.5;
export const FAKIE_SECONDS = 0.8;
export const FAKIE_METRES = 1.5;
export const FAKIE_MIN_SPEED = 0.75;

export class RiderTricks {
  constructor() {
    this.foot = createOneFootPose();
    this.tuck = createOneFootPose();
    this.reset();
  }

  reset() {
    resetOneFoot(this.foot);
    resetOneFoot(this.tuck);
    this.previousFoot = this.previousTuck = 0;
    this.flight = -1;
    this.cancelledFlight = -1;
    this.hasFoot = this.hasTuck = this.hasSpin = false;
    this.clearFeedback();
  }

  clearFeedback() {
    this.label = '';
    this.labelSeconds = 0;
    this.fakieBase = '';
    this.fakieSeconds = this.fakieDistance = 0;
  }

  // Input boundaries cancel the gesture gently and discard this flight's award.
  // A resumed hold cannot turn an interrupted flight into a fresh trick.
  cancel() {
    cancelOneFoot(this.foot);
    cancelOneFoot(this.tuck);
    this.cancelledFlight = this.flight;
    this.clearFeedback();
  }

  announce(label) {
    this.label = label;
    this.labelSeconds = TRICK_FEEDBACK_SECONDS;
  }

  /** Called after the controller's finalized fixed step and writePose. */
  step(dt, controller, pose, hopHeld, crouchHeld) {
    this.previousFoot = this.foot.oneFoot;
    this.previousTuck = this.tuck.oneFoot;
    this.labelSeconds = Math.max(0, this.labelSeconds - dt);
    if (!this.labelSeconds) this.label = '';

    if (controller.flightIndex !== this.flight) {
      this.flight = controller.flightIndex;
      this.hasFoot = this.hasTuck = this.hasSpin = false;
      this.fakieBase = '';
      this.fakieSeconds = this.fakieDistance = 0;
    }
    stepOneFootFromController(this.foot, controller, pose.recoverBlend, dt, hopHeld, false);
    stepOneFootFromController(this.tuck, controller, pose.recoverBlend, dt, crouchHeld, false);
    if (controller.crashed || pose.recoverBlend < 1) {
      this.clearFeedback();
      this.cancelledFlight = this.flight;
      return;
    }
    if (this.cancelledFlight === this.flight) return;

    // Credit a readable pose, not just a held key or a refused/aborted entry.
    this.hasFoot ||= this.foot.oneFoot >= 0.8;
    this.hasTuck ||= this.tuck.oneFoot >= 0.8;
    this.hasSpin ||= controller.spinCompleted;
    if (controller.touchedDown && controller.lastLandingQuality !== 'crash') {
      let label = this.hasSpin ? (this.hasFoot ? 'One-foot 180' : '180') : (this.hasFoot ? 'One-foot air' : '');
      if (this.hasTuck) label += (label ? ' + ' : '') + 'Air tuck';
      if (label) this.announce(label);
      this.fakieBase = this.hasSpin && pose.speed < -FAKIE_MIN_SPEED ? label : '';
      this.fakieSeconds = this.fakieDistance = 0;
    }
    if (this.fakieBase) {
      // Must be one continuous, grounded backward ride-out of this landed spin.
      // Simply reversing from rest, waiting still, or hopping again cannot qualify.
      if (!controller.isGrounded || pose.speed > -FAKIE_MIN_SPEED) {
        this.fakieBase = '';
      } else {
        this.fakieSeconds += dt;
        this.fakieDistance += -pose.speed * dt;
        if (this.fakieSeconds >= FAKIE_SECONDS && this.fakieDistance >= FAKIE_METRES) {
          this.announce(`${this.fakieBase} → Fakie`);
          this.fakieBase = '';
        }
      }
    }
  }

  /** Overlay only the interpolated render pose; never feed these values into physics. */
  apply(pose, alpha, rig) {
    const foot = this.previousFoot + (this.foot.oneFoot - this.previousFoot) * alpha;
    const tuck = this.previousTuck + (this.tuck.oneFoot - this.previousTuck) * alpha;
    rig.setTrickPose(foot, this.foot.side);
    // Native air crouch is modest. The held tuck adds a deep knee bend and the
    // existing forward torso/arm pose, then releases before projected touchdown.
    pose.crouch += (1 - pose.crouch) * tuck;
    pose.tuck = Math.max(pose.tuck, tuck);
  }
}
