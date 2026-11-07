// MIT, © 2026 VibezZzCoder. City derivations retain ../LICENSE and ../NOTICE.md (Mr.doob / Kamil).
// Adapted from NYC ae413432045d1bca53afbb955c930803b5cd3ad6:
// js/city-grid.js::skateProfile / pier62Section / pier62Extension, SHA-256
// 234273528f09b04fc4bcffa942dcf0d38aa2a46551ea0ed8387a61286326e47c
// js/jefferson-skatepark.js, SHA-256
// d257e9de6309b3b2ffd01df9a23fed4c93c34cc9df7dbc58a63736b1c9493327
import * as THREE from 'three/webgpu';
import { color, dot, floor, fract, mix, mod, positionWorld, sin, vec2 } from 'three/tsl';

// NYC's corrected skate palette and low-frequency concrete grain, from the same
// city-grid.js donor credited above. Keep sRGB colours in color() so the shared
// scene-linear lighting / ACES pipeline converts them once, on both backends.
export function createSkateparkMaterial(kind) {
  const palette = {
    concrete: [0x8b8576, 0x9d9687, .9, 0, .3, .35],
    slate: [0x8b8576, 0x9d9687, .9, 0, .3, .35],
    court: [0x354b58, 0x425864, .92, 0, .25, .45],
    sides: [0x1e3451, 0x263e5a, .85, 0, .1, .3],
    metal: [0x252c2a, 0x252c2a, .4, .65, 0, 0]
  };
  const [a, b, roughness, metalness, bias, amount] = palette[kind];
  const material = new THREE.MeshStandardNodeMaterial({ roughness, metalness });
  if (amount) {
    const p = positionWorld.xz.mul(1.3), i = floor(p), f = fract(p);
    const w = f.mul(f).mul(f.mul(-2).add(3));
    const hash = p => fract(sin(dot(mod(p, 211), vec2(127.1, 311.7))).mul(43758.5453));
    const grain = mix(mix(hash(i), hash(i.add(vec2(1, 0))), w.x),
      mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), w.x), w.y);
    material.colorNode = mix(color(a), color(b), grain.mul(amount).add(bias));
  } else material.color.setHex(a);
  material.name = 'sfSkatepark.' + kind;
  return material;
}

/**
 * Construction-only feature kit; no site placement, floor, terrain edits or update loop.
 *
 * site = { id, x, z, theta, y, du=0, ds=0, features: [recipe, ...] }
 *   world = [x + u*cos(theta) + s*sin(theta),
 *            y + du*u + ds*s + height, z - u*sin(theta) + s*cos(theta)].
 *   y/du/ds describe the parent's actual-site floor plane, not a replacement floor.
 *
 * Recipes (metres, radians; IDs must be unique within a site):
 *   profile: {id, kind:'profile', u0, u1, points:[[s,height],...], base=0,
 *             smooth=false, material='concrete'}; strictly increasing s, height>=base.
 *   pad:     {id, kind:'pad', u0, u1, s0, s1, height, base=0, material='slate'}.
 *   rail:    {id, kind:'rail', points:[[u,s,height],...], width=.08, thickness=.08,
 *             posts:[{u,s,height,base=0,size=.08},...]}; height is BAR TOP / POST TOP.
 * Rails are thin, square-ended, vertically thick beams following the same tilted frame.
 * Each segment has its own actual top; only elevated bars are wheelSweep-tagged, never posts.
 * material selects concrete/slate tops; sides are muted blue, rails/posts are metal.
 *
 * Registry contract (parent owns its implementation and sampler forwarding):
 *   city.RideGeometry.addTriangles(Float32Array, null, 'pavement',
 *     {merge:false, layered:true, source, capabilities:{feature,restartsAtRest:true,
 *       transition:'slope'}}) // transition ONLY on locally sloping profile segments
 *   city.RideGeometry.addPrism(worldXZPolygon, minY, maxY,
 *     {support:false, layered:true, source}) // profiles/pads/posts, never shell-tagged
 *   city.RideGeometry.addBox(centre, halfExtents, rotationY,
 *     {support:false, layered:true, source, wheelSweep:true}) // elevated BAR bodies ONLY
 * Bar boxes use the beam's oriented XZ frame, strictly inscribed in its drawn Float32
 * footprint and top/base facets. Their roofs/bases vary by less than half bar thickness
 * per cell, also bounded by 6 cm roof / 3 cm base variation. Shell expansion belongs
 * exclusively to the sampler's separate wheel query, never to these ordinary bodies.
 * No horizontal body roof is registered as support. The exact Float32 drawing owns it.
 *
 * Return: {group:THREE.Group|null, features:[{id,feature,kind,footprints:[worldXZPolygon],
 *   minY,maxY}], floorEnvelope:null|{polygons:[worldXZPolygon],plane:{x,y,z,dx,dz},minY,maxY},
 *   counts:{topTriangles,bodies,meshes}}. footprints reserve actual individual features;
 * the floor envelope is metadata, never a body or support. Hosts dispose group resources
 * by ordinary scene traversal. No scratch geometries, material caches or scene references
 * survive construction outside the returned group; an empty site adds nothing.
 */
