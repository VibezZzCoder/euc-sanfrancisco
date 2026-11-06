// SF Spin-off: EUC Thrills — © 2026 VibezZzCoder — MIT.
// Selected EUC-only helpers from NYC vehicle-lights.js @9c4cfc9e32a425d58bac36cf9e074a2aa77fac70.
// Keep the classic SF vehicle light module and its shared NPC consumers independent.
import * as THREE from 'three/webgpu';

export const EUC_HEADLIGHT = Object.freeze({ color: 0xfff4e2, intensity: 150, distance: 22,
  angle: 0.5, penumbra: 0.7, decay: 1.3, pitch: 0.27, noseOffset: 0.02, lensNight: 2.4 });

export function headlightBeamScale(glow) {
  return Math.max(0, Math.min(1.28, (glow - 0.60) * 1.45));
}

export function createEucHeadlight() {
  const c = EUC_HEADLIGHT;
  return new THREE.SpotLight(c.color, 0, c.distance, c.angle, c.penumbra, c.decay);
}

/** Lens front centre in the wheel body frame (+Z forward); banking/pitch follow the posed rig. */
export function placeEucHeadlight(spot, lamp, matrix) {
  const z = lamp.z + EUC_HEADLIGHT.noseOffset, aim = 10;
  spot.position.set(lamp.x, lamp.y, z);
  spot.target.position.set(lamp.x, lamp.y - aim * Math.tan(EUC_HEADLIGHT.pitch), z + aim);
  if (matrix) {
    spot.position.applyMatrix4(matrix);
    spot.target.position.applyMatrix4(matrix);
  }
}
