const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/sf-map.js'), 'utf8');

for (const [width, height, dpr] of [[500, 300, 1], [320, 180, 1.5], [1920, 1080, 2]]) {
  test(`map clicks match rendered world positions at ${width}x${height}, DPR ${dpr}`, () => {
    const window = { NYC: { GEO: {}, ROADS: [] }, innerWidth: width, innerHeight: height, devicePixelRatio: dpr };
    vm.runInNewContext(source, { window, performance: { now: () => 0 } });
    const map = Object.create(window.NYC.NYCMapSystem.prototype);
    // Capture the production render viewport; drawing primitives are irrelevant to coordinate conversion.
    const context = new Proxy({}, { get: () => () => {} });
    let view;
    Object.assign(map, {
      fullCanvas: { clientWidth: width, clientHeight: height },
      fullCtx: context,
      fullStatic: { getContext: () => context },
      isFullMapOpen: true,
      viewCenterX: 200,
      viewCenterZ: -300,
      viewZoom: 0.5,
      controllerManager: { getActiveEntity: () => ({ position: { x: 200, z: -300 }, heading: 0 }) },
      renderFullMapStatic: (_context, viewport) => { view = viewport; }
    });
    map.resizeFullCanvas();
    map.renderFullMap();

    for (const point of [{ x: 200, z: -300 }, { x: 325, z: -375 }]) {
      // Convert the renderer's centred coordinates through the canvas backing store to CSS pixels.
      const screenX = (view.toX(point.x) + view.w / 2) * view.dpr * width / map.fullCanvas.width;
      const screenY = (view.toY(point.z) + view.h / 2) * view.dpr * height / map.fullCanvas.height;
      const clicked = map.screenToWorld(screenX, screenY, width, height);
      // The pixel budget can yield a fractional DPR; integer backing sizes may round by less than one pixel.
      const tolerance = 1 / (view.s * view.dpr);
      assert.ok(Math.abs(clicked.x - point.x) < tolerance, `clicked x ${clicked.x} should match drawn x ${point.x}`);
      assert.ok(Math.abs(clicked.z - point.z) < tolerance, `clicked z ${clicked.z} should match drawn z ${point.z}`);
    }
  });
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener, options = false) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ listener, capture: options === true || !!options.capture });
    },
    dispatch(type, event = {}, capture) {
      for (const entry of listeners.get(type) || []) {
        if (event.stopped) break;
        if (capture === undefined || entry.capture === capture) entry.listener(event);
      }
      return event;
    }
  };
}

function classList() {
  const names = new Set();
  return {
    add: (name) => names.add(name),
    remove: (name) => names.delete(name),
    contains: (name) => names.has(name),
    toggle(name, enabled) { if (enabled) names.add(name); else names.delete(name); }
  };
}

