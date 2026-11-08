// Booking ritual adapted from euc-newyork@7cf4ce7. Original code/dialogue © 2026 VibezZzCoder, MIT (see LICENSE).
// Pure lifecycle first; the optional DOM shell below catches input while main.js owns placement and the scene.
export const BOOKING_RULES = Object.freeze({ transferSeconds: 1.1, intakeSeconds: 3.6, signatureSeconds: 4.4,
  writeDelay: 1, tearSeconds: 2.4 });
export const BOOKING_TEXT = Object.freeze({
  captured: { heading: 'Busted.', line: 'Three warnings. One form.', reply: 'Dorkins is taking you to County Jail.' },
  intake: { heading: 'Intake.', line: 'Front wheel?', reply: '“That is the wheel.”' },
  signature: { heading: 'Official business.', line: 'Just needs my signature.', reply: '' },
  released: { heading: 'Released.', line: 'Paperwork’s gone. Case closed.', reply: 'Wheel count on release: 1. Still 1.' },
});

export function createBookingDirector(rules = BOOKING_RULES) {
  const state = { phase: 'idle', age: 0, number: 0, rider: '', knockdowns: 0, retry: 0 };
  return {
    state,
    get active() { return state.phase !== 'idle'; },
    start(rider, knockdowns) {
      if (state.phase !== 'idle') return false;
      Object.assign(state, { phase: 'captured', age: 0, number: state.number + 1, rider, knockdowns, retry: 0 });
      return true;
    },
    arrive() {
      if (state.phase !== 'captured') return false;
      state.phase = 'intake';
      state.age = 0;
      return true;
    },
    update(dt, visible = true) {
      if (!visible || !(dt > 0) || state.phase === 'idle' || state.phase === 'released') return null;
      state.age += dt;
      if (state.phase === 'captured') {
        state.retry -= dt;
        if (state.age < rules.transferSeconds || state.retry > 0) return null;
        state.retry = 0.5; // bounded retry if a pedestrian temporarily occupies intake
        return 'transfer';
      }
      const span = state.phase === 'intake' ? rules.intakeSeconds : rules.signatureSeconds;
      if (state.age < span) return null;
      state.age -= span;
      state.phase = state.phase === 'intake' ? 'signature' : 'released';
      return state.phase;
    },
    finish() {
      if (state.phase === 'idle') return false;
      state.phase = 'idle';
      state.age = 0;
      return true;
    },
  };
}

/** A native modal traps focus and makes the rest of the HUD inert. No background input path may bypass it. */
export class BookingScreen {
  constructor({ root, onRelease }) {
    this.root = root;
    this.onRelease = onRelease;
    this.last = {};
    this.phase = 'idle';
    this.suspended = false;
    this.focusBeforeSuspend = null;
    this.padPrevious = null;
    this.padIdentity = null;
    this.padReady = false;
    this.padNavigationReady = false;
    this.keysDown = new Set();
    this.blockedUntilUp = new Set();
    this.keyActivation = new Map();
    this.keyboardResync = false;
    this.heading = root.querySelector('#booking-heading');
    this.heading.tabIndex = -1; // safe initial focus, not an action or an extra Tab stop
    // Put the non-action focus target before Skip in the native sequential focus order.
    root.prepend(root.querySelector('.booking-heading'));
    this.skip = root.querySelector('#booking-skip');
    this.release = root.querySelector('#booking-release');
    const hint = root.querySelector('.booking-pad-hint');
    hint.textContent = 'D-pad / left stick: select · A: activate';
    root.querySelector('.booking-heading').append(hint); // visible even during the captured phase
    this.onClick = () => this.finish();
    this.onCancel = (e) => { e.preventDefault(); };
    this.onPointerDown = () => { root.dataset.padFocus = 'false'; };
    this.skip.addEventListener('click', this.onClick);
    this.release.addEventListener('click', this.onClick);
    root.addEventListener('cancel', this.onCancel);
    root.addEventListener('pointerdown', this.onPointerDown);
    this.onKey = (e) => {
      const down = e.type === 'keydown', held = this.keysDown.has(e.code);
      if (down && !e.repeat) this.keysDown.add(e.code);
      else if (!down) this.keysDown.delete(e.code);
      if (this.phase === 'idle') {
        // A held booking/riding key must be released before it can affect the ride again.
        // After focus loss, an orphan repeat/key-up cannot substitute for an observed fresh press.
        if (this.blockedUntilUp.has(e.code) || (this.keyboardResync && !held && (e.repeat || !down))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!down) this.blockedUntilUp.delete(e.code);
        }
        return;
      }
      root.dataset.padFocus = 'false';
      if (e.code === 'Tab') return; // native modal focus traversal
      e.stopImmediatePropagation();
      const target = document.activeElement;
      const action = target === this.skip || (target === this.release && !this.release.disabled);
      const confirm = ['Enter', 'NumpadEnter', 'Space'].includes(e.code);
      const fresh = down && !held && !e.repeat;
      // Keep the button's native Enter/Space click, but only for a fresh press begun on that button.
      const activate = confirm && action && (down ? fresh : this.keyActivation.get(e.code) === target);
      if (down && activate) this.keyActivation.set(e.code, target);
      else if (!down) this.keyActivation.delete(e.code);
      if (!activate) e.preventDefault();
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    this.onReset = () => {
      this.resetPad();
      this.keyActivation.clear();
      // Key-up may happen in another tab/window. Forget stale holds, not the fresh-press requirement.
      this.keysDown.clear();
      this.blockedUntilUp.clear();
      this.keyboardResync = true;
    };
    window.addEventListener('blur', this.onReset);
    document.addEventListener('visibilitychange', this.onReset);
  }

