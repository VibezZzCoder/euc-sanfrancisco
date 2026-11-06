// Differential gait regression against the last committed SF runtime. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gitHistory } from './helpers/optional-source.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import * as TSL from '../vendor/three/build/three.tsl.js';

const baseline = process.env.SF_PEDESTRIAN_BASELINE
  ? readFileSync(process.env.SF_PEDESTRIAN_BASELINE, 'utf8')
  : gitHistory(new URL('../', import.meta.url), '8bf8b2f').read('js/pedestrians.js');
const current = readFileSync(new URL('../js/pedestrians.js', import.meta.url), 'utf8');
function load(source) {
  let calls = 0;
  const math = Object.create(Math);
  math.exp = value => { calls++; return Math.exp(value); };
  const city = { THREE, TSL, Addons: {} };
  vm.runInNewContext(source, { window: { NYC: city }, Math: math });
  return { PersonRig: city.PersonRig, calls: () => calls };
}
function state(rig) {
  return JSON.stringify({ x: rig.x, z: rig.z, time: rig.time, vx: rig.vx, vz: rig.vz, speed: rig.speed,
    yaw: rig.yaw, gait: rig.gait, run: rig.run, air: rig.air, phase: rig.phase, sway: rig.sway,
    pelvisY: rig.pelvisY, feet: rig.feet, pose: Array.from(rig.pose) });
}
test('cached easing preserves actual walking, turns, airborne gait, hidden poses and mixed dt', { skip: baseline === null && 'Baseline unavailable; set SF_PEDESTRIAN_BASELINE' }, () => {
  const old = load(baseline), now = load(current);
  const a = [], b = [];
  const ground = (_owner, x, z) => .002 * x + .003 * z + (z > 3 ? .15 : 0);
  for (let i = 0; i < 24; i++) {
    const options = { seed: i / 24, scale: .8 + i / 100, female: i % 2 === 0, stride: .8 + i / 100 };
    a.push(new old.PersonRig(options)); b.push(new now.PersonRig(options));
    a[i].reset(i, 0, 0, ground); b[i].reset(i, 0, 0, ground);
  }
  for (let frame = 0; frame < 180; frame++) {
    const dt = [1 / 60, 1 / 60, 1 / 30, 0, .2][frame % 5];
    for (let i = 0; i < a.length; i++) {
      const x = i + Math.sin(frame / 30) * .2, z = frame * .035 * (1 + i / 30);
      const args = [dt, x, z, Math.sin(frame / 40) * .6, ground, null, frame % 60 < 5 ? .2 : 0, i % 3 !== 0];
      a[i].update(...args); b[i].update(...args);
      assert.equal(state(b[i]), state(a[i]), `rig ${i}, frame ${frame}`);
    }
  }
  assert.ok(now.calls() < old.calls() / 8, `${old.calls()} → ${now.calls()} exponent calls`);
});

test('optional same-dt crowd CPU measurement', { skip: process.env.SF_GAIT_BENCH !== '1' || !baseline }, () => {
  const variants = [load(baseline), load(current)];
  const ground = (_owner, x, z) => .002 * x + .003 * z;
  const crowds = variants.map(v => Array.from({ length: 340 }, (_, i) => {
    const rig = new v.PersonRig({ seed: i / 340 }); rig.reset(i, 0, 0, ground); return rig;
  }));
  const run = (crowd, start) => {
    const begin = performance.now();
    for (let f = start; f < start + 100; f++) for (let i = 0; i < crowd.length; i++)
      crowd[i].update(1 / 60, i, f * .02, .02, ground, null, 0, i < 70);
    return performance.now() - begin;
  };
  for (let i = 0; i < 2; i++) for (const c of crowds) run(c, i * 100);
  const samples = [[], []];
  for (let block = 0; block < 6; block++) for (const i of block % 2 ? [1, 0] : [0, 1])
    samples[i].push(run(crowds[i], 200 + block * 100));
  console.log('gait 340 rigs, 100 updates, ms, baseline/current:', JSON.stringify(samples));
});
