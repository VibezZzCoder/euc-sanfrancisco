// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/riderJointSurface.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
export function joinRiderSurface(upper, lower, joint, length, band) {
    const half = new THREE.Quaternion(), rotation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const parts = [upper, lower].map((geometry, part) => {
        const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
        p.setUsage(THREE.DynamicDrawUsage);
        n.setUsage(THREE.DynamicDrawUsage);
        const samples = [];
        for (let i = 0; i < p.count; i++) {
            const y = p.getY(i) + (part === 0 ? length : 0);
            const t = Math.max(0, 1 - Math.abs(y) / band);
            if (t === 0)
                continue;
            const position = new THREE.Vector3(p.getX(i), y, p.getZ(i));
            const direction = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
            if (Math.abs(y) < 1e-6)
                direction.set(position.x, 0, position.z).normalize();
            samples.push({ index: i, p: position, n: direction, weight: t * t * (3 - 2 * t) });
        }
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += band;
        return { p, n, samples, part };
    });
    return () => {
        half.identity().slerp(joint.quaternion, .5);
        for (const { p, n, samples, part } of parts) {
            rotation.copy(half);
            if (part === 1)
                rotation.premultiply(inverse.copy(joint.quaternion).invert());
            for (const sample of samples) {
                point.copy(sample.p).applyQuaternion(rotation).lerp(sample.p, 1 - sample.weight);
                normal.copy(sample.n).applyQuaternion(rotation).lerp(sample.n, 1 - sample.weight).normalize();
                p.setXYZ(sample.index, point.x, point.y - (part === 0 ? length : 0), point.z);
                n.setXYZ(sample.index, normal.x, normal.y, normal.z);
            }
            p.needsUpdate = true;
            n.needsUpdate = true;
        }
    };
}