export function buildSkateparkFeatures(scene, site, city = window.NYC) {
  const recipes = validateSite(site);
  const result = { group: null, features: [], floorEnvelope: null, counts: { topTriangles: 0, bodies: 0, meshes: 0 } };
  if (!recipes.length) return result;
  if (!scene?.add || !city?.RideGeometry?.addTriangles || !city.RideGeometry.addPrism || !city.RideGeometry.addBox) {
    throw new TypeError('Skatepark features require a scene and RideGeometry.addTriangles/addPrism/addBox');
  }
  const cs = Math.cos(site.theta), sn = Math.sin(site.theta), du = site.du ?? 0, ds = site.ds ?? 0;
  // Round ONCE into the same absolute-world Float32 coordinates used for drawing/support.
  const at = (u, s, h) => [Math.fround(site.x + u * cs + s * sn),
    Math.fround(site.y + du * u + ds * s + h), Math.fround(site.z - u * sn + s * cs)];
  // Inverse-transpose of the floor shear, followed by yaw; NYC's averaged profile slopes
  // retain their smooth endpoint normals without smoothing physical support facets.
  const normal = m => {
    const nu = -du, ns = -ds - m, k = 1 / Math.hypot(nu, 1, ns);
    return [(nu * cs + ns * sn) * k, k, (-nu * sn + ns * cs) * k];
  };
  const batches = Object.fromEntries(['concrete', 'slate', 'sides', 'metal'].map(k => [k, { positions: [], normals: [] }]));
  const tops = [], bodies = [];
  const addTriangle = (batch, a, b, c, normals) => {
    const face = faceNormal(a, b, c);
    if (!face) return; // zero-height end walls must not leave zero normals in the batch
    batch.positions.push(...a, ...b, ...c);
    batch.normals.push(...(normals || [face, face, face]).flat());
  };
  const quad = (batch, q, normals) => {
    addTriangle(batch, q[0], q[1], q[2], normals && [normals[0], normals[1], normals[2]]);
    addTriangle(batch, q[0], q[2], q[3], normals && [normals[0], normals[2], normals[3]]);
  };
  const finishSolid = (q, base, material, capabilities, source, wheelSweep = false, smoothNormals, ends = [true, true]) => {
    // The only support input is the two actual drawn top triangles. Never register walls.
    const positions = new Float32Array([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]]);
    if (!(faceNormal(q[0], q[1], q[2])?.[1] > 0) || !(faceNormal(q[0], q[2], q[3])?.[1] > 0)) {
      throw new RangeError('Skatepark feature is smaller than world Float32 precision');
    }
    tops.push({ positions, options: { merge: false, layered: true, source, capabilities } });
    quad(batches[material], q, smoothNormals);
    // Winding is outward; sides/bottom never duplicate the top surface.
    for (let i = 0; i < 4; i++) {
      if ((i === 1 && !ends[1]) || (i === 3 && !ends[0])) continue;
      const j = (i + 1) % 4;
      quad(batches[material === 'metal' ? 'metal' : 'sides'], [q[i], base[i], base[j], q[j]]);
    }
    // Reverse winding while retaining the top's 0--2 diagonal; Float32 rounding can
    // make the two possible triangulations of a tilted base microscopically different.
    if (q.some((p, i) => p[1] > base[i][1])) quad(batches[material === 'metal' ? 'metal' : 'sides'], [base[2], base[1], base[0], base[3]]);
    const options = { support: false, layered: true, source };
    if (wheelSweep) inscribedRailBoxes(q, base, bodies, { ...options, wheelSweep: true });
    else inscribedBodies(q, base, bodies, options);
  };
  for (const r of recipes) {
    const feature = site.id + '-' + r.id, rest = { feature, restartsAtRest: true };
    const info = { id: r.id, feature, kind: r.kind, footprints: [], minY: Infinity, maxY: -Infinity };
    const reserve = (q, base) => {
      info.footprints.push(q.map(p => ({ x: p[0], z: p[2] })));
      for (const p of [...q, ...base]) { info.minY = Math.min(info.minY, p[1]); info.maxY = Math.max(info.maxY, p[1]); }
    };
    const source = 'skatepark:' + feature;
    if (r.kind !== 'rail') {
      const points = r.kind === 'pad' ? [[r.s0, r.height], [r.s1, r.height]] : r.points;
      const baseHeight = r.base ?? 0, slope = i => (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]);
      for (let i = 0; i + 1 < points.length; i++) {
        const [s0, h0] = points[i], [s1, h1] = points[i + 1];
        // A base-height bridge has no volume: the site's court already draws and
        // supports it. Skip BOTH drawing and registration to avoid coplanar faces.
        // Keep profile points/bounds and adjacent slope normals unchanged.
        if (h0 === baseHeight && h1 === baseHeight) continue;
        const q = [at(r.u0, s0, h0), at(r.u0, s1, h1), at(r.u1, s1, h1), at(r.u1, s0, h0)];
        const base = [at(r.u0, s0, baseHeight), at(r.u0, s1, baseHeight), at(r.u1, s1, baseHeight), at(r.u1, s0, baseHeight)];
        const m = slope(i), n0 = normal(r.smooth && i ? (slope(i - 1) + m) / 2 : m);
        const n1 = normal(r.smooth && i + 2 < points.length ? (m + slope(i + 1)) / 2 : m);
        finishSolid(q, base, r.material ?? (r.kind === 'pad' ? 'slate' : 'concrete'),
          m === 0 ? rest : { ...rest, transition: 'slope' }, source, false, [n0, n1, n1, n0], [i === 0, i + 2 === points.length]);
      }
      reserve([at(r.u0, points[0][0], points[0][1]), at(r.u0, points.at(-1)[0], points.at(-1)[1]),
        at(r.u1, points.at(-1)[0], points.at(-1)[1]), at(r.u1, points[0][0], points[0][1])],
      [at(r.u0, points[0][0], baseHeight), at(r.u0, points.at(-1)[0], baseHeight),
        at(r.u1, points.at(-1)[0], baseHeight), at(r.u1, points[0][0], baseHeight)]);
      // Bounds include intermediate crests, not just a profile's zero-height endpoints.
      for (const [s, h] of points) for (const u of [r.u0, r.u1]) {
        const y = at(u, s, h)[1]; info.minY = Math.min(info.minY, y); info.maxY = Math.max(info.maxY, y);
      }
      // Intermediate Float32 edge rounding can extend microscopically beyond the
      // endpoint rectangle; reserve the actual small feature hull, never a whole court.
      info.footprints[0] = convexHull(points.flatMap(([s, h]) => [xz(at(r.u0, s, h)), xz(at(r.u1, s, h))]));
    } else {
      const width = r.width ?? .08, thickness = r.thickness ?? .08;
      for (let i = 0; i + 1 < r.points.length; i++) {
        const [u0, s0, h0] = r.points[i], [u1, s1, h1] = r.points[i + 1];
        const length = Math.hypot(u1 - u0, s1 - s0), pu = -(s1 - s0) / length * width / 2, ps = (u1 - u0) / length * width / 2;
        const corners = [[u0 + pu, s0 + ps, h0], [u1 + pu, s1 + ps, h1],
          [u1 - pu, s1 - ps, h1], [u0 - pu, s0 - ps, h0]];
        const q = corners.map(([u, s, h]) => at(u, s, h)), base = corners.map(([u, s, h]) => at(u, s, h - thickness));
        finishSolid(q, base, 'metal', rest, source + ':bar', corners.every(p => p[2] > thickness));
        reserve(q, base);
      }
      for (const post of r.posts || []) {
        const { u, s, height } = post, half = (post.size ?? width) / 2;
        const corners = [[u - half, s - half], [u - half, s + half], [u + half, s + half], [u + half, s - half]];
        const q = corners.map(([u, s]) => at(u, s, height)), base = corners.map(([u, s]) => at(u, s, post.base ?? 0));
        finishSolid(q, base, 'metal', rest, source + ':post');
        reserve(q, base);
      }
    }
    result.features.push(info);
  }
  // Batch directly into final buffers: no temporary geometries or addon/vendor changes.
  const group = new THREE.Group(); group.name = 'SFSkateparkFeatures:' + site.id;
  for (const [name, batch] of Object.entries(batches)) if (batch.positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = createSkateparkMaterial(name);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'sfSkatepark.' + name;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const { positions, options } of tops) city.RideGeometry.addTriangles(positions, null, 'pavement', options);
  for (const body of bodies) {
    if (body.centre) city.RideGeometry.addBox(body.centre, body.halfExtents, body.rotationY, body.options);
    else city.RideGeometry.addPrism(body.outer, body.minY, body.maxY, body.options);
  }
  scene.add(group); result.group = group;
  const dx = du * cs + ds * sn, dz = -du * sn + ds * cs;
  const polygons = result.features.flatMap(f => f.footprints);
  const floorYs = polygons.flatMap(poly => poly.map(p => site.y + dx * (p.x - site.x) + dz * (p.z - site.z)));
  result.floorEnvelope = { polygons, plane: { x: site.x, y: site.y, z: site.z, dx, dz }, minY: Math.min(...floorYs), maxY: Math.max(...floorYs) };
  result.counts = { topTriangles: tops.length * 2, bodies: bodies.length, meshes: group.children.length };
  return result;
}

