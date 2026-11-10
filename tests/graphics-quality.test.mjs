// NYC graphics-quality tests @4a88f17, extended for SF fog/presets and actual host ownership.
// Real preference/quality/post graph code; GPU-only pipelines and bloom targets are observable stand-ins.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';
import { createGraphicsQualityPreference, createGraphicsQuality, GRAPHICS_QUALITY_KEY } from '../js/graphics-quality.js';
import { createFramePacer, frameRateHealth } from '../js/frame-rate.js';
import { menuOwner } from '../js/game-menu.js';
import { createBookingDirector } from '../js/booking.js';

const read = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const main = read('main');
const choices = ['high', 'medium', 'low'];
const invalid = [undefined, null, '', 'auto', 'HIGH', ' low', '__proto__', 'constructor', 1, true,
  {}, new String('low'), { toString: () => 'low' }];
function storage(entries = []) {
  const data = new Map(entries), reads = [], writes = [];
  return { data, reads, writes, getItem(key) { reads.push(key); return data.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); data.set(key, value); } };
}

test('quality reads only its SF domain once and writes only explicit valid changes', () => {
  const other = [
    ['euc-sanfrancisco-player-state', '{"version":3}'], ['euc-sanfrancisco-view-state', '{"time":"midnight"}'],
    ['euc-sanfrancisco-frame-rate', '30'], ['euc-sanfrancisco-render-resolution', '75'],
    ['euc-sanfrancisco-sound', 'off'], ['euc-newyork-graphics-quality', 'low']
  ];
  const store = storage(other), pref = createGraphicsQualityPreference(() => store);
  assert.equal(GRAPHICS_QUALITY_KEY, 'euc-sanfrancisco-graphics-quality');
  assert.equal(pref.value, 'high');
  assert.deepEqual(store.writes, [], 'restoring defaults never overwrites storage');
  for (const bad of invalid) assert.equal(pref.set(bad), false);
  for (const choice of ['medium', 'low', 'high']) {
    assert.equal(pref.set(choice), true);
    assert.equal(pref.set(choice), false);
    for (let i = 0; i < 100; i++) assert.equal(pref.value, choice);
  }
  assert.deepEqual(store.reads, [GRAPHICS_QUALITY_KEY], 'no per-frame storage reads');
  assert.deepEqual(store.writes, ['medium', 'low', 'high'].map(value => [GRAPHICS_QUALITY_KEY, value]));
  assert.deepEqual([...store.data].filter(([key]) => key !== GRAPHICS_QUALITY_KEY), other);
});

test('saved quality accepts only exact supported strings without repairing unknown bytes', () => {
  for (const saved of [...choices, ...invalid]) {
    const store = storage([[GRAPHICS_QUALITY_KEY, saved]]);
    const pref = createGraphicsQualityPreference(() => store);
    assert.equal(pref.value, choices.includes(saved) ? saved : 'high');
    assert.equal(store.data.get(GRAPHICS_QUALITY_KEY), saved);
    assert.deepEqual(store.writes, []);
  }
});

test('provider, read and write failures retain an independently usable in-memory quality choice', () => {
  for (const getStorage of [
    () => { throw Error('storage access denied'); },
    () => ({ getItem() { throw Error('read denied'); }, setItem() { throw Error('write denied'); } }),
    () => ({ getItem: () => 'medium', setItem() { throw Error('quota exceeded'); } })
  ]) {
    const pref = createGraphicsQualityPreference(getStorage);
    for (const choice of ['low', 'high', 'medium']) {
      assert.equal(pref.set(choice), true);
      assert.equal(pref.value, choice);
      assert.equal(pref.set(choice), false);
      assert.equal(pref.set('broken'), false);
    }
  }
});

// Execute complete production closures, as in the donor's frame-rate/game-menu tests.
// No copied switching/admission logic or source-text assertions stand in for behavior.
function section(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `host extraction: ${start}`);
  return main.slice(from, to);
}
function evaluate(code, env) { return new Function(...Object.keys(env), code)(...Object.values(env)); }
const noop = () => {};