function mapHarness({ onTeleport, landmarks = [] } = {}) {
  const elements = {};
  const document = {
    ...eventTarget(), hidden: false, activeElement: null,
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => []
  };
  const window = { ...eventTarget(), innerWidth: 200, innerHeight: 200,
    getComputedStyle: element => ({ visibility: element.visibility || 'visible' }) };
  // Minimal connected DOM tree, with the native focus/inert/dialog methods the production map actually uses.
  const element = (tagName = 'DIV', parent = null, properties = {}) => {
    const node = {
      ...eventTarget(), tagName, parentElement: parent, children: [], style: { setProperty() {} }, dataset: {},
      isConnected: true, inert: false, disabled: false, hidden: false,
      tabIndex: ['BUTTON', 'INPUT', 'A'].includes(tagName) ? 0 : -1, classList: classList(),
      contains(other) {
        for (let branch = other; branch; branch = branch.parentElement) if (branch === this) return true;
        return false;
      },
      closest(selector) {
        assert.equal(selector, '[inert]');
        for (let branch = this; branch; branch = branch.parentElement) if (branch.inert) return branch;
        return null;
      },
      getClientRects() {
        for (let branch = this; branch; branch = branch.parentElement) if (branch.hidden) return [];
        return [{}];
      },
      focus() {
        if (!this.isConnected || this.disabled || this.closest('[inert]') || !this.getClientRects().length) return;
        document.activeElement = this;
        document.dispatch('focusin', { target: this });
      },
      querySelectorAll() {
        const found = [];
        const visit = root => { for (const child of root.children) {
          if (['BUTTON', 'INPUT', 'A', 'SELECT', 'TEXTAREA'].includes(child.tagName)) found.push(child);
          visit(child);
        } };
        visit(this);
        return found;
      },
      ...properties
    };
    parent?.children.push(node);
    return node;
  };
  const body = document.body = element('BODY');
  const hud = element('DIV', body), alreadyInert = element('DIV', body, { inert: true });
  const mapBranch = element('DIV', body), branchSibling = element('DIV', mapBranch);
  const invoker = elements['btn-open-map'] = element('BUTTON', hud);
  const gameCanvas = elements['canvas-container'] = element('DIV', hud);
  const modal = elements['fullmap-modal'] = element('DIALOG', mapBranch, {
    inert: true, open: false, shows: 0, closes: 0,
    showModal() { assert.equal(this.inert, false); this.open = true; this.shows++; this.focus(); },
    close() { if (!this.open) return; this.open = false; this.closes++; this.dispatch('close'); }
  });
  const wrapper = elements['fullmap-canvas-wrap'] = element('DIV', modal);
  const canvas = elements['fullmap-canvas'] = element('CANVAS', wrapper, {
    clientWidth: 200, clientHeight: 200, getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 200 })
  });
  const controls = element('DIV', modal);
  const zoomIn = elements['map-zoom-in'] = element('BUTTON', controls);
  const zoomOut = elements['map-zoom-out'] = element('BUTTON', controls);
  const close = elements['close-fullmap-btn'] = element('BUTTON', controls);
  elements['fullmap-action-status'] = element('P', modal, { textContent: '' });
  elements['fullmap-hover-info'] = element('P', modal, { textContent: '' });
  invoker.focus();
  const captured = new Set();
  canvas.setPointerCapture = (id) => captured.add(id);
  canvas.hasPointerCapture = (id) => captured.has(id);
  canvas.releasePointerCapture = (id) => {
    captured.delete(id);
    canvas.dispatch('lostpointercapture', { pointerId: id });
  };
  window.NYC = {
    GEO: { frame: {} }, ROADS: [], BLOCKS: [], NYC_LANDMARKS: landmarks,
    ISLAND_BOUNDS: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 },
    getIslandBoundsAtZ: () => ({ westX: -10000, eastX: 10000 }),
    getLocationLabel: (x, z) => `${x}, ${z}`,
    isTypingInField: event => ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName) || event.target?.isContentEditable
  };
  vm.runInNewContext(source, { window, document });
  const teleports = [], toggles = [];
  const host = { inputEnabled: true };
  const map = new window.NYC.NYCMapSystem({
    controllerManager: { getActiveEntity: () => ({ position: { x: 1000, z: 2000 } }) },
    onTeleport: (x, z, heading, referenceY) => {
      teleports.push([x, z, heading, referenceY]);
      return onTeleport ? onTeleport(x, z, heading, referenceY) : { succeeded: true, x, z };
    },
    onToggle: open => { toggles.push(open); host.inputEnabled = !open; }
  });
  // Exercise the real viewport/input state without drawing the map's geographic layers.
  map.renderFullMap = () => {};
  map.viewZoom = 1;
  map.toggleFullMap(true);
  const event = properties => ({ defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...properties });
  const dispatch = (target, type, e) => {
    // Window capture precedes the canvas handler; modal capture precedes native control activation.
    window.dispatch(type, e, true);
    if (modal.contains(target) && target !== modal) modal.dispatch(type, e, true);
    target.dispatch(type, e);
    if (modal.contains(target) && target !== modal) modal.dispatch(type, e, false);
    window.dispatch(type, e, false);
    return e;
  };
  return {
    map, canvas, controls, wrapper, window, document, captured, teleports, toggles, zoomIn, zoomOut, close,
    modal, invoker, gameCanvas, host, element, background: [hud, alreadyInert, branchSibling],
    pointer(target, type, id, x = 110, y = 120, pointerType = 'touch', button = 0) {
      target = captured.has(id) ? canvas : target;
      return dispatch(target, type, event({ target, pointerId: id, clientX: x, clientY: y, pointerType, button }));
    },
    key(code, properties = {}) {
      const target = document.activeElement;
      return dispatch(target, 'keydown', event({ target, code, ...properties }));
    },
    click(target, properties = {}) { return dispatch(target, 'click', event({ target, detail: 0, ...properties })); }
  };
}

