// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Adapted from euc-newyork@4a88f172d4c1725d52e64ae4442d76a1ca6eede9.
// Three fixed, lazily prepared effect graphs. Never rebuild the renderer, city or rider on a change.
export const GRAPHICS_QUALITY_KEY = 'euc-sanfrancisco-graphics-quality';
const choices = new Set(['high', 'medium', 'low']);

export function createGraphicsQualityPreference(getStorage = () => globalThis.localStorage, initial = 'high') {
  let value = choices.has(initial) ? initial : 'high';
  try {
    const saved = getStorage().getItem(GRAPHICS_QUALITY_KEY);
    if (choices.has(saved)) value = saved;
  } catch { /* Keep this device's initial default when storage is unavailable. */ }
  return {
    get value() { return value; },
    set(next) {
      if (!choices.has(next) || next === value) return false;
      value = next;
      try { getStorage().setItem(GRAPHICS_QUALITY_KEY, value); }
      catch { /* Still usable for this visit. */ }
      return true;
    }
  };
}

// apply() belongs at a submitted-frame boundary, outside any renderer compilation owner.
// The factory owns only post effects; the scene pass, materials and shadow node remain shared.
export function createGraphicsQuality({ shadow, createPipeline }) {
  const highSize = [shadow.mapSize.x, shadow.mapSize.y];
  const highIntensity = shadow.intensity;
  const pipelines = new Map();
  let value = null, current = null, disposed = false, time = 'golden';
  return {
    get value() { return value; },
    get current() { return current; },
    apply(next) {
      if (disposed || !choices.has(next) || next === value) return false;
      let candidate = pipelines.get(next);
      if (!candidate) {
        candidate = createPipeline(next);
        pipelines.set(next, candidate);
        candidate.applyTime(time);
      }
      // Keep node/material identities and a bounded shader cache. setSize releases old GPU
      // attachments; the next real render restores dimensions from the current drawing buffer.
      current?.park();
      const enabled = next !== 'low';
      const size = next === 'high' ? highSize : next === 'medium' ? [1024, 1024] : [16, 16];
      shadow.mapSize.set(...size);
      const extents = shadow.getFrameExtents();
      shadow.map?.setSize(size[0] * extents.x, size[1] * extents.y);
      // Disabling castShadow would dispose/recreate Three's shared shadow node. Instead skip
      // BOTH cascade renders and neutralize the retained shadow sampling on Low.
      shadow.autoUpdate = enabled;
      shadow.needsUpdate = enabled;
      shadow.intensity = enabled ? highIntensity : 0;
      current = candidate;
      value = next;
      return true;
    },
    applyTime(id) {
      if (disposed) return;
      time = id;
      for (const pipeline of pipelines.values()) pipeline.applyTime(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const pipeline of pipelines.values()) pipeline.dispose();
      pipelines.clear();
      current = null;
    }
  };
}
