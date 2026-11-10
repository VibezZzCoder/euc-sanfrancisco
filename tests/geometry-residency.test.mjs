// Static geometry CPU-copy release: upload first through the renderer's attribute owner, keep type/count/bounds,
// never touch dynamic, instanced, interleaved or explicitly kept data. CPU-only (fake renderer owner).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.core.js';
import { releaseStaticGeometryCopies } from '../js/geometry-residency.js';

test('static attributes are uploaded, then emptied with the same type, count and precomputed bounds', () => {
  const calls = [];
  const renderer = { _attributes: { update: (attribute, type) => calls.push([attribute, type, attribute.array.length]) } };
  const g = new THREE.BoxGeometry(2, 3, 4);
  const dynamic = new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('extra', dynamic);
  const mesh = new THREE.Mesh(g), kept = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  const counts = { position: g.attributes.position.count, index: g.index.count };
  const types = { position: g.attributes.position.array.constructor, index: g.index.array.constructor };
  const stats = releaseStaticGeometryCopies(renderer, [{ mesh }, { mesh: kept, keepIndex: true }]);
  assert.ok(g.boundingSphere && g.boundingBox, 'bounds computed before release');
  assert.equal(g.boundingBox.max.y, 1.5);
  assert.equal(g.attributes.position.array.length, 0); assert.equal(g.attributes.position.array.constructor, types.position);
  assert.equal(g.attributes.position.count, counts.position); assert.equal(g.index.count, counts.index);
  assert.equal(g.index.array.constructor, types.index); assert.equal(g.index.array.length, 0);
  assert.equal(dynamic.array.length, g.attributes.position.count * 2, 'dynamic usage is never released');
  assert.ok(calls.every(([, , length]) => length > 0), 'upload happens before the array is emptied');
  assert.ok(calls.some(([a, type]) => a === g.index && type === 2) && calls.some(([a, type]) => a === g.attributes.position && type === 1));
  assert.ok(kept.geometry.index.array.length > 0, 'keepIndex retains a runtime-edited index');
  assert.equal(kept.geometry.attributes.position.array.length, 0);
  assert.equal(stats.attributes, calls.length);
  // Second call: already-empty arrays are skipped (no duplicate upload, no double count).
  assert.equal(releaseStaticGeometryCopies(renderer, [{ mesh }]).attributes, 0);
});

test('instanced meshes, interleaved data and renderers without an attribute owner are left alone', () => {
  const geo = new THREE.BoxGeometry(), inst = new THREE.InstancedMesh(geo, undefined, 3);
  const interleaved = new THREE.InterleavedBuffer(new Float32Array(24), 6), ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  const calls = [], renderer = { _attributes: { update: (a) => calls.push(a) } };
  releaseStaticGeometryCopies(renderer, [{ mesh: inst }, { mesh: new THREE.Mesh(ig) }]);
  assert.equal(calls.length, 0); assert.ok(geo.attributes.position.array.length > 0); assert.equal(interleaved.array.length, 24);
  assert.deepEqual(releaseStaticGeometryCopies({}, [{ mesh: new THREE.Mesh(new THREE.BoxGeometry()) }]), { attributes: 0, bytes: 0 });
});
