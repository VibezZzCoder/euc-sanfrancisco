// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// UI-only adaptation of NYC main.js @9c4cfc9: active-device hints and native select focus.
// No input polling, preparation, persistence or lifecycle ownership; main supplies its owned listener registry.
const CONTROL_HINTS = {
  keyboard: [[['W', 'S'], 'Lean forward / back'], [['A', 'D'], 'Carve'], [['Space'], 'Hop'], [['Shift'], 'Crouch'],
    [['R'], 'Get up'], [['C'], 'Change rider'], [['P'], 'Menu'], [['M'], 'Map'], [['Drag'], 'Orbit']],
  gamepad: [[['RT', 'LT'], 'Lean forward / back'], [['LS'], 'Ride / steer'], [['A'], 'Hop'], [['X'], 'Crouch'],
    [['B'], 'Get up'], [['LB', 'RB'], 'Change rider'], [['View'], 'Menu'], [['Start'], 'Map'], [['RS'], 'Orbit'], [['Y'], 'Camera']],
  touch: []
};

/** Called only on startup / active-device changes, never per-frame. */
export function renderHudControls(doc, device) {
  if (!Object.hasOwn(CONTROL_HINTS, device)) return;
  const pad = device === 'gamepad', touch = device === 'touch';
  for (const key of doc.querySelectorAll('kbd[data-keyboard][data-gamepad]')) {
    const text = pad ? key.dataset.gamepad : key.dataset.keyboard;
    key.textContent = text;
    key.hidden = touch || !text;
    if (pad) key.dataset.pad = text; else delete key.dataset.pad;
  }
  for (const [id, title] of Object.entries({
    'btn-open-map': `Full San Francisco street map${touch ? '' : ` [${pad ? 'Start' : 'M'}]`}`,
    'minimap-card': `Open the full San Francisco street map${touch ? '' : ` [${pad ? 'Start' : 'M'}]`}`,
    'btn-rider': `Change rider${touch ? '' : ` [${pad ? 'LB / RB' : 'C'}]`}`,
    'btn-game-menu': `Pause / menu${touch ? '' : ` [${pad ? 'View' : 'P / Escape'}]`}`,
    'cam-menu-btn': `Camera${touch ? '' : ` [${pad ? 'Y' : 'V'} to cycle]`}`,
    'cam-next': `Next camera${touch ? '' : ` [${pad ? 'Y' : 'V'}]`}`,
    'cam-prev': !pad && !touch ? 'Previous camera [Shift+V]' : 'Previous camera',
    'close-fullmap-btn': `Close map${touch ? '' : ` [${pad ? 'B / Start' : 'M / Esc'}]`}`,
    'map-zoom-in': pad ? 'Zoom in [RT]' : 'Zoom in',
    'map-zoom-out': pad ? 'Zoom out [LT]' : 'Zoom out',
    'map-center-player': pad ? 'Center on player [X]' : 'Street view around you',
    'map-view-all': pad ? 'All of San Francisco [Y]' : 'All of San Francisco'
  })) {
    const button = doc.getElementById(id);
    if (button) button.title = title;
  }
  const guide = doc.getElementById('hud-controls-hint');
  if (!guide) return;
  guide.replaceChildren(...CONTROL_HINTS[device].map(([keys, action]) => {
    const item = doc.createElement('span');
    item.className = 'hint';
    for (const key of keys) {
      const cap = doc.createElement('kbd');
      cap.textContent = key;
      if (pad) cap.dataset.pad = key;
      item.appendChild(cap);
    }
    const label = doc.createElement('span');
    label.className = 'hint-label'; label.textContent = action;
    item.appendChild(label);
    return item;
  }));
}

/** Preserve native selects: release riding holds on focus, return pointer choices to riding,
 * but retain keyboard focus. `listen` is main's disposal-owned addEventListener wrapper. */
export function bindHudSelectFocus(control, resetInput, listen) {
  let pointerSelection = false;
  listen(control, 'focus', resetInput);
  listen(control, 'pointerdown', () => { pointerSelection = true; });
  listen(control, 'keydown', () => { pointerSelection = false; });
  listen(control, 'blur', () => { pointerSelection = false; });
  listen(control, 'change', () => {
    if (pointerSelection) control.blur();
    pointerSelection = false;
  });
}
