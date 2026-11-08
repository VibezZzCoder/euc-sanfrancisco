// Local, layer-aware flight for Officer Dorkins. No rendering, actor mutation or rider ownership.
// Pursuit tuning follows euc-newyork@7cf4ce7/js/nemesis-brain.js (© 2026 VibezZzCoder, MIT);
// SF movement and explicit-elevation collision queries are independently adapted here.
import { createSfPursuitMemory } from './sf-nemesis-memory.js';

export const SF_HOVER = Object.freeze({
  cruiseSpeed: 24, acceleration: 9, climbSpeed: 7, climbAcceleration: 14,
  highAltitude: 7, lowAltitude: 1.1, lowFrom: 12, highFrom: 45,
  followDistance: 3, arriveDeceleration: 6, turnRate: 3,
  lookAhead: 4, searchDwell: 1.5, maxStep: 0.05,
  routeInterval: 2, routeRange: 45, routeAttach: 24, routeHeight: 1.1,
  swoopGain: 3, swoopSpeed: 22, swoopAcceleration: 20, swoopTurnRate: 8,
});

// Route vertex speeds: the former blanket waypoint cap now applies only at the route's end;
// sharp junction turns may slow further, never below ROUTE_TURN_MIN.
const ROUTE_END_SPEED = 9, ROUTE_TURN_MIN = 4;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const wrap = x => x - Math.PI * 2 * Math.floor((x + Math.PI) / (Math.PI * 2));
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);

function spatialIndex(points) {
  const cellSize = 64, cells = new Map();
  const key = (x, z) => `${x},${z}`;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], k = key(Math.floor(p.x / cellSize), Math.floor(p.z / cellSize));
    let list = cells.get(k);
    if (!list) cells.set(k, list = []);
    list.push(i);
  }
  // At most 256 nearby point IDs, ordered by horizontal distance then source order.
  // The optional layer filter is applied before the limit, including at stacked streets.
  return function nearby(x, z, radius = 200, limit = 32, { minDistance = 0, referenceY = null, maxHeight = Infinity } = {}) {
    if (![x, z, radius, limit].every(Number.isFinite) || radius < 0 || radius > 1024
      || limit < 1 || !Number.isInteger(limit) || limit > 256
      || !Number.isFinite(minDistance) || minDistance < 0 || minDistance > radius
      || (referenceY !== null && !Number.isFinite(referenceY)) || !(maxHeight >= 0)) return [];
    const found = [], r2 = radius * radius, min2 = minDistance * minDistance;
    for (let ix = Math.floor((x-radius)/cellSize); ix <= Math.floor((x+radius)/cellSize); ix++) {
      for (let iz = Math.floor((z-radius)/cellSize); iz <= Math.floor((z+radius)/cellSize); iz++) {
        for (const id of cells.get(key(ix, iz)) || []) {
          const p = points[id], d = (p.x-x)**2 + (p.z-z)**2;
          if (d < min2 || d > r2 || (referenceY !== null && Math.abs(p.y-referenceY) > maxHeight)) continue;
          let at = found.length;
          while (at && (found[at-1].d > d || (found[at-1].d === d && found[at-1].id > id))) at--;
          if (at < limit) { found.splice(at, 0, { id, d }); if (found.length > limit) found.pop(); }
        }
      }
    }
    return found.map(entry => entry.id);
  };
}

/** Build a separate, undirected flight graph from SF's profiled traffic edges.
 * Edge endpoint elevations are not collapsed into a single junction: stacked roads must
 * not acquire an artificial connection. No traffic graph objects are modified. */
