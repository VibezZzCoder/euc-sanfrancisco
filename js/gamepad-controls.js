import { isTypingInField } from './city-api.js';

const DEAD_ZONE = 0.15;
const BUTTON_COUNT = 17;

function axis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function stick(pad, offset) {
  const x = axis(pad.axes?.[offset]), y = axis(pad.axes?.[offset + 1]);
  const distance = Math.hypot(x, y);
  const strength = Math.max(0, (Math.min(distance, 1) - DEAD_ZONE) / (1 - DEAD_ZONE));
  return distance ? { x: x / distance * strength, y: y / distance * strength } : { x: 0, y: 0 };
}

function buttonValue(pad, index) {
  const button = pad.buttons?.[index];
  return Number.isFinite(button?.value) ? Math.max(0, Math.min(1, button.value)) : button?.pressed ? 1 : 0;
}

// Any stick past the dead zone or any pressed button: the player is using this pad (on-screen prompts follow it)
function active(pad, pressed) {
  if (pressed.some(Boolean)) return true;
  return [0, 2].some((offset) => {
    const s = stick(pad, offset);
    return Math.hypot(s.x, s.y) > 0;
  }) || buttonValue(pad, 6) > 0.01 || buttonValue(pad, 7) > 0.01;
}

function buttons(pad) {
  return Array.from({ length: BUTTON_COUNT }, (_, i) => Boolean(pad.buttons?.[i]?.pressed) || buttonValue(pad, i) > 0.5);
}

class GamepadControls {
  constructor(controllerManager, cameraSystem, callbacks = {}) {
    this.controller = controllerManager;
    this.camera = cameraSystem;
    this.callbacks = callbacks;
    this.connected = false;
    this.enabled = true;
    this.padIndex = null;
    this.padId = null;
    this.previousButtons = [];
    this.suppressedButtons = [];
    this.suppressedSticks = [false, false];
    this.suppressedTriggers = [false, false];
    this.syncButtons = true;
    this.revision = 0;
    this.wasActive = false;
    this.mapOwned = false;
    this.mapNeedsNeutral = true;
    this.mapFocus = null;
    this.focused = typeof document.hasFocus !== 'function' || document.hasFocus();

    window.addEventListener('blur', () => {
      this.focused = false;
      this.reset();
    });
    window.addEventListener('focus', () => {
      this.focused = true;
      this.reset();
    });
    document.addEventListener('visibilitychange', () => this.reset());
    window.addEventListener('resize', () => this.reset());
  }

