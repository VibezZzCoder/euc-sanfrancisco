// Real pinned Three geometry + committed terrain/roads, without a renderer or browser.
// The general landmarks harness intentionally stubs Three and cannot validate vertex/contact agreement.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { buildLandmarksHeadless, available } = require('./helpers/landmarks-build.cjs');

const root = join(__dirname, '..');
const skip = !available && 'no data';
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} vs ${b} (tolerance ${epsilon})`);
const source = name => readFileSync(join(root, `js/${name}.js`), 'utf8');
let fixture;
async function build() {
  if (fixture) return fixture;
  const THREE = await import('../vendor/three/build/three.webgpu.js');
  const utils = readFileSync(join(root, 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js'), 'utf8')
    .replace("from 'three'", `from '${pathToFileURL(join(root, 'vendor/three/build/three.core.js')).href}'`);
  const Addons = await import('data:text/javascript;base64,' + Buffer.from(utils).toString('base64'));
  // Reuse decoded terrain/roads only. An empty site table skips unrelated landmark models;
  // the unmodified runtime still builds the complete Lombard site and all of its steps.
  const { NYC: inherited } = buildLandmarksHeadless();
  const NYC = { THREE, Addons, GEO: inherited.GEO, Terrain: inherited.Terrain, LANDMARK_SITES: {},
    createPreWarBuildingMaterial: () => new THREE.MeshStandardNodeMaterial(),
    createCurtainWallMaterial: () => new THREE.MeshStandardNodeMaterial() };
  const context = vm.createContext({ window: { NYC }, console: { info() {}, warn() {} } });
  const runtime = source('landmarks');
  vm.runInContext(source('sf-ride-geometry'), context);
  vm.runInContext(runtime, context);
  const scene = new THREE.Scene();
  const result = NYC.buildLandmarks(scene);
  const group = result.group.getObjectByName('landmark:lombard');
  assert.ok(group, 'the real runtime generated Lombard');
  const shrubs = group.getObjectByName('landmark:lombard-beds');
  const flowers = group.getObjectByName('landmark:lombard-flowers');
  const soil = group.children.find(m => m.isMesh && !m.isInstancedMesh && m.material.color.getHex() === 0x514738);
  assert.ok(soil && shrubs && flowers, 'soil and both planting batches exist');
  const roads = [];
  const rg = NYC.GEO.roadGraph;
  for (const [a, b, , , , , inner, flags] of rg.links) if (flags & 64) {
    const points = [[rg.nodes[a * 2], rg.nodes[a * 2 + 1]]];
    for (let k = 0; k < inner.length; k += 2) points.push([inner[k], inner[k + 1]]);
    points.push([rg.nodes[b * 2], rg.nodes[b * 2 + 1]]);
    for (let i = 1; i < points.length; i++) roads.push([points[i - 1], points[i]]);
  }
  assert.ok(roads.length > 8, 'actual switchback road segments');
  const distance = (x, z) => Math.min(...roads.map(([[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
  }));
  fixture = { THREE, NYC, group, shrubs, flowers, soil, result, distance,
    hash: createHash('sha256').update(runtime).digest('hex') };
  return fixture;
}

function vertices(mesh, THREE) {
  const p = mesh.geometry.attributes.position;
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i));
}

test('Lombard has low conforming soil contacts and no former planting box bodies', { skip }, async t => {
  const { THREE, NYC, soil, shrubs, result, hash } = await build();
  assert.equal(shrubs.geometry.type, 'SphereGeometry');
  assert.ok(shrubs.count > 100, 'substantial planting retained');
  const v = vertices(soil, THREE);
  assert.equal(v.length, shrubs.count * 6, 'two drawn soil triangles per bed');
  const tops = NYC.ride.tops.filter(p => p.surface === 'grass');
  assert.ok(tops.length >= shrubs.count && tops.length <= shrubs.count * 2);
  assert.equal(NYC.ride.solids.filter(p => p.surface === 'grass').length, 0, 'no old grass boxes');
  assert.equal(NYC.ride.prisms.filter(p => p.surface === 'grass').length, 0, 'no replacement foliage body envelopes');
  assert.equal(result.colliders.length, 0, 'Lombard adds no coarse collision envelopes');
  assert.ok(NYC.ride.solids.length > 100, 'sidewalk step bodies still present');
  assert.ok(NYC.ride.solids.every(p => p.surface === 'pavement' && Math.abs(p.halfExtents.y - 0.25) < 1e-9),
    'all remaining bodies belong to the half-metre steps, not 0.6 m planting boxes');
  const key = p => `${p.x},${p.z}`;
  const drawn = new Map(v.map(p => [key(p), p]));
  const supportVertices = new Set();
  let maxCornerError = 0;
  for (const p of v) {
    const error = Math.abs(p.y - NYC.Terrain.heightAt(p.x, p.z) - 0.025);
    maxCornerError = Math.max(maxCornerError, error);
    assert.ok(error < 0.0002, `soil is 2.5 cm above local terrain, not a level box: ${error}`);
  }
  for (const top of tops) {
    assert.equal(top.layered, false);
    for (const p of top.poly) {
      const draw = drawn.get(key(p));
      assert.ok(draw, 'every registered soil corner is an actual drawn vertex');
      const y = top.plane ? top.plane.y + top.plane.dx * (p.x - top.plane.x) + top.plane.dz * (p.z - top.plane.z) : top.top;
      near(y, draw.y, 1e-8);
      supportVertices.add(key(p));
    }
  }
  assert.equal(supportVertices.size, drawn.size, 'no unsupported drawn soil corners');
  const { SfTerrainSampler } = await import('../js/sf-terrain-sampler.js');
  const sampler = new SfTerrainSampler({ city: NYC });
  let maxContactError = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3, y = (a.y + b.y + c.y) / 3;
    const ground = sampler.sampleGround(x, z, { normal: {} }, y);
    assert.ok(ground.registered && ground.surface === 'grass', 'native sampler selects the soil facet');
    const geometricNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    assert.ok(geometricNormal.y > 0, 'soil triangles face upward');
    const drawnNormal = new THREE.Vector3().fromBufferAttribute(soil.geometry.attributes.normal, i);
    assert.ok(drawnNormal.distanceTo(geometricNormal) < 1e-6, 'drawn soil normals match triangle geometry');
    const contactNormal = new THREE.Vector3(ground.normal.x, ground.normal.y, ground.normal.z);
    assert.ok(contactNormal.distanceTo(geometricNormal) < 1e-7, 'native soil normals match drawn geometry');
    const error = Math.abs(ground.height - y);
    maxContactError = Math.max(maxContactError, error);
    assert.ok(error < 1e-7, 'drawn triangle centroid agrees with native contact');
  }
  t.diagnostic(JSON.stringify({ sourceSHA256: hash, beds: shrubs.count, soilTriangles: v.length / 3,
    soilSupports: tops.length, stepBodies: NYC.ride.solids.length, maxCornerError, maxContactError }));
});

test('every Lombard soil cell and full planting footprint clears the 5.6 m road ribbon', { skip }, async t => {
  const { THREE, shrubs, flowers, soil, distance } = await build();
  const v = vertices(soil, THREE), matrix = new THREE.Matrix4();
  let minSoil = Infinity, minCellBound = Infinity, minShrubBound = Infinity, minFlowerBound = Infinity;
  for (let i = 0; i < shrubs.count; i++) {
    shrubs.getMatrixAt(i, matrix);
    const center = new THREE.Vector3().setFromMatrixPosition(matrix);
    let cellRadius = 0;
    for (const p of v.slice(i * 6, i * 6 + 6)) {
      const clearance = distance(p.x, p.z) - 2.8;
      minSoil = Math.min(minSoil, clearance);
      assert.ok(clearance >= 0.2498, `soil corner clears ribbon by 25 cm: ${clearance}`);
      cellRadius = Math.max(cellRadius, Math.hypot(p.x - center.x, p.z - center.z));
    }
    // Distance to a segment union is 1-Lipschitz: this bound proves the entire
    // cell interior/edges clear too, not just its corners. Allow Float32 storage error.
    const bound = distance(center.x, center.z) - cellRadius - 2.8;
    minCellBound = Math.min(minCellBound, bound);
    assert.ok(bound >= 0.2498, `entire soil cell clears ribbon: ${bound}`);
  }
  for (const mesh of [shrubs, flowers]) {
    const local = vertices(mesh, THREE);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const e = matrix.elements;
      // Conservative projected bounding circle from each actual instance's
      // X/Z transform rows (Frobenius upper bound on the projected unit sphere).
      const radius = Math.hypot(e[0], e[4], e[8], e[2], e[6], e[10]);
      const bound = distance(e[12], e[14]) - radius - 2.8;
      assert.ok(bound >= 0.2498, `whole ${mesh.name} footprint clears ribbon by 25 cm: ${bound}`);
      if (mesh === shrubs) minShrubBound = Math.min(minShrubBound, bound);
      else minFlowerBound = Math.min(minFlowerBound, bound);
      for (const p of local) {
        const world = p.clone().applyMatrix4(matrix);
        assert.ok(distance(world.x, world.z) - 2.8 > 0.25, 'every transformed planting vertex clears ribbon');
      }
    }
  }
  t.diagnostic(JSON.stringify({ minSoilCornerClearance: minSoil, minWholeCellClearance: minCellBound,
    minWholeShrubClearanceBound: minShrubBound, minWholeFlowerClearanceBound: minFlowerBound }));
});

test('Lombard geometry, normals, slope alignment and colors are finite with bounded measured cost', { skip }, async t => {
  const { THREE, NYC, group, shrubs, flowers } = await build();
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
  let triangles = 0, bytes = 0, draws = 0;
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    draws++;
    const g = mesh.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1);
    for (const [name, attr] of Object.entries(g.attributes)) {
      bytes += attr.array.byteLength;
      assert.ok(Array.from(attr.array).every(Number.isFinite), `${mesh.name} ${name} finite`);
    }
    if (g.index) {
      bytes += g.index.array.byteLength;
      assert.ok(Array.from(g.index.array).every(i => i >= 0 && i < g.attributes.position.count), 'valid indices');
    }
    const normals = g.attributes.normal;
    assert.ok(normals, 'actual normals exist');
    for (let i = 0; i < normals.count; i++) near(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)), 1, 1e-5);
    assert.ok([mesh.material.color.r, mesh.material.color.g, mesh.material.color.b, mesh.material.roughness].every(Number.isFinite));
    if (!mesh.isInstancedMesh) return;
    assert.ok(mesh.instanceColor, 'instance color buffer exists');
    for (const attr of [mesh.instanceMatrix, mesh.instanceColor]) {
      bytes += attr.array.byteLength;
      assert.ok(Array.from(attr.array).every(Number.isFinite), 'finite instance attributes');
    }
    assert.ok(Array.from(mesh.instanceColor.array).every(c => c >= 0 && c <= 1), 'bounded linear RGB');
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      assert.ok(matrix.determinant() > 0, 'non-degenerate positive instance transform');
      normalMatrix.getNormalMatrix(matrix);
      for (let k = 0; k < normals.count; k++) {
        const n = new THREE.Vector3().fromBufferAttribute(normals, k).applyNormalMatrix(normalMatrix);
        assert.ok([n.x, n.y, n.z].every(Number.isFinite), 'finite transformed normals');
        near(n.length(), 1, 1e-7);
      }
      const up = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
      const parentMatrix = new THREE.Matrix4();
      shrubs.getMatrixAt(mesh === shrubs ? i : Math.floor(i / 3), parentMatrix);
      const { x, z } = new THREE.Vector3().setFromMatrixPosition(parentMatrix);
      const expected = new THREE.Vector3(NYC.Terrain.heightAt(x - 0.25, z) - NYC.Terrain.heightAt(x + 0.25, z),
        0.5, NYC.Terrain.heightAt(x, z - 0.25) - NYC.Terrain.heightAt(x, z + 0.25)).normalize();
      assert.ok(up.distanceTo(expected) < 0.0002, 'shrubs and flower heads follow local ground normal');
    }
  });
  assert.equal(flowers.count, shrubs.count * 3);
  assert.equal(draws, 5, 'brick, soil, steps, shrub and flower batches only');
  const stats = NYC.landmarkStats.find(p => p.slug === 'lombard-street');
  assert.equal(stats.draws, draws);
  assert.equal(stats.tris, triangles, 'reported triangle cost equals actual generated geometry');
  assert.ok(triangles < 60000, `bounded site triangle budget: ${triangles}`);
  assert.ok(bytes < 1000000, `bounded site geometry/instance buffers: ${bytes}`);
  t.diagnostic(JSON.stringify({ shrubs: shrubs.count, flowers: flowers.count, draws, triangles, geometryAndInstanceBytes: bytes }));
});
