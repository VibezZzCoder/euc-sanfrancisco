// SF rendered Dorkins. Adapted from euc-newyork@7cf4ce7f0092b1f5f0627c2b9a4611bcc262e31d,
// js/nemesis.js blob 4eb5835d0390cbe51bb4cd1b05a065479f052679 (© 2026 VibezZzCoder, MIT).
// Flight and contact remain independent of the player controller and city actors.
import * as THREE from 'three/webgpu';
import { Fn, uv, vec2, vec4, length, smoothstep, mrt, color, uniform } from 'three/tsl';
import { createPose } from './euc/simulation/EucController.js';
import { PADDLE } from './euc/data/tuning.js';
import { createRidingRig } from './euc/render/ridingRig.js';
import { riderLook } from './euc/render/riderLook.js';
import { machineLook } from './euc/render/machineLook.js';
import { buildSfPursuitGraph, createSfFlightBrain, SF_HOVER } from './sf-nemesis-brain.js';
import { createSfFlightQueries } from './sf-nemesis-flight.js';
import { createSfPaddleContact } from './sf-nemesis-contact.js';
import { createChaseDirector, chaseHudView, CHASE_RULES } from './nemesis-chase.js';
import { createSwing, SWING } from './nemesis-swing.js';

const SEARCHLIGHT = Object.freeze({ intensity: 260, distance: 40, angle: 0.3, penumbra: 0.6, decay: 1.2 });
const FACE = PADDLE.reach * 0.62;
// Includes the outstretched paddle, hover bob, lean and the shadow quad's maximum visible extent.
const RIG_BOUND = 3.5, SHADOW_BOUND = 2.3;
// The shadow is fully transparent at this height; it is then hidden so it neither draws nor
// counts as visible presentation that would hold a departure indefinitely.
const SHADOW_FADE = 12;
// After this long held in view, a departure beyond HOLD_FAR metres from the camera may retire.
const HOLD_LIMIT = 30, HOLD_FAR = 150;
const finite = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const beamScale = () => Math.max(0, Math.min(1.28, ((globalThis.window?.NYC?.cityUniforms?.uInteriorGlow?.value ?? 0) - 0.60) * 1.45));

function hoverRig() {
  const rig = createRidingRig(riderLook('cop'), machineLook('standard'));
  rig.group.name = 'nemesis-hover-wheel';
  let paddle = null, shellClone = null;
  rig.group.traverse(o => {
    o.castShadow = false;
    if (!o.isMesh) return;
    o.receiveShadow = true;
    if (o.name === 'euc-shell') {
      shellClone = o.material.clone(); o.material = shellClone; shellClone.color.set(0x22314f);
    }
    if (o.name === 'rider-paddle-mesh') paddle = o;
  });
  rig.euc.tyre.visible = false;
  const parts = new THREE.Group(); parts.name = 'nemesis-hover-parts'; rig.euc.group.add(parts);
  const glow = opacity => new THREE.MeshBasicMaterial({ color: 0x46c8ff, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25 * 0.86, 0.028, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x46c8ff, emissiveIntensity: 3, roughness: 0.4 }));
  ring.rotation.y = Math.PI / 2; ring.position.y = 0.25;
  const field = new THREE.Mesh(new THREE.CircleGeometry(0.25 * 0.84, 40), glow(0.22));
  field.rotation.y = Math.PI / 2; field.position.y = 0.25;
  const pods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.07, 0.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x1a2236, metalness: 0.6, roughness: 0.35 }), 2);
  const exhaust = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.28, 14, 1, true).rotateX(Math.PI), glow(0.35), 2);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 2; i++) {
    const x = (i ? 1 : -1) * 0.19;
    pods.setMatrixAt(i, matrix.makeTranslation(x, 0.09, 0));
    exhaust.setMatrixAt(i, matrix.makeTranslation(x, -0.14, 0));
  }
  exhaust.position.y = 0.04;
  parts.add(ring, field, pods, exhaust);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2a2a, emissiveIntensity: 6, roughness: 0.3 }));
  bar.position.set(0, 0.64, 0); rig.euc.body.add(bar);
  const red = new THREE.Color(0xff2a2a), blue = new THREE.Color(0x2a5bff);
  return {
    rig, paddle,
    update(time, speed, alarm) {
      bar.material.emissive.copy((time * (alarm ? 7 : 2.2)) % 1 < 0.5 ? red : blue);
      exhaust.scale.set(1, (0.75 + Math.min(1, speed / SF_HOVER.cruiseSpeed) * 0.6) * (0.92 + 0.08 * Math.sin(time * 37)), 1);
    },
    dispose() {
      parts.removeFromParent(); bar.removeFromParent();
      pods.dispose(); exhaust.dispose();
      for (const mesh of [ring, field, pods, exhaust, bar]) { mesh.geometry.dispose(); mesh.material.dispose(); }
      shellClone?.dispose(); rig.dispose();
    },
  };
}

