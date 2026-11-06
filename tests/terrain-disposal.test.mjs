// Lightweight host lifecycle extraction, following graphics-quality.test.mjs. No terrain build or renderer required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
function section(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `production host anchors: ${start} → ${end}`);
  assert.equal(main.indexOf(start, from + start.length), -1, `unique host anchor: ${start}`);
  return main.slice(from, to);
}
const stopSource = section('  startup.onStop(async () => {', '  rendererInit = renderer.init();');
// Includes the production scene disposal registration, ground construction, terrain registration and the next stage.
// Removing/moving terrain registration past this boundary must fail the early-startup-failure case too.
const groundSource = section('  const scene = new THREE.Scene();', '  const region = city.buildSFRegion(scene);');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function hostFixture({ compiling = false, failAfterGround = false } = {}) {
  const events = [], errors = [], startupCompile = deferred(), runtimeCompile = deferred();
  let cleanup;
  const resource = name => ({ dispose: () => events.push(`${name}-dispose`) });
  const texture = { ...resource('texture'), isTexture: true };
  const material = { ...resource('material'), map: texture }, geometry = resource('geometry');
  const terrain = { dispose: () => events.push('terrain-cpu-dispose') };
  class Scene {
    constructor() { this.children = []; this.environment = resource('environment'); }
    traverse(fn) { this.children.forEach(fn); }
    clear() { events.push('scene-clear'); this.children.length = 0; }
  }
  const renderer = {
    setAnimationLoop(value) { assert.equal(value, null); events.push('loop-stop'); },
    compileAsync(kind) {
      events.push(`${kind}-compile-start`);
      return (kind === 'startup' ? startupCompile : runtimeCompile).promise;
    },
    dispose: () => events.push('renderer-dispose')
  };
  const failure = new Error('failure at first stage after ground');
  const env = {
    startup: { failed: false, onStop(fn) { cleanup = fn; } },
    startupPreparation: { abort: () => events.push('abort') },
    setGameUIEnabled(value) { assert.equal(value, false); },
    stopRuntime: async () => { events.push('runtime-stop'); },
    releaseAppearanceCaches: () => events.push('appearance-release'),
    renderer, rendererInit: Promise.resolve(), riderPreparationWork: null, firstFrameWork: null,
    compileWork: compiling ? renderer.compileAsync('startup') : null,
    runtimeCompile: compiling ? renderer.compileAsync('runtime') : null,
    ownedDisposals: [], THREE: { Scene },
    city: {
      LightingSystem: class { dispose() { events.push('lighting-dispose'); } },
      loadCityData: async () => {},
      buildSFGround(scene) {
        events.push('ground-build');
        scene.children.push({ geometry, material }, { geometry, material }); // shared scene resources dispose once
        return { terrain };
      }
    },
    setLoadingProgress() {},
    async stage(message) {
      if (message === 'Building the regional landscape…') {
        events.push('after-ground-stage');
        if (failAfterGround) throw failure;
      }
    },
    console: { error: (...args) => errors.push(args) }
  };
  const start = new Function(...Object.keys(env), `let stopped = false;
    ${stopSource}
    return async () => { ${groundSource} };`)(...Object.values(env));
  return { start, stop: () => cleanup(), startupCompile, runtimeCompile, events, errors, failure };
}

function assertDisposedInOrder(f) {
  assert.deepEqual(f.events.filter(event => event.endsWith('-dispose') || event === 'scene-clear'), [
    'terrain-cpu-dispose', 'geometry-dispose', 'material-dispose', 'texture-dispose',
    'lighting-dispose', 'environment-dispose', 'scene-clear', 'renderer-dispose'
  ], 'actual ground registration runs CPU cleanup before the scene-attached resources and renderer');
  assert.deepEqual(f.errors, []);
}

for (const rejects of [false, true]) {
  test(`terrain host stop drains startup and runtime compilation before disposal (${rejects ? 'rejected' : 'resolved'} compile)`, async () => {
    const f = hostFixture({ compiling: true });
    await f.start();
    const stopping = f.stop();
    await tick();
    assert.ok(f.events.includes('runtime-stop'));
    assert.ok(f.events.includes('loop-stop'));
    assert.ok(!f.events.some(event => event.endsWith('-dispose')), 'nothing disposed with startup compile outstanding');
    f.startupCompile.resolve();
    await tick();
    assert.ok(!f.events.some(event => event.endsWith('-dispose')), 'runtime compile still owns scene resources');
    if (rejects) f.runtimeCompile.reject(new Error('native compilation rejected'));
    else f.runtimeCompile.resolve();
    await stopping;
    assertDisposedInOrder(f);
  });
}

test('terrain registration survives failure immediately after ground before later startup systems exist', async () => {
  const f = hostFixture({ failAfterGround: true });
  await assert.rejects(f.start(), error => error === f.failure);
  assert.ok(f.events.includes('ground-build'));
  assert.ok(f.events.includes('after-ground-stage'));
  assert.ok(!f.events.some(event => event.endsWith('-dispose')));
  await f.stop();
  assertDisposedInOrder(f);
});
