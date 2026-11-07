// MIT, © 2026 VibezZzCoder. Retain ../LICENSE / ../NOTICE.md and geographic credits.
// Original gameplay adaptations, NOT surveyed replicas of the real SF skateparks.
// Jefferson / Pier 62 recipe provenance is recorded in sf-skatepark-geometry.js.
import * as THREE from 'three/webgpu';
import { SfTerrainSampler } from './sf-terrain-sampler.js';
import { placementDepartureClear } from './euc-recovery.js';
import { buildSkateparkFeatures, createSkateparkMaterial, createJeffersonRecipes, createPier62Recipes } from './sf-skatepark-geometry.js';

const jefferson = createJeffersonRecipes(), pier = createPier62Recipes();
// Width-only adaptations retain donor profile heights and longitudinal runs.
function centred(recipe, width) {
  const r = structuredClone(recipe);
  if (r.kind === 'profile') {
    const mid = (r.points[0][0] + r.points.at(-1)[0]) / 2;
    r.points = r.points.map(([s, h]) => [s - mid, h]);
  } else if (r.kind === 'pad') {
    const mid = (r.s0 + r.s1) / 2; r.s0 -= mid; r.s1 -= mid;
  } else {
    r.points = r.points.map(([u, s, h]) => [u, s - 2, h]);
    r.posts = r.posts.map(p => ({ ...p, s: p.s - 2 }));
  }
  if (r.kind !== 'rail') { r.u0 = -width / 2; r.u1 = width / 2; }
  return r;
}
const quarterPoints = pier.quarter.points, lip = quarterPoints.at(-1);
const quarterReturn = centred({ ...pier.quarter, id: 'quarter-return',
  // The open deck has its actual 3.3m LENGTH; the factory's s1 is an endpoint.
  points: [...quarterPoints, [lip[0] + 3.3, lip[1]], [lip[0] + 3.3 + 4.8, 0]] }, 8);
// Two opposing donor curved quarters on ONE measured plane. Flat bottom and lip
// decks remain ordinary support; only sloped facets gain transition capability.
// Outside banks provide a ride-in/ride-out option without closing either side.
function halfPipe(quarter, width, length, deck = 2) {
  const q = quarter.points, [run, height] = q.at(-1), end = length / 2;
  const lip = end - height * 4 - deck, toe = lip - run;
  return { ...quarter, id: 'half-pipe', u0: -width / 2, u1: width / 2,
    points: [[-end, 0], [-lip - deck, height],
      ...q.slice().reverse().map(([s, h]) => [-toe - s, h]),
      ...q.map(([s, h]) => [toe + s, h]), [lip + deck, height], [end, 0]] };
}
const pad = (id, u, s, width, length, y, du, ds, recipe, routeU = 0) => ({
  id, u, s, width, length, plane: { y, du, ds }, features: Array.isArray(recipe) ? recipe : [recipe], routeU
});
const streetManual = centred(pier.manualPad, 3), streetLedge = centred(pier.ledge, 3);
streetManual.u0 -= 2.5; streetManual.u1 -= 2.5;
streetLedge.u0 += 2.5; streetLedge.u1 += 2.5;

/** Plain construction specs. Frozen measured planes are NAVD88, from committed
 * 2m triangular core + final Float32 curb facets / 8m regional support (2026-11-07).
 * They are local raised fits, not a whole-court lid or changed DEM. The builder
 * adds an 8mm finish to these pad planes and samples exact source support for aprons.
 * No runtime dependency on private studies, tests, imagery or geographic services.
 */
