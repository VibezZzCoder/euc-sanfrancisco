// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Metadata-only browsing. Participant rights: NOTICE-EUC-THRILLS.md / FORK_GUIDE.md.
export const MAIN_MENU_URL = 'https://vibezzzcoder.github.io/EUC-thrills/';

export function menuOwner({ failed, hidden, pageAway, booking, menu, map, title }) {
  return failed ? 'graphics' : hidden || pageAway ? 'hidden' : booking ? 'booking'
    : menu ? 'menu' : map ? 'map' : title ? 'title' : 'riding';
}

const abortError = () => new DOMException('Rider preparation cancelled', 'AbortError');
const isMenuAction = element => element?.tagName === 'BUTTON' ? !element.disabled : element?.matches?.('a[href]');

/** Owns both candidates until a synchronous commit; cancellation drains all native work. */
export class RiderSelection {
  constructor({ manager, audio, compile, onState = () => {}, onCommit = () => {} }) {
    Object.assign(this, { manager, audio, compile, onState, onCommit });
    this.tail = Promise.resolve();
    this.request = null;
    this.closed = false;
  }

  cancel() {
    this.request?.abort();
    this.request = null;
    this.audio.cancelRiderPreparation();
    const drain = this.manager.cancelRiderPreparation();
    return Promise.allSettled([this.tail, drain]);
  }

  prepare(id) {
    if (this.closed) return Promise.reject(abortError());
    this.cancel();
    // MUST stay in the native click/key/pad gesture, before the first await/queued task (also when muted).
    this.audio.unlock();
    const request = new AbortController();
    this.request = request;
    const check = () => {
      if (this.closed || request.signal.aborted || this.request !== request) throw abortError();
    };
    this.onState('preparing', id);
    const run = this.tail.then(async () => {
      let rig, bank;
      try {
        check();
        // Audio owns platform-unavailable silent banks as well as audible banks. Host-created
        // fallbacks would bypass its lifecycle validation and selected-identity bookkeeping.
        const audioWork = this.audio.prepareRider(id, { signal: request.signal });
        const active = this.manager.getActiveEntity();
        const same = active.riderId === id;
        const currentRig = () => !request.signal.aborted && this.manager.getActiveEntity() === active && active.riderId === id;
        const rigWork = same ? Promise.resolve({ id, get valid() { return currentRig(); }, commit: currentRig, dispose() {} })
          : this.manager.prepareRider(id, { signal: request.signal, compile: this.compile });
        // Await BOTH even after failure: native decode/compile cannot necessarily be interrupted.
        const results = await Promise.allSettled([rigWork, audioWork].map(work => Promise.resolve(work).catch(error => {
          request.abort(); // cancel the other stage promptly, retaining both promises until they drain
          throw error;
        })));
        if (results[0].status === 'fulfilled') rig = results[0].value;
        if (results[1].status === 'fulfilled') bank = results[1].value;
        const failure = results.find(result => result.status === 'rejected' && result.reason?.name !== 'AbortError')
          ?? results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        check();
        if (rig.valid !== true || bank.valid !== true || rig.id !== id || bank.id !== id
          || globalThis.document?.hidden) throw abortError();
        // No await, event dispatch or UI/save mutation between the two transfers. Both handles belong
        // to this request; BOTH native tickets' readiness/lifecycle validity are checked above.
        // A valid audio commit returns true; a stale bank throws (it never silently returns false).
        if (!rig.commit()) throw new Error('Rider could not be installed. Try again.');
        bank.commit();
        this.onCommit(id);
        this.onState('ready', id);
        return true;
      } catch (error) {
        request.abort();
        if (this.request === request) this.onState(error?.name === 'AbortError' ? 'cancelled' : 'error', id, error);
        throw error;
      } finally {
        rig?.dispose();
        bank?.dispose();
        if (this.request === request) this.request = null;
      }
    });
    this.tail = run.catch(() => {});
    return run;
  }

  dispose() { this.closed = true; return this.cancel(); }
}

