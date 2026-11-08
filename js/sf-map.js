(function () {
// js/sf-map.js
// Live radar and full-screen street map, using San Francisco geodata.
// World metres: x east, z south; north is up. Legacy internal API names remain for compatibility.

const {
  GEO,
  ROADS,
  BLOCKS,
  NYC_LANDMARKS,
  LANDMARK_SITES,
  ISLAND_BOUNDS,
  MANHATTAN_COASTLINE,
  WATERFRONT_PIERS,
  getLocationLabel,
  isTypingInField
} = window.NYC;

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MIN_ZOOM = 0.015; // full map, pixels per metre: the wider San Francisco bay
const MAX_ZOOM = 3.0; // single lots
const RADAR_SCALE = 0.32; // CSS pixels per metre, independent of absolute hill/deck elevation
const GRID_BEARING = GEO.frame?.bearingDeg ?? 0; // SF world north is true north

// Map palette, shared by the radar & the atlas (in step with css/style.css): graphite ground with the streets a shade
// lighter than the blocks they run between, muted parks & water; a yellow waypoint bearing, white landmarks & player,
// cyan search hits and amber highways
const MAP = {
  water: '#0a1118',
  land: '#151a20',
  landEdge: '#252c35',
  islands: '#162019',
  islandsEdge: '#26392c',
  piers: '#283039',
  streets: '#363f4b', // The core inside its coastline: the roadway left between the blocks
  shore: '#4f5b6b',
  park: '#19301f',
  parkEdge: '#24432f',
  block: '#1c2128',
  blockEdge: '#272e37',
  lawn: '#1e3a26',
  drive: '#2c4033',
  transverse: '#22332a',
  pond: '#0f2535',
  pondEdge: '#1d3d54',
  buildings: ['#242a32', '#2b323c', '#343c48'],
  buildingEdge: '#171b21',
  landmarkFill: 'rgba(255, 255, 255, 0.06)',
  landmarkEdge: 'rgba(255, 255, 255, 0.38)',
  mainRoads: '#3a434f',
  highway: '#b27a35',
  bridge: '#c08a3e',
  route: '#ffc21a',
  search: '#5fd0ff',
  halo: 'rgba(8, 11, 15, 0.9)'
};

// Landmarks modelled by landmarks.js on their real OpenStreetMap lots (outlined in amber)
const MODELLED_LANDMARKS = Object.keys(window.NYC.LANDMARK_SITES || {});

// Labels share the city's georeferenced landmark positions.
const AREA_LABELS = [
  ['SAN FRANCISCO', -1800, 1800, 0], ['SAN FRANCISCO BAY', 3000, -1000, 1],
  ...(NYC_LANDMARKS || []).map((l) => [(l.name || 'Landmark').toUpperCase(), l.x, l.z, 2])
];

// Shorter map names for a few real street names
const LABEL_ALIAS = {};

// ---------------------------------------------------------------------------------------------------------------------
// World-space vector layers: built once into Path2D objects (world metres) and drawn through a canvas transform
// ---------------------------------------------------------------------------------------------------------------------

// Point accessors for rings / polylines given as [{x, z}, ...] or flat [x0, z0, x1, z1, ...]
function accessor(pts) {
  const flat = typeof pts[0] === 'number';
  return {
    n: flat ? pts.length >> 1 : pts.length,
    X: flat ? (i) => pts[2 * i] : (i) => pts[i].x,
    Z: flat ? (i) => pts[2 * i + 1] : (i) => pts[i].z
  };
}

function boundsOf(pts) {
  const { n, X, Z } = accessor(pts);
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < n; i++) {
    const x = X(i);
    const z = Z(i);
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (z < b.minZ) b.minZ = z;
    if (z > b.maxZ) b.maxZ = z;
  }
  return b;
}

// Appends a closed ring, always wound the same way as Path2D.rect (so overlapping rings of one path union under the
// nonzero fill rule instead of cancelling out)
function addRing(path, pts) {
  if (!pts || pts.length < 3) return;
  const { n, X, Z } = accessor(pts);
  if (n < 3) return;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) a += X(j) * Z(i) - X(i) * Z(j);
  if (a >= 0) {
    path.moveTo(X(0), Z(0));
    for (let i = 1; i < n; i++) path.lineTo(X(i), Z(i));
  } else {
    path.moveTo(X(n - 1), Z(n - 1));
    for (let i = n - 2; i >= 0; i--) path.lineTo(X(i), Z(i));
  }
  path.closePath();
}

function addLine(path, pts) {
  if (!pts || pts.length < 2) return;
  const { n, X, Z } = accessor(pts);
  path.moveTo(X(0), Z(0));
  for (let i = 1; i < n; i++) path.lineTo(X(i), Z(i));
}

/**
 * A vector layer split into square tiles of Path2D, so a view only rasterizes the tiles it overlaps. Every item goes
 * to the tile holding its centre; a tile's bounds grow to cover its items.
 */
class TiledLayer {
  constructor(size = 500) {
    this.size = size;
    this.tiles = new Map();
  }

  pathFor(b) {
    const ix = Math.floor((b.minX + b.maxX) * 0.5 / this.size);
    const iz = Math.floor((b.minZ + b.maxZ) * 0.5 / this.size);
    const key = `${ix},${iz}`;
    let t = this.tiles.get(key);
    if (!t) {
      t = { path: new Path2D(), minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
      this.tiles.set(key, t);
    } else {
      t.minX = Math.min(t.minX, b.minX);
      t.maxX = Math.max(t.maxX, b.maxX);
      t.minZ = Math.min(t.minZ, b.minZ);
      t.maxZ = Math.max(t.maxZ, b.maxZ);
    }
    return t.path;
  }

  ring(pts) {
    if (pts && pts.length > 2) addRing(this.pathFor(boundsOf(pts)), pts);
  }

  line(pts) {
    if (pts && pts.length > 1) addLine(this.pathFor(boundsOf(pts)), pts);
  }

  rect(x0, z0, x1, z1) {
    this.pathFor({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }).rect(x0, z0, x1 - x0, z1 - z0);
  }

  /** Calls fn(path) for every tile overlapping the view */
  each(v, fn) {
    for (const t of this.tiles.values()) {
      if (t.maxX < v.minX || t.minX > v.maxX || t.maxZ < v.minZ || t.minZ > v.maxZ) continue;
      fn(t.path);
    }
  }
}

// Lazy, once-per-session 8 m relief raster. Both maps retain their existing static-layer caches.
let RELIEF = null;
function mapRelief() {
  if (RELIEF) return RELIEF;
  const g = window.NYC.DATA?.fullRegion?.city;
  if (!g) return null;
  const canvas = document.createElement('canvas'); canvas.width = g.w; canvas.height = g.h;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(g.w, g.h);
  const water = window.NYC.Terrain.waterLevel;
  for (let z = 1; z < g.h - 1; z++) for (let x = 1; x < g.w - 1; x++) {
    const k = z * g.w + x, y = g.heights[k];
    if (y <= water + 0.05) continue;
    const dx = (g.heights[k+1] - g.heights[k-1]) / (2*g.step);
    const dz = (g.heights[k+g.w] - g.heights[k-g.w]) / (2*g.step);
    const light = Math.max(0, (-dx*0.5 + 0.7 - dz*0.5) / Math.hypot(dx, 1, dz));
    const shade = 20 + light * 35;
    // Keep Uint8Clamped conversion/rounding, without a temporary array per land pixel.
    const p = k * 4;
    image.data[p] = shade * 0.85;
    image.data[p + 1] = shade;
    image.data[p + 2] = shade * 1.07;
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return RELIEF = { canvas, x:g.x0, z:g.z0, width:(g.w-1)*g.step, height:(g.h-1)*g.step };
}

let LAYERS = null;
function mapLayers() {
  if (LAYERS) return LAYERS;
  const L = {};
  const rings = (list) => list.filter((p) => p && p.length > 2);

  // Detailed core coastline and piers. Regional land is drawn from the measured height field.
  L.manhattan = new Path2D();
  addRing(L.manhattan, MANHATTAN_COASTLINE);
  L.piers = new Path2D();
  for (const p of WATERFRONT_PIERS) if (p.ring) addRing(L.piers, p.ring);

  // San Francisco parkland, the curb islands (blocks: raised sidewalks & lots) and the park blocks, exactly
  // as city-grid.js / buildings.js treat them
  L.parkLand = new TiledLayer();
  for (const park of GEO.parks || []) for (const ring of park.rings || []) L.parkLand.ring(ring);
  L.blocks = new TiledLayer();
  L.parkBlocks = new TiledLayer();
  for (const b of BLOCKS) (b.park > 0.6 && !b.median ? L.parkBlocks : L.blocks).ring(b.poly);

  // Mapped arterial roads and freeway segments.
  L.mainRoads = new TiledLayer(1000);
  L.highways = new Path2D();
  for (const r of ROADS) {
    if (r.highway) {
      if (!/Underpass|Tunnel/.test(r.name)) addLine(L.highways, r.pts);
    } else if (r.w >= 15) L.mainRoads.line(r.pts);
  }

  // Landmark lots
  L.landmarks = new Path2D();
  for (const name of MODELLED_LANDMARKS) {
    const s = LANDMARK_SITES[name];
    if (s && s.ring) addRing(L.landmarks, s.ring);
  }

  // Real bridge deck paths from the same OSM geometry as the 3D landmarks.
  L.bridges = Object.values(GEO.bridges || {}).flatMap(br => (br.decks || []).map(deck => {
    const points = deck.pts;
    const path = new Path2D(); addLine(path, points);
    return { path, width: br.width || 25 };
  }));

  LAYERS = L;
  return L;
}

// Building footprints as generated by buildings.js (window.__NYC_APP.cityBlocks), by height: up to 45 m, 95 m, taller
let FOOTPRINTS = null;
function footprintLayers() {
  const all = window.__NYC_APP?.cityBlocks?.allBlocks;
  if (!all || !all.length) return null;
  if (FOOTPRINTS && FOOTPRINTS.src === all && FOOTPRINTS.n === all.length) return FOOTPRINTS;
  const tones = [new TiledLayer(), new TiledLayer(), new TiledLayer()];
  for (const blk of all) {
    for (const f of blk.footprints || []) {
      const layer = tones[f.h > 95 ? 2 : f.h > 45 ? 1 : 0];
      if (f.pts) layer.ring(f.pts); // turned to follow a non-grid street
      else layer.rect(f.x0, f.z0, f.x1, f.z1);
    }
  }
  FOOTPRINTS = { src: all, n: all.length, tones, version: FOOTPRINTS ? FOOTPRINTS.version + 1 : 1 };
  return FOOTPRINTS;
}

// Street name labels: anchors every ~260 m along each straight run of a real centreline (fixed in the world, so labels
// never slide while the map pans), with the direction of the street there (never upside down: vertical names read
// upwards)
const ROAD_LABELS = [];
for (const r of ROADS) {
  const text = LABEL_ALIAS[r.name] || r.name;
  if (!text || /^Unnamed/.test(text)) continue;
  const anchors = [];
  const pts = r.pts;
  for (let i = 0; i + 1 < pts.length;) {
    // the straight run from pts[i]: consecutive segments within ~5° of its first one (the CSCL has a vertex at every
    // intersection, so an avenue is a chain of 80 m blocks)
    const a = pts[i];
    const dir = Math.atan2(pts[i + 1].z - a.z, pts[i + 1].x - a.x);
    let j = i + 1;
    while (j + 1 < pts.length) {
      const d = Math.atan2(pts[j + 1].z - pts[j].z, pts[j + 1].x - pts[j].x);
      let turn = Math.abs(d - dir);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > 0.09) break;
      j++;
    }
    const c = pts[j];
    i = j;
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    if (len < 20) continue;
    let ang = Math.atan2(c.z - a.z, c.x - a.x);
    if (ang >= Math.PI * 0.5 - 0.01) ang -= Math.PI;
    else if (ang < -Math.PI * 0.5 - 0.01) ang += Math.PI;
    const k = Math.max(1, Math.round(len / 260));
    for (let m = 0; m < k; m++) {
      const t = (m + 0.5) / k;
      anchors.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t, ang, len: len / k });
    }
  }
  if (!anchors.length) continue;
  ROAD_LABELS.push({
    text,
    lower: text.toLowerCase(),
    raw: r.name.toLowerCase(),
    road: r,
    major: r.highway || r.w >= 15,
    highway: r.highway,
    anchors,
    ...boundsOf(r.pts)
  });
}
const ROAD_NAME_COUNT = new Set(ROAD_LABELS.map((l) => l.text)).size;

