// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/paddle.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS, PADDLE } from '../data/tuning.js';
import { mergeGeometries, shaded } from './blockoutKit.js';
const SHAFT_FRACTION = 0.62;
const SHAFT_RADIUS = 0.023;
const GRIP_SHADE = 0.42;
const SHAFT_SHADE = 0.72;
const FACE_SHADE = 1.15;
const CARRY = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.42, 0, -0.18, 'XYZ'));
const GROUND_CLEARANCE = 0.08;
const parentQuat = new THREE.Quaternion();
const worldQuat = new THREE.Quaternion();
const liftQuat = new THREE.Quaternion();
const shaftDir = new THREE.Vector3();
const liftedDir = new THREE.Vector3();
export function createPaddle() {
    const group = new THREE.Group();
    group.name = 'rider-paddle';
    const shaftLength = PADDLE.reach * SHAFT_FRACTION;
    const faceRadius = PADDLE.headRadius;
    const parts = [];
    const gripLength = Math.min(0.14, shaftLength * 0.35);
    const grip = new THREE.CylinderGeometry(SHAFT_RADIUS * 1.25, SHAFT_RADIUS * 1.1, gripLength, 8);
    grip.rotateX(Math.PI / 2);
    grip.translate(0, 0, gripLength / 2);
    parts.push(shaded(grip, GRIP_SHADE));
    const shaftSpan = shaftLength - gripLength;
    const shaft = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS * 1.1, shaftSpan, 8);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(0, 0, gripLength + shaftSpan / 2);
    parts.push(shaded(shaft, SHAFT_SHADE));
    const face = new THREE.CylinderGeometry(faceRadius, faceRadius, 0.055, 18);
    face.translate(0, 0, shaftLength);
    parts.push(shaded(face, FACE_SHADE));
    const rim = new THREE.TorusGeometry(faceRadius, 0.016, 6, 20);
    rim.translate(0, 0, shaftLength);
    parts.push(shaded(rim, SHAFT_SHADE));
    const geometry = mergeGeometries(parts);
    const material = new THREE.MeshStandardMaterial({
        color: BLOCKOUT_COLOURS.paddle,
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.04,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'rider-paddle-mesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.visible = false;
    return {
        group,
        shaftLength,
        aim(headWorld, blend, groundY) {
            if (headWorld === null) {
                group.visible = false;
                return;
            }
            group.visible = true;
            const committed = blend < 0 ? 0 : blend > 1 ? 1 : blend;
            group.updateWorldMatrix(true, false);
            group.lookAt(headWorld);
            if (committed < 1)
                group.quaternion.slerp(CARRY, 1 - committed);
            const parent = group.parent;
            if (parent === null)
                return;
            parentQuat.setFromRotationMatrix(parent.matrixWorld);
            worldQuat.multiplyQuaternions(parentQuat, group.quaternion);
            shaftDir.set(0, 0, 1).applyQuaternion(worldQuat);
            const tipLength = shaftLength + faceRadius;
            const gripY = group.matrixWorld.elements[13];
            const minDirY = (groundY + GROUND_CLEARANCE - gripY) / tipLength;
            if (shaftDir.y >= minDirY || minDirY >= 1)
                return;
            const horizontal = Math.hypot(shaftDir.x, shaftDir.z);
            if (horizontal < 1e-4)
                return;
            const scale = Math.sqrt(1 - minDirY * minDirY) / horizontal;
            liftedDir.set(shaftDir.x * scale, minDirY, shaftDir.z * scale);
            liftQuat.setFromUnitVectors(shaftDir, liftedDir);
            worldQuat.premultiply(liftQuat);
            group.quaternion.copy(parentQuat.invert()).multiply(worldQuat);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            group.removeFromParent();
        },
    };
}