/** One native modal with child views; native focus containment plus reversible explicit background inertness. */
export class GameMenu {
  constructor({ root, riders, specs, getRider, canOpen, onChange, onConfirm, onCancel, onReload, onLeave, onActivity = () => {} }) {
    Object.assign(this, { root, riders, specs, getRider, canOpen, onChange, onConfirm, onCancel, onReload, onLeave, onActivity });
    this.view = null;
    this.parent = null;
    this.state = 'idle';
    this.reloadRequired = false;
    this.keys = new Set();
    this.blocked = new Set();
    this.activation = new Map();
    this.background = [];
    this.resetPad();
    const find = id => root.querySelector(`#${id}`);
    this.list = find('rider-options');
    this.status = find('rider-status');
    this.confirm = find('rider-confirm');
    this.retry = find('rider-retry');
    this.options = riders.map(id => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.riderOption = id;
      button.id = `rider-option-${id}`;
      button.className = 'rider-option';
      button.setAttribute('aria-label', specs[id].name);
      const swatch = document.createElement('span');
      swatch.className = 'rider-swatch'; swatch.style.backgroundColor = specs[id].swatch;
      swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'rider-option-name'; name.textContent = specs[id].name;
      const active = document.createElement('span'); active.className = 'rider-active';
      button.append(swatch, name, active);
      button.addEventListener('click', () => this.highlight(id));
      button.addEventListener('focus', () => this.highlight(id));
      this.list.append(button);
      return button;
    });
    find('menu-resume').addEventListener('click', () => this.close());
    find('menu-rider').addEventListener('click', () => this.openPicker());
    find('menu-return').addEventListener('click', () => {
      if (this.view === 'pause' && !this.leaving) { this.leaving = true; this.onLeave(); }
    });
    this.confirm.addEventListener('click', () => this.prepare());
    this.retry.addEventListener('click', () => this.retryPreparation());
    find('rider-cancel').addEventListener('click', () => this.cancel());
    root.addEventListener('cancel', event => { event.preventDefault(); this.cancel(); });
    root.addEventListener('pointerdown', () => { root.dataset.padFocus = 'false'; });
    this.onKey = event => this.key(event);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    this.reset = () => { this.keys.clear(); this.blocked.clear(); this.activation.clear(); this.resetPad(); };
    window.addEventListener('blur', this.reset);
    document.addEventListener('visibilitychange', this.reset);
  }

  get isOpen() { return this.view !== null; }

  openPause() {
    if (!this.isOpen && this.canOpen('pause')) this.show('pause', 'menu-resume');
  }

  openPicker(id = this.getRider()) {
    if (!this.isOpen && !this.canOpen('picker')) return;
    if (this.state === 'preparing') return;
    if (this.view !== 'picker') this.parent = this.view;
    this.highlighted = this.riders.includes(id) ? id : this.getRider();
    this.state = 'idle';
    this.reloadRequired = false;
    // A cancelled preparation left its options disabled. Enable them before requesting native focus.
    this.render();
    this.show('picker', `rider-option-${this.highlighted}`);
  }

  browse(step) {
    if (!this.isOpen || this.view === 'pause') this.openPicker();
    if (this.view !== 'picker' || this.state === 'preparing') return;
    const index = this.riders.indexOf(this.highlighted);
    this.highlight(this.riders[(index + step + this.riders.length) % this.riders.length]);
    this.root.querySelector(`#rider-option-${this.highlighted}`).focus({ preventScroll: false });
  }

  show(view, focusId) {
    const opening = !this.isOpen;
    if (opening) {
      this.returnFocus = document.activeElement;
      for (let branch = this.root; branch && branch !== document.body; branch = branch.parentElement) {
        for (const element of branch.parentElement?.children ?? []) {
          if (element === branch) continue;
          this.background.push([element, element.inert]); element.inert = true;
        }
      }
    }
    this.view = view;
    this.blocked = new Set(this.keys); this.activation.clear(); this.resetPad();
    this.root.dataset.view = view;
    this.root.dataset.state = this.state;
    this.root.setAttribute('aria-labelledby', view === 'picker' ? 'rider-heading' : 'game-menu-heading');
    for (const section of this.root.querySelectorAll('[data-menu-view]')) section.hidden = section.dataset.menuView !== view;
    this.root.inert = false; // never include the modal itself in its background snapshot
    if (opening) this.root.showModal();
    document.body.classList.add('game-menu-open');
    this.onChange(true);
    this.root.querySelector(`#${focusId}`).focus({ preventScroll: true });
    if (view === 'picker') this.root.querySelector(`#${focusId}`).scrollIntoView?.({ block: 'nearest' });
  }

  highlight(id) {
    if (this.view !== 'picker' || this.state === 'preparing') return;
    this.highlighted = id; this.state = 'idle'; this.reloadRequired = false; this.render();
  }

  render(message) {
    this.root.dataset.state = this.state;
    const activeId = this.getRider(), selected = this.specs[this.highlighted] ?? this.specs[activeId];
    const setText = (id, value) => { const node = this.root.querySelector(`#${id}`); if (node) node.textContent = value; };
    for (const button of this.options) {
      const id = button.dataset.riderOption;
      button.setAttribute('aria-pressed', String(id === this.highlighted));
      button.querySelector('.rider-active').textContent = id === activeId ? 'Riding' : '';
      button.disabled = this.state === 'preparing';
    }
    setText('rider-current', `Currently riding: ${this.specs[activeId].name}`);
    setText('rider-count', `${this.riders.length} riders`);
    setText('rider-detail-name', selected.name);
    setText('rider-detail-state', this.highlighted === activeId ? 'Riding now' : 'Browsing');
    setText('rider-detail-blurb', selected.blurb ?? '');
    setText('rider-wheel-name', selected.wheelName ?? '');
    setText('rider-wheel-blurb', selected.wheelBlurb ?? '');
    setText('rider-style-note', this.highlighted === 'drunkard'
      ? 'Same speed, grip and brakes. Adds a hands-off weave, sway and the occasional stumble.'
      : 'Your look, your wheel. The same speed, grip and brakes for every rider.');
    if (this.renderedRider !== this.highlighted) {
      const detail = this.root.querySelector('.rider-detail');
      if (detail) detail.scrollTop = 0;
      this.renderedRider = this.highlighted;
    }
    this.status.textContent = message ?? (this.state === 'preparing' ? `Getting ${selected.name} ready… You can cancel.`
      : this.highlighted === activeId ? 'This is your current rider. Browse the roster to change.'
        : `Like this rider? Select ${selected.name} to change your ride.`);
    this.list.setAttribute('aria-busy', String(this.state === 'preparing'));
    this.confirm.disabled = this.state === 'preparing';
    this.confirm.textContent = `${this.highlighted === activeId ? 'Keep' : 'Select'} ${selected.name}`;
    this.confirm.hidden = this.state === 'error'; this.retry.hidden = this.state !== 'error';
    this.retry.textContent = this.reloadRequired ? 'Reload SF' : 'Retry';
  }

  retryPreparation() {
    if (this.view !== 'picker' || this.state !== 'error') return;
    if (!this.reloadRequired) { this.prepare(); return; }
    // Reuse native button activation and the modal's fresh-key/neutral-pad guards. Do not
    // retry a document-cached rejected ESM graph or invent cache-busting import URLs.
    this.blocked = new Set(this.keys); this.activation.clear(); this.resetPad();
    try { this.onCancel(); this.onReload(); } catch {
      this.render('Reload could not start. Try Reload SF again, cancel, or choose another rider. The pending selection was not saved.');
      this.retry.focus({ preventScroll: true });
    }
  }

  prepare() {
    if (this.view !== 'picker' || this.state === 'preparing') return;
    this.reloadRequired = false;
    this.state = 'preparing'; this.render();
    this.blocked = new Set(this.keys); this.activation.clear(); this.resetPad();
    this.root.querySelector('#rider-cancel').focus({ preventScroll: true });
    const token = this.preparation = {};
    let preparation;
    try { preparation = this.onConfirm(this.highlighted); } catch (error) { preparation = Promise.reject(error); }
    Promise.resolve(preparation).then(() => {
      if (this.preparation === token && this.view === 'picker' && this.state === 'preparing') this.cancel(false);
    }).catch(error => {
      if (this.preparation !== token || this.view !== 'picker' || this.state !== 'preparing') return;
      this.state = 'error';
      this.reloadRequired = error?.reloadRequired === true;
      this.render(this.reloadRequired
        ? `Rider appearance modules could not load. Reload SF to retry. Reload keeps your committed rider (${this.specs[this.getRider()].name}); the pending selection was not saved. You can also cancel or choose another rider.`
        : error?.name === 'AbortError' ? 'Preparation interrupted. Retry or cancel.'
          : `Could not prepare rider. ${error?.message ?? 'Try again.'}`);
      this.retry.focus({ preventScroll: true });
    });
  }

  cancel(cancelWork = true) {
    if (this.view === 'picker') {
      this.preparation = null;
      if (cancelWork) this.onCancel();
      this.state = 'idle';
      this.reloadRequired = false;
      if (this.parent === 'pause') { this.parent = null; this.show('pause', 'menu-rider'); return; }
    }
    this.close();
  }

  close({ restoreFocus = true } = {}) {
    if (!this.isOpen) return;
    this.onCancel();
    this.preparation = null;
    this.blocked = new Set(this.keys); this.activation.clear(); this.resetPad();
    this.view = this.parent = null; this.state = 'idle';
    this.reloadRequired = false;
    this.root.dataset.state = this.state;
    this.root.close();
    for (const [element, inert] of this.background) element.inert = inert;
    this.background = [];
    document.body.classList.remove('game-menu-open');
    this.onChange(false);
    if (restoreFocus) {
      const caller = this.returnFocus;
      const canRestore = caller?.isConnected && !caller.disabled && !caller.closest('[inert], [hidden]')
        && caller.getClientRects().length > 0 && window.getComputedStyle(caller).visibility === 'visible';
      const target = canRestore ? caller : document.getElementById('canvas-container');
      target?.focus({ preventScroll: true });
    }
    this.returnFocus = null;
  }

  key(event) {
    const down = event.type === 'keydown', held = this.keys.has(event.code);
    if (down && !event.repeat) this.keys.add(event.code);
    if (!down) this.keys.delete(event.code);
    const blocked = this.blocked.has(event.code);
    if (!down) this.blocked.delete(event.code);
    if (!this.isOpen) {
      if (blocked) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (event.code === 'Tab') return; // native dialog traversal
    event.stopImmediatePropagation();
    const fresh = down && !held && !event.repeat && !blocked && !document.hidden
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing;
    if (event.code === 'Escape' && fresh) { event.preventDefault(); this.cancel(); return; }
    if (fresh && this.view === 'pause' && event.code === 'KeyP') { event.preventDefault(); this.close(); return; }
    if (fresh && this.view === 'pause' && ['KeyC', 'Digit1', 'Digit2'].includes(event.code)) {
      event.preventDefault();
      this.openPicker(event.code === 'KeyC' ? this.getRider() : this.riders[Number(event.code.slice(5)) - 1]);
      return;
    }
    const target = document.activeElement;
    const confirm = ['Enter', 'NumpadEnter'].includes(event.code) || event.code === 'Space' && target?.tagName === 'BUTTON';
    const action = isMenuAction(target) && this.root.contains(target);
    const activate = confirm && action && (down ? fresh : this.activation.get(event.code) === target);
    if (activate && down) this.activation.set(event.code, target);
    if (!down) this.activation.delete(event.code);
    if (!activate) event.preventDefault(); // native button/link activation only for fresh, same-view keys
    if (fresh && this.view === 'picker' && ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.code)) {
      this.browse(['ArrowDown', 'ArrowRight'].includes(event.code) ? 1 : -1);
    }
  }

  resetPad() { this.padIdentity = null; this.padPrevious = null; this.padReady = this.padNavReady = false; }

  updateGamepad(dt = 1 / 60) {
    if (!this.isOpen || document.hidden || !document.hasFocus()) { this.resetPad(); return; }
    let pad;
    try { pad = [...navigator.getGamepads?.() ?? []].find(p => p?.connected && p.mapping === 'standard'); } catch { return; }
    if (!pad) { this.resetPad(); return; }
    const identity = `${pad.index}:${pad.id}`;
    if (identity !== this.padIdentity) { this.resetPad(); this.padIdentity = identity; }
    const pressed = Array.from({ length: 17 }, (_, i) => !!pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5);
    const previous = this.padPrevious; this.padPrevious = pressed;
    const axes = [0, 1, 2, 3].map(i => Number.isFinite(pad.axes?.[i]) ? pad.axes[i] : 0);
    if (pressed.some(Boolean) || axes.some(value => Math.abs(value) > .2)) this.onActivity();
    const neutral = !pressed.some(Boolean) && !pad.buttons.some(b => b.value > 0.01)
      && Math.hypot(axes[0], axes[1]) <= 0.15 && Math.hypot(axes[2], axes[3]) <= 0.15;
    if (!this.padReady) { this.padReady = this.padNavReady = neutral; return; }
    if (!previous) return;
    const edge = i => pressed[i] && !previous[i];
    if (edge(1) || edge(8)) { this.cancel(); return; }
    if (edge(4) || edge(5)) { this.browse(edge(5) ? 1 : -1); return; }
    if (this.view === 'picker' && Math.abs(axes[3]) > .15) {
      const detail = this.root.querySelector('.rider-detail');
      const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(.05, dt)) : 0;
      if (detail) detail.scrollTop += Math.sign(axes[3]) * (Math.min(1, Math.abs(axes[3])) - .15) / .85 * 360 * seconds;
    }
    const direction = pressed[13] || pressed[15] || axes[1] > 0.5 || axes[0] > 0.5 ? 1
      : pressed[12] || pressed[14] || axes[1] < -0.5 || axes[0] < -0.5 ? -1 : 0;
    if (!direction && Math.hypot(axes[0], axes[1]) <= 0.15) this.padNavReady = true;
    if (direction && this.padNavReady) {
      this.padNavReady = false; this.root.dataset.padFocus = 'true';
      const section = this.root.querySelector(`[data-menu-view="${this.view}"]`);
      const actions = [...section.querySelectorAll('button, a[href]')].filter(action => isMenuAction(action) && !action.hidden);
      const index = actions.indexOf(document.activeElement);
      actions[(index + direction + actions.length) % actions.length]?.focus({ preventScroll: false });
      return;
    }
    if (edge(0)) {
      if (this.view === 'picker' && document.activeElement?.dataset.riderOption) this.prepare();
      else if (this.root.contains(document.activeElement) && isMenuAction(document.activeElement)) document.activeElement.click();
    }
  }

  dispose() {
    this.close({ restoreFocus: false }); this.reset();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.reset);
    document.removeEventListener('visibilitychange', this.reset);
  }
}