const cross = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const xz = p => ({ x: p[0], z: p[2] });
function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, length = Math.hypot(x, y, z);
  return length > 1e-12 ? [x / length, y / length, z / length] : null;
}
function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const half = list => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    out.pop(); return out;
  };
  return half(sorted).concat(half(sorted.slice().reverse()));
}
function plane(tri) {
  const [a, b, c] = tri, n = faceNormal(a, b, c);
  if (!n || n[1] <= 0) throw new RangeError('Skatepark top must have a nonzero upward area');
  return p => a[1] - (n[0] * (p.x - a[0]) + n[2] * (p.z - a[2])) / n[1];
}
function clipTriangle(poly, tri) {
  const sign = Math.sign(cross(tri[0], tri[1], tri[2]));
  for (let k = 0; k < 3 && poly.length; k++) {
    const a = tri[k], b = tri[(k + 1) % 3], out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], dp = sign * cross(a, b, p), dq = sign * cross(a, b, q);
      if (dp >= 0) out.push(p);
      if ((dp < 0) !== (dq < 0)) {
        const t = dp / (dp - dq); out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      }
    }
    poly = out;
  }
  return poly.filter((p, i) => Math.hypot(p.x - poly[(i + 1) % poly.length].x, p.z - poly[(i + 1) % poly.length].z) > 1e-9);
}
function inscribedBodies(q, base, bodies, options) {
  // Partition each actual Float32 facet in HEIGHT space, not a Cartesian u/s grid.
  // Floor contour stripes are clipped again by roof contours: both affine ranges
  // stay bounded even for nonparallel planes. Parallel tilted pads need only strips,
  // not the product of two unrelated axis counts. Never cross the drawn 0--2 diagonal.
  // Reserve slack for the existing inward Y guards; bars keep their separate OBB path.
  let cells = 0;
  for (const ids of [[0, 1, 2], [0, 2, 3]]) {
    const tri = ids.map(i => q[i]), roof = plane(tri), floor = plane(ids.map(i => base[i])), boundary = tri.map(xz);
    for (const strip of heightStripes(boundary, floor, .03 - 3e-7)) for (const outer of heightStripes(strip, roof, .06 - 3e-7)) {
      // Old cap was 32768 grid cells, each clipped into at most two facet bodies.
      if (++cells > 65536) throw new RangeError('Skatepark feature body subdivision exceeds 65536 facet cells');
      const minY = Math.max(...outer.map(floor)) + 1e-7, maxY = Math.min(...outer.map(roof)) - 1e-7;
      if (maxY > minY + 1e-6) bodies.push({ outer, minY, maxY, options });
    }
  }
}

