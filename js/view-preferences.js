// Only explicit camera/time choices are preferences; temporary title and teleport views are not.
export const VIEW_STATE_KEY = 'euc-sanfrancisco-view-state';
export const SF_TIME_IDS = Object.freeze(['golden', 'midday', 'twilight', 'midnight']);

function readSaved(storage) {
  try {
    const saved = JSON.parse(storage.getItem(VIEW_STATE_KEY));
    if (saved?.version === 1) return saved;
  } catch { /* Private mode, disabled storage or an invalid save. */ }
  return null;
}

export function createViewPreferences({ cameraIds, timeIds = SF_TIME_IDS, getStorage = () => globalThis.localStorage }) {
  const cameras = new Set(cameraIds), times = new Set(timeIds.filter(id => SF_TIME_IDS.includes(id)));
  let camera = 'chase', time = 'golden';
  let cameraPending = false, timePending = false;
  try {
    const saved = readSaved(getStorage());
    if (cameras.has(saved?.camera)) camera = saved.camera;
    if (times.has(saved?.time)) time = saved.time;
  } catch { /* Use the defaults when the storage accessor is unavailable. */ }

  const save = (selected) => {
    try {
      const storage = getStorage(), latest = readSaved(storage);
      // Another tab may have changed the other field. Unsaved local choices take precedence
      // until a successful write, so a quota failure cannot roll them back to stale storage.
      if (selected === 'camera' && !timePending && times.has(latest?.time)) time = latest.time;
      if (selected === 'time' && !cameraPending && cameras.has(latest?.camera)) camera = latest.camera;
      storage.setItem(VIEW_STATE_KEY, JSON.stringify({ version: 1, camera, time }));
      cameraPending = timePending = false;
    }
    catch { /* Preferences remain usable in memory when storage is unavailable. */ }
  };
  return {
    get camera() { return camera; },
    get time() { return time; },
    setCamera(id) {
      if (!cameras.has(id)) return;
      camera = id;
      cameraPending = true;
      save('camera');
    },
    setTime(id) {
      if (!times.has(id)) return;
      time = id;
      timePending = true;
      save('time');
    }
  };
}