export const SF_SKATEPARKS = [
  { id: 'un-plaza', name: 'UN Skate Plaza', aliases: ['UN Plaza', 'United Nations Plaza', 'UN Skate Plaza'],
    adaptation: 'Linked Jefferson-inspired plaza lines and opposing curved quarters; original game layout, not a surveyed replica.',
    pin: { x: -1027.4, z: 972.4 }, frame: { x: -1065.663241132156, z: 978.3295600312498, theta: -1.415546279600968 },
    court: { width: 18, length: 104, spine: 4, apron: 1, cell: .5, edgeBlend: 1 },
    sourceHeight: { min: 13, max: 17, referenceY: 16 }, arrivalS: -47,
    pads: [
      pad('bank', -5.75, -40, 4.5, 8, 14.88740736837063, .000038100929966554716, .011932583390089214, centred(jefferson.northBank, 4)),
      pad('roller', -5.75, -26, 4.5, 8, 15.088222481504005, -.010032063339403567, .01582836093949806, centred(jefferson.rollerLow, 4)),
      pad('double-bank', -5.75, -12, 4.5, 8, 15.322991717061928, -.007167191583516186, .017131675143411178, centred(jefferson.doubleBank, 4)),
      pad('half-pipe', -5.75, 8, 4.5, 26, 15.644829419130179, -.0027002011127223308, .014830081984454662, halfPipe(jefferson.quarter, 4, 26), 2.7),
      pad('return-bank', -5.75, 34, 4.5, 8, 16.01321701547723, -.0017367740075427843, .01469884568988381, centred(jefferson.doubleBank, 4)),
      pad('manual', 5.75, -40, 4.5, 8, 14.895204470907464, .0023270426377541556, .011429661810480118, centred(jefferson.manualPad, 3.5)),
      pad('rail', 5.75, -26, 4.5, 8, 15.196369398171464, .04804594265631592, .018408580896542192, centred(jefferson.flatRail), 1.1),
      pad('roller-high', 5.75, -12, 4.5, 8, 15.39764234028363, .03291032451645895, .014261647664938953, centred(jefferson.roller, 4)),
      pad('tabletop', 5.75, 4, 4.5, 8, 15.62910264510813, .02149738058057278, .014779808481998663, centred(pier.tabletop, 4)),
      pad('bench', 5.75, 18, 4.5, 8, 15.789401221323303, .005362863689959308, .012003965603163852, centred(jefferson.bench, 3.5), -2.4),
      pad('roller-return', 5.75, 34, 4.5, 8, 16.02538721456146, .006899652416460526, .01524767223278896, centred(jefferson.roller, 4))
    ] },
  { id: 'zion', name: 'Zion / Waller Street', aliases: ['Zion', 'Waller', 'Waller Street', 'Zion Skate Plaza'],
    adaptation: 'Broad Pier 62-inspired flow and half-pipe on grass beside Waller; original game layout, not a surveyed replica.',
    pin: { x: -4598.4, z: 2275.5 }, frame: { x: -4583.350790759186, z: 2237.20481360241, theta: -1.4924571485356748 },
    court: { width: 38, length: 76, spine: 8, apron: 2, cell: .5, edgeBlend: 1 },
    sourceHeight: { min: 78, max: 86, referenceY: 84 }, arrivalS: -33,
    access: { u0: 19, u1: 32, s: -33, width: 4, roadU: 38, endU: 0 },
    pads: [
      pad('roller-low', -11, -25, 9, 12, 83.02292121965192, .025008068187786288, .058998426241010635, centred(pier.rollerLow, 8)),
      pad('tabletop', -11, -8, 9, 12, 83.8786305514197, .02893148612395616, .021164387280112426, centred(pier.tabletop, 8)),
      pad('roller', -11, 9, 9, 12, 83.71583942451787, .09525730722813797, -.038122578941577695, centred(pier.roller, 8)),
      pad('far-bank', -11, 26, 9, 12, 83.14025400098278, .1763225602239014, -.01129376551075658, centred(pier.farBank, 8)),
      pad('manual', 11, -25, 9, 12, 83.28091773557406, -.006446481148482919, .06015264654492035,
        [streetManual, streetLedge, centred(jefferson.flatRail)], -2.5),
      pad('half-pipe', 11, 1, 9, 32, 84.0185300562033, -.014240226178310559, .01039125716932917, halfPipe(pier.returnQuarter, 8, 32), -4.8),
      pad('quarter', 11, 28, 9, 12, 84.45230821166348, -.04082339030647846, -.002728039283790897, quarterReturn, -4.8)
    ] }
];

const FINISH = .008;

// Grass-side relocation retains ALL Waller/adjoining paint and original UV phase.
// Keep the existing host callback compatible; there is no road cut at either site.
export function skateparkPaintIntervals(_ax, _az, _dx, _dz, start, end) { return [[start, end]]; }
const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const at = (frame, u, s) => ({ x: frame.x + Math.cos(frame.theta) * u + Math.sin(frame.theta) * s,
  z: frame.z - Math.sin(frame.theta) * u + Math.cos(frame.theta) * s });
