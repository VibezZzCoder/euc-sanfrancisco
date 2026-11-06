// CPU-only terrain differential fixture. Historical source comes from Git, never a copied source fixture.
import fs from 'node:fs';
import vm from 'node:vm';
import { gitHistory } from './optional-source.mjs';
import * as THREE from '../../vendor/three/build/three.webgpu.js';

export { THREE };
export const root = new URL('../../', import.meta.url);
export const baselineRef = '2ff1a7c29702ee17266f18592d704cfcbdf8e23b';
export const read = path => fs.readFileSync(new URL(path, root), 'utf8');
export const history = gitHistory(root, baselineRef);
export const historical = path => history.read(path);
export const baselineSource = historical('js/terrain-mesh.js');
export const currentSource = read('js/terrain-mesh.js');

function evaluate(source, N, filename) {
  // Use the ordinary Node realm for all classic IIFEs, with explicit isolated window/console arguments.
  // Separate VM realms for grade and drawing inhibit cross-function optimisation of the hot carve lookup.
  // Contextified globals also materially distort math-heavy fixtures (see DRAPE_HARNESS_EVIDENCE).
  vm.compileFunction(source, ['window', 'console'], { filename })({ NYC: N }, { info() {} });
}

let cached;
export function world() {
  if (cached) return cached;
  const N = { THREE, DEBUG_ROADS: false,
    createRoadSurfaceMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    createMarbleAshlarMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
  for (const name of ['sf-geodata', 'city-config', 'terrain', 'road-network', 'sf-ride-geometry', 'grade-separation']) {
    evaluate(historical(`js/${name}.js`), N, `${name}.js`);
  }
  const b = fs.readFileSync(new URL('data/terrain-core.bin', root)), n = b.readUInt32LE(4);
  const header = JSON.parse(b.toString('utf8', 8, 8 + n));
  N.Terrain.load(header, new Uint16Array(b.buffer.slice(b.byteOffset + 8 + n, b.byteOffset + b.length)));
  const network = N.buildRoadNetwork(N.BLOCKS.map(block => ({ ...block, block })), []);
  const grade = N.buildGradeSeparation(new THREE.Group(), network);
  return cached = { terrain: N.Terrain, grade, network };
}

export function drawing(source, terrain, grade, { inspect = false, count = false } = {}) {
  let calls = 0;
  const N = { THREE, Terrain: terrain, GradeSeparation: grade, SHADOW_PROXY_LAYER: 3,
    DATA: { groundMask: { header: { w: 1, h: 1 }, mask: new Uint8Array([0]) } },
    createTerrainMaterial: () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
  if (count && grade) N.GradeSeparation = { ...grade, carveAt: (...args) => { calls++; return grade.carveAt(...args); } };
  if (inspect) source = source.replace('    group,\n    update,',
    '    _reuse: () => ({ heights, ranges: tiles.map(t => t.ranges) }),\n    group,\n    update,');
  evaluate(source, N, 'terrain-mesh.js');
  const scene = new THREE.Group(), mesh = N.buildTerrainMesh(scene);
  return { mesh, N, calls: () => calls, clearCalls: () => { calls = 0; } };
}

export function release({ mesh }) {
  mesh.dispose?.();
  const materials = new Set();
  mesh.group.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
  for (const m of materials) m.dispose();
  mesh.group.removeFromParent();
}

export function crop(terrain, cx, cz, width = 1024, depth = 1024) {
  const i0 = cx * 32, j0 = cz * 32, w = width / 2 + 1, h = depth / 2 + 1;
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    heights[j * w + i] = terrain.heights[(j0 + j) * terrain.w + i0 + i];
  }
  return { ...terrain, originX: terrain.originX + i0 * 2, originZ: terrain.originZ + j0 * 2, w, h, heights };
}

export function routes() {
  const { network } = world();
  const stockton = Array.from({ length: 13 }, (_, i) => {
    const d = i * 20.2, x = -444.56936973297985 + Math.sin(-2.9796452145077765) * d;
    const z = -173.9223466770852 + Math.cos(-2.9796452145077765) * d;
    return { rider: { x, y: 32, z }, camera: { x: x + .77, y: 34.1, z: z + 4.72 } };
  });
  const e = network.edges.find(e => e.bore?.kind === 'tunnel' && e.name === 'ROBERT C LEVY TUNL');
  const broadway = Array.from({ length: 13 }, (_, i) => {
    const s = i * 20.2, x = e.sx + e.dx * s, z = e.sz + e.dz * s;
    const y = network.edgeY(e, s);
    return { rider: { x, y, z }, camera: { x: x - e.dx * 5, y: y + 2, z: z - e.dz * 5 } };
  });
  // Actual inherited highway lane axis (not traffic, physics or complete traversal validation).
  const ramp = world().grade.highwayLanes.find(l => l.pts.length > 10);
  const p = ramp.pts[3], q = ramp.pts[4], length = Math.hypot(q.x - p.x, q.z - p.z);
  const highway = Array.from({ length: 13 }, (_, i) => {
    const x = p.x + (q.x - p.x) / length * i * 20.2, z = p.z + (q.z - p.z) / length * i * 20.2;
    return { rider: { x, y: p.y, z }, camera: { x: x + 5, y: p.y + 3, z: z + 5 } };
  });
  return { stockton, broadway, highway };
}
