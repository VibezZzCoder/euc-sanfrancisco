import * as THREE from 'three/webgpu';

// js/cameras.js
// Multi-camera system supporting Third-Person Chase (with mouse/touch orbit + zoom),
// Low-Angle Action, rider's-eye POV, seven local cinematic styles, and a rider-centred director.

const CAMERA_PRESETS = [
  { id: 'chase',       name: '3rd-Person Chase',         short: 'Chase',       category: 'follow', fov: 56 },
  { id: 'action',      name: 'Low-Angle Action',         short: 'Action',      category: 'follow', fov: 60 },
  { id: 'pov',         name: 'First-Person',             short: 'POV',         category: 'follow', fov: 68 },
  { id: 'centralPark', name: 'Elevated',                short: 'Elevated',   category: 'follow', fov: 52 },
  { id: 'fifthAve',    name: 'Avenue',                  short: 'Avenue',     category: 'follow', fov: 48 },
  { id: 'timesSquare', name: 'Crossroads',              short: 'Crossroads', category: 'follow', fov: 58 },
  { id: 'chryslerGCT', name: 'Architecture',            short: 'Architecture', category: 'follow', fov: 50 },
  { id: 'observatory', name: 'Overlook',                short: 'Overlook',   category: 'follow', fov: 52 },
  { id: 'bryantPark',  name: 'Side Tracking',           short: 'Side',       category: 'follow', fov: 52 },
  { id: 'waterfront',  name: 'Panorama',                short: 'Panorama',   category: 'follow', fov: 46 },
  { id: 'drone',       name: 'Auto-Director Aerial',     short: 'Director',   category: 'follow', fov: 50 }
];

// Retain IDs/order/FOVs so existing saved choices and shortcuts still select the same style.
// Metres relative to the rider: positive back trails, positive side films from the right.
const LOCAL_SHOTS = Object.freeze({
  centralPark: { back: 11, side: 0, height: 9, lead: 1.8, lookHeight: 1.1 },
  fifthAve: { back: 13, side: 0, height: 3.5, lead: 3, lookHeight: 1.3 },
  timesSquare: { back: 7, side: 7, height: 4.5, lead: 1.5, lookHeight: 1.1 },
  chryslerGCT: { back: 4, side: 5, height: 1.1, lead: 0, lookHeight: 2.2 },
  observatory: { back: 5, side: 0, height: 20, lead: .7, lookHeight: 1 },
  bryantPark: { back: 1.8, side: 7, height: 2, lead: 1, lookHeight: 1.1 },
  waterfront: { back: 7, side: 13, height: 5, lead: 1, lookHeight: 1.3 },
  drone: { back: 10, side: 5, height: 8, lead: .6, lookHeight: 1.1 },
});

class CameraSystem {
  constructor(domElement, controllerManager) {
    this.domElement = domElement;
    this.controllerManager = controllerManager;

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.35,
      60000 // at 1:1 the boroughs & harbor run out ~20-40 km to the fogged horizon (reversed float depth keeps precision)
    );

    this.activePresetId = 'chase';
    this.orbitYawOffset = 0.0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1.0;
    this.isDragging = false;
    this.userOrbitTimer = 0;

    this.currentPos = new THREE.Vector3(0, 10, 380);
    this.currentLookAt = new THREE.Vector3(0, 8, 440);
    this.initialized = false;

    // Follow cameras (chase / action) are smoothed relative to the followed entity, see update()
    this.followEntity = null;
    this.followOffset = new THREE.Vector3();
    this.followLookOffset = new THREE.Vector3();
    this.followBaseY = 0;
    this.smoothedSpeed = 0;
    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    // Title screen (title-screen.js): the camera circles the rider instead of following (see setTitleOrbit)
    this.titleOrbit = false;
    // Follow-camera occlusion (see occlude()): how far along the rider-to-camera arm the camera may sit, 0..1
    this.armFraction = 1;
    this._rayOrigin = { x: 0, y: 0, z: 0 };
    this._rayDirection = { x: 0, y: 0, z: 0 };
    this._riderPoint = new THREE.Vector3();
    this._lastRiderPosition = new THREE.Vector3();
    this.hasRiderPosition = false;
    this.shotInitialized = false;
    this.shotSide = 1;
    this.sideCheckIn = 0;
    this.sideHold = 0;
    this.directorAngle = 0;
    this._candidate = new THREE.Vector3();

