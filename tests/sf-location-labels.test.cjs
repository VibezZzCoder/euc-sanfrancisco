const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function fixture() {
  const context = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  context.window = { NYC: {} };
  const load = name => vm.runInContext(readFileSync(join(__dirname, '../js', name + '.js'), 'utf8'), context);
  for (const name of ['sf-geodata', 'sf-places', 'city-config']) load(name);
  const N = context.window.NYC;
  const original = N.NYC_LANDMARKS;
  // Capture production output before the overlay, including road suffixes and overlap priority.
  const samples = original.flatMap(pin => [[pin.x, pin.z], [pin.x + 40, pin.z], [pin.x, pin.z - 40]])
    .map(([x, z]) => ({ x, z, label: N.getLocationLabel(x, z) }));
  const bay = N.getLocationLabel(100000, 100000);
  load('sf-destinations');
  return { N, original, samples, bay };
}

test('actual SF overlay publishes UN/Zion and modeled-site labels with the existing road suffix', () => {
  const { N, original } = fixture();
  assert.notEqual(N.NYC_LANDMARKS, original, 'exercise the real overlay replacement');
  for (const [id, name] of [['un-plaza', 'UN Skate Plaza'], ['zion', 'Zion / Waller Street'],
    ['palace-of-fine-arts', 'Palace of Fine Arts'], ['alcatraz-island', 'Alcatraz Island']]) {
    assert.ok(!original.some(p => p.id === id), id + ' is added by the overlay');
    const pin = N.NYC_LANDMARKS.find(p => p.id === id);
    assert.ok(pin, id);
    const roads = N.nearestRoads(pin.x, pin.z, 120);
    const suffix = roads.length > 1 && roads[1].dist < 40 ? roads[0].road.name + ' & ' + roads[1].road.name
      : roads.length ? roads[0].road.name : '';
    assert.equal(N.getLocationLabel(pin.x, pin.z), name + (suffix ? ' · ' + suffix : ''), id);
  }
});

test('overlay preserves every original nearby label, first-match priority and bay fallback', () => {
  const { N, original, samples, bay } = fixture();
  assert.deepEqual(Array.from(N.NYC_LANDMARKS.slice(0, original.length), p => p.id), Array.from(original, p => p.id));
  for (const p of samples) assert.equal(N.getLocationLabel(p.x, p.z), p.label, `${p.x},${p.z}`);
  assert.equal(bay, 'San Francisco Bay');
  assert.equal(N.getLocationLabel(100000, 100000), bay);
  // These two real, overlapping modeled-site pins deliberately retain source order, not nearest-pin order.
  const first = N.NYC_LANDMARKS.find(p => p.id === 'old-mission-dolores');
  const later = N.NYC_LANDMARKS.find(p => p.id === 'mission-dolores-basilica');
  assert.ok(Math.hypot(first.x - later.x, first.z - later.z) < 80);
  assert.ok(N.getLocationLabel(later.x, later.z).startsWith(first.name), 'earlier Mission pin wins at later pin');
});

test('location lookup reads the shared published pins directly rather than keeping an overlay snapshot', () => {
  const { N } = fixture();
  const pins = N.NYC_LANDMARKS;
  const pin = pins.find(p => p.id === 'un-plaza');
  const before = N.getLocationLabel(pin.x, pin.z);
  pin.name = 'Updated UN label';
  assert.equal(N.getLocationLabel(pin.x, pin.z), before.replace('UN Skate Plaza', pin.name));
  assert.equal(N.NYC_LANDMARKS, pins, 'lookup does not replace or copy the authoritative list');
});
