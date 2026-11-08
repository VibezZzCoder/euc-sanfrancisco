// Opt-in owner diagnostics — MIT, © 2026 VibezZzCoder. No renderer/loop/timer ownership.
const CAPACITY = 600, WINDOW_MS = 5000, UPDATE_MS = 500;
const counter = value => Number.isFinite(value) && value >= 0 ? value : null;
const countText = value => value === null ? 'n/a' : String(value);

export function createRenderStats({ enabled = false, renderer, document: suppliedDocument } = {}) {
  if (enabled !== true) return null; // No DOM, buffers, clocks or renderer reads in ordinary play.
  const doc = suppliedDocument ?? globalThis.document;
  const panel = doc.createElement('aside'), text = doc.createElement('pre');
  panel.className = 'render-stats';
  panel.setAttribute('aria-label', 'Rendering diagnostics');
  panel.setAttribute('aria-live', 'off');
  panel.hidden = true;
  panel.append(text); doc.body.append(panel);
  const toolbar = doc.getElementById('hud-toolbar');
  const controls = doc.querySelectorAll('.hud, .touch-stick, .touch-btn, .touch-look-hint, .getup-prompt, .popover, .chase-banner');
  let bounds = new Float64Array(controls.length * 4);
  let intervals = new Float64Array(CAPACITY), ends = new Float64Array(CAPACITY), sorted = new Float64Array(CAPACITY);
  let active = false, disposed = false, start = 0, size = 0, last = NaN, nextUpdate = -Infinity;
  let drawCalls = null, triangles = null;
  const backend = renderer.backend?.isWebGPUBackend === true ? 'WebGPU'
    : renderer.backend?.isWebGLBackend === true ? 'WebGL2' : 'Unknown backend';

  // At most twice a second, place below the toolbar and any intersecting HUD/touch controls.
  // In a saturated compact layout hide this read-only overlay instead of obscuring riding controls.
  function place() {
    panel.hidden = false;
    const box = panel.getBoundingClientRect(), height = doc.documentElement.clientHeight;
    let top = Math.max(12, (toolbar?.getBoundingClientRect().bottom ?? 0) + 8), count = 0;
    for (const control of controls) {
      const style = doc.defaultView.getComputedStyle(control);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const r = control.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const at = count++ * 4;
      bounds[at] = r.left; bounds[at + 1] = r.right; bounds[at + 2] = r.top; bounds[at + 3] = r.bottom;
    }
    for (let pass = 0; pass <= count; pass++) {
      let next = top;
      for (let i = 0; i < count * 4; i += 4) {
        if (box.left < bounds[i + 1] + 8 && box.right > bounds[i] - 8
          && top < bounds[i + 3] + 8 && top + box.height > bounds[i + 2] - 8) next = Math.max(next, bounds[i + 3] + 8);
      }
      if (next === top) break;
      top = next;
    }
    panel.style.top = `${Math.ceil(top)}px`;
    panel.hidden = top + box.height > height - 12;
  }
  function reset() {
    active = false; start = size = 0; last = NaN; nextUpdate = -Infinity;
    drawCalls = triangles = null;
    if (!panel.hidden) panel.hidden = true;
    if (text.textContent) text.textContent = '';
  }
  function setActive(value) {
    if (disposed) return;
    const next = value === true && !doc.hidden;
    if (active === next) return;
    reset(); active = next;
  }
  function submitted(now, riding) {
    if (disposed) return;
    if (!riding || doc.hidden || !Number.isFinite(now)) { reset(); return; }
    if (!active) return;
    if (now <= last) { reset(); active = true; } // Restart on a duplicate/backwards clock, never record invalid intervals.
    // Copy whole-frame scalars NOW: pinned Three resets info at the start of the next native RAF,
    // including FPS-skipped callbacks. render.calls is cumulative and is deliberately not a fallback.
    const render = renderer.info?.render;
    drawCalls = counter(render?.drawCalls); triangles = counter(render?.triangles);
    while (size && ends[start] <= now - WINDOW_MS) { start = (start + 1) % CAPACITY; size--; }
    if (Number.isFinite(last)) {
      if (size === CAPACITY) { start = (start + 1) % CAPACITY; size--; }
      const at = (start + size++) % CAPACITY;
      intervals[at] = now - last; ends[at] = now;
    }
    last = now;
    if (now < nextUpdate) return;
    nextUpdate = now + UPDATE_MS;
    let sum = 0, slow = 0;
    sorted.fill(Infinity);
    for (let i = 0; i < size; i++) {
      const value = intervals[(start + i) % CAPACITY];
      sorted[i] = value; sum += value; if (value > 50) slow++;
    }
    sorted.sort(); // One fixed typed workspace; never sort or build arrays per submitted frame.
    const mean = size ? (sum / size).toFixed(1) : '—';
    const p95 = size ? sorted[Math.ceil(size * .95) - 1].toFixed(1) : '—';
    const message = `${backend} · whole submitted frame\nDraw calls: ${countText(drawCalls)} · Triangles: ${countText(triangles)}\nInterval ms mean/p95: ${mean} / ${p95}\n>50 ms: ${slow} / ${size} · last 5s, max 600 intervals`;
    if (text.textContent !== message) text.textContent = message;
    place();
  }
  function dispose() {
    if (disposed) return;
    reset(); disposed = true; bounds = intervals = ends = sorted = null;
    panel.remove();
  }
  return { setActive, submitted, reset, dispose };
}
