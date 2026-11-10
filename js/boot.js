// Independent of the game module graph: even a failed import can show a useful error.
(() => {
  const overlay = document.getElementById('loading-overlay');
  const status = document.getElementById('loading-status');
  const panel = document.getElementById('startup-error');
  const retry = document.getElementById('startup-retry');
  let phase = 'download';
  let failed = false;
  let ready = false;
  let stop = null; // Legacy onFailure slot: a new registration replaces the previous one.
  const stops = []; // onStop registrations are independent and additive.

  const runStop = (callback) => {
    try {
      Promise.resolve(callback()).catch((error) => console.error('[startup:cleanup]', error));
    } catch (error) {
      console.error('[startup:cleanup]', error);
    }
  };

  // A browser can interrupt/reload a tab without delivering a script error. sessionStorage may survive that
  // interruption; the last recorded stage/state is diagnostic evidence, not proof of a memory kill or its cause.
  // Clear on an error panel or clean page exit; retain the actual session state after loading.
  const CRUMB_KEY = 'euc-sanfrancisco-boot-crumb';
  const bootStarted = performance.now();
  let previousCrumb = null, attempt = 1;
  let sessionState = 'title', heartbeat = null, pageActive = true;
  const sessionDescriptions = { title: 'at the title screen', riding: 'while riding',
    'map open': 'with the map open', booking: 'during booking', paused: 'while paused' };
  const readCrumb = () => { try { return JSON.parse(sessionStorage.getItem(CRUMB_KEY) || 'null'); } catch { return null; } };
  const writeCrumb = (stage) => {
    if (failed || !pageActive) return;
    try {
      sessionStorage.setItem(CRUMB_KEY, JSON.stringify({ stage: String(stage).slice(0, 160), attempt,
        t: Math.round(performance.now() - bootStarted), backend: document.body.dataset.backend || '',
        build: document.querySelector('meta[name="euc-build"]')?.content || '',
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined }));
    } catch { /* Private mode or full storage: the breadcrumb is diagnostic only. */ }
  };
  const clearCrumb = () => { try { sessionStorage.removeItem(CRUMB_KEY); } catch { /* Diagnostic only. */ } };
  previousCrumb = readCrumb();
  if (previousCrumb && typeof previousCrumb.stage === 'string') {
    attempt = (Number(previousCrumb.attempt) || 1) + 1;
    const seconds = Math.max(0, Math.round((Number(previousCrumb.t) || 0) / 1000));
    const backend = previousCrumb.backend === 'webgl2' ? ', WebGL2' : previousCrumb.backend === 'webgpu' ? ', WebGPU' : '';
    const where = Object.hasOwn(sessionDescriptions, previousCrumb.stage)
      ? `${sessionDescriptions[previousCrumb.stage]} (${seconds} s after start${backend})`
      : `at: ${previousCrumb.stage.replace(/…$/, '')} (${seconds} s in${backend})`;
    const build = typeof previousCrumb.build === 'string' && previousCrumb.build ? ` · build ${previousCrumb.build.slice(0, 40)}` : '';
    const note = document.getElementById('loading-crumb');
    if (note) { note.textContent = `Last attempt stopped ${where}${build}`; note.hidden = false; }
    console.warn('[startup] previous attempt stopped without an error', previousCrumb);
  }
  writeCrumb(status.textContent);
  new MutationObserver(() => { if (!failed && !ready) writeCrumb(status.textContent); })
    .observe(status, { childList: true, characterData: true, subtree: true });
  addEventListener('pagehide', () => { pageActive = false; clearCrumb(); });
  addEventListener('pageshow', () => { pageActive = true; writeCrumb(ready ? sessionState : status.textContent); });

  const removeListeners = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
  // A previously hidden overlay is still visibility:hidden while its 0.6 s fade starts, so an
  // immediate focus() is silently refused. Retry each frame (bounded) until Retry actually holds
  // focus, without stealing focus the player has already moved elsewhere.
  const focusRetry = (frame, from = null) => {
    const active = document.activeElement;
    if (active === retry || (frame > 0 && active !== from && active && active !== document.body)) return;
    retry.focus({ preventScroll: true });
    if (document.activeElement !== retry && frame < 120) {
      requestAnimationFrame(() => focusRetry(frame + 1, frame ? from : active));
    }
  };
  const fail = (error) => {
    if (failed) return false;
    failed = true;
    clearInterval(heartbeat);
    clearCrumb(); // a visible error panel is not a crash
    removeListeners();
    // Drain once, including if cleanup reenters fail or registers another stop callback.
    const callbacks = stop ? [stop, ...stops] : [...stops];
    stop = null;
    stops.length = 0;
    callbacks.forEach(runStop);
    console.error(`[startup:${phase}]`, error);
    overlay.classList.remove('hidden');
    overlay.classList.add('has-error');
    overlay.setAttribute('role', 'alert');
    status.textContent = ready ? 'The graphics session stopped'
      : phase === 'graphics' ? 'Graphics could not start' : 'The city could not start';
    document.getElementById('startup-help').textContent = ready
      ? 'Graphics were interrupted. Retry to restart the city. If it keeps happening, update your browser or check that hardware acceleration is enabled.'
      : phase === 'graphics'
      ? 'This browser could not start WebGPU or its WebGL2 fallback. Try an up-to-date browser with hardware acceleration enabled. On a phone, try opening the link directly in Safari or Chrome.'
      : 'A required game file or graphics setup failed. Check your connection and try again. If it keeps happening, update your browser or try another browser.';
    let detail = 'Unknown startup error';
    try { detail = String(error?.message || error || detail); } catch { /* Error values may be unprintable. */ }
    document.getElementById('startup-detail').textContent = detail;
    panel.hidden = false;
    focusRetry(0);
    return true;
  };
  // Automatic error capture is startup-only. Main may explicitly call startup.fail after
  // complete for a lost graphics session; Retry reloads rather than trying to rebuild in place.
  const failStartup = (error) => ready ? false : fail(error);
  function onError(event) { failStartup(event.error || event.message); }
  function onRejection(event) { failStartup(event.reason); }
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  retry.addEventListener('click', () => window.location.reload());

  const startup = {
    get failed() { return failed; },
    phase(value) { phase = value; },
    onFailure(callback) {
      if (failed) runStop(callback);
      else stop = callback;
    },
    // Synchronous invocation on failure (also for late registrations); returned promises are
    // observed but not awaited. Legacy cleanup runs first, then onStop callbacks in FIFO order.
    onStop(callback) {
      if (failed) runStop(callback);
      else stops.push(callback);
    },
    fail,
    sessionState(value) {
      const next = value === 'map' ? 'map open' : value === 'menu' || value === 'hidden' ? 'paused' : value;
      if (!Object.hasOwn(sessionDescriptions, next) || next === sessionState) return;
      sessionState = next;
      if (ready) writeCrumb(sessionState);
    },
    complete() {
      if (failed) return false;
      if (ready) return true;
      ready = true;
      writeCrumb(sessionState);
      heartbeat = setInterval(() => { if (!document.hidden) writeCrumb(sessionState); }, 10000);
      removeListeners();
      return true;
    }
  };
  // The static failure shell is live before Three or any city code is evaluated.
  import('./sf-bootstrap.js').then(async ({ initializeCity }) => {
    await initializeCity(startup);
    if (failed) return;
    const { initApp } = await import('./main.js');
    if (!failed) return initApp(startup);
  }).catch(failStartup);
})();