export function buildSfPursuitGraph(network, { step = 8, joinHeight = 1.5 } = {}) {
  if (!network || !Array.isArray(network.edges) || typeof network.edgeY !== 'function'
    || !Number.isFinite(step) || step < 2 || step > 20
    || !Number.isFinite(joinHeight) || joinHeight < 0) throw new TypeError('invalid SF road graph');
  const points = [], adjacency = [], junctions = new Map();
  let edgeCount = 0;
  const add = p => { const i = points.length; points.push(p); adjacency.push([]); return i; };
  const link = (a, b) => {
    if (a === b) return;
    const p = points[a], q = points[b], cost = Math.hypot(p.x-q.x, p.y-q.y, p.z-q.z);
    if (!Number.isFinite(cost)) return;
    adjacency[a].push({ to: b, cost, id: edgeCount++ });
    adjacency[b].push({ to: a, cost, id: edgeCount++ });
  };
  for (const e of network.edges) {
    if (!e.from || !e.to || ![e.sx, e.sz, e.dx, e.dz, e.len].every(Number.isFinite)
      || e.len <= 0) continue;
    const n = Math.ceil(e.len / step);
    // Ignore malformed edges rather than allocating unbounded samples.
    if (n > 1000) continue;
    let prev = -1;
    for (let i = 0; i <= n; i++) {
      const s = e.len * i / n, y = network.edgeY(e, s);
      if (!Number.isFinite(y)) { prev = -1; continue; }
      const id = add({ x: e.sx + e.dx * s, y, z: e.sz + e.dz * s });
      if (prev >= 0) link(prev, id);
      prev = id;
      if (i === 0 || i === n) {
        const node = i === 0 ? e.from : e.to;
        const list = junctions.get(node) || [];
        for (const other of list) if (Math.abs(points[other].y - y) <= joinHeight) link(other, id);
        list.push(id); junctions.set(node, list);
      }
    }
  }
  return { points, adjacency, nearby: spatialIndex(points), edgeCount };
}

// Per-brain stamped scratch; budgets make incomplete/expensive searches fail closed.
function createPathfinder(graph, clearLink) {
  const { points, adjacency } = graph, count = points.length;
  const costs = new Float64Array(count), previous = new Int32Array(count);
  const visited = new Uint32Array(count), closed = new Uint32Array(count);
  const edgeStamp = new Uint32Array(graph.edgeCount || 0), edgeClear = new Uint8Array(edgeStamp.length);
  const heapIds = new Int32Array(16384), heapScores = new Float64Array(heapIds.length);
  let stamp = 0, size = 0;
  function push(id, score) {
    if (size === heapIds.length) return false;
    let i = size++;
    while (i) {
      const p = (i - 1) >> 1;
      if (heapScores[p] <= score) break;
      heapIds[i] = heapIds[p]; heapScores[i] = heapScores[p]; i = p;
    }
    heapIds[i] = id; heapScores[i] = score;
    return true;
  }
  function pop() {
    const first = heapIds[0], id = heapIds[--size], score = heapScores[size];
    if (size) {
      let i = 0;
      while (i * 2 + 1 < size) {
        let c = i * 2 + 1;
        if (c + 1 < size && heapScores[c + 1] < heapScores[c]) c++;
        if (heapScores[c] >= score) break;
        heapIds[i] = heapIds[c]; heapScores[i] = heapScores[c]; i = c;
      }
      heapIds[i] = id; heapScores[i] = score;
    }
    return first;
  }
  return function path(start, goal) {
    stamp = (stamp + 1) >>> 0;
    if (!stamp) { visited.fill(0); closed.fill(0); edgeStamp.fill(0); stamp = 1; }
    size = 0;
    const heuristic = i => Math.hypot(points[i].x-points[goal].x, points[i].y-points[goal].y, points[i].z-points[goal].z);
    costs[start] = 0; visited[start] = stamp; previous[start] = -1; push(start, heuristic(start));
    let pops = 0, checks = 0, found = false;
    while (size && pops++ < 4000) {
      const u = pop();
      if (closed[u] === stamp) continue;
      if (u === goal) { found = true; break; }
      closed[u] = stamp;
      for (const edge of adjacency[u]) {
        const next = costs[u] + edge.cost;
        if (visited[edge.to] === stamp && next >= costs[edge.to]) continue;
        let clear;
        if (Number.isInteger(edge.id) && edge.id >= 0 && edge.id < edgeStamp.length && edgeStamp[edge.id] === stamp) {
          clear = edgeClear[edge.id] === 1;
        } else {
          if (++checks > 3000) return [];
          clear = clearLink(points[u], points[edge.to]);
          if (Number.isInteger(edge.id) && edge.id >= 0 && edge.id < edgeStamp.length) {
            edgeStamp[edge.id] = stamp; edgeClear[edge.id] = clear ? 1 : 0;
          }
        }
        if (!clear) continue;
        costs[edge.to] = next; previous[edge.to] = u; visited[edge.to] = stamp;
        if (!push(edge.to, next + heuristic(edge.to))) return [];
      }
    }
    if (!found) return [];
    const path = [];
    for (let i = goal; i >= 0; i = previous[i]) path.push(points[i]);
    return path.reverse();
  };
}

/**
 * Flight is advanced only along an admitted volume sweep. `visible` is the sole gate for reading
 * observation; pass an inaccessible object while hidden to catch accidental wall-vision. Search
 * anchors are suggestions, not validated routes. A blocked flyer holds or chooses a local detour;
 * this local steering does not promise a route around arbitrary buildings or between regions.
 */