test('unrelated pointer streams cannot move or release an owned map pan', () => {
  const h = mapHarness();
  assert.equal(h.canvas.style.touchAction, 'none');
  h.pointer(h.canvas, 'pointerdown', 1, 110, 120, 'mouse');
  h.pointer(h.controls, 'pointerdown', 2, 110, 120, 'pen');
  h.pointer(h.canvas, 'pointerdown', 3, 110, 120, 'pen');
  h.pointer(h.controls, 'pointermove', 2, 190, 120, 'pen');
  h.pointer(h.canvas, 'pointermove', 3, 190, 120, 'pen');
  h.pointer(h.controls, 'pointerup', 2, 190, 120, 'pen');
  h.pointer(h.canvas, 'pointercancel', 3, 190, 120, 'pen');
  assert.equal(h.map.viewCenterX, 1000);
  assert.equal(h.map.isPanning, true);
  assert.equal(h.teleports.length, 0);

  h.pointer(h.controls, 'pointermove', 1, 130, 120, 'mouse');
  assert.equal(h.map.viewCenterX, 980);
  h.pointer(h.controls, 'pointerup', 1, 130, 120, 'mouse');
  assert.equal(h.map.isPanning, false);
  assert.equal(h.wrapper.classList.contains('is-panning'), false);
  assert.equal(h.teleports.length, 0);
});

test('a normal map tap teleports once and releases capture', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointerdown', 1);
  h.pointer(h.canvas, 'pointerup', 1);
  assert.deepEqual(h.teleports, [[1000, 2000, undefined, undefined]]);
  assert.equal(h.map.waypoint.name, '1000, 2000');
  assert.equal(h.captured.size, 0);
  assert.equal(h.map.isPanning, false);
});

test('a second touch cancels the whole gesture until release, including a late native control click', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointerdown', 1);
  assert.equal(h.captured.has(1), true);
  h.pointer(h.controls, 'pointerdown', 2);
  assert.equal(h.map.isPanning, false);
  assert.equal(h.map.multiTouch, true);
  assert.equal(h.captured.size, 0);
  h.pointer(h.canvas, 'pointermove', 1, 160);
  h.pointer(h.controls, 'pointerup', 2);
  h.pointer(h.canvas, 'pointerup', 1);
  assert.equal(h.map.viewCenterX, 1000);
  assert.equal(h.teleports.length, 0);
  assert.equal(h.map.touchPointers.size, 0);
  assert.equal(h.map.multiTouch, false);
  assert.equal(h.click(h.zoomIn, { detail: 1, pointerType: 'touch' }).defaultPrevented, true);
  assert.equal(h.map.viewZoom, 1, 'cancelled touch must not activate a zoom button after pointerup');
  h.pointer(h.canvas, 'pointerdown', 3);
  h.pointer(h.canvas, 'pointerup', 3);
  assert.equal(h.teleports.length, 1, 'a fresh single-finger tap works after cancellation');
  assert.equal(h.captured.size, 0);
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'close', 'resize']) {
  test(`${interruption} cancels a map tap without teleporting or leaving a drag active`, () => {
    const h = mapHarness();
    h.pointer(h.canvas, 'pointerdown', 1);
    if (interruption === 'blur' || interruption === 'resize') h.window.dispatch(interruption);
    else if (interruption === 'hidden') {
      h.document.hidden = true;
      h.document.dispatch('visibilitychange');
    } else if (interruption === 'close') h.map.toggleFullMap(false);
    else if (interruption === 'lostpointercapture') h.canvas.releasePointerCapture(1);
    else h.pointer(h.canvas, interruption, 1);
    h.pointer(h.canvas, 'pointerup', 1);
    assert.equal(h.teleports.length, 0);
    assert.equal(h.map.isPanning, false);
    assert.equal(h.captured.size, 0);
    assert.equal(h.wrapper.classList.contains('is-panning'), false);
    if (interruption === 'close') {
      assert.deepEqual(h.toggles, [true, false]);
      h.map.toggleFullMap(true);
    }
    if (interruption === 'hidden') { h.document.hidden = false; h.document.dispatch('visibilitychange'); }
    if (interruption === 'blur') h.window.dispatch('focus');
    h.pointer(h.canvas, 'pointerdown', 2);
    h.pointer(h.canvas, 'pointerup', 2);
    assert.equal(h.teleports.length, 1);
  });
}