/** A map viewport: centre (cx, cz) in world metres, s pixels per metre, w x h CSS pixels on a canvas of pixel ratio dpr */
class MapView {
  constructor(cx, cz, s, w, h, dpr = 1) {
    this.cx = cx;
    this.cz = cz;
    this.s = s;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.minX = cx - w / (2 * s);
    this.maxX = cx + w / (2 * s);
    this.minZ = cz - h / (2 * s);
    this.maxZ = cz + h / (2 * s);
  }

  /** Canvas transform for world metres */
  world(ctx) {
    const { s, dpr } = this;
    ctx.setTransform(s * dpr, 0, 0, s * dpr, dpr * (this.w * 0.5 - this.cx * s), dpr * (this.h * 0.5 - this.cz * s));
  }

  /** Canvas transform for CSS pixels from the canvas centre (what toX / toY return) */
  screen(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.w * 0.5, this.dpr * this.h * 0.5);
  }

  toX(x) {
    return (x - this.cx) * this.s;
  }

  toY(z) {
    return (z - this.cz) * this.s;
  }

  sees(b) {
    return b && b.maxX >= this.minX && b.minX <= this.maxX && b.maxZ >= this.minZ && b.minZ <= this.maxZ;
  }
}

// Player heading arrow at the (already rotated) origin: white, on a dark halo
function drawPlayerArrow(ctx, tipY, halfWidth, tailY) {
  ctx.beginPath();
  ctx.moveTo(0, tipY);
  ctx.lineTo(halfWidth, tailY);
  ctx.lineTo(0, tailY * 0.45);
  ctx.lineTo(-halfWidth, tailY);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MAP.halo;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// Direct bearing to the waypoint; this is not street-by-street navigation.
function drawRoute(ctx, x0, y0, x1, y1, width) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = MAP.halo;
  ctx.lineWidth = width + 3;
  ctx.stroke();
  ctx.strokeStyle = MAP.route;
  ctx.lineWidth = width;
  ctx.stroke();
}

// Waypoint: a taxi-yellow target
function drawWaypoint(ctx, x, y, r) {
  ctx.fillStyle = MAP.halo;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MAP.route;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MAP.halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

// Officer marker adapted from euc-newyork@7cf4ce7/js/nyc-map.js (MIT). SF's audio view
// contains the officer's own last published position, never the brain's rider/search target.
function chaseMarker(chaser) {
  const view = chaser?.audioView;
  return view?.present === true && view.chasing === true && chaser.director?.state?.phase === 'chasing'
    && Number.isFinite(view.x) && Number.isFinite(view.z) ? view : null;
}

// CSS-pixel-only presentation: never change the officer's world position or map hit testing.
// Leave room for the rotated player arrow and both marker halos. At coincident positions choose
// north deterministically; near a canvas edge pick the closest available direction inside it.
function officerMarkerLayout(x, y, px, py, w, h) {
  const margin = 8, separation = 25;
  let mx = Math.max(-w / 2 + margin, Math.min(w / 2 - margin, x));
  let my = Math.max(-h / 2 + margin, Math.min(h / 2 - margin, y));
  const dx = mx - px, dy = my - py, distance = Math.hypot(dx, dy);
  if (distance < separation) {
    const cx = px + (distance > 1e-9 ? dx / distance : 0) * separation;
    const cy = py + (distance > 1e-9 ? dy / distance : -1) * separation;
    if (cx >= -w / 2 + margin && cx <= w / 2 - margin && cy >= -h / 2 + margin && cy <= h / 2 - margin)
      return { x: cx, y: cy, actualX: x, actualY: y };
    const base = distance > 1e-9 ? Math.atan2(dy, dx) : -Math.PI / 2;
    let best = Infinity;
    // Only try alternatives if a canvas edge blocks the exact radial direction.
    for (let i = 1; i < 16; i++) {
      const angle = base + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 8;
      const cx = px + Math.cos(angle) * separation, cy = py + Math.sin(angle) * separation;
      if (cx < -w / 2 + margin || cx > w / 2 - margin || cy < -h / 2 + margin || cy > h / 2 - margin) continue;
      const cost = (cx - x) ** 2 + (cy - y) ** 2;
      if (cost < best) { best = cost; mx = cx; my = cy; }
    }
  }
  return { x: mx, y: my, actualX: x, actualY: y };
}

// A bounded, deterministic CSS-pixel search is only needed when the player-safe marker would
// cover a pin. Test the whole marker halo against pin rectangles and the waypoint circle.
const OFFICER_DIRECTIONS = Array.from({ length: 32 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 16;
  return [Math.cos(a), Math.sin(a)];
});
function officerPositionClear(x, y, px, py, w, h, pins, pinCount, wx, wy, waypointRadius) {
  if (x < -w / 2 + 8 || x > w / 2 - 8 || y < -h / 2 + 8 || y > h / 2 - 8) return false;
  if ((x - px) ** 2 + (y - py) ** 2 < 25 ** 2 - 1e-8) return false;
  if (waypointRadius > 0 && (x - wx) ** 2 + (y - wy) ** 2 < (waypointRadius + 7.5) ** 2) return false;
  for (let i = 0; i < pinCount; i++) {
    const b = pins[i];
    const dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]);
    if (dx * dx + dy * dy < 7.5 ** 2) return false;
  }
  return true;
}

function avoidOfficerPins(marker, px, py, w, h, pins, pinCount, wx, wy, waypointRadius) {
  if (officerPositionClear(marker.x, marker.y, px, py, w, h, pins, pinCount, wx, wy, waypointRadius)) return marker;
  // Smallest sampled displacement, at 1 px radial / 11.25° angular resolution. If this
  // bounded search is saturated, retain the prior player-safe result rather than hiding either.
  const firstRadius = Math.max(1, Math.ceil(25 - Math.hypot(marker.actualX - px, marker.actualY - py) - 1e-8));
  for (let r = firstRadius; r <= 72; r++) for (let i = 0; i < OFFICER_DIRECTIONS.length; i++) {
    const direction = OFFICER_DIRECTIONS[i];
    const x = marker.actualX + r * direction[0], y = marker.actualY + r * direction[1];
    if (officerPositionClear(x, y, px, py, w, h, pins, pinCount, wx, wy, waypointRadius))
      return { x, y, actualX: marker.actualX, actualY: marker.actualY };
  }
  return marker;
}

