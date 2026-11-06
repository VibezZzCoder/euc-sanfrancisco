// Compact CPU-only registry/construction contracts. No renderer, browser or native EUC hooks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const root = join(__dirname, '..');
const three = import(pathToFileURL(join(root, 'vendor/three/build/three.core.js')).href);
function setup(extra = {}) {
  const N = { ...extra }, context = vm.createContext({ window: { NYC: N }, console: { info() {}, warn() {} }, location: { search: '' }, URLSearchParams });
  const load = (file) => vm.runInContext(readFileSync(join(root, 'js', file), 'utf8'), context, { filename: file });
  load('sf-ride-geometry.js');
  return { N, R: N.RideGeometry, load };
}
const height = (r, x, z) => r.plane ? r.plane.y + r.plane.dx * (x - r.plane.x) + r.plane.dz * (z - r.plane.z) : r.top;
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test('records own coordinates, preserve layers/holes, separate support from bodies', () => {
  const { R, N } = setup();
  const ring = [{ x: 0, z: 0 }, { x: 0, z: 3 }, { x: 1, z: 3 }, { x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 0 }];
  const p = R.addPrism(ring, 23, 81, { holes: [[{ x: .2, z: .2 }, { x: .2, z: .5 }, { x: .5, z: .2 }]] });
  const t = R.addTop(ring, 81, 'grass', { layered: true, shore: true, minReferenceY: 79, maxReferenceY: 85 });
  ring[0].x = 999;
  assert.equal(p.outer[0].x, 0); assert.equal(t.poly[0].x, 0);
  assert.equal(p.outer.length, 6); assert.equal(p.holes[0].length, 3);
  assert.equal(t.layered, true); assert.equal(t.minReferenceY, 79); assert.equal(t.maxReferenceY, 85);
  const b = R.addBox({ x: 2, y: 5, z: 3 }, { x: 1, y: 2, z: .5 }, .7, { top: true, surface: 'wood' });
  assert.equal(b.support, false); assert.equal(p.support, false); assert.equal(N.ride.tops.length, 2);
  assert.equal(R.addBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 1 }), null);
  assert.equal(R.addPrism(ring, NaN, 2), null);
});

test('upward facets give exact planes, safely merge coplanar pairs and reject undersides', () => {
  const { R, N } = setup();
  // y = 13 + 2*x - .4*z, a quad split on its diagonal.
  const pos = [0, 13, 0, 0, 12.2, 2, 3, 19, 0, 3, 18.2, 2];
  const records = R.addTriangles(pos, [0, 1, 2, 2, 1, 3], 'brick', { replacesTerrain: true });
  assert.equal(records.length, 1); assert.equal(records[0].poly.length, 4);
  near(height(records[0], .7, 1.1), 13 + 2 * .7 - .4 * 1.1);
  assert.equal(records[0].replacesTerrain, true);
  assert.equal(R.addTriangles(pos, [2, 1, 0]).length, 0);
  assert.equal(R.addTriangles(pos, [2, 1, 0], 'brick', { doubleSided: true }).length, 1);
  assert.equal(R.addTriangles([0, 0, 0, 0, 1, 0, 0, 0, 1]).length, 0); // vertical
  const crease = pos.slice(); crease[10] += .2;
  assert.equal(R.addTriangles(crease, [0, 1, 2, 2, 1, 3]).length, 2);
  assert.equal(N.ride.solids.length + N.ride.prisms.length, 0);
});

test('mesh extraction includes parent transforms and only explicit individual side bodies', async () => {
  const T = await three, { R, N } = setup();
  const parent = new T.Group(); parent.position.set(100, 40, -70); parent.rotation.y = .63;
  const mesh = new T.Mesh(new T.BoxGeometry(4, 2, 6)); mesh.position.set(2, 3, -1); parent.add(mesh);
  const result = R.addMesh(mesh, 'wood', { layered: true });
  assert.equal(result.tops.length, 1); near(result.tops[0].top, 44);
  assert.equal(N.ride.solids.length + N.ride.prisms.length, 0);
  const transformed = new T.Vector3(-2, 1, -3).applyMatrix4(mesh.matrixWorld);
  assert.ok(result.tops[0].poly.some((p) => Math.hypot(p.x - transformed.x, p.z - transformed.z) < 1e-6));
  const prism = R.addMesh(mesh, 'wood', { tops: false, sides: { sliceHeight: .2 } });
  assert.equal(prism.prisms.length, 1); // constant sections coalesce
  near(prism.prisms[0].minY, 42); near(prism.prisms[0].maxY, 44);
  parent.scale.x = -1;
  const mirrored = R.addMesh(mesh, 'wood');
  assert.equal(mirrored.tops.length, 1); near(mirrored.tops[0].top, 44);
});

