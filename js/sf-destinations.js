(function () {
// EUC destination overlay, not generated geography. MIT © 2026 VibezZzCoder.
// Source: unable12/slop-sanfrancisco@bdd5d37; see NOTICE.md. Arrival proposals require checked dry support and clearance.
// Loaded after city-config. Terrain/data/bridge builders may not have run yet: arrivals are lazy proposals.
const N = window.NYC;
const finite = Number.isFinite;
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const withoutFlight = p => {
  const { mode, flight, fly, helicopter, ...rest } = p;
  return rest;
};
const regional = Object.fromEntries(Object.entries(N.PLACE_DATA?.regional || {}).map(([id, p]) => [id, withoutFlight(p)]));
if (N.PLACE_DATA) N.PLACE_DATA = { ...N.PLACE_DATA, regional };
const originalTeleports = Object.fromEntries(Object.entries(N.TELEPORT_LOCATIONS || {}).map(([id, p]) => [id, withoutFlight(p)]));

// Includes every modeled site, including the two names produced by the Mission Dolores loop. Do not replace this
// inventory with all GEO.landmarks: that table also contains thousands of ordinary building/commerce footprints.
const models = [
  'Sutro Tower', 'Transamerica Pyramid', 'Salesforce Tower', 'San Francisco Ferry Building', 'Coit Tower',
  'San Francisco City Hall', 'Palace of Fine Arts', 'Oracle Park', 'Grace Cathedral', 'Chase Center',
  'Conservatory of Flowers', 'de Young Museum', 'Fort Point', 'Alcatraz Island', 'Painted Ladies',
  'Old Mission Dolores', 'Mission Dolores Basilica', 'Salesforce Transit Center', 'Salesforce Park',
  'Ghirardelli Square', 'Cable Car Turntable (Powell & Market)'
];
const aliases = { ferry: 'ferrybuilding', coit: 'coittower', nobhill: 'gracecathedral', chinatown: 'dragongate', civiccenter: 'cityhall' };
const modelIds = { 'San Francisco Ferry Building': 'ferrybuilding', 'San Francisco City Hall': 'cityhall',
  'Grace Cathedral': 'gracecathedral', 'Coit Tower': 'coittower', 'Transamerica Pyramid': 'transamerica',
  'Salesforce Tower': 'salesforce', 'Painted Ladies': 'paintedladies', 'Oracle Park': 'oraclepark' };
const inventory = new Map();
function add(id, name, pin, source, extra = {}) {
  let d = inventory.get(id);
  if (!d) {
    d = { id, name, pin: { x: pin.x, z: pin.z }, access: 'checked-map-arrival', required: true,
      status: 'source-pending-native-route-verification', sources: [], routes: [], ...extra };
    inventory.set(id, d);
  }
  d.sources.push(source);
  return d;
}
for (const p of N.NYC_LANDMARKS || []) add(p.id, p.name, p, `NYC_LANDMARKS:${p.id}`);
for (const [id, p] of Object.entries(regional)) {
  const d = add(id, p.name, p, `PLACE_DATA.regional:${id}`);
  d.preferred = p;
  d.routes.push({ source: `PLACE_DATA.regional.${id}`, name: p.road, from: p.a, to: p.b,
    status: 'source-endpoints-route-pending' });
}
for (const [key, p] of Object.entries(originalTeleports)) {
  const id = aliases[key] || key;
  const d = add(id, p.name || p.landmark || (key === 'market' ? 'Market & Montgomery' : key === 'powell' ? 'Powell & California' : key),
    N.LANDMARK_SITES?.[p.landmark] || p, `TELEPORT_LOCATIONS:${key}`);
  d.preferred = p;
}
for (const name of models) {
  const site = N.LANDMARK_SITES?.[name];
  const id = modelIds[name] || slug(name);
  // Missing source sites stay in the ledger rather than silently shrinking release scope.
  const d = add(id, name, site || { x: NaN, z: NaN }, `model:${name}`);
  d.siteName = name;
  if (!site) d.status = 'missing-source-site';
}
for (const [id, name, key] of [['golden-gate-bridge', 'Golden Gate Bridge', 'goldenGate'], ['bay-bridge', 'Bay Bridge', 'bayBridge']]) {
  const towers = N.GEO?.bridges?.[key]?.towers || [];
  const a = towers[0]?.c;
  const d = add(id, name, a ? { x: a[0], z: a[1] } : { x: NaN, z: NaN }, `GEO.bridges:${key}`,
    { access: 'connected-deck-and-checked-map-arrival' });
  d.routes.push({ source: `GEO.bridges.${key}.decks`, status: 'geometry-registered-route-pending' });
}
// Yerba Buena's western portal is not an island-wide route proof. Keep its local destination explicit.
const ybi = N.LANDMARK_SITES?.['Yerba Buena Island'];
if (ybi) add('yerba-buena-island', 'Yerba Buena Island', ybi, 'LANDMARK_SITES:Yerba Buena Island');

// Arrival stands use surveyed dry support and clear ride-away paths. The nearest-road
// guesses landed inside solids (Palace, the turntable), off the end of a deck (Bay Bridge), at a busy junction (Grace),
// nowhere (Alcatraz: no committed road within 450 m) or facing along a street with the landmark beside or behind the
// rider (Painted Ladies). Each stand is a measured XZ on registered dry support with a clear >= 8 m ride toward the
// landmark and an unobstructed solid/terrain sight line; the floor still comes from committed terrain at arrival
// time and the host's checked placement still decides. `look` is the modelled feature to face (default: the site).
const STANDS = {
  gracecathedral: { x: -899, z: -348 }, // Huntington Park, across Taylor St from the towered east front
  paintedladies: { x: -2752.3, z: 1408.7, look: [-2702.5, 1383.6] }, // Alamo Square; centroid of the seven houses
  'palace-of-fine-arts': { x: -3952.6, z: -1588, look: [-4082, -1576] }, // east lawn, facing the rotunda
  'cable-car-turntable-powell-market': { x: -492.9, z: 425.5 }, // Powell St pavement, off the cable-car track
  'alcatraz-island': { x: -1903.9, z: -4230.4, look: [-1843.3, -4209.8] }, // island road below the Main Prison
  'sutro-tower': { x: -4360.2, z: 3626.4 },
  'chase-center': { x: 1358.1, z: 2470.2 },
  'conservatory-of-flowers': { x: -5134, z: 1728.8 },
  'de-young-museum': { x: -5786.6, z: 2010.4 },
  'fort-point': { x: -6536.7, z: -2362.2 }, // Marine Dr below the bridge, clear of the shore mound
  'old-mission-dolores': { x: -2141.1, z: 2718.3 },
  'mission-dolores-basilica': { x: -2137, z: 2705.8 }, // Dolores St, facing the front
  'ghirardelli-square': { x: -1853.1, z: -1982.3 }
};
// Bay Bridge: the constructed west upper-deck end is the deck's first station, so the rear of the standing footprint
// overhung the 25 m drop. Stand 24 m along the deck, 5 m right of its axis (the westbound lane still crosses on the
// left there).
const BAY_ALONG = 24, BAY_RIGHT = 5;
function lookAt(d) {
  const stand = STANDS[d.id];
  if (stand?.look) return { x: stand.look[0], z: stand.look[1] };
  const t = d.preferred?.target;
  if (Array.isArray(t) && t.every(finite)) return { x: t[0], z: t[1] }; // regional sources' authored view target
  const site = N.LANDMARK_SITES?.[d.siteName || d.preferred?.landmark];
  return site ? { x: site.x, z: site.z } : null;
}
const facing = (p, look) => Math.atan2(look.x - p.x, look.z - p.z);

// Same diagonal as terrain-mesh / region: 00,01,10 and 10,01,11. No camera LOD or bilinear saddle.
function fieldHeight(f, x, z) {
  const step = f.step ?? f.cell, x0 = f.x0 ?? f.originX, z0 = f.z0 ?? f.originZ;
  const nx = f.nx ?? f.w, nz = f.nz ?? (typeof f.h === 'number' ? f.h : undefined);
  const H = f.heights || f.h;
  const fx = (x - x0) / step, fz = (z - z0) / step;
  if (!H || !(fx >= 0 && fz >= 0 && fx <= nx - 1 && fz <= nz - 1)) return null;
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(nz - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * nx + i;
  const a = H[k], b = H[k + 1], c = H[k + nx], d = H[k + nx + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
function floorAt(x, z) {
  const T = N.Terrain;
  if (!T?.loaded) return null;
  let y = fieldHeight(T, x, z);
  if (y !== null) return y;
  for (const p of T.patches || []) {
    if (T.patchInside && !T.patchInside(p, x, z)) continue;
    y = fieldHeight(p, x, z);
    if (y !== null) return y;
  }
  return null;
}
function nearestRoad(pin) {
  let best = null, distance = 450;
  const consider = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return;
    const u = Math.max(0, Math.min(1, ((pin.x - a.x) * dx + (pin.z - a.z) * dz) / len2));
    const x = a.x + dx * u, z = a.z + dz * u, d = Math.hypot(pin.x - x, pin.z - z);
    if (d >= distance) return;
    const y = floorAt(x, z);
    if (!finite(y) || y <= N.Terrain.waterLevel + 0.05) return;
    // Of the road's two directions, face the one that points toward the destination rather than away from it.
    const toward = (pin.x - x) * dx + (pin.z - z) * dz >= 0;
    distance = d; best = { x, z, y, heading: toward ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz) };
  };
  for (const road of N.ROADS || []) {
    if (road.flags & (1 | 2 | 4 | 16)) continue;
    for (let i = 1; i < road.pts.length; i++) consider(road.pts[i - 1], road.pts[i]);
  }
  const roads = N.DATA?.fullRegion?.roads;
  if (roads) for (let k = 0; k < roads.length; k += 4)
    consider({ x: roads[k], z: roads[k + 1] }, { x: roads[k + 2], z: roads[k + 3] });
  return best;
}
function proposal(d) {
  if (!N.Terrain?.loaded) return undefined;
  let p;
  if (d.id === 'golden-gate-bridge') {
    const route = N.SF_BRIDGE_ROUTES?.goldengate;
    if (route) {
      const a = route.south, b = route.stations[1];
      p = { x: a[0], y: a[1], z: a[2], heading: Math.atan2(b[0] - a[0], b[2] - a[2]) };
    }
  } else if (d.id === 'bay-bridge') {
    const r = N.SF_BRIDGE_ROUTES?.baybridge;
    if (r) {
      const heading = Math.atan2(r.islandUpper[0] - r.westUpper[0], r.islandUpper[2] - r.westUpper[2]);
      const s = Math.sin(heading), c = Math.cos(heading);
      const x = r.westUpper[0] + s * BAY_ALONG - c * BAY_RIGHT, z = r.westUpper[2] + c * BAY_ALONG + s * BAY_RIGHT;
      // The upper deck's own profile at the stand (the bridge builder's height function), never the lower deck/shore.
      const deck = N.bridgeDeckAt?.(x, z, true);
      if (deck?.onBridge) p = { x, y: deck.y, z, heading };
    }
  } else if (d.siteName === 'Salesforce Park') {
    const tc = N.LANDMARK_SITES?.['Salesforce Transit Center'];
    if (tc) p = { ...d.pin, y: tc.base + (tc.topH || 30) + 0.4, heading: 0 };
  } else if (STANDS[d.id]) {
    const s = STANDS[d.id], look = lookAt(d);
    p = { x: s.x, z: s.z, y: floorAt(s.x, s.z), heading: look ? facing(s, look) : 0 };
  } else if (d.preferred) {
    // Regional sources face their authored view target (Twin Peaks: downtown; Marine Dr: the bridge); city-config
    // landmark arrivals already face their landmark; plain street arrivals keep their authored street heading.
    const look = d.preferred.a && d.preferred.b ? lookAt(d) : null;
    p = { x: d.preferred.x, z: d.preferred.z, y: floorAt(d.preferred.x, d.preferred.z),
      heading: look ? facing(d.preferred, look) : d.preferred.heading ?? 0 };
  } else p = nearestRoad(d.pin);
  if (!p || ![p.x, p.y, p.z, p.heading].every(finite) || p.y <= N.Terrain.waterLevel + 0.05) return undefined;
  return { ...p, referenceY: p.y, requireClear: true, registeredSurfaceOnly: true, departure: 1.2,
    requiresValidation: true, status: 'proposal-not-native-route-acceptance' };
}

const destinations = [...inventory.values()];
for (const d of destinations) Object.defineProperty(d, 'arrival', { enumerable: true, get: () => proposal(d) });
const byId = new Map(destinations.map(d => [d.id, d]));
// Clone runtime consumers; the generated source objects and pin coordinates remain untouched.
N.TELEPORT_LOCATIONS = Object.fromEntries(Object.entries(originalTeleports).map(([key, p]) => {
  const d = byId.get(aliases[key] || key), clone = { ...p };
  // The toolbar teleport uses the same checked stand/floor/heading as the map pin; source values only before terrain.
  Object.defineProperty(clone, 'y', { enumerable: true, get: () => d?.arrival?.y });
  for (const k of ['x', 'z', 'heading']) Object.defineProperty(clone, k, { enumerable: true, get: () => d?.arrival?.[k] ?? p[k] });
  return [key, clone];
}));
const pins = [...(N.NYC_LANDMARKS || [])];
for (const d of destinations) if (!pins.some(p => p.id === d.id) && [d.pin.x, d.pin.z].every(finite))
  pins.push({ id: d.id, name: d.name, short: d.name, ...d.pin, district: 'San Francisco' });
N.NYC_LANDMARKS = pins.map(pin => {
  const d = byId.get(pin.id), clone = withoutFlight(pin);
  Object.defineProperty(clone, 'arrival', { enumerable: true, get: () => d?.arrival });
  return clone;
});
// Check proposals through the actual host sampler; a failed candidate has no fallback to a roof/guessed y=0.
// Dynamic occupancy and the final controller placeAt(...requireClear:true) remain host-owned.
function getSFDestinationArrival(id, sampler) {
  const p = byId.get(id)?.arrival;
  if (!p || typeof sampler?.findPlacementTarget !== 'function') return null;
  return sampler.findPlacementTarget({ ...p, headingY: p.heading });
}
Object.assign(N, { SF_DESTINATIONS: destinations, getSFDestinationArrival, sfDestinationFloorAt: floorAt });
})();
