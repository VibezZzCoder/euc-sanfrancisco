import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { BOOKING_RULES } from '../js/booking.js';

const source = await readFile(new URL('../js/booking-scene.js', import.meta.url), 'utf8');
const resolved = source
  .replace("from 'three/webgpu'", `from '${new URL('../vendor/three/build/three.webgpu.js', import.meta.url).href}'`)
  .replace("from './booking.js'", `from '${new URL('../js/booking.js', import.meta.url).href}'`);
const { createBookingScene } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };

function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

test('caller frame rotates desk, camera, writing point and lamp together without lights', () => {
  const scene = new THREE.Scene();
  let beginning, presented;
  const component = createBookingScene(scene, { x: 10, y: 7, z: 20, heading: Math.PI / 2 }, {
    beginBooking(...args) { beginning = args; },
    presentBooking(dt, action) { presented = { dt, ...action, light: { ...action.light } }; },
  });
  assert.equal(component.group.visible, false);
  assert.equal(component.update(0, { phase: 'captured', age: 0 }, 1.5), null);
  const view = component.update(0.1, { phase: 'signature', age: 1.5 }, 1.5);
  close(beginning[0], 8.6); close(beginning[1], 7); close(beginning[2], 20); close(beginning[3], Math.PI / 2);
  close(presented.x, 10); close(presented.y, 8.03); close(presented.z, 20.24);
  close(presented.light.x, 10); close(presented.light.y, 8.808); close(presented.light.z, 18.88);
  assert.equal(presented.writing, true);
  close(view.position.x, 14); close(view.position.y, 9.4); close(view.position.z, 17.6);
  close(view.target.x, 9.85); close(view.target.z, 18.8);
  let lights = 0;
  component.group.traverse((object) => { if (object.isLight) lights++; });
  assert.equal(lights, 0);
  component.dispose();
});

test('phase transitions, one-shot tear and idempotent resource cleanup', () => {
  const scene = new THREE.Scene();
  let begins = 0, ends = 0, tears = 0, writing;
  const component = createBookingScene(scene, { x: 0, y: 3, z: 0, heading: 0 }, {
    beginBooking() { begins++; }, endBooking() { ends++; }, onPaperTorn() { tears++; },
    presentBooking(dt, action) { writing = action.writing; },
  });
  const disposed = [];
  const resources = new Set();
  component.group.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) { resources.add(object.material); if (object.material.map) resources.add(object.material.map); }
  });
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.push(resource));
  component.update(0.1, { phase: 'intake', age: 0 }, 0.7);
  component.update(0.1, { phase: 'signature', age: BOOKING_RULES.writeDelay }, 0.7);
  assert.equal(writing, true);
  component.update(0.1, { phase: 'signature', age: BOOKING_RULES.tearSeconds }, 0.7);
  assert.equal(writing, false);
  component.update(0.1, { phase: 'released', age: 0 }, 0.7);
  assert.equal(tears, 1);
  component.update(0, { phase: 'idle', age: 0 }, 0.7);
  assert.equal(ends, 1); assert.equal(component.group.visible, false);
  component.update(0.1, { phase: 'intake', age: 0 }, 1);
  assert.equal(begins, 2);
  component.dispose(); component.dispose();
  assert.equal(ends, 2); assert.equal(scene.children.length, 0);
  assert.equal(disposed.length, resources.size);
  assert.equal(new Set(disposed).size, resources.size);
  assert.throws(() => component.update(0, { phase: 'idle' }, 1), /disposed/);
});

test('rejects incomplete or non-finite site before changing the scene', () => {
  const scene = new THREE.Scene();
  for (const site of [null, {}, { x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: Infinity, heading: 0 }]) {
    assert.throws(() => createBookingScene(scene, site), /finite/);
  }
  assert.equal(scene.children.length, 0);
});