function effectsFixture({ initial = 'high', highSize = 3072, map = true } = {}) {
  const order = [], pipelines = [], grades = [], blooms = [], sizes = [], ssrSizes = [];
  const failure = { next: null }, store = storage([[GRAPHICS_QUALITY_KEY, initial]]);
  const graphicsPreference = createGraphicsQualityPreference(() => store);
  const shadow = { intensity: .8, autoUpdate: true, needsUpdate: false,
    mapSize: { x: highSize, y: highSize, set(x, y) { this.x = x; this.y = y; } },
    getFrameExtents: () => ({ x: 2, y: 1 }),
    map: map ? { setSize: (...size) => sizes.push(size) } : null };
  const sunLight = { shadow, castShadow: true };
  const lightingSystem = { sunLight, activePresetId: 'golden', uNightFactor: TSL.uniform(0), uMarine: TSL.uniform(1),
    createAerialFogNode(world, eye) { return { color: world.sub(eye).abs(), amount: TSL.uniform(.4) }; } };
  const city = { THREE, TSL, PostFX: { bloom() {
    const node = Object.assign(TSL.vec4(0), { strength: TSL.uniform(.24), threshold: TSL.uniform(1.2),
      smoothWidth: TSL.uniform(0), sizes: [], disposed: 0,
      setResolutionScale(value) { this.resolutionScale = value; },
      setSize(...size) { this.sizes.push(size); },
      dispose() { this.disposed++; order.push('bloom-dispose'); } });
    blooms.push(node); return node;
  } } };
  evaluate(read('post-processing'), { window: { NYC: city } });
  const createPost = city.createPostProcessing;
  city.createPostProcessing = (...args) => {
    if (failure.next) { const error = failure.next; failure.next = null; throw error; }
    const grade = createPost(...args);
    grades.push({ grade, reflections: args[2], depth: args[3], camera: args[4], lighting: args[5] });
    return grade;
  };
  class RenderPipeline {
    constructor(renderer, outputNode) { Object.assign(this, { renderer, outputNode, renders: 0, disposed: 0 }); pipelines.push(this); }
    render() { this.renders++; order.push('render'); }
    dispose() { this.disposed++; order.push('pipeline-dispose'); }
  }
  const renderer = {}, cameraSystem = { camera: new THREE.PerspectiveCamera() };
  const scenePass = { renderTarget: {}, disposed: 0, dispose() { this.disposed++; order.push('scene-dispose'); } };
  const reflected = TSL.vec4(.1), reflectionMask = TSL.float(1);
  const ssrPass = { disposed: 0, mul(mask) { assert.equal(mask, reflectionMask); return reflected; },
    setSize: (...size) => ssrSizes.push(size), dispose() { this.disposed++; order.push('ssr-dispose'); } };
  const env = { THREE: { RenderPipeline }, city, renderer, cameraSystem, lightingSystem, graphicsPreference,
    createGraphicsQuality, scenePass, scenePassColor: TSL.vec4(.5), scenePassDepth: TSL.vec4(.5),
    ssrPass, reflectionMask, vec4: TSL.vec4, ownedDisposals: [] };
  const runtime = evaluate(`${section('  const graphics = createGraphicsQuality({', '  let titleScreen = null')}
    return { graphics, renderPipeline };`, env);
  return { ...runtime, env, store, failure, shadow, order, pipelines, grades, blooms, sizes, ssrSizes, reflected };
}

test('host allocates only the initial tier and shares the SF scene/depth/camera/fog owner', () => {
  for (const initial of choices) {
    const f = effectsFixture({ initial });
    assert.equal(f.pipelines.length, 1);
    assert.equal(f.graphics.value, initial);
    assert.equal(f.blooms.length, initial === 'low' ? 0 : 1);
    const { grade, depth, camera, lighting, reflections } = f.grades[0];
    assert.equal(depth, f.env.scenePassDepth); assert.equal(camera, f.env.cameraSystem.camera);
    assert.equal(lighting, f.env.lightingSystem); assert.equal(grade.fogEnabled.value, 1);
    assert.equal(reflections === f.reflected, initial === 'high');
    f.renderPipeline.render();
    assert.equal(f.pipelines[0].renders, 1);
    f.env.ownedDisposals[0]();
    assert.equal(f.env.scenePass.disposed, 1); assert.equal(f.env.ssrPass.disposed, 1);
  }
});