  readPad() {
    // Some browsers expose the API but reject it through Permissions Policy.
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
      const pads = navigator.getGamepads();
      let first = null;
      for (let i = 0; i < (pads?.length || 0); i++) {
        const pad = pads[i];
        if (!pad?.connected || pad.mapping !== 'standard') continue;
        if (pad.index === this.padIndex && pad.id === this.padId) return pad;
        if (!first) first = pad;
      }
      return first;
    } catch {
      return null;
    }
  }

  suppressAnalog(pad) {
    this.suppressedSticks = [0, 2].map((offset) => {
      const s = pad ? stick(pad, offset) : { x: 0, y: 0 };
      return Math.hypot(s.x, s.y) > 0;
    });
    this.suppressedTriggers = [6, 7].map((i) => !!pad && buttonValue(pad, i) > 0.01);
  }

  reset() {
    this.revision++;
    this.mapNeedsNeutral = true;
    this.controller.clearGamepadInput();
    const pad = this.readPad();
    this.suppressAnalog(pad);
    if (pad && pad.index === this.padIndex && pad.id === this.padId) {
      this.previousButtons = buttons(pad);
      this.suppressedButtons = this.previousButtons.slice();
      this.syncButtons = false;
    } else {
      this.syncButtons = true;
    }
  }

  setEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reset();
  }

  update(dt) {
    const pad = this.readPad();
    // Map polling is independent of the riding gate. The host supplies its authoritative owner,
    // not merely whether a covered map happens to remain visible behind another dialog.
    const mapOwned = Boolean(this.callbacks.isMapOpen?.());
    if (mapOwned !== this.mapOwned) {
      this.mapOwned = mapOwned;
      this.mapFocus = document.activeElement;
      this.reset();
    }
    const connected = Boolean(pad);
    const changedPad = pad ? pad.index !== this.padIndex || pad.id !== this.padId : this.connected;
    if (changedPad) {
      this.mapNeedsNeutral = true;
      this.controller.clearGamepadInput();
      this.padIndex = pad ? pad.index : null;
      this.padId = pad ? pad.id : null;
      this.syncButtons = true;
      this.suppressAnalog(pad);
    }
    this.connected = connected;
    if (!pad) return;

    const pressed = buttons(pad);
    if (this.syncButtons) {
      // Connecting, switching pads, or resetting must not turn a held button into a fresh action.
      this.previousButtons = pressed.slice();
      this.suppressedButtons = pressed.slice();
      this.syncButtons = false;
    }
    for (let i = 0; i < BUTTON_COUNT; i++) if (!pressed[i]) this.suppressedButtons[i] = false;
    const edge = (i) => pressed[i] && !this.previousButtons[i] && !this.suppressedButtons[i];
    const held = (i) => pressed[i] && !this.suppressedButtons[i];
    // Capture edges before callbacks: changing rider or opening the map may synchronously call reset().
    const toggleMap = edge(9), toggleMenu = edge(8), closeMap = edge(1);
    const cycleRider = Number(Boolean(edge(5))) - Number(Boolean(edge(4)));
    const cycleCamera = edge(3), recenter = edge(11);
    const mapActions = { activate: edge(0), recenter: edge(2), fit: edge(3),
      navigate: Number(Boolean(edge(13) || edge(15))) - Number(Boolean(edge(12) || edge(14))) };
    const wasActive = this.wasActive;
    this.wasActive = active(pad, pressed);
    this.previousButtons = pressed;

    const target = document.activeElement;
    const typing = isTypingInField({ target }) || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    if (!this.focused || document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()) || (typing && !mapOwned)) {
      this.mapNeedsNeutral = true;
      this.suppressedButtons = pressed.slice();
      // A stick/partial trigger may move after focus was lost (or while typing). Snapshot every
      // blocked poll so restoring focus cannot treat that displacement as fresh riding/look input.
      this.suppressAnalog(pad);
      this.controller.clearGamepadInput();
      return;
    }

    if (this.wasActive && !wasActive) this.callbacks.onActivity?.();
    const revision = this.revision;
    if (mapOwned) {
      this.controller.clearGamepadInput();
      if (this.mapFocus !== target) {
        this.mapFocus = target;
        this.mapNeedsNeutral = true;
      }
      const movement = stick(pad, 0), look = stick(pad, 2);
      const neutral = !Math.hypot(movement.x, movement.y, look.x, look.y) &&
        pressed.every((value, i) => !value && buttonValue(pad, i) <= 0.01);
      if (this.mapNeedsNeutral) {
        this.suppressAnalog(pad);
        this.suppressedButtons = pressed.slice();
        if (neutral) {
          this.mapNeedsNeutral = false;
          this.callbacks.onMapInput?.({ movement, look, zoom: 0, actions: {}, neutral: true }, 0);
        }
        return;
      }
      // Closing or changing owner consumes the entire sample, including simultaneous A/sticks.
      if (toggleMenu || toggleMap || closeMap) {
        this.reset();
        if (toggleMenu) this.callbacks.onToggleMenu?.();
        else if (toggleMap) this.callbacks.onToggleMap?.();
        else this.callbacks.onCloseMap?.();
        return;
      }
      this.callbacks.onMapInput?.({ movement, look,
        zoom: buttonValue(pad, 7) - buttonValue(pad, 6), neutral,
        actions: mapActions
      }, Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0);
      return;
    }
    if (toggleMenu) {
      this.reset();
      this.callbacks.onToggleMenu?.();
      return;
    }
    if (toggleMap) {
      this.reset();
      this.callbacks.onToggleMap?.();
      return;
    }
    if (!this.enabled || this.controller.inputEnabled === false) {
      this.controller.clearGamepadInput();
      this.suppressAnalog(pad);
      for (let i = 0; i < BUTTON_COUNT; i++) if (i !== 1 && i !== 9) this.suppressedButtons[i] = pressed[i];
      if (closeMap) this.callbacks.onCloseMap?.();
      return;
    }
    if (cycleRider) this.callbacks.onCycleRider?.(cycleRider);
    if (revision !== this.revision) return;
    if (cycleCamera) this.callbacks.onCycleCamera?.(1);
    if (revision !== this.revision) return;
    if (recenter) this.camera.resetOrbit();

    // EUC: lean with RT / LT or the left stick's Y, carve with its X; A hops, X crouches, B gets up after a crash
    const movement = stick(pad, 0), look = stick(pad, 2);
    for (const [i, s] of [movement, look].entries()) {
      if (!this.suppressedSticks[i]) continue;
      if (Math.hypot(s.x, s.y) === 0) this.suppressedSticks[i] = false;
      else s.x = s.y = 0;
    }
    const lean = -movement.y;
    const trigger = (i) => {
      const value = buttonValue(pad, i), slot = i - 6;
      if (this.suppressedTriggers[slot] && value <= 0.01) this.suppressedTriggers[slot] = false;
      return this.suppressedTriggers[slot] || this.suppressedButtons[i] ? 0 : value;
    };
    const drive = Math.max(0, lean, trigger(7)) - Math.max(0, -lean, trigger(6));
    this.controller.setGamepadInput('forward', Math.max(0, drive));
    this.controller.setGamepadInput('backward', Math.max(0, -drive));
    this.controller.setGamepadInput('left', Math.max(0, -movement.x));
    this.controller.setGamepadInput('right', Math.max(0, movement.x));
    this.controller.setGamepadInput('up', Number(Boolean(held(0))));
    this.controller.setGamepadInput('boost', Number(Boolean(held(2))));
    this.controller.setGamepadInput('reset', Number(Boolean(held(1))));
    const zoom = Number(Boolean(held(13))) - Number(Boolean(held(12)));
    this.camera.applyGamepadInput(look.x, look.y, zoom, Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0);
  }
}

export { GamepadControls };
