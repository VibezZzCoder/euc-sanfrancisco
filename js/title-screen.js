// js/title-screen.js — the title screen between the loading screen and the ride.
//
// The city is already running behind it: the camera circles the rider (cameras.js setTitleOrbit), and the rider can
// be changed here. Nothing reaches the ride until the player starts: the overlay covers the canvas and the touch
// layer, keys are caught before the game's own listeners, and main.js does not poll the gamepad for riding while it
// is open. Start with the Ride button, Enter or Space, or A on a gamepad. Start stays reserved for the map.

const START_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']);
const PAD = Object.freeze({ a: 0, b: 1, lb: 4, rb: 5, left: 14, right: 15 });

export class TitleScreen {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root          #title-overlay
   * @param {string[]} options.riders           playable rider ids, in button order
   * @param {(id: string) => void} options.onRider   open/highlight the shared confirmed-selection picker
   * @param {() => string} options.getRider     the current rider id
   * @param {() => void} options.onStart        called once after selected-sound readiness; the host authorizes saves here
   */
  constructor({ root, riders, onRider, onBrowse, getRider, getRiderName = id => id, onPrepareStart, onCancelStart,
    isBlocked = () => false, onActivity = () => {}, onStart }) {
    this.root = root;
    this.riders = riders;
    this.onRider = onRider;
    this.getRider = getRider;
    this.onStart = onStart;
    Object.assign(this, { onBrowse, getRiderName, onPrepareStart, onCancelStart, isBlocked, onActivity });
    this.preparing = false;
    this.startSerial = 0;
    this.keysDown = new Set();
    this.padReady = false;
    this.isOpen = false;
    this.started = false;
    this.padPrevious = null;
    this.padIndex = null;
    this.padId = null;
    this.focused = typeof document.hasFocus !== 'function' || document.hasFocus();
    this.rideButton = root?.querySelector('#title-ride') ?? null;
    this.riderButtons = root ? [...root.querySelectorAll('[data-title-rider]')] : [];
    this.pickerButton = root?.querySelector('#title-rider') ?? null;
    this.status = root?.querySelector('#title-status') ?? null;
    this.retryButton = root?.querySelector('#title-retry') ?? null;
    this.cancelButton = root?.querySelector('#title-cancel') ?? null;
    this.pickerButton?.addEventListener('click', () => { if (this.isOpen && this.canInteract()) this.onRider(this.getRider()); });
    this.retryButton?.addEventListener('click', () => this.start());
    this.cancelButton?.addEventListener('click', () => this.cancelPreparation());

    this.rideButton?.addEventListener('click', () => this.start());
    for (const btn of this.riderButtons) btn.addEventListener('click', () => {
      if (this.isOpen && this.canInteract()) this.onRider(btn.dataset.titleRider);
    });
    // Capture phase on window: runs before the game's key listeners, which never see a key while the title is up
    this.onKey = (e) => {
      const down = e.type === 'keydown', held = this.keysDown.has(e.code);
      if (down && !e.repeat) this.keysDown.add(e.code);
      else if (!down) this.keysDown.delete(e.code);
      if (!this.isOpen || this.isBlocked()) return;
      if (e.code === 'Tab') return; // keyboard focus still moves between the buttons
      // Enter on a title link keeps native new-tab navigation; never reaches the riding listeners.
      if (e.target?.closest?.('a[href]')) {
        e.stopImmediatePropagation();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!down || held || e.repeat || !this.canInteract()) return;
      if (this.preparing) {
        if (e.code === 'Escape' || (START_KEYS.has(e.code) && document.activeElement === this.cancelButton)) this.cancelPreparation();
        return;
      }
      if (START_KEYS.has(e.code)) {
        // Enter or Space on a focused rider button picks it; anywhere else they start the ride
        const focused = document.activeElement;
        if (focused === this.pickerButton) this.onRider(this.getRider());
        else if (focused === this.cancelButton) this.cancelPreparation();
        else if (focused?.dataset?.titleRider) this.onRider(focused.dataset.titleRider);
        else this.start();
      } else if (e.code === 'Digit1' || e.code === 'Digit2') {
        const id = this.riders[Number(e.code.slice(5)) - 1];
        if (id) this.onRider(id);
      } else if (e.code === 'KeyC') this.onRider(this.getRider());
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cycle(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cycle(1);
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    // Polling can pause entirely while hidden. The first returning sample only synchronizes holds.
    this.onBlur = () => { this.focused = false; this.resetInput(); };
    this.onFocus = () => { this.focused = true; this.resetInput(); };
    this.onVisibility = () => this.resetInput();
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  canInteract() {
    return !this.isBlocked() && !document.hidden && this.focused && (typeof document.hasFocus !== 'function' || document.hasFocus());
  }

  show() {
    if (!this.root || this.started) return;
    this.isOpen = true;
    this.padPrevious = null;
    this.setRider(this.getRider());
    document.body.classList.add('title-open');
    this.root.hidden = false;
    // Next frame, so the fade-in transition runs from the hidden state
    requestAnimationFrame(() => { if (this.isOpen) this.root.classList.add('is-shown'); });
    if (!matchMedia('(pointer: coarse)').matches) this.rideButton?.focus({ preventScroll: true });
  }

  start() {
    if (!this.isOpen || this.started || this.preparing || !this.canInteract()) return;
    if (!this.onPrepareStart) { this.finishStart(); return; }
    this.preparing = true;
    const serial = ++this.startSerial;
    this.rideButton.disabled = true;
    if (this.pickerButton) this.pickerButton.disabled = true;
    if (this.status) this.status.textContent = 'Preparing selected rider sounds…';
    if (this.retryButton) this.retryButton.hidden = true;
    if (this.cancelButton) this.cancelButton.hidden = false;
    this.cancelButton?.focus({ preventScroll: true });
    // Invocation is synchronous in the native gesture; the host unlocks audio BEFORE returning a promise.
    let preparation;
    try { preparation = this.onPrepareStart(); } catch (error) { preparation = Promise.reject(error); }
    Promise.resolve(preparation).then(() => {
      if (serial !== this.startSerial) return;
      if (!this.canInteract()) { this.cancelPreparation(); return; }
      this.preparing = false;
      this.finishStart();
    }).catch(error => {
      if (serial !== this.startSerial) return;
      this.preparing = false;
      this.rideButton.disabled = false;
      if (this.pickerButton) this.pickerButton.disabled = false;
      if (this.status) this.status.textContent = error?.name === 'AbortError' ? 'Preparation interrupted. Retry or cancel.'
        : `Could not prepare selected sounds. ${error?.message ?? 'Try again.'}`;
      if (this.retryButton) { this.retryButton.hidden = false; this.retryButton.focus({ preventScroll: true }); }
    });
  }

  finishStart() {
    this.started = true;
    this.isOpen = false;
    this.root.classList.remove('is-shown');
    document.body.classList.remove('title-open');
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    // CSS reduces transitions to 0.01ms; don't leave an invisible hit-blocking overlay for 500ms.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.root.hidden = true;
    else setTimeout(() => { this.root.hidden = true; }, 500);
    this.onStart();
  }

  /** Mark the rider in use (main.js calls it whenever the rider changes). */
  setRider(id) {
    const name = this.root?.querySelector('#title-rider-name');
    if (name) name.textContent = this.getRiderName(id);
    if (this.pickerButton) this.pickerButton.setAttribute('aria-label', `Choose rider. Currently ${this.getRiderName(id)}. Change rider`);
    for (const btn of this.riderButtons) {
      const on = btn.dataset.titleRider === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  cycle(step) {
    if (this.onBrowse) { this.onBrowse(step); return; }
    const i = this.riders.indexOf(this.getRider());
    this.onRider(this.riders[(i + step + this.riders.length) % this.riders.length]);
  }

  /** Each frame while open: A activates, LB / RB and the d-pad open metadata browsing (edges only). */
  update() {
    if (!this.isOpen || this.isBlocked()) return;
    let pad = null;
    try {
      for (const p of navigator.getGamepads?.() ?? []) {
        if (!p?.connected || p.mapping !== 'standard') continue;
        if (p.index === this.padIndex && p.id === this.padId) { pad = p; break; }
        if (!pad) pad = p;
      }
    } catch { /* no gamepad API */ }
    if (!pad) { this.padPrevious = null; this.padIndex = this.padId = null; return; }
    if (pad.index !== this.padIndex || pad.id !== this.padId) { this.padPrevious = null; this.padReady = false; }
    this.padIndex = pad.index;
    this.padId = pad.id;
    const pressed = Array.from({ length: 17 }, (_, i) => Boolean(pad.buttons?.[i]?.pressed) || pad.buttons?.[i]?.value > 0.5);
    const previous = this.padPrevious;
    const interactive = this.canInteract();
    if (interactive && (pressed.some(Boolean) || [...pad.axes ?? []].some(value => Math.abs(value) > .2))) this.onActivity();
    this.padPrevious = interactive ? pressed : null;
    if (!interactive) { this.padReady = false; return; }
    if (!this.padReady) {
      this.padReady = !pressed.some(Boolean) && !pad.buttons.some(button => button.value > 0.01)
        && Math.hypot(pad.axes?.[0] ?? 0, pad.axes?.[1] ?? 0) <= 0.15
        && Math.hypot(pad.axes?.[2] ?? 0, pad.axes?.[3] ?? 0) <= 0.15;
      return;
    }
    if (!previous) return; // a button already held when the pad appeared is not a press
    const edge = (i) => pressed[i] && !previous[i];
    if (edge(PAD.b) && (this.preparing || this.retryButton && !this.retryButton.hidden)) this.cancelPreparation();
    else if (edge(PAD.a)) {
      const focused = document.activeElement;
      if (focused?.closest?.('a[href]')) focused.click();
      else if (focused === this.pickerButton) this.onRider(this.getRider());
      else if (focused === this.cancelButton && !this.cancelButton.hidden) this.cancelPreparation();
      else this.start();
    }
    else if (edge(PAD.lb) || edge(PAD.left)) this.cycle(-1);
    else if (edge(PAD.rb) || edge(PAD.right)) this.cycle(1);
  }

  resetInput() { this.keysDown.clear(); this.padPrevious = null; this.padReady = false; }

  cancelPreparation() {
    const hadPreparation = this.preparing || (this.retryButton && !this.retryButton.hidden)
      || (this.cancelButton && !this.cancelButton.hidden);
    ++this.startSerial;
    this.onCancelStart?.();
    this.preparing = false;
    if (this.rideButton) this.rideButton.disabled = false;
    if (this.pickerButton) this.pickerButton.disabled = false;
    if (this.retryButton) this.retryButton.hidden = true;
    if (this.cancelButton) this.cancelButton.hidden = true;
    if (this.status && hadPreparation) this.status.textContent = 'Preparation cancelled. Ride when ready.';
    this.resetInput();
    if (this.isOpen && this.canInteract()) this.rideButton?.focus({ preventScroll: true });
  }

  dispose() {
    this.cancelPreparation();
    this.isOpen = false;
    if (this.root) this.root.hidden = true;
    document.body.classList.remove('title-open');
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