test('a pointer released outside the map or far from its start does not teleport', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointerdown', 1, 205);
  h.pointer(h.controls, 'pointerup', 1, 215);
  h.pointer(h.canvas, 'pointerdown', 2, 110);
  h.pointer(h.canvas, 'pointerup', 2, 130);
  assert.equal(h.teleports.length, 0);
});

test('mouse hover and zoom buttons remain available without a pan', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointermove', 1, 120, 130, 'mouse');
  assert.equal(h.map.hoverWorld.x, 1010);
  assert.equal(h.map.hoverWorld.z, 2010);
  h.pointer(h.canvas, 'pointermove', 2, 180, 130);
  assert.equal(h.map.hoverWorld.x, 1010, 'untracked touch does not update hover');
  h.zoomIn.dispatch('click');
  assert.equal(h.map.viewZoom, 1.45);
  h.zoomOut.dispatch('click');
  assert.equal(h.map.viewZoom, 1);
});

test('regional arrivals forward unchanged west coordinates and refuse unsupported sites without a hidden world clamp', () => {
  const west = { x: -6564, z: -2429 };
  const h = mapHarness({ onTeleport: (x, z) => ({ succeeded: x === west.x && z === west.z, x, z }) });
  h.window.NYC.DATA = { fullRegion: { city: { x0: -12000, x1: 5000, z0: -6000, z1: 10000 } } };
  assert.equal(h.map.teleportToPoint(west), true);
  assert.deepEqual(h.teleports[0], [west.x, west.z, undefined, undefined]);
  assert.equal(h.map.waypoint.x, west.x); assert.equal(h.map.waypoint.z, west.z);
  const accepted = h.map.waypoint;
  for (const unsupported of [{ x: -11950, z: 3000 }, { x: 1e6, z: -1e6 }]) {
    assert.equal(h.map.teleportToPoint(unsupported), false);
    assert.deepEqual(h.teleports.at(-1), [unsupported.x, unsupported.z, undefined, undefined]);
    assert.equal(h.map.waypoint, accepted, 'no safe host arrival preserves the previous waypoint');
    assert.match(h.map.elActionStatus.textContent, /no safe EUC arrival/);
  }
});

test('map taps require explicit checked success and valid returned coordinates before changing the waypoint', () => {
  const responses = [undefined, true, {}, { succeeded: false, x: 3, z: 4 },
    { succeeded: 'true', x: 3, z: 4 }, { succeeded: true, x: NaN, z: 4 },
    Promise.resolve({ succeeded: true, x: 3, z: 4 })];
  for (const response of responses) {
    const h = mapHarness({ onTeleport: () => response }), previous = h.map.waypoint;
    h.pointer(h.canvas, 'pointerdown', 1);
    h.pointer(h.canvas, 'pointerup', 1);
    assert.equal(h.teleports.length, 1);
    assert.equal(h.map.waypoint, previous);
    assert.match(h.map.elActionStatus.textContent, /Teleport unavailable/);
    assert.equal(h.captured.size, 0); assert.equal(h.map.isPanning, false);
  }
  const h = mapHarness({ onTeleport: () => ({ succeeded: true, x: 1004, z: 2008 }) });
  h.pointer(h.canvas, 'pointerdown', 1); h.pointer(h.canvas, 'pointerup', 1);
  assert.equal(h.map.waypoint.x, 1004); assert.equal(h.map.waypoint.z, 2008);
  assert.match(h.map.elActionStatus.textContent, /Teleported to 1004, 2008/);
});