const rectangle = (f, w, l) => [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([u, s]) => at(f, u * w / 2, s * l / 2));
function bounds(poly) {
  return { minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)),
    minZ: Math.min(...poly.map(p => p.z)), maxZ: Math.max(...poly.map(p => p.z)) };
}

// One registry scan, BEFORE any park is registered. Never index the world's raw
// tops/bodies again: only low, UN-local curb/lawn replacement facets contribute.
// A low furniture cap is an obstacle, never a reason to raise the pavement to it.
function sourceSnapshot(city) {
  const un = SF_SKATEPARKS[0], box = bounds(rectangle(un.frame, un.court.width + 2, un.court.length + 2)), tops = [];
  for (const top of city.ride.tops) {
    if (top.replacesTerrain !== true || !(top.top >= un.sourceHeight.min && top.top <= un.sourceHeight.max) || !top.poly?.length) continue;
    const b = bounds(top.poly);
    if (b.minX <= box.maxX && b.maxX >= box.minX && b.minZ <= box.maxZ && b.maxZ >= box.minZ) tops.push(top);
  }
  return new SfTerrainSampler({ city: null, ride: null, grade: null, terrain: city.Terrain, data: city.DATA,
    tops, boxes: [], prisms: [], colliders: [], topViewCacheSize: 0 });
}

const cross = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
function local(frame, p) {
  const x = p.x - frame.x, z = p.z - frame.z, c = Math.cos(frame.theta), s = Math.sin(frame.theta);
  return { u: c * x - s * z, s: s * x + c * z };
}
function split(poly, a, b) {
  const d = poly.map(p => cross(a, b, p)), length = Math.hypot(b.x - a.x, b.z - a.z), epsilon = length * 1e-8;
  if (!d.some(n => n > epsilon) || !d.some(n => n < -epsilon)) return [poly];
  const sides = [[], []];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, p = poly[i], q = poly[j];
    if (d[i] >= 0) sides[0].push(p);
    if (d[i] <= 0) sides[1].push(p);
    if (d[i] * d[j] < 0) {
      const t = d[i] / (d[i] - d[j]), r = { x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) };
      sides[0].push(r); sides[1].push(r);
    }
  }
  return sides.filter(p => p.length >= 3);
}

// Construction-only cell-local breaklines. A rotated regular grid alone bridges
// source facet crests (including Drape's diagonals) and can bury an apron. Split
// its <=.5m cells at actual native field/top edges before sampling final vertices.
// This is a tiny local index, never a second full-world support/body index.
function sourceBreaks(spec, source) {
  const { frame, court } = spec, { width, length, cell } = court, nu = width / cell, ns = length / cell;
  const cells = Array.from({ length: nu * ns }, () => []), seen = new Set(), box = bounds(rectangle(frame, width, length));
  let count = 0;
  const edge = (a, b) => {
    if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX || Math.max(a.z, b.z) < box.minZ || Math.min(a.z, b.z) > box.maxZ) return;
    const ka = `${a.x},${a.z}`, kb = `${b.x},${b.z}`, key = ka < kb ? ka + ':' + kb : kb + ':' + ka;
    if (seen.has(key)) return; seen.add(key);
    const p = local(frame, a), q = local(frame, b);
    const i0 = Math.max(0, Math.floor((Math.min(p.u, q.u) + width / 2) / cell)), i1 = Math.min(nu - 1, Math.floor((Math.max(p.u, q.u) + width / 2) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(p.s, q.s) + length / 2) / cell)), j1 = Math.min(ns - 1, Math.floor((Math.max(p.s, q.s) + length / 2) / cell));
    if (i0 > i1 || j0 > j1) return;
    const line = [a, b]; count++;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[i * ns + j].push(line);
  };
  for (const f of source.fields) {
    const i0 = Math.max(0, Math.floor((box.minX - f.x0) / f.step)), i1 = Math.min(f.nx - 2, Math.floor((box.maxX - f.x0) / f.step));
    const j0 = Math.max(0, Math.floor((box.minZ - f.z0) / f.step)), j1 = Math.min(f.nz - 2, Math.floor((box.maxZ - f.z0) / f.step));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = { x: f.x0 + i * f.step, z: f.z0 + j * f.step }, b = { x: a.x + f.step, z: a.z }, c = { x: a.x, z: a.z + f.step }, d = { x: b.x, z: c.z };
      for (const [p, q] of [[a, b], [a, c], [b, c], [b, d], [c, d]]) edge(p, q);
    }
  }
  for (let id = 0; id < source.topStore.length; id++) {
    const poly = source.topStore.get(id).poly;
    for (let i = 0; i < poly.length; i++) edge(poly[i], poly[(i + 1) % poly.length]);
  }
  return { cells, count };
}

