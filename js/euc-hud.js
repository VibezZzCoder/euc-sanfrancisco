// js/euc-hud.js — the wheel's HUD cues: speed in both units, the power ladder, tilt-back, the over-speed warning and
// the "get up" prompt after a crash.
//
// The cue logic is ported from EUC Thrills @5f45fff (src/ui/hudModel.ts: warning labels, the rising-at-once /
// falling-after-0.7 s dwell, tilt-back overriding the ladder, cues cleared while crashed; src/shared/overspeed.ts:
// overspeedLevel). The over-speed blink shares overspeedBeepPeriod with the beeps (euc-audio.js), so they stay in step.
// The get-up prompt is this fork's own: upstream remounts on any riding input and has no prompt.
//
// The model (createHudModel, getUpPrompt, formatSpeed) is pure and tested headless. EucHud writes the DOM, touching a
// node only when its value changes, so it can run every frame.
import { overspeedBeepPeriod } from './euc-audio.js';

export const MS_TO_MPH = 2.236936;
export const MS_TO_KMH = 3.6;
export const WARNING_MIN_VISIBLE_SECONDS = 0.7;
/** Seconds after a crash before the get-up prompt shows: the rider has hit the ground, the camera has settled. */
export const GET_UP_PROMPT_DELAY = 0.8;

export const WARNING_LABELS = Object.freeze({
  none: '',
  notice: 'Working hard',
  warn: 'Ease off',
  tiltBack: 'Tilt-back: slow down'
});

const RANK = Object.freeze({ none: 0, notice: 1, warn: 2, tiltBack: 3 });

/** Whole units, no sign (reversing is not a negative speed on a dash), never "-0". */
export function formatSpeed(metresPerSecond, unit) {
  const v = Math.abs(Number.isFinite(metresPerSecond) ? metresPerSecond : 0) * (unit === 'kmh' ? MS_TO_KMH : MS_TO_MPH);
  const rounded = Math.round(v);
  return rounded === 0 ? '0' : String(rounded);
}

/** EUC Thrills' over-speed colour steps over the 0..1 band between the first beep and the cutout. */
export function overspeedLevel(factor) {
  if (!(factor > 0)) return 'none';
  if (factor >= 0.78) return 'critical';
  if (factor >= 0.42) return 'warn';
  return 'notice';
}

function warningFor(stage) {
  return Object.hasOwn(RANK, stage) && stage !== 'normal' ? stage : 'none';
}

/**
 * Per-frame cue state. update({ crashed, powerStage, tiltBack, overspeed }, nowSeconds) returns
 * { warning, warningLabel, overspeed: { visible, level, period } }.
 */
export function createHudModel() {
  let warning = 'none';
  let since = -Infinity;
  const hidden = { visible: false, level: 'none', period: 0 };
  return {
    reset() {
      warning = 'none';
      since = -Infinity;
    },
    update({ crashed = false, powerStage = 'normal', tiltBack = 0, overspeed = 0 } = {}, now = 0) {
      if (crashed) {
        this.reset();
        return { warning: 'none', warningLabel: '', overspeed: hidden };
      }
      const target = warningFor(powerStage);
      if (RANK[target] > RANK[warning]) {
        warning = target;
        since = now;
      } else if (target === warning) {
        since = now;
      } else if (now - since >= WARNING_MIN_VISIBLE_SECONDS) {
        warning = target;
        since = now;
      }
      const shown = tiltBack > 0.02 ? 'tiltBack' : warning;
      const factor = Number.isFinite(overspeed) ? overspeed : 0;
      return {
        warning: shown,
        warningLabel: WARNING_LABELS[shown],
        overspeed: factor > 0
          ? { visible: true, level: overspeedLevel(factor), period: Math.round(overspeedBeepPeriod(factor) * 100) / 100 }
          : hidden
      };
    }
  };
}

/** What to press to get up, per input device: { keys: [...], verb, text } or null when no prompt is due. */
export function getUpPrompt({ crashed = false, crashTime = 0 } = {}, device = 'keyboard') {
  if (!crashed || !(crashTime >= GET_UP_PROMPT_DELAY)) return null;
  if (device === 'gamepad') return { keys: ['B'], verb: 'Press', text: 'to get up' };
  if (device === 'touch') return { keys: ['GET UP'], verb: 'Tap', text: 'to ride on' };
  return { keys: ['R'], verb: 'Press', text: 'to get up' };
}

/** DOM writer for the cues. Every element is optional, so a trimmed page still runs. */
export class EucHud {
  constructor(doc = document) {
    this.model = createHudModel();
    this.el = {
      warning: doc.getElementById('hud-warning'),
      trick: doc.getElementById('hud-trick'),
      overspeed: doc.getElementById('hud-overspeed'),
      getUp: doc.getElementById('hud-getup'),
      getUpVerb: doc.getElementById('hud-getup-verb'),
      getUpKey: doc.getElementById('hud-getup-key'),
      getUpText: doc.getElementById('hud-getup-text')
    };
    this.body = doc.body;
    this.last = {};
  }

  set(key, value, write) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    write(value);
  }

  /** One frame. `controller` is the vendored EucController; `device` is 'keyboard' | 'gamepad' | 'touch'. */
  update(controller, now, device, trickLabel = '') {
    const crashed = !!controller.crashed;
    const view = this.model.update({
      crashed,
      powerStage: controller.powerWarning,
      tiltBack: controller.tiltBack,
      overspeed: controller.overspeed
    }, now);
    const { warning, overspeed, getUp } = this.el;
    if (this.el.trick) {
      this.set('trick', crashed ? '' : trickLabel, (label) => {
        this.el.trick.textContent = label ? `Landed · ${label}` : '';
        this.el.trick.hidden = !label;
      });
    }
    if (warning) {
      this.set('warning', view.warning, (w) => {
        warning.textContent = WARNING_LABELS[w];
        warning.dataset.level = w;
        warning.hidden = w === 'none';
      });
    }
    if (overspeed) {
      this.set('overspeedLevel', view.overspeed.level, (level) => {
        overspeed.dataset.level = level;
        overspeed.hidden = level === 'none';
      });
      this.set('overspeedPeriod', view.overspeed.period, (p) => overspeed.style.setProperty('--beep-period', `${p || 1}s`));
    }
    if (getUp) {
      const prompt = getUpPrompt({ crashed, crashTime: controller.crashTime }, device);
      const key = prompt ? `${prompt.verb}|${prompt.keys.join('+')}|${prompt.text}|${device}` : '';
      this.set('getUp', key, () => {
        getUp.hidden = !prompt;
        this.body?.classList.toggle('is-down', !!prompt);
        if (!prompt) return;
        getUp.dataset.device = device;
        if (this.el.getUpVerb) this.el.getUpVerb.textContent = prompt.verb;
        if (this.el.getUpKey) {
          this.el.getUpKey.textContent = prompt.keys.join(' ');
          if (device === 'gamepad') this.el.getUpKey.dataset.pad = prompt.keys[0];
          else delete this.el.getUpKey.dataset.pad;
        }
        if (this.el.getUpText) this.el.getUpText.textContent = prompt.text;
      });
    }
  }
}