function hoverShadow() {
  const strength = uniform(0);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const opacity = Fn(() => smoothstep(1, 0.15, length(uv().sub(vec2(0.5, 0.5)).mul(2))).mul(strength))();
  material.colorNode = color(0x020305); material.opacityNode = opacity;
  material.mrtNode = mrt({ normal: vec4(0, 0, 0, 0), metalRough: vec4(0, 1, 0, opacity.mul(0.88)) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.name = 'nemesis-shadow'; mesh.renderOrder = 1;
  return { mesh, place(x, y, z, height) {
    const h = Math.max(0, height), size = 1.1 + h * 0.15;
    mesh.position.set(x, y + 0.03, z); mesh.scale.set(size, 1, size);
    strength.value = 0.6 * Math.max(0, 1 - h / SHADOW_FADE);
  }, dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); } };
}

/**
 * Host supplies the SF sampler/network, current EUC entity and final render camera. Call update after
 * rider and camera updates; false riding freezes clocks. update returns { captured, phase }.
 * Booking is presentation-only; the host owns placement, modal and director.release().
 * Call dispose only after renderer/compile readers have drained.
 */
export function createSfNemesis({ scene, sampler, network, getPlayer, camera }) {
  if (!scene || typeof scene.add !== 'function' || typeof getPlayer !== 'function' || !camera)
    throw new TypeError('SF nemesis requires scene, player and camera');
  const queries = createSfFlightQueries(sampler);
  const graph = buildSfPursuitGraph(network);
  queries.graph = graph;
  const brain = createSfFlightBrain(queries), director = createChaseDirector(), swing = createSwing();
  const contact = createSfPaddleContact(queries, director);
  const hover = hoverRig(), rig = hover.rig, shadow = hoverShadow(), pose = createPose();
  scene.add(rig.group, shadow.mesh);
  const light = new THREE.SpotLight(0xe8f2ff, 0, SEARCHLIGHT.distance, SEARCHLIGHT.angle, SEARCHLIGHT.penumbra, SEARCHLIGHT.decay);
  light.name = 'nemesis-searchlight'; light.castShadow = false; scene.add(light, light.target);
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(), 1.5);
  const head = new THREE.Vector3(), face = new THREE.Vector3(), departCamera = new THREE.Vector3();
  const facts = { riding: false, crashed: false, distance: Infinity, sees: false, inView: false };
  const audioView = { present: false, chasing: false, x: 0, z: 0, range: Infinity, closing: 0, speed: 0,
    chaseTime: 0, sting: 0, windup: 0, swing: 0, hit: 0, swinging: false, pan: 0 };
  let active = false, booking = false, warming = false, disposed = false, time = 0, lastRange = Infinity;
  let departure = null, departRetry = 0, heldTime = 0;
  let observedPlayer = null, observedController = null, serial, wasCrashed = false, wasRecovering = false;
  const observedPosition = { x: 0, y: 0, z: 0 };
  const stage = { x: 0, y: 0, z: 0, heading: 0, speed: 0, bank: 0, pitch: 0 };
  function parkLight() { light.intensity = 0; light.position.set(0, -1000, 0); light.target.position.set(0, -1001, 0); }
  function resetLight() {
    parkLight(); light.angle = SEARCHLIGHT.angle; light.penumbra = SEARCHLIGHT.penumbra;
    light.distance = SEARCHLIGHT.distance; light.decay = SEARCHLIGHT.decay; light.color.set(0xe8f2ff);
  }
  function hide() {
    active = booking = warming = false; departure = null; departRetry = 0; heldTime = 0;
    rig.group.visible = shadow.mesh.visible = false; resetLight();
    audioView.present = audioView.chasing = audioView.swinging = false;
    audioView.range = Infinity; audioView.closing = 0; lastRange = Infinity;
    facts.sees = false; contact.reset(); swing.cancel(0);
    if (director.state.phase === 'chasing' || director.state.phase === 'leaving') director.postpone();
  }
  hide();
  function refreshFrustum() {
    camera.updateWorldMatrix(true, false);
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection, camera.coordinateSystem, camera.reversedDepth);
  }
  function inView(x, y, z, radius = 1.5) {
    sphere.center.set(x, y, z); sphere.radius = radius;
    return frustum.intersectsSphere(sphere);
  }
  function presentationInView(x, y, z, floor) {
    return inView(x, y + 1, z, RIG_BOUND) || (Number.isFinite(floor) && inView(x, floor + 0.03, z, SHADOW_BOUND));
  }
  function render(f) {
    const slow = 1 - Math.min(1, f.speed / 3), commit = swing.commitment;
    pose.x = f.x; pose.y = f.y + 0.04 * slow * Math.sin(time * 2.3); pose.z = f.z;
    pose.headingY = f.heading; pose.speed = f.speed; pose.crouch = pose.tuck = commit;
    pose.rollAngle = pose.riderRoll = f.bank - SWING.leanRoll * commit;
    pose.wheelPitch = f.pitch; pose.riderPitch = f.pitch * 0.5;
    rig.setTrickPose(0, 0); swing.headTarget(pose.x, pose.y, pose.z, pose.headingY, head);
    rig.applySwing(head, swing.angle, commit); rig.apply(pose); rig.applyStatus(0, time, 1);
    hover.update(time, f.speed, swing.phase === 'windup');
    const floor = queries.supportAt(f.x, f.z, f.y);
    shadow.mesh.visible = (active || warming) && !!floor && !floor.offCourse && !floor.water && floor.height <= f.y
      && f.y - floor.height < SHADOW_FADE;
    if (shadow.mesh.visible) shadow.place(f.x, floor.height, f.z, f.y - floor.height);
  }
  function observe(p) {
    const c = p.controller, s = c?.placementSerial, crashed = !!c?.crashed, recovering = c?.state === 'recovering';
    const changed = observedPlayer !== p || observedController !== c;
    const placed = !changed && s !== serial;
    const displaced = observedPlayer !== null && (changed || placed || Math.hypot(p.position.x - observedPosition.x,
      p.position.y - observedPosition.y, p.position.z - observedPosition.z) > 5);
    const recovered = observedPlayer !== null && (changed || placed || (wasCrashed && !crashed) || (recovering && !wasRecovering));
    if (displaced || crashed || recovered) { contact.reset(); facts.sees = false; }
    if ((crashed || recovered || displaced) && swing.phase === 'windup') swing.cancel();
    if (displaced) lastRange = Infinity;
    director.observePlayer({ crashed, recovered, displaced });
    observedPlayer = p; observedController = c; serial = s; wasCrashed = crashed; wasRecovering = recovering;
    Object.assign(observedPosition, { x: p.position.x, y: p.position.y, z: p.position.z });
    facts.crashed = crashed;
  }
  // A bounded behind-the-rider radial fallback also covers parks and regions outside the road graph.
  // Walking support references avoids selecting a different deck on steep or stacked SF streets.
  function spawn(p) {
    const heading = p.heading, fx = Math.sin(heading), fz = Math.cos(heading);
    const observation = { x: p.position.x, y: p.position.y, z: p.position.z, heading };
    refreshFrustum();
    function attempt(x, floorY, z) {
      for (const h of [14, 7, 1.2]) {
        const q = { x, y: floorY + h, z };
        // Check presentation before expensive support/volume/LOS; do not rely on occlusion.
        if (presentationInView(x, q.y, z, floorY)) continue;
        if (Math.hypot(x - observation.x, q.y - observation.y, z - observation.z) > CHASE_RULES.sightRange) continue;
        const floor = queries.supportAt(x, z, q.y);
        if (!floor || floor.offCourse || floor.water || Math.abs(floor.height - floorY) > 2) continue;
        if (!queries.clearLine({ x, y: q.y + 0.9, z },
          { x: observation.x, y: observation.y + 1.2, z: observation.z })) continue;
        // place() repeats the brain's complete support and flight-volume admission atomically.
        if (!brain.place(q, Math.atan2(observation.x - x, observation.z - z))) continue;
        // This exact snapshot was admitted by LOS above, before any future player movement.
        brain.seedObservation(observation, true);
        director.update(Number.EPSILON, { riding: true, sees: true, distance: Math.hypot(x - observation.x, q.y - observation.y, z - observation.z) });
        active = true; rig.group.visible = true; contact.reset(); swing.cancel(0); lastRange = Infinity;
        render(brain.state); return true;
      }
      return false;
    }
    for (const id of graph.nearby(p.position.x, p.position.z, 100, 256,
      { minDistance: 35, referenceY: p.position.y, maxHeight: 45 })) {
      const q = graph.points[id], dx = q.x - p.position.x, dz = q.z - p.position.z;
      if (dx * fx + dz * fz <= 0 && attempt(q.x, q.y, q.z)) return true;
    }
    for (const d of [40, 60, 80]) for (const angle of [0, -0.5, 0.5, -1, 1, -1.4, 1.4]) {
      const a = heading + Math.PI + angle, dx = Math.sin(a), dz = Math.cos(a);
      let y = p.position.y, floor = null;
      for (let n = 1; n <= Math.ceil(d / 4); n++) {
        const step = d * n / Math.ceil(d / 4);
        floor = queries.supportAt(p.position.x + dx * step, p.position.z + dz * step, y);
        if (!floor || floor.offCourse || floor.water || Math.abs(floor.height - y) > 3) { floor = null; break; }
        y = floor.height;
      }
      if (floor && attempt(p.position.x + dx * d, y, p.position.z + dz * d)) return true;
    }
    return false;
  }
  // A blocked climb, e.g. inside a tunnel, gets a bounded checked lateral waypoint.
  // Retain it until reached or a timed retry, so a new direction is not picked every frame.
  function depart(dt) {
    const f = brain.state;
    departRetry -= dt;
    // 3D: a vertical climb shares the flyer's X/Z and is reached only at its altitude.
    if (departure && Math.hypot(f.x - departure.x, f.y - departure.y, f.z - departure.z) < 1) { departure = null; departRetry = 0; }
    if (departRetry <= 0) {
      departRetry = 2;
      const up = { x: f.x, y: f.y + 3, z: f.z };
      if (queries.clearFlight(f, up)) departure = { x: f.x, y: f.y + 30, z: f.z };
      else {
        const cam = camera.getWorldPosition(departCamera);
        const away = Math.atan2(f.x - cam.x, f.z - cam.z);
        departure = null;
        for (const delta of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI]) {
          const a = away + delta, next = { x: f.x + Math.sin(a) * 7, y: f.y, z: f.z + Math.cos(a) * 7 };
          if (queries.clearFlight(f, next)) { departure = next; break; }
        }
      }
    }
    return brain.leave(dt, departure || { x: f.x, y: f.y, z: f.z });
  }
  function status() { return { captured: director.state.phase === 'captured', phase: director.state.phase }; }
  const api = {
    director, audioView,
    get hudView() { return chaseHudView(director.state, facts.distance, CHASE_RULES, swing.phase); },
    update(dt, riding) {
      if (disposed) throw new Error('SF nemesis is disposed');
      const p = getPlayer();
      if (!p || !finite(p.position) || !Number.isFinite(p.heading) || !Number.isFinite(p.speed)) {
        contact.reset(); facts.sees = false; audioView.present = audioView.chasing = audioView.swinging = false;
        lastRange = Infinity; return status();
      }
      observe(p);
      if (booking || warming || !riding || !(dt > 0) || !Number.isFinite(dt)) { contact.reset(); facts.sees = false; return status(); }
      dt = Math.min(dt, SF_HOVER.maxStep); facts.riding = true;
      if (!active) {
        facts.distance = Infinity; facts.sees = facts.inView = false;
        if (director.update(dt, facts) === 'ambush') {
          if (spawn(p)) audioView.sting++; else director.postpone();
        }
        return status();
      }
      if (director.state.phase === 'captured') { contact.reset(); return status(); }
      time += dt;
      const before = brain.state, chasing = director.state.phase === 'chasing';
      const distance = Math.hypot(p.position.x - before.x, p.position.y - before.y, p.position.z - before.z);
      const observation = { x: p.position.x, y: p.position.y, z: p.position.z, heading: p.heading,
        vx: Math.sin(p.heading) * p.speed, vz: Math.cos(p.heading) * p.speed };
      facts.distance = distance;
      // Recheck every callback: a cached true sight bit must never read a rider who has just passed a wall.
      facts.sees = chasing && distance <= CHASE_RULES.sightRange && queries.clearLine(
        { x: before.x, y: before.y + 0.9, z: before.z },
        { x: observation.x, y: observation.y + 1.2, z: observation.z });
      if (chasing && swing.ready && director.state.acquired && facts.sees && distance <= SWING.triggerRange
        && !facts.crashed && director.state.recovery <= 0 && Math.abs(p.speed) <= SWING.maxQuarrySpeed) {
        swing.start(); contact.reset(); audioView.windup++;
      } else if (swing.phase === 'windup' && (facts.crashed || !facts.sees || !chasing)) swing.cancel();
      if (swing.update(dt) === 'strike') audioView.swing++;
      const striking = swing.contact.from <= swing.contact.to;
      let f;
      if (chasing && (swing.phase === 'windup' || swing.phase === 'active' || striking))
        f = brain.swoop(dt, observation, facts.sees, { lateral: SWING.lateral, height: SWING.swoopHeight, commit: swing.phase !== 'windup' });
      else if (chasing) f = brain.update(dt, observation, facts.sees);
      else f = depart(dt);
      render(f);
      if (hover.paddle) {
        hover.paddle.updateWorldMatrix(true, false); face.set(0, 0, FACE).applyMatrix4(hover.paddle.matrixWorld);
        if (contact.frame({ face, rider: { x: p.position.x, z: p.position.z, bottom: p.position.y },
          interval: striking ? swing.contact : null, controller: p.controller, placementSerial: p.controller?.placementSerial,
          enabled: chasing && !facts.crashed && director.state.recovery <= 0 })) {
          audioView.hit++; facts.crashed = true;
        }
      }
      const known = brain.lastSeen(), beam = chasing && known ? beamScale() : 0;
      if (beam > 0.001) {
        light.position.set(f.x, f.y + 0.1, f.z); light.target.position.set(known.x, known.y, known.z);
        light.intensity = SEARCHLIGHT.intensity * beam;
      } else parkLight();
      facts.distance = Math.hypot(p.position.x - f.x, p.position.y - f.y, p.position.z - f.z);
      if (director.state.phase === 'leaving') refreshFrustum();
      // A long-held departure (e.g. sealed under a roof while watched) may retire once it is only a
      // distant speck: never a visible pop at close range, never an indefinite hold.
      const leaving = director.state.phase === 'leaving';
      heldTime = leaving ? heldTime + (facts.inView ? dt : 0) : 0;
      facts.inView = leaving && presentationInView(f.x, f.y, f.z, shadow.mesh.visible ? shadow.mesh.position.y : null)
        && (heldTime < HOLD_LIMIT || camera.getWorldPosition(departCamera).distanceTo(sphere.center.set(f.x, f.y, f.z)) < HOLD_FAR);
      // The shared director has an eight-second timeout even when visible. Advance its departure
      // clock only while the entire presentation is out of view; never pop away under a roof.
      // A held departure still ages the escape banner.
      if (facts.inView && director.state.phase === 'leaving') director.hold(dt);
      else if (director.update(dt, facts) === 'gone') { hide(); return status(); }
      const range = facts.distance, closing = Number.isFinite(lastRange) ? (lastRange - range) / dt : 0;
      audioView.present = true; audioView.chasing = director.state.phase === 'chasing';
      audioView.x = f.x; audioView.z = f.z; audioView.range = range;
      audioView.closing += (closing - audioView.closing) * (1 - Math.exp(-dt * 4));
      audioView.speed = f.speed; audioView.chaseTime = director.state.chaseTime;
      audioView.swinging = swing.phase === 'windup' || swing.phase === 'active'; lastRange = range;
      return status();
    },
    hide,
    ambushSoon() { if (!disposed) director.soon(); },
    // Synchronous visibility staging only. The host owns compile/render and must call endWarmup
    // after its compile readers drain, before gameplay; no director, audio or flight clocks advance.
    beginWarmup(x, y, z, heading = 0) {
      if (disposed) throw new Error('SF nemesis is disposed');
      if (active || booking || warming || director.state.phase !== 'waiting' || ![x, y, z, heading].every(Number.isFinite)) return false;
      Object.assign(stage, { x, y, z, heading }); warming = true; rig.group.visible = true;
      render(stage); shadow.place(x, y, z, 0); shadow.mesh.visible = true;
      return true;
    },
    endWarmup() {
      if (!warming) return;
      warming = false; rig.group.visible = shadow.mesh.visible = false;
    },
    beginBooking(x, y, z, heading = 0) {
      if (disposed) throw new Error('SF nemesis is disposed');
      if (warming) return false;
      if (![x, y, z, heading].every(Number.isFinite)) return false;
      Object.assign(stage, { x, y, z, heading }); booking = active = true;
      swing.cancel(0); contact.reset(); rig.group.visible = true;
      audioView.present = true; audioView.chasing = audioView.swinging = false; resetLight(); render(stage);
      return true;
    },
    presentBooking(dt, action) {
      if (!booking || disposed || !action) return;
      if (Number.isFinite(dt) && dt > 0) time += Math.min(dt, SF_HOVER.maxStep);
      render(stage);
      if (action.writing && finite(action) && Number.isFinite(action.age)) {
        pose.crouch = 0.12; pose.riderPitch = 0.08;
        head.set(action.x + Math.sin(action.age * 24) * 0.09, action.y + Math.abs(Math.sin(action.age * 12)) * 0.04, action.z);
        rig.applySwing(head, 0.45, 0.8); rig.apply(pose);
      }
      audioView.x = stage.x; audioView.z = stage.z; audioView.speed = audioView.closing = 0;
      const p = getPlayer(); audioView.range = finite(p?.position) ? Math.hypot(p.position.x - stage.x, p.position.y - stage.y, p.position.z - stage.z) : Infinity;
      const beam = beamScale();
      if (beam > 0.001 && finite(action.light)) {
        light.position.set(action.light.x, action.light.y, action.light.z);
        light.target.position.set(stage.x - 0.1, stage.y + 1.05, stage.z);
        light.angle = 0.95; light.penumbra = 0.85; light.distance = 8; light.decay = 2;
        light.color.set(0xffe0b0); light.intensity = 8 * beam;
      } else parkLight();
    },
    endBooking() { if (booking) hide(); },
    dispose() {
      if (disposed) return;
      hide(); disposed = true; hover.dispose(); shadow.dispose(); light.removeFromParent(); light.target.removeFromParent();
      light.dispose();
    },
  };
  return api;
}
