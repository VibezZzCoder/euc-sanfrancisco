// CPU-only bitmap/lifetime regressions. Pixel failures report one byte, never a city-sized assertion diff.
// Frozen private b802a51 is optional only in curated exports without private history.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { gunzipSync } = require('node:zlib');
const test = require('node:test');
const vm = require('node:vm');
const root = join(__dirname, '..');
const source = readFileSync(join(root, 'js/sf-map.js'), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let frozen;
try { frozen = execFileSync('git', ['show', 'b802a51:js/sf-map.js'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
catch { /* Public curated ancestry intentionally omits private checkpoints. */ }
if (frozen) assert.equal(digest(frozen), '9c60ce93e06f29a18665de61f09be977df97307f4f7631809f55c344ad65673d');
const baseline = { skip: !frozen && 'private b802a51 baseline unavailable' };

function run(code, env) {
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  Object.assign(context, env);
  return vm.runInContext(code, context, { timeout: 30000 });
}

function relief(code, grid, water = 0) {
  const start = code.indexOf('let RELIEF = null;'), end = code.indexOf('let LAYERS = null;', start);
  assert.ok(start > 0 && end > start, 'relief extraction anchors');
  const uploads = [], allocations = [];
  let pixels, canvas;
  const ctx = {
    createImageData(width, height) {
      const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
      allocations.push(image); return image;
    },
    // Canvas putImageData overwrites transparent pixels too; dirty coordinates are SOURCE coordinates.
    putImageData(image, dx, dy, sx = 0, sy = 0, sw = image.width, sh = image.height) {
      pixels ??= new Uint8ClampedArray(canvas.width * canvas.height * 4);
      uploads.push({ image, dx, dy, sx, sy, sw, sh });
      for (let y = Math.max(0, sy); y < Math.min(image.height, sy + sh); y++) {
        if (y + dy < 0 || y + dy >= canvas.height) continue;
        for (let x = Math.max(0, sx); x < Math.min(image.width, sx + sw); x++) {
          if (x + dx < 0 || x + dx >= canvas.width) continue;
          const from = (y * image.width + x) * 4, to = ((y + dy) * canvas.width + x + dx) * 4;
          pixels.set(image.data.subarray(from, from + 4), to);
        }
      }
    }
  };
  const window = { NYC: { DATA: { fullRegion: { city: grid } }, Terrain: { waterLevel: water } } };
  const get = run(code.slice(start, end) + ';mapRelief', {
    window, document: { createElement: () => (canvas = { getContext: () => ctx }) }
  });
  return { get, window, uploads, allocations, get pixels() { return pixels; } };
}

function samePixels(a, b, label) {
  assert.equal(a.length, b.length, `${label}: RGBA length`);
  const mismatch = a.findIndex((v, i) => v !== b[i]);
  assert.equal(mismatch, -1, `${label}: first differing byte ${mismatch}: ${a[mismatch]} vs ${b[mismatch]}`);
}

function compare(grid, water = 0) {
  const old = relief(frozen, grid, water), current = relief(source, grid, water);
  const a = old.get(), b = current.get();
  assert.deepEqual([b.canvas.width, b.canvas.height, b.x, b.z, b.width, b.height],
    [a.canvas.width, a.canvas.height, a.x, a.z, a.width, a.height]);
  samePixels(old.pixels, current.pixels, `${grid.w}x${grid.h}`);
  assert.equal(current.allocations.length, 1, 'one scratch allocation, not one per stripe');
  assert.equal(current.allocations[0].data.byteLength, grid.w * Math.min(grid.h, 32) * 4);
  assert.equal(current.uploads.length, Math.ceil(grid.h / 32));
  assert.ok(current.uploads.every(u => u.image === current.allocations[0]), 'reuse the same ImageData');
  const last = current.uploads.at(-1);
  assert.equal(last.dy + last.sh, grid.h, 'last dirty rectangle ends exactly at the grid bottom');
  const uploads = current.uploads.length;
  assert.equal(current.get(), b); assert.equal(current.uploads.length, uploads, 'cache hit never rerasterizes');
  for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) {
    const k = z * grid.w + x, p = k * 4;
    if (x === 0 || z === 0 || x === grid.w - 1 || z === grid.h - 1 || grid.heights[k] <= water + .05) {
      assert.equal(current.pixels[p] | current.pixels[p + 1] | current.pixels[p + 2] | current.pixels[p + 3], 0,
        `water/border at ${x},${z} must erase all four channels`);
    } else assert.equal(current.pixels[p + 3], 255, `land/NaN centre alpha at ${x},${z}`);
  }
  return current;
}

for (const [w, h] of [[1, 1], [2, 2], [3, 3], [19, 31], [19, 32], [19, 33], [19, 34], [19, 63], [19, 64], [19, 65], [19, 70]]) {
  test(`strip relief exactly matches frozen raster including borders/final stripe ${w}x${h}`, baseline, () => {
    const heights = Float64Array.from({ length: w * h }, (_, k) => {
      const x = k % w, z = Math.floor(k / w);
      // Same scratch positions alternate land/water each strip, exposing stale RGB/alpha after reuse.
      return (Math.floor(z / 32) + x) % 3 ? 14 + x * .3 + Math.sin(z * .4) * 12 : -.125;
    });
    compare({ w, h, step: 8, x0: -128, z0: -256, heights });
  });
}

test('signed zero, sub-water negative terrain, exact threshold, NaN centre/neighbours and infinities match frozen clamping', baseline, () => {
  const w = 15, h = 70, heights = new Float64Array(w * h).fill(20);
  const cases = [-0, 0, -100, -.05, .05, .05 + Number.EPSILON, NaN, Infinity, -Infinity];
  for (const z of [2, 30, 31, 32, 33, 63, 64, 68]) cases.forEach((v, x) => { heights[z * w + x + 2] = v; });
  for (const water of [-.05, -0, 0, 2.25]) compare({ w, h, step: 8, x0: -0, z0: -7, heights }, water);
  assert.ok(Object.is(heights[2 * w + 2], -0), 'fixture preserves signed zero');
});

test('missing data does not poison the lazy relief cache; available data is built once', () => {
  const h = relief(source, null);
  assert.equal(h.get(), null); assert.equal(h.allocations.length, 0);
  h.window.NYC.DATA.fullRegion.city = { w: 3, h: 3, x0: 0, z0: 0, step: 8, heights: new Float32Array(9).fill(8) };
  const result = h.get(); assert.ok(result); assert.equal(h.get(), result);
  assert.equal(h.allocations.length, 1);
});

test('complete committed city heightfield produces identical native 8 m relief bytes', baseline, t => {
  const manifestBytes = readFileSync(join(root, 'data/region/manifest.json'));
  const manifest = JSON.parse(manifestBytes), grid = manifest.city;
  const heights = new Float32Array(grid.w * grid.h).fill(manifest.waterLevel);
  const corpus = createHash('sha256').update(manifestBytes);
  for (const f of grid.files) {
    const compressed = readFileSync(join(root, f.url + '.gz')); corpus.update(f.url).update(compressed);
    const bytes = gunzipSync(compressed);
    assert.equal(bytes.toString('ascii', 0, 4), 'SFB1');
    const n = bytes.readUInt32LE(4), header = JSON.parse(bytes.toString('utf8', 8, 8 + n));
    const ix = Math.round((header.originX - grid.x0) / grid.step), iz = Math.round((header.originZ - grid.z0) / grid.step);
    for (let z = 0; z < header.h; z++) for (let x = 0; x < header.w; x++) {
      heights[(iz + z) * grid.w + ix + x] = header.minH + bytes.readUInt16LE(8 + n + 2 * (z * header.w + x)) * header.scale;
    }
  }
  const result = compare({ ...grid, heights }, manifest.waterLevel);
  t.diagnostic(JSON.stringify({ baseline: 'b802a51', baselineMap: digest(frozen), candidateMap: digest(source),
    city: [grid.w, grid.h], tiles: grid.files.length, corpus: corpus.digest('hex'),
    heights: digest(new Uint8Array(heights.buffer)), rgba: digest(result.pixels), scratchBytes: result.allocations[0].data.byteLength }));
});

// Mock only canvas storage/drawing for lifetime assertions. Production map construction, caching,
// full-map transitions and resize methods run intact. Native compositing/text are checked by browser QA.
function lifetime(code = source, dpr = 2) {
  const canvases = [], events = [];
  let fontReady, draws = 0;
  const classes = { contains: () => false, toggle() {}, remove() {} };
  const makeCanvas = (width = 300, height = 150) => {
    const canvas = { clientWidth: 390, clientHeight: 844, offsetParent: {}, style: {}, addEventListener() {} };
    let w = width, h = height;
    for (const [key, get, set] of [['width', () => w, v => { w = v; }], ['height', () => h, v => { h = v; }]]) {
      Object.defineProperty(canvas, key, { get, set(v) {
        set(v); events.push({ canvas, width: w, height: h, area: w * h,
          total: canvases.reduce((n, c) => n + c.width * c.height, 0) });
      } });
    }
    const ctx = new Proxy({ canvas, measureText: text => ({ width: text.length * 6 }),
      createRadialGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : () => {} });
    canvas.getContext = () => ctx; canvases.push(canvas); return canvas;
  };
  const full = makeCanvas(), mini = makeCanvas(); mini.clientWidth = 240; mini.clientHeight = 160;
  const modal = { classList: classes, style: {}, focus() {}, addEventListener() {}, close() {}, showModal() {} };
  const document = { body: { classList: classes }, activeElement: null,
    fonts: { ready: { then: callback => { fontReady = callback; } } }, addEventListener() {}, querySelectorAll: () => [],
    getElementById: id => ({ 'fullmap-modal': modal, 'fullmap-canvas': full, 'minimap-canvas': mini }[id] || null),
    createElement: () => makeCanvas() };
  const window = { devicePixelRatio: dpr, addEventListener() {}, NYC: { GEO: {}, ROADS: [], BLOCKS: [], NYC_LANDMARKS: [],
    getLocationLabel: () => 'Market', isTypingInField: () => false } };
  run(code, { window, document, performance: { now: () => 675 } });
  const player = { position: { x: 15, z: -20 }, heading: .5 };
  const map = new window.NYC.NYCMapSystem({ controllerManager: { getActiveEntity: () => player },
    cameraSystem: { currentLookAt: { clone: () => ({ sub: () => ({ x: 0, z: 1 }) }) } } });
  map.drawWorld = () => { draws++; };
  return { map, full, mini, canvases, events, document, window, font: () => fontReady(), draws: () => draws };
}

const dims = c => [c.width, c.height];
test('full-map close drops both bitmaps and label bounds; reopening retains view/search and rebuilds once', () => {
  const h = lifetime(), m = h.map;
  m.searchHighlight = 'Market'; m.viewCenterX = -200; m.viewCenterZ = 700; m.viewZoom = .9;
  m.searchPath = {}; const waypoint = m.waypoint;
  m.toggleFullMap(true); const bitmap = m.fullStatic, initial = dims(h.full), draws = h.draws();
  const view = [m.viewCenterX, m.viewCenterZ, m.viewZoom, m.searchHighlight, m.searchPath];
  m.fullStaticPins.push([1, 2, 3, 4]); m.fullStaticPlaced.push([2, 3, 4, 5]);
  m.toggleFullMap(false);
  assert.deepEqual(dims(h.full), [1, 1]); assert.deepEqual(dims(bitmap), [1, 1]);
  assert.equal(m.fullStaticKey, ''); assert.equal(m.fullStaticPins.length + m.fullStaticPlaced.length, 0);
  assert.deepEqual([m.viewCenterX, m.viewCenterZ, m.viewZoom, m.searchHighlight, m.searchPath], view);
  assert.equal(m.waypoint, waypoint);
  const n = h.events.length; m.toggleFullMap(false); assert.equal(h.events.length, n, 'repeat close is inert');
  m.toggleFullMap(true); assert.equal(m.fullStatic, bitmap); assert.deepEqual(dims(h.full), initial);
  assert.deepEqual(dims(bitmap), initial); assert.equal(h.draws(), draws + 1);
  m.renderFullMap(); assert.equal(h.draws(), draws + 1, 'warm redraw retains static layers');
});

for (const reason of ['css-hidden', 'clean-hud', 'resize', 'font', 'radar-size']) test(`radar ${reason} releases obsolete backing before replacement and rebuilds at native DPR`, () => {
  const h = lifetime(), m = h.map; m.renderMinimap();
  const old = m.miniCache.canvas, draws = h.draws();
  if (reason === 'css-hidden') h.mini.offsetParent = null;
  if (reason === 'clean-hud') h.document.body.classList.contains = () => true;
  if (reason === 'resize') m.resize();
  else if (reason === 'font') h.font();
  else { if (reason === 'radar-size') h.mini.clientWidth = 200; m.renderMinimap(); }
  assert.deepEqual(dims(old), [1, 1], 'even externally held old bitmap is explicitly shrunk');
  if (reason !== 'radar-size') assert.equal(m.miniCache, null);
  if (['css-hidden', 'clean-hud'].includes(reason)) {
    assert.deepEqual(dims(h.mini), [1, 1]);
    const writes = h.events.length; m.renderMinimap(); assert.equal(h.events.length, writes);
  }
  h.mini.offsetParent = {}; h.document.body.classList.contains = () => false;
  m.renderMinimap();
  assert.deepEqual(dims(h.mini), [h.mini.clientWidth * 2, h.mini.clientHeight * 2]);
  assert.deepEqual(dims(m.miniCache.canvas), [h.mini.width * 2, h.mini.height * 2]);
  assert.notEqual(m.miniCache.canvas, old); assert.equal(h.draws(), draws + 1);
  const current = m.miniCache; m.renderMinimap(); assert.equal(m.miniCache, current); assert.equal(h.draws(), draws + 1);
});

for (const [w, h, dpr] of [[390, 844, 3], [390, 844, 1.5], [1200, 2400, 2], [2160, 3840, 3]]) {
  test(`rotation intermediate dimensions never exceed either endpoint ${w}x${h} DPR ${dpr}`, baseline, () => {
    const traces = [];
    for (const code of [frozen, source]) {
      const harn = lifetime(code, dpr), { map, full, events } = harn;
      full.clientWidth = w; full.clientHeight = h; map.toggleFullMap(true);
      let violated = false;
      for (const [width, height] of [[h, w], [w, h], [h, w]]) {
        const before = dims(full), startArea = full.width * full.height;
        events.length = 0; full.clientWidth = width; full.clientHeight = height;
        map.resize(); const after = dims(full), endArea = full.width * full.height;
        const bound = Math.max(startArea, endArea);
        const peak = Math.max(...events.map(e => e.area)), total = Math.max(...events.map(e => e.total));
        violated ||= peak > bound;
        if (code === source) {
          assert.ok(peak <= bound, `intermediate ${peak} exceeds endpoint ${bound}`);
          // full + static and the untouched default radar; old static is shed before main bitmap grows.
          assert.ok(total <= 2 * bound + harn.mini.width * harn.mini.height, `combined ${total} exceeds two views`);
          assert.deepEqual(dims(map.fullStatic), after);
          assert.ok(endArea <= 6e6, 'six-megapixel cap retained');
          const writes = events.length; map.resizeFullCanvas(); assert.equal(events.length, writes, 'unchanged size does not reset pixels');
        }
        traces.push({ variant: code === source ? 'current' : 'frozen', before, after, peak });
      }
      if (code === frozen) assert.equal(violated, true, 'negative control must detect the old long-edge square');
    }
    assert.deepEqual(traces.slice(0, 3).map(r => r.after), traces.slice(3).map(r => r.after), 'final native dimensions are unchanged');
  });
}

test('radar aspect changes shrink discarded caches before growing a replacement; frozen control retains old backing', baseline, () => {
  for (const code of [frozen, source]) {
    const h = lifetime(code), { map, mini, events } = h;
    mini.clientWidth = 180; mini.clientHeight = 320; map.renderMinimap();
    for (const [w, height] of [[320, 180], [180, 320]]) {
      const old = map.miniCache.canvas, area = mini.width * mini.height;
      events.length = 0; mini.clientWidth = w; mini.clientHeight = height; map.renderMinimap();
      assert.deepEqual(dims(mini), [w * 2, height * 2]);
      assert.deepEqual(dims(map.miniCache.canvas), [w * 4, height * 4]);
      if (code === source) {
        assert.deepEqual(dims(old), [1, 1]);
        assert.ok(events.filter(e => e.canvas === mini).every(e => e.area <= area), 'no intermediate long-edge square on the radar');
        const releaseIndex = events.findIndex(e => e.canvas === old && e.area === 1);
        const replaceIndex = events.findIndex(e => e.canvas === map.miniCache.canvas);
        assert.ok(releaseIndex >= 0 && releaseIndex < replaceIndex, 'release before replacement allocation');
      } else assert.ok(old.width * old.height > 1, 'frozen discarded cache is still allocated when held');
    }
  }
});