test('Drape supports match the drawn sloping Float32 triangles, not resampled bilinear heights', () => {
  const { N, R, load } = setup(); load('drape.js');
  const out = { pos: [], nrm: [], idx: [] }, ring = [{ x: 0, z: 0 }, { x: 0, z: 8 }, { x: 8, z: 8 }, { x: 8, z: 0 }];
  const ground = (x, z) => 20 + .4 * x + .08 * x * z;
  N.Drape.polygon(ring, ground, (_x, _z, o) => Object.assign(o, { x: 0, y: 1, z: 0 }), .15, out);
  const pos = new Float32Array(out.pos), records = R.addTriangles(pos, out.idx);
  assert.ok(records.length > 1);
  for (let t = 0; t < out.idx.length; t += 3) {
    const ids = out.idx.slice(t, t + 3), x = ids.reduce((n, k) => n + pos[k * 3] / 3, 0), z = ids.reduce((n, k) => n + pos[k * 3 + 2] / 3, 0);
    const expected = ids.reduce((n, k) => n + pos[k * 3 + 1] / 3, 0);
    // Find a record sharing all source triangle corners; merged pairs keep all four.
    const r = records.find((r) => ids.every((k) => r.poly.some((p) => p.x === pos[k * 3] && p.z === pos[k * 3 + 2])));
    assert.ok(r); near(height(r, x, z), expected);
  }
});

test('landmark parts preserve holed passages, frame transforms and exact roofs', async () => {
  const T = await three;
  const { N, load } = setup({ THREE: T, Addons: {}, LANDMARK_SITES: {} });
  load('landmarks.js');
  const frame = { cx: 100, cz: 200, y: 30, cs: Math.cos(.4), sn: Math.sin(.4), ang: .4 };
  const P = N.createLandmarkParts({ frame });
  const mat = new T.MeshStandardMaterial();
  P.prism(mat, [[-4, -4], [4, -4], [4, 4], [-4, 4]], 9, 30, [[[-1, -1], [-1, 1], [1, 1], [1, -1]]]);
  P.box(mat, 0, 0, 6, 2, 1, 3, .2);
  const prism = N.ride.prisms[0]; near(prism.minY, 39); near(prism.maxY, 60);
  assert.equal(prism.holes.length, 1); assert.equal(N.ride.solids.length, 1);
  near(N.ride.solids[0].rotationY, -.2);
  const ray = new T.Ray(new T.Vector3(100, 100, 200), new T.Vector3(0, -1, 0));
  // The hole itself must not receive an invented support cap.
  for (const top of N.ride.tops) {
    const shape = top.poly;
    let inside = false;
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) if ((shape[i].z > ray.origin.z) !== (shape[j].z > ray.origin.z) && ray.origin.x < (shape[j].x - shape[i].x) * (ray.origin.z - shape[i].z) / (shape[j].z - shape[i].z) + shape[i].x) inside = !inside;
    assert.equal(inside, false, 'no roof support inside the drawn hole');
  }
});

test('ground builder registers actual pier slab and Drape lawn/kerb elevations, never the bay', async () => {
  const core = await three, T = { ...core, MeshStandardNodeMaterial: core.MeshStandardMaterial };
  const ground = (x, z) => 10 + .12 * x + .25 * z;
  const block = { poly: [{ x: 0, z: 0 }, { x: 0, z: 8 }, { x: 8, z: 8 }, { x: 8, z: 0 }], minX: 0, maxX: 8, minZ: 0, maxZ: 8, park: 1 };
  const pier = { ring: [{ x: 8, z: 0 }, { x: 8, z: -6 }, { x: 12, z: -6 }, { x: 12, z: 0 }] };
  const { N, load } = setup({ THREE: T, Addons: { mergeGeometries: (g) => { assert.equal(g.length, 1); return g[0]; } },
    BLOCKS: [block], WATERFRONT_PIERS: [pier], GEO: { box: { name: 'fixture' } }, CURB_H: .15,
    Terrain: { groundAt: ground, waterLevel: 0, normalAt: (_x, _z, o) => Object.assign(o, { x: 0, y: 1, z: 0 }) },
    buildTerrainMesh: () => new T.Group(),
    ...Object.fromEntries(['createWaterMaterial', 'createSidewalkMaterial', 'createCurbMaterial', 'createParkLawnMaterial'].map((n) => [n, () => new T.MeshStandardMaterial()])) });
  load('drape.js'); load('sf-ground.js');
  const city = N.buildSFGround(new T.Scene());
  assert.equal(city.colliders.length, 0); assert.equal(N.ride.prisms.length, 1);
  const slab = N.ride.prisms[0], top = N.ride.tops.find((t) => t.shore);
  near(top.top, Math.max(...pier.ring.map((p) => ground(p.x, p.z))) + .1);
  near(slab.minY, -.3); near(slab.maxY, top.top);
  assert.equal(top.layered, true); assert.equal(slab.outer.length, pier.ring.length);
  assert.ok(N.ride.tops.some((t) => t.surface === 'grass'));
  for (const t of N.ride.tops.filter((t) => !t.shore)) for (const p of t.poly) {
    near(height(t, p.x, p.z) - ground(p.x, p.z), t.surface === 'grass' ? .162 : .15, 2e-6);
  }
  assert.ok(N.ride.tops.every((t) => t.top > 10), 'no water-plane support');
});