test('100 switching cycles retain three stable lazy graphs, park effects and restore device-specific High shadows', () => {
  for (const highSize of [2048, 3072]) {
    const f = effectsFixture({ highSize }), original = f.graphics.current;
    const owners = new Map([['high', original]]);
    for (let i = 0; i < 100; i++) for (const tier of ['medium', 'low', 'high']) {
      assert.equal(f.graphics.apply(tier), true);
      if (!owners.has(tier)) owners.set(tier, f.graphics.current);
      assert.equal(f.graphics.current, owners.get(tier));
      assert.equal(f.graphics.value, tier);
      const tile = { high: highSize, medium: 1024, low: 16 }[tier];
      assert.deepEqual(f.sizes.at(-1), [tile * 2, tile]);
      assert.equal(f.shadow.autoUpdate, tier !== 'low'); assert.equal(f.shadow.needsUpdate, tier !== 'low');
      assert.equal(f.shadow.intensity, tier === 'low' ? 0 : .8);
      assert.equal(f.env.lightingSystem.sunLight.castShadow, true, 'shared shadow node is never toggled off');
      const renders = f.pipelines.map(p => p.renders);
      f.renderPipeline.render();
      f.pipelines.forEach((pipeline, index) => assert.equal(pipeline.renders,
        renders[index] + Number(pipeline === f.graphics.current.pipeline), 'only the selected stable pipeline submits'));
    }
    assert.equal(f.graphics.current, original); assert.equal(f.pipelines.length, 3); assert.equal(f.blooms.length, 2);
    for (const bloom of f.blooms) {
      assert.equal(bloom.resolutionScale, .5);
      assert.deepEqual(bloom.sizes, Array.from({ length: 100 }, () => [32, 32]), 'inactive five-mip targets shrink legally');
      assert.equal(bloom.disposed, 0, 'parking retains reusable owners');
    }
    assert.deepEqual(f.ssrSizes, Array.from({ length: 100 }, () => [32, 32]));
    assert.equal(f.sizes.length, 301);
    for (const bad of [...invalid, 'high']) assert.equal(f.graphics.apply(bad), false);
    assert.equal(f.sizes.length, 301); assert.equal(f.pipelines.length, 3);
    f.graphics.dispose(); f.graphics.dispose();
    assert.ok(f.pipelines.every(p => p.disposed === 1)); assert.ok(f.blooms.every(b => b.disposed === 1));
    assert.equal(f.graphics.current, null); assert.equal(f.graphics.apply('low'), false);
    assert.equal(f.env.scenePass.disposed, 0); assert.equal(f.env.ssrPass.disposed, 0, 'tier owners do not free shared passes');
  }
});

test('Low before lazy shadow-map allocation still restores the original High tile size and intensity', () => {
  const f = effectsFixture({ initial: 'low', highSize: 2048, map: false });
  assert.equal(f.shadow.map, null); assert.equal(f.shadow.intensity, 0);
  f.shadow.map = { setSize: (...size) => f.sizes.push(size) };
  f.graphics.apply('medium'); assert.deepEqual(f.sizes.at(-1), [2048, 1024]);
  f.graphics.apply('high'); assert.deepEqual(f.sizes.at(-1), [4096, 2048]);
  assert.equal(f.shadow.intensity, .8); assert.equal(f.shadow.autoUpdate, true); assert.equal(f.shadow.needsUpdate, true);
  f.graphics.dispose();
});

test('SF time looks reach retained and newly lazy-created graphs, including bloom-free Low', () => {
  const f = effectsFixture();
  const looks = {
    golden: [1.04, 1.12, 1.08, [1.045, 1, .955], .24, 1.20],
    midday: [1, 1.10, 1.06, [1.015, 1, .985], .18, 1.35],
    twilight: [1.06, 1.10, 1.08, [1.025, .995, 1.015], .28, 1.05],
    midnight: [1.04, 1.08, 1.06, [.985, 1, 1.035], .30, 1]
  };
  const check = id => {
    for (const { grade } of f.grades) {
      const [exposure, contrast, saturation, balance, strength, threshold] = looks[id];
      assert.equal(grade.exposure.value, exposure); assert.equal(grade.contrast.value, contrast);
      assert.equal(grade.saturation.value, saturation); assert.deepEqual(grade.balance.value.toArray(), balance);
      assert.equal(grade.fogEnabled.value, 1);
      if (grade.bloomPass) {
        assert.equal(grade.bloomPass.strength.value, strength); assert.equal(grade.bloomPass.threshold.value, threshold);
      }
    }
  };
  check('golden');
  f.graphics.applyTime('midnight'); f.graphics.apply('medium'); check('midnight');
  f.graphics.applyTime('midday'); f.graphics.apply('low'); check('midday');
  assert.equal(f.graphics.current.grade.bloomPass, null);
  for (const id of Object.keys(looks)) { f.graphics.applyTime(id); check(id); }
  f.graphics.apply('high'); check('midnight');
  f.graphics.dispose(); f.graphics.applyTime('golden'); check('midnight');
});