  // Close synchronously so boot can focus Retry before renderer work is drained.
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.phase = 'idle';
    this.suspended = false;
    this.focusBeforeSuspend = null;
    this.root.dataset.suspended = 'false';
    if (this.root.open) this.root.close();
    document.body.classList.remove('booking-open');
    this.skip.removeEventListener('click', this.onClick);
    this.release.removeEventListener('click', this.onClick);
    this.root.removeEventListener('cancel', this.onCancel);
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.onReset);
    document.removeEventListener('visibilitychange', this.onReset);
    this.keysDown.clear();
    this.blockedUntilUp.clear();
    this.keyActivation.clear();
    this.resetPad();
  }

  resetPad() {
    this.padPrevious = null;
    this.padIdentity = null;
    this.padReady = false;
    this.padNavigationReady = false;
  }

  setSuspended(suspended) {
    suspended = !!suspended;
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.root.dataset.suspended = String(suspended);
    if (suspended) {
      this.focusBeforeSuspend = this.root.contains(document.activeElement) ? document.activeElement : null;
      this.resetPad();
    } else {
      const target = this.focusBeforeSuspend;
      this.focusBeforeSuspend = null;
      if (this.phase !== 'idle' && !this.root.contains(document.activeElement)) {
        (target && this.root.contains(target) && !target.disabled && !target.hidden ? target : this.heading)
          .focus({ preventScroll: true });
      }
    }
  }

  set(key, value, write) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    write(value);
  }

  finish() {
    if (this.phase === 'idle' || this.suspended) return;
    if (this.onRelease()) return;
    this.root.querySelector('#booking-note').textContent = 'Exit unavailable. Try again or reload your last checkpoint.';
    this.root.querySelector('.booking-subtitle').textContent = 'Exit unavailable. Try again or reload your last checkpoint.';
  }

  update(state) {
    if (state.phase === 'idle') {
      if (this.phase !== 'idle') {
        this.blockedUntilUp = new Set(this.keysDown);
        this.keyActivation.clear();
        this.resetPad();
        this.root.close();
        document.body.classList.remove('booking-open');
      }
      this.phase = 'idle';
      this.suspended = false;
      this.focusBeforeSuspend = null;
      this.root.dataset.suspended = 'false';
      return;
    }
    const opening = this.phase === 'idle';
    this.phase = state.phase;
    if (opening) {
      this.last = {};
      this.resetPad();
      this.keyActivation.clear();
      this.root.dataset.padFocus = 'false';
      document.body.classList.add('booking-open');
      this.root.showModal();
      this.heading.focus({ preventScroll: true });
    }
    this.set('phase', state.phase, (phase) => {
      this.root.dataset.phase = phase;
      this.root.querySelector('.booking-subtitle').textContent = phase === 'captured' ? 'Transfer to intake' : 'Vehicle processing';
      const copy = BOOKING_TEXT[phase];
      for (const key of ['heading', 'line', 'reply']) this.root.querySelector(`#booking-${key}`).textContent = copy[key];
      this.root.querySelector('#booking-stamp').textContent = phase === 'released' ? 'RELEASED' : 'VOID';
      this.root.querySelector('#booking-note').textContent = phase === 'released'
        ? 'Heat cleared. No fine. Keep rolling.' : 'Please remain at the desk.';
      this.release.disabled = phase !== 'released';
      if (phase === 'released') {
        this.keyActivation.clear();
        this.release.focus({ preventScroll: true });
      }
    });
    this.set('rider', state.rider, (name) => { this.root.querySelector('#booking-rider').textContent = name; });
    this.set('number', state.number, (n) => { this.root.querySelector('#booking-number').textContent = `EUC-${String(n).padStart(3, '0')}`; });
    const torn = state.phase === 'released' || (state.phase === 'signature' && state.age >= BOOKING_RULES.tearSeconds);
    this.set('torn', torn, (value) => { this.root.dataset.torn = String(value); });
    const signing = state.phase === 'signature' && state.age >= BOOKING_RULES.writeDelay;
    this.set('signing', signing, (value) => { this.root.dataset.signing = String(value); });
  }

  /** Neutral first, then navigate to a visible button and confirm on a separate fresh A edge. */
  updateGamepad() {
    if (this.phase === 'idle' || this.suspended || document.hidden || !document.hasFocus()) { this.resetPad(); return; }
    let pad = null;
    try { pad = [...navigator.getGamepads?.() ?? []].find((p) => p?.connected && p.mapping === 'standard'); } catch { /* optional */ }
    if (!pad) { this.resetPad(); return; }
    if (pad.index !== this.padIdentity?.index || pad.id !== this.padIdentity?.id) {
      this.resetPad();
      this.padIdentity = { index: pad.index, id: pad.id };
    }
    const pressed = Array.from({ length: 17 }, (_, i) => !!pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5);
    const before = this.padPrevious;
    this.padPrevious = pressed;
    const axes = [0, 1, 2, 3].map((i) => Number.isFinite(pad.axes?.[i]) ? pad.axes[i] : 0);
    if (!this.padReady) {
      // Include partial triggers and both sticks, not just digital buttons used by this UI.
      this.padReady = !pressed.some(Boolean) && !pad.buttons.some((b) => b.value > 0.01)
        && Math.hypot(axes[0], axes[1]) <= 0.15 && Math.hypot(axes[2], axes[3]) <= 0.15;
      this.padNavigationReady = this.padReady;
      return;
    }
    if (!before) return;
    const target = document.activeElement;
    const direction = pressed[13] || pressed[15] || axes[0] > 0.5 || axes[1] > 0.5 ? 1
      : pressed[12] || pressed[14] || axes[0] < -0.5 || axes[1] < -0.5 ? -1 : 0;
    if (!pressed.slice(12, 16).some(Boolean) && Math.hypot(axes[0], axes[1]) <= 0.15) this.padNavigationReady = true;
    if (direction && this.padNavigationReady) {
      this.padNavigationReady = false;
      this.root.dataset.padFocus = 'true';
      const actions = this.release.disabled ? [this.skip] : [this.skip, this.release];
      const index = actions.indexOf(target);
      const next = index < 0 ? (direction > 0 ? 0 : actions.length - 1)
        : (index + direction + actions.length) % actions.length;
      actions[next].focus({ preventScroll: true });
      return; // navigation and confirmation in the same sample cannot select AND activate Skip
    }
    if (pressed[0] && !before[0]
      && (target === this.skip || (target === this.release && !this.release.disabled))) target.click();
  }
}
