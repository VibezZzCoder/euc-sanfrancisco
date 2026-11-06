// CPU/DOM-contract regressions only: these do not establish rendered layout or native browser focus behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EucHud, formatSpeed } from '../js/euc-hud.js';
import { frameRateHealth } from '../js/frame-rate.js';
import { renderHudControls, bindHudSelectFocus } from '../js/hud-controls.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const declarations = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `CSS selector exists: ${selector}`);
  return match[1];
};

function element() {
  return { dataset: {}, children: [], textContent: '', hidden: false,
    style: { setProperty(key, value) { this[key] = value; } },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; } };
}
function documentFixture() {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, element()]));
  const keys = [...html.matchAll(/<kbd[^>]*data-keyboard="([^"]*)"[^>]*data-gamepad="([^"]*)"[^>]*>/g)]
    .map(([, keyboard, gamepad]) => ({ ...element(), dataset: { keyboard, gamepad } }));
  return { nodes, keys, getElementById: id => nodes.get(id), querySelectorAll: () => keys,
    createElement: element, body: { classList: { toggle() {} } } };
}

test('both speed conversions and measured FPS health retain native telemetry semantics', () => {
  for (const speed of [10, -10]) {
    assert.equal(formatSpeed(speed, 'mph'), '22');
    assert.equal(formatSpeed(speed, 'kmh'), '36');
  }
  for (const speed of [-0, -0.1, NaN, Infinity]) {
    assert.equal(formatSpeed(speed, 'mph'), '0');
    assert.equal(formatSpeed(speed, 'kmh'), '0');
  }
  assert.equal(frameRateHealth(28, '30'), 'fps-ok');
  assert.equal(frameRateHealth(28, '60'), 'fps-bad');
  assert.equal(frameRateHealth(42, '120'), 'fps-warn');
});

test('real HUD model levels reach matching warning styles; crash clears tricks and names each get-up input', () => {
  const doc = documentFixture(), hud = new EucHud(doc);
  const node = id => doc.getElementById(`hud-${id}`);
  for (const [powerWarning, factor, level] of [['notice', .1, 'notice'], ['warn', .5, 'warn'], ['tiltBack', .9, 'critical']]) {
    hud.update({ powerWarning, overspeed: factor }, 1, 'keyboard', '180 → Fakie');
    assert.equal(node('warning').dataset.level, powerWarning);
    assert.equal(node('warning').hidden, false);
    assert.equal(node('overspeed').dataset.level, level);
    assert.match(declarations(`.overspeed-cue[data-level='${level}']`), /color:/);
    assert.match(css, new RegExp(`\\.power-cue\\[data-level='${powerWarning}'\\]`));
    assert.ok(parseFloat(node('overspeed').style['--beep-period']) > 0);
  }
  assert.equal(node('trick').textContent, 'Landed · 180 → Fakie');
  hud.update({ crashed: true, crashTime: .79 }, 2, 'keyboard');
  assert.equal(node('getup').hidden, true);
  for (const [device, key] of [['keyboard', 'R'], ['gamepad', 'B'], ['touch', 'GET UP']]) {
    hud.update({ crashed: true, crashTime: .8 }, 2, device);
    assert.equal(node('warning').hidden, true);
    assert.equal(node('overspeed').hidden, true);
    assert.equal(node('trick').hidden, true);
    assert.equal(node('getup').hidden, false);
    assert.equal(node('getup-key').textContent, key);
  }
  assert.equal(node('getup-key').dataset.pad, undefined, 'touch does not retain pad decoration');
  hud.update({}, 3, 'touch');
  assert.equal(node('getup').hidden, true);
});

