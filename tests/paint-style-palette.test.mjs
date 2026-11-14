// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Independent raw-layout oracle and bitwise Float32 checks; no GPU or geographic regeneration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { gitHistory } from './helpers/optional-source.mjs';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('js/road-paint.js', root), 'utf8');
const history = gitHistory(root, '9a39492');
const baseline = history.read('js/road-paint.js');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hash = a => createHash('sha256').update(bytes(a)).digest('hex');
const same = (a, b) => assert.equal(hash(a), hash(b), 'typed output bits match');
const paletteSource = source.slice(source.indexOf('function collectPaintPalette('), source.indexOf('// One transparent render item'));
const collect = new Function('calls', paletteSource + '\nreturn collectPaintPalette(calls);');
const call = (r, g, b, period = 1, duty = 1) => [0, 0, 10, 0, 1, { r, g, b }, period, duty, false, 0];

function fixture(code, tier) {
  const N = { THREE, CROSSWALK: 3.5, CURB_H: .15, worldTier: tier,
    Terrain: { loaded: true, groundAt: (x, z) => 90 + x * .17 + Math.sin(z * .1),
      normalAt(x, z, out) { out.x = -.17; out.y = 1; out.z = -.1 * Math.cos(z * .1); } },
    blockAt: (x, z) => Math.abs(z) > 9,
    GEO: { bikeways: [{ pts: [0, 0, 120, 0], cls: 2, side: 0, buffered: true }],
      rail: [{ pts: [-12, 2, 134, 7] }], transit: [{ kind: 'cablecar', pts: [-12, 2, 134, 7] }] },
    createRoadPaintMaterial(palette) { N.palette = palette; return new THREE.MeshStandardNodeMaterial({
      transparent: true, depthWrite: false, vertexColors: !palette }); } };
  const from = { id: 0, signal: true }, to = { id: 1, signal: true };
  const edge = { from, to, sx: 0, sz: 0, dx: 1, dz: 0, rx: 0, rz: -1, len: 120.03125, half: 11,
    lanes: [1.8, 5.4], stop: true };
  const back = { ...edge, from: to, to: from, sx: edge.len, dx: -1, rz: 1 };
  new Function('window', 'console', code)({ NYC: N }, { info() {} });
  const scene = new THREE.Scene(), mesh = N.buildRoadPaint(scene, { edges: [edge, back] });
  return { mesh, N, scene, dispose() { mesh.geometry.dispose(); mesh.material.dispose(); } };
}

function compareGeometry(raw, compact) {
  const a = raw.mesh.geometry, b = compact.mesh.geometry, p = compact.N.palette;
  assert.ok(p?.length > 0 && p.length <= 16);
  assert.equal(b.attributes.paintStyle.itemSize, 2);
  assert.equal(b.attributes.color, undefined); assert.equal(b.attributes.paint, undefined);
  for (const name of ['position', 'normal', 'side']) same(a.attributes[name].array, b.attributes[name].array);
  same(a.index.array, b.index.array);
  assert.deepEqual(a.boundingBox, b.boundingBox); assert.deepEqual(a.boundingSphere, b.boundingSphere);
  const encoded = b.attributes.paintStyle.array;
  const paint = new Float32Array(a.attributes.paint.array.length), color = new Float32Array(a.attributes.color.array.length);
  const counts = new Map();
  for (let i = 0; i < encoded.length / 2; i++) {
    const id = encoded[i * 2 + 1];
    assert.ok(Number.isInteger(id) && id >= 0 && id < p.length);
    counts.set(id, (counts.get(id) || 0) + 1);
    paint[i * 3] = encoded[i * 2]; paint[i * 3 + 1] = p[id][3]; paint[i * 3 + 2] = p[id][4];
    color.set(p[id].slice(0, 3), i * 3);
  }
  same(a.attributes.paint.array, paint); same(a.attributes.color.array, color);
  assert.equal(counts.size, 8, 'fixture includes every current road/bike/crosswalk/rail/cable-slot style');
  assert.equal((paint.byteLength + color.byteLength) - encoded.byteLength, a.attributes.position.count * 16);
  assert.equal(compact.scene.children.length, 1); assert.equal(compact.mesh.renderOrder, -1);
  assert.equal(compact.mesh.receiveShadow, raw.mesh.receiveShadow);
  assert.equal(compact.mesh.material.depthWrite, false);
}

