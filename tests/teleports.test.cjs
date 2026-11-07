const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const context = vm.createContext({ window: { NYC: {} } });
for (const path of ['js/sf-geodata.js', 'js/sf-places.js', 'js/city-config.js']) vm.runInContext(read(path), context);
const { TELEPORT_LOCATIONS, LANDMARK_SITES, blockAt, nearestRoads, getIslandBoundsAtZ } = context.window.NYC;

// Geographic seed provenance only. Checked EUC placement/route acceptance is covered separately.
test('every teleport button has a measured roadway seed or an explicit authored park arrival', () => {
  const buttons = [...read('index.html').matchAll(/data-teleport="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...Object.keys(TELEPORT_LOCATIONS), 'un-plaza', 'zion'].sort(), buttons.sort());
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    assert.ok(Number.isFinite(point.heading), `${name} has a heading`);
    if (point.a && point.b) {
      const [ax,az]=point.a,[bx,bz]=point.b;
      assert.ok(Math.abs((point.x-ax)*(bz-az)-(point.z-az)*(bx-ax)) / Math.max(1,Math.hypot(bx-ax,bz-az)) < 0.001, `${name} is above a measured roadway`);
      assert.ok(point.x>=Math.min(ax,bx)-.01&&point.x<=Math.max(ax,bx)+.01&&point.z>=Math.min(az,bz)-.01&&point.z<=Math.max(az,bz)+.01);
      continue;
    }
    assert.equal(blockAt(point.x, point.z), null, `${name} lands outside building blocks`);
    const shore = getIslandBoundsAtZ(point.z);
    assert.ok(point.x > shore.westX + 8 && point.x < shore.eastX - 8, `${name} stays on the land`);
    const nearby = nearestRoads(point.x, point.z, 20);
    assert.ok(nearby.some(({ road, dist }) => dist < road.w / 2), `${name} lands within a street's width`);
  }
});

test('UN/Zion buttons lazily resolve actual checked authored metadata, never geographic pins as floors', async t => {
  const { pathToFileURL } = require('node:url');
  const url = path => pathToFileURL(join(__dirname, '..', path)).href;
  const moduleURL = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const THREE = await import(url('vendor/three/build/three.webgpu.js'));
  const { createSkateparksWorld } = await import('./helpers/sf-skateparks-world.mjs');
  const geometryURL = moduleURL(read('js/sf-skatepark-geometry.js')
    .replace("from 'three/webgpu'", `from '${url('vendor/three/build/three.webgpu.js')}'`)
    .replace("from 'three/tsl'", `from '${url('vendor/three/build/three.tsl.js')}'`));
  const { buildSFSkateparks } = await import(moduleURL(read('js/sf-skateparks.js')
    .replace("from 'three/webgpu'", `from '${url('vendor/three/build/three.webgpu.js')}'`)
    .replace("from './sf-skatepark-geometry.js'", `from '${geometryURL}'`)
    .replace("from './sf-terrain-sampler.js'", `from '${url('js/sf-terrain-sampler.js')}'`)
    .replace("from './euc-recovery.js'", `from '${url('js/euc-recovery.js')}'`)));
  const { N } = await createSkateparksWorld({ buildNetwork: false });
  const overlay = vm.createContext({ window: { NYC: N } });
  vm.runInContext(read('js/sf-destinations.js'), overlay);
  for (const id of ['un-plaza', 'zion']) {
    assert.equal(N.TELEPORT_LOCATIONS[id].y, undefined, 'no guessed floor before construction');
    assert.equal(N.NYC_LANDMARKS.find(p => p.id === id).arrival, undefined);
  }
  const scene = new THREE.Scene();
  t.after(() => {
    const resources = new Set();
    scene.traverse(o => { if (o.geometry) resources.add(o.geometry); for (const m of [].concat(o.material || [])) resources.add(m); });
    for (const r of resources) r.dispose();
    scene.clear();
  });
  buildSFSkateparks(scene, N);
  for (const id of ['un-plaza', 'zion']) {
    const actual = N.SF_SKATEPARKS.find(p => p.id === id).arrival;
    const toolbar = N.TELEPORT_LOCATIONS[id], map = N.NYC_LANDMARKS.find(p => p.id === id).arrival;
    for (const key of ['x', 'y', 'z', 'heading', 'departure', 'exact']) assert.equal(toolbar[key], actual[key], `${id} toolbar ${key}`);
    for (const key of ['x', 'y', 'z', 'heading', 'referenceY']) {
      assert.ok(Number.isFinite(actual[key]), `${id} finite ${key}`);
      assert.equal(map[key], actual[key], `${id} map ${key}`);
    }
    assert.equal(actual.exact, true);
    assert.equal(actual.registeredSurfaceOnly, true);
    assert.equal(actual.departure, 1.2);
    assert.equal(map.requireClear, true);
    assert.equal(map.requiresValidation, true, 'metadata remains a proposal, not native route acceptance');
  }
});

test('the core\'s landmark arrivals: a street junction near each OSM landmark, facing it; Lombard\'s at its top', () => {
  const names = {
    ferry: 'San Francisco Ferry Building', transamerica: 'Transamerica Pyramid', coit: 'Coit Tower', lombard: 'Lombard Street',
    wharf: "Fisherman's Wharf", unionsquare: 'Union Square', chinatown: 'Dragon Gate', civiccenter: 'San Francisco City Hall',
    oraclepark: 'Oracle Park', nobhill: 'Grace Cathedral'
  };
  for (const [key, name] of Object.entries(names)) {
    const point = TELEPORT_LOCATIONS[key];
    const lm = LANDMARK_SITES[name];
    assert.ok(point && lm, `${key}: ${name}`);
    assert.equal(point.landmark, name);
    const d = Math.hypot(lm.x - point.x, lm.z - point.z);
    assert.ok(d < 160, `${key}: ${d.toFixed(0)} m from ${name}`);
    assert.ok(Math.abs(Math.atan2(lm.x - point.x, lm.z - point.z) - point.heading) < 1e-9, `${key} faces ${name}`);
  }
  const top = nearestRoads(TELEPORT_LOCATIONS.lombard.x, TELEPORT_LOCATIONS.lombard.z, 5).map(({ road }) => road.name);
  assert.ok(top.includes('Hyde St') && top.includes('Lombard St'), top.join(', '));
});

test('the Transamerica arrival is on Montgomery St, near the pyramid', () => {
  const point = TELEPORT_LOCATIONS.transamerica;
  const tower = LANDMARK_SITES['Transamerica Pyramid'];
  assert.ok(nearestRoads(point.x, point.z, 20).some(({ road, dist }) => road.name === 'Montgomery St' && dist < 1));
  assert.ok(Math.hypot(tower.x - point.x, tower.z - point.z) < 150, 'within sight of the pyramid');
});

test('the Ferry Building arrival is on the roadway of The Embarcadero', () => {
  const point = TELEPORT_LOCATIONS.ferry;
  assert.ok(nearestRoads(point.x, point.z, 20).some(({ road, dist }) => road.name === 'The Embarcadero' && dist < road.w / 2 + 6));
  assert.equal(blockAt(point.x, point.z), null);
});