test('missing or throwing teleport owners refuse safely and authored arrivals forward heading/referenceY', () => {
  const h = mapHarness(), previous = h.map.waypoint;
  h.map.onTeleport = undefined;
  assert.equal(h.map.teleportToPoint({ x: 12, z: 13 }), false);
  h.map.onTeleport = () => { throw new Error('unsupported site'); };
  assert.equal(h.map.teleportToPoint({ x: 12, z: 13 }), false);
  assert.equal(h.map.waypoint, previous);
  const arrival = { x: -6600, z: -2400, heading: 0.75, referenceY: 84.2 };
  const next = mapHarness();
  assert.equal(next.map.teleportToPoint({ x: -6564, z: -2429 }, { name: 'West viewpoint', arrival }), true);
  assert.deepEqual(next.teleports[0], [arrival.x, arrival.z, arrival.heading, arrival.referenceY]);
  assert.equal(next.map.waypoint.name, 'West viewpoint');
});

test('hillshade is built once, keeps water transparent and shades land',()=>{
  const start=source.indexOf('let RELIEF = null;'),end=source.indexOf('let LAYERS = null;',start);
  let builds=0,pixels;
  const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image.data;builds++;}};
  const g={w:3,h:3,step:8,x0:0,z0:0,heights:[0,0,0,0,10,0,0,0,0]};
  const env={window:{NYC:{DATA:{fullRegion:{city:g}},Terrain:{waterLevel:0}}},document:{createElement:()=>({getContext:()=>context})}};
  const get=vm.runInNewContext(source.slice(start,end)+';mapRelief',env);
  const first=get();assert.equal(get(),first);assert.equal(builds,1);
  assert.equal(pixels[3],0);assert.equal(pixels[4*4+3],255);
  assert.equal(first.width,16);assert.equal(first.height,16);
});

test('missing landmark labels do not break map initialization or search',()=>{
  const window={NYC:{GEO:{},ROADS:[],NYC_LANDMARKS:[{x:1,z:2}]}};
  vm.runInNewContext(source,{window});
  const map=Object.create(window.NYC.NYCMapSystem.prototype);
  map.renderFullMap=()=>{};
  assert.doesNotThrow(()=>map.search('absent'));
});

test('native map focus/inertness and owner callback gate riding; Escape restores the keyboard invoker', () => {
  const h = mapHarness();
  assert.equal(h.modal.open, true); assert.equal(h.modal.inert, false);
  assert.equal(h.document.activeElement, h.modal);
  assert.equal(h.host.inputEnabled, false, 'host receives map ownership before keys can reach riding');
  assert.ok(h.background.every(element => element.inert));
  h.key('KeyW');
  assert.equal(h.map.isFullMapOpen, true); assert.equal(h.host.inputEnabled, false);
  assert.equal(h.document.activeElement, h.modal);
  const escape = h.key('Escape');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(h.map.isFullMapOpen, false); assert.equal(h.modal.open, false);
  assert.equal(h.modal.inert, true); assert.equal(h.modal.classList.contains('hidden'), true);
  assert.equal(h.document.activeElement, h.invoker); assert.equal(h.host.inputEnabled, true);
  assert.deepEqual(h.background.map(element => element.inert), [false, true, false]);
  assert.deepEqual(h.toggles, [true, false]);
});

test('map Tab wraps visible native controls, skipping hidden, disabled, disconnected and inert entries', () => {
  const h = mapHarness();
  const first = h.element('INPUT', h.modal), last = h.element('A', h.modal);
  const hidden = h.element('BUTTON', h.modal, { hidden: true });
  const disabled = h.element('BUTTON', h.modal, { disabled: true });
  const disconnected = h.element('BUTTON', h.modal, { isConnected: false });
  const inert = h.element('BUTTON', h.modal, { inert: true });
  h.modal.querySelectorAll = () => [hidden, first, disabled, disconnected, last, inert];
  last.focus(); assert.equal(h.key('Tab').defaultPrevented, true); assert.equal(h.document.activeElement, first);
  assert.equal(h.key('Tab', { shiftKey: true }).defaultPrevented, true); assert.equal(h.document.activeElement, last);
  first.focus();
  assert.equal(h.key('Tab').defaultPrevented, false, 'interior Tab retains native browser navigation');
  h.modal.focus();
  assert.equal(h.key('Tab').defaultPrevented, true); assert.equal(h.document.activeElement, first);
  h.modal.querySelectorAll = () => [];
  assert.equal(h.key('Tab').defaultPrevented, true); assert.equal(h.document.activeElement, h.modal);
});

