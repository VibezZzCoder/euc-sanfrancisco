// CPU geometry only: no renderer/browser/GPU. Historical comparisons are optional in curated source copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.webgpu.js';
import { loadLightTerrain, installLightTerrain } from '../js/sf-light-data.js';
import { gitHistory } from './helpers/optional-source.mjs';

const root = new URL('../', import.meta.url), read = name => fs.readFileSync(new URL(name, root));
const baselineRef = '2a4cf854b75249ec9ba8a6a5ca1d2cec97ad57d9';
const history = gitHistory(root, baselineRef);
const moduleOf = source => import('data:text/javascript;base64,' + Buffer.from(source.replace("from 'three/webgpu'",
  `from '${new URL('../vendor/three/build/three.webgpu.js', import.meta.url).href}'`)).toString('base64'));
const current = await moduleOf(read('js/sf-light-terrain.js').toString());
function binary(b) {
  const offset = 8 + b.readUInt32LE(4);
  return { header: JSON.parse(b.toString('utf8', 8, offset)), offset,
    buf: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}
const light = await loadLightTerrain(async name => binary(read(name)));
const hash = array => createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function budget(g) {
  return { vertices: g.attributes.position.count, indices: g.index.count, triangles: g.index.count / 3,
    position: g.attributes.position.array.byteLength, color: g.attributes.color.array.byteLength,
    normal: g.attributes.normal.array.byteLength, index: g.index.array.byteLength, indexType: g.index.array.constructor.name };
}
function equalGeometry(a, b) {
  assert.deepEqual(budget(a), budget(b));
  for (const key of Object.keys(a.attributes)) assert.equal(hash(a.attributes[key].array), hash(b.attributes[key].array), key);
  assert.equal(hash(a.index.array), hash(b.index.array), 'index order');
  assert.deepEqual(a.boundingBox, b.boundingBox); assert.deepEqual(a.boundingSphere, b.boundingSphere);
}
function world(data) {
  const N = { DATA: { lightTerrain: data } };
  vm.compileFunction(read('js/terrain.js').toString(), ['window'])({ NYC: N });
  const { header, buf, offset } = binary(read('data/terrain-core.bin'));
  N.Terrain.load(header, new Uint16Array(buf, offset, header.w * header.h));
  installLightTerrain(N, data);
  return N;
}
function dispose(view) {
  view.disposeTerrainCache();
  view.group.traverse(o => o.geometry?.dispose());
  view.group.children[0].material.dispose();
}

test('terminal-cell interpolation preserves both triangle halves, endpoints, exterior clamp and regular-grid arithmetic', () => {
  const g = { x0: 10, z0: -20, step: 256, w: 3, h: 3, x1: 298, z1: 396,
    heights: new Float32Array([2, 8, 20, 3, 16, 31, 9, 42, 81]) };
  const xs = [10, 266, 298], zs = [-20, 236, 396];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [.25, .125], [.75, .875], [.5, .5]]) {
      const k = j * 3 + i, H = g.heights;
      const expected = a + b <= 1 ? H[k] * (1 - a - b) + H[k + 1] * a + H[k + 3] * b
        : H[k + 4] * (a + b - 1) + H[k + 3] * (1 - a) + H[k + 1] * (1 - b);
      near(current.lightHeight(g, xs[i] + (xs[i + 1] - xs[i]) * a, zs[j] + (zs[j + 1] - zs[j]) * b), expected);
    }
  }
  for (const [x, z, expected] of [[-100, -100, 2], [1000, 1000, 81], [1000, -100, 20], [-100, 1000, 9]])
    assert.equal(current.lightHeight(g, x, z), expected);
  // Independent original uniform-grid arithmetic; no changes even at a native city's final cell.
  function original(g, x, z) {
    const fx = Math.max(0, Math.min(g.w - 1, (x - g.x0) / g.step));
    const fz = Math.max(0, Math.min(g.h - 1, (z - g.z0) / g.step));
    const i = Math.min(g.w - 2, Math.floor(fx)), j = Math.min(g.h - 2, Math.floor(fz));
    const a = fx - i, b = fz - j, k = j * g.w + i, H = g.heights;
    return a + b <= 1 ? H[k] + (H[k + 1] - H[k]) * a + (H[k + g.w] - H[k]) * b
      : H[k + g.w + 1] - (H[k + g.w + 1] - H[k + g.w]) * (1 - a) - (H[k + g.w + 1] - H[k + 1]) * (1 - b);
  }
  for (const field of [light.city, { ...g, x1: 522, z1: 492 }]) {
    for (let j = 0; j <= 30; j++) for (let i = 0; i <= 30; i++) {
      const x = field.x0 - .3 + (field.x1 - field.x0 + .6) * i / 30;
      const z = field.z0 - .7 + (field.z1 - field.z0 + 1.4) * j / 30;
      assert.equal(current.lightHeight(field, x, z), original(field, x, z));
    }
  }
});