    this.bindPointerControls();
  }

  bindPointerControls() {
    const canvas = this.domElement;
    const pointers = new Map();
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pointers.size >= 2) return;
      // Only two touch pointers may share a gesture; mouse and pen drags stay independent.
      if (pointers.size && (e.pointerType !== 'touch' || pointers.values().next().value.type !== 'touch')) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.userOrbitTimer = 4.0;
    });

    canvas.addEventListener('pointermove', (e) => {
      const pointer = pointers.get(e.pointerId);
      if (!pointer) return;
      e.preventDefault();
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      const pair = pointers.size === 2 ? [...pointers.values()] : null;
      const previousDistance = pair ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (pair) {
        const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        if (previousDistance > 1 && distance > 1) {
          this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier * previousDistance / distance));
        }
      } else {
        this.orbitYawOffset -= dx * 0.0065;
        this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + dy * 0.005));
      }
      this.userOrbitTimer = 4.0;
    });

    const releasePointer = (id) => {
      if (!pointers.delete(id)) return;
      this.isDragging = pointers.size > 0;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => releasePointer(e.pointerId));
    }
    const clearPointers = () => {
      for (const id of pointers.keys()) releasePointer(id);
    };
    this._clearPointers = clearPointers;
    window.addEventListener('blur', clearPointers);
    window.addEventListener('resize', clearPointers);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPointers();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier + e.deltaY * 0.001));
    }, { passive: false });
  }

  setCameraPreset(presetId, snapImmediately = false) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (this.activePresetId !== preset.id || snapImmediately) {
      this.shotInitialized = false;
      this.shotSide = 1;
      this.sideCheckIn = 0;
      this.sideHold = 0;
      this.directorAngle = 0;
      this.armFraction = 1;
      this._clearPointers();
      this.resetOrbit();
    }
    this.activePresetId = preset.id;
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    if (snapImmediately) {
      this.initialized = false;
    }
  }

  applyGamepadInput(lookX, lookY, zoom, dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (this.activePresetId === 'action') return;
    // POV uses the orbit angles; all other controllable views also use distance.
    if (this.activePresetId === 'pov') zoom = 0;
    if (!lookX && !lookY && !zoom) return;
    this.orbitYawOffset -= lookX * 2.0 * dt;
    this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + lookY * 1.25 * dt));
    this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier + zoom * 0.9 * dt));
    this.userOrbitTimer = 4.0;
  }

  resetOrbit() {
    this.orbitYawOffset = 0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1;
    this.userOrbitTimer = 0;
  }

  resetForTeleport() {
    // Arrive with a fresh chase view, without carrying a previous drive or gesture into the destination.
    this._clearPointers();
    this.isDragging = false;
    this.resetOrbit();
    this.smoothedSpeed = 0;
    this.followEntity = null;
    this.followOffset.set(0, 0, 0);
    this.followLookOffset.set(0, 0, 0);
    this.followBaseY = 0;
    this.setCameraPreset('chase', true);
  }

  /**
   * The title screen's camera: a slow circle round the rider, on the chase preset's smoothing and wall occlusion. Off,
   * it glides back behind the rider into the chase view.
   */
  setTitleOrbit(on) {
    this.titleOrbit = Boolean(on);
    this.resetOrbit();
    this.setCameraPreset('chase', false);
  }

  getActivePreset() {
    return CAMERA_PRESETS.find((p) => p.id === this.activePresetId) || CAMERA_PRESETS[0];
  }

  onResize(width, height) {
    if (!(width > 0 && height > 0)) return;
    this._clearPointers();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Temporary authored framing; never selects or saves a user camera preset. */
  setCinematic(view) {
    this.cinematic = view;
    if (!view) {
      this.camera.fov = this.getActivePreset().fov;
      this.camera.updateProjectionMatrix();
      this.initialized = false;
      this.shotInitialized = false;
    }
  }

  update(dt, elapsed) {
    if (this.cinematic) {
      const { position: p, target: t, fov } = this.cinematic;
      this.currentPos.set(p.x, p.y, p.z);
      this.currentLookAt.set(t.x, t.y, t.z);
      this.camera.position.copy(this.currentPos);
      if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.camera.lookAt(this.currentLookAt);
      return;
    }
    const entity = this.controllerManager.getActiveEntity();
    const p = entity.position, last = this._lastRiderPosition;
    // Recovery / external placement can relocate without a menu teleport. Never fly across the city to catch up.
    if (this.hasRiderPosition && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 40) {
      this.initialized = false;
      this.shotInitialized = false;
      this.armFraction = 1;
    }
    last.copy(p);
    this.hasRiderPosition = true;
    const localShot = !this.titleOrbit && LOCAL_SHOTS[this.activePresetId];
    const desiredPos = this._desiredPos;
    const desiredLook = this._desiredLook;

    if (this.userOrbitTimer > 0 && !this.isDragging) {
      this.userOrbitTimer = Math.max(0, this.userOrbitTimer - dt);
    }

    if (!this.isDragging && this.userOrbitTimer <= 0 && Math.abs(entity.speed) > 0.5) {
      this.orbitYawOffset -= Math.round(this.orbitYawOffset / (Math.PI * 2)) * (Math.PI * 2);
      this.orbitYawOffset += (0.0 - this.orbitYawOffset) * (1 - Math.exp(-dt * 2.2));
    }

    // The follow cameras pull back with speed, eased so that they drift back as the entity speeds up (and in as it
    // slows down); speedLag is about how far their former world-space smoothing left them trailing at 60 FPS
    this.smoothedSpeed += (Math.abs(entity.speed) - this.smoothedSpeed) * (1 - Math.exp(-dt * 3.0));
    const speedLag = this.smoothedSpeed * 0.1;

    const totalYaw = entity.heading + this.orbitYawOffset;

    switch (this.titleOrbit ? 'title' : this.activePresetId) {
      case 'title': {
        const angle = entity.heading + Math.PI * 0.82 + elapsed * TITLE_ORBIT.turnRate;
        desiredPos.set(
          entity.position.x - Math.sin(angle) * TITLE_ORBIT.radius,
          entity.position.y + TITLE_ORBIT.height,
          entity.position.z - Math.cos(angle) * TITLE_ORBIT.radius
        );
        desiredLook.set(entity.position.x, entity.position.y + TITLE_ORBIT.lookHeight, entity.position.z);
        break;
      }

      case 'chase': {
        const dist = entity.chaseDistance * this.zoomMultiplier * (1 + Math.min(0.25, this.smoothedSpeed * 0.01));
        const height = entity.chaseHeight * this.zoomMultiplier + Math.sin(this.orbitPitchOffset) * dist * 0.85;
        const horizDist = Math.cos(this.orbitPitchOffset) * dist + speedLag;

        desiredPos.set(
          entity.position.x - Math.sin(totalYaw) * horizDist,
          entity.position.y + height,
          entity.position.z - Math.cos(totalYaw) * horizDist
        );

        const lookUpBias = 1.55; // a standing rider's chest, plus cameraTargetOffset (euc-rider.js)
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 5.2,
          entity.position.y + entity.cameraTargetOffset.y + lookUpBias,
          entity.position.z + Math.cos(entity.heading) * 5.2
        );
        break;
      }

      case 'action': {
        const sideOffset = 0.95;
        const backDist = 2.8 + speedLag;
        const lowY = entity.position.y + 0.92;

        desiredPos.set(
          entity.position.x - Math.sin(entity.heading) * backDist + Math.cos(entity.heading) * sideOffset,
          lowY,
          entity.position.z - Math.cos(entity.heading) * backDist - Math.sin(entity.heading) * sideOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 3.2,
          entity.position.y + 1.05,
          entity.position.z + Math.cos(entity.heading) * 3.2
        );
        break;
      }

      case 'pov': {
        // The rider stands on pedals ~0.2 m up: eyes about 1.85 m above the road, just ahead of the face
        const fwdOffset = 0.3;
        const eyeY = 1.85;

        desiredPos.set(
          entity.position.x + Math.sin(entity.heading) * fwdOffset,
          entity.position.y + eyeY,
          entity.position.z + Math.cos(entity.heading) * fwdOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 40.0,
          entity.position.y + eyeY + Math.sin(-this.orbitPitchOffset) * 18.0 + 1.5,
          entity.position.z + Math.cos(totalYaw) * 40.0
        );
        break;
      }

      default:
        this.localFraming(entity, localShot, dt, desiredPos, desiredLook);
    }

    if (!this.initialized || this.activePresetId === 'pov' || localShot) {
      this.currentPos.copy(desiredPos);
      this.currentLookAt.copy(desiredLook);
      this.initialized = true;
      this.followEntity = null; // the follow cameras re-anchor from here
    } else if (this.activePresetId === 'chase' || this.activePresetId === 'action') {
      // Smoothed in the followed entity's frame rather than in world space. A world-space follower trails a moving
      // target by a distance that depends on the frame time (about speed x dt), so with uneven frame times the camera
      // surged back and forth behind an accelerating or fast car. Relative to the entity a steady drive keeps the
      // camera steady, while turns, orbit drags, zoom & the speed pull-back are still eased. The entity's height is
      // eased in world space (curbs, park lawns, hops).
      if (this.followEntity !== entity) {
        // preset or mode switch: start from where the camera is and glide over to the new framing
        this.followEntity = entity;
        this.followBaseY = entity.position.y;
        this.followOffset.subVectors(this.currentPos, entity.position);
        this.followLookOffset.subVectors(this.currentLookAt, entity.position);
      }
      const k = 1 - Math.exp(-dt * 8.5);
      this.followBaseY += (entity.position.y - this.followBaseY) * k;
      this.followOffset.lerp(desiredPos.sub(entity.position), k);
      this.followLookOffset.lerp(desiredLook.sub(entity.position), k);
      this.currentPos.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followOffset);
      this.currentLookAt.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followLookOffset);
    } else {
      this.followEntity = null;
      const k = 1 - Math.exp(-dt * 8.5);
      this.currentPos.lerp(desiredPos, k);
      this.currentLookAt.lerp(desiredLook, k);
    }

    this.camera.position.copy(this.currentPos);
    const look = this._look ??= new THREE.Vector3();
    look.copy(this.currentLookAt);
    if (localShot) this.occludeLocal(entity, dt, look);
    else if (this.activePresetId === 'chase' || this.activePresetId === 'action') this.occlude(entity, dt, look);
    else this.armFraction = 1;
    this.camera.lookAt(look);
  }

  /** Polar easing keeps each shot's radius stable through turns and follows translation without world-space lag. */
  localFraming(entity, shot, dt, position, look) {
    const p = entity.position;
    const portrait = Math.min(1, this.camera.aspect);
    const scale = Math.max(.65, Math.min(1.7, this.zoomMultiplier)) * (.88 + .12 * portrait);
    const radius = Math.hypot(shot.back, shot.side) * scale;
    const height = Math.max(.8, shot.height * scale + Math.sin(this.orbitPitchOffset - .09) * radius * .4);
    this.sideCheckIn -= dt;
    this.sideHold = Math.max(0, this.sideHold - dt);
    if (shot.side && this.activePresetId !== 'drone' && this.sideCheckIn <= 0 && !this.isDragging && this.userOrbitTimer <= 0) {
      this.sideCheckIn = .3;
      const score = (side) => {
        const angle = entity.heading + Math.atan2(shot.side * side, -shot.back);
        this._candidate.set(p.x + Math.sin(angle) * radius, p.y + height, p.z + Math.cos(angle) * radius);
        let value = this.clearArm(entity, this._candidate, false);
        // A nearby water-facing camera can show the rider against the skyline; never prefer a blocked water shot.
        if (this.activePresetId === 'waterfront' && value > .85 &&
          this.waterSide(this._candidate.x, this._candidate.z, p.y)) value += .35;
        return value;
      };
      if (this.sideHold <= 0 && score(-this.shotSide) > score(this.shotSide) + .22) {
        this.shotSide *= -1;
        this.sideHold = 1.5;
      }
    }
    // Pause the automatic orbit while looking manually; phase advances only while this preset is selected.
    if (this.activePresetId === 'drone' && !this.isDragging && this.userOrbitTimer <= 0) {
      this.directorAngle = (this.directorAngle + dt * .09) % (Math.PI * 2);
    }
    const yaw = entity.heading + Math.atan2(shot.side * this.shotSide, -shot.back) +
      this.orbitYawOffset + (this.activePresetId === 'drone' ? this.directorAngle : 0);
    const lead = shot.lead * portrait;
    if (!this.shotInitialized) {
      const dx = this.currentPos.x - p.x, dz = this.currentPos.z - p.z;
      const oldRadius = Math.hypot(dx, dz);
      const blend = this.initialized && oldRadius > 1 && oldRadius < 60;
      this.shotYaw = blend ? Math.atan2(dx, dz) : yaw;
      this.shotRadius = blend ? oldRadius : radius;
      this.shotHeight = blend ? Math.max(.8, this.currentPos.y - p.y) : height;
      this.shotLead = blend ? 0 : lead;
      this.shotLookHeight = blend ? 1.2 : shot.lookHeight;
      this.shotHeading = entity.heading;
      this.shotInitialized = true;
    }
    const k = 1 - Math.exp(-dt * 4);
    this.shotYaw += Math.atan2(Math.sin(yaw - this.shotYaw), Math.cos(yaw - this.shotYaw)) * k;
    this.shotRadius += (radius - this.shotRadius) * k;
    this.shotHeight += (height - this.shotHeight) * k;
    this.shotLead += (lead - this.shotLead) * k;
    this.shotLookHeight += (shot.lookHeight - this.shotLookHeight) * k;
    const headingDelta = entity.heading - this.shotHeading;
    this.shotHeading += Math.atan2(Math.sin(headingDelta), Math.cos(headingDelta)) * k;
    position.set(
      p.x + Math.sin(this.shotYaw) * this.shotRadius,
      p.y + this.shotHeight,
      p.z + Math.cos(this.shotYaw) * this.shotRadius
    );
    look.set(
      p.x + Math.sin(this.shotHeading) * this.shotLead,
      p.y + this.shotLookHeight,
      p.z + Math.cos(this.shotHeading) * this.shotLead
    );
  }

  waterSide(x, z, referenceY) {
    const sampler = this.controllerManager.eucSampler;
    return Boolean(sampler?.isWater?.(x, z, referenceY));
  }

  /** Bounded native box queries. Four parallel guard rays leave room for the camera near plane at corners. */
  clearArm(entity, position, guards) {
    const sampler = this.controllerManager.eucSampler;
    if (!sampler?.raycast) return 1;
    const p = entity.position, o = this._rayOrigin, d = this._rayDirection;
    d.x = position.x - p.x;
    d.y = position.y - (p.y + 1.2);
    d.z = position.z - p.z;
    const length = Math.hypot(d.x, d.y, d.z);
    if (length < .001) return 1;
    let allowed = length;
    for (let i = 0; i < (guards ? 5 : 1); i++) {
      o.x = p.x + (i === 1 ? .25 : i === 2 ? -.25 : 0);
      o.y = p.y + 1.2;
      o.z = p.z + (i === 3 ? .25 : i === 4 ? -.25 : 0);
      const hit = sampler.raycast(o, d, length);
      if (hit !== null) allowed = Math.min(allowed, Math.max(.08, hit - .6));
    }
    return allowed / length;
  }

  occludeLocal(entity, dt, look) {
    const target = this.clearArm(entity, this.camera.position, true);
    if (target < this.armFraction) this.armFraction = target;
    else this.armFraction += (target - this.armFraction) * (1 - Math.exp(-dt * 4));
    if (this.armFraction >= .999) return;
    const p = entity.position, f = this.armFraction;
    // Stay on the tested segment, including under bridges: lifting after a ray hit can enter a ceiling.
    this.camera.position.set(
      p.x + (this.camera.position.x - p.x) * f,
      p.y + 1.2 + (this.camera.position.y - p.y - 1.2) * f,
      p.z + (this.camera.position.z - p.z) * f
    );
    look.lerp(this._riderPoint.set(p.x, p.y + 1.1, p.z), 1 - f);
  }

  /**
   * Keep a follow camera out of buildings: one ray (euc-terrain.js raycast, buildings and landmarks; posts do not
   * occlude) from the rider's chest to the camera. Something in the way pulls the camera in front of it at once; it
   * eases back out once the way is clear. Only the rendered position moves, so the follow smoothing is unaffected.
   */
  occlude(entity, dt, look) {
    const sampler = this.controllerManager?.eucSampler;
    if (!sampler?.raycast || !entity?.position) return;
    const o = this._rayOrigin, d = this._rayDirection;
    o.x = entity.position.x;
    o.y = entity.position.y + CAMERA_ARM.anchorHeight;
    o.z = entity.position.z;
    d.x = this.camera.position.x - o.x;
    d.y = this.camera.position.y - o.y;
    d.z = this.camera.position.z - o.z;
    const length = Math.hypot(d.x, d.y, d.z);
    if (!(length > CAMERA_ARM.minDistance)) return;
    const hit = sampler.raycast(o, d, length);
    const target = hit === null ? 1 : Math.max(CAMERA_ARM.minDistance, hit - CAMERA_ARM.clearance) / length;
    if (target < this.armFraction) this.armFraction = target;
    else this.armFraction += (target - this.armFraction) * (1 - Math.exp(-dt * CAMERA_ARM.easeOut));
    if (this.armFraction >= 0.999) return;
    const f = Math.min(1, this.armFraction);
    // Retain the ordinary wall composition: rise and tip down to look over the rider. A suspended deck can block
    // that rise even when the original arm was clear, so validate the lifted arm before submitting the view.
    const pull = 1 - f;
    d.x *= f;
    d.y = d.y * f + CAMERA_ARM.lift * pull;
    d.z *= f;
    const liftedLength = Math.hypot(d.x, d.y, d.z);
    const liftedHit = sampler.raycast(o, d, liftedLength);
    // No minimum arm length on this safety correction: a close ceiling may leave less than minDistance clear.
    const safe = liftedHit === null ? 1 : Math.max(0, liftedHit - CAMERA_ARM.clearance) / liftedLength;
    this.camera.position.set(o.x + d.x * safe, o.y + d.y * safe, o.z + d.z * safe);
    look.lerp(this._riderPoint.set(o.x, entity.position.y + CAMERA_ARM.lookHeight, o.z), Math.min(1, pull * CAMERA_ARM.lookPull));
  }
}

// The title screen's circle round the rider: low and close enough to see the rider and the wheel, slow
const TITLE_ORBIT = Object.freeze({ radius: 5.2, height: 1.7, lookHeight: 1.05, turnRate: 0.09 });

// The follow cameras' arm against walls (CameraSystem.occlude)
const CAMERA_ARM = Object.freeze({
  anchorHeight: 1.2, // m above the wheel: the rider's chest, which is never inside a building
  clearance: 0.6, // m kept in front of the wall (the near plane is 0.35)
  minDistance: 0.6, // m: never closer to the rider than this
  easeOut: 4, // 1/s: back out once the way is clear
  lift: 0.9, // m of rise when pulled all the way in
  lookHeight: 0.9, // m above the wheel: where it looks, pulled all the way in (so the rider stays in frame)
  lookPull: 0.4, // how far the look target moves toward that point, pulled all the way in
});

export { CAMERA_PRESETS, CameraSystem };
