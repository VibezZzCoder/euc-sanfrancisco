// Adapted from euc-newyork@7cf4ce7f0092b1f5f0627c2b9a4611bcc262e31d,
// js/booking-scene.js blob f4f00cc4af41150e2e588888f760e0be4f347772.
// Original props © 2026 VibezZzCoder, MIT (see LICENSE).
import * as THREE from 'three/webgpu';
import { BOOKING_RULES } from './booking.js';

/**
 * Temporary presentation only. site is { x, y, z, heading }; its origin is the
 * desk's ground centre, and heading rotates the local +Z rider-facing side.
 * No placement, actor clearance, camera collision or navigation is performed.
 *
 * officer is an optional presentation adapter:
 * beginBooking(x, y, z, heading), presentBooking(dt, action), endBooking(),
 * and onPaperTorn(). action includes the world-space writing point and lamp
 * lens; an adapter may borrow its existing spotlight there. It owns restoring it.
 * Create/precompile once and dispose only after renderer/compile readers drain.
 */
export function createBookingScene(scene, site, officer = {}) {
  if (!site || !['x', 'y', 'z', 'heading'].every((key) => Number.isFinite(site[key]))) {
    throw new TypeError('Booking site requires finite x, y, z and heading');
  }
  const { x, y, z, heading } = site;
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const world = (out, lx, ly, lz) => {
    out.x = x + cos * lx + sin * lz;
    out.y = y + ly;
    out.z = z - sin * lx + cos * lz;
    return out;
  };
  const group = new THREE.Group();
  group.name = 'SFBookingDesk';
  group.position.set(x, y, z);
  group.rotation.y = heading;
  group.userData.presentationOnly = true;
  group.visible = false;

  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x263c46, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0x7e6247, roughness: 0.84 }),
    new THREE.MeshBasicMaterial({ color: 0xf5eddb }),
    new THREE.MeshBasicMaterial({ color: 0x17232c }),
    new THREE.MeshBasicMaterial({ color: 0xffe2b3, side: THREE.DoubleSide }),
  ];
  const [navy, wood, paper, ink, lensMaterial] = materials;
  function box(bx, by, bz, w, h, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(bx, by, bz);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  box(0, 0.88, 0, 1.9, 0.12, 0.85, wood);
  box(0, 0.46, 0.17, 1.7, 0.8, 0.12, navy);
  for (const side of [-0.8, 0.8]) box(side, 0.43, 0, 0.08, 0.86, 0.65, navy);
  box(-0.24, 0.965, 0, 0.52, 0.04, 0.53, navy);
  const halves = [-1, 1].map((side) => box(-0.24, 0.995, side * 0.11, 0.43, 0.012, 0.215, paper));
  const scribble = box(-0.24, 1.004, 0, 0.32, 0.004, 0.025, ink);
  box(0.82, 1.45, 0, 0.045, 1, 0.045, navy);
  box(0.97, 1.95, 0, 0.34, 0.045, 0.045, navy);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 12), navy);
  shade.position.set(1.12, 1.9, 0); group.add(shade);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), lensMaterial);
  lens.name = 'booking-desk-lens';
  lens.rotation.x = Math.PI / 2; lens.position.set(1.12, 1.808, 0); group.add(lens);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#263c46'; context.fillRect(0, 0, 512, 128);
  context.fillStyle = '#f5eddb'; context.textAlign = 'center'; context.font = '700 40px Inter, sans-serif';
  context.fillText('INTAKE', 256, 51);
  context.font = '600 22px Inter, sans-serif'; context.fillText('VEHICLE PROCESSING', 256, 95);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({ map: texture });
  materials.push(signMaterial);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.275), signMaterial);
  sign.position.set(0, 0.52, 0.236); group.add(sign);
  scene.add(group);

  const officerPoint = world({}, 0, 0, -1.4);
  const action = world({ writing: false, age: 0, light: {} }, -0.24, 1.03, 0);
  world(action.light, 1.12, 1.808, 0);
  const cameraView = { position: {}, target: {}, fov: 52 };
  let staged = false, thumped = false, disposed = false;
  function end() {
    group.visible = false;
    if (staged) {
      staged = false;
      thumped = false;
      officer.endBooking?.();
    }
  }
  return {
    group,
    cameraView,
    update(dt, state, aspect) {
      if (disposed) throw new Error('Booking scene is disposed');
      if (!state || state.phase === 'idle' || state.phase === 'captured') { end(); return null; }
      group.visible = true;
      if (!staged) {
        officer.beginBooking?.(officerPoint.x, officerPoint.y, officerPoint.z, heading);
        staged = true;
      }
      const signature = state.phase === 'signature';
      const writing = signature && state.age >= BOOKING_RULES.writeDelay && state.age < BOOKING_RULES.tearSeconds;
      const torn = state.phase === 'released' || (signature && state.age >= BOOKING_RULES.tearSeconds);
      const fall = signature ? Math.max(0, Math.min(1, (state.age - BOOKING_RULES.tearSeconds) / 1.4)) : torn ? 1 : 0;
      halves.forEach((half, i) => {
        const side = i === 0 ? -1 : 1;
        half.position.set(-0.24 + side * fall * 1.7, 0.995 * (1 - fall) + 1.4 * Math.sin(Math.PI * fall), side * (0.11 + fall * 0.25));
        half.rotation.set(Math.sin(Math.PI * fall) * side * 0.45, fall * side * 0.65, Math.sin(Math.PI * fall) * side * 0.55);
      });
      scribble.visible = writing && state.age > BOOKING_RULES.writeDelay + 0.3;
      scribble.rotation.y = Math.sin(state.age * 30) * 0.3;
      if (torn && !thumped) { thumped = true; officer.onPaperTorn?.(); }
      action.writing = writing; action.age = state.age;
      officer.presentBooking?.(dt, action);
      const portrait = aspect < 0.85;
      const close = signature ? Math.min(1, state.age / 0.8) : 0;
      world(cameraView.position, 3.8 - close * 1.4, 2.4, (portrait ? 6.8 : 5.8) - close * (portrait ? 2 : 1.8));
      world(cameraView.target, portrait ? 0 : aspect < 2.3 ? 1.2 : 0.6, portrait ? 0.95 : 1.1, -0.15);
      cameraView.fov = portrait ? 55 : 50;
      return cameraView;
    },
    end,
    dispose() {
      if (disposed) return;
      disposed = true;
      try { end(); } finally {
        group.removeFromParent();
        group.traverse((object) => object.geometry?.dispose());
        for (const material of materials) material.dispose();
        texture.dispose();
      }
    },
  };
}
