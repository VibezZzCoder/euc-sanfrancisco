// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/riderClothDrape.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
export function drapeRiderHem(geometry, pelvis, hips, layout) {
    const { radial, rings: rows, splitSeam } = layout;
    const positions = geometry.getAttribute('position');
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.getAttribute('normal').setUsage(THREE.DynamicDrawUsage);
    const rest = positions.array.slice();
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += .10;
    const inversePelvis = new THREE.Matrix4();
    const intoHip = hips.map(() => new THREE.Matrix4()), intoPelvis = hips.map(() => new THREE.Matrix4());
    const point = new THREE.Vector3(), original = new THREE.Vector3(), normal = new THREE.Vector3();
    const rx = layout.envelope?.x ?? .102, rz = layout.envelope?.z ?? .094;
    const cap = layout.envelope?.cap ?? .080, top = 0, bottom = -.25;
    const probe = new THREE.Vector3();
    const inside = (at) => {
        for (let h = 0; h < hips.length; h++) {
            probe.copy(at).applyMatrix4(intoHip[h]);
            const dy = probe.y - Math.min(top, Math.max(bottom, probe.y));
            if ((probe.x / rx) ** 2 + (dy / cap) ** 2 + (probe.z / rz) ** 2 < 1)
                return true;
        }
        return false;
    };
    const columns = radial + (splitSeam ? 1 : 0);
    const lift = geometry.getAttribute('normal').array.slice();
    for (let i = 0; i < positions.count; i++) {
        normal.fromArray(lift, i * 3);
        normal.y += .45;
        normal.normalize().toArray(lift, i * 3);
    }
    const weight = (y) => { const t = Math.min(1, Math.max(0, (.22 - y) / .15)); return t * t * (3 - 2 * t); };
    const travel = new Float32Array(columns), widened = new Float32Array(columns);
    const clear = (c, t) => {
        for (let r = 0; r < rows; r++) {
            const i = r * columns + c, y = rest[i * 3 + 1];
            if (y > .16)
                break;
            point.fromArray(rest, i * 3).addScaledVector(normal.fromArray(lift, i * 3), t * weight(y));
            if (inside(point))
                return false;
        }
        return true;
    };
    return () => {
        pelvis.updateWorldMatrix(true, false);
        inversePelvis.copy(pelvis.matrixWorld).invert();
        hips.forEach((hip, i) => {
            hip.updateWorldMatrix(true, false);
            intoPelvis[i].multiplyMatrices(inversePelvis, hip.matrixWorld);
            intoHip[i].copy(intoPelvis[i]).invert();
        });
        for (let c = 0; c < radial; c++) {
            let t = 0;
            if (!clear(c, 0)) {
                let low = 0;
                for (t = .004; t < .09 && !clear(c, t); t += .004)
                    low = t;
                t = Math.min(.09, t);
                for (let k = 0; k < 4; k++) {
                    const mid = (low + t) / 2;
                    if (clear(c, mid))
                        t = mid;
                    else
                        low = mid;
                }
            }
            travel[c] = t;
        }
        for (let c = 0; c < radial; c++) {
            const before = travel[(c + radial - 1) % radial], after = travel[(c + 1) % radial];
            widened[c] = Math.max(travel[c], (before + 2 * travel[c] + after) / 4);
        }
        if (splitSeam)
            widened[radial] = widened[0];
        for (let i = 0; i < positions.count; i++) {
            original.fromArray(rest, i * 3);
            const t = i < rows * columns ? Math.min(.09, widened[i % columns]) * weight(original.y) : 0;
            point.copy(original).addScaledVector(normal.fromArray(lift, i * 3), t);
            positions.setXYZ(i, point.x, point.y, point.z);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        const normals = geometry.getAttribute('normal');
        for (let r = 0; splitSeam && r < rows; r++) {
            const a = r * (radial + 1), b = a + radial;
            normal.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
            normals.setXYZ(a, normal.x, normal.y, normal.z);
            normals.setXYZ(b, normal.x, normal.y, normal.z);
        }
    };
}