function drawOfficerConnector(ctx, marker) {
  if (!marker || (marker.x === marker.actualX && marker.y === marker.actualY)) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(marker.actualX, marker.actualY); ctx.lineTo(marker.x, marker.y);
  ctx.strokeStyle = '#0a1118'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
}

function drawOfficerMarker(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = MAP.halo;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff3b3b';
  ctx.beginPath(); ctx.arc(x, y, 5, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3b6bff';
  ctx.beginPath(); ctx.arc(x, y, 5, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Try four sides without covering cached place/road labels or pins. Boxes share the static
// canvas's centred CSS-pixel coordinates; a small margin protects their antialiased edges.
// The live waypoint circle (wr > 0) is drawn earlier and is not cached; keep the opaque label off it.
function drawOfficerLabel(ctx, marker, px, py, w, h, textWidth, placed, wx = 0, wy = 0, wr = 0) {
  const width = Math.ceil(textWidth) + 8, height = 18, gap = 10;
  // Right, left, top, bottom, then the four diagonals before giving up on the label.
  for (let side = 0; side < 8; side++) {
    let x, y;
    if (side < 4) {
      x = side === 0 ? marker.x + gap : side === 1 ? marker.x - gap - width : marker.x - width / 2;
      y = side < 2 ? marker.y - height / 2 : side === 2 ? marker.y - gap - height : marker.y + gap;
    } else {
      x = side & 1 ? marker.x - gap - width : marker.x + gap;
      y = side < 6 ? marker.y - gap - height : marker.y + gap;
    }
    if (x < -w / 2 || x + width > w / 2 || y < -h / 2 || y + height > h / 2) continue;
    if (x < px + 14 && x + width > px - 14 && y < py + 14 && y + height > py - 14) continue;
    if (overlaps(placed, [x - 2, y - 2, x + width + 2, y + height + 2])) continue;
    if (wr > 0) {
      const dx = Math.max(x - wx, 0, wx - x - width), dy = Math.max(y - wy, 0, wy - y - height);
      if (dx * dx + dy * dy < (wr + 2) ** 2) continue;
    }
    ctx.save(); ctx.fillStyle = '#0a1118'; ctx.fillRect(x, y, width, height);
    ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.fillText('Dorkins', x + 4, y + 13); ctx.restore();
    return;
  }
}

const overlaps = (boxes, b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

// SF's authored parks; keep geographic pins and lazy checked arrivals owned by sf-destinations.js.
const isSkateboardPin = landmark => landmark.id === 'un-plaza' || landmark.id === 'zion';

// Vector marker/atlas/radar treatment adapted from euc-newyork js/nyc-map.js
// @5493af02062b947d1f0d502f8b4f3e9406b73b43 (MIT; existing LICENSE notices).
// Donor SHA-256: 1cb7895e249cc2c547ad5b71701d99ee855228bfe6d6dd38ceee3ac2e0a58dcd.
// No emoji font dependency or per-marker arrays in the live radar path.
function drawSkateboardPin(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.45);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -3); ctx.lineTo(-5, -1); ctx.lineTo(5, -1); ctx.lineTo(8, -3);
  ctx.strokeStyle = MAP.halo; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.8; ctx.stroke();
  for (let wheelX = -4; wheelX <= 4; wheelX += 8) {
    ctx.beginPath(); ctx.arc(wheelX, 3, 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = MAP.halo; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  ctx.restore();
}

class NYCMapSystem {
  constructor({ controllerManager, cameraSystem, trafficSystem, onTeleport, onToggle }) {
    this.controllerManager = controllerManager;
    this.cameraSystem = cameraSystem;
    this.trafficSystem = trafficSystem;
    this.onTeleport = onTeleport;
    this.onToggle = onToggle;

    this.miniCanvas = document.getElementById('minimap-canvas');
    this.miniCtx = this.miniCanvas ? this.miniCanvas.getContext('2d') : null;
    this.elMiniStreet = document.getElementById('minimap-street-label');
    this.miniStreetText = '';
    this.miniCache = null; // { canvas, cx, cz, s, version }: the radar's ground layers, twice the radar's size
    const elCounts = document.getElementById('fullmap-counts');
    if (elCounts) elCounts.textContent = `${ROAD_NAME_COUNT} streets · ${BLOCKS.length.toLocaleString('en-US')} blocks`;

    // The map is north up; keep the compass aligned with its georeferenced frame.
    const needle = document.getElementById('map-compass-needle');
    if (needle) needle.setAttribute('transform', `rotate(${-GRID_BEARING} 22 22)`);

    this.modal = document.getElementById('fullmap-modal');
    this.fullCanvas = document.getElementById('fullmap-canvas');
    this.fullCanvasWrap = document.getElementById('fullmap-canvas-wrap');
    this.fullCtx = this.fullCanvas ? this.fullCanvas.getContext('2d') : null;
    this.fullDpr = 1;
    this.fullStatic = null; // the full map's ground layers & labels for the current view
    this.fullStaticKey = '';
    this.fullStaticPlaced = []; // pin/name bounds belonging only to this cached view (CSS pixels)
    this.fullStaticPins = []; // symbol bounds from the same cached view, excluding text
    this.miniOfficerPins = []; // reusable radar symbol bounds; populated only while chasing
    this.elHoverInfo = document.getElementById('fullmap-hover-info');
    this.elPlayerInfo = document.getElementById('fullmap-player-info');
    this.elOfficerInfo = document.getElementById('fullmap-officer-info');
    this.elSearchInput = document.getElementById('fullmap-search');
    this.elSearchResults = document.getElementById('fullmap-search-results');
    this.elSearchList = document.getElementById('fullmap-search-list');
    this.elSearchStatus = document.getElementById('fullmap-search-status');
    this.elSearchSummary = document.getElementById('fullmap-search-summary');
    this.elActionStatus = document.getElementById('fullmap-action-status');
    if (this.elSearchInput) this.elSearchInput.placeholder = `Search ${ROAD_NAME_COUNT} streets & landmarks…`;

    this.isFullMapOpen = false;
    this.returnFocus = null;
    this.inertBackground = [];
    // Full map viewport state (world metres; zoom in CSS pixels per metre)
    this.viewCenterX = 0;
    this.viewCenterZ = 0;
    this.viewZoom = 0.22;
    this.isPanning = false;
    this.panPointerId = null;
    this.panStart = { x: 0, y: 0, cx: 0, cz: 0 };
    this.dragMoved = false;
    this.touchPointers = new Set();
    this.multiTouch = false;
    this.cancelTouchClick = false;
    this.inputDevice = 'keyboard';
    this.gamepadCursor = null;
    this.gamepadCursorElement = null;
    this.gamepadNeedsNeutral = true;

    this.hoverWorld = null;
    this.searchHighlight = '';
    this.searchPath = null;
    this.searchResults = [];
    this.textWidths = new Map();
    // Start the map waypoint at the Ferry Building.
    const ts = NYC_LANDMARKS.find((l) => l.id === 'ferrybuilding') || { x: 0, z: 0 };
    this.waypoint = { x: ts.x, z: ts.z, name: ts.name || 'Market St & Montgomery St' };

    // Street names measured before the web font arrived would be spaced for the fallback font: measure & draw again
    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.textWidths.clear();
        this.miniCache = null;
        this.fullStaticKey = '';
        if (this.isFullMapOpen) this.layoutStatus();
      });
    }

    this.initEvents();
  }

  initEvents() {
    const closeBtn = document.getElementById('close-fullmap-btn');
    const miniCard = document.getElementById('minimap-card');
    const zoomInBtn = document.getElementById('map-zoom-in');
    const zoomOutBtn = document.getElementById('map-zoom-out');
    const centerPlayerBtn = document.getElementById('map-center-player');
    const fullIslandBtn = document.getElementById('map-view-all');

    if (miniCard) {
      miniCard.addEventListener('click', () => this.toggleFullMap(true));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => this.toggleFullMap(false, { pointer: e.detail > 0 }));
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        this.viewZoom = Math.min(MAX_ZOOM, this.viewZoom * 1.45);
        this.renderFullMap();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        this.viewZoom = Math.max(MIN_ZOOM, this.viewZoom / 1.45);
        this.renderFullMap();
      });
    }
    if (centerPlayerBtn) {
      centerPlayerBtn.addEventListener('click', () => {
        const ent = this.controllerManager.getActiveEntity();
        this.viewCenterX = ent.position.x;
        this.viewCenterZ = ent.position.z;
        this.viewZoom = 0.9; // Street-by-street detail zoom
        this.renderFullMap();
      });
    }
    if (fullIslandBtn) {
      fullIslandBtn.addEventListener('click', () => {
        // Fit the full measured city. Pins are geographic, not a promise of supported EUC arrival.
        const city = window.NYC.DATA?.fullRegion?.city;
        const b = city ? { minX:city.x0,maxX:city.x1,minZ:city.z0,maxZ:city.z1 } : ISLAND_BOUNDS;
        const { w, h } = this.fullSize();
        this.viewCenterX = (b.minX + b.maxX) * 0.5;
        this.viewCenterZ = (b.minZ + b.maxZ) * 0.5;
        this.viewZoom = Math.max(MIN_ZOOM, Math.min(w / ((b.maxX - b.minX) * 1.15), h / ((b.maxZ - b.minZ) * 1.06)));
        this.renderFullMap();
      });
    }

    if (this.elSearchInput) {
      this.elSearchInput.addEventListener('input', () => this.search(this.elSearchInput.value));
      this.elSearchInput.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowDown' && this.searchResults.length) {
          e.preventDefault();
          this.elSearchList?.querySelector('button')?.focus();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.repeat || document.getElementById('settings-dialog')?.open) return;
      if (e.code === 'Escape' && this.isFullMapOpen) {
        e.preventDefault(); this.toggleFullMap(false);
      } else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingInField(e)) {
        e.preventDefault(); this.toggleFullMap(!this.isFullMapOpen);
      }
    });

    this.modal?.addEventListener('cancel', (e) => { e.preventDefault(); this.toggleFullMap(false); });
    this.modal?.addEventListener('close', () => { if (this.isFullMapOpen) this.toggleFullMap(false); });
    this.modal?.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab' || !this.isFullMapOpen) return;
      const controls = [...this.modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(el => el.tabIndex >= 0 && this.canFocus(el));
      const index = controls.indexOf(document.activeElement);
      if (!controls.length || index === -1 || (e.shiftKey ? index === 0 : index === controls.length - 1)) {
        e.preventDefault();
        (e.shiftKey ? controls.at(-1) : controls[0])?.focus({ preventScroll: true });
        if (!controls.length) this.modal.focus({ preventScroll: true });
      }
    });
    document.addEventListener('focusin', (e) => {
      if (!this.isFullMapOpen) return;
      this.resetGamepadInput();
      if (this.modal && !this.modal.contains(e.target)) this.modal.focus({ preventScroll: true });
    });
    // A second finger cancels the complete map gesture until every finger lifts.
    window.addEventListener('pointerdown', (e) => {
      if (!this.isFullMapOpen) return;
      this.setInputDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard');
      if (!this.touchPointers.size) this.cancelTouchClick = false;
      if (e.pointerType !== 'touch') return;
      this.touchPointers.add(e.pointerId);
      if (this.touchPointers.size > 1 || e.isPrimary === false) {
        this.multiTouch = this.cancelTouchClick = true;
        this.cancelPan();
      }
    }, true);
    for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, (e) => {
      this.touchPointers.delete(e.pointerId);
      if (!this.touchPointers.size) this.multiTouch = false;
    }, true);
    // Capture before native click activation: this also covers zoom/close buttons after a cancelled touch gesture.
    this.modal?.addEventListener('click', (e) => {
      if (this.cancelTouchClick && (e.pointerType === 'touch' || e.detail > 0)) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);

    if (this.fullCanvas) {
      this.fullCanvas.style.touchAction = 'none';
      this.fullCanvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !this.isFullMapOpen || this.panPointerId !== null || this.multiTouch) return;
        e.preventDefault();
        this.panPointerId = e.pointerId;
        this.fullCanvas.setPointerCapture(e.pointerId);
        this.isPanning = true;
        this.dragMoved = false;
        this.panStart.x = e.clientX;
        this.panStart.y = e.clientY;
        this.panStart.cx = this.viewCenterX;
        this.panStart.cz = this.viewCenterZ;
        if (this.fullCanvasWrap) this.fullCanvasWrap.classList.add('is-panning');
      });

      this.fullCanvas.addEventListener('pointermove', (e) => {
        if (!this.isFullMapOpen || !this.fullCanvas) return;
        if (this.isPanning ? e.pointerId !== this.panPointerId : e.pointerType !== 'mouse') return;
        this.setInputDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard');
        const rect = this.fullCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this.isPanning) {
          e.preventDefault();
          const dx = e.clientX - this.panStart.x;
          const dy = e.clientY - this.panStart.y;
          if (Math.hypot(dx, dy) > 5) this.dragMoved = true;
          this.viewCenterX = this.panStart.cx - dx / this.viewZoom;
          this.viewCenterZ = this.panStart.cz - dy / this.viewZoom;
          this.renderFullMap();
          return;
        }

        if (mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height) {
          const wPos = this.screenToWorld(mx, my, rect.width, rect.height);
          this.hoverWorld = wPos;
          if (this.elHoverInfo) {
            this.updateHoverInfo(wPos);
          }
        }
      });

      this.fullCanvas.addEventListener('pointerup', (e) => {
        if (e.pointerId !== this.panPointerId) return;
        const clicked = !this.dragMoved && !this.cancelTouchClick && !this.multiTouch
          && Math.hypot(e.clientX - this.panStart.x, e.clientY - this.panStart.y) <= 5;
        this.cancelPan();
        if (clicked && this.isFullMapOpen && this.fullCanvas) {
          const rect = this.fullCanvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          if (mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height) {
            const point = this.screenToWorld(mx, my, rect.width, rect.height);
            this.teleportToPoint(point, this.authoredPinAt(point));
          }
        }
      });
      for (const type of ['pointercancel', 'lostpointercapture']) {
        this.fullCanvas.addEventListener(type, (e) => {
          if (e.pointerId === this.panPointerId) this.cancelPan();
        });
      }
      window.addEventListener('blur', () => this.cancelGestures());
      window.addEventListener('focus', () => this.resetGamepadInput());
      window.addEventListener('resize', () => this.cancelGestures());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.cancelGestures();
      });

      // Wheel zoom about the cursor (the place under it stays put)
      this.fullCanvas.addEventListener('wheel', (e) => {
        if (!this.isFullMapOpen) return;
        e.preventDefault();
        const rect = this.fullCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const before = this.screenToWorld(mx, my, rect.width, rect.height);
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        this.viewZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.viewZoom * factor));
        this.viewCenterX = before.x - (mx - rect.width * 0.5) / this.viewZoom;
        this.viewCenterZ = before.z - (my - rect.height * 0.5) / this.viewZoom;
        this.renderFullMap();
      }, { passive: false });
    }
  }

  // NYC native map controls @9c4cfc9e32a425d58bac36cf9e074a2aa77fac70, adapted over SF's retained map layers.
  setInputDevice(device) {
    if (!['gamepad', 'keyboard', 'touch'].includes(device) || this.inputDevice === device) return;
    if (device !== 'gamepad') this.resetGamepadInput();
    this.inputDevice = device;
    if (this.modal?.dataset) this.modal.dataset.input = device;
    if (this.gamepadCursorElement) this.gamepadCursorElement.hidden = device !== 'gamepad' || !this.isFullMapOpen;
    if (this.hoverWorld) this.updateHoverInfo(this.hoverWorld);
    if (this.searchResults.length) this.updateSearchFeedback(this.landmarkSearchFeedback());
    this.layoutStatus();
  }

  landmarkSearchFeedback() {
    const count = this.searchResults.length;
    const instructions = this.inputDevice === 'gamepad' ? 'Use D-pad to choose, then A to try arrival.'
      : this.inputDevice === 'touch' ? 'Tap a result to try arrival.' : 'Tab or press Down to choose an arrival.';
    return `${count} landmark ${count === 1 ? 'result' : 'results'}. ${instructions}`;
  }

  updateSearchFeedback(text) {
    for (const element of [this.elSearchStatus, this.elSearchSummary]) {
      if (element && element.textContent !== text) element.textContent = text;
    }
  }

  resetGamepadInput() { this.gamepadNeedsNeutral = true; }

  updateHoverInfo(point, target = null) {
    if (!this.elHoverInfo) return;
    const action = this.inputDevice === 'gamepad' ? 'A to try arrival here'
      : this.inputDevice === 'touch' ? 'Tap to try arrival here' : 'Click to try arrival here';
    const text = target ? `A · ${target.getAttribute?.('aria-label') || target.title || target.textContent || 'Activate control'}`
      : `${getLocationLabel(point.x, point.z)} · ${action}`;
    if (this.elHoverInfo.textContent !== text) this.elHoverInfo.textContent = text;
  }

  showGamepadCursor(rect) {
    this.gamepadCursor ??= { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const inset = Math.min(12, rect.width / 2, rect.height / 2);
    this.gamepadCursor.x = Math.max(rect.left + inset, Math.min(rect.left + rect.width - inset, this.gamepadCursor.x));
    this.gamepadCursor.y = Math.max(rect.top + inset, Math.min(rect.top + rect.height - inset, this.gamepadCursor.y));
    if (!this.gamepadCursorElement && this.modal) {
      const cursor = document.createElement('div');
      cursor.className = 'fullmap-gamepad-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      Object.assign(cursor.style, { position: 'fixed', zIndex: '100', pointerEvents: 'none',
        width: '24px', height: '24px', border: '2px solid #ffc21a', borderRadius: '50%',
        boxSizing: 'border-box', transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 0 2px #0a1118, inset 0 0 0 1px #0a1118',
        background: 'radial-gradient(circle, #ffc21a 0 2px, transparent 3px)' });
      this.modal.appendChild(cursor);
      this.gamepadCursorElement = cursor;
    }
    if (this.gamepadCursorElement) {
      this.gamepadCursorElement.hidden = false;
      this.gamepadCursorElement.style.left = `${this.gamepadCursor.x}px`;
      this.gamepadCursorElement.style.top = `${this.gamepadCursor.y}px`;
    }
  }

  /** Map-owned polls include neutral samples; actions are fresh edges. LS cursor, RS pan, triggers zoom. */
  applyGamepadInput({ movement = {}, look = {}, zoom = 0, actions = {}, neutral = false } = {}, dt = 0) {
    if (!this.isFullMapOpen || document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())) return;
    const usingPad = [movement.x, movement.y, look.x, look.y, zoom].some(value => Number.isFinite(value) && value !== 0)
      || Object.values(actions).some(Boolean);
    if (usingPad) this.setInputDevice('gamepad');
    const rect = this.fullCanvas?.getBoundingClientRect();
    if (!rect || !(rect.width > 0 && rect.height > 0)) return;
    if (this.inputDevice === 'gamepad') this.showGamepadCursor(rect);
    if (this.gamepadNeedsNeutral) {
      if (neutral) this.gamepadNeedsNeutral = false;
      return;
    }
    if (this.inputDevice !== 'gamepad') return;
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
    const value = n => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
    const mx = value(movement.x), my = value(movement.y), lx = value(look.x), ly = value(look.y);
    const cursor = this.gamepadCursor;
    const inset = Math.min(12, rect.width / 2, rect.height / 2);
    cursor.x = Math.max(rect.left + inset, Math.min(rect.left + rect.width - inset, cursor.x + mx * 480 * seconds));
    cursor.y = Math.max(rect.top + inset, Math.min(rect.top + rect.height - inset, cursor.y + my * 480 * seconds));
    if (actions.navigate) {
      const controls = [...this.modal.querySelectorAll('button, a[href]')].filter(el => this.canFocus(el));
      const index = controls.indexOf(document.activeElement);
      const nextIndex = index < 0 ? (actions.navigate > 0 ? 0 : controls.length - 1)
        : (index + (actions.navigate > 0 ? 1 : -1) + controls.length) % controls.length;
      const next = controls[nextIndex];
      next?.scrollIntoView?.({ block: 'nearest' });
      next?.focus({ preventScroll: true });
      const box = next?.getBoundingClientRect();
      if (box?.width > 0 && box?.height > 0) {
        cursor.x = box.left + box.width / 2;
        cursor.y = box.top + box.height / 2;
      }
      this.showGamepadCursor(rect);
      if (next) this.updateHoverInfo(this.screenToWorld(cursor.x - rect.left, cursor.y - rect.top, rect.width, rect.height), next);
      return; // selection and A in one sample never activates
    }
    const hit = document.elementFromPoint?.(cursor.x, cursor.y);
    const button = hit?.closest?.('button, a[href]');
    const target = button && this.modal?.contains(button) && this.canFocus(button) ? button : null;
    const onCanvas = hit === this.fullCanvas;
    const edgePan = (position, start, size, direction) => {
      if (!onCanvas) return 0;
      const local = position - start;
      if (direction < 0 && local < 32) return direction * (1 - local / 32);
      if (direction > 0 && local > size - 32) return direction * (1 - (size - local) / 32);
      return 0;
    };
    const panX = lx * 480 + edgePan(cursor.x, rect.left, rect.width, mx) * 360;
    const panY = ly * 480 + edgePan(cursor.y, rect.top, rect.height, my) * 360;
    this.viewCenterX += panX * seconds / this.viewZoom;
    this.viewCenterZ += panY * seconds / this.viewZoom;
    const sx = cursor.x - rect.left, sy = cursor.y - rect.top;
    const before = this.screenToWorld(sx, sy, rect.width, rect.height), oldZoom = this.viewZoom;
    this.viewZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * Math.exp(value(zoom) * 1.8 * seconds)));
    if (onCanvas && this.viewZoom !== oldZoom) {
      this.viewCenterX = before.x - (sx - rect.width / 2) / this.viewZoom;
      this.viewCenterZ = before.z - (sy - rect.height / 2) / this.viewZoom;
    }
    this.hoverWorld = this.screenToWorld(sx, sy, rect.width, rect.height);
    this.updateHoverInfo(this.hoverWorld, target);
    if (this.gamepadCursorElement) this.gamepadCursorElement.style.borderColor = target ? MAP.search : MAP.route;
    this.showGamepadCursor(rect);
    if (actions.recenter || actions.fit) {
      document.getElementById(actions.recenter ? 'map-center-player' : 'map-view-all')?.click();
    } else if (actions.activate) {
      if (target) { target.focus({ preventScroll: true }); target.click(); }
      else if (onCanvas) this.teleportToPoint(this.hoverWorld, this.authoredPinAt(this.hoverWorld));
    }
    if (panX || panY || oldZoom !== this.viewZoom) this.renderFullMap();
  }

  /** Highlight native SF street geometry and frame landmark pins without preparing or moving a rider. */
  search(text) {
    const q = String(text || '').trim().toLowerCase();
    this.searchHighlight = q;
    this.searchPath = null;
    this.searchBounds = null;
    this.searchResults = [];
    let roads = [];
    if (q.length > 0) {
      this.searchResults = NYC_LANDMARKS.filter(l => (l.name || '').toLowerCase().includes(q) || (l.short || '').toLowerCase().includes(q)
        || (l.aliases || []).some(alias => alias.toLowerCase().includes(q)));
      const lmMatch = this.searchResults[0];
      roads = ROAD_LABELS.filter((l) => l.lower.includes(q) || l.raw.includes(q));
      if (roads.length) {
        this.searchPath = new Path2D();
        const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const l of roads) {
          addLine(this.searchPath, l.road.pts);
          b.minX = Math.min(b.minX, l.minX);
          b.maxX = Math.max(b.maxX, l.maxX);
          b.minZ = Math.min(b.minZ, l.minZ);
          b.maxZ = Math.max(b.maxZ, l.maxZ);
        }
        this.searchBounds = b;
      }
      if (lmMatch) {
        this.viewCenterX = lmMatch.x;
        this.viewCenterZ = lmMatch.z;
        this.viewZoom = Math.max(this.viewZoom, 0.9);
      } else if (roads.length) {
        const b = this.searchBounds;
        const { w, h } = this.fullSize();
        this.viewCenterX = (b.minX + b.maxX) * 0.5;
        this.viewCenterZ = (b.minZ + b.maxZ) * 0.5;
        const fit = Math.min(w / ((b.maxX - b.minX) * 1.3 + 1), h / ((b.maxZ - b.minZ) * 1.3 + 1));
        this.viewZoom = Math.max(0.05, Math.min(1.2, fit));
      }
    }
    if (this.elSearchList) this.elSearchList.replaceChildren(...this.searchResults.map(landmark => {
      const item = document.createElement('li'), button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Teleport to ${landmark.name || landmark.short || 'landmark'}`;
      button.addEventListener('click', (e) => {
        if (this.cancelTouchClick && (e.pointerType === 'touch' || e.detail > 0)) return;
        this.teleportToPoint(landmark, landmark);
      });
      item.appendChild(button);
      return item;
    }));
    if (this.elSearchResults) this.elSearchResults.hidden = !q;
    const streetCount = new Set(roads.map(r => r.text)).size;
    this.updateSearchFeedback(!q ? '' : this.searchResults.length ? this.landmarkSearchFeedback()
      : streetCount ? `${streetCount} matching ${streetCount === 1 ? 'street' : 'streets'} highlighted. No landmark results.`
        : `No streets or landmarks match “${String(text).trim()}”.`);
    this.layoutStatus();
    this.renderFullMap();
  }

  authoredPinAt(point) {
    let nearest = null, distance = Infinity;
    for (const landmark of NYC_LANDMARKS) {
      if (!this.arrivalFor(landmark)) continue;
      const pixels = Math.hypot(landmark.x - point.x, landmark.z - point.z) * this.viewZoom;
      if (pixels <= (isSkateboardPin(landmark) ? 12 : 8) && pixels < distance) { nearest = landmark; distance = pixels; }
    }
    return nearest;
  }

  arrivalFor(landmark) {
    if (!landmark) return null;
    if (landmark?.arrival) return landmark.arrival;
    // SF's existing city-config owns roadside poses separately from the researched map pins.
    return Object.values(window.NYC.TELEPORT_LOCATIONS || {}).find(arrival => arrival.landmark === landmark?.name) ?? null;
  }

  teleportToPoint(point, landmark = null) {
    const arrival = this.arrivalFor(landmark), target = arrival || point;
    if (![target?.x, target?.z].every(Number.isFinite)) return false;
    let result;
    try { result = this.onTeleport?.(target.x, target.z, target.heading, target.referenceY ?? target.y,
      { departure: target.exact === true ? target.departure ?? 0 : 0, exact: target.exact === true }); }
    catch { result = null; }
    // A scenery pin, missing host callback or unchecked/async callback never proves supported arrival.
    const succeeded = result?.succeeded === true && [result.x, result.z].every(Number.isFinite);
    if (succeeded) {
      const name = landmark?.name || landmark?.short || getLocationLabel(result.x, result.z);
      this.waypoint = { x: result.x, z: result.z, name };
      if (this.elActionStatus) this.elActionStatus.textContent = `Teleported to ${name}.`;
    } else if (this.elActionStatus) {
      this.elActionStatus.textContent = 'Teleport unavailable: no safe EUC arrival here. Choose another spot or try again.';
    }
    if (this.elHoverInfo) this.elHoverInfo.hidden = Boolean(this.elActionStatus?.textContent);
    this.layoutStatus();
    this.renderFullMap();
    return succeeded;
  }

  cancelGestures() {
    this.resetGamepadInput();
    if (this.touchPointers.size) this.cancelTouchClick = true;
    this.cancelPan();
    this.touchPointers.clear();
    this.multiTouch = false;
  }

  cancelPan() {
    const id = this.panPointerId;
    this.panPointerId = null;
    this.isPanning = false;
    if (this.fullCanvasWrap) this.fullCanvasWrap.classList.remove('is-panning');
    if (id !== null && this.fullCanvas && this.fullCanvas.hasPointerCapture(id)) this.fullCanvas.releasePointerCapture(id);
  }

  toggleFullMap(open, { pointer = false } = {}) {
    open = Boolean(open);
    if (open && this.enabled === false || open === this.isFullMapOpen) return;
    this.isFullMapOpen = open;
    this.resetGamepadInput();
    this.gamepadCursor = null;
    if (this.gamepadCursorElement) this.gamepadCursorElement.hidden = true;
    if (!open) this.cancelGestures();
    // Retain the invoker before the host's owner transition can change focus.
    if (open) this.returnFocus = document.activeElement;
    this.onToggle?.(open);
    if (!this.modal) return;
    this.modal.classList.toggle('hidden', !open);
    this.modal.inert = !open;
    if (open) {
      for (const pop of document.querySelectorAll('.popover[popover]')) {
        if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) pop.hidePopover();
      }
      for (let branch = this.modal; branch && branch !== document.body; branch = branch.parentElement) {
        for (const element of branch.parentElement?.children || []) {
          if (element === branch) continue;
          this.inertBackground.push({ element, inert: element.inert });
          element.inert = true;
        }
      }
      this.modal.showModal?.();
      if (!this.searchHighlight) {
        const ent = this.controllerManager.getActiveEntity();
        this.viewCenterX = ent.position.x;
        this.viewCenterZ = ent.position.z;
      }
      this.resizeFullCanvas();
      this.renderFullMap();
      this.modal.focus({ preventScroll: true });
    } else {
      this.modal.close?.();
      for (const { element, inert } of this.inertBackground) element.inert = inert;
      this.inertBackground.length = 0;
      const target = [...(pointer ? [document.getElementById('canvas-container')] : []), this.returnFocus,
        document.getElementById('btn-open-map'), document.getElementById('btn-toggle-hud')].find(el => this.canFocus(el));
      this.returnFocus = null;
      target?.focus({ preventScroll: true });
    }
  }

  canFocus(element) {
    return Boolean(element?.isConnected && !element.disabled && !element.closest('[inert]') && element.getClientRects().length
      && window.getComputedStyle(element).visibility === 'visible');
  }

  /** Called by the host's coalesced CSS-size resize path; no 3D-resolution coupling. */
  resize() {
    this.cancelGestures();
    this.miniCache = null;
    this.fullStaticKey = '';
    if (this.isFullMapOpen) { this.resizeFullCanvas(); this.renderFullMap(); }
  }

  resizeFullCanvas() {
    if (!this.fullCanvas) return;
    this.layoutStatus();
    // Layout size (the opening animation's transforms don't change it), at most ~6 megapixels however large the screen
    const w = this.fullCanvas.clientWidth;
    const h = this.fullCanvas.clientHeight;
    if (!(w > 0 && h > 0)) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6e6 / Math.max(1, w * h)));
    const width = Math.max(1, Math.floor(w * dpr)), height = Math.max(1, Math.floor(h * dpr));
    if (this.fullDpr === dpr && this.fullCanvas.width === width && this.fullCanvas.height === height) return;
    this.resetGamepadInput();
    this.fullDpr = dpr;
    this.fullCanvas.width = width;
    this.fullCanvas.height = height;
  }

  layoutStatus() {
    if (!this.modal?.style?.setProperty) return;
    for (const [id, variable] of [['fullmap-credits', '--map-credits-height'], ['fullmap-footer', '--map-status-height']]) {
      const height = document.getElementById(id)?.getBoundingClientRect?.().height;
      if (height > 0) this.modal.style.setProperty(variable, `${Math.ceil(height)}px`);
    }
  }

  // Full map size in CSS pixels
  fullSize() {
    const dpr = this.fullDpr || 1;
    if (!this.fullCanvas) return { w: 1200, h: 800 };
    return { w: this.fullCanvas.width / dpr, h: this.fullCanvas.height / dpr };
  }

  screenToWorld(sx, sy, width, height) {
    return {
      x: this.viewCenterX + (sx - width * 0.5) / this.viewZoom,
      z: this.viewCenterZ + (sy - height * 0.5) / this.viewZoom
    };
  }

  textWidth(ctx, text) {
    const key = `${ctx.font}|${ctx.letterSpacing || ''}|${text}`;
    let w = this.textWidths.get(key);
    if (w === undefined) {
      w = ctx.measureText(text).width;
      this.textWidths.set(key, w);
    }
    return w;
  }

  /**
   * The ground: SF terrain and coastline, piers, parks, blocks, building footprints, landmark
   * lots, the main streets at low zoom, shore highways, bridges and the search highlight (world transform of view v)
   */
  drawWorld(ctx, v, isMinimap) {
    const L = mapLayers();
    const s = v.s;
    const px = (n) => n / s; // screen pixels -> metres (line widths)
    v.world(ctx);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const relief = mapRelief();
    if (relief) ctx.drawImage(relief.canvas, relief.x, relief.z, relief.width, relief.height);

    // Detailed core roads and piers overlay the regional terrain.
    ctx.fillStyle = MAP.piers;
    ctx.fill(L.piers);
    ctx.fillStyle = MAP.streets;
    ctx.fill(L.manhattan);
    ctx.strokeStyle = MAP.shore;
    ctx.lineWidth = px(isMinimap ? 1.6 : 2.0);
    ctx.stroke(L.manhattan);

    // 3. Parkland, blocks (curb islands) and park blocks
    ctx.fillStyle = MAP.park;
    L.parkLand.each(v, (p) => ctx.fill(p));
    ctx.fillStyle = MAP.block;
    L.blocks.each(v, (p) => ctx.fill(p));
    if (s >= 0.22) {
      ctx.strokeStyle = MAP.blockEdge;
      ctx.lineWidth = px(Math.min(1.2, 0.5 + s));
      L.blocks.each(v, (p) => ctx.stroke(p));
    }
    ctx.fillStyle = MAP.park;
    L.parkBlocks.each(v, (p) => ctx.fill(p));
    if (s >= 0.1) {
      ctx.strokeStyle = MAP.parkEdge;
      ctx.lineWidth = px(1);
      L.parkBlocks.each(v, (p) => ctx.stroke(p));
    }

    // Subtle relief over the core lots, with labels and streets still legible.
    if (relief) { ctx.globalAlpha = 0.24; ctx.drawImage(relief.canvas, relief.x, relief.z, relief.width, relief.height); ctx.globalAlpha = 1; }

    // 5. Building footprints, lowest first
    if (s >= 0.18) {
      const fp = footprintLayers();
      if (fp) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = MAP.buildings[i];
          fp.tones[i].each(v, (p) => ctx.fill(p));
        }
        if (s >= 0.6) {
          ctx.strokeStyle = MAP.buildingEdge;
          ctx.lineWidth = px(0.8);
          for (let i = 0; i < 3; i++) fp.tones[i].each(v, (p) => ctx.stroke(p));
        }
      }
    }

    // 6. Landmark lots (real OpenStreetMap outlines)
    if (s >= 0.05) {
      ctx.fillStyle = MAP.block;
      ctx.fill(L.landmarks);
      ctx.fillStyle = MAP.landmarkFill;
      ctx.fill(L.landmarks);
      ctx.strokeStyle = MAP.landmarkEdge;
      ctx.lineWidth = px(Math.max(0.9, Math.min(1.6, 1.4 * s)));
      ctx.stroke(L.landmarks);
    }

    // 7. Main streets as lines at low zoom
    if (s < 0.16) {
      ctx.strokeStyle = MAP.mainRoads;
      ctx.lineWidth = px(s < 0.05 ? 0.7 : 1.1);
      L.mainRoads.each(v, (p) => ctx.stroke(p));
    }

    // 8. Shore highways
    ctx.strokeStyle = MAP.highway;
    ctx.lineWidth = Math.max(px(isMinimap ? 2.4 : 1.6), 14);
    ctx.stroke(L.highways);

    // 9. Bridges
    ctx.strokeStyle = MAP.bridge;
    ctx.lineCap = 'butt';
    for (const br of L.bridges) {
      ctx.lineWidth = Math.max(px(2), br.width);
      ctx.stroke(br.path);
    }
    ctx.lineCap = 'round';

    // 10. Search highlight: every stretch of the matching streets
    if (this.searchPath && !isMinimap) {
      ctx.strokeStyle = MAP.search;
      ctx.lineWidth = Math.max(px(3), 9);
      ctx.stroke(this.searchPath);
    }
  }

  /**
   * Street names along the streets (screen transform of view v): the best anchor of each street that fits its name,
   * one label per street per `sameNameGap` pixels, none overlapping another (or the boxes already in `placed`)
   */
  drawRoadLabels(ctx, v, { fontPx = 10, maxLabels = 400, sameNameGap = 260, placed = [], majorOnly = false } = {}) {
    const s = v.s;
    const q = this.searchHighlight;
    ctx.font = `600 ${fontPx}px ${FONT}`;
    const inset = (fontPx * 2.5) / s;
    const minX = v.minX + inset;
    const maxX = v.maxX - inset;
    const minZ = v.minZ + inset;
    const maxZ = v.maxZ - inset;
    const cands = [];
    for (const l of ROAD_LABELS) {
      if (l.maxX < minX || l.minX > maxX || l.maxZ < minZ || l.minZ > maxZ) continue;
      const hit = q.length > 0 && (l.lower.includes(q) || l.raw.includes(q));
      if (majorOnly && !l.major && !hit) continue;
      const width = this.textWidth(ctx, l.text);
      const need = (width + 14) / s;
      for (const a of l.anchors) {
        if (a.len < need || a.x < minX || a.x > maxX || a.z < minZ || a.z > maxZ) continue;
        const d = Math.hypot(a.x - v.cx, a.z - v.cz) * s;
        cands.push({ l, a, width, hit, score: (hit ? 1e6 : 0) + (l.highway ? 3000 : 0) + (l.major ? 2000 : 0) + Math.min(a.len * s, 400) - d * 0.5 });
      }
    }
    cands.sort((a, b) => b.score - a.score);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = MAP.halo;
    const byName = new Map();
    let n = 0;
    for (const c of cands) {
      if (n >= maxLabels) break;
      const X = v.toX(c.a.x);
      const Y = v.toY(c.a.z);
      const same = byName.get(c.l.text);
      if (same && same.some(([x, y]) => Math.hypot(x - X, y - Y) < sameNameGap)) continue;
      const hw = c.width * 0.5 + 3;
      const hh = fontPx * 0.5 + 2;
      const ca = Math.abs(Math.cos(c.a.ang));
      const sa = Math.abs(Math.sin(c.a.ang));
      const bx = hw * ca + hh * sa;
      const by = hw * sa + hh * ca;
      const box = [X - bx, Y - by, X + bx, Y + by];
      if (overlaps(placed, box)) continue;
      placed.push(box);
      if (same) same.push([X, Y]);
      else byName.set(c.l.text, [[X, Y]]);
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(c.a.ang);
      ctx.fillStyle = c.hit ? MAP.search : c.l.highway ? '#e3a857' : c.l.major ? '#e8ebf0' : '#9ba5b3';
      ctx.strokeText(c.l.text, 0, 0);
      ctx.fillText(c.l.text, 0, 0);
      ctx.restore();
      n++;
    }
    ctx.textBaseline = 'alphabetic';
  }

  update() {
    // The full map covers the whole screen, radar included
    if (this.isFullMapOpen) {
      this.renderFullMap();
    } else {
      this.renderMinimap();
    }
  }

  // =========================================================================
  // 1. GTA 6-STYLE LIVE RADAR MINIMAP (BOTTOM-LEFT HUD)
  // =========================================================================
  renderMinimap() {
    if (!this.miniCtx || !this.miniCanvas) return;
    // Nothing to draw while the radar is hidden (narrow screens, clean view)
    if (!this.miniCanvas.offsetParent || document.body.classList.contains('hud-minimized')) return;
    const ctx = this.miniCtx;
    // Radar size in CSS pixels, backed at the device pixel ratio (crisp street names on HiDPI screens)
    const w = this.miniCanvas.clientWidth;
    const h = this.miniCanvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.miniCanvas.width !== bw || this.miniCanvas.height !== bh) {
      this.miniCanvas.width = bw;
      this.miniCanvas.height = bh;
      this.miniCache = null;
    }

    const ent = this.controllerManager.getActiveEntity();
    const px = ent.position.x;
    const pz = ent.position.z;
    const scale = RADAR_SCALE;

    if (this.elMiniStreet) {
      const label = getLocationLabel(px, pz);
      if (label !== this.miniStreetText) {
        this.miniStreetText = label;
        this.elMiniStreet.textContent = label;
      }
    }

    // Ground layers & street names come from a cached render twice the radar's size, redrawn when the player nears its
    // edge or the zoom drifts (or the buildings arrive)
    const fp = footprintLayers();
    const version = fp ? fp.version : 0;
    let c = this.miniCache;
    if (!c || c.version !== version || Math.abs(scale / c.s - 1) > 0.12 ||
      Math.abs(px - c.cx) > w / c.s - w / (2 * scale) - 8 / scale ||
      Math.abs(pz - c.cz) > h / c.s - h / (2 * scale) - 8 / scale) {
      if (!c) {
        c = this.miniCache = { canvas: document.createElement('canvas') };
        c.canvas.width = bw * 2;
        c.canvas.height = bh * 2;
        c.ctx = c.canvas.getContext('2d');
      }
      c.cx = px;
      c.cz = pz;
      c.s = scale;
      c.version = version;
      c.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.ctx.fillStyle = MAP.water;
      c.ctx.fillRect(0, 0, bw * 2, bh * 2);
      const cv = new MapView(px, pz, scale, w * 2, h * 2, dpr);
      this.drawWorld(c.ctx, cv, true);
      cv.screen(c.ctx);
      this.drawRoadLabels(c.ctx, cv, { fontPx: 9.5, maxLabels: 28, sameNameGap: 180 });
    }

    const v = new MapView(px, pz, scale, w, h, dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = MAP.water;
    ctx.fillRect(0, 0, bw, bh);
    const k = scale / c.s;
    ctx.drawImage(c.canvas, dpr * ((c.cx - w / c.s - px) * scale + w * 0.5), dpr * ((c.cz - h / c.s - pz) * scale + h * 0.5),
      dpr * w * 2 * k, dpr * h * 2 * k);

    v.screen(ctx);
    const toX = (wx) => v.toX(wx);
    const toY = (wz) => v.toY(wz);

    // Live moving traffic blips on radar
    if (this.trafficSystem && this.trafficSystem.cars) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.34)';
      for (let i = 0; i < this.trafficSystem.cars.length; i += 2) {
        const car = this.trafficSystem.cars[i];
        const cx = toX(car.x);
        const cy = toY(car.z);
        if (Math.abs(cx) < w * 0.5 && Math.abs(cy) < h * 0.5) {
          ctx.fillRect(cx - 1, cy - 1, 2, 2);
        }
      }
    }

    // Direct bearing to the active waypoint
    if (this.waypoint) {
      const wx = toX(this.waypoint.x);
      const wy = toY(this.waypoint.z);
      drawRoute(ctx, 0, 0, wx, wy, 3);
      drawWaypoint(ctx, wx, wy, 4.5);
    }

    const officer = chaseMarker(this.chaser);
    const officerPins = this.miniOfficerPins ??= [];
    let officerPinCount = 0;
    // Landmark blips
    for (const lm of NYC_LANDMARKS) {
      const lx = toX(lm.x);
      const ly = toY(lm.z);
      if (Math.abs(lx) < w * 0.48 && Math.abs(ly) < h * 0.48) {
        if (officer) {
          const radius = isSkateboardPin(lm) ? 10 : 4.5;
          const pin = officerPins[officerPinCount] ??= [0, 0, 0, 0];
          pin[0] = lx - radius; pin[1] = ly - radius; pin[2] = lx + radius; pin[3] = ly + radius;
          officerPinCount++;
        }
        if (isSkateboardPin(lm)) { drawSkateboardPin(ctx, lx, ly, 0.8); continue; }
        ctx.fillStyle = MAP.halo;
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Like NYC, hold a distant chasing officer at the radar rim to show his bearing.
    let officerMarker = null;
    if (officer && w > 0 && h > 0) {
      let x = toX(officer.x), y = toY(officer.z);
      const rim = Math.max(Math.abs(x) / (w * 0.44), Math.abs(y) / (h * 0.44));
      if (rim > 1) { x /= rim; y /= rim; }
      officerMarker = officerMarkerLayout(x, y, 0, 0, w, h);
      officerMarker = avoidOfficerPins(officerMarker, 0, 0, w, h, officerPins, officerPinCount,
        this.waypoint ? toX(this.waypoint.x) : 0, this.waypoint ? toY(this.waypoint.z) : 0, this.waypoint ? 6.5 : 0);
    }

    // Camera FOV Cone & Player Arrow at center (0, 0)
    const camDir = this.cameraSystem.currentLookAt.clone().sub(this.cameraSystem.currentPos);
    const camAngle = Math.atan2(camDir.x, camDir.z);

    ctx.save();
    ctx.rotate(-camAngle + Math.PI);
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 58);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 58, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawOfficerConnector(ctx, officerMarker);
    // Player heading arrow
    ctx.save();
    ctx.rotate(-ent.heading + Math.PI);
    drawPlayerArrow(ctx, -9, 6.5, 7);
    ctx.restore();
    if (officerMarker) drawOfficerMarker(ctx, officerMarker.x, officerMarker.y);

    ctx.restore();
  }

  // =========================================================================
  // 2. FULL SAN FRANCISCO INTERACTIVE STREET MAP MODAL ([M])
  // =========================================================================
  renderFullMap() {
    if (!this.fullCtx || !this.fullCanvas || !this.isFullMapOpen) return;
    const ctx = this.fullCtx;
    const dpr = this.fullDpr || 1;
    const { w, h } = this.fullSize();
    const v = new MapView(this.viewCenterX, this.viewCenterZ, this.viewZoom, w, h, dpr);

    const ent = this.controllerManager.getActiveEntity();
    const officer = chaseMarker(this.chaser);
    if (this.elOfficerInfo) {
      const text = officer ? 'Officer Dorkins is pursuing you; his marker appears when in view.' : 'No pursuing officer marker.';
      if (this.elOfficerInfo.textContent !== text) this.elOfficerInfo.textContent = text;
    }
    if (this.elPlayerInfo) {
      const text = `You are at ${getLocationLabel(ent.position.x, ent.position.z)}`;
      if (text !== this.playerInfoText) {
        this.playerInfoText = text;
        this.elPlayerInfo.textContent = text;
      }
    }

    // Ground layers, names & landmark pins: re-rendered only when the view, the search or the buildings change
    const fp = footprintLayers();
    const key = `${v.cx}|${v.cz}|${v.s}|${this.fullCanvas.width}|${this.fullCanvas.height}|${dpr}|${this.searchHighlight}|${fp ? fp.version : 0}`;
    if (!this.fullStatic) this.fullStatic = document.createElement('canvas');
    if (key !== this.fullStaticKey) {
      this.fullStaticKey = key;
      const sc = this.fullStatic;
      if (sc.width !== this.fullCanvas.width || sc.height !== this.fullCanvas.height) {
        sc.width = this.fullCanvas.width;
        sc.height = this.fullCanvas.height;
      }
      const staticBounds = this.renderFullMapStatic(sc.getContext('2d'), v);
      this.fullStaticPlaced = staticBounds?.placed || [];
      this.fullStaticPins = staticBounds?.pins || [];
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fullStatic, 0, 0);
    v.screen(ctx);
    const toX = (wx) => v.toX(wx);
    const toY = (wz) => v.toY(wz);

    // Direct waypoint bearing on the full map
    if (this.waypoint) {
      const wx = toX(this.waypoint.x);
      const wy = toY(this.waypoint.z);
      drawRoute(ctx, toX(ent.position.x), toY(ent.position.z), wx, wy, 4);
      drawWaypoint(ctx, wx, wy, 7);
    }

    const px = toX(ent.position.x);
    const py = toY(ent.position.z);
    // The atlas is a top-down X/Z projection, not an indication of the officer's floor.
    let officerMarker = null;
    if (officer) {
      const x = toX(officer.x), y = toY(officer.z);
      if (Math.abs(x) <= w * 0.5 && Math.abs(y) <= h * 0.5) {
        officerMarker = officerMarkerLayout(x, y, px, py, w, h);
        const pins = this.fullStaticPins || [];
        officerMarker = avoidOfficerPins(officerMarker, px, py, w, h, pins, pins.length,
          this.waypoint ? toX(this.waypoint.x) : 0, this.waypoint ? toY(this.waypoint.z) : 0, this.waypoint ? 9 : 0);
      }
    }
    drawOfficerConnector(ctx, officerMarker);

    // Live Player Blip & Heading Arrow, with a slow pulse to find it at a glance
    ctx.save();
    ctx.translate(px, py);
    const pulse = (performance.now() % 1800) / 1800;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.24 * (1 - pulse)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 10 + pulse * 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-ent.heading + Math.PI);
    drawPlayerArrow(ctx, -11, 7.5, 8);
    ctx.restore();

    if (officerMarker) {
      ctx.save(); ctx.font = `700 11px ${FONT}`;
      const width = this.textWidth(ctx, 'Dorkins'); ctx.restore();
      drawOfficerLabel(ctx, officerMarker, px, py, w, h, width, this.fullStaticPlaced || [],
        this.waypoint ? toX(this.waypoint.x) : 0, this.waypoint ? toY(this.waypoint.z) : 0, this.waypoint ? 9 : 0);
      drawOfficerMarker(ctx, officerMarker.x, officerMarker.y);
    }

    ctx.restore();
  }

  renderFullMapStatic(ctx, v) {
    const { w, h, s } = v;
    ctx.save();
    // 1. Harbor & River Water Base
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = MAP.water;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 2. SF terrain, coastline, blocks, parks, footprints, highways and bridges
    this.drawWorld(ctx, v, false);

    v.screen(ctx);
    const toX = (wx) => v.toX(wx);
    const toY = (wz) => v.toY(wz);

    // 3. Iconic Landmark Pins & Collision-Free Labels (placed first: their boxes keep the other names clear)
    ctx.font = `700 11px ${FONT}`;
    const placed = [];
    const pins = [];
    const pinBounds = [];
    for (const lm of NYC_LANDMARKS) {
      const lx = toX(lm.x);
      const ly = toY(lm.z);
      if (Math.abs(lx) > w * 0.48 || Math.abs(ly) > h * 0.48) continue;
      const labelW = this.textWidth(ctx, lm.short || lm.name || 'Landmark') + 6;
      const radius = isSkateboardPin(lm) ? 12 : 6;
      const symbolRadius = isSkateboardPin(lm) ? 12 : 6.5;
      pinBounds.push([lx - symbolRadius, ly - symbolRadius, lx + symbolRadius, ly + symbolRadius]);
      const box = [lx + radius, ly - 8, lx + radius + 2 + labelW, ly + 7];
      const showLabel = !overlaps(placed, box);
      placed.push([lx - radius, ly - radius, lx + radius, ly + radius]);
      if (showLabel) placed.push(box);
      pins.push({ lm, lx, ly, showLabel });
    }

    // 4. Borough, waterway & neighbourhood watermark titles (wherever they fit), letter-spaced like a printed atlas
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tracking = 'letterSpacing' in ctx;
    for (const [label, x, z, kind] of [...AREA_LABELS, ...(window.NYC.PLACE_DATA?.neighborhoods || []).map(n=>[n.name.toUpperCase(),...n.label,2])]) {
      if (kind === 0 && s > 0.07) continue;
      if (kind === 2 && (s < 0.035 || s > 1.2)) continue;
      const dx = toX(x);
      const dy = toY(z);
      if (Math.abs(dx) > w * 0.47 || Math.abs(dy) > h * 0.47) continue;
      if (kind === 0) {
        ctx.font = `700 15px ${FONT}`;
        ctx.fillStyle = 'rgba(168, 178, 192, 0.5)';
        if (tracking) ctx.letterSpacing = '3px';
      } else if (kind === 1) {
        ctx.font = `italic 500 12px ${FONT}`;
        ctx.fillStyle = 'rgba(112, 168, 214, 0.55)';
        if (tracking) ctx.letterSpacing = '1.5px';
      } else {
        ctx.font = `700 10.5px ${FONT}`;
        ctx.fillStyle = 'rgba(168, 178, 192, 0.46)';
        if (tracking) ctx.letterSpacing = '1.8px';
      }
      const half = this.textWidth(ctx, label) * 0.5 + 4;
      const box = [dx - half, dy - 8, dx + half, dy + 8];
      if (overlaps(placed, box)) continue;
      placed.push(box);
      ctx.fillText(label, dx, dy);
    }
    if (tracking) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';

    // 5. Street & Avenue names along their real course (collision-free at all zoom levels)
    const fontPx = Math.max(9, Math.min(12, Math.round(9.5 * Math.sqrt(Math.max(s, 0.4)))));
    this.drawRoadLabels(ctx, v, { fontPx, maxLabels: 420, sameNameGap: 300, placed, majorOnly: s < 0.3 });

    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    for (const { lm, lx, ly, showLabel } of pins) {
      if (isSkateboardPin(lm)) drawSkateboardPin(ctx, lx, ly);
      else {
        ctx.fillStyle = MAP.halo;
        ctx.beginPath();
        ctx.arc(lx, ly, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lx, ly, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (showLabel) {
        const offset = isSkateboardPin(lm) ? 15 : 9;
        ctx.lineWidth = 3;
        ctx.strokeStyle = MAP.halo;
        ctx.strokeText(lm.short || lm.name || 'Landmark', lx + offset, ly + 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(lm.short || lm.name || 'Landmark', lx + offset, ly + 4);
      }
    }

    // 6. Scale bar (true metres); the true-north compass sits with the map controls (index.html)
    this.drawScaleBar(ctx, v);
    ctx.restore();
    return { placed, pins: pinBounds };
  }

  drawScaleBar(ctx, v) {
    const target = 120 / v.s; // metres in ~120 px
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const step = [1, 2, 5, 10].map((m) => m * pow).filter((m) => m <= target).pop() || pow;
    const len = step * v.s;
    const x0 = -v.w * 0.5 + 24;
    const y0 = v.h * 0.5 - 26;
    const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 6);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + len, y0);
    ctx.lineTo(x0 + len, y0 - 6);
    ctx.strokeStyle = MAP.halo;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 239, 244, 0.92)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `650 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = MAP.halo;
    ctx.strokeText(label, x0 + len + 8, y0 + 3);
    ctx.fillStyle = 'rgba(236, 239, 244, 0.95)';
    ctx.fillText(label, x0 + len + 8, y0 + 3);
  }
}

Object.assign(window.NYC, { NYCMapSystem, SfMapSystem: NYCMapSystem });
})();
