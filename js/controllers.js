import { getCity, getSfSpawn, isTypingInField } from './city-api.js';
import { SfTerrainSampler } from './sf-terrain-sampler.js';
import { createEucEntity } from './euc-rider.js';

// js/controllers.js — the player: one electric unicycle (EUC Thrills' controller and rider, see euc-rider.js).
// This module owns input blending (keyboard, touch, gamepad), teleports, and the city queries other systems share
// (ground height, colliders near a point). The EUC controller owns the rider's motion.

// Actions the rider reads as presses (edges), not levels: hop and get up
const ONE_SHOT_ACTIONS = new Set(['up', 'reset']);
const INPUT_ACTIONS = ['forward', 'backward', 'left', 'right', 'up', 'boost', 'reset'];
// Checked spots a teleport offers placeAt before reporting refusal (each refusal leaves the rider untouched).
const TELEPORT_PLACE_ATTEMPTS = 8;
// Matches placeAt's bounded placementDepartureClear policy in euc-recovery.js.
const TELEPORT_MAX_DEPARTURE = 1.2;

function interactiveTarget(target) {
  return !!target && (target.isContentEditable
    || ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'A', 'SUMMARY'].includes(target.tagName)
    || !!target.closest?.('button, input, select, textarea, a[href], summary, audio[controls], video[controls],'
      + ' [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]),'
      + ' [role="button"], [role="link"], [role="slider"], [role="textbox"], [role="combobox"], [role="listbox"],'
      + ' [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="tab"]'));
}

class ThirdPersonControllerManager {
  // Await prepareEucRider(rider) before construction, and pass the returned appearance here.
  constructor(scene, colliders = [], { ride = getCity().ride, rider = 'cool-rider', appearance, dynamicWorld,
    inputEnabled = true, sampler, spawn } = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this._colliderCells = null; // built on first use, see nearColliders()
    this.activeMode = 'euc'; // the only mode; kept as a field for the systems that read it
    this.inputEnabled = !!inputEnabled;
    this.eucSampler = sampler ?? new SfTerrainSampler({ city: getCity(), colliders, ride });
    spawn ??= getSfSpawn();

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false, // hop
      boost: false, // crouch
      reset: false, // get up after a crash
      hopPressed: false,
      resetPressed: false
    };

    this.entities = {
      euc: createEucEntity(this.scene, this.eucSampler, { ...spawn, rider, appearance, dynamicWorld })
    };

