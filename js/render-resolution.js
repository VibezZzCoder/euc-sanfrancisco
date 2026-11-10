// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Scale only the 3D drawing buffer; CSS layout, maps and simulation use their own sizes/clocks.
export const RENDER_RESOLUTION_KEY = 'euc-sanfrancisco-render-resolution';
const scales = new Map([['100', 1], ['75', 0.75], ['50', 0.5]]);
const desktopDefaults = Object.freeze({ quality: 'high', resolution: '100' });
const phoneDefaults = Object.freeze({ quality: 'medium', resolution: '75' });

// Initial defaults only, not an adaptive quality controller. Mobile identity covers landscape/foldable inner screens;
// the small touch-screen fallback covers reduced/desktop-style mobile UAs without treating a narrow desktop tab as a phone.
// Stored explicit choices always win. Rotation and connecting a controller never re-apply these defaults.
export function initialRenderPreferences(environment = globalThis) {
  try {
    const n = environment.navigator;
    const phone = n?.userAgentData?.mobile === true || /iPhone|iPod|Android.*Mobile/i.test(n?.userAgent || '');
    const shortEdge = Math.min(environment.screen?.width ?? Infinity, environment.screen?.height ?? Infinity);
    const smallTouch = n?.maxTouchPoints > 0 && shortEdge > 0 && shortEdge <= 600
      && environment.matchMedia?.('(pointer: coarse)').matches === true;
    return phone || smallTouch ? phoneDefaults : desktopDefaults;
  } catch { return desktopDefaults; }
}

export function drawingBufferRatio(width, height, scale) {
  // Positive logical host sizes only. The pinned half-resolution SSR blur has five fixed mip
  // levels: retain a 32px longest scene edge, plus one pixel per axis, even in a transient tiny host.
  return Math.max(scale, 1 / width, 1 / height, 32 / Math.max(width, height));
}

export function createRenderResolutionPreference(getStorage = () => globalThis.localStorage, initial = '100') {
  let value = scales.has(initial) ? initial : '100';
  try {
    const saved = getStorage().getItem(RENDER_RESOLUTION_KEY);
    if (scales.has(saved)) value = saved;
  } catch { /* Disabled/private storage: keep this device's initial default. */ }
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