test('native cancel/close restore inert values once and reopening captures a fresh invoker', () => {
  for (const method of ['cancel', 'close']) {
    const h = mapHarness();
    h.map.toggleFullMap(true);
    assert.equal(h.modal.shows, 1); assert.deepEqual(h.toggles, [true]);
    if (method === 'cancel') {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      h.modal.dispatch('cancel', event); assert.equal(event.defaultPrevented, true);
    } else h.modal.close();
    assert.equal(h.modal.closes, 1); assert.equal(h.map.isFullMapOpen, false);
    assert.deepEqual(h.toggles, [true, false]);
    assert.deepEqual(h.background.map(element => element.inert), [false, true, false]);
    assert.equal(h.document.activeElement, h.invoker);
    h.gameCanvas.focus(); h.map.toggleFullMap(true); h.map.toggleFullMap(false);
    assert.equal(h.document.activeElement, h.gameCanvas, 'fresh opening does not retain an older keyboard invoker');
  }
});

test('pointer closing restores gameplay focus and focus escape while open returns to the dialog', () => {
  const h = mapHarness();
  h.document.activeElement = h.invoker;
  h.document.dispatch('focusin', { target: h.invoker });
  assert.equal(h.document.activeElement, h.modal);
  h.click(h.close, { detail: 1, pointerType: 'mouse' });
  assert.equal(h.map.isFullMapOpen, false); assert.equal(h.document.activeElement, h.gameCanvas);
});

// Real destination IDs/coordinates, without loading any park geometry or preparing arrivals.
function parkPins() {
  const window = { NYC: { GEO: {}, NYC_LANDMARKS: [] } };
  vm.runInNewContext(readFileSync(join(__dirname, '../js/sf-destinations.js'), 'utf8'), { window });
  return Array.from(window.NYC.NYC_LANDMARKS).filter(pin => ['un-plaza', 'zion'].includes(pin.id));
}

function markerHarness(dpr) {
  const calls = [];
  const ctx = new Proxy({ canvas: { width: 800 * dpr, height: 600 * dpr } }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push([key, ...args]); };
    }
  });
  let canvases = 0;
  const document = { body: { classList: { contains: () => false } }, createElement() {
    canvases++; return { getContext: () => ctx };
  } };
  const pins = parkPins();
  assert.equal(pins.length, 2);
  const ordinary = { id: 'ordinary', name: 'Ordinary landmark', x: 500, z: 0 };
  const window = { devicePixelRatio: dpr, NYC: { GEO: {}, ROADS: [], NYC_LANDMARKS: [...pins, ordinary] } };
  vm.runInNewContext(source, { window, document, performance: { now: () => 0 } });
  const map = Object.create(window.NYC.NYCMapSystem.prototype);
  const canvas = { clientWidth: 800, clientHeight: 600, width: 800 * dpr, height: 600 * dpr, offsetParent: {} };
  const player = { position: { x: 0, z: 0 }, heading: 0 };
  const reserved = [];
  Object.assign(map, {
    fullCanvas: canvas, fullCtx: ctx, fullDpr: dpr, isFullMapOpen: true,
    viewCenterX: -2000, viewCenterZ: 1000, viewZoom: 0.1, searchHighlight: '',
    miniCanvas: canvas, miniCtx: ctx,
    controllerManager: { getActiveEntity: () => player },
    cameraSystem: { currentLookAt: { clone: () => ({ sub: () => ({ x: 0, z: 1 }) }) }, currentPos: {} },
    // Geographic drawing is unchanged; retain production marker/layout/caching paths.
    drawWorld() {}, textWidth: (_ctx, text) => text.length * 6,
    drawRoadLabels: (_ctx, _view, options) => { if (options.placed) reserved.push(...options.placed); },
    drawScaleBar() {}
  });
  return { map, pins, ordinary, player, calls, reserved, canvases: () => canvases };
}