function* heightStripes(poly, height, budget) {
  const heights = poly.map(height), lo = Math.min(...heights), hi = Math.max(...heights);
  const count = Math.max(1, Math.ceil((hi - lo) / budget));
  if (!Number.isFinite(count) || count > 65536) throw new RangeError('Skatepark feature height subdivision exceeds 65536 stripes');
  // Split the remaining convex polygon at successive shared contours. Sharing the
  // exact intersection objects avoids separately rounded seams between neighbours.
  for (let i = 1; i < count; i++) {
    const level = lo + (hi - lo) * i / count, below = [], above = [];
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j], q = poly[(j + 1) % poly.length], dp = height(p) - level, dq = height(q) - level;
      if (dp <= 0) below.push(p);
      if (dp >= 0) above.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq), cut = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
        below.push(cut); above.push(cut);
      }
    }
    if (bodyPolygonHasArea(below)) yield below;
    poly = above;
  }
  if (bodyPolygonHasArea(poly)) yield poly;
}

function bodyPolygonHasArea(poly) {
  return poly.length >= 3 && Math.abs(poly.reduce((sum, p, i) => sum + cross(poly[0], p, poly[(i + 1) % poly.length]), 0)) >= 1e-12;
}

function inscribedRailBoxes(q, base, bodies, options) {
  // The bar, not either triangle's AABB, defines this yawed rectangular frame.
  // Local z follows the endpoint midpoints; local x is its perpendicular across the bar.
  const start = [(q[0][0] + q[3][0]) / 2, (q[0][2] + q[3][2]) / 2];
  const end = [(q[1][0] + q[2][0]) / 2, (q[1][2] + q[2][2]) / 2];
  const dx = end[0] - start[0], dz = end[1] - start[1], rotationY = Math.atan2(dx, dz);
  const cs = Math.cos(rotationY), sn = Math.sin(rotationY), ox = (start[0] + end[0]) / 2, oz = (start[1] + end[1]) / 2;
  const local = q.map(p => ({ x: (p[0] - ox) * cs - (p[2] - oz) * sn, z: (p[0] - ox) * sn + (p[2] - oz) * cs }));
  // Float32 endpoint rounding can skew the ideal rectangle. Take the inward edge
  // extrema in its own beam frame, so no OBB corner protrudes beyond a drawn edge.
  // Only a double-arithmetic guard is needed; never add a world-space padding/shell.
  const guard = 1e-9;
  const x0 = Math.max(local[0].x, local[1].x) + guard, x1 = Math.min(local[2].x, local[3].x) - guard;
  const z0 = Math.max(local[0].z, local[3].z) + guard, z1 = Math.min(local[1].z, local[2].z) - guard;
  if (!(x1 > x0 && z1 > z0)) throw new RangeError('Skatepark bar is smaller than world Float32 precision');
  const at = (x, z) => ({ x: ox + x * cs + z * sn, z: oz - x * sn + z * cs });
  const facets = [[0, 1, 2], [0, 2, 3]].map(ids => ({ boundary: ids.map(i => xz(q[i])),
    roof: plane(ids.map(i => q[i])), base: plane(ids.map(i => base[i])) }));
  const thickness = Math.min(...q.map((p, i) => p[1] - base[i][1]));
  // Reserve slack below the strict half-thickness limit, including Float32 facet
  // kinks and the vertical arithmetic guard. Bound BOTH top and bottom variation.
  const roofBudget = .99 * Math.min(.06, thickness / 2), baseBudget = .99 * Math.min(.03, thickness / 2);
  const variation = key => [
    Math.max(...facets.map(f => Math.abs(f[key](at(x1, 0)) - f[key](at(x0, 0))))),
    Math.max(...facets.map(f => Math.abs(f[key](at(0, z1)) - f[key](at(0, z0)))))
  ];
  const topRange = variation('roof'), baseRange = variation('base');
  const split = (range, budget, axis) => Math.ceil(range[axis] / (budget / (range[1 - axis] > 1e-10 ? 2 : 1)));
  const nx = Math.max(1, split(topRange, roofBudget, 0), split(baseRange, baseBudget, 0));
  const nz = Math.max(1, split(topRange, roofBudget, 1), split(baseRange, baseBudget, 1));
  if (!Number.isFinite(nx * nz) || nx * nz > 32768) throw new RangeError('Skatepark bar subdivision exceeds 32768 cells');
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx;
    const za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
    const outer = [at(xa, za), at(xa, zb), at(xb, zb), at(xb, za)];
    let minY = -Infinity, maxY = Infinity;
    // Evaluate at corners AND intersections with the actual Float32 0--2 diagonal.
    // A whole oriented rectangle may cross that diagonal; its body stays a BOX.
    for (const f of facets) for (const p of clipTriangle(outer, f.boundary)) {
      minY = Math.max(minY, f.base(p)); maxY = Math.min(maxY, f.roof(p));
    }
    minY += 1e-7; maxY -= 1e-7;
    if (![minY, maxY].every(Number.isFinite) || !(maxY > minY)) throw new RangeError('Skatepark bar has no inscribed vertical thickness');
    const centre = { ...at((xa + xb) / 2, (za + zb) / 2), y: (minY + maxY) / 2 };
    bodies.push({ centre, halfExtents: { x: (xb - xa) / 2, y: (maxY - minY) / 2, z: (zb - za) / 2 }, rotationY, options });
  }
}