    this.bindKeyboard();
  }

  setCollisionListener(listener) {
    this._collisionListener = typeof listener === 'function' ? listener : null;
    this._collisionEvent ??= { a: null, b: null, kind: '', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, speed: 0 };
  }

  // Reuse one synchronous event; consumers must copy retained fields. Normal points from b toward a.
  reportCollision(a, b, kind, x, y, z, nx, ny, nz, speed) {
    if (!this._collisionListener || speed <= 0.5) return;
    const event = this._collisionEvent;
    event.a = a; event.b = b; event.kind = kind;
    event.x = x; event.y = y; event.z = z;
    event.nx = nx; event.ny = ny; event.nz = nz; event.speed = speed;
    this._collisionListener(event);
  }

  bindKeyboard() {
    const bindings = {
      forward: ['KeyW', 'ArrowUp'],
      backward: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      up: ['Space'],
      boost: ['ShiftLeft', 'ShiftRight'],
      reset: ['KeyR']
    };
    const actionsByCode = new Map(Object.entries(bindings).flatMap(([action, codes]) => codes.map((code) => [code, action])));
    this._pressedCodes = new Set();
    this._tapped = new Map(); // action -> sources pressed since the last frame (including subframe taps)
    this._keyboardKeys = {};
    this._touchKeys = {};
    this._gamepadKeys = {};

    const onKey = (e, isDown) => {
      const action = actionsByCode.get(e.code);
      if (!action) return;
      // Key-up always clears, including a release over a focused native control or with modifiers held.
      if (isDown && (this.inputEnabled === false || e.ctrlKey || e.metaKey || e.altKey || e.isComposing
        || e.defaultPrevented || isTypingInField(e) || interactiveTarget(e.target) || interactiveTarget(document.activeElement)
        || (e.repeat && !this._pressedCodes.has(e.code)))) return;
      const pressed = isDown && !this._pressedCodes.has(e.code);
      if (isDown) this._pressedCodes.add(e.code);
      else this._pressedCodes.delete(e.code);
      // Releasing one binding must not cancel another key held for the same action.
      this._keyboardKeys[action] = bindings[action].some((code) => this._pressedCodes.has(code));
      this._blendInput(action, pressed ? 'keyboard' : null);
    };

    this._inputListeners = [
      [window, 'keydown', (e) => onKey(e, true)],
      [window, 'keyup', (e) => onKey(e, false)],
      [window, 'blur', () => this.resetInput()],
      [document, 'visibilitychange', () => { if (document.hidden) this.resetInput(); }],
    ];
    for (const [target, type, listener] of this._inputListeners) target.addEventListener(type, listener);
  }

  _blendInput(action, pressedSource = null) {
    const keyboard = this._keyboardKeys[action] || false;
    const touch = this._touchKeys[action] || false;
    const gamepad = this._gamepadKeys[action] || false;
    const strength = Math.max(keyboard, touch, gamepad);
    // Preserve digital button values while allowing either analog source to be strongest.
    this.keys[action] = keyboard === true || touch === true || gamepad === true ? true : strength || false;
    if (pressedSource && ONE_SHOT_ACTIONS.has(action)) {
      if (!this._tapped.has(action)) this._tapped.set(action, new Set());
      this._tapped.get(action).add(pressedSource);
      this._syncPressEdges();
    }
  }

  _syncPressEdges() {
    this.keys.hopPressed = this._tapped.has('up');
    this.keys.resetPressed = this._tapped.has('reset');
  }

  _setAnalogInput(source, action, value, name) {
    if (this.inputEnabled === false || !INPUT_ACTIONS.includes(action)) return;
    const was = source[action];
    const strength = Number(value);
    source[action] = typeof value === 'boolean' ? value : Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    this._blendInput(action, !was && source[action] ? name : null);
  }

  setTouchInput(action, value) {
    this._setAnalogInput(this._touchKeys, action, value, 'touch');
  }

  setGamepadInput(action, value) {
    this._setAnalogInput(this._gamepadKeys, action, value, 'gamepad');
  }

  clearTouchInput() {
    this._touchKeys = {};
    for (const action of INPUT_ACTIONS) this._blendInput(action);
  }

  /** Viewport boundary: cancel touch taps/trick intent, retaining keyboard and pad levels/presses. */
  cancelTouchInput() {
    this.clearTouchInput();
    for (const [action, sources] of this._tapped) {
      sources.delete('touch');
      if (!sources.size) this._tapped.delete(action);
    }
    this._syncPressEdges();
    this.entities?.euc?.clearInput(this.keys);
  }

  clearGamepadInput() {
    this._gamepadKeys = {};
    for (const action of INPUT_ACTIONS) this._blendInput(action);
  }

  setInputEnabled(enabled) {
    enabled = !!enabled;
    if (this.inputEnabled === enabled) return;
    this.inputEnabled = enabled;
    this.resetInput();
  }

  resetInput() {
    this._pressedCodes.clear();
    this._keyboardKeys = {};
    this._touchKeys = {};
    this._gamepadKeys = {};
    for (const action of Object.keys(this.keys)) this.keys[action] = false;
    this._tapped?.clear();
    this.entities?.euc?.clearInput();
  }

  getActiveEntity() {
    return this.entities.euc;
  }

  /** Host owns the input/pause gate and atomically commits this candidate with its audio bank. */
  prepareRider(id, options) {
    return this.entities.euc.prepareRider(id, options);
  }

  cancelRiderPreparation() {
    return this.entities.euc.cancelRiderPreparation();
  }

  setRider(id, options) {
    return this.entities.euc.setRider(id, options);
  }

  /** Terminal teardown; await GPU preparation before the host disposes its renderer. */
  dispose() {
    this.setInputEnabled(false);
    this.resetInput();
    for (const [target, type, listener] of this._inputListeners ?? []) target.removeEventListener(type, listener);
    this._inputListeners = [];
    return this.entities.euc.dispose();
  }

  teleportActiveTo(x, z, heading = Math.PI, referenceY = Infinity, policy = {}) {
    const ent = this.entities.euc;
    const { departure = 0 } = policy ?? {};
    if (!Number.isFinite(heading)) heading = ent.heading;
    let succeeded = false, attempts = 0;
    // placeAt atomically rechecks static support and live occupancy along the requested departure.
    // Ordinary arrivals may try nearby checked spots; exact-site policy never offers a ring fallback.
    for (const destination of this.teleportCandidates(x, z, heading, referenceY, policy)) {
      succeeded = ent.placeAt(destination.x, destination.z, heading, destination.y, { requireClear: true, departure }) === true;
      if (succeeded || ++attempts >= TELEPORT_PLACE_ATTEMPTS) break;
    }
    if (succeeded) this.resetInput();
    return { x: ent.position.x, y: ent.position.y, z: ent.position.z, succeeded };
  }

  // Search actual SF support, preserving the requested elevation/layer and geography. No island/shore clamp.
  // Static standing-support preview only: placeAt rechecks full departure/occupancy before committing placement.
  findTeleportPosition(x, z, heading, referenceY = Infinity, policy = {}) {
    for (const found of this.teleportCandidates(x, z, heading, referenceY, policy)) return found;
    return null;
  }

  // Statically checked candidates, nearest first: the exact spot, then four-metre rings that cover nearby streets and
  // courtyards, with bounded work even for a click inside a large block.
  *teleportCandidates(x, z, heading, referenceY = Infinity, policy = {}) {
    const { departure = 0, exact: exactOnly = false } = policy ?? {};
    if (![x, z, heading].every(Number.isFinite) || (!Number.isFinite(referenceY) && referenceY !== Infinity)) return;
    if (!Number.isFinite(departure) || departure < 0 || departure > TELEPORT_MAX_DEPARTURE) return;
    const target = (px, pz) => this.eucSampler.findPlacementTarget({ x: px, z: pz, headingY: heading, referenceY,
      registeredSurfaceOnly: true });
    const exact = target(x, z);
    if (exact) yield exact;
    if (exactOnly) return;
    for (let distance = 4; distance <= 256; distance += 4) {
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16;
        const found = target(x + Math.cos(angle) * distance, z + Math.sin(angle) * distance);
        if (found) yield found;
      }
    }
  }

  isPointOnSidewalk(x, z) {
    const b = getCity().blockAt(x, z);
    return !!b && !(b.park > 0.6 && !b.median);
  }

  // City terrain before solid tops, shared with city-side systems. Teleports use the full placement sampler instead.
  getGroundHeight(x, z, referenceY = this.entities.euc.position.y) {
    return this.eucSampler.cityGround(x, z, this._groundProbe ??= { height: 0, surface: 'pavement' }, referenceY).height;
  }

  // The colliders whose bounds come within `r` of (x, z), in their original order. They never move, so they are
  // bucketed once into 48 m cells (tens of thousands of buildings: testing them all every frame cost ~0.5 ms)
  nearColliders(x, z, r) {
    const CELL = 48;
    const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);
    if (!this._colliderCells) {
      this._colliderCells = new Map();
      this.colliders.forEach((c, i) => {
        c._order = i;
        for (let ix = Math.floor(c.minX / CELL); ix <= Math.floor(c.maxX / CELL); ix++) {
          for (let iz = Math.floor(c.minZ / CELL); iz <= Math.floor(c.maxZ / CELL); iz++) {
            const k = key(ix, iz);
            let list = this._colliderCells.get(k);
            if (!list) this._colliderCells.set(k, (list = []));
            list.push(c);
          }
        }
      });
      this._nearList = [];
      this._nearStamp = 0;
    }
    const out = this._nearList;
    out.length = 0;
    const stamp = ++this._nearStamp;
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const list = this._colliderCells.get(key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c._seen === stamp) continue;
          c._seen = stamp;
          out.push(c);
        }
      }
    }
    if (out.length > 1) out.sort((a, b) => a._order - b._order);
    return out;
  }

  update(dt) {
    // A quick tap (a touch button, a key) can go down and up between two frames. The rider reads its one-shots (hop,
    // get up) as edges once per frame, so such a press still counts as held for this one frame.
    let keys = this.keys;
    if (this._tapped?.size) {
      keys = { ...this.keys };
      for (const action of this._tapped.keys()) keys[action] = true;
      this._tapped.clear();
      this._syncPressEdges();
    }
    this.entities.euc.update(dt, keys);
  }
}

export { ThirdPersonControllerManager };
