// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/softBodies.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
export class SoftBodyField {
    bodies;
    constructor(bodies = []) {
        this.bodies = bodies.map((body) => {
            const cos = Math.cos(body.rotationY);
            const sin = Math.sin(body.rotationY);
            const reachX = Math.abs(body.halfExtents.x * cos) + Math.abs(body.halfExtents.z * sin);
            const reachZ = Math.abs(body.halfExtents.x * sin) + Math.abs(body.halfExtents.z * cos);
            return {
                x: body.centre.x,
                z: body.centre.z,
                minY: body.centre.y - body.halfExtents.y,
                maxY: body.centre.y + body.halfExtents.y,
                halfX: body.halfExtents.x,
                halfZ: body.halfExtents.z,
                cos,
                sin,
                minX: body.centre.x - reachX,
                maxX: body.centre.x + reachX,
                minZ: body.centre.z - reachZ,
                maxZ: body.centre.z + reachZ,
            };
        });
    }
    get empty() {
        return this.bodies.length === 0;
    }
    contains(x, y, z) {
        for (const body of this.bodies) {
            if (x < body.minX || x > body.maxX || z < body.minZ || z > body.maxZ)
                continue;
            if (y < body.minY || y > body.maxY)
                continue;
            const dx = x - body.x;
            const dz = z - body.z;
            const localX = dx * body.cos - dz * body.sin;
            const localZ = dx * body.sin + dz * body.cos;
            if (Math.abs(localX) <= body.halfX && Math.abs(localZ) <= body.halfZ)
                return true;
        }
        return false;
    }
}
export const NO_SOFT_BODIES = new SoftBodyField();