function validateSite(site) {
  const validId = id => typeof id === 'string' && id.length > 0;
  if (!site || !validId(site.id) || ![site.x, site.z, site.theta, site.y, site.du ?? 0, site.ds ?? 0].every(Number.isFinite) || !Array.isArray(site.features)) {
    throw new TypeError('Invalid skatepark site frame/features');
  }
  const ids = new Set();
  for (const r of site.features) {
    const fail = () => { throw new TypeError('Invalid skatepark recipe: ' + (r?.id ?? '(missing id)')); };
    if (!r || !validId(r.id) || ids.has(r.id)) fail();
    ids.add(r.id);
    if (r.kind === 'profile' || r.kind === 'pad') {
      if (![r.u0, r.u1, r.base ?? 0].every(Number.isFinite) || !(r.u1 > r.u0) || !['concrete', 'slate'].includes(r.material ?? 'concrete')) fail();
      const points = r.kind === 'profile' ? r.points : [[r.s0, r.height], [r.s1, r.height]];
      if (!Array.isArray(points) || points.length < 2 || !points.every((p, i) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[1] >= (r.base ?? 0) && (!i || p[0] > points[i - 1][0]))) fail();
    } else if (r.kind === 'rail') {
      if (![r.width ?? .08, r.thickness ?? .08].every(n => Number.isFinite(n) && n > 0) || !Array.isArray(r.points) || r.points.length < 2 ||
        !r.points.every((p, i) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) && p[2] >= (r.thickness ?? .08) &&
          (!i || Math.hypot(p[0] - r.points[i - 1][0], p[1] - r.points[i - 1][1]) > 1e-6))) fail();
      if (r.posts !== undefined && (!Array.isArray(r.posts) || !r.posts.every(p => p && [p.u, p.s, p.height, p.base ?? 0, p.size ?? r.width ?? .08].every(Number.isFinite) && p.height > (p.base ?? 0) && (p.size ?? r.width ?? .08) > 0))) fail();
    } else fail();
  }
  return site.features;
}