test('factory failure leaves active effects/shadows unchanged, supports retry and retains exact teardown ownership', () => {
  const f = effectsFixture(), original = f.graphics.current;
  const failure = Error('post factory failed'); f.failure.next = failure;
  assert.throws(() => f.graphics.apply('medium'), error => error === failure);
  assert.equal(f.graphics.current, original); assert.equal(f.graphics.value, 'high');
  assert.equal(f.pipelines.length, 1); assert.equal(f.sizes.length, 1);
  assert.deepEqual(f.ssrSizes, []); assert.deepEqual(f.blooms[0].sizes, []);
  assert.equal(f.shadow.intensity, .8); assert.equal(f.shadow.mapSize.x, 3072);
  assert.equal(f.graphics.apply('medium'), true, 'failed factory output was not cached');
  assert.equal(f.pipelines.length, 2);
  f.env.ownedDisposals[0]();
  assert.ok(f.pipelines.every(p => p.disposed === 1)); assert.ok(f.blooms.every(b => b.disposed === 1));
  assert.deepEqual(f.order.slice(-2), ['ssr-dispose', 'scene-dispose']);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function hostFixture() {
  const f = effectsFixture(), native = deferred(), calls = [], failures = [], listeners = new Map();
  let callback, cleanup;
  const control = { value: '', dataset: {}, attrs: new Map(),
    setAttribute(key, value) { this.attrs.set(key, value); }, removeAttribute(key) { this.attrs.delete(key); } };
  const entity = { position: { x: 0, y: 12, z: 0 }, controller: {}, update: noop,
    prepareView: () => calls.push('view'), speed: 0 };
  const group = { mesh: { frustumCulled: true }, traverse(fn) { fn(this.mesh); },
    removeFromParent() { calls.push('detach'); } };
  let target = 'original-target', mrt = 'original-mrt';
  Object.assign(f.env.renderer, { setAnimationLoop(fn) { callback = fn; },
    getRenderTarget: () => target, getMRT: () => mrt,
    setRenderTarget(value) { target = value; }, setMRT(value) { mrt = value; },
    compileAsync: () => native.promise, dispose: () => f.order.push('renderer-dispose') });
  const env = { ...f.env, ...f, menuOwner, frameRateHealth,
    framePacer: createFramePacer('30'), frameRatePreference: { value: '30' },
    document: { hidden: false, hasFocus: () => true, getElementById: () => control },
    startup: { failed: false, onStop(fn) { cleanup = fn; } },
    graphicsFailed: error => { failures.push(error); env.startup.failed = true; },
    titleScreen: { isOpen: false, started: true, update: noop }, gameMenu: { isOpen: false, updateGamepad: noop },
    booking: createBookingDirector(),
    bookingScreen: { setSuspended: value => calls.push(['suspended', value]), updateGamepad: noop, update: noop },
    bookingScene: { update: () => null }, nemesis: null, retireBookingSpawnProtection: noop,
    controllerManager: { getActiveEntity: () => entity, update: () => calls.push('simulation'),
      setInputEnabled: noop, resetInput: noop, keys: {} },
    gamepadControls: { update: noop, setEnabled: noop, reset: noop },
    touchControls: { setDown: noop, setEnabled: noop },
    cameraSystem: { ...f.env.cameraSystem, currentPos: {}, update: noop, _clearPointers: noop },
    mapSystem: { isFullMapOpen: false, update: noop, cancelGestures: noop },
    audioSystem: { update: noop, setPaused: noop }, eucHud: { update: noop },
    trafficSystem: { update: noop }, highwayTraffic: { update: noop }, transit: { update: noop }, streetDetails: {},
    city: { updateSceneCulling: noop }, scene: { add: () => calls.push('attach') }, sceneMRT: {},
    updateWorldView: noop, savePlayerState: noop, promptDevice: 'keyboard', lightBoundary: null, lightNotice: null,
    scheduleViewportResize: () => calls.push('resize'),
    listen: (element, type, fn) => { assert.equal(element, control); listeners.set(type, fn); },
    setGameUIEnabled: noop, startupPreparation: { abort: noop }, stopRuntime: async () => {}, releaseAppearanceCaches: noop
  };
  const runtime = evaluate(`let rendererBusy = false, stopped = false, pageAway = false, runtimeCompile = null;
    let rendererInit = null, compileWork = null, firstFrameWork = null, riderPreparationWork = null;
    let dirtyView = false, lastOwner = null, lifecycleReady = false, currentFps = 0;
    let windowFocused = true, bookingSuspended = false, bookingClearancePending = false;
    let lastTime = null, elapsed = 0, titleElapsed = 0, frameCount = 0, fpsTimer = 0, nextPlayerSave = Infinity, warmedUp = true;
    ${section('  function owner()', '  function compileRider(')}
    ${section('  function compileRider(', '  const riderSelection =')}
    ${section("  const graphicsLimit = document.getElementById('graphics-quality');", '  // Preserve native button/select')}
    ${section('  startup.onStop(async () => {', '  rendererInit = renderer.init();')}
    ${main.slice(main.indexOf('  renderer.setAnimationLoop(now => {'), main.lastIndexOf('\n}'))}
    return { compileRider, setPageAway: value => { pageAway = value; } };`, env);
  return { ...f, ...runtime, env, native, calls, failures, control, group,
    step: now => callback(now), cleanup: () => cleanup(),
    change(value) { control.value = value; listeners.get('change')(); },
    get target() { return target; }, get mrt() { return mrt; } };
}

test('native compile ownership drains before the latest quality request can park, resize or submit', async () => {
  const f = hostFixture(); f.step(0);
  const renders = f.pipelines[0].renders, abort = new AbortController();
  const pending = f.compileRider({ group: f.group }, { signal: abort.signal });
  for (const [i, quality] of ['low', 'high', 'medium'].entries()) { f.change(quality); f.step(10 + i); }
  abort.abort(); f.step(20);
  assert.equal(f.pipelines.length, 1); assert.equal(f.pipelines[0].renders, renders);
  assert.deepEqual(f.ssrSizes, []); assert.equal(f.sizes.length, 1);
  assert.equal(f.control.dataset.quality, 'high'); assert.equal(f.control.attrs.get('aria-busy'), 'true');
  assert.equal(f.group.mesh.frustumCulled, false); assert.ok(!f.calls.includes('detach'));
  f.native.resolve(); await pending;
  assert.equal(f.group.mesh.frustumCulled, true); assert.equal(f.target, 'original-target'); assert.equal(f.mrt, 'original-mrt');
  f.step(21);
  assert.equal(f.graphics.value, 'medium'); assert.equal(f.pipelines.length, 2, 'intermediate Low was never allocated');
  assert.equal(f.pipelines[1].renders, 1, 'dirty quality submits even before the next 30 FPS slot');
  assert.equal(f.control.dataset.quality, 'medium'); assert.equal(f.control.attrs.has('aria-busy'), false);
  assert.deepEqual(f.failures, []);
  f.graphics.dispose();
});

test('hidden/page-away and input-changed owners defer quality until a visible submitted frame', () => {
  const f = hostFixture(); f.step(0);
  const renders = f.pipelines[0].renders;
  f.env.document.hidden = true; f.change('low'); f.step(5);
  f.env.document.hidden = false; f.setPageAway(true); f.change('medium'); f.step(10);
  f.setPageAway(false);
  f.env.gamepadControls.update = () => { f.env.document.hidden = true; };
  f.step(15);
  assert.equal(f.pipelines.length, 1); assert.equal(f.pipelines[0].renders, renders);
  assert.equal(f.control.dataset.quality, 'high'); assert.equal(f.control.attrs.get('aria-busy'), 'true');
  f.env.document.hidden = false; f.env.gamepadControls.update = noop; f.step(20);
  assert.equal(f.graphics.value, 'medium'); assert.equal(f.pipelines.length, 2);
  assert.equal(f.pipelines[1].renders, 1); assert.deepEqual(f.failures, []);
  f.graphics.dispose();
});

test('FPS-skipped frames retain effects while dirty menu/map frames apply quality without advancing riding', () => {
  const f = hostFixture(); f.step(0); f.step(10);
  assert.equal(f.pipelines[0].renders, 1); assert.equal(f.sizes.length, 1);
  const ridingSteps = f.calls.filter(call => call === 'simulation').length;
  f.env.gameMenu.isOpen = true; f.change('low'); f.step(15);
  assert.equal(f.graphics.value, 'low'); assert.equal(f.pipelines[1].renders, 1);
  f.env.gameMenu.isOpen = false; f.env.mapSystem.isFullMapOpen = true; f.change('high'); f.step(20);
  assert.equal(f.graphics.value, 'high'); assert.equal(f.pipelines[0].renders, 2);
  f.step(25); assert.equal(f.pipelines[0].renders, 2, 'unchanged frozen map draws no extra frame');
  assert.equal(f.calls.filter(call => call === 'simulation').length, ridingSteps);
  assert.deepEqual(f.failures, []); f.graphics.dispose();
});

test('booking owns quality submissions and suspends its clock when focus is lost', () => {
  const f = hostFixture(); f.step(0);
  const ridingSteps = f.calls.filter(call => call === 'simulation').length;
  assert.equal(f.env.booking.start('Rider', 3), true);
  f.change('low'); f.step(20);
  assert.equal(f.graphics.value, 'low'); assert.equal(f.pipelines[1].renders, 1);
  const age = f.env.booking.state.age;
  f.env.document.hasFocus = () => false;
  f.change('high'); f.step(40);
  assert.equal(f.env.booking.state.age, age);
  assert.deepEqual(f.calls.filter(call => Array.isArray(call)).at(-1), ['suspended', true]);
  assert.equal(f.graphics.value, 'high');
  f.env.document.hasFocus = () => true; f.step(60);
  assert.ok(f.env.booking.state.age > age);
  assert.deepEqual(f.calls.filter(call => Array.isArray(call)).at(-1), ['suspended', false]);
  assert.equal(f.calls.filter(call => call === 'simulation').length, ridingSteps);
  assert.deepEqual(f.failures, []); f.graphics.dispose();
});

test('host factory failure enters graphics recovery before rendering or acknowledging a partial quality change', () => {
  const f = hostFixture(); f.step(0);
  const error = Error('quality factory rejected'); f.failure.next = error;
  f.change('medium'); f.step(10);
  assert.deepEqual(f.failures, [error]); assert.equal(f.env.startup.failed, true);
  assert.equal(f.graphics.value, 'high'); assert.equal(f.pipelines.length, 1); assert.equal(f.pipelines[0].renders, 1);
  assert.equal(f.sizes.length, 1); assert.deepEqual(f.ssrSizes, []);
  assert.equal(f.control.dataset.quality, 'high'); assert.equal(f.control.attrs.get('aria-busy'), 'true');
  f.change('low'); f.step(20); assert.equal(f.pipelines.length, 1, 'graphics owner cannot restart rendering');
  f.graphics.dispose(); assert.equal(f.pipelines[0].disposed, 1);
});

test('terminal host cleanup drains native compilation before releasing tier, shared-pass and renderer ownership', async () => {
  const f = hostFixture();
  f.graphics.apply('medium'); f.graphics.apply('low');
  const pending = f.compileRider({ group: f.group }, { signal: new AbortController().signal });
  const stopping = f.cleanup();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.pipelines.every(p => p.disposed === 0)); assert.ok(f.blooms.every(b => b.disposed === 0));
  assert.equal(f.env.scenePass.disposed, 0); assert.equal(f.env.ssrPass.disposed, 0);
  assert.ok(!f.order.includes('renderer-dispose'));
  f.native.resolve(); await pending; await stopping;
  assert.ok(f.pipelines.every(p => p.disposed === 1)); assert.ok(f.blooms.every(b => b.disposed === 1));
  assert.deepEqual(f.order.slice(-3), ['ssr-dispose', 'scene-dispose', 'renderer-dispose']);
  assert.equal(f.graphics.current, null); assert.equal(f.graphics.apply('high'), false);
});
