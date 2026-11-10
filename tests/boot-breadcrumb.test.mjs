import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/boot.js', import.meta.url), 'utf8');
const key = 'euc-sanfrancisco-boot-crumb';
function boot(previous = null, denied = false) {
  const data = new Map(previous ? [[key, JSON.stringify(previous)]] : []), listeners = new Map(), timers = new Map();
  let now = 0, mutation, writes = 0;
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: id === 'loading-status' ? 'Loading files…' : '', hidden: true,
      classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, focus() { document.activeElement = this; } });
    return nodes.get(id);
  };
  const document = { body: { dataset: { backend: 'webgl2' } }, hidden: false, activeElement: null,
    getElementById: node, querySelector: () => ({ content: 'test-build' }) };
  const context = { document, performance: { now: () => now }, console: { error() {}, warn() {} },
    sessionStorage: { getItem: k => { if (denied) throw Error('denied'); return data.get(k); },
      setItem: (k,v) => { if (denied) throw Error('denied'); writes++; data.set(k,v); }, removeItem: k => data.delete(k) },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
    addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) || []), callback]); },
    removeEventListener() {}, setInterval(callback, ms) { assert.equal(ms,10000); timers.set(1,callback); return 1; },
    clearInterval(id) { timers.delete(id); }, requestAnimationFrame() {} };
  context.window = context;
  // Replace only the async module entry; execute the real independent boot shell and its lifecycle methods.
  vm.runInNewContext(source.slice(0, source.indexOf('  // The static failure shell')) + 'globalThis.api = startup; })();', context);
  return { api: context.api, document, data, node, timers, get writes() { return writes; },
    crumb: () => JSON.parse(data.get(key) || 'null'),
    event: type => { for (const callback of listeners.get(type) || []) callback({ persisted: true }); },
    tick: () => { now += 10000; for (const callback of timers.values()) callback(); },
    stage: text => { node('loading-status').textContent = text; mutation(); } };
}

test('loading stages remain authoritative until ready; actual states write immediately and refresh every ten seconds', () => {
  const b = boot();
  b.api.sessionState('menu'); b.stage('Preparing shadows…');
  assert.equal(b.crumb().stage,'Preparing shadows…');
  b.api.sessionState('title'); b.api.complete(); b.api.complete();
  assert.equal(b.timers.size,1); assert.equal(b.crumb().stage,'title');
  for (const [owner, stage] of [['riding','riding'],['map','map open'],['menu','paused'],['booking','booking'],['hidden','paused'],['title','title']]) {
    b.api.sessionState(owner); assert.equal(b.crumb().stage,stage); assert.equal(b.crumb().backend,'webgl2');
    const writes = b.writes, t = b.crumb().t;
    b.api.sessionState(owner); assert.equal(b.writes,writes);
    b.tick(); assert.equal(b.crumb().stage,stage); assert.equal(b.crumb().t,t+10000);
  }
  b.api.sessionState('bogus'); assert.equal(b.crumb().stage,'title');
});

test('all session notes include the actual backend; old riding crumbs and unknown backend remain readable', () => {
  for (const backend of ['webgpu','webgl2','']) for (const stage of ['title','riding','map open','booking','paused','Preparing shadows…']) {
    const b = boot({stage,backend,t:34000,build:'older'}), note = b.node('loading-crumb');
    assert.equal(note.hidden,false); assert.match(note.textContent,/34 s/); assert.match(note.textContent,/build older/);
    if (backend) assert.ok(note.textContent.includes(backend==='webgpu'?'WebGPU':'WebGL2'));
    else assert.doesNotMatch(note.textContent,/WebGPU|WebGL2/);
  }
});

test('pagehide stays clear through state changes/timer; BFCache restore resumes the recorded state', () => {
  const b = boot(); b.api.complete(); b.api.sessionState('map'); b.event('pagehide');
  b.api.sessionState('hidden'); b.tick(); assert.equal(b.crumb(),null);
  b.event('pageshow'); b.api.sessionState('map'); assert.equal(b.crumb().stage,'map open');
  b.document.hidden = true; const writes = b.writes; b.tick(); assert.equal(b.writes,writes);
});

test('fatal error stops heartbeat permanently; denied sessionStorage never blocks boot', () => {
  const b = boot(); b.api.complete(); b.api.fail(new Error('lost graphics'));
  b.api.sessionState('riding'); b.tick(); b.event('pageshow');
  assert.equal(b.timers.size,0); assert.equal(b.crumb(),null); assert.equal(b.api.complete(),false);
  const privateBoot = boot(null,true); assert.equal(privateBoot.api.complete(),true);
  privateBoot.api.sessionState('riding'); privateBoot.tick(); assert.equal(privateBoot.crumb(),null);
});