// Individual source-dimension recipes (Pier 62 section widths adapted), without a course floor/layout,
// fences, copying NYC site coordinates, actors or waterfront construction. Pick/translate
// only the desired features for UN Plaza / Zion in parent-owned site data. Factories
// return fresh plain objects and arrays; decks/steps stay nontransition support.
const profile = (id, width, points, smooth = false) => ({ id, kind: 'profile', u0: -width / 2, u1: width / 2, points, smooth });
const pad = (id, width, length, height) => ({ id, kind: 'pad', u0: -width / 2, u1: width / 2, s0: 0, s1: length, height });
const roller = (id, width, length, height, steps) => profile(id, width,
  Array.from({ length: steps + 1 }, (_, i) => [length * i / steps, height * (1 - Math.cos(i / steps * Math.PI * 2)) / 2]), true);
const quarter = (id, width, radius, steps) => profile(id, width,
  Array.from({ length: steps + 1 }, (_, i) => { const a = i / steps * Math.PI / 3; return [radius * Math.sin(a), radius * (1 - Math.cos(a))]; }), true);

export function createJeffersonRecipes() {
  const q = quarter('quarter', 7.5, 2.2, 16), lip = q.points.at(-1);
  return {
    northBank: profile('north-bank', 7.5, [[0, 0], [2.5, .4], [5, .4], [7.5, 0]]),
    doubleBank: profile('double-bank', 7.5, [[0, 0], [2.5, .6], [5, .6], [7.5, 0]]),
    rollerLow: roller('roller-low', 7.5, 6, .28, 20), roller: roller('roller', 7.5, 6, .4, 20),
    quarter: q, quarterDeck: { ...pad('quarter-deck', 7.5, 4.2, lip[1]), s0: lip[0] },
    eastBank: profile('east-bank', 7.5, [[0, 0], [3, .6], [6.5, .6]]),
    steps: Array.from({ length: 4 }, (_, i) => ({ ...pad('step-' + i, 4, (i + 1) * .65, .6 - i * .15), s0: i * .65 })),
    stepBypass: profile('step-bypass', 3.5, [[0, .6], [3, 0]]),
    bench: pad('bench', 6, 1.4, .3), tallBench: pad('tall-bench', 6, 1.4, .4), manualPad: pad('manual-pad', 3.5, 3, .16),
    // NYC strut recipes specify bar CENTRE heights; these recipes specify actual TOP heights.
    flatRail: { id: 'flat-rail', kind: 'rail', points: [[0, 0, .465], [0, 4, .465]], width: .09, thickness: .09,
      posts: [{ u: 0, s: .3, height: .42, size: .09 }, { u: 0, s: 3.7, height: .42, size: .09 }] },
    handrail: { id: 'handrail', kind: 'rail', points: [[0, 0, .52], [0, 3, 1.12], [0, 6.5, 1.12]], width: .08, thickness: .08,
      posts: [{ u: 0, s: .3, height: .54 }, { u: 0, s: 3, height: 1.08 }, { u: 0, s: 6.3, height: 1.08 }] }
  };
}

export function createPier62Recipes() {
  const q = quarter('quarter', 8, 2.4, 16), far = quarter('return-quarter', 19, 3, 20);
  return {
    tabletop: profile('tabletop', 10, [[0, 0], [2.5, .55], [4.5, .55], [7, 0]]),
    quarter: q, quarterDeck: { ...pad('quarter-deck', 8, 3.3, q.points.at(-1)[1]), s0: q.points.at(-1)[0] },
    rollerLow: roller('roller-low', 8, 8, .45, 16), roller: roller('roller', 8, 8, .65, 16),
    farBank: profile('far-bank', 11, [[0, 0], [3, .75], [6, .75], [9, 0]]),
    returnQuarter: far, returnDeck: { ...pad('return-deck', 19, 5.4, far.points.at(-1)[1]), s0: far.points.at(-1)[0] },
    manualPad: pad('manual-pad', 7, 2.6, .2), ledge: pad('ledge', 8, 2.6, .4),
    flatRail: { id: 'flat-rail', kind: 'rail', points: [[0, 0, .53], [5, 0, .53]], width: .12, thickness: .1,
      posts: [{ u: .3, s: 0, height: .48, size: .1 }, { u: 4.7, s: 0, height: .48, size: .1 }] }
  };
}