for (const dpr of [1, 1.5, 2]) test(`UN/Zion vector atlas markers, label clearance and static cache at DPR ${dpr}`, () => {
  const h = markerHarness(dpr), { map, calls } = h;
  map.renderFullMap();
  assert.equal(calls.filter(c => c[0] === 'scale' && c[1] === 1 && c[2] === 1).length, 2);
  assert.equal(calls.filter(c => c[0] === 'arc' && c[3] === 1.8).length, 4, 'two wheels per board');
  for (const pin of h.pins) {
    const x = (pin.x - map.viewCenterX) * map.viewZoom, y = (pin.z - map.viewCenterZ) * map.viewZoom;
    assert.ok(calls.some(c => c[0] === 'translate' && c[1] === x && c[2] === y), 'draw at geographic pin');
    assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === pin.short && c[2] === x + 15 && c[3] === y + 4));
    assert.ok(h.reserved.some(b => b[0] === x - 12 && b[1] === y - 12 && b[2] === x + 12 && b[3] === y + 12));
  }
  assert.ok(calls.some(c => c[0] === 'arc' && c[3] === 4.2), 'ordinary landmark remains a dot');
  const canvases = h.canvases();
  calls.length = 0;
  map.renderFullMap();
  assert.equal(calls.filter(c => c[0] === 'scale').length, 0, 'unchanged atlas reuses cached pins');
  assert.equal(h.canvases(), canvases);
  map.viewZoom = 0.11;
  map.renderFullMap();
  assert.equal(calls.filter(c => c[0] === 'scale' && c[1] === 1).length, 2, 'zoom redraw keeps CSS-pixel marker size');
});

test('radar draws the nearby park as a smaller skateboard, culls the distant park and reuses its canvas', () => {
  const h = markerHarness(2);
  for (const pin of h.pins) {
    Object.assign(h.player.position, { x: pin.x, z: pin.z });
    h.calls.length = 0;
    h.map.renderMinimap();
    assert.equal(h.calls.filter(c => c[0] === 'scale' && c[1] === 0.8 && c[2] === 0.8).length, 1);
    assert.equal(h.calls.filter(c => c[0] === 'arc' && c[3] === 1.8).length, 2);
    const canvases = h.canvases();
    h.map.renderMinimap();
    assert.equal(h.canvases(), canvases, 'no new canvas per radar update');
  }
});

test('skateboard selection uses 12 CSS pixels, preserves ordinary 8px pins and checked arrival/search behavior', () => {
  for (const pin of parkPins()) {
    const arrival = { x: pin.x + 30, z: pin.z + 20, heading: 0.7, y: 12, exact: true, departure: 1.2 };
    const landmark = { ...pin, arrival };
    const ordinary = { id: 'ordinary', x: 4000, z: 5000, arrival };
    const h = mapHarness({ landmarks: [landmark, ordinary] });
    for (const zoom of [0.015, 0.22, 1, 3]) {
      h.map.viewZoom = zoom;
      assert.equal(h.map.authoredPinAt({ x: pin.x + 11.9 / zoom, z: pin.z }), landmark);
      assert.equal(h.map.authoredPinAt({ x: pin.x + 12.1 / zoom, z: pin.z }), null);
      assert.equal(h.map.authoredPinAt({ x: ordinary.x + 7.9 / zoom, z: ordinary.z }), ordinary);
      assert.equal(h.map.authoredPinAt({ x: ordinary.x + 8.1 / zoom, z: ordinary.z }), null);
    }
    h.map.search(pin.aliases[0]);
    assert.equal(h.map.searchResults[0], landmark);
    assert.equal(h.teleports.length, 0, 'search frames the pin without moving the rider');
    const teleports = [];
    h.map.onTeleport = (...args) => { teleports.push(args); return { succeeded: true, x: arrival.x, z: arrival.z }; };
    const point = { x: pin.x + 11 / h.map.viewZoom, z: pin.z };
    assert.equal(h.map.teleportToPoint(point, h.map.authoredPinAt(point)), true);
    assert.deepEqual(teleports[0].slice(0, 4), [arrival.x, arrival.z, arrival.heading, arrival.y]);
    assert.equal(teleports[0][4].exact, true); assert.equal(teleports[0][4].departure, 1.2);
    const accepted = h.map.waypoint;
    h.map.onTeleport = () => ({ succeeded: false });
    assert.equal(h.map.teleportToPoint(point, landmark), false);
    assert.equal(h.map.waypoint, accepted);
  }
});