function buildFloor(spec, source) {
  const { frame, court, pads } = spec, { width, length, cell, apron } = court;
  const nu = Math.round(width / cell), ns = Math.round(length / cell), positions = [], indices = [], vertices = new Map(), probe = { normal: {} };
  const breaks = sourceBreaks(spec, source);
  let minLift = Infinity, maxLift = -Infinity, sourceMinY = Infinity, sourceMaxY = -Infinity;
  const vertex = point => {
    // Query at the FINAL drawn XZ, not a double coordinate subsequently rounded
    // onto the other side of a source facet/curb boundary.
    const p = { x: Math.fround(point.x), z: Math.fround(point.z) }, key = `${p.x},${p.z}`;
    if (vertices.has(key)) return vertices.get(key);
    const { u, s } = local(frame, p);
    source.sampleGround(p.x, p.z, probe, spec.sourceHeight.referenceY);
    const h = probe.height;
    if (!Number.isFinite(h) || !probe.registered || probe.water || probe.offCourse) throw new Error('Missing dry skatepark source floor: ' + spec.id);
    const edge = smooth(Math.min(width / 2 - Math.abs(u), length / 2 - Math.abs(s)) / court.edgeBlend);
    let y = h + FINISH * edge;
    for (const pad of pads) {
      const a = Math.abs(u - pad.u) - pad.width / 2, b = Math.abs(s - pad.s) - pad.length / 2;
      const weight = smooth(1 - Math.max(0, a) / apron) * smooth(1 - Math.max(0, b) / apron);
      if (!weight) continue;
      const plane = pad.plane, floor = plane.y + FINISH + plane.du * (u - pad.u) + plane.ds * (s - pad.s);
      if (a <= 0 && b <= 0 && floor < h + .005) throw new Error('Skatepark pad fit is buried: ' + spec.id + '/' + pad.id);
      y = Math.max(y, y + (floor - y) * weight);
    }
    y = Math.fround(y);
    const id = positions.length / 3; positions.push(p.x, y, p.z); vertices.set(key, id);
    const lift = y - h;
    minLift = Math.min(minLift, lift); maxLift = Math.max(maxLift, lift);
    sourceMinY = Math.min(sourceMinY, h); sourceMaxY = Math.max(sourceMaxY, h);
    return id;
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < ns; j++) {
    const u = -width / 2 + i * cell, s = -length / 2 + j * cell;
    const a = at(frame, u, s), b = at(frame, u, s + cell), c = at(frame, u + cell, s), d = at(frame, u + cell, s + cell);
    let polys = [[a, b, c], [c, b, d]];
    for (const [p, q] of breaks.cells[i * ns + j]) polys = polys.flatMap(poly => split(poly, p, q));
    for (const poly of polys) {
      const ids = poly.map(vertex);
      for (let k = 1; k + 1 < ids.length; k++) {
        const [a, b, c] = [ids[0], ids[k], ids[k + 1]], p = id => ({ x: positions[id * 3], z: positions[id * 3 + 2] });
        if (cross(p(a), p(b), p(c)) < -1e-9) indices.push(a, b, c);
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), stats: { cell, sourceBreaklines: breaks.count,
    vertices: positions.length / 3, triangles: indices.length / 3,
    minLift, maxLift, sourceMinY, sourceMaxY, finish: FINISH } };
}

/** Build once after final curb/grade construction, with Terrain.patchesEnabled
 * restored, BEFORE the authoritative sampler / releaseConstructionRegistry.
 * Returns/publishes JSON-sized site metadata only. Meshes belong to scene traversal
 * teardown; no local sampler, source floor graph, raw tops or scene alias escapes.
 * Arrivals are locally static-checked proposals. The host must re-admit against its
 * authoritative static + dynamic world on use (no unbounded/highest-roof fallback).
 */
export function buildSFSkateparks(scene, city = window.NYC) {
  if (!scene?.add || !city?.RideGeometry?.addTriangles || !Array.isArray(city.ride?.tops) || !city.Terrain || !city.DATA) {
    throw new TypeError('SF skateparks require final terrain/data and an open RideGeometry registry');
  }
  if (city.Terrain.patchesEnabled === false || Object.isFrozen(city.ride.tops)) throw new Error('SF skateparks must precede authoritative sampler construction, after terrain patches restore');
  if (city.SF_SKATEPARKS) throw new Error('SF skateparks already constructed');
  const source = sourceSnapshot(city);
  // Snapshot BOTH sites completely before publishing even the first floor.
  const floors = SF_SKATEPARKS.map(spec => buildFloor(spec, source));
  const accesses = SF_SKATEPARKS.map(spec => {
    if (!spec.access) return null;
    const a = spec.access, frame = { ...at(spec.frame, (a.u0 + a.u1) / 2, a.s), theta: spec.frame.theta + Math.PI / 2 };
    const court = { ...spec.court, width: a.width, length: a.u1 - a.u0 };
    return { frame, court, floor: buildFloor({ ...spec, frame, court, pads: [] }, source) };
  });
  const topStart = city.ride.tops.length, boxStart = city.ride.solids.length, prismStart = city.ride.prisms.length;
  const metadata = SF_SKATEPARKS.map((spec, index) => {
    const floor = floors[index], group = new THREE.Group(); group.name = 'SFSkatepark:' + spec.id;
    // Judged in SF's bright daylight pipeline: keep the court darker than the
    // concrete riding faces so low banks/rollers remain legible at gameplay scale.
    const material = createSkateparkMaterial('court');
    const addFloor = (floor, suffix) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(floor.positions, 3)); geometry.setIndex(new THREE.BufferAttribute(floor.indices, 1));
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material); mesh.name = 'sfSkatepark.' + suffix + ':' + spec.id; mesh.receiveShadow = true; group.add(mesh);
      city.RideGeometry.addTriangles(floor.positions, floor.indices, 'pavement', { merge: false, layered: true,
        source: 'skatepark:' + spec.id + ':' + suffix, capabilities: { feature: spec.id + ':' + suffix, restartsAtRest: true } });
    };
    addFloor(floor, 'floor');
    const access = accesses[index];
    if (access) addFloor(access.floor, 'access');
    const features = [], pads = [], routes = [], featureRoutes = [];
    let topTriangles = floor.stats.triangles + (access?.floor.stats.triangles ?? 0), bodies = 0, meshes = access ? 2 : 1;
    for (const p of spec.pads) {
      const centre = at(spec.frame, p.u, p.s), plane = { ...p.plane, y: p.plane.y + FINISH };
      const featureFrame = { id: spec.id + '-' + p.id, ...centre, theta: spec.frame.theta, ...plane, features: p.features };
      const built = buildSkateparkFeatures(group, featureFrame, city);
      features.push(...built.features.map(f => ({ ...f, pad: p.id })));
      topTriangles += built.counts.topTriangles; bodies += built.counts.bodies; meshes += built.counts.meshes;
      pads.push({ id: p.id, u: p.u, s: p.s, width: p.width, length: p.length, plane, frame: { ...centre, theta: spec.frame.theta } });
      routes.push({ id: p.id + ':through', pad: p.id, frame: { ...centre, theta: spec.frame.theta }, u: p.routeU,
        start: -p.length / 2 - spec.court.apron, end: p.length / 2 + spec.court.apron,
        intent: p.id === 'manual' || !p.routeU ? 'native feature line' : 'clear pad-side return; feature remains physical', targetSpeed: 2.5 });
      for (const [recipeIndex, recipe] of p.features.entries()) {
        const route = { pad: p.id, feature: built.features[recipeIndex].feature,
          frame: { ...centre, theta: spec.frame.theta }, u: recipe.kind === 'rail' ? 0 : (recipe.u0 + recipe.u1) / 2 };
        if (recipe.id === 'half-pipe') {
          const points = recipe.points, lip = points[2][0], toe = points.find(([s, h]) => s > lip && h === 0)[0];
          featureRoutes.push({ ...route, id: 'half-pipe:shuttle', start: 0, end: -lip,
            intent: 'opposing curved transitions; continuous native back/forth ride', targetSpeed: 4,
            flatHalfLength: Math.abs(toe), lipS: [-Math.abs(lip), Math.abs(lip)], lipHeight: points[1][1] });
        } else if (recipe.id === 'quarter-return') {
          // Leave a true run-up for the 1.2m departure certificate AND the default
          // rider hull/margin. The former +1.5m point stood clear but failed preflight.
          const points = recipe.points, mid = (points.at(-3)[0] + points.at(-2)[0]) / 2, end = points.at(-1)[0] + 3;
          featureRoutes.push({ ...route, id: 'quarter:bank-to-deck', start: end, end: mid, throttle: .42, intent: 'native bank access to open lip deck' },
            { ...route, id: 'quarter:deck-return', start: mid, end, throttle: .22, intent: 'native open-deck bank return' });
        } else if (recipe.kind === 'rail' || recipe.id === 'ledge' || recipe.id === 'bench') {
          const crossingCentre = at(featureFrame, route.u, 0);
          featureRoutes.push({ ...route, id: p.id + ':' + recipe.id + ':across', frame: { ...crossingCentre, theta: spec.frame.theta + Math.PI / 2 }, u: 0,
            start: -4, end: 4, intent: 'physical stop without hop; charged-hop route needs separate validation' });
        } else featureRoutes.push({ ...route, id: p.id + ':feature', start: -p.length / 2 - spec.court.apron,
          end: p.length / 2 + spec.court.apron, targetSpeed: 2.5, intent: 'native feature traverse, both directions' });
      }
    }
    scene.add(group);
    return { id: spec.id, name: spec.name, aliases: [...spec.aliases], adaptation: spec.adaptation, pin: { ...spec.pin }, frame: { ...spec.frame },
      court: { ...spec.court, polygon: rectangle(spec.frame, spec.court.width, spec.court.length) }, pads, features,
      featureSummary: { count: features.length, topTriangles, bodies, meshes }, floor: floor.stats, arrival: null, routes, featureRoutes,
      access: access ? { frame: access.frame, polygon: rectangle(access.frame, access.court.width, access.court.length), floor: access.floor.stats,
        route: { frame: { ...at(spec.frame, 0, spec.access.s), theta: spec.frame.theta + Math.PI / 2 }, u: 0,
          start: spec.access.roadU, end: spec.access.endU, targetSpeed: 3, intent: 'original Waller road to grass path to open court spine' } } : null };
  });
  // Local-only admission over the actual new Float32 floor/feature facets and
  // individual bodies, never over a duplicated city registry or an estimated plane.
  const arrivalSampler = new SfTerrainSampler({ city: null, ride: null, grade: null, terrain: city.Terrain, data: city.DATA,
    tops: city.ride.tops.slice(topStart), boxes: city.ride.solids.slice(boxStart), prisms: city.ride.prisms.slice(prismStart), colliders: [], topViewCacheSize: 0 });
  for (let i = 0; i < metadata.length; i++) {
    const spec = SF_SKATEPARKS[i], p = at(spec.frame, 0, spec.arrivalS), ground = { normal: {} };
    arrivalSampler.sampleGround(p.x, p.z, ground, spec.sourceHeight.referenceY);
    const target = arrivalSampler.findPlacementTarget({ ...p, headingY: spec.frame.theta, referenceY: ground.height, registeredSurfaceOnly: true });
    if (!target || !ground.support?.source?.endsWith(spec.id + ':floor') || !placementDepartureClear(arrivalSampler, target, { departure: 1.2, registeredSurfaceOnly: true })) {
      throw new Error('No checked skatepark spine arrival: ' + spec.id);
    }
    metadata[i].arrival = { ...target, heading: target.headingY, referenceY: target.y, registeredSurfaceOnly: true, departure: 1.2,
      exact: true,
      checked: 'local-static; host must recheck authoritative/dynamic admission' };
  }
  city.SF_SKATEPARKS = metadata;
  return metadata;
}
