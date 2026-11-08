// The fixture uses actual committed building and terrain data, without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function binary(name) {
  const b = fs.readFileSync(path.join(root, 'data', name + '-core.bin'));
  const n = b.readUInt32LE(4);
  return { header: JSON.parse(b.subarray(8, 8 + n)), ab: b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length) };
}
class Group {
  constructor() { this.children = []; this.position = { set: (x, y, z) => { this.position.xyz = [x, y, z]; } }; this.rotation = {}; }
  add(child) { this.children.push(child); }
}
class Geometry {
  setAttribute(name, value) { this[name] = value; }
  computeVertexNormals() {}
}
class Attribute { constructor(array, size) { this.array = new Float32Array(array); this.itemSize = size; } }
class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; } }
class Material { constructor(options) { Object.assign(this, options); } }
const NYC = { THREE: { Group, BufferGeometry: Geometry, Float32BufferAttribute: Attribute,
  Mesh, MeshStandardNodeMaterial: Material, DoubleSide: 2 } };
const context = vm.createContext({ window: { NYC }, Math });
for (const file of ['js/terrain.js', 'js/sf-jail-exterior.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const terrain = binary('terrain');
NYC.Terrain.load(terrain.header, new Uint16Array(terrain.ab, 0, terrain.header.w * terrain.header.h));
const building = binary('buildings');
const H = building.header, F = H.fields.length;
const table = new Float32Array(building.ab, 0, H.tableFloats);
const masses = new Float32Array(building.ab, (H.tableFloats + H.vertexFloats) * 4, H.massFloats);
const record = table.subarray(5759 * F, 5759 * F + F);
const [base, roof, , , , ry, start, count] = record;
const candidates = [];
for (let i = start; i < start + count; i++) candidates.push([...masses.subarray(i * 4, i * 4 + 4)]);
const [x, z, w, d] = candidates.sort((a, b) => b[2] * b[3] - a[2] * a[3])[0];
const box = { x, z, w, d, ry, y: (base - 1 + roof) / 2, h: roof - base + 1 };
const ground = NYC.Terrain.groundAt(x - Math.cos(ry) * w / 2, z + Math.sin(ry) * w / 2);

test('actual jail mass receives only bounded, coplanar facade triangles', () => {
  const group = new Group();
  const site = NYC.buildSFJailExterior(group, box, ground);
  assert.equal(group.children[0], site);
  assert.equal(H.types[record[H.fields.indexOf('type')]], 'civic');
  assert.ok(ground > 5 && ground < 7, `ground ${ground}`);
  assert.ok(site.children.length > 4 && site.children.length < 20);
  assert.deepEqual(site.position.xyz, [x, 0, z]);
  assert.equal(site.rotation.y, ry);
  for (const mesh of site.children) {
    assert.equal(mesh.material.polygonOffset, true);
    const p = mesh.geometry.position.array;
    assert.equal(p.length % 9, 0);
    for (let i = 0; i < p.length; i += 3) {
      assert.equal(p[i], -w / 2, 'decoration remains on existing solid face');
      assert.ok(p[i + 1] >= base && p[i + 1] <= roof, 'original height preserved');
      assert.ok(Math.abs(p[i + 2]) < d / 2, 'no facade extension beyond solid');
      // Check the actual source masses in the wall frame. A different wing
      // must not occlude the treatment from immediately in front of the face.
      for (const [mx, mz, mw, md] of candidates.slice(1)) {
        const dx = mx - x, dz = mz - z, cs = Math.cos(ry), sn = Math.sin(ry);
        const localX = dx * cs - dz * sn, localZ = dx * sn + dz * cs;
        const spansView = localX - mw / 2 < -w / 2 && localX + mw / 2 > -w / 2 - 1;
        if (spansView) assert.ok(Math.abs(p[i + 2] - localZ) > md / 2 + 0.1, 'clear of adjacent source wings');
      }
    }
  }
  assert.equal(NYC.ride, undefined, 'no new solid or support registered');
});

test('changed source geometry is refused instead of placing decoration in an unverified site', () => {
  assert.throws(() => NYC.buildSFJailExterior(new Group(), { ...box, w: box.w + 1 }, ground), /re-survey/);
  assert.throws(() => NYC.buildSFJailExterior(new Group(), box, NaN), /re-survey/);
});
