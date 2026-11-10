import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createWorldTierPolicy } from '../js/world-tier.js';
import { loadLightTerrain, lightMaskValue, installLightTerrain } from '../js/sf-light-data.js';
import { createLightBoundaryReturn } from '../js/sf-light-boundary.js';
import { runtimeBinaries } from '../tools/compress-data.mjs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root));
function binary(name) {
  const b = read(name), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), n = b.readUInt32LE(4);
  return { header: JSON.parse(b.toString('utf8', 8, 8 + n)), buf, offset: 8 + n };
}
const light = await loadLightTerrain(async name => binary(name));

test('the tier binary participates in lossless delivery validation, rather than being an orphan gzip', async () => {
  const files = await runtimeBinaries();
  assert.equal(files.filter(name => name === 'data/light-terrain.bin').length, 1);
});

test('light city exposes finite complete bounds for map Fit and coverage, using its authoritative native grid', () => {
  assert(Number.isFinite(light.city.x1) && Number.isFinite(light.city.z1));
  assert.equal(light.city.x1, light.city.x0 + (light.city.w - 1) * light.city.step);
  assert.equal(light.city.z1, light.city.z0 + (light.city.h - 1) * light.city.step);
  const manifest = JSON.parse(read('data/region/manifest.json'));
  for (const key of ['x0', 'z0', 'x1', 'z1', 'step', 'w', 'h']) assert.equal(light.city[key], manifest.city[key]);
});

test('one boot policy covers full/light overrides and retains legacy region opt-in without a second device probe', () => {
  for (const phone of [false, true]) {
    for (const query of ['', 'region=0', 'region=1', 'tier=full', 'tier=light', 'tier=invalid', 'tier=light&region=1', 'tier=full&region=0']) {
      const p = new URLSearchParams(query), policy = createWorldTierPolicy(phone, p);
      const tier = ['full', 'light'].includes(p.get('tier')) ? p.get('tier') : phone && p.get('region') !== '1' ? 'light' : 'full';
      assert.equal(policy.name, tier, `${phone}/${query}`);
      assert.equal(policy.regionEnabled, tier === 'full' && p.get('region') !== '0');
      assert(Object.isFrozen(policy));
    }
  }
});

test('light row runs preserve every regional mask class, including row-spanning source runs', () => {
  const { header: h, buf, offset } = binary('data/region/groundmask.bin');
  const runs = new Uint32Array(buf, offset);
  let index = 0;
  for (const run of runs) {
    const count = run >>> 8, value = run & 255;
    for (let end = index + count; index < end; index++) {
      assert.equal(lightMaskValue(light.mask, index % h.w, Math.floor(index / h.w)), value);
    }
  }
  assert.equal(index, h.w * h.h);
  assert(light.mask.rows.byteLength + light.mask.ends.byteLength + light.mask.values.byteLength < 2000000);
});

test('light city height vertices are byte-identical to every original region tile after original Float32 decoding', () => {
  const manifest = JSON.parse(read('data/region/manifest.json'));
  for (const f of manifest.city.files) {
    const { header: h, buf, offset } = binary(f.url), q = new Uint16Array(buf, offset, h.w * h.h);
    const ix = Math.round((h.originX - light.city.x0) / light.city.step), iz = Math.round((h.originZ - light.city.z0) / light.city.step);
    for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++)
      assert.equal(light.city.heights[(j + iz) * light.city.w + i + ix], Math.fround(h.minH + q[j * h.w + i] * h.scale));
  }
});

test('light installs the original city/collar only; the far horizon cannot become phantom riding ground', () => {
  const context = { window: { NYC: {} } };
  vm.runInNewContext(read('js/terrain.js').toString(), context);
  const T = context.window.NYC.Terrain;
  const calls = [];
  T.installCoreTransition = p => calls.push(p);
  installLightTerrain(context.window.NYC, light);
  assert.equal(calls.length, 1); assert.equal(T.patches.length, 1);
  assert.equal(T.patches[0].h, light.city.heights);
  assert.notEqual(T.patches[0].h, light.horizon.heights);
});

test('light loader refuses unsupported formats and invalid typed-array ownership', async () => {
  const bin = binary('data/light-terrain.bin');
  for (const header of [{ ...bin.header, version: 2 },
    { ...bin.header, layout: { ...bin.header.layout, city: { offset: 1, length: light.city.heights.length } } },
    { ...bin.header, city: { ...bin.header.city, w: 1 } }])
    await assert.rejects(loadLightTerrain(async () => ({ ...bin, header })), /Invalid light/);
});

test('light boundary returns only unsupported outer travel through checked native placement, retaining refusal atomicity', () => {
  const entity = { position: { x: 5, y: 2, z: 5 }, heading: 0 };
  let registered = true, allowed = false, notices = 0, attempts = 0;
  const manager = { getActiveEntity: () => entity,
    eucSampler: { sampleGround(_x, _z, out) { Object.assign(out, { registered, height: 2, water: false, offCourse: !registered }); } },
    findTeleportPosition: (x, z) => ({ x, y: 2, z }),
    teleportActiveTo(x, z, heading, y, policy) {
      attempts++; assert.equal(policy.exact, true); assert.equal(policy.departure, 1.2);
      if (allowed) Object.assign(entity.position, { x, y, z });
      return { succeeded: allowed };
    } };
  const boundary = createLightBoundaryReturn(manager, { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, () => notices++);
  boundary.update(0); entity.position.x = 12;
  assert.equal(boundary.update(.25), false); assert.equal(attempts, 0, 'A registered outside deck remains usable');
  registered = false;
  assert.equal(boundary.update(2), false); assert.equal(entity.position.x, 12); assert.equal(notices, 0);
  assert.equal(boundary.update(2.1), false); assert.equal(attempts, 1, 'Refused checks have a bounded retry rate');
  allowed = true;
  assert.equal(boundary.update(3), true); assert.equal(entity.position.x, 5); assert.equal(notices, 1);
  entity.position.x = 7;
  assert.equal(boundary.update(4), false); assert.equal(attempts, 2, 'Ordinary core crashes/water retain native recovery');
});
