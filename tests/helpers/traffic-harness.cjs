// Runs js/traffic.js headless in vm on the San Francisco slice (traffic-sim and pedestrian tests): the real road
// network, terrain and traffic logic, with THREE and the model builders replaced by a permissive stub (anything goes,
// properties set are kept, numbers read from it are 0) since nothing is drawn.
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '../..');
const { BOX } = require('./geo-box.cjs');
const terrainFile = join(root, `data/terrain-${BOX}.bin`);

function stub() {
  const store = new Map();
  const target = function () {};
  return new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined; // not a promise
      if (!store.has(key)) store.set(key, stub());
      return store.get(key);
    },
    set(_, key, value) {
      store.set(key, value);
      return true;
    },
    apply: () => stub(),
    construct: () => stub()
  });
}

function loadTraffic({ seed, actors, trafficSource, dynamicSource, headless = true } = {}) {
  const randomMath = Object.create(Math);
  if (seed !== undefined) randomMath.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const NYC = {};
  const window = { NYC };
  const context = vm.createContext({ window, document: stub(), console: { info() {}, log: console.log, warn() {} }, Math: randomMath, performance: { now: () => 0 } });
  for (const f of ['js/sf-geodata.js', 'js/city-config.js', 'js/terrain.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), context);
  const buf = readFileSync(terrainFile);
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + n).toString('utf8'));
  NYC.Terrain.load(header, new Uint16Array(buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length), 0, header.w * header.h));
  NYC.DEBUG_ROADS = false;
  vm.runInContext(readFileSync(join(root, 'js/road-network.js'), 'utf8'), context);
  // everything traffic.js takes from the renderer's side
  const names = ['THREE', 'cityUniforms', 'createContactShadowMaterial', 'createCarFlareMaterial', 'HEADLIGHTS', 'createVehicleHeadlight',
    'placeVehicleHeadlight', 'CAR_PARTS', 'BODY_SPECS', 'BUS_SPEC', 'buildCarGeometry', 'buildCarProxyGeometry', 'buildSteerableWheelGeo',
    'createLoftedCarMaterial', 'buildLightbarGeometry', 'createLightbarMaterial', 'buildLoftedBusBodyGeometry', 'buildBusSignGeometry',
    'buildBusWheelGeo', 'createBusWheelMaterial', 'createCarWheelMaterial', 'createLoftedBusMaterial', 'PersonCrowd', 'PersonRig', 'Addons'];
  for (const k of names) NYC[k] = stub();
  vm.runInContext(dynamicSource || readFileSync(join(root, 'js/sf-dynamic-bodies.js'), 'utf8'), context);
  if (actors) {
    // Focused body tests use actual local geometry, without a renderer or GPU. Ordinary long-running traffic tests
    // retain the cheap rendering stub; their assertions concern lanes/signals, not collision dimensions.
    NYC.THREE = actors.THREE; NYC.Addons = actors.Addons; NYC.TSL = stub();
    vm.runInContext(readFileSync(join(root, 'js/actor-models.js'), 'utf8'), context);
    for (const key of ['createContactShadowMaterial', 'createCarFlareMaterial', 'createLoftedCarMaterial',
      'createLightbarMaterial', 'createBusWheelMaterial', 'createLoftedBusMaterial']) NYC[key] = () => new actors.THREE.MeshBasicMaterial();
    NYC.createVehicleHeadlight = () => new actors.THREE.SpotLight();
    NYC.PersonCrowd = class { meshes = [new actors.THREE.Group()]; begin() {} end() {} add() {} };
    NYC.PersonRig = class { reset() {} update() {} };
  } else {
    NYC.sfVehicleShape = () => [{ z: 0, halfWidthMetres: 1.3, halfLengthMetres: 6, minY: 0, maxY: 3 }];
  }
  vm.runInContext(trafficSource || readFileSync(join(root, 'js/traffic.js'), 'utf8'), context);
  const sidewalks = NYC.BLOCKS.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, block: b }));
  const system = NYC.createTrafficSystem(actors ? new actors.THREE.Scene() : stub(), sidewalks, [], { headless });
  return { NYC, system, context };
}

module.exports = { loadTraffic, available: existsSync(terrainFile) };