test('actual Light horizon mesh ends at source bounds and retains every coarse sample position/height', () => {
  const view = current.buildLightTerrain(new THREE.Scene(), world(light));
  try {
    const g = view.group.children[1].geometry, p = g.attributes.position, h = light.horizon;
    assert.equal(g.boundingBox.min.x, h.x0); assert.equal(g.boundingBox.min.z, h.z0);
    assert.equal(g.boundingBox.max.x, 28000); assert.equal(g.boundingBox.max.z, 16000);
    for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) {
      const k = j * h.w + i, y = h.heights[k];
      assert.equal(p.getX(k), Math.min(h.x1, h.x0 + i * h.step));
      assert.equal(p.getZ(k), Math.min(h.z1, h.z0 + j * h.step));
      assert.equal(p.getY(k), Math.fround(y > light.waterLevel + .05 ? y : light.waterLevel - 4));
    }
    for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite));
  } finally { dispose(view); }
});

test('committed baseline comparison: same data payload, geometry budgets, index order and all nonterminal geometry',
  { skip: history.skip }, async t => {
    const before = await moduleOf(history.read('js/sf-light-terrain.js'));
    const oldLoader = await moduleOf(history.read('js/sf-light-data.js'));
    const oldBytes = execFileSync('git', ['show', `${baselineRef}:data/light-terrain.bin`], { cwd: root, maxBuffer: 32000000 });
    const newBytes = read('data/light-terrain.bin'), oldBin = binary(oldBytes), newBin = binary(newBytes);
    const old = await oldLoader.loadLightTerrain(async () => oldBin);
    assert.deepEqual(newBin.header.layout, oldBin.header.layout);
    assert.ok(newBytes.subarray(newBin.offset).equals(oldBytes.subarray(oldBin.offset)), 'entire typed payload is byte-identical');
    const arrays = d => ({ city: d.city.heights, horizon: d.horizon.heights, roads: d.roads,
      maskRows: d.mask.rows, maskEnds: d.mask.ends, maskValues: d.mask.values });
    for (const key of Object.keys(arrays(old))) {
      assert.equal(arrays(light)[key].byteLength, arrays(old)[key].byteLength);
      assert.equal(hash(arrays(light)[key]), hash(arrays(old)[key]), key);
    }
    for (const key of ['city', 'horizon']) assert.deepEqual(Object.keys(light[key]).sort(), Object.keys(old[key]).sort());
    const a = before.buildLightTerrain(new THREE.Scene(), world(old));
    const b = current.buildLightTerrain(new THREE.Scene(), world(light));
    try {
      assert.equal(a.group.children.length, b.group.children.length);
      const ag = a.group.children[1].geometry, bg = b.group.children[1].geometry;
      assert.deepEqual(budget(bg), budget(ag));
      assert.equal(hash(bg.index.array), hash(ag.index.array));
      assert.equal(hash(bg.attributes.color.array), hash(ag.attributes.color.array));
      const ap = ag.attributes.position, bp = bg.attributes.position, an = ag.attributes.normal, bn = bg.attributes.normal;
      let moved = 0, changedNormals = 0;
      const h = light.horizon, penultimateX = h.x0 + (h.w - 2) * h.step, penultimateZ = h.z0 + (h.h - 2) * h.step;
      for (let k = 0; k < bp.count; k++) {
        assert.equal(bp.getX(k), Math.min(h.x1, ap.getX(k)));
        assert.equal(bp.getZ(k), Math.min(h.z1, ap.getZ(k)));
        assert.equal(bp.getY(k), ap.getY(k));
        if (bp.getX(k) !== ap.getX(k) || bp.getZ(k) !== ap.getZ(k)) moved++;
        const normalChanged = [0, 1, 2].some(c => !Object.is(an.array[k * 3 + c], bn.array[k * 3 + c]));
        if (normalChanged) {
          changedNormals++;
          assert.ok(ap.getX(k) >= penultimateX || ap.getZ(k) >= penultimateZ, 'only vertices incident to terminal cells change normals');
        }
      }
      assert.equal(moved, h.w + h.h - 1); assert.ok(changedNormals > 0);
      const phases = [];
      for (const rider of [null, { x: 4999, z: 9999 }, { x: -238.2, z: 2698.01 }]) {
        if (rider) { a.update(null, 0, rider); b.update(null, 0, rider); }
        assert.equal(a.group.children.length, b.group.children.length);
        let bytes = 0, vertices = 0, indices = 0;
        for (let i = 0; i < a.group.children.length; i++) {
          const x = a.group.children[i].geometry, y = b.group.children[i].geometry;
          if (i !== 1) equalGeometry(x, y);
          const q = budget(y); bytes += q.position + q.color + q.normal + q.index; vertices += q.vertices; indices += q.indices;
        }
        phases.push({ rider, geometries: b.group.children.length, vertices, indices, typedBytesBefore: bytes, typedBytesAfter: bytes });
      }
      const oldProvenance = JSON.parse(history.read('provenance/light-terrain.json'));
      t.diagnostic(JSON.stringify({ baselineRef, samples: h.w * h.h, moved, changedNormals,
        horizonBefore: budget(ag), horizonAfter: budget(bg), phases,
        decodedBefore: oldProvenance.decodedBytes, decodedAfter: JSON.parse(read('provenance/light-terrain.json')).decodedBytes,
        binaryBefore: oldBytes.length, binaryAfter: newBytes.length,
        headerBefore: oldBin.offset - 8, headerAfter: newBin.offset - 8,
        gzipBefore: oldProvenance.outputs['data/light-terrain.bin.gz'].bytes, gzipAfter: read('data/light-terrain.bin.gz').length }));
    } finally { dispose(a); dispose(b); }
  });