test('every compact fixture vertex reconstructs original Float32 paint/color; geometry and order stay exact', () => {
  const raw = fixture(source, 'full'), compact = fixture(source, 'light');
  try { compareGeometry(raw, compact); } finally { raw.dispose(); compact.dispose(); }
});

test('independent pre-change construction matches Full and decoded Light output', { skip: !baseline && history.skip }, () => {
  const old = fixture(baseline, 'full'), raw = fixture(source, 'full'), compact = fixture(source, 'light');
  try {
    for (const key of Object.keys(old.mesh.geometry.attributes)) same(old.mesh.geometry.attributes[key].array, raw.mesh.geometry.attributes[key].array);
    same(old.mesh.geometry.index.array, raw.mesh.geometry.index.array);
    compareGeometry(old, compact);
  } finally { old.dispose(); raw.dispose(); compact.dispose(); }
});

test('palette keys follow original Float32 rounding, including distinct signed zero and adjacent values', () => {
  const calls = [call(.1, .2, .3), call(.1 + 1e-12, .2, .3), call(-0, .2, .3), call(0, .2, .3),
    call(Math.fround(.1) + 2 ** -27, .2, .3)];
  const p = collect(calls);
  assert.equal(p.length, 4); assert.equal(calls[0][10], calls[1][10]);
  assert.notEqual(calls[2][10], calls[3][10]); assert.ok(Object.is(p[calls[2][10]][0], -0));
  assert.notEqual(calls[0][10], calls[4][10]);
});

test('unsupported/non-finite styles and palette overflow select raw, including pinned blue signed-zero loss', () => {
  for (const c of [call(.1, .2, -0), call(NaN, 1, 1), call(1e300, 1, 1), call(1, 1, 1, 0),
    call(1, 1, 1, -1), call(1, 1, 1, 1, -0.1), call(1, 1, 1, 1, 1.01)]) assert.equal(collect([c]), null);
  assert.equal(collect([]), null);
  const calls = Array.from({ length: 17 }, (_, i) => call(i / 16, .2, .3));
  assert.equal(collect(calls.slice(0, 16)).length, 16); assert.equal(collect(calls), null);
});

test('fallback after palette overflow actually builds original raw attributes, not partial compact data', () => {
  const overloaded = source.replace('  const palette = window.NYC.worldTier',
    '  for(let i=0;i<17;i++) strip(i,0,i+3,0,.1,{r:i/16,g:.2,b:.3});\n  const palette = window.NYC.worldTier');
  const raw = fixture(overloaded, 'full'), light = fixture(overloaded, 'light');
  try {
    assert.equal(light.N.palette, null);
    for (const [key, attr] of Object.entries(raw.mesh.geometry.attributes)) same(attr.array, light.mesh.geometry.attributes[key].array);
    same(raw.mesh.geometry.index.array, light.mesh.geometry.index.array);
  } finally { raw.dispose(); light.dispose(); }
});

test('compact vertices retain raw ordered-culling prefixes, pending upload ranges and terminal full-stream restoration', () => {
  const raw = fixture(source, 'full'), light = fixture(source, 'light');
  const original = raw.mesh.geometry.index.array.slice();
  try {
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 2000);
    for (const coordinate of [THREE.WebGLCoordinateSystem, THREE.WebGPUCoordinateSystem]) {
      camera.coordinateSystem = coordinate;
      for (const [x, z, aspect] of [[0, 20, 1.7], [105, -20, .46], [150, 40, 2.1], [-1200, 0, 1]]) {
        camera.aspect = aspect; camera.position.set(x, 108, z); camera.lookAt(40, 98, 0);
        camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        for (const f of [raw, light]) {
          f.scene.updateMatrixWorld(true);
          f.mesh.onBeforeRender({}, f.scene, camera, f.mesh.geometry, f.mesh.material, null);
        }
        assert.deepEqual(light.mesh.geometry.drawRange, raw.mesh.geometry.drawRange);
        assert.deepEqual(light.mesh.geometry.index.updateRanges, raw.mesh.geometry.index.updateRanges);
        same(light.mesh.geometry.index.array, raw.mesh.geometry.index.array);
      }
    }
    light.mesh.geometry.dispose(); same(light.mesh.geometry.index.array, original);
  } finally { raw.dispose(); light.dispose(); }
});
