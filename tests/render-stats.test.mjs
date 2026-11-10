// Deterministic production collector/host tests. Fake DOM and native Three Info CPU code; no browser/GPU.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRenderStats } from '../js/render-stats.js';
import { createFramePacer, frameRateHealth } from '../js/frame-rate.js';
import { menuOwner } from '../js/game-menu.js';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const main = source('js/main.js'), moduleSource = source('js/render-stats.js');
const vendor = source('vendor/three/build/three.webgpu.js');
const from = vendor.indexOf('class Info {'), to = vendor.indexOf('\nclass Pipeline', from);
assert.ok(from >= 0 && to > from);
const Info = new Function(vendor.slice(from, to) + '\nreturn Info;')();
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const noop = () => {};
function dom({ width = 1280, height = 720, controls = [] } = {}) {
  const created = [], body = { children: [], classList: { toggle: noop }, append(node) { this.children.push(node); node.parent = this; } };
  let writes = 0, layouts = 0;
  const toolbar = { style: {}, getBoundingClientRect: () => rect(width - 440, 20, 420, 50) };
  const generic = { style: {}, dataset: {}, className: '', setAttribute: noop, removeAttribute: noop };
  const document = { body, hidden: false, hasFocus: () => true, documentElement: { clientWidth: width, clientHeight: height },
    defaultView: { getComputedStyle: node => ({ display: 'block', visibility: 'visible', opacity: '1', ...node.style }) },
    getElementById: id => id === 'hud-toolbar' ? toolbar : generic,
    querySelectorAll: () => controls,
    createElement(tag) {
      let value = '';
      const node = { tagName: tag.toUpperCase(), hidden: false, className: '', style: {}, attributes: new Map(), children: [],
        setAttribute(key, text) { this.attributes.set(key, text); },
        append(child) { this.children.push(child); child.parent = this; },
        remove() { const i = this.parent?.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; },
        get textContent() { return value; }, set textContent(text) { value = text; writes++; },
        getBoundingClientRect() {
          layouts++;
          if (this.hidden) return rect(0, 0, 0, 0);
          const w = Math.min(340, document.documentElement.clientWidth - 24);
          return rect((document.documentElement.clientWidth - w) / 2, parseFloat(this.style.top) || 82, w, 84);
        }
      };
      created.push(node); return node;
    }
  };
  return { document, created, controls, toolbar, get writes() { return writes; }, get layouts() { return layouts; },
    get panel() { return created[0]; }, get text() { return created[1]?.textContent ?? ''; } };
}
function fixture(options = {}, factory = createRenderStats) {
  const d = dom(options), info = new Info();
  info.render.calls = 987654; // Cumulative render calls must never substitute for frame draw calls.
  const renderer = { backend: options.backend ?? { isWebGPUBackend: true }, info };
  const stats = factory({ enabled: true, renderer, document: d.document });
  return { ...d, d, info, renderer, stats, get text() { return d.text; }, get panel() { return d.panel; },
    submit(now, riding = true) { stats.setActive(riding); stats.submitted(now, riding); } };
}
function metrics(text) {
  const timing = text.match(/Interval ms mean\/p95: ([\d.]+|—) \/ ([\d.]+|—)/);
  const count = text.match(/>50 ms: (\d+) \/ (\d+)/);
  assert.ok(timing && count, text);
  return { mean: timing[1] === '—' ? null : Number(timing[1]), p95: timing[2] === '—' ? null : Number(timing[2]),
    slow: Number(count[1]), size: Number(count[2]) };
}
function section(start, end) {
  const a = main.indexOf(start), b = main.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production host: ${start}`);
  return main.slice(a, b);
}

test('diagnostics default off does not touch DOM, renderer counters, clocks or typed storage', () => {
  const poison = new Proxy({}, { get() { throw Error('disabled diagnostics accessed a dependency'); } });
  const factory = new Function('Float64Array', moduleSource.replace('export function', 'function') + '\nreturn createRenderStats;')(
    class { constructor() { throw Error('disabled allocation'); } });
  assert.equal(factory(), null);
  for (const enabled of [undefined, false, 0, '1']) {
    assert.equal(factory({ enabled, renderer: poison, document: poison }), null);
  }
});

test('whole-frame draw/triangle scalars use native Three Info, actual backend and survive a skipped RAF reset', () => {
  for (const [backend, label] of [[{ isWebGPUBackend: true }, 'WebGPU'], [{ isWebGLBackend: true }, 'WebGL2'], [{}, 'Unknown backend']]) {
    const f = fixture({ backend });
    // Several passes, instanced triangles and a line draw all contribute to the native whole-frame Info.
    for (let pass = 0; pass < 3; pass++) f.info.update({ isMesh: true }, 300, 10);
    f.info.update({ isMesh: true }, 6, 1); f.info.update({ isLineSegments: true }, 8, 1);
    f.submit(0);
    assert.match(f.text, new RegExp(`^${label} · whole submitted frame`));
    assert.match(f.text, /Draw calls: 5 · Triangles: 3002/);
    assert.equal(f.info.autoReset, true, 'collector never takes renderer reset ownership');
    f.info.reset(); // The next native RAF can reset even when its FPS slot submits nothing.
    f.stats.setActive(true);
    assert.match(f.text, /Draw calls: 5 · Triangles: 3002/, 'DOM keeps the submitted snapshot, not the reset live object');
    f.info.update({ isMesh: true }, 120, 4); f.info.update({ isMesh: true }, 6, 1);
    f.submit(500);
    assert.match(f.text, /Draw calls: 2 · Triangles: 162/);
    assert.doesNotMatch(f.text, /987654/);
    f.stats.dispose();
  }
  const f = fixture();
  delete f.info.render.drawCalls; f.info.render.triangles = NaN;
  f.submit(0); assert.match(f.text, /Draw calls: n\/a · Triangles: n\/a/);
});

test('deterministic mean/p95, strict >50 ms and 500 ms DOM/layout cadence use only submitted intervals', () => {
  const f = fixture();
  for (const now of [0, 10, 20, 70, 130]) f.submit(now);
  assert.equal(f.d.writes, 1); assert.equal(f.d.layouts, 1);
  assert.deepEqual(metrics(f.text), { mean: null, p95: null, slow: 0, size: 0 });
  f.submit(500);
  assert.deepEqual(metrics(f.text), { mean: 100, p95: 370, slow: 2, size: 5 });
  assert.equal(f.d.writes, 2); assert.equal(f.d.layouts, 2);
  for (let now = 510; now < 1000; now += 10) f.submit(now);
  assert.equal(f.d.writes, 2); assert.equal(f.d.layouts, 2);
  f.submit(1000);
  assert.equal(f.d.writes, 3); assert.equal(f.d.layouts, 3);
  assert.equal(f.d.created.length, 2, 'one aside/pre pair, no DOM reconstruction');
});

test('five-second expiry, 600-interval capacity and workspace reuse ignore stale ring tails', () => {
  let allocations = 0, sorts = 0;
  const factory = new Function('Float64Array', moduleSource.replace('export function', 'function') + '\nreturn createRenderStats;')(
    class extends Float64Array {
      constructor(...args) { super(...args); allocations++; }
      sort() { sorts++; return super.sort(); }
    });
  const f = fixture({}, factory), initial = allocations;
  for (let now = 0; now <= 10000; now += 5) f.submit(now);
  assert.deepEqual(metrics(f.text), { mean: 5, p95: 5, slow: 0, size: 600 });
  assert.equal(allocations, initial, 'ring and percentile workspace do not grow or allocate views per frame');
  assert.equal(sorts, 21, 'sort only at 500 ms publication boundaries');
  f.stats.reset();
  for (let now = 20000; now <= 31000; now += 1000) f.submit(now);
  assert.deepEqual(metrics(f.text), { mean: 1000, p95: 1000, slow: 5, size: 5 }, 'old ends expire at the five-second boundary');
  assert.equal(allocations, initial);
});

test('nearest-rank p95 distinguishes a rare maximum from the 95th percentile', () => {
  const f = fixture(); let now = 0;
  f.submit(now);
  for (let i = 0; i < 94; i++) { now += 10; f.submit(now); }
  for (let i = 0; i < 5; i++) { now += 60; f.submit(now); }
  now += 200; f.submit(now);
  now += 60; f.submit(now);
  assert.equal(now, 1500);
  assert.deepEqual(metrics(f.text), { mean: 14.9, p95: 60, slow: 7, size: 101 });
});

test('suspension, hidden pages and invalid/backward clocks reset without recording invalid gaps', () => {
  const f = fixture();
  let now = 0;
  for (const reason of ['title', 'pause', 'map', 'hidden', 'graphics', 'compile', 'dirty frozen view']) {
    f.submit(now); f.submit(now + 500);
    f.stats.setActive(false); f.stats.submitted(now + 10000, false);
    assert.equal(f.panel.hidden, true, reason); assert.equal(f.text, '');
    now += 20000;
    f.submit(now);
    assert.deepEqual(metrics(f.text), { mean: null, p95: null, slow: 0, size: 0 }, reason);
    for (let step = 1; step <= 32; step++) f.submit(now + step * 16);
    assert.deepEqual(metrics(f.text), { mean: 16, p95: 16, slow: 0, size: 32 }, reason);
    now += 1000;
  }
  f.document.hidden = true;
  f.stats.submitted(now + 100000, true);
  assert.equal(f.panel.hidden, true); assert.equal(f.text, '');
  f.document.hidden = false;
  for (const invalid of [NaN, Infinity, -Infinity]) {
    f.submit(invalid); assert.equal(f.text, '');
    f.submit(now); assert.equal(metrics(f.text).size, 0); now += 1000;
  }
  f.submit(now); f.submit(now); assert.equal(metrics(f.text).size, 0, 'zero intervals are not admitted');
  f.submit(now - 1); assert.equal(metrics(f.text).size, 0, 'backward clock starts a new window');
});

test('named read-only panel clears measured controls, respects compact bounds and disposes idempotently', () => {
  const controls = [{ style: {}, getBoundingClientRect: () => rect(480, 80, 300, 80) },
    { style: {}, getBoundingClientRect: () => rect(480, 210, 300, 50) },
    { style: { visibility: 'hidden' }, getBoundingClientRect: () => rect(0, 0, 1280, 720) }];
  const f = fixture({ controls }); f.submit(0);
  assert.equal(f.panel.tagName, 'ASIDE'); assert.equal(f.panel.children[0].tagName, 'PRE');
  assert.equal(f.panel.attributes.get('aria-label'), 'Rendering diagnostics');
  assert.equal(f.panel.attributes.get('aria-live'), 'off');
  assert.equal(f.panel.style.top, '268px'); assert.equal(f.panel.hidden, false);
  f.document.documentElement.clientHeight = 340; f.submit(500);
  assert.equal(f.panel.hidden, true, 'insufficient clear space never covers controls');
  f.stats.dispose(); f.stats.dispose();
  assert.equal(f.document.body.children.length, 0);
  const writes = f.d.writes;
  f.stats.setActive(true); f.stats.submitted(1000, true); f.stats.reset();
  assert.equal(f.document.body.children.length, 0); assert.equal(f.d.writes, writes);
  const css = source('css/style.css');
  assert.match(css, /\.render-stats\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.render-stats pre\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /body\.hud-minimized \.render-stats\s*\{\s*visibility:\s*hidden/);
});

function hostFixture(enabled = true) {
  const f = fixture(), failures = [];
  if (!enabled) f.stats.dispose();
  let callback, infoReads = 0;
  const diagnostics = enabled ? f.stats : null;
  const renderer = f.renderer;
  renderer.setAnimationLoop = fn => { callback = fn; };
  Object.defineProperty(renderer, 'info', { get() { infoReads++; return f.info; } });
  const entity = { position: {}, controller: {}, update: noop, prepareView: noop, speed: 0 };
  const controls = { value: 'high', dataset: {}, style: {}, setAttribute: noop, removeAttribute: noop };
  const state = { titleScreen: { isOpen: false, started: true, update: noop }, gameMenu: { isOpen: false, updateGamepad: noop },
    mapSystem: { isFullMapOpen: false, update: noop, cancelGestures: noop, enabled: true },
    startup: { failed: false }, booking: { active: false }, document: f.document };
  const env = { ...state, menuOwner, frameRateHealth, formatSpeed: () => '0', diagnostics, renderer,
    framePacer: createFramePacer('30'), frameRatePreference: { value: '30' },
    graphics: { apply: noop, value: 'high' }, graphicsPreference: { value: 'high' }, graphicsLimit: controls,
    renderPipeline: { render() { f.info.update({ isMesh: true }, 300, 10); f.info.update({ isMesh: true }, 6, 1); } },
    controllerManager: { getActiveEntity: () => entity, update: noop, setInputEnabled: noop, resetInput: noop, keys: {} },
    cameraSystem: { camera: { position: {} }, currentPos: {}, update: noop, _clearPointers: noop }, lightingSystem: { activePresetId: 'golden' },
    touchControls: { setEnabled: noop, setDown: noop },
    gamepadControls: { update: noop, setEnabled: noop, reset: noop }, audioSystem: { setPaused: noop, update: noop },
    streetDetails: {}, trafficSystem: { update: noop }, highwayTraffic: { update: noop }, transit: { update: noop },
    nemesis: null, retireBookingSpawnProtection: noop, bookingScreen: { setSuspended: noop },
    city: { updateSceneCulling: noop, getLocationLabel: () => 'fixture' }, eucHud: { update: noop }, savePlayerState: noop, updateWorldView: noop,
    graphicsFailed: error => failures.push(error), promptDevice: 'keyboard', renderLocation: noop,
    lightBoundary: null, lightNotice: null };
  const runtime = new Function(...Object.keys(env), `
    let rendererBusy = false, stopped = false, pageAway = false, lastOwner = null, lifecycleReady = true;
    let windowFocused = true, bookingSuspended = false, bookingClearancePending = false, dirtyView = false;
    let lastTime = null, elapsed = 0, titleElapsed = 0, frameCount = 0, fpsTimer = 0, nextPlayerSave = Infinity, warmedUp = true, currentFps = 0;
    ${section('  function owner()', '  function compileRider(')}
    renderStats = diagnostics;
    ${main.slice(main.indexOf('  renderer.setAnimationLoop(now => {'), main.lastIndexOf('\n}'))}
    return { resetFrameClock, setBusy(value) { rendererBusy = value; }, setAway(value) { pageAway = value; },
      setFocus(value) { windowFocused = value; }, dirty() { dirtyView = true; } };`)(...Object.values(env));
  return { ...f, ...runtime, state, failures, get infoReads() { return infoReads; }, step(now) { f.info.reset(); callback(now); } };
}

test('production host samples after whole pipeline only, keeps FPS-skipped intervals and excludes dirty frozen/hidden/compile views', () => {
  const f = hostFixture();
  f.step(0); assert.deepEqual(f.failures, []); assert.match(f.d.text, /Draw calls: 2 · Triangles: 1002/);
  f.step(10); f.step(20); assert.equal(f.infoReads, 1, 'only a submitted frame reads counters, not the FPS-skipped callbacks');
  for (let now = 30; now <= 600; now += 10) f.step(now);
  const before = metrics(f.d.text);
  assert.ok(before.mean >= 30 && before.mean <= 40, 'submitted interval includes intentionally skipped 30 FPS callbacks');
  for (const key of ['menu', 'map', 'title', 'hidden', 'compile', 'away', 'focus']) {
    if (key === 'menu') f.state.gameMenu.isOpen = true;
    if (key === 'map') f.state.mapSystem.isFullMapOpen = true;
    if (key === 'title') f.state.titleScreen.isOpen = true;
    if (key === 'hidden') f.document.hidden = true;
    if (key === 'compile') f.setBusy(true);
    if (key === 'away') f.setAway(true);
    if (key === 'focus') f.setFocus(false);
    f.dirty(); f.step(10000);
    assert.equal(f.d.panel.hidden, true, key); assert.equal(f.d.text, '', key);
    f.state.gameMenu.isOpen = false; f.state.mapSystem.isFullMapOpen = false; f.state.titleScreen.isOpen = false;
    f.document.hidden = false; f.setBusy(false); f.setAway(false); f.setFocus(true);
    f.resetFrameClock(); f.dirty(); f.step(20000);
    assert.equal(metrics(f.d.text).size, 0, `${key}: no suspended interval`);
  }
  assert.deepEqual(f.failures, []);
  const off = hostFixture(false); off.step(0); off.step(1000);
  assert.equal(off.infoReads, 0); assert.equal(off.document.body.children.length, 0); assert.deepEqual(off.failures, []);
});

test('production URL gate and owned-disposal registration create only perf=1 and remove the panel on cleanup', () => {
  const registration = section('  renderStats = createRenderStats(', '  lifecycleReady = true;');
  for (const search of ['', 'perf=0', 'perf=true', 'perf=1', 'webgpu=0&perf=1']) {
    const d = dom(), ownedDisposals = [], info = new Info();
    const stats = new Function('createRenderStats', 'params', 'renderer', 'ownedDisposals', `let renderStats;
      ${registration}\nreturn renderStats;`)(
      options => createRenderStats({ ...options, document: d.document }), new URLSearchParams(search),
      { backend: { isWebGLBackend: true }, info }, ownedDisposals);
    const enabled = new URLSearchParams(search).get('perf') === '1';
    assert.equal(stats !== null, enabled); assert.equal(ownedDisposals.length, enabled ? 1 : 0);
    assert.equal(d.created.length, enabled ? 2 : 0);
    for (const dispose of ownedDisposals) dispose();
    assert.equal(d.document.body.children.length, 0);
  }
  assert.match(main, /renderPipeline\.render\(\);\s*renderStats\?\.submitted\(now, riding\);\s*frameCount\+\+/);
  assert.match(section('  function compileRider(', '  const riderSelection ='), /rendererBusy = true;\s*renderStats\?\.reset\(\)/);
});
