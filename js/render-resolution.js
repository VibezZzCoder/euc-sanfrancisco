// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Scale only the 3D drawing buffer; CSS layout, maps and simulation use their own sizes/clocks.
export const RENDER_RESOLUTION_KEY = 'euc-sanfrancisco-render-resolution';
const scales = new Map([['100', 1], ['75', 0.75], ['50', 0.5]]);

export function drawingBufferRatio(width, height, scale) {
  // Positive logical host sizes only. The pinned half-resolution SSR blur has five fixed mip
  // levels: retain a 32px longest scene edge, plus one pixel per axis, even in a transient tiny host.
  return Math.max(scale, 1 / width, 1 / height, 32 / Math.max(width, height));
}

export function createRenderResolutionPreference(getStorage = () => globalThis.localStorage) {
  let value = '100';
  try {
    const saved = getStorage().getItem(RENDER_RESOLUTION_KEY);
    if (scales.has(saved)) value = saved;
  } catch { /* Disabled/private storage: keep the current-quality default. */ }
  return {
    get value() { return value; },
    get scale() { return scales.get(value); },
    set(next) {
      if (!scales.has(next) || next === value) return false;
      value = next;
      try { getStorage().setItem(RENDER_RESOLUTION_KEY, value); }
      catch { /* The choice still applies for this visit. */ }
      return true;
    }
  };
}
