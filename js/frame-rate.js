// Render admission only: simulation/input keep their own animation-callback clock.
export const FRAME_RATE_KEY = 'euc-sanfrancisco-frame-rate';
const choices = new Set(['auto', '120', '60', '30']);

export function frameRateHealth(fps, choice) {
  // A 250 ms sample at the 30 cap naturally reads 28–32. Higher caps are upper bounds,
  // not display guarantees: keep the established 50/30 health baseline for Auto, 60 and 120.
  const healthy = choice === '30' ? 27 : 50;
  const warning = choice === '30' ? 20 : 30;
  return fps >= healthy ? 'fps-ok' : fps >= warning ? 'fps-warn' : 'fps-bad';
}

export function createFrameRatePreference(getStorage = () => globalThis.localStorage) {
  let value = 'auto';
  try {
    const saved = getStorage().getItem(FRAME_RATE_KEY);
    if (choices.has(saved)) value = saved;
  } catch { /* Disabled/private storage: keep the default in memory. */ }
  return {
    get value() { return value; },
    set(next) {
      if (!choices.has(next) || next === value) return false;
      value = next;
      try { getStorage().setItem(FRAME_RATE_KEY, value); }
      catch { /* The current visit still uses the selected limit. */ }
      return true;
    }
  };
}

export function createFramePacer(choice = 'auto') {
  let interval = 0, nextFrame = null, lastFrame = null;
  // rAF timestamps are quantized/jittered. Without this small allowance, a 16.6 ms callback can miss a
  // 16.667 ms deadline and turn a requested 60 FPS into 30. Keep phase, rather than scheduling from now.
  const tolerance = 0.5; // milliseconds, not a whole refresh interval
  const reset = () => { nextFrame = lastFrame = null; };
  const set = (value) => {
    interval = choices.has(value) && value !== 'auto' ? 1000 / Number(value) : 0;
    reset();
  };
  set(choice);
  return {
    reset,
    set,
    shouldRender(now) {
      if (!Number.isFinite(now)) return false;
      if (!interval) return true;
      // A stall discards missed slots: never queue catch-up renders or inherit an old deadline on resume.
      if (lastFrame === null || now < lastFrame || now - lastFrame > Math.max(250, interval * 4)) {
        nextFrame = now + interval;
        lastFrame = now;
        return true;
      }
      if (now + tolerance < nextFrame) return false;
      // The allowance admits an early frame, but must not discard a future slot: adding it here too
      // loses frames on jittered 59.94 Hz displays when an overdue deadline is nearly a full period old.
      nextFrame += Math.max(1, Math.floor((now - nextFrame) / interval) + 1) * interval;
      lastFrame = now;
      return true;
    }
  };
}
