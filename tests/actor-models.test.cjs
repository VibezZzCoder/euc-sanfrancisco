// CPU-only actor cleanup regression: use the reviewed local Three pin, never construct a renderer.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const root = join(__dirname, '..');
const donorFile = join(root, '../slop-sanfrancisco/js/actor-models.js');
const donorOptions = { skip: !existsSync(donorFile) && 'optional SF donor actor-models.js is unavailable' };
let current, donor;

test.before(async () => {
  const threeURL = pathToFileURL(join(root, 'vendor/three/build/three.webgpu.js')).href;
  const THREE = await import(threeURL);
  const TSL = await import(pathToFileURL(join(root, 'vendor/three/build/three.tsl.js')).href);
  const utils = readFileSync(join(root, 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js'), 'utf8')
    .replace("from 'three'", `from '${threeURL}'`);
  const Addons = await import(`data:text/javascript;base64,${Buffer.from(utils).toString('base64')}`);
  const load = file => {
    const NYC = { THREE, TSL, Addons, cityUniforms: { uInteriorGlow: TSL.uniform(0.8) }, retainedCitySystem: {} };
    vm.runInNewContext(readFileSync(file, 'utf8'), { window: { NYC } });
    return NYC;
  };
  current = load(join(root, 'js/actor-models.js'));
  if (!donorOptions.skip) donor = load(donorFile);
});

function equalGeometry(label, build) {
  const a = build(current), b = build(donor);
  const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  try {
    assert.deepEqual(Object.keys(a.attributes).sort(), Object.keys(b.attributes).sort(), `${label}: attributes`);
    for (const key of Object.keys(a.attributes)) {
      const aa = a.attributes[key], bb = b.attributes[key];
      assert.equal(aa.itemSize, bb.itemSize, `${label}/${key}: item size`);
      assert.equal(aa.normalized, bb.normalized, `${label}/${key}: normalization`);
      assert.ok(bytes(aa.array).equals(bytes(bb.array)), `${label}/${key}: exact bytes`);
    }
    if (a.index) assert.ok(b.index && bytes(a.index.array).equals(bytes(b.index.array)), `${label}: topology`);
    else assert.equal(b.index, null, `${label}: non-indexed topology`);
    assert.deepEqual(a.groups, b.groups, `${label}: draw groups`);
  } finally { a.dispose(); b.dispose(); }
}

test('all 25 retained fleet geometry variants match the pinned SF donor exactly', donorOptions, () => {
  for (const kind of ['taxi', 'sedan', 'suv', 'van']) {
    for (const wheels of [true, false]) equalGeometry(`${kind}/body/${wheels}`, n => n.buildCarGeometry(n.BODY_SPECS[kind], wheels));
    equalGeometry(`${kind}/proxy`, n => n.buildCarProxyGeometry(n.BODY_SPECS[kind]));
    for (const side of [-1, 1]) equalGeometry(`${kind}/wheel/${side}`, n => n.buildSteerableWheelGeo(n.BODY_SPECS[kind], side));
  }
  equalGeometry('patrol/lightbar', n => n.buildLightbarGeometry(n.BODY_SPECS.sedan));
  equalGeometry('bus/body', n => n.buildLoftedBusBodyGeometry());
  equalGeometry('bus/signs', n => n.buildBusSignGeometry());
  for (const side of [-1, 1]) equalGeometry(`bus/wheel/${side}`, n => n.buildBusWheelGeo(side));
});

test('shared actor exports survive the exclusive player-model removal', donorOptions, () => {
  const removed = ['buildCarSidePatch', 'buildHelicopterBodyGeometry', 'buildHelicopterMainRotorGeometry',
    'buildHelicopterTailRotorGeometry', 'createLoftedHelicopterMaterial'];
  assert.deepEqual(Object.keys(current).sort(), [...Object.keys(donor).filter(key => !removed.includes(key)), 'createCarWheelMaterial'].sort());
  for (const key of removed) assert.equal(current[key], undefined, key);
  assert.equal(current.BODY_SPECS.taxi, current.BODY_SPECS.robotaxi, 'active generic sensor fleet alias');
});

test('retained NPC body, fixed-wheel, lightbar and bus material graphs still construct and cache', () => {
  const materials = new Set();
  for (const kind of ['taxi', 'sedan', 'suv', 'van']) {
    const material = current.createLoftedCarMaterial(current.BODY_SPECS[kind]);
    assert.ok(material.isMeshStandardNodeMaterial && material.colorNode.isNode && material.emissiveNode.isNode);
    assert.equal(current.createLoftedCarMaterial(current.BODY_SPECS[kind]), material);
    materials.add(material);
  }
  const wheel = current.createLoftedCarMaterial(current.BODY_SPECS.sedan, 0xffbe14);
  assert.ok(wheel.userData.carState.isNode, 'fixed-state traffic wheel material is still required');
  materials.add(wheel);
  for (const name of ['createLightbarMaterial', 'createBusWheelMaterial', 'createLoftedBusMaterial']) {
    const material = current[name]();
    assert.ok(material.isMaterial && material.colorNode.isNode, name);
    assert.equal(current[name](), material, `${name}: cache`);
    materials.add(material);
  }
  for (const material of materials) material.dispose();
});