test('tree cache contains only bounded lower trunk geometry and does not register prototype bodies', async () => {
  const T = await three, { N, load } = setup({ THREE: T }); load('trees.js');
  const geos = N.buildTreeGeometries(3, 0, [1, 1, 1, 1]);
  const profiles = geos[0].userData.rideTrunk;
  assert.equal(profiles.length, 2); near(profiles[0].minY, 0);
  assert.ok(profiles[1].maxY <= 3.2 && profiles[1].maxY > 2.5, 'short ficus trunk ends at its drawn leader, not an invented 3.2 m height');
  assert.ok(profiles.every((p) => p.outer.length >= 3 && p.outer.every((v) => Math.hypot(v.x, v.z) < .6)));
  assert.equal(N.ride.tops.length + N.ride.solids.length + N.ride.prisms.length, 0);
  for (const g of geos) g.dispose();
});

test('sidewalk scenes register individual props, leaving empty reservation space and the walking strip open', async () => {
  const core = await three, T = { ...core, MeshStandardNodeMaterial: core.MeshStandardMaterial };
  const mergeGeometries = (geos) => {
    const g = new T.BufferGeometry();
    for (const name of Object.keys(geos[0].attributes)) {
      const attrs = geos.map((p) => p.attributes[name]), array = new Float32Array(attrs.reduce((n, a) => n + a.array.length, 0));
      let offset = 0; for (const a of attrs) { array.set(a.array, offset); offset += a.array.length; }
      g.setAttribute(name, new T.BufferAttribute(array, attrs[0].itemSize));
    }
    return g;
  };
  const { N, load } = setup({ THREE: T, Addons: { mergeGeometries }, CURB_H: .15, Terrain: { groundAt: () => 20 } });
  load('world-collision.js'); load('sf-sidewalk-scenes.js');
  const network = { nodes: [], edges: [], onSidewalk: () => true, walkable: () => true };
  for (const [i, spec] of N.SIDEWALK_SCENES.entries()) {
    const n = { x: i * 200, z: 0, in: [], out: [] };
    const e = { name: spec.street, from: n, to: {}, len: 100, half: 4, sx: n.x, sz: 0, dx: 1, dz: 0, rx: 0, rz: 1 };
    n.out = [e, { name: spec.cross }]; network.nodes.push(n); network.edges.push(e);
  }
  const parent = new T.Group(), sites = N.buildSidewalkScenes(parent, network, [], []);
  assert.equal(sites.length, 3); assert.equal(parent.children.length, 3);
  assert.ok(N.ride.prisms.length > 30); assert.ok(N.ride.prisms.every((p) => p.maxY - p.minY < 1.2));
  const inside = (poly, p) => {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].z > p.z) !== (poly[j].z > p.z) && p.x < (poly[j].x - poly[i].x) * (p.z - poly[i].z) / (poly[j].z - poly[i].z) + poly[i].x) yes = !yes;
    return yes;
  };
  for (const site of sites) {
    const gap = N.sidewalkScenePoint(site, -.4, -.8), strip = N.sidewalkScenePoint(site, 0, 1.75);
    assert.equal(N.ride.prisms.some((p) => inside(p.outer, gap)), false, 'reserved but visibly empty gap remains empty');
    assert.equal(N.ride.prisms.some((p) => inside(p.outer, strip)), false, 'walking strip remains physically open');
    assert.equal(network.walkable(strip.x - .2, strip.x + .2, strip.z - .2, strip.z + .2), true);
  }
  console.info(`CPU scene fixture coverage: ${N.ride.tops.length} tops / ${N.ride.solids.length} boxes / ${N.ride.prisms.length} prisms`);
});