test('HUD markup exposes one measured reading outside hidden branding and both speed units without flight-only CSS', () => {
  assert.equal([...html.matchAll(/id="hud-fps"/g)].length, 1);
  const fpsPanel = html.match(/<label class="panel fps-control"[\s\S]*?<\/label>/)[0];
  assert.match(fpsPanel, /Measured frame rate:[\s\S]*id="hud-fps"/);
  assert.match(fpsPanel, /aria-label="Frame rate"/);
  assert.doesNotMatch(html.match(/<div class="brand-subtitle">[^\n]+/)[0], /hud-fps/);
  assert.match(html, /id="hud-speed">0<\/span>[\s\S]*?mph[\s\S]*?id="hud-speed-kmh">0<\/span> km\/h/);
  assert.doesNotMatch(declarations('.gauge-alt'), /opacity:\s*0|display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(css, /body\[data-mode='helicopter'\] \.gauge-alt/);
  assert.match(declarations('.gauge-alt'), /white-space:\s*nowrap/);
  assert.match(declarations('.fps-reading'), /line-height:\s*14px/);
  assert.match(declarations('body.hud-minimized .hud:not(.hud-top-right)'), /visibility:\s*hidden/);
  assert.match(declarations("body[data-input='touch'] .getup-prompt kbd"), /display:\s*inline-flex/);
  assert.match(declarations('.overspeed-cue'), /var\(--beep-period, 1s\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('active-device hints round-trip through SF map, camera, menu and radar bindings', () => {
  const doc = documentFixture();
  const guideText = () => doc.nodes.get('hud-controls-hint').children
    .map(item => item.children.map(child => child.textContent).join(' ')).join(' | ');
  renderHudControls(doc, 'gamepad');
  assert.match(doc.nodes.get('btn-open-map').title, /San Francisco.*Start/);
  assert.match(doc.nodes.get('cam-next').title, /Y/);
  assert.match(doc.nodes.get('btn-game-menu').title, /View/);
  assert.match(guideText(), /LB RB Change rider.*View Menu.*Start Map.*RS Orbit/);
  assert.ok(doc.keys.some(key => key.textContent === 'B / Start'));
  assert.ok(doc.keys.filter(key => key.dataset.keyboard === 'M').every(key => key.textContent === 'Start'));
  assert.ok(doc.keys.every(key => key.dataset.pad && !key.hidden));
  renderHudControls(doc, 'keyboard');
  assert.match(doc.nodes.get('cam-prev').title, /Shift\+V/);
  assert.match(guideText(), /C Change rider.*P Menu.*M Map.*Drag Orbit/);
  assert.ok(doc.keys.every(key => key.textContent === key.dataset.keyboard && !key.dataset.pad));
  renderHudControls(doc, 'touch');
  assert.equal(guideText(), '');
  assert.ok(doc.keys.every(key => key.hidden));
  assert.equal(doc.nodes.get('cam-next').title, 'Next camera');
  assert.equal(doc.nodes.get('btn-open-map').title, 'Full San Francisco street map');
});

test('select pointer changes release focus; keyboard changes and cancelled pointer sessions retain it', () => {
  const callbacks = new Map(); let resets = 0, blurs = 0;
  const dispatch = name => callbacks.get(name)?.();
  const control = { blur() { blurs++; dispatch('blur'); } };
  const listen = (target, name, callback) => { assert.equal(target, control); callbacks.set(name, callback); };
  bindHudSelectFocus(control, () => resets++, listen);
  dispatch('focus'); assert.equal(resets, 1);
  dispatch('pointerdown'); dispatch('change'); assert.equal(blurs, 1);
  dispatch('focus'); dispatch('keydown'); dispatch('change'); assert.equal(blurs, 1);
  dispatch('pointerdown'); dispatch('keydown'); dispatch('change'); assert.equal(blurs, 1);
  dispatch('pointerdown'); dispatch('blur'); dispatch('focus'); dispatch('change'); assert.equal(blurs, 1);
  // All registrations are owned by the host: removing them leaves no global/per-frame work behind.
  callbacks.clear(); dispatch('focus'); dispatch('change'); assert.equal(resets, 3);
});