export function createSfFlightBrain(queries, tuning = SF_HOVER) {
  if (!queries || typeof queries.clearFlight !== 'function' || typeof queries.supportAt !== 'function') {
    throw new TypeError('SF flight brain requires flight and ground queries');
  }
  tuning = { ...SF_HOVER, ...tuning };
  const memory = createSfPursuitMemory();
  const state = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0,
    speed: 0, bank: 0, pitch: 0, mode: 'idle' };
  let placed = false, searching = false, anchors = [], anchor = -1, dwell = 0;
  let detour = 0, detourTime = 0;
  let route = [], routeIndex = 0, replanIn = 0, routeGoal = null;
  let swoopAim = null;
  let routingGraph = null, nearbyPoints = null, findRoute = null;

  function validPlacement(position) {
    if (!finitePoint(position)) return false;
    const ground = queries.supportAt(position.x, position.z, position.y);
    return !!ground && !ground.offCourse && !ground.water && Number.isFinite(ground.height)
      && ground.height <= position.y + 1e-4 && queries.clearFlight(position, position);
  }

  // Candidate generation and camera/dynamic-actor visibility belong to the host.
  function selectSpawn(candidates, { visible = null, accept = null } = {}) {
    if (!Array.isArray(candidates)) return null;
    for (const p of candidates.slice(0, 256)) {
      if (!finitePoint(p) || (p.heading !== undefined && !Number.isFinite(p.heading))) continue;
      const candidate = { x: p.x, y: p.y, z: p.z, heading: p.heading ?? 0 };
      if (!validPlacement(candidate) || (visible && visible({ ...candidate })) || (accept && !accept({ ...candidate }))) continue;
      return candidate;
    }
    return null;
  }

  function place(position, heading = 0) {
    if (!Number.isFinite(heading) || !validPlacement(position)) return false;
    Object.assign(state, { x: position.x, y: position.y, z: position.z, vx: 0, vy: 0, vz: 0,
      heading, speed: 0, bank: 0, pitch: 0, mode: 'idle' });
    placed = true; searching = false; anchors = []; anchor = -1; dwell = detour = detourTime = 0;
    route = []; routeIndex = 0; replanIn = 0; routeGoal = swoopAim = null;
    memory.clear();
    return true;
  }

  // The sampler limits each sweep to 10 m. Long attachment checks are divided, not bypassed.
  function clearSegment(a, b) {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z) / 8));
    if (count > 8) return false;
    let prev = a;
    for (let i = 1; i <= count; i++) {
      const t = i / count, p = { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t, z: a.z+(b.z-a.z)*t };
      if (!queries.clearFlight(prev, p)) return false;
      prev = p;
    }
    return true;
  }

  function plan(target) {
    const graph = queries.graph;
    if (!graph || !Array.isArray(graph.points) || !Array.isArray(graph.adjacency)) return [];
    if (routingGraph !== graph) {
      routingGraph = graph;
      nearbyPoints = typeof graph.nearby === 'function' ? graph.nearby : spatialIndex(graph.points);
      findRoute = createPathfinder(graph, (a, b) => clearSegment(
        { x: a.x, y: a.y + tuning.routeHeight, z: a.z },
        { x: b.x, y: b.y + tuning.routeHeight, z: b.z }));
    }
    const startFloor = queries.supportAt(state.x, state.z, state.y);
    const goalFloor = queries.supportAt(target.x, target.z, target.y);
    if (!startFloor || !goalFloor || !Number.isFinite(startFloor.height) || !Number.isFinite(goalFloor.height)) return [];
    const goal = { x: target.x, y: goalFloor.height + tuning.routeHeight, z: target.z };
    function nearest(pos, floor, actual) {
      const list = nearbyPoints(pos.x, pos.z, tuning.routeAttach, 8, { referenceY: floor, maxHeight: 3 });
      for (const i of list) {
        const p = graph.points[i], lifted = { x: p.x, y: p.y + tuning.routeHeight, z: p.z };
        if (clearSegment(actual, lifted)) return i;
      }
      return -1;
    }
    const a = nearest(state, startFloor.height, state), b = nearest(target, goalFloor.height, goal);
    return a < 0 || b < 0 ? [] : findRoute(a, b);
  }

  // A nearest start may lie behind an already-moving flyer. Advance onto the
  // checked next segment rather than reversing at each periodic replan.
  function advanceReplannedStart(path) {
    let i = 0;
    while (i + 1 < path.length) {
      const a = path[i], b = path[i + 1], dx = b.x-a.x, dz = b.z-a.z;
      const len2 = dx*dx + dz*dz;
      if (len2 < 1e-8 && Math.abs(a.y-b.y) < 1e-6) { i++; continue; }
      if (len2 < 1e-8) break;
      const u = ((state.x-a.x)*dx + (state.z-a.z)*dz) / len2;
      const t = clamp(u, 0, 1), x = a.x+dx*t, z = a.z+dz*t, y = a.y+(b.y-a.y)*t+tuning.routeHeight;
      if (u <= 0 || Math.hypot(state.x-x, state.z-z) > 3 || Math.abs(state.y-y) > 3
        || !clearSegment(state, { x: b.x, y: b.y+tuning.routeHeight, z: b.z })) break;
      i++;
    }
    return i;
  }

  function searchTarget(dt, visible, observation) {
    if (visible && memory.observe(observation, true)) {
      searching = false; anchors = []; anchor = -1; dwell = 0;
      return memory.lastSeen();
    }
    const known = memory.lastSeen();
    if (!known) return null;
    if (!searching) {
      searching = true;
      anchors = memory.searchAnchors(queries);
      anchor = -1; dwell = 0;
    }
    let target = anchor < 0 ? known : anchors[anchor];
    if (Math.hypot(target.x - state.x, target.z - state.z) < 4
      && Math.abs(target.y - state.y) < 5) {
      dwell += dt;
      if (dwell >= tuning.searchDwell && anchors.length) {
        anchor = (anchor + 1) % anchors.length;
        target = anchors[anchor]; dwell = 0;
      }
    } else dwell = 0;
    return target;
  }

  const moveFrom = { x: 0, y: 0, z: 0 }, moveCandidates = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  function move(dt, wantVx, wantVz, aimY, acceleration, turnRate, face) {
    const desiredVy = clamp((aimY - state.y) * 2.5, -tuning.climbSpeed, tuning.climbSpeed);
    const vy = state.vy + clamp(desiredVy - state.vy, -tuning.climbAcceleration * dt, tuning.climbAcceleration * dt);
    let ax = wantVx - state.vx, az = wantVz - state.vz;
    const change = Math.hypot(ax, az), maxChange = acceleration * dt;
    if (change > maxChange) { ax *= maxChange / change; az *= maxChange / change; }
    const vx = state.vx + ax, vz = state.vz + az;
    const from = moveFrom; from.x = state.x; from.y = state.y; from.z = state.z;
    // Full, horizontal-only, then vertical-only candidates (reused scratch, checked in order).
    const c0 = moveCandidates[0], c1 = moveCandidates[1], c2 = moveCandidates[2];
    c0.x = state.x + vx * dt; c0.y = state.y + vy * dt; c0.z = state.z + vz * dt;
    c1.x = c0.x; c1.y = state.y; c1.z = c0.z;
    c2.x = state.x; c2.y = c0.y; c2.z = state.z;
    let next = null;
    for (let i = 0; i < 3 && !next; i++) if (queries.clearFlight(from, moveCandidates[i])) next = moveCandidates[i];
    if (next) {
      state.vx = (next.x - state.x) / dt; state.vy = (next.y - state.y) / dt;
      state.vz = (next.z - state.z) / dt;
      state.x = next.x; state.y = next.y; state.z = next.z;
    } else state.vx = state.vy = state.vz = 0;
    state.speed = Math.hypot(state.vx, state.vz);
    const desiredHeading = face === null ? (state.speed > 0.2 ? Math.atan2(state.vx, state.vz) : state.heading) : face;
    const turn = clamp(wrap(desiredHeading - state.heading), -turnRate * dt, turnRate * dt);
    state.heading = wrap(state.heading + turn);
    const ease = 1 - Math.exp(-dt * 6);
    state.bank += (clamp(Math.atan(state.speed * turn / dt / 9.81), -0.6, 0.6) - state.bank) * ease;
    state.pitch += (clamp(0.12 * state.speed / tuning.cruiseSpeed, -0.35, 0.35) - state.pitch) * ease;
    return state;
  }

  // Speed that can still brake to each upcoming route vertex's turn speed (lateral-acceleration
  // limited, ROUTE_TURN_MIN..cruise) and ROUTE_END_SPEED at the route's end. Bounded look-ahead;
  // beyond ~128 m the braking envelope exceeds cruise anyway.
  function routeSpeed() {
    const decel2 = 2 * tuning.arriveDeceleration;
    let cap = tuning.cruiseSpeed, prev = null;
    // Junction duplicates share a location; the incoming direction comes from the last distinct point.
    for (let i = routeIndex - 1; i >= 0 && i >= routeIndex - 4 && !prev; i--) {
      if (Math.hypot(route[i].x-route[routeIndex].x, route[i].z-route[routeIndex].z) > 1e-6) prev = route[i];
    }
    let d = Math.hypot(route[routeIndex].x-state.x, route[routeIndex].z-state.z);
    for (let i = routeIndex; i < route.length && i < routeIndex + 16; i++) {
      const p = route[i], n = route[i + 1];
      let v = ROUTE_END_SPEED;
      if (n) {
        const bx = n.x-p.x, bz = n.z-p.z, lb = Math.hypot(bx, bz);
        if (lb <= 1e-6) continue; // duplicate junction point: measure the turn across it
        v = tuning.cruiseSpeed;
        if (prev) {
          const ax = p.x-prev.x, az = p.z-prev.z, la = Math.hypot(ax, az);
          const angle = la > 1e-6 ? Math.acos(clamp((ax*bx + az*bz) / (la*lb), -1, 1)) : 0;
          if (angle > 1e-3) v = clamp(Math.sqrt(tuning.acceleration * Math.min(la, lb) / angle), ROUTE_TURN_MIN, tuning.cruiseSpeed);
        }
        cap = Math.min(cap, Math.sqrt(v*v + decel2*d));
        d += lb;
      } else cap = Math.min(cap, Math.sqrt(v*v + decel2*d));
      if (cap <= ROUTE_TURN_MIN) break;
      prev = p;
    }
    return cap;
  }

  // Faster straight-line flight can pass beside a vertex; accept it once beyond the vertex
  // along the next segment with a checked sweep onward, instead of turning back for it.
  function reachedWaypoint(p, n) {
    if (Math.abs(p.y + tuning.routeHeight-state.y) >= 3) return false;
    const h = Math.hypot(p.x-state.x, p.z-state.z);
    if (h < 2) return true;
    return !!n && h < 6 && (state.x-p.x)*(n.x-p.x) + (state.z-p.z)*(n.z-p.z) > 0
      && clearSegment(state, { x: n.x, y: n.y + tuning.routeHeight, z: n.z });
  }

  function update(dt, observation, visible) {
    if (!placed || !Number.isFinite(dt) || dt <= 0) return state;
    dt = Math.min(dt, tuning.maxStep); swoopAim = null;
    const target = searchTarget(dt, visible, observation);
    if (!target) { state.mode = 'idle'; return state; }
    const directDistance = Math.hypot(target.x-state.x, target.z-state.z);
    const directProbe = { x: state.x + (target.x-state.x) * Math.min(1, tuning.lookAhead/(directDistance || 1)),
      y: state.y, z: state.z + (target.z-state.z) * Math.min(1, tuning.lookAhead/(directDistance || 1)) };
    const blocked = !queries.clearFlight(state, directProbe);
    // A visible (line-of-sight checked) rider well inside route range with a clear probe is chased
    // directly, instead of finishing a stale road route; 0.8 gives hysteresis against routeRange.
    const closeAndClear = visible && !searching && !blocked && directDistance < tuning.routeRange * 0.8;
    const wantRoute = !!queries.graph && !closeAndClear
      && (directDistance > tuning.routeRange || blocked || routeIndex < route.length);
    replanIn -= dt;
    if (wantRoute && (replanIn <= 0 || !routeGoal || Math.hypot(target.x-routeGoal.x, target.y-routeGoal.y, target.z-routeGoal.z) > 15)) {
      route = plan(target); routeIndex = advanceReplannedStart(route);
      replanIn = tuning.routeInterval; routeGoal = { ...target };
    }
    if (!wantRoute) { route = []; routeIndex = 0; }
    while (routeIndex < route.length && reachedWaypoint(route[routeIndex], route[routeIndex + 1])) routeIndex++;
    const waypoint = routeIndex < route.length ? route[routeIndex] : null;
    const aim = waypoint || target;
    const dx = aim.x-state.x, dz = aim.z-state.z, distance = Math.hypot(dx, dz);
    const ux = distance > 1e-6 ? dx/distance : Math.sin(state.heading);
    const uz = distance > 1e-6 ? dz/distance : Math.cos(state.heading);
    const gap = Math.max(0, distance - (waypoint || searching ? 0 : tuning.followDistance));
    // Waypoints brake only for actual turns ahead, not every 8 m sample on a straight.
    const speed = waypoint ? routeSpeed()
      : Math.min(tuning.cruiseSpeed, Math.sqrt(2*tuning.arriveDeceleration*gap), 2*gap);
    const mix = clamp((directDistance-tuning.lowFrom)/(tuning.highFrom-tuning.lowFrom), 0, 1);
    const smooth = mix*mix*(3-2*mix);
    const floor = queries.supportAt(state.x, state.z, state.y);
    const aimY = floor && !floor.offCourse && Number.isFinite(floor.height)
      ? Math.max(floor.height+0.4, waypoint ? waypoint.y+tuning.routeHeight
        : target.y+tuning.lowAltitude+(tuning.highAltitude-tuning.lowAltitude)*smooth) : state.y;
    const ahead = { x: state.x+ux*tuning.lookAhead, y: state.y, z: state.z+uz*tuning.lookAhead };
    detourTime = Math.max(0, detourTime-dt);
    if (!queries.clearFlight(state, ahead) && detourTime === 0) {
      const left = { x: state.x+uz*tuning.lookAhead, y: state.y, z: state.z-ux*tuning.lookAhead };
      const right = { x: state.x-uz*tuning.lookAhead, y: state.y, z: state.z+ux*tuning.lookAhead };
      detour = queries.clearFlight(state, left) ? 1 : queries.clearFlight(state, right) ? -1 : 0;
      detourTime = 1;
    } else if (detourTime === 0) detour = 0;
    move(dt, (detour ? uz*detour : ux)*speed, (detour ? -ux*detour : uz)*speed,
      aimY, tuning.acceleration, tuning.turnRate, null);
    state.mode = searching ? 'search' : detour ? 'detour' : waypoint ? 'path' : 'pursuit';
    return state;
  }

  /** A wind-up uses only an explicitly visible observation. A committed swing reads no target. */
  function swoop(dt, observation, visible, { lateral = 0, height = 1.1, commit = false } = {}) {
    if (!placed || !Number.isFinite(dt) || dt <= 0) return state;
    dt = Math.min(dt, tuning.maxStep);
    let vx = state.vx, vz = state.vz;
    if (!commit) {
      if (!visible || !finitePoint(observation) || ![observation.heading, observation.vx, observation.vz, lateral, height].every(Number.isFinite)) return state;
      memory.observe(observation, true);
      const h = observation.heading;
      const x = observation.x + Math.cos(h)*lateral + observation.vx*0.1;
      const z = observation.z - Math.sin(h)*lateral + observation.vz*0.1;
      vx = observation.vx+(x-state.x)*tuning.swoopGain;
      vz = observation.vz+(z-state.z)*tuning.swoopGain;
      const speed = Math.hypot(vx, vz);
      if (speed > tuning.swoopSpeed) { vx *= tuning.swoopSpeed/speed; vz *= tuning.swoopSpeed/speed; }
      swoopAim = { heading: h, y: observation.y+height };
    }
    move(dt, vx, vz, swoopAim ? swoopAim.y : state.y, tuning.swoopAcceleration,
      tuning.swoopTurnRate, swoopAim ? swoopAim.heading : state.heading);
    state.mode = 'swoop';
    return state;
  }

  /** Fly toward an explicit departure point; the host decides when to hide/despawn. */
  function leave(dt, destination) {
    if (!placed || !Number.isFinite(dt) || dt <= 0 || !finitePoint(destination)) return state;
    dt = Math.min(dt, tuning.maxStep); swoopAim = null;
    const dx = destination.x-state.x, dz = destination.z-state.z, d = Math.hypot(dx, dz);
    const speed = Math.min(tuning.cruiseSpeed, 2*d, Math.sqrt(2*tuning.arriveDeceleration*d));
    move(dt, d ? dx/d*speed : 0, d ? dz/d*speed : 0, destination.y,
      tuning.acceleration, tuning.turnRate, null);
    state.mode = 'leave';
    return state;
  }

  // The host may seed an already LOS-admitted ambush without moving or advancing the clock.
  // In particular, a false visibility gate must not inspect the observation.
  function seedObservation(observation, visible) {
    return placed && memory.observe(observation, visible === true);
  }
  return { state, place, update, selectSpawn, swoop, leave, seedObservation, lastSeen: () => memory.lastSeen() };
}
