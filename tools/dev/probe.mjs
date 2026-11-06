// tools/dev/probe.mjs — headless Chrome (real WebGPU on macOS/Metal) probe for the app, over the DevTools protocol.
// No dependencies (Node's global fetch & WebSocket). Exits non-zero when the page logs console errors or never gets ready.
//
//   node tools/dev/probe.mjs <url> <out.png> [waitSeconds]           one page: backend, readiness, fps, heap, errors, screenshot
//   node tools/dev/probe.mjs <url> <out.png> [waitSeconds] --eval '<js expression>'
//                                                                    also prints the expression's value once ready
// Retained shared city inspection only. Removed old-mode benchmark/shot runners: their URL hooks no longer exist.
// Historical camera/source shot definitions are in provenance/landmarks/upstream-shots.json.
// This inherited macOS helper is not the project's browser-QA acceptance harness. Do not use personal profiles.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const WAIT_S = Number(opt('wait', 150));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(opt('port', 9333));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu', '--enable-gpu', `--use-angle=${opt('angle', 'metal')}`, '--ignore-gpu-blocklist',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--window-size=1280,720',
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });
const quit = (code) => { try { chrome.kill(); } catch {} process.exit(code); };

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('chrome did not start'); quit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
let errors = [];
let logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled') {
    const text = d.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (d.params.type === 'error') errors.push(text.slice(0, 300));
    else if (/^\[(init|bench|details|buildings|paint)\]/.test(text)) logs.push(text);
  }
  if (d.method === 'Runtime.exceptionThrown') errors.push(`exception: ${(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 300)}`);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  const timer = setTimeout(() => { pending.delete(i); reject(new Error(`DevTools timeout: ${method}`)); }, 30000);
  pending.set(i, result => { clearTimeout(timer); resolve(result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
process.on('uncaughtException', error => { console.error(error.message); quit(2); });
process.on('unhandledRejection', error => { console.error(error.message); quit(2); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

// Loads a page and waits for __NYC_APP.ready; returns timing and health
async function load(url) {
  errors = [];
  logs = [];
  await send('Page.navigate', { url });
  await send('Page.bringToFront');
  const t0 = Date.now();
  let ready = false;
  while (!ready && Date.now() - t0 < WAIT_S * 1000) {
    await sleep(500);
    ready = !!(await evalJs('!!(window.__NYC_APP && window.__NYC_APP.ready)'));
    if (errors.some((e) => e.startsWith('exception'))) break;
  }
  return { ready, readyS: +((Date.now() - t0) / 1000).toFixed(1) };
}
async function sample() {
  const fps = [];
  for (let i = 0; i < 5; i++) { await sleep(1000); fps.push(Number(await evalJs(`document.getElementById('hud-fps')?.textContent`))); }
  const heapMB = await evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : null');
  const stats = await evalJs('window.__NYC_APP?.debug?.stats?.()');
  const backend = await evalJs('window.__NYC_APP?.renderer?.backend?.isWebGPUBackend ? "webgpu" : "other"');
  return { fps, heapMB, stats, backend };
}
async function screenshot(out) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
}
let failed = false;
{
  const [url, out] = argv;
  const r = await load(url);
  const s = await sample();
  if (out && out !== '-') await screenshot(out);
  const evaluated = opt('eval') ? await evalJs(opt('eval')) : undefined;
  console.log(JSON.stringify({ ...r, ...s, consoleErrors: errors.length, firstErrors: errors.slice(0, 3), init: logs, evaluated }, null, 1));
  if (!r.ready || errors.length) failed = true;
}
ws.close();
quit(failed ? 1 : 0);
