(function () {
// js/grade-separation.js
// Roads off the ground (P3.3):
// - Tunnels (Broadway, Stockton): the road network's tunnel edges (road-network.js spans(): straight between the portals'
//   ground, under the hill, which isn't cut) get a dark box bore with ceiling lights and lane lines and wall colliders.
//   Each open approach has smooth retaining walls with parapets over drops and ends at a masonry portal: a headwall
//   (widened over a DEM-blended ramp), a street deck where an upper road reaches over the cut, or a slab/frame
//   carrying a building that spans it (Broadway east). AI traffic drives them; pedestrians don't.
// - Street bridges over the water (Mission Creek's 3rd and 4th St bridges; the bare-earth DEM has none): a deck between
//   the banks with parapets and piers down into the water.
// - Freeways and their ramps (I-80, US-101, I-280): decks on columns every COLUMN_STEP m. OSM says which stretches are
//   bridges and their `layer`, not how high: the deck stands DECK_H_ESTIMATE[layer] m over the ground (an estimate,
//   PLAN.md P3-3), eased along the road. Explicit layered EUC support and thin bodies; highway traffic
//   (traffic.js createHighwayTraffic) runs on the main lines. On the Bay Bridge the deck is the bridge's
//   (sf-bridges.js bridgeDeckAt, P5.2): westbound on the upper deck, eastbound on the lower, the approach climbing to it.
// Returns { group, colliders, highwayLanes, floorAt, roofAt, carveAt }: floorAt(x, z, y) is the tunnel floor or bridge
// deck at (x, z) for something at height y (null: the ground), roofAt(x, z, y) a tunnel's ceiling over it (Infinity:
// none), carveAt(x, z) the legacy vertex-lowering API (now null). Bounded terrainCuts open the cavity without
// lowering the actual upper streets. Tunnel floors follow road-network's measured lower-approach anchors.

const { THREE, Terrain } = window.NYC;
const { createRoadSurfaceMaterial, createMarbleAshlarMaterial, boreY, edgeArc } = window.NYC;
const bridgeDeckAt = (x, z, upper) => (window.NYC.bridgeDeckAt ? window.NYC.bridgeDeckAt(x, z, upper) : null);

const STEP = 2; // maximum metres between tunnel/street-bridge floor samples and drawing stations
const LANE_HALF = 1.75;
const WALKWAY = 0.9; // tunnel ledge / bridge sidewalk beside the outer lanes
const BORE_H = 5.2; // default estimated clearance; shallow cover constrains the roof, never the traffic floor
const MIN_BORE_H = 4.0; // bus including rooftop equipment is 3.255 m; clearance regression includes axle pitch
const ROOF_T = 0.25;
const ROOF_COVER = 0.4; // slab + strip quantisation + measured-surface clearance
const ROOF_GRADE = 0.08; // maximum change in clearance per metre (in addition to the unchanged road grade)
const CAVITY_PAD = 0.02; // floor/cut seam overlap, also used by sf-ground's bounded curb clipping
// Open approach cuts and portals. Every wall/headwall/parapet is drawn and registered from the same intervals.
const WALL_T = 0.6; // bore and retaining wall thickness, outside the bore's L/R edge
const COPING = 0.15; // open-cut wall top above the adjacent measured ground (hides the clipped terrain edge)
const WALL_SAMPLE = 0.5; // metres between smooth wall-top samples
const RAIL_H = 1.0, RAIL_T = 0.3, RAIL_DROP = 1.2; // parapet on any drop deeper than RAIL_DROP
const PORTAL_WING = 1.2; // headwall face beyond each side wall
const OVERHANG_SLAB = 0.8; // concrete slab carrying a building over an open approach (the real Broadway east portal)
const BUS_HALF_LENGTH = 6.2, BUS_HALF_WIDTH = 1.4; // conservative upper-street vehicle footprint
const DECK_REACH = 8; // a street deck may continue this far over the covered bore until the measured hill meets it
const DECK_BREAKOVER = .12, DECK_EDGE_SLOPE = .06; // street deck below its vehicle paths (bus overhang at a grade break)
const RAMP_DEPTH = 6, RAMP_RISE = 3, RAMP_START = 2, RAMP_WING = 5.5; // steep DEM ramp beside a mouth (metres)
const LIGHT_STEP = 8;
const PARAPET_H = 1.0;
const DECK_T = 1.4; // deck thickness
const DECK_H_ESTIMATE = [0, 8, 15, 22]; // m over the ground by OSM layer (0 at grade): an ESTIMATE, the data has no heights
const DECK_GRADE = 0.05; // estimated freeway grade; measured terrain / fixed bridge grades can require more
const DECK_GROUND_JOIN = 0.06; // omit only the final near-ground layer (5 cm clearance + 1 cm tolerance), never a 60 cm lip
const FREEWAY_LANE = 3.6;
const COLUMN_STEP = 30;
const JUNCTION_REACH = 120; // bounded along each connected freeway arm, including the shallow I-80 / 4th St merge
const JUNCTION_HEIGHT = 0.25; // estimated deck profiles differ ~20 cm at that merge; never join stacked road levels
const FLOOR_BAND = 2.5; // a tunnel floor counts for something less than this above it; a deck for something above it less this

// options.structures: optional building OBB colliders. A building whose underside spans an open approach is
// carried by an explicit slab/portal (the actual Broadway east portal has a building on top), never deleted.
function buildGradeSeparation(scene, network, options = {}) {
  const ride = window.NYC.RideGeometry;
  const structures = (options.structures || []).filter(c => c?.obb && Number.isFinite(c.minY) && Number.isFinite(c.maxY));
  const group = new THREE.Group();
  group.name = 'SFGradeSeparation';
  const colliders = [];
  const floors = []; // { kind, x0, z0, dx, dz, rx, rz, t0, t1, L, R, ys }
  const terrainCuts = []; // convex interiors for terrain faces/skirts; explicit registered facets own replacement support
  const geo = { road: [], wall: [], ceiling: [], masonry: [], concrete: [], light: [], paint: [] };
  const ground = (x, z) => Terrain.groundAt(x, z);
  // A surface street's roadway within r m of (x, z)
  const onStreet = (x, z, r) => network.edges.some((e) => {
    if (e.bore) return false;
    const t = (x - e.x0) * e.dx + (z - e.z0) * e.dz;
    return t > -r && t < e.span + r && Math.abs((x - e.x0) * e.rx + (z - e.z0) * e.rz) < e.half + r;
  });

  // A quad from four [x, y, z] corners (counter-clockwise seen from the side it faces)
  function quad(list, a, b, c, d) {
    list.push([...a, ...b, ...c, ...a, ...c, ...d]);
  }
  // ... and seen from the other side
  const back = (list, a, b, c, d) => quad(list, d, c, b, a);
  // An oriented box: centre (cx, cz), from y0 to y1, `along` m along (dx, dz), `across` m across
  function box(list, cx, cz, dx, dz, along, across, y0, y1) {
    if (y1 <= y0) return;
    ride?.addBox({ x: cx, y: (y0 + y1) / 2, z: cz },
      { x: across / 2, y: (y1 - y0) / 2, z: along / 2 }, Math.atan2(dx, dz),
      { support: false, layered: true, source: 'grade:structure' });
    const ax = (dx * along) / 2, az = (dz * along) / 2, bx = (-dz * across) / 2, bz = (dx * across) / 2;
    const c = [[cx - ax - bx, cz - az - bz], [cx + ax - bx, cz + az - bz], [cx + ax + bx, cz + az + bz], [cx - ax + bx, cz - az + bz]];
    for (let i = 0; i < 4; i++) {
      const [p, q] = [c[i], c[(i + 1) % 4]];
      back(list, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]);
    }
    back(list, [c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]]);
    back(list, [c[3][0], y0, c[3][1]], [c[2][0], y0, c[2][1]], [c[1][0], y0, c[1][1]], [c[0][0], y0, c[0][1]]);
  }
  // An oriented box collider (the controllers' OBB frame: local z along (dx, dz))
  function collider(cx, cz, dx, dz, along, across, minY, maxY) {
    const hz = along / 2, hx = across / 2;
    const ex = Math.abs(dz) * hx + Math.abs(dx) * hz, ez = Math.abs(dx) * hx + Math.abs(dz) * hz;
    colliders.push({ rideIgnore: true, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY, maxY, obb: { cx, cz, hx, hz, cs: dz, sn: dx } });
  }

  // Exact drawn floor facets, registered before batching. Slabs stop below the road, never above its low end.
  function floorQuad(a, b, c, d, options = {}, thickness = 0.24) {
    quad(geo.road, a, b, c, d);
    ride?.addTriangles([...a, ...b, ...c, ...a, ...c, ...d], null, 'pavement',
      { layered: true, shore: true, source: 'grade:floor', ...options });
    const ax = (a[0] + b[0]) / 2, az = (a[2] + b[2]) / 2;
    const bx = (c[0] + d[0]) / 2, bz = (c[2] + d[2]) / 2;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) return;
    const ya = (a[1] + b[1]) / 2, yb = (c[1] + d[1]) / 2;
    const n = Math.max(1, Math.ceil(Math.abs(yb - ya) / 0.04));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, y0 = ya + (yb - ya) * k / n, y1 = ya + (yb - ya) * (k + 1) / n;
      ride?.addBox({ x: ax + (bx - ax) * u, y: Math.min(y0, y1) - thickness / 2 - 0.002, z: az + (bz - az) * u },
        { x: Math.hypot(b[0] - a[0], b[2] - a[2]) / 2, y: thickness / 2, z: length / n / 2 + 1e-6 },
        Math.atan2(bx - ax, bz - az), { support: false, layered: true, source: 'grade:slab' });
    }
  }
  // Drawing and body share small boxes following the final dense stations, not a tall span envelope.
  function strip(a, b, dx, dz, width, bottom, top, list) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / 0.04));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, y = a[1] + (b[1] - a[1]) * u;
      box(list, a[0] + (b[0] - a[0]) * u, a[2] + (b[2] - a[2]) * u,
        dx, dz, L / n + 2e-6, width, y + bottom, y + top);
    }
  }

  // 1. Tunnels and street bridges, per road: an edge with the edge running the other way beside it (its partner) shares
  //    one bore or deck, as wide as both their lanes
  const done = new Set();
  const boreJobs = [];
  const lateral = (e, x, z) => (x - e.x0) * e.rx + (z - e.z0) * e.rz;
  for (const e of network.edges) {
    if (!e.bore || done.has(e)) continue;
    done.add(e);
    const partner = network.edges.find((f) => f.bore && !done.has(f) && f.name === e.name && f.bore.kind === e.bore.kind &&
      e.dx * f.dx + e.dz * f.dz < -0.95 && Math.abs(lateral(e, f.x0, f.z0)) < 8 &&
      Math.abs((f.x0 - e.x0) * e.dx + (f.z0 - e.z0) * e.dz - e.span) < 12);
    if (partner) done.add(partner);
    const lanes = e.lanes.slice();
    if (partner) for (const o of partner.lanes) lanes.push(lateral(e, partner.x0, partner.z0) - o);
    let L = Math.min(...lanes) - LANE_HALF - WALKWAY;
    let R = Math.max(...lanes) + LANE_HALF + WALKWAY;
    // the stretch of e off the ground: arcs along its link at its two ends, the span [p0, p1] between them
    const b = e.bore;
    const s0 = Math.hypot(e.sx - e.x0, e.sz - e.z0);
    const tAt = (u) => ((u - b.a0) / (b.a1 - b.a0 || 1)) * e.span;
    const t0 = Math.max(0, Math.min(tAt(b.p0), tAt(b.p1)));
    const t1 = Math.min(e.span, Math.max(tAt(b.p0), tAt(b.p1)));
    if (t1 - t0 < 2) continue;
    if (partner && b.kind === 'tunnel') {
      // Opposite Broadway carriageways are slightly skewed, not parallel. Project both ends, rather than assuming
      // the partner's offset at its distant start also covers its lane through this opening.
      const dot = e.dx * partner.dx + e.dz * partner.dz;
      for (const t of [t0, t1]) for (const lane of partner.lanes) {
        const x = partner.x0 + partner.rx * lane, z = partner.z0 + partner.rz * lane;
        const u = (t - (x - e.x0) * e.dx - (z - e.z0) * e.dz) / dot;
        const o = lateral(e, x + partner.dx * u, z + partner.dz * u);
        L = Math.min(L, o - LANE_HALF - WALKWAY); R = Math.max(R, o + LANE_HALF + WALKWAY);
      }
    }
    // floor heights along the edge from its start node (the road's own profile, clamped to the edge's stop lines)
    const n = Math.ceil((t1 - t0) / STEP);
    const ys = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const t = t0 + (t1 - t0) * k / n;
      ys[k] = boreY(b, edgeArc(e, t - s0)) ?? ground(e.x0 + e.dx * t, e.z0 + e.dz * t);
    }
    const seg = { kind: b.kind, x0: e.x0, z0: e.z0, dx: e.dx, dz: e.dz, rx: e.rx, rz: e.rz, t0, t1, L, R, ys };
    floors.push(seg);
    if (b.kind === 'tunnel') boreJobs.push({ seg, e, partner });
    else buildDeck(seg, e, partner);
  }
  for (const job of boreJobs) prepareMouths(job);
  for (const { seg } of boreJobs) prepareRoof(seg);
  const upperPaths = boreJobs.length ? collectUpperPaths() : [];
  for (const { seg } of boreJobs) preparePortals(seg);
  for (const { seg, e, partner } of boreJobs) buildBore(seg, e, partner);

  // The point t m along a span's edge from its start node, o m to its right, dy m over its floor
  function P(seg, t, o, dy = 0) {
    const k = Math.min(seg.ys.length - 1, Math.max(0, (t - seg.t0) / (seg.t1 - seg.t0) * (seg.ys.length - 1)));
    const i = Math.min(seg.ys.length - 2, Math.floor(k));
    const y = i < 0 ? seg.ys[0] : seg.ys[i] + (seg.ys[i + 1] - seg.ys[i]) * (k - i);
    return [seg.x0 + seg.dx * t + seg.rx * o, y + dy, seg.z0 + seg.dz * t + seg.rz * o];
  }
  // Every sampled station, evenly spaced over the actual span with both endpoints retained.
  function stations(seg) {
    const out = [];
    for (let k = 0; k < seg.ys.length - 1; k++) out.push(seg.t0 + (seg.t1 - seg.t0) * k / (seg.ys.length - 1));
    out.push(seg.t1);
    return out;
  }

  // A long vehicle straddles a navigation join while its lane offset changes. Flare the shared opening to the
  // neighbouring mouth over one bus length; never put a transverse wall at a path's shape node.
  function prepareMouths({ seg, e, partner }) {
    seg.ends = [0, 1].map(end => {
      const t = end ? seg.t1 : seg.t0, p = P(seg, t, 0);
      const bounds = { L: seg.L, R: seg.R, join: false };
      for (const other of boreJobs) {
        if (other.seg === seg || other.e.name !== e.name) continue;
        const nodes = [e.from, e.to, partner?.from, partner?.to];
        if (![other.e.from, other.e.to, other.partner?.from, other.partner?.to].some(n => n && nodes.includes(n))) continue;
        const s = other.seg;
        for (const u of [s.t0, s.t1]) {
          const q = P(s, u, 0);
          if (Math.hypot(q[0] - p[0], q[2] - p[2]) > 8 || Math.abs(q[1] - p[1]) > 0.25) continue;
          bounds.join = true;
          for (const o of [s.L, s.R]) {
            const v = P(s, u, o), side = (v[0] - seg.x0) * seg.rx + (v[2] - seg.z0) * seg.rz;
            bounds.L = Math.min(bounds.L, side); bounds.R = Math.max(bounds.R, side);
          }
        }
      }
      return bounds;
    });
  }
  function sideAt(seg, t, side) {
    const length = Math.min(12, (seg.t1 - seg.t0) / 2), base = seg[side];
    return base + (seg.ends[0][side] - base) * Math.max(0, Math.min(1, 1 - (t - seg.t0) / length))
      + (seg.ends[1][side] - base) * Math.max(0, Math.min(1, 1 - (seg.t1 - t) / length));
  }
  function outerWall(seg, ta, tb, oa, ob, top, topB = top, caps = 0) {
    const a = P(seg, ta, oa), b = P(seg, tb, ob), length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const cuts = [];
    for (const { seg: other } of boreJobs) {
      if (other === seg) continue;
      for (const end of [0, 1]) {
        const start = end ? Math.max(other.t0, other.t1 - 12) : other.t0;
        const finish = end ? other.t1 : Math.min(other.t1, other.t0 + 12);
        const mid = P(other, (start + finish) / 2, 0);
        if (Math.abs(mid[1] - (a[1] + b[1]) / 2) > 1 || Math.hypot(mid[0] - a[0], mid[2] - a[2]) > 24) continue;
        const t = p => (p[0] - other.x0) * other.dx + (p[2] - other.z0) * other.dz;
        const o = p => (p[0] - other.x0) * other.rx + (p[2] - other.z0) * other.rz;
        const at = t(a), bt = t(b), ao = o(a), bo = o(b);
        let lo = 0, hi = 1;
        const clip = (x, y) => { if (x < 0 && y < 0) return false; if (x < 0) lo = Math.max(lo, x / (x - y));
          if (y < 0) hi = Math.min(hi, x / (x - y)); return hi > lo; };
        const l = sideAt(other, start, 'L'), r = sideAt(other, start, 'R');
        const ls = (sideAt(other, finish, 'L') - l) / (finish - start), rs = (sideAt(other, finish, 'R') - r) / (finish - start);
        // Include this wall's half-width. The union's exterior is supplied by the other arm's wall.
        if (clip(at - start + .3, bt - start + .3) && clip(finish - at + .3, finish - bt + .3) &&
            clip(ao - l - ls * (at - start) + .3, bo - l - ls * (bt - start) + .3) &&
            clip(r + rs * (at - start) - ao + .3, r + rs * (bt - start) - bo + .3)) cuts.push([lo, hi]);
      }
    }
    const keep = (lo, hi) => {
      if (hi - lo < 1e-7) return;
      const u = (lo + hi) / 2, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
      const dx = (b[0] - a[0]) / length, dz = (b[2] - a[2]) / length;
      if (topB === top) {
        box(geo.wall, x, z, dx, dz, length * (hi - lo) + 2e-6, .6, y - .24, top);
        if (top > y - .24) collider(x, z, dx, dz, length * (hi - lo), .6, y - .24, top);
        return;
      }
      // Smooth open-cut wall: one sloped-top prism drawn, bodies quantised to 4 cm of top rise (as floor slabs).
      const point = v => [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v, a[2] + (b[2] - a[2]) * v];
      const tAt = v => top + (topB - top) * v, px = -dz * WALL_T / 2, pz = dx * WALL_T / 2;
      const p = point(lo), q = point(hi), tp = tAt(lo), tq = tAt(hi);
      const c = (s, side, y) => [s[0] + px * side, y, s[2] + pz * side];
      quad(geo.wall, c(p, -1, p[1] - .24), c(q, -1, q[1] - .24), c(q, -1, tq), c(p, -1, tp));
      quad(geo.wall, c(q, 1, q[1] - .24), c(p, 1, p[1] - .24), c(p, 1, tp), c(q, 1, tq));
      quad(geo.wall, c(p, -1, tp), c(q, -1, tq), c(q, 1, tq), c(p, 1, tp));
      if (lo > 0 || caps & 1) quad(geo.wall, c(p, 1, p[1] - .24), c(p, -1, p[1] - .24), c(p, -1, tp), c(p, 1, tp));
      if (hi < 1 || caps & 2) quad(geo.wall, c(q, -1, q[1] - .24), c(q, 1, q[1] - .24), c(q, 1, tq), c(q, -1, tq));
      const pieces = Math.max(1, Math.ceil(Math.abs(tq - tp) / .04)), along = length * (hi - lo) / pieces;
      for (let k = 0; k < pieces; k++) {
        const v = lo + (hi - lo) * (k + .5) / pieces, s = point(v), t = tAt(v);
        if (t > s[1] - .24) ride?.addBox({ x: s[0], y: (s[1] - .24 + t) / 2, z: s[2] }, { x: WALL_T / 2, y: (t - s[1] + .24) / 2, z: along / 2 + 1e-6 },
          Math.atan2(dx, dz), { support: false, layered: true, source: 'grade:structure' });
      }
      if (Math.max(tp, tq) > y - .24) collider(x, z, dx, dz, length * (hi - lo), WALL_T, y - .24, Math.max(tp, tq));
    };
    cuts.sort((a, b) => a[0] - b[0]); let end = 0;
    for (const [lo, hi] of cuts) { keep(end, lo); end = Math.max(end, hi); }
    keep(end, 1);
  }

  // DEMs represent one surface: at a tunnel mouth they ramp up the headwall. Do not lower those vertices (which
  // tears the crossing street and stretches its shoulders). Cut only the cavity and fit the estimated roof below
  // the measured upper surface. The original floor samples, traffic profiles and lane graph are immutable inputs.
  function prepareRoof(seg) {
    const count = Math.ceil(seg.t1 - seg.t0), step = (seg.t1 - seg.t0) / count;
    const heights = new Float64Array(count + 1), cover = new Float64Array(count + 1);
    for (let i = 0; i <= count; i++) {
      const t = seg.t0 + i * step;
      let low = Infinity;
      // Include the entire slab/wall footprint and half a station either way. This also bounds the little horizontal
      // boxes used for native collision/drawing; they must not protrude through an uphill upper road.
      for (let dt = -step / 2; dt <= step / 2 + 1e-6; dt += step / 4) {
        for (let o = sideAt(seg, t + dt, 'L') - 0.6; o <= sideAt(seg, t + dt, 'R') + 0.6 + 1e-6; o += 0.25) {
          const p = P(seg, t + dt, o);
          low = Math.min(low, ground(p[0], p[2]) - p[1]);
        }
      }
      cover[i] = low;
      // The steep DEM ramp at a mouth represents the headwall, not an upper road to fit a roof under. It is an
      // open approach until the ceiling fits; constraining it to minimum clearance pitches a bus into the lintel.
      heights[i] = low < MIN_BORE_H + ROOF_COVER ? BORE_H
        : Math.max(MIN_BORE_H, Math.min(BORE_H, low - ROOF_COVER));
    }
    for (let i = 0; i <= count; i++) if (Math.abs(cover[Math.min(count, i + 1)] - cover[Math.max(0, i - 1)]) > step * 0.5) heights[i] = BORE_H;
    for (let i = 1; i <= count; i++) heights[i] = Math.min(heights[i], heights[i - 1] + step * ROOF_GRADE);
    for (let i = count - 1; i >= 0; i--) heights[i] = Math.min(heights[i], heights[i + 1] + step * ROOF_GRADE);
    // A hill-covered interval: the measured surface clears the slab at both of its stations.
    const closed = new Uint8Array(count);
    for (let i = 0; i < count; i++) closed[i] = cover[i] >= heights[i] + ROOF_T + 0.04 && cover[i + 1] >= heights[i + 1] + ROOF_T + 0.04 ? 1 : 0;
    seg.roof = { heights, cover, step, closed };
  }

  // Upper-level vehicle paths (surface lanes and junction connectors) near tunnel mouths: their bus footprints and
  // pavement edges keep a portal clear of, or under, a street that reaches over an open approach.
  function collectUpperPaths() {
    const mouths = boreJobs.flatMap(({ seg }) => [P(seg, seg.t0, 0), P(seg, seg.t1, 0)]);
    const near = (x, z, r) => mouths.some(m => Math.hypot(m[0] - x, m[2] - z) < r);
    const out = [], c0 = {};
    for (const e of network.edges) {
      if (e.bore) continue;
      // Edge segments are straight: test the closest point to each mouth, not just the endpoints.
      if (!mouths.some(m => {
        const t = Math.max(0, Math.min(e.span, (m[0] - e.x0) * e.dx + (m[2] - e.z0) * e.dz));
        return Math.hypot(e.x0 + e.dx * t - m[0], e.z0 + e.dz * t - m[2]) < 140;
      })) continue;
      for (let s = 0; s <= e.span; s += 1) {
        const x = e.x0 + e.dx * s, z = e.z0 + e.dz * s;
        if (!near(x, z, 140)) continue;
        // Pavement: the full width of the roadway, including the junction area beyond the stop lines.
        const y = network.edgeY(e, s - Math.hypot(e.sx - e.x0, e.sz - e.z0));
        for (const o of [-e.half, e.half]) out.push({ x: x + e.rx * o, z: z + e.rz * o, y, pavement: true });
      }
      for (let i = 0; i < e.lanes.length; i++) for (let s = 0; s <= e.len; s += 1) {
        const x = e.sx + e.dx * s + e.rx * e.lanes[i], z = e.sz + e.dz * s + e.rz * e.lanes[i];
        if (near(x, z, 140)) out.push({ x, z, y: network.edgeY(e, s, i), tx: e.dx, tz: e.dz });
      }
      for (const m of e.moves) for (let i = 0; i < e.lanes.length; i++) {
        const j = m.out[i];
        if (j < 0) continue;
        const c = network.connector(e, i, m.to, j);
        for (let s = 0; s <= c.len; s += 1) {
          const p = network.curvePoint(c, s, c0);
          if (near(p.x, p.z, 140)) out.push({ x: p.x, z: p.z, y: network.curveY(c, s), tx: p.dx, tz: p.dz });
        }
      }
    }
    return out;
  }

  // Each mouth's open approach ends at a portal. Classify intervals (seg.roof.*, one per roof station step):
  // closed = hill cover; overhang = a building spans the open cut; block = portal headwall/street deck;
  // covered = any of these (ceiling + roofAt). The traffic floor, profiles and lane graph are never changed.
  function preparePortals(seg) {
    const r = seg.roof, n = r.closed.length, fy = t => P(seg, t, 0)[1];
    const overhang = new Uint8Array(n), block = new Uint8Array(n), covered = new Uint8Array(n), top = new Float64Array(n);
    for (let i = 0; i < n; i++) if (!r.closed[i]) {
      const t = seg.t0 + (i + .5) * r.step, o = (sideAt(seg, t, 'L') + sideAt(seg, t, 'R')) / 2, p = P(seg, t, o);
      const roof = p[1] + roofHeight(seg, t);
      overhang[i] = structures.some(c => c.minY < roof && c.maxY > roof + 1 && insideObb(c.obb, p[0], p[2])) ? 1 : 0;
    }
    for (let i = 0; i < n; i++) covered[i] = r.closed[i] || overhang[i];
    seg.portals = [];
    for (const end of [0, 1]) {
      const at = j => end ? n - 1 - j : j; // interval index j counted inward from this mouth
      let kc = -1;
      for (let j = 0; j < n; j++) if (r.closed[at(j)] || overhang[at(j)]) { kc = j; break; }
      if (kc < 1) continue; // fully open, or covered right up to an internal join
      const tAt = d => end ? seg.t1 - d : seg.t0 + d, dAt = t => end ? seg.t1 - t : t - seg.t0;
      const portal = { end, kind: 'headwall', front: 0, back: kc, wing: PORTAL_WING, rail: true };
      if (overhang[at(kc)] && !r.closed[at(kc)]) {
        // The building is the structure above; the frame only carries it.
        Object.assign(portal, { kind: 'overhang', front: kc - 1, wing: 0, rail: false });
        top[at(kc - 1)] = fy(tAt((kc - .5) * r.step)) + roofHeight(seg, tAt((kc - .5) * r.step)) + ROOF_T + OVERHANG_SLAB;
      } else {
        // Upper pavement edges and bus footprints over this approach, in this mouth's (d, o) frame.
        const oc = (seg.L + seg.R) / 2, band = (seg.R - seg.L) / 2 + WALL_T + PORTAL_WING;
        const dc = kc * r.step;
        let edge = Infinity, traffic = Infinity;
        const footprint = [];
        for (const p of upperPaths) {
          const t = (p.x - seg.x0) * seg.dx + (p.z - seg.z0) * seg.dz, d = dAt(t);
          if (d < -BUS_HALF_LENGTH || d > dc + DECK_REACH + BUS_HALF_LENGTH || t < seg.t0 - 8 || t > seg.t1 + 8) continue;
          const tc = Math.max(seg.t0, Math.min(seg.t1, t));
          if (p.y < fy(tc) + roofHeight(seg, tc) + ROOF_T + .3) continue; // the lower approach itself, or a lower street
          const o = (p.x - seg.x0) * seg.rx + (p.z - seg.z0) * seg.rz;
          if (p.pavement) { if (Math.abs(o - oc) < band) edge = Math.min(edge, d); continue; }
          for (const a of [-BUS_HALF_LENGTH, BUS_HALF_LENGTH]) for (const b of [-BUS_HALF_WIDTH, BUS_HALF_WIDTH]) {
            const x = p.x + p.tx * a - p.tz * b, z = p.z + p.tz * a + p.tx * b;
            const cd = dAt((x - seg.x0) * seg.dx + (z - seg.z0) * seg.dz), co = (x - seg.x0) * seg.rx + (z - seg.z0) * seg.rz;
            if (Math.abs(co - oc) > band + BUS_HALF_LENGTH) continue;
            footprint.push({ d: cd, o: co, y: p.y, pd: d, po: o });
            if (Math.abs(co - oc) < band) traffic = Math.min(traffic, cd);
          }
        }
        if (traffic < dc - .5) {
          // A street reaches over the open cut (Stockton's dead end above its north portal): carry it on a deck
          // at its own vehicle height, with a parapet at the drop, instead of leaving buses over the cavity.
          const front = Math.max(1, Math.floor((traffic - .6) / r.step));
          // Highest vehicle path over this interval, less DECK_BREAKOVER: a bus cresting from the steeper street
          // onto the level turn keeps its overhang clear of the deck; wheels float at most a few centimetres.
          const height = j => {
            let y = -Infinity;
            for (const f of footprint) if (Math.abs(f.po - oc) < band && f.pd >= j * r.step - .25 && f.pd <= (j + 1) * r.step + .25) y = Math.max(y, f.y);
            return y - DECK_BREAKOVER;
          };
          let back = Math.max(kc, front + 1);
          const tops = [];
          for (let j = front; j < Math.min(n, kc + DECK_REACH); j++) tops.push(height(j));
          // Intervals under only a bus overhang (no wheel path) fall away at DECK_EDGE_SLOPE from the nearest
          // wheel-bearing interval, clearing a pitched overhang at the grade break.
          const wheels = tops.slice();
          for (let k = 0; k < tops.length; k++) if (!Number.isFinite(wheels[k])) {
            let best = -Infinity, near = Infinity;
            for (let m = 0; m < wheels.length; m++) if (Number.isFinite(wheels[m]) && Math.abs(m - k) <= near) {
              const y = wheels[m] - DECK_EDGE_SLOPE * Math.abs(m - k) * r.step;
              best = Math.abs(m - k) < near ? y : Math.min(best, y); near = Math.abs(m - k);
            }
            tops[k] = best;
          }
          if (!tops.every(Number.isFinite)) continue;
          // Continue over the hill only until the measured surface reaches the deck.
          while (back < front + tops.length && back < n) {
            const t = tAt((back + .5) * r.step);
            let low = Infinity;
            for (let o = seg.L - WALL_T; o <= seg.R + WALL_T + 1e-6; o += .5) { const q = P(seg, t, o); low = Math.min(low, ground(q[0], q[2])); }
            if (low >= tops[back - front] - .25) break;
            back++;
          }
          let lo = seg.L - WALL_T - PORTAL_WING, hi = seg.R + WALL_T + PORTAL_WING;
          for (const f of footprint) if (f.d > front * r.step - 1 && f.d < back * r.step + 1) {
            lo = Math.max(seg.L - WALL_T - 4, Math.min(lo, f.o - .3)); hi = Math.min(seg.R + WALL_T + 4, Math.max(hi, f.o + .3));
          }
          Object.assign(portal, { kind: 'deck', front, back, lo, hi });
          for (let j = front; j < back; j++) top[at(j)] = tops[j - front];
        } else {
          // Headwall in front of the cover, clear of any upper pavement; gap intervals under that edge get a ceiling.
          const back = Math.max(1, Math.min(kc, Math.floor((edge - .05) / r.step)));
          // A single-valued DEM spreads a headwall into a steep ramp beside the cut (Stockton under Bush). Where
          // the ground beside the bore climbs more than RAMP_RISE within RAMP_DEPTH, the portal face moves out to
          // where that ramp is RAMP_START high and widens over it: one masonry face, not a curling halfpipe.
          const beside = d => {
            const tt = tAt(Math.max(0, d));
            let g = -Infinity;
            for (const o of [seg.L - WALL_T - 1, seg.L - WALL_T - 3, seg.R + WALL_T + 1, seg.R + WALL_T + 3]) {
              const q = P(seg, tt, o); g = Math.max(g, ground(q[0], q[2]) - fy(tt));
            }
            return g;
          };
          let front = back - 1, lo = seg.L - WALL_T - PORTAL_WING, hi = seg.R + WALL_T + PORTAL_WING;
          if (back > RAMP_DEPTH + 1 && beside(back * r.step) - beside((back - RAMP_DEPTH) * r.step) > RAMP_RISE) {
            for (let j = back - RAMP_DEPTH; j < back - 1; j++) if (beside(j * r.step) >= RAMP_START) { front = j; break; }
            if (front < back - 1) { lo = seg.L - WALL_T - RAMP_WING; hi = seg.R + WALL_T + RAMP_WING; }
          }
          // Top: a plane following the measured surface just behind the face (the crossing street's cross-slope),
          // COPING above its highest point; never below the lintel's structural minimum.
          const oc = (lo + hi) / 2, samples = [];
          for (const d of [back * r.step, back * r.step + .5]) {
            const t = tAt(Math.min(d, seg.t1 - seg.t0));
            for (let o = lo; o <= hi + 1e-6; o += .5) { const q = P(seg, t, o); samples.push([o - oc, ground(q[0], q[2])]); }
          }
          // Minimax cross-slope: the plane (tilt within ±10 %) whose largest step above that surface is smallest.
          const t = tAt((back - .5) * r.step), minimum = fy(t) + roofHeight(seg, t) + ROOF_T + .6;
          let tilt = 0, height = Infinity, step = Infinity;
          for (let k = -20; k <= 20; k++) {
            const b = k * .005;
            let a = minimum - Math.min(b * (lo - oc), b * (hi - oc)), worst = -Infinity;
            for (const [o, y] of samples) a = Math.max(a, y + COPING - b * o);
            for (const [o, y] of samples) worst = Math.max(worst, a + b * o - y);
            if (worst < step - 1e-9) { step = worst; tilt = b; height = a; }
          }
          Object.assign(portal, { front, back: kc, depth: back - front, lo, hi, tilt });
          for (let j = front; j < back; j++) top[at(j)] = height;
        }
      }
      portal.lo ??= seg.L - WALL_T - portal.wing; portal.hi ??= seg.R + WALL_T + portal.wing;
      portal.blocks = [];
      for (let j = portal.front; j < (portal.kind === 'deck' ? portal.back : portal.front + (portal.depth || 1)); j++) {
        block[at(j)] = 1; portal.blocks.push(at(j));
      }
      for (let j = portal.front; j < portal.back; j++) covered[at(j)] = 1;
      seg.portals.push(portal);
    }
    Object.assign(r, { overhang, block, covered, top });
  }
  function insideObb(b, x, z) {
    const dx = x - b.cx, dz = z - b.cz;
    return Math.abs(b.cs * dx - b.sn * dz) <= b.hx && Math.abs(b.sn * dx + b.cs * dz) <= b.hz;
  }
  function roofHeight(seg, t) {
    const r = seg.roof, k = Math.max(0, Math.min(r.heights.length - 1, (t - seg.t0) / r.step));
    const i = Math.min(r.heights.length - 2, Math.floor(k));
    return r.heights[i] + (r.heights[i + 1] - r.heights[i]) * (k - i);
  }
  // lane lines on a floor: dashed white between lanes going the same way, double yellow between the two directions
  function laneLines(seg, e, partner) {
    const line = (o, w, col, dash) => {
      for (let t = seg.t0 + 1; t < seg.t1 - 1; t += dash ? 12 : 4) {
        const len = Math.min(dash ? 3 : 4, seg.t1 - 1 - t);
        const a = P(seg, t, o - w / 2, 0.03), b = P(seg, t + len, o - w / 2, 0.03), c = P(seg, t + len, o + w / 2, 0.03), d = P(seg, t, o + w / 2, 0.03);
        geo.paint.push({ tri: [...a, ...d, ...c, ...a, ...c, ...b], col });
      }
    };
    const WHITE = [0.86, 0.86, 0.82], YELLOW = [0.85, 0.66, 0.12];
    for (let k = 0; k + 1 < e.lanes.length; k++) line((e.lanes[k] + e.lanes[k + 1]) / 2, 0.13, WHITE, true);
    if (partner) {
      const back = partner.lanes.map((o) => lateral(e, partner.x0, partner.z0) - o).sort((p, q) => p - q);
      for (let k = 0; k + 1 < back.length; k++) line((back[k] + back[k + 1]) / 2, 0.13, WHITE, true);
      const mid = (Math.min(...e.lanes) + Math.max(...back)) / 2;
      line(mid - 0.12, 0.1, YELLOW, false);
      line(mid + 0.12, 0.1, YELLOW, false);
    }
  }

  // A tunnel bore: floor, walls and ceiling facing in (seen from outside where the hill doesn't cover them: drawn both
  // sides), lights along the ceiling, wall colliders, and a masonry portal at each end
  function buildBore(seg, e, partner) {
    // Lowering portal vertices alone creates a terrain riser where carving stops; that riser closes the drawn bore.
    // Clip only the actual bore interior below its sloping ceiling. Keep the measured hill above it and all road Y.
    const pad = CAVITY_PAD;
    const alongOrigin = seg.dx * seg.x0 + seg.dz * seg.z0, sideOrigin = seg.rx * seg.x0 + seg.rz * seg.z0;
    const st = stations(seg);
    // Angled connected end planes otherwise leave a triangular terrain sliver across the shared opening.
    // A half-metre lap closes it; clamped P keeps each arm's endpoint height instead of changing either profile.
    // Exterior mouths cover the exact cut pad too, so no open strip separates the approach terrain and floor.
    st.unshift(seg.t0 - (seg.ends[0].join ? .5 : pad));
    st.push(seg.t1 + (seg.ends[1].join ? .5 : pad));
    for (let i = 0; i + 1 < st.length; i++) {
      const [ta, tb] = [st[i], st[i + 1]];
      floorQuad(P(seg, ta, sideAt(seg, ta, 'L')), P(seg, ta, sideAt(seg, ta, 'R')),
        P(seg, tb, sideAt(seg, tb, 'R')), P(seg, tb, sideAt(seg, tb, 'L')),
        { replacesTerrain: true, maxReferenceY: Math.max(P(seg, ta, 0)[1], P(seg, tb, 0)[1]) + FLOOR_BAND + 0.01,
          shore: false, source: 'grade:tunnel' });
    }
    const r = seg.roof;
    for (let i = 0; i + 1 < r.heights.length; i++) {
      const ta = seg.t0 + i * r.step, tb = seg.t0 + (i + 1) * r.step;
      const a = P(seg, ta, 0, r.heights[i]), b = P(seg, tb, 0, r.heights[i + 1]);
      const slope = (b[1] - a[1]) / (tb - ta);
      const la = sideAt(seg, ta, 'L'), lb = sideAt(seg, tb, 'L'), ra = sideAt(seg, ta, 'R'), rb = sideAt(seg, tb, 'R');
      const ls = (lb - la) / (tb - ta), rs = (rb - ra) / (tb - ta);
      const start = ta - (i === 0 && seg.ends[0].join ? .5 : 0);
      const finish = tb + (i === r.heights.length - 2 && seg.ends[1].join ? .5 : 0);
      const corners = [P(seg, start - pad, la - pad), P(seg, start - pad, ra + pad),
        P(seg, finish + pad, lb - pad), P(seg, finish + pad, rb + pad)];
      terrainCuts.push({ minX: Math.min(...corners.map(p => p[0])), maxX: Math.max(...corners.map(p => p[0])),
        minZ: Math.min(...corners.map(p => p[2])), maxZ: Math.max(...corners.map(p => p[2])),
        planes: [[seg.dx, 0, seg.dz, -alongOrigin - start + pad], [-seg.dx, 0, -seg.dz, alongOrigin + finish + pad],
          [seg.rx - ls * seg.dx, 0, seg.rz - ls * seg.dz, -sideOrigin - la + ls * (alongOrigin + ta) + pad],
          [-seg.rx + rs * seg.dx, 0, -seg.rz + rs * seg.dz, sideOrigin + ra - rs * (alongOrigin + ta) + pad],
          [slope * seg.dx, -1, slope * seg.dz, a[1] + pad - slope * (alongOrigin + ta)]] });
      const covered = r.covered[i], overhang = r.overhang[i] && !r.closed[i];
      if (covered) strip(P(seg, ta, (la + ra) / 2, r.heights[i]), P(seg, tb, (lb + rb) / 2, r.heights[i + 1]),
        seg.dx, seg.dz, Math.max(ra - la, rb - lb), 0, ROOF_T + (overhang ? OVERHANG_SLAB : 0), geo.ceiling);
      if (r.block[i]) continue; // the portal's piers replace the side walls here
      for (const [oa, ob, side] of [[la - WALL_T / 2, lb - WALL_T / 2, -1], [ra + WALL_T / 2, rb + WALL_T / 2, 1]]) {
        if (overhang) { outerWall(seg, ta, tb, oa, ob, (a[1] + b[1]) / 2 + ROOF_T + OVERHANG_SLAB); continue; }
        if (covered) {
          let top = (a[1] + b[1]) / 2;
          for (const [t, o] of [[ta, oa], [tb, ob]]) for (const s of [-.3, .3]) {
            const q = P(seg, t, o + s); top = Math.min(top, ground(q[0], q[2]) - .05);
          }
          outerWall(seg, ta, tb, oa, ob, top);
          continue;
        }
        // Open approach: a continuous retaining wall following the measured ground beside it (no per-station steps),
        // with a parapet wherever that ground stands more than RAIL_DROP above the road.
        const pieces = Math.max(1, Math.ceil((tb - ta) / WALL_SAMPLE));
        for (let k = 0; k < pieces; k++) {
          const u0 = k / pieces, u1 = (k + 1) / pieces;
          const caps = (i === 0 && k === 0 && !seg.ends[0].join ? 1 : 0) | (i === r.heights.length - 2 && k === pieces - 1 && !seg.ends[1].join ? 2 : 0);
          outerWall(seg, ta + (tb - ta) * u0, ta + (tb - ta) * u1, oa + (ob - oa) * u0, oa + (ob - oa) * u1,
            wallTop(seg, ta + (tb - ta) * u0, oa + (ob - oa) * u0, side), wallTop(seg, ta + (tb - ta) * u1, oa + (ob - oa) * u1, side), caps);
        }
      }
    }
    for (let t = seg.t0 + LIGHT_STEP / 2; t < seg.t1; t += LIGHT_STEP) {
      const i = Math.min(r.covered.length - 1, Math.floor((t - seg.t0) / r.step)), lit = j => r.covered[j] && !r.block[j];
      if (!lit(i) || !lit(Math.max(0, i - 1)) || !lit(Math.min(r.covered.length - 1, i + 1))) continue;
      for (const o of [seg.L + (seg.R - seg.L) * 0.3, seg.L + (seg.R - seg.L) * 0.7]) {
        const [cx, y, cz] = P(seg, t, o, roofHeight(seg, t) - 0.06);
        box(geo.light, cx, cz, seg.dx, seg.dz, 2.4, 0.25, y - 0.08, y);
      }
    }
    laneLines(seg, e, partner);
    for (const portal of seg.portals) buildPortal(seg, portal);
  }

  // Wall centre o (side -1 = left/L, +1 = right/R): measured ground across the wall and just beyond it, plus coping
  // and a parapet ramping in over the last 0.8 m before the drop reaches RAIL_DROP. Deterministic, so adjoining
  // pieces share their end heights exactly.
  function wallTop(seg, t, o, side) {
    let g = -Infinity;
    for (const s of [-WALL_T / 2, WALL_T / 2, WALL_T / 2 + .6]) { const q = P(seg, t, o + side * s); g = Math.max(g, ground(q[0], q[2])); }
    const floor = P(seg, t, 0)[1], drop = g - floor, u = Math.max(0, Math.min(1, (drop - RAIL_DROP + .4) / .8));
    return Math.max(g, floor) + COPING + RAIL_H * u * u * (3 - 2 * u);
  }

  // One portal: masonry piers and lintel around the bore opening (headwall, building frame or street deck), its
  // registered top surface and a parapet at the drop. Drawing and bodies come from the same corners.
  function buildPortal(seg, portal) {
    const r = seg.roof, blocks = portal.blocks.slice().sort((a, b) => a - b);
    const oc = (portal.lo + portal.hi) / 2, lift = o => (portal.tilt || 0) * (o - oc); // planar cross-slope top
    const stationTop = k => {
      const before = blocks.includes(k - 1) ? r.top[k - 1] : null, after = blocks.includes(k) ? r.top[k] : null;
      return before === null ? after : after === null ? before : (before + after) / 2;
    };
    const corner = (t, o, y) => { const p = P(seg, t, o); return [p[0], y, p[2]]; };
    const hexa = (list, ta, tb, oa, ob, botA, botB, topA, topB) => {
      const c = [corner(ta, oa, botA), corner(ta, ob, botA), corner(tb, ob, botB), corner(tb, oa, botB),
        corner(ta, oa, topA + lift(oa)), corner(ta, ob, topA + lift(ob)), corner(tb, ob, topB + lift(ob)), corner(tb, oa, topB + lift(oa))];
      quad(list, c[4], c[5], c[6], c[7]); quad(list, c[3], c[2], c[1], c[0]);
      quad(list, c[0], c[1], c[5], c[4]); quad(list, c[2], c[3], c[7], c[6]);
      quad(list, c[1], c[2], c[6], c[5]); quad(list, c[3], c[0], c[4], c[7]);
    };
    // Bodies are quantised to 4 cm of top rise in both directions, never above the drawn top.
    const bodies = (ta, tb, oa, ob, bottom, topA, topB) => {
      const pieces = Math.max(1, Math.ceil(Math.abs(topB - topA) / .04));
      const across = Math.max(1, Math.ceil(Math.abs(lift(ob) - lift(oa)) / .04));
      for (let k = 0; k < pieces; k++) for (let m = 0; m < across; m++) {
        const t0 = ta + (tb - ta) * k / pieces, t1 = ta + (tb - ta) * (k + 1) / pieces;
        const o0 = oa + (ob - oa) * m / across, o1 = oa + (ob - oa) * (m + 1) / across;
        const top = Math.min(topA + (topB - topA) * k / pieces, topA + (topB - topA) * (k + 1) / pieces)
          + Math.min(lift(o0), lift(o1)) - .002;
        const [cx, , cz] = P(seg, (t0 + t1) / 2, (o0 + o1) / 2);
        if (top <= bottom) continue;
        ride?.addBox({ x: cx, y: (bottom + top) / 2, z: cz }, { x: (o1 - o0) / 2, y: (top - bottom) / 2, z: (t1 - t0) / 2 + 1e-6 },
          Math.atan2(seg.dx, seg.dz), { support: false, layered: true, source: 'grade:portal' });
        collider(cx, cz, seg.dx, seg.dz, t1 - t0, o1 - o0, bottom, top);
      }
    };
    const surface = [];
    for (const i of blocks) {
      const ta = seg.t0 + i * r.step, tb = ta + r.step, topA = stationTop(i), topB = stationTop(i + 1);
      const L = Math.min(sideAt(seg, ta, 'L'), sideAt(seg, tb, 'L')), R = Math.max(sideAt(seg, ta, 'R'), sideAt(seg, tb, 'R'));
      const bottom = Math.min(P(seg, ta, 0)[1], P(seg, tb, 0)[1]) - .24;
      const lintel = Math.max(P(seg, ta, 0, r.heights[i])[1], P(seg, tb, 0, r.heights[i + 1])[1]) + ROOF_T;
      for (const [oa, ob, y0] of [[portal.lo, L, bottom], [R, portal.hi, bottom], [L, R, lintel]]) {
        if (ob - oa < 1e-3 || Math.min(topA, topB) + Math.min(lift(oa), lift(ob)) <= y0) continue;
        hexa(geo.masonry, ta, tb, oa, ob, y0, y0, topA, topB);
        bodies(ta, tb, oa, ob, y0, topA, topB);
      }
      const a = corner(ta, portal.lo, topA + lift(portal.lo)), b = corner(ta, portal.hi, topA + lift(portal.hi));
      const c = corner(tb, portal.hi, topB + lift(portal.hi)), d = corner(tb, portal.lo, topB + lift(portal.lo));
      surface.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    // The registered walking/riding top is exactly the drawn top face.
    if (surface.length) ride?.addTriangles(surface, null, 'pavement', { layered: true, source: 'grade:portal' });
    if (!portal.rail) return;
    const i = portal.end ? blocks[blocks.length - 1] : blocks[0], edge = portal.end ? i + 1 : i;
    const t = seg.t0 + edge * r.step, inward = portal.end ? -1 : 1, top = stationTop(edge);
    if (top - P(seg, t, 0)[1] < RAIL_DROP) return;
    // Parapet pieces follow the cross-slope; each drawn box is its own collider.
    const pieces = Math.max(1, Math.ceil(Math.abs(lift(portal.hi) - lift(portal.lo)) / .04)), width = (portal.hi - portal.lo) / pieces;
    for (let k = 0; k < pieces; k++) {
      const o0 = portal.lo + k * width, o1 = o0 + width, [cx, , cz] = P(seg, t + inward * RAIL_T / 2, (o0 + o1) / 2);
      const y0 = top + Math.min(lift(o0), lift(o1)) - .05, y1 = top + Math.max(lift(o0), lift(o1)) + RAIL_H;
      box(geo.masonry, cx, cz, seg.dx, seg.dz, RAIL_T, width + 1e-4, y0, y1);
      collider(cx, cz, seg.dx, seg.dz, RAIL_T, width, y0, y1);
    }
  }

  // A bridge deck over the water: road, sidewalks' parapets, the slab's sides and underside, piers every COLUMN_STEP m
  function buildDeck(seg, e, partner) {
    const st = stations(seg);
    for (let i = 0; i + 1 < st.length; i++) {
      const [ta, tb] = [st[i], st[i + 1]];
      floorQuad(P(seg, ta, seg.L), P(seg, ta, seg.R), P(seg, tb, seg.R), P(seg, tb, seg.L), {}, DECK_T);
      quad(geo.concrete, P(seg, ta, seg.R, -DECK_T), P(seg, ta, seg.L, -DECK_T), P(seg, tb, seg.L, -DECK_T), P(seg, tb, seg.R, -DECK_T));
      quad(geo.concrete, P(seg, ta, seg.R, -DECK_T), P(seg, tb, seg.R, -DECK_T), P(seg, tb, seg.R), P(seg, ta, seg.R));
      quad(geo.concrete, P(seg, tb, seg.L, -DECK_T), P(seg, ta, seg.L, -DECK_T), P(seg, ta, seg.L), P(seg, tb, seg.L));
      for (const o of [seg.L + 0.15, seg.R - 0.15]) {
        strip(P(seg, ta, o), P(seg, tb, o), seg.dx, seg.dz, 0.3, 0, PARAPET_H, geo.concrete);
      }
    }
    for (let t = seg.t0 + COLUMN_STEP / 2; t < seg.t1; t += COLUMN_STEP) {
      const [cx, y, cz] = P(seg, t, (seg.L + seg.R) / 2);
      if (Terrain.heightAt(cx, cz) > Terrain.waterLevel + 0.05) continue;
      box(geo.concrete, cx, cz, seg.dx, seg.dz, 1.6, seg.R - seg.L - 1, Terrain.waterLevel - 2, y - DECK_T);
    }
    laneLines(seg, e, partner);
  }

  // 2. Freeways and ramps (GEO.roadGraph.decks), drawn from the centreline graph
  const highwayLanes = buildFreeways();
  function buildFreeways() {
    const RG = window.NYC.GEO.roadGraph;
    if (!RG || !RG.decks) return [];
    const node = (i) => ({ x: RG.nodes[2 * i], z: RG.nodes[2 * i + 1] });
    const ways = RG.decks.map(([li, layers]) => {
      const [a, b, , , lanes, dir, inner, flags] = RG.links[li];
      const pts = [node(a)];
      for (let k = 0; k < inner.length; k += 2) pts.push({ x: inner[k], z: inner[k + 1] });
      pts.push(node(b));
      // layers where OSM had no matching way: the nearest matched point's
      const lay = layers.map((v, k) => {
        if (v >= 0) return v;
        for (let d = 1; d < layers.length; d++) for (const j of [k - d, k + d]) if (layers[j] >= 0) return layers[j];
        return 0;
      });
      // the Bay Bridge (sf-bridges.js bridgeDeckAt, P5.2): westbound on its upper deck, eastbound on the lower; its
      // approach climbs to it
      const upper = /WESTBOUND/.test(RG.names[RG.links[li][2]]);
      const deckAt = (p) => (bridgeDeckAt && !(flags & 4) ? bridgeDeckAt(p.x, p.z, upper) : null);
      const target = pts.map((p, k) => {
        const est = ground(p.x, p.z) + DECK_H_ESTIMATE[Math.min(3, lay[k])];
        const bd = deckAt(p);
        return bd ? (bd.onBridge ? bd.y : Math.max(est, bd.y)) : est;
      });
      return { li, a, b, lanes: Math.max(1, lanes), dir, ramp: (flags & 4) !== 0, pts, target, deckAt };
    });
    // Junction estimates are preferences, not immovable anchors. A short ramp may not have enough run to descend
    // from its layer estimate to the street: solve that constraint through the connected main line as well.
    const street = new Set();
    RG.links.forEach(([a, b, , , , , , flags]) => { if (!(flags & 1)) street.add(a).add(b); });
    const nodeY = new Map();
    for (const w of ways) {
      nodeY.set(w.a, Math.max(nodeY.get(w.a) ?? -Infinity, w.target[0]));
      nodeY.set(w.b, Math.max(nodeY.get(w.b) ?? -Infinity, w.target[w.target.length - 1]));
    }
    for (const i of nodeY.keys()) if (street.has(i)) nodeY.set(i, ground(node(i).x, node(i).z));
    for (const w of ways) {
      // Dense stations every 2 x STEP m. Keep the existing eased layer estimates as soft preferences.
      const dense = [];
      for (let k = 0; k + 1 < w.pts.length; k++) {
        const p = w.pts[k], q = w.pts[k + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z), m = Math.max(1, Math.ceil(L / (2 * STEP)));
        for (let i = 0; i < m; i++) dense.push({ x: p.x + ((q.x - p.x) * i) / m, z: p.z + ((q.z - p.z) * i) / m, y: w.target[k] + ((w.target[k + 1] - w.target[k]) * i) / m });
      }
      const last = w.pts[w.pts.length - 1];
      dense.push({ x: last.x, z: last.z, y: w.target[w.target.length - 1] });
      dense[0].y = nodeY.get(w.a);
      dense[dense.length - 1].y = nodeY.get(w.b);
      // on a bridge the deck is the bridge's (fixed: not eased); on its approach at least as high as the climb to it
      for (const d of dense) {
        const bd = w.deckAt(d);
        if (bd && bd.onBridge) { d.y = bd.y; d.bridge = true; } else if (bd) d.y = Math.max(d.y, bd.y);
      }
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 1; i + 1 < dense.length; i++) if (!dense[i].bridge) dense[i].y = (dense[i - 1].y + dense[i].y + dense[i + 1].y) / 3;
      }
      for (let i = 1; i < dense.length; i++) dense[i].s = Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
      w.dense = dense;
    }

    // One elevation graph, including shared endpoints, for drawing, registered support/slabs and highway traffic.
    // Multi-source distance envelopes solve |yA-yB| <= allowance on EVERY final segment. The anchor ceiling lowers
    // incompatible junction estimates through connected main lines; the target majorant extends their approach
    // into ramps instead of treating an interior layer-0 estimate as another street arrival. Their minimum keeps
    // the same bound, with clearance already included in the constraints (unlike a final ground clamp).
    // Fit immutable street/physical-bridge anchors. The Bay Bridge's lower deck and its short E on-ramps cannot
    // meet at 5%: distribute the missing rise over the entire conflicting anchor-to-anchor path, not its final
    // segment, leaving other arms at 5%. A bounded component fit handles unusually multiply-connected graphs.
    // Only terrain above the resulting reachable ceiling can further enlarge a local allowance. A steep DEM
    // sample under a viaduct therefore does NOT arbitrarily
    // permit a steep deck; an unavoidable hill at a street arrival remains intact instead of flattening SF terrain.
    const vertices = [], endpoints = new Map();
    for (const w of ways) for (let i = 0; i < w.dense.length; i++) {
      const d = w.dense[i], id = i === 0 ? w.a : i === w.dense.length - 1 ? w.b : null;
      let v = id === null ? null : endpoints.get(id);
      const g = ground(d.x, d.z) + 0.05;
      if (!v) {
        v = { index: vertices.length, low: g, target: d.y, adjacent: [] };
        vertices.push(v);
        if (id !== null) endpoints.set(id, v);
      }
      v.target = Math.max(v.target, d.y);
      if (d.bridge) v.fixed = Math.max(g, d.y);
      else if (id !== null && street.has(id) && v.fixed === undefined) v.fixed = g;
      if (v.fixed !== undefined) v.low = v.target = v.fixed;
      else v.target = Math.max(v.target, v.low);
      d.vertex = v.index;
    }
    for (const w of ways) w.constraints = [];
    for (const w of ways) for (let i = 1; i < w.dense.length; i++) {
      const p = w.dense[i - 1], q = w.dense[i], a = vertices[p.vertex], b = vertices[q.vertex];
      const allowance = Math.max(DECK_GRADE * q.s, p.bridge && q.bridge ? Math.abs(a.low - b.low) : 0);
      const length = q.s, bridgeRise = p.bridge && q.bridge ? Math.abs(a.low - b.low) : 0;
      const forward = { to: b.index, allowance, length, bridgeRise }, reverse = { to: a.index, allowance, length, bridgeRise };
      forward.reverse = reverse; reverse.reverse = forward;
      a.adjacent.push(forward); b.adjacent.push(reverse); w.constraints.push(forward);
    }
    function envelope(key, sign, trace = false) {
      const values = vertices.map(v => sign * v[key]), heap = [], parents = trace ? [] : null;
      const push = (index, value) => {
        let i = heap.length; heap.push({ index, value });
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (heap[parent].value <= value) break;
          heap[i] = heap[parent]; i = parent;
        }
        heap[i] = { index, value };
      };
      for (let i = 0; i < values.length; i++) push(i, values[i]);
      while (heap.length) {
        const first = heap[0], last = heap.pop();
        if (heap.length) {
          let i = 0;
          while (2 * i + 1 < heap.length) {
            let child = 2 * i + 1;
            if (child + 1 < heap.length && heap[child + 1].value < heap[child].value) child++;
            if (heap[child].value >= last.value) break;
            heap[i] = heap[child]; i = child;
          }
          heap[i] = last;
        }
        if (first.value !== values[first.index]) continue;
        for (const edge of vertices[first.index].adjacent) {
          const { to, allowance } = edge;
          const value = first.value + allowance;
          if (value < values[to]) {
            values[to] = value; push(to, value);
            if (parents) parents[to] = { from: first.index, edge };
          }
        }
      }
      const result = values.map(value => sign * value);
      return trace ? { values: result, parents } : result;
    }
    for (const v of vertices) v.ceiling = v.fixed ?? Infinity;
    let ceiling;
    for (let pass = 0; pass < 32; pass++) {
      const result = envelope('ceiling', 1, true);
      ceiling = result.values;
      const worst = vertices.reduce((a, v) => v.fixed !== undefined && v.fixed - ceiling[v.index] > (a ? a.fixed - ceiling[a.index] : 1e-9) ? v : a, null);
      if (!worst) break;
      const path = []; let at = worst.index, length = 0;
      while (result.parents[at]) {
        const { from, edge } = result.parents[at]; path.push(edge); length += edge.length; at = from;
      }
      if (length < 1e-6) break;
      const missing = worst.fixed - ceiling[worst.index] + 1e-8;
      for (const edge of path) edge.reverse.allowance = edge.allowance += missing * edge.length / length;
    }
    const components = [];
    for (const v of vertices) if (v.component === undefined) {
      const component = { grade: DECK_GRADE, lo: DECK_GRADE, hi: DECK_GRADE }, queue = [v];
      components.push(component); v.component = component;
      for (let i = 0; i < queue.length; i++) for (const { to } of queue[i].adjacent) {
        const next = vertices[to];
        if (next.component === undefined) { next.component = component; queue.push(next); }
      }
    }
    const setGrades = () => {
      for (const v of vertices) for (const edge of v.adjacent)
        edge.allowance = Math.max(v.component.grade * edge.length, edge.bridgeRise);
    };
    const conflicts = values => new Set(vertices.filter(v => v.fixed !== undefined && values[v.index] < v.fixed - 1e-9).map(v => v.component));
    ceiling = envelope('ceiling', 1);
    let bad = conflicts(ceiling);
    while (bad.size) {
      for (const c of bad) { c.fit = true; c.grade = c.hi *= 2; }
      setGrades(); ceiling = envelope('ceiling', 1); bad = conflicts(ceiling);
    }
    const fitting = components.filter(c => c.fit);
    if (fitting.length) {
      // Twenty bisections bound the inferred grade to better than one millionth for the committed graph.
      for (let pass = 0; pass < 20; pass++) {
        for (const c of fitting) c.grade = (c.lo + c.hi) / 2;
        setGrades(); bad = conflicts(envelope('ceiling', 1));
        for (const c of fitting) if (bad.has(c)) c.lo = c.grade; else c.hi = c.grade;
      }
      for (const c of fitting) c.grade = c.hi;
      setGrades(); ceiling = envelope('ceiling', 1);
    }
    for (const w of ways) w.grade = w.constraints.reduce((grade, edge) => edge.length > 1e-6 ? Math.max(grade, edge.allowance / edge.length) : grade, DECK_GRADE);
    for (const v of vertices) v.reachable = Number.isFinite(ceiling[v.index]) ? Math.max(v.low, ceiling[v.index]) : null;
    for (const v of vertices) if (v.reachable !== null) for (const edge of v.adjacent)
      edge.allowance = Math.max(edge.allowance, Math.abs(v.reachable - vertices[edge.to].reachable));
    const upper = envelope('ceiling', 1), preferred = envelope('target', -1);
    for (const w of ways) for (const d of w.dense) {
      d.y = Math.min(upper[d.vertex], preferred[d.vertex]);
      delete d.vertex;
    }
    for (const w of ways) {
      const dense = w.dense;
      delete w.constraints;
      const width = w.lanes * FREEWAY_LANE + 2;
      w.half = width / 2;
      let distance = 0;
      w.segments = dense.slice(0, -1).map((p, i) => {
        const q = dense[i + 1], length = Math.hypot(q.x - p.x, q.z - p.z);
        const start = distance;
        distance += length;
        return { p, q, length, start, end: distance,
          drawn: length > 1e-6 && !(p.y - ground(p.x, p.z) < DECK_GROUND_JOIN && q.y - ground(q.x, q.z) < DECK_GROUND_JOIN) };
      });
      w.length = distance;
    }

    // Parapets border the union at a junction, not each overlapping link independently.
    // Only directly connected ways, within JUNCTION_REACH along BOTH arms, can open a rail.
    // Their actual drawn pavement must cover it within JUNCTION_HEIGHT vertically.
    // Unconnected crossings, stacked decks, at-grade omissions and exposed edges keep protection.
    const incident = new Map();
    for (const w of ways) for (const id of [w.a, w.b]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(w);
    }
    // Consecutive rectangles leave an outside-corner hole at a bend (including link260 ->261). Use the shared
    // intersection of their offset lines for BOTH strips, their support/slabs and their parapet ends. Junctions
    // with more than two arms or changing widths retain the existing bounded pavement-union treatment.
    const tangent = s => ({ x: (s.q.x - s.p.x) / s.length, z: (s.q.z - s.p.z) / s.length });
    for (const w of ways) {
      w.sides = w.dense.map((p, i) => {
        const before = w.segments[i - 1], after = w.segments[i], directions = [];
        if (before?.length > 1e-6) directions.push(tangent(before));
        if (after?.length > 1e-6) directions.push(tangent(after));
        if (directions.length === 1 && (i === 0 || i === w.dense.length - 1)) {
          const id = i === 0 ? w.a : w.b, arms = incident.get(id);
          const other = arms.length === 2 ? arms.find(arm => arm !== w) : null;
          if (other && Math.abs(other.half - w.half) < 1e-9) {
            const s = id === other.a ? other.segments[0] : other.segments.at(-1);
            if (s?.drawn && (before || after).drawn) {
              const t = tangent(s), sign = (i === 0 ? -1 : 1) * (id === other.a ? 1 : -1);
              directions.push({ x: t.x * sign, z: t.z * sign });
            }
          }
        }
        const a = directions[0] || { x: 0, z: 1 }, b = directions[1] || a, dot = a.x * b.x + a.z * b.z;
        // Bounded mitres only: a sharp/reversing arm must not create a long artificial roadway spur.
        return dot > 0 ? { x: -(a.z + b.z) / (1 + dot), z: (a.x + b.x) / (1 + dot) } : null;
      });
      for (let i = 0; i < w.segments.length; i++) {
        const s = w.segments[i], t = s.length > 1e-6 ? tangent(s) : { x: 0, z: 1 };
        const normal = { x: -t.z, z: t.x };
        s.pSide = w.sides[i] || normal; s.qSide = w.sides[i + 1] || normal;
      }
    }
    const nearNode = (w, s, id) => id === w.a ? s.start < JUNCTION_REACH : w.length - s.end < JUNCTION_REACH;
    const candidates = new Map();
    for (const w of ways) {
      const list = [];
      for (const id of new Set([w.a, w.b])) for (const other of incident.get(id)) {
        if (other === w) continue;
        for (const s of other.segments) if (s.drawn && nearNode(other, s, id)) list.push({ id, other, s });
      }
      candidates.set(w, list);
    }
    function freewayParapet(w, i, offset, dx, dz) {
      const own = w.segments[i], rx = -dz, rz = dx;
      const a = [own.p.x + own.pSide.x * offset, own.p.y, own.p.z + own.pSide.z * offset];
      const b = [own.q.x + own.qSide.x * offset, own.q.y, own.q.z + own.qSide.z * offset];
      const cuts = [];
      for (const { id, other, s } of candidates.get(w)) {
        if (!nearNode(w, own, id)) continue;
        const tx = (s.q.x - s.p.x) / s.length, tz = (s.q.z - s.p.z) / s.length;
        const along = p => (p[0] - s.p.x) * tx + (p[2] - s.p.z) * tz;
        const side = p => -(p[0] - s.p.x) * tz + (p[2] - s.p.z) * tx;
        const ta = along(a), tb = along(b);
        // Full rail width plus 5 cm inside the other pavement, never an exposed outer edge.
        const half = other.half - 0.15 * Math.abs(rx * -tz + rz * tx) - 0.05;
        const startSkew = s.pSide.x * tx + s.pSide.z * tz, endSkew = s.qSide.x * tx + s.qSide.z * tz;
        const rise = (s.q.y - s.p.y) / s.length;
        let lo = 0, hi = 1;
        const clip = (v0, v1, min, max) => {
          const delta = v1 - v0;
          if (Math.abs(delta) < 1e-10) return v0 >= min && v0 <= max;
          const u = (min - v0) / delta, v = (max - v0) / delta;
          lo = Math.max(lo, Math.min(u, v)); hi = Math.min(hi, Math.max(u, v));
          return hi > lo;
        };
        const ownStart = id === w.a ? 0 : w.length - JUNCTION_REACH, ownEnd = id === w.a ? JUNCTION_REACH : w.length;
        const otherStart = id === other.a ? 0 : other.length - JUNCTION_REACH, otherEnd = id === other.a ? JUNCTION_REACH : other.length;
        if (clip(own.start, own.end, ownStart, ownEnd) &&
            clip(s.start + ta, s.start + tb, otherStart, otherEnd) &&
            clip(ta - startSkew * side(a), tb - startSkew * side(b), 0, Infinity) &&
            clip(ta - endSkew * side(a), tb - endSkew * side(b), -Infinity, s.length) && clip(side(a), side(b), -half, half) &&
            clip(a[1] - s.p.y - ta * rise, b[1] - s.p.y - tb * rise, -JUNCTION_HEIGHT, JUNCTION_HEIGHT)) cuts.push([lo, hi]);
      }
      cuts.sort((a, b) => a[0] - b[0]);
      const point = u => a.map((v, k) => v + (b[k] - v) * u);
      const keep = (lo, hi) => {
        if (hi - lo > 1e-7) strip(point(lo), point(hi), dx, dz, 0.3, 0, PARAPET_H, geo.concrete);
      };
      let end = 0;
      for (const [lo, hi] of cuts) { keep(end, lo); end = Math.max(end, hi); }
      keep(end, 1);
    }

    for (const w of ways) {
      const dense = w.dense, width = w.half * 2;
      let sinceColumn = COLUMN_STEP / 2;
      for (let i = 0; i + 1 < dense.length; i++) {
        const p = dense[i], q = dense[i + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const dx = (q.x - p.x) / L, dz = (q.z - p.z) / L, rx = -dz, rz = dx;
        const gp = p.y - ground(p.x, p.z), gq = q.y - ground(q.x, q.z);
        if (!w.segments[i].drawn) continue; // same near-ground handoff used by the junction union
        const h = width / 2;
        const at = (r, o, dy = 0) => {
          const side = r === p ? w.segments[i].pSide : w.segments[i].qSide;
          return [r.x + side.x * o, r.y + dy, r.z + side.z * o];
        };
        floorQuad(at(p, -h), at(p, h), at(q, h), at(q, -h), { source: 'grade:freeway' }, p.bridge && q.bridge ? 0.6 : DECK_T);
        if (p.bridge && q.bridge) continue; // the bridge's truss carries it (sf-bridges.js)
        quad(geo.concrete, at(p, h, -DECK_T), at(p, -h, -DECK_T), at(q, -h, -DECK_T), at(q, h, -DECK_T));
        quad(geo.concrete, at(p, h, -DECK_T), at(q, h, -DECK_T), at(q, h), at(p, h));
        quad(geo.concrete, at(q, -h, -DECK_T), at(p, -h, -DECK_T), at(p, -h), at(q, -h));
        for (const o of [-h + 0.15, h - 0.15]) {
          freewayParapet(w, i, o, dx, dz);
        }
        sinceColumn += L;
        if (sinceColumn >= COLUMN_STEP && Math.min(gp, gq) > 3.5) {
          sinceColumn = 0;
          const g = ground(q.x, q.z);
          // a column over a street under the deck moves across to the nearest place clear of its roadway, or is left out
          const placed = [];
          for (const o0 of width > 14 ? [-width / 4, width / 4] : [0]) {
            let o = null;
            for (let k = 0; o === null && k <= 4 * h; k++) {
              const c = o0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
              const [x, , z] = at(q, c);
              if (Math.abs(c) <= h - 0.8 && !onStreet(x, z, 0.8)) o = c;
            }
            if (o === null || placed.some((p) => Math.abs(p - o) < 2)) continue;
            placed.push(o);
            const [cx, , cz] = at(q, o);
            box(geo.concrete, cx, cz, dx, dz, 1.6, 1.6, g - 0.5, q.y - DECK_T);
            collider(cx, cz, dx, dz, 1.6, 1.6, g - 1, q.y - DECK_T);
          }
        }
      }
    }
    // Highway traffic on the main lines: chains of freeway links (not ramps) end to end, going on straightest
    const lanes = [];
    const byStart = new Map();
    for (const w of ways) if (!w.ramp && w.dir !== 0) byStart.set(w.dir > 0 ? w.a : w.b, [...(byStart.get(w.dir > 0 ? w.a : w.b) || []), w]);
    const used = new Set();
    const along = (w) => (w.dir > 0 ? w.dense : w.dense.slice().reverse());
    const hasIn = new Set();
    for (const w of ways) if (!w.ramp && w.dir !== 0) hasIn.add(w.dir > 0 ? w.b : w.a);
    const starts = ways.filter((w) => !w.ramp && w.dir !== 0 && !hasIn.has(w.dir > 0 ? w.a : w.b));
    for (const first of [...starts, ...ways.filter((w) => !w.ramp && w.dir !== 0)]) {
      if (used.has(first)) continue;
      const chain = [];
      let w = first;
      while (w && !used.has(w)) {
        used.add(w);
        chain.push(...(chain.length ? along(w).slice(1) : along(w)));
        const end = w.dir > 0 ? w.b : w.a;
        const d = along(w), p = d[d.length - 2], q = d[d.length - 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        let best = null, bd = 0.7;
        for (const n of byStart.get(end) || []) {
          if (used.has(n)) continue;
          const e = along(n), dot = ((e[1].x - e[0].x) * (q.x - p.x) + (e[1].z - e[0].z) * (q.z - p.z)) / ((Math.hypot(e[1].x - e[0].x, e[1].z - e[0].z) || 1) * L);
          if (dot > bd) { bd = dot; best = n; }
        }
        w = best;
      }
      let len = 0;
      for (let i = 1; i < chain.length; i++) len += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z);
      if (len < 300) continue;
      const n = first.lanes;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * FREEWAY_LANE;
        const pts = chain.map((c, i) => {
          const a = chain[Math.max(0, i - 1)], b = chain[Math.min(chain.length - 1, i + 1)];
          const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const x = c.x - ((b.z - a.z) / L) * o, z = c.z + ((b.x - a.x) / L) * o;
          return new THREE.Vector3(x, Math.max(c.y, ground(x, z)) + 0.02, z); // (at grade, on the cross slope)
        });
        lanes.push({ pts, speed: 24 + k * 1.5 });
      }
    }
    return lanes;
  }

  // 3. Meshes: one per material
  const mat = {
    road: createRoadSurfaceMaterial(),
    wall: new THREE.MeshStandardNodeMaterial({ color: 0xb8b3a6, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide }),
    ceiling: new THREE.MeshStandardNodeMaterial({ color: 0x34322e, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    masonry: createMarbleAshlarMaterial(),
    concrete: new THREE.MeshStandardNodeMaterial({ color: 0x9a958b, roughness: 0.86, metalness: 0.0 }),
    light: new THREE.MeshBasicNodeMaterial({ color: 0xfff1d6 })
  };
  for (const [key, tris] of Object.entries(geo)) {
    if (key === 'paint' || !tris.length) continue;
    const pos = new Float32Array(tris.flat());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat[key]);
    mesh.name = `SFGradeSeparation_${key}`;
    mesh.castShadow = key !== 'light' && key !== 'road';
    mesh.receiveShadow = key !== 'light';
    group.add(mesh);
  }
  if (geo.paint.length) {
    const pos = new Float32Array(geo.paint.flatMap((p) => p.tri));
    const col = new Float32Array(geo.paint.flatMap((p) => [...p.col, ...p.col, ...p.col, ...p.col, ...p.col, ...p.col]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0 }));
    mesh.name = 'SFGradeSeparation_paint';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  for (const key of Object.keys(geo)) geo[key] = null; // (the floor lookups below keep this scope alive)

  // 4. Floors: the tunnel floor under something in the bore, the deck under something on the bridge
  function find(x, z, y) {
    for (const s of floors) {
      const px = x - s.x0, pz = z - s.z0;
      const t = px * s.dx + pz * s.dz;
      const before = s.roof ? (s.ends[0].join ? .5 : CAVITY_PAD) : .5;
      const after = s.roof ? (s.ends[1].join ? .5 : CAVITY_PAD) : .5;
      if (t < s.t0 - before - 1e-8 || t > s.t1 + after + 1e-8) continue;
      const o = px * s.rx + pz * s.rz;
      if (o < (s.roof ? sideAt(s, t, 'L') : s.L) || o > (s.roof ? sideAt(s, t, 'R') : s.R)) continue;
      const k = Math.min(s.ys.length - 1, Math.max(0, (t - s.t0) / (s.t1 - s.t0) * (s.ys.length - 1)));
      const i = Math.min(s.ys.length - 2, Math.floor(k));
      const fy = i < 0 ? s.ys[0] : s.ys[i] + (s.ys[i + 1] - s.ys[i]) * (k - i);
      if (s.kind === 'tunnel' ? y < fy + FLOOR_BAND : y > fy - FLOOR_BAND) return { s, fy, t };
    }
    return null;
  }
  const floorAt = (x, z, y) => {
    const f = find(x, z, y);
    return f ? f.fy : null;
  };
  const roofAt = (x, z, y) => {
    const f = find(x, z, y);
    if (!f || f.s.kind !== 'tunnel') return Infinity;
    const r = f.s.roof, i = Math.max(0, Math.min(r.covered.length - 1, Math.floor((f.t - f.s.t0) / r.step)));
    return r.covered[i] ? f.fy + roofHeight(f.s, f.t) : Infinity;
  };
  // Never lower shared DEM vertices. The source-anchored bore has its own drawn and registered support layer.
  const carveAt = () => null;
  const counts = { tunnels: floors.filter((f) => f.kind === 'tunnel').length, bridges: floors.filter((f) => f.kind === 'bridge').length };
  console.info(`[grade] ${counts.tunnels} tunnel bores, ${counts.bridges} bridge decks, ${highwayLanes.length} highway lanes, ${colliders.length} colliders`);
  return { group, colliders, highwayLanes, floorAt, roofAt, carveAt, terrainCuts };
}

Object.assign(window.NYC, { buildGradeSeparation, DECK_H_ESTIMATE });
})();
