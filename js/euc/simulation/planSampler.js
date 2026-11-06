// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/planSampler.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { GROUND_CERTIFICATE as CERT } from '../data/tuning.js';
const GRID_TARGET_CELL = 8;
const GRID_MAX_SPAN = 256;
const MARCH_FRACTION = 0.5;
const MARCH_REFINEMENTS = 8;
const MARCH_MAX_STEPS = 512;
export class PlanTerrainSampler {
    obstacleNormal = { x: 0, y: 0, z: 0 };
    obstacleFace = { distance: 0, halfExtentX: 0, halfExtentZ: 0, inside: false, faceOffset: 0 };
    colliders;
    field;
    surround;
    groundPatches;
    supportHazards;
    supportHazardPrefixMaxX;
    supportHazardsValid;
    maxX;
    maxZ;
    gridOriginX;
    gridOriginZ;
    gridCell;
    gridColumns;
    gridRows;
    gridStarts;
    gridItems;
    stamps;
    stamp = 0;
    constructor(plan) {
        this.colliders = [
            ...plan.segments.flatMap((segment) => segment.colliders),
            ...(plan.solids ?? []),
        ].map((collider) => {
            const cos = Math.cos(collider.rotationY);
            const sin = Math.sin(collider.rotationY);
            const spanX = Math.abs(cos) * collider.halfExtents.x
                + Math.abs(sin) * collider.halfExtents.z;
            const spanZ = Math.abs(sin) * collider.halfExtents.x
                + Math.abs(cos) * collider.halfExtents.z;
            return {
                collider,
                cos,
                sin,
                minX: collider.centre.x - spanX,
                maxX: collider.centre.x + spanX,
                minZ: collider.centre.z - spanZ,
                maxZ: collider.centre.z + spanZ,
                occludes: collider.occludes !== false,
            };
        });
        this.field = plan.heightfield;
        this.surround = plan.surround;
        this.maxX = this.field.originX + (this.field.columns - 1) * this.field.spacing;
        this.maxZ = this.field.originZ + (this.field.rows - 1) * this.field.spacing;
        this.groundPatches = undefined;
        if (plan.groundSurfacePatches?.length) {
            const patches = new Map();
            for (const patch of plan.groundSurfacePatches)
                for (const triangle of patch.triangles) {
                    let cell = patches.get(triangle.cell);
                    if (cell === undefined) {
                        cell = [];
                        patches.set(triangle.cell, cell);
                    }
                    cell.push({ surface: patch.surface, sourceSurface: patch.sourceSurface, vertices: triangle.vertices });
                }
            this.groundPatches = patches;
        }
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const prepared of this.colliders) {
            if (prepared.minX < minX)
                minX = prepared.minX;
            if (prepared.maxX > maxX)
                maxX = prepared.maxX;
            if (prepared.minZ < minZ)
                minZ = prepared.minZ;
            if (prepared.maxZ > maxZ)
                maxZ = prepared.maxZ;
        }
        if (this.colliders.length === 0) {
            minX = 0;
            maxX = 0;
            minZ = 0;
            maxZ = 0;
        }
        const spanX = Math.max(maxX - minX, 1e-6);
        const spanZ = Math.max(maxZ - minZ, 1e-6);
        this.gridCell = Math.max(GRID_TARGET_CELL, spanX / GRID_MAX_SPAN, spanZ / GRID_MAX_SPAN);
        this.gridOriginX = minX;
        this.gridOriginZ = minZ;
        this.gridColumns = Math.max(1, Math.ceil(spanX / this.gridCell));
        this.gridRows = Math.max(1, Math.ceil(spanZ / this.gridCell));
        const cells = this.gridColumns * this.gridRows;
        const counts = new Int32Array(cells);
        let total = 0;
        for (const prepared of this.colliders) {
            total += this.eachCell(prepared, (cell) => {
                counts[cell] += 1;
            });
        }
        this.gridStarts = new Int32Array(cells + 1);
        for (let cell = 0; cell < cells; cell += 1) {
            this.gridStarts[cell + 1] = this.gridStarts[cell] + counts[cell];
        }
        this.gridItems = new Int32Array(total);
        const cursor = Int32Array.from(this.gridStarts.subarray(0, cells));
        for (let index = 0; index < this.colliders.length; index += 1) {
            this.eachCell(this.colliders[index], (cell) => {
                this.gridItems[cursor[cell]] = index;
                cursor[cell] += 1;
            });
        }
        this.stamps = new Int32Array(this.colliders.length);
        this.supportHazardsValid = (plan.hazards ?? []).every(hazard => [hazard.centre.x, hazard.centre.z, hazard.radius].every(Number.isFinite) && hazard.radius >= 0);
        this.supportHazards = Object.freeze((plan.hazards ?? []).map(hazard => Object.freeze({
            minX: hazard.centre.x - hazard.radius, maxX: hazard.centre.x + hazard.radius,
            minZ: hazard.centre.z - hazard.radius, maxZ: hazard.centre.z + hazard.radius,
        })).sort((a, b) => a.minX - b.minX));
        let prefixMaxX = -Infinity;
        this.supportHazardPrefixMaxX = Object.freeze(this.supportHazards.map(hazard => {
            prefixMaxX = Math.max(prefixMaxX, hazard.maxX);
            return prefixMaxX;
        }));
    }
    get colliderCount() {
        return this.colliders.length;
    }
    certifyFlatSupportWindow(input) {
        const bounds = Object.freeze({ ...input });
        let fieldCells = 0, gridCells = 0, colliderReferences = 0, hazardReferences = 0;
        const result = (status, reason, height) => height === undefined ? Object.freeze({ status, reason, bounds, fieldCells, gridCells, colliderReferences, hazardReferences })
            : Object.freeze({ status, reason, bounds, height, fieldCells, gridCells, colliderReferences, hazardReferences });
        if (!(Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minZ) && Number.isFinite(bounds.maxZ))
            || bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ)
            return result('unsupported', 'invalid-window');
        const field = this.field;
        if (!(Number.isFinite(field.originX) && Number.isFinite(field.originZ) && Number.isFinite(field.spacing)) || !(field.spacing > 0)
            || !Number.isInteger(field.columns) || !Number.isInteger(field.rows) || field.columns < 2 || field.rows < 2
            || bounds.minX < field.originX || bounds.maxX > this.maxX
            || bounds.minZ < field.originZ || bounds.maxZ > this.maxZ)
            return result('unsupported', 'surround-or-invalid-field');
        if (!this.supportHazardsValid)
            return result('unsupported', 'invalid-source-hazard');
        const lower = (minimum, origin, count) => {
            const first = (minimum - origin) / field.spacing;
            return Math.max(0, Math.min(count - 2, Math.floor(first) - (Number.isInteger(first) ? 1 : 0)));
        };
        const upper = (maximum, origin, count) => Math.max(0, Math.min(count - 2, Math.floor((maximum - origin) / field.spacing)));
        const fc = lower(bounds.minX, field.originX, field.columns), tc = upper(bounds.maxX, field.originX, field.columns);
        const fr = lower(bounds.minZ, field.originZ, field.rows), tr = upper(bounds.maxZ, field.originZ, field.rows);
        if ((tc - fc + 1) * (tr - fr + 1) > CERT.maximumFieldCells)
            return result('overflow', 'field-cell-cap');
        let height;
        for (let row = fr; row <= tr; row++)
            for (let column = fc; column <= tc; column++) {
                fieldCells++;
                const base = row * field.columns + column;
                for (let corner = 0; corner < 4; corner++) {
                    const index = corner === 0 ? base : corner === 1 ? base + 1 : corner === 2 ? base + field.columns : base + field.columns + 1;
                    const value = field.heights[index];
                    if (!Number.isFinite(value))
                        return result('unsupported', 'invalid-source-height');
                    if (height === undefined)
                        height = value;
                    if (value !== height)
                        return result('unsupported', 'nonflat-source-triangle');
                }
            }
        const fromColumn = this.columnAt(bounds.minX), toColumn = this.columnAt(bounds.maxX);
        const fromRow = this.rowAt(bounds.minZ), toRow = this.rowAt(bounds.maxZ);
        if ((toColumn - fromColumn + 1) * (toRow - fromRow + 1) > CERT.maximumGridCells)
            return result('overflow', 'collider-grid-cap');
        const visited = new Set();
        const touches = (other) => other.maxX >= bounds.minX && other.minX <= bounds.maxX
            && other.maxZ >= bounds.minZ && other.minZ <= bounds.maxZ;
        for (let row = fromRow; row <= toRow; row++)
            for (let column = fromColumn; column <= toColumn; column++) {
                gridCells++;
                const cell = row * this.gridColumns + column;
                for (let slot = this.gridStarts[cell]; slot < this.gridStarts[cell + 1]; slot++) {
                    if (colliderReferences >= CERT.maximumColliderReferences)
                        return result('overflow', 'collider-reference-cap');
                    colliderReferences++;
                    const index = this.gridItems[slot];
                    if (visited.has(index))
                        continue;
                    visited.add(index);
                    const box = this.colliders[index], top = box.collider.centre.y + box.collider.halfExtents.y;
                    if (!Number.isFinite(top))
                        return result('unsupported', 'invalid-source-top');
                    if (top > height && touches(box))
                        return result('unsupported', 'higher-solid-top');
                }
            }
        let low = 0, high = this.supportHazards.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.supportHazardPrefixMaxX[middle] < bounds.minX)
                low = middle + 1;
            else
                high = middle;
        }
        for (let index = low; index < this.supportHazards.length && this.supportHazards[index].minX <= bounds.maxX; index++) {
            if (hazardReferences >= CERT.maximumHazardReferences)
                return result('overflow', 'hazard-reference-cap');
            hazardReferences++;
            const hazard = this.supportHazards[index];
            if (!(Number.isFinite(hazard.minX) && Number.isFinite(hazard.maxX) && Number.isFinite(hazard.minZ) && Number.isFinite(hazard.maxZ)))
                return result('unsupported', 'invalid-source-hazard');
            if (touches(hazard))
                return result('unsupported', 'authored-hazard');
        }
        return result('flat', 'complete-native-flat-window', height);
    }
    sampleGround(x, z, out) {
        this.sampleField(x, z, out);
        if (out.base !== undefined) {
            out.base.height = out.height;
            out.base.normal.x = out.normal.x;
            out.base.normal.y = out.normal.y;
            out.base.normal.z = out.normal.z;
        }
        const cell = this.cellAt(x, z);
        const end = this.gridStarts[cell + 1];
        for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
            const { collider, cos, sin } = this.colliders[this.gridItems[slot]];
            const dx = x - collider.centre.x;
            const dz = z - collider.centre.z;
            const localX = cos * dx - sin * dz;
            const localZ = sin * dx + cos * dz;
            if (Math.abs(localX) > collider.halfExtents.x)
                continue;
            if (Math.abs(localZ) > collider.halfExtents.z)
                continue;
            const top = collider.centre.y + collider.halfExtents.y;
            if (top <= out.height)
                continue;
            out.height = top;
            out.surface = collider.surface;
            out.traction = undefined;
            out.normal.x = 0;
            out.normal.y = 1;
            out.normal.z = 0;
            out.offCourse = false;
        }
        return out;
    }
    eachCell(prepared, visit) {
        const fromColumn = this.columnAt(prepared.minX);
        const toColumn = this.columnAt(prepared.maxX);
        const fromRow = this.rowAt(prepared.minZ);
        const toRow = this.rowAt(prepared.maxZ);
        let visited = 0;
        for (let row = fromRow; row <= toRow; row += 1) {
            for (let column = fromColumn; column <= toColumn; column += 1) {
                visit(row * this.gridColumns + column);
                visited += 1;
            }
        }
        return visited;
    }
    columnAt(x) {
        const column = Math.floor((x - this.gridOriginX) / this.gridCell);
        return column < 0 ? 0 : column >= this.gridColumns ? this.gridColumns - 1 : column;
    }
    rowAt(z) {
        const row = Math.floor((z - this.gridOriginZ) / this.gridCell);
        return row < 0 ? 0 : row >= this.gridRows ? this.gridRows - 1 : row;
    }
    cellAt(x, z) {
        return this.rowAt(z) * this.gridColumns + this.columnAt(x);
    }
    raycast(origin, direction, maxDistance) {
        const length = Math.hypot(direction.x, direction.y, direction.z);
        if (length === 0 || !(maxDistance > 0) || !Number.isFinite(maxDistance))
            return null;
        const dx = direction.x / length;
        const dy = direction.y / length;
        const dz = direction.z / length;
        let nearest = this.raycastTerrain(origin, dx, dy, dz, maxDistance);
        const obstacle = this.raycastPreparedBoxes(origin, dx, dy, dz, maxDistance, true);
        if (obstacle !== null && (nearest === null || obstacle < nearest))
            nearest = obstacle;
        return nearest;
    }
    raycastObstacle(origin, direction, maxDistance, sweepHalfWidth = 0, sweepLateral, out, initialExit, limb) {
        const length = Math.hypot(direction.x, direction.y, direction.z);
        if (length === 0 || !(maxDistance > 0) || !Number.isFinite(maxDistance))
            return null;
        const width = Number.isFinite(sweepHalfWidth) && sweepHalfWidth > 0
            ? sweepHalfWidth
            : 0;
        const dx = direction.x / length;
        const dy = direction.y / length;
        const dz = direction.z / length;
        const horizontal = Math.hypot(dx, dz);
        const suppliedLateralLength = sweepLateral === undefined
            ? 0
            : Math.hypot(sweepLateral.x, sweepLateral.z);
        const lateralX = suppliedLateralLength > 0
            ? sweepLateral.x / suppliedLateralLength
            : horizontal > 0 ? -dz / horizontal : 0;
        const lateralZ = suppliedLateralLength > 0
            ? sweepLateral.z / suppliedLateralLength
            : horizontal > 0 ? dx / horizontal : 0;
        return this.raycastPreparedBoxes(origin, dx, dy, dz, maxDistance, false, width, lateralX, lateralZ, out, initialExit, limb);
    }
    raycastPreparedBoxes(origin, dx, dy, dz, maxDistance, occludersOnly, sweepHalfWidth = 0, suppliedLateralX, suppliedLateralZ, out, initialExit, limb) {
        const endX = origin.x + dx * maxDistance;
        const endZ = origin.z + dz * maxDistance;
        let minimumX = Math.min(origin.x, endX) - sweepHalfWidth, maximumX = Math.max(origin.x, endX) + sweepHalfWidth;
        let minimumZ = Math.min(origin.z, endZ) - sweepHalfWidth, maximumZ = Math.max(origin.z, endZ) + sweepHalfWidth;
        if (limb !== undefined) {
            minimumX = Math.min(minimumX, limb.minX);
            maximumX = Math.max(maximumX, limb.maxX);
            minimumZ = Math.min(minimumZ, limb.minZ);
            maximumZ = Math.max(maximumZ, limb.maxZ);
        }
        const fromColumn = this.columnAt(minimumX), toColumn = this.columnAt(maximumX), fromRow = this.rowAt(minimumZ), toRow = this.rowAt(maximumZ);
        const horizontal = Math.hypot(dx, dz);
        const lateralX = suppliedLateralX ?? (horizontal > 0 ? -dz / horizontal : 0);
        const lateralZ = suppliedLateralZ ?? (horizontal > 0 ? dx / horizontal : 0);
        this.stamp += 1;
        const stamp = this.stamp;
        let nearest = null;
        let exitSeen = false;
        if (limb !== undefined) {
            limb.count = 0;
            limb.overflow = false;
            limb.fulfilled = true;
        }
        if (initialExit !== undefined && (!Number.isInteger(initialExit.colliderIndex)
            || initialExit.colliderIndex < 0 || initialExit.colliderIndex >= this.colliders.length
            || !validInitialExit(origin, dx, dy, dz, maxDistance, sweepHalfWidth, this.colliders[initialExit.colliderIndex], initialExit)))
            return 0;
        for (let row = fromRow; row <= toRow; row += 1) {
            const rowBase = row * this.gridColumns;
            for (let column = fromColumn; column <= toColumn; column += 1) {
                const cell = rowBase + column;
                const end = this.gridStarts[cell + 1];
                for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
                    const index = this.gridItems[slot];
                    if (this.stamps[index] === stamp)
                        continue;
                    this.stamps[index] = stamp;
                    const prepared = this.colliders[index];
                    if (occludersOnly && !prepared.occludes)
                        continue;
                    if (limb !== undefined) {
                        const box = prepared.collider;
                        if (prepared.maxX >= limb.minX && prepared.minX <= limb.maxX
                            && box.centre.y + box.halfExtents.y >= limb.minY && box.centre.y - box.halfExtents.y <= limb.maxY
                            && prepared.maxZ >= limb.minZ && prepared.minZ <= limb.maxZ) {
                            if (limb.count >= limb.capacity)
                                limb.overflow = true;
                            else {
                                const at = limb.recordOffset + limb.count++ * 9, records = limb.records;
                                records[at] = index;
                                records[at + 1] = box.centre.x;
                                records[at + 2] = box.centre.y;
                                records[at + 3] = box.centre.z;
                                records[at + 4] = box.halfExtents.x;
                                records[at + 5] = box.halfExtents.y;
                                records[at + 6] = box.halfExtents.z;
                                records[at + 7] = prepared.cos;
                                records[at + 8] = prepared.sin;
                            }
                        }
                    }
                    if (initialExit !== undefined) {
                        if (index === initialExit.colliderIndex) {
                            exitSeen = true;
                            continue;
                        }
                        if (intersectBox(origin, dx, dy, dz, prepared, maxDistance, 0, 0, 0, undefined, undefined, sweepHalfWidth) !== null)
                            return 0;
                        continue;
                    }
                    const effectiveSweep = prepared.collider.halfExtents.x <= sweepHalfWidth
                        && prepared.collider.halfExtents.z <= sweepHalfWidth
                        ? sweepHalfWidth
                        : 0;
                    const hit = intersectBox(origin, dx, dy, dz, prepared, maxDistance, lateralX, lateralZ, effectiveSweep, out?.normal === undefined ? undefined : this.obstacleNormal, out?.inside === undefined ? undefined : this.obstacleFace);
                    if (hit !== null && (nearest === null || hit < nearest)) {
                        nearest = hit;
                        if (out !== undefined) {
                            out.distance = hit;
                            out.halfExtentX = prepared.collider.halfExtents.x;
                            out.halfExtentZ = prepared.collider.halfExtents.z;
                            if (out.normal !== undefined) {
                                out.normal.x = this.obstacleNormal.x;
                                out.normal.y = this.obstacleNormal.y;
                                out.normal.z = this.obstacleNormal.z;
                            }
                            if (out.inside !== undefined) {
                                out.inside = this.obstacleFace.inside;
                                out.colliderIndex = index;
                                out.faceOffset = this.obstacleFace.faceOffset;
                            }
                        }
                    }
                }
            }
        }
        return initialExit === undefined ? nearest : exitSeen ? null : 0;
    }
    sampleField(x, z, out) {
        const field = this.field;
        if (x < field.originX || x > this.maxX || z < field.originZ || z > this.maxZ) {
            out.height = this.surround.height;
            out.surface = this.surround.surface;
            out.traction = undefined;
            out.normal.x = 0;
            out.normal.y = 1;
            out.normal.z = 0;
            out.offCourse = true;
            return;
        }
        const fx = (x - field.originX) / field.spacing;
        const fz = (z - field.originZ) / field.spacing;
        const column = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
        const row = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
        const u = fx - column;
        const v = fz - row;
        const base = row * field.columns + column;
        const h00 = field.heights[base];
        const h10 = field.heights[base + 1];
        const h01 = field.heights[base + field.columns];
        const h11 = field.heights[base + field.columns + 1];
        let dhdu;
        let dhdv;
        let height;
        if (v < u) {
            dhdu = h10 - h00;
            dhdv = h11 - h10;
            height = h00 + dhdu * u + dhdv * v;
        }
        else {
            dhdu = h11 - h01;
            dhdv = h01 - h00;
            height = h00 + dhdu * u + dhdv * v;
        }
        const gx = dhdu === 0 ? 0 : -dhdu / field.spacing;
        const gz = dhdv === 0 ? 0 : -dhdv / field.spacing;
        const inverse = 1 / Math.hypot(gx, 1, gz);
        out.height = height;
        out.normal.x = gx === 0 ? 0 : gx * inverse;
        out.normal.y = inverse;
        out.normal.z = gz === 0 ? 0 : gz * inverse;
        out.surface = field.surfaces[row * (field.columns - 1) + column];
        if (this.groundPatches) {
            const cell = row * (field.columns - 1) + column;
            const sourceSurface = out.surface;
            this.applyGroundPatches(cell, x, z, sourceSurface, out);
            if (u < 1e-9 && column > 0)
                this.applyGroundPatches(cell - 1, x, z, sourceSurface, out);
            if (v < 1e-9 && row > 0)
                this.applyGroundPatches(cell - (field.columns - 1), x, z, sourceSurface, out);
            if (u < 1e-9 && v < 1e-9 && column > 0 && row > 0)
                this.applyGroundPatches(cell - field.columns, x, z, sourceSurface, out);
        }
        const gripCell = row * (field.columns - 1) + column;
        const ridden = field.traction?.[gripCell];
        out.traction = ridden !== undefined && out.surface === field.surfaces[gripCell] ? ridden : undefined;
        out.offCourse = false;
    }
    applyGroundPatches(cell, x, z, sourceSurface, out) {
        const patches = this.groundPatches.get(cell);
        if (patches)
            for (const patch of patches) {
                if (patch.sourceSurface !== undefined && patch.sourceSurface !== sourceSurface)
                    continue;
                if (containsGroundTriangle(patch.vertices, x, z))
                    out.surface = patch.surface;
            }
    }
    heightAt(x, z) {
        const field = this.field;
        if (x < field.originX || x > this.maxX || z < field.originZ || z > this.maxZ) {
            return this.surround.height;
        }
        const fx = (x - field.originX) / field.spacing;
        const fz = (z - field.originZ) / field.spacing;
        const column = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
        const row = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
        const u = fx - column;
        const v = fz - row;
        const base = row * field.columns + column;
        const h00 = field.heights[base];
        if (v < u) {
            const h10 = field.heights[base + 1];
            const h11 = field.heights[base + field.columns + 1];
            return h00 + (h10 - h00) * u + (h11 - h10) * v;
        }
        const h01 = field.heights[base + field.columns];
        const h11 = field.heights[base + field.columns + 1];
        return h00 + (h11 - h01) * u + (h01 - h00) * v;
    }
    raycastTerrain(origin, dx, dy, dz, maxDistance) {
        if (origin.y <= this.heightAt(origin.x, origin.z))
            return 0;
        const step = Math.max(this.field.spacing * MARCH_FRACTION, maxDistance / MARCH_MAX_STEPS);
        let previous = 0;
        for (let t = step;; t += step) {
            const capped = Math.min(t, maxDistance);
            const height = this.heightAt(origin.x + dx * capped, origin.z + dz * capped);
            if (origin.y + dy * capped <= height) {
                let low = previous;
                let high = capped;
                for (let i = 0; i < MARCH_REFINEMENTS; i += 1) {
                    const mid = (low + high) / 2;
                    const midHeight = this.heightAt(origin.x + dx * mid, origin.z + dz * mid);
                    if (origin.y + dy * mid <= midHeight)
                        high = mid;
                    else
                        low = mid;
                }
                return high;
            }
            if (capped >= maxDistance)
                return null;
            previous = capped;
        }
    }
}
function containsGroundTriangle(vertices, x, z) {
    let positive = false, negative = false;
    for (let index = 0; index < 3; index++) {
        const a = vertices[index], b = vertices[(index + 1) % 3];
        const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
        if (cross > 1e-9)
            positive = true;
        if (cross < -1e-9)
            negative = true;
    }
    return !(positive && negative);
}
function validInitialExit(origin, dx, dy, dz, distance, radius, prepared, certificate) {
    const { collider, cos, sin } = prepared, { centre: c, halfExtents: h } = collider, n = certificate.normal;
    if (!(radius >= 0) || !(certificate.slack >= 0) || !Number.isFinite(certificate.faceOffset))
        return false;
    const sx = cos * (origin.x - c.x) - sin * (origin.z - c.z), sy = origin.y - c.y, sz = sin * (origin.x - c.x) + cos * (origin.z - c.z);
    if (!(Math.abs(sx) < h.x && Math.abs(sy) < h.y && Math.abs(sz) < h.z))
        return false;
    const nx = cos * n.x - sin * n.z, ny = n.y, nz = sin * n.x + cos * n.z;
    const axis = Math.abs(nx) > .999999 ? 0 : Math.abs(ny) > .999999 ? 1 : Math.abs(nz) > .999999 ? 2 : -1;
    if (axis < 0 || Math.abs(Math.abs(axis === 0 ? nx : axis === 1 ? ny : nz) - 1) > 1e-7
        || (axis !== 0 && Math.abs(nx) > 1e-7) || (axis !== 1 && Math.abs(ny) > 1e-7) || (axis !== 2 && Math.abs(nz) > 1e-7))
        return false;
    const offset = n.x * c.x + n.y * c.y + n.z * c.z + (axis === 0 ? h.x : axis === 1 ? h.y : h.z);
    if (Math.abs(offset - certificate.faceOffset) > 1e-7)
        return false;
    const progress = n.x * dx + n.y * dy + n.z * dz, start = n.x * origin.x + n.y * origin.y + n.z * origin.z;
    if (!(progress > 0) || start + progress * distance < offset + radius + certificate.slack - 1e-7)
        return false;
    const exit = (offset + radius - start) / progress;
    const ex = sx + (cos * dx - sin * dz) * exit, ey = sy + dy * exit, ez = sz + (sin * dx + cos * dz) * exit;
    return exit >= 0 && exit <= distance && Math.abs(ex) <= h.x + radius + 1e-7
        && Math.abs(ey) <= h.y + radius + 1e-7 && Math.abs(ez) <= h.z + radius + 1e-7;
}
function intersectBox(origin, dx, dy, dz, prepared, maxDistance, lateralX = 0, lateralZ = 0, sweepHalfWidth = 0, normal, face, sphereRadius = 0) {
    const { collider, cos, sin } = prepared;
    const { centre, halfExtents } = collider;
    const rx = origin.x - centre.x;
    const rz = origin.z - centre.z;
    const startX = cos * rx - sin * rz;
    const startZ = sin * rx + cos * rz;
    const startY = origin.y - centre.y;
    const deltaX = cos * dx - sin * dz;
    const deltaZ = sin * dx + cos * dz;
    if (normal === undefined && face === undefined && sphereRadius === 0) {
        const expandedHalfX = halfExtents.x
            + sweepHalfWidth * Math.abs(cos * lateralX - sin * lateralZ);
        const expandedHalfZ = halfExtents.z
            + sweepHalfWidth * Math.abs(sin * lateralX + cos * lateralZ);
        let enter = 0;
        let exit = maxDistance;
        const axes = [
            [startX, deltaX, expandedHalfX],
            [startY, dy, halfExtents.y],
            [startZ, deltaZ, expandedHalfZ],
        ];
        for (const [start, delta, halfExtent] of axes) {
            if (delta === 0) {
                if (start < -halfExtent || start > halfExtent)
                    return null;
                continue;
            }
            const inverse = 1 / delta;
            let near = (-halfExtent - start) * inverse;
            let far = (halfExtent - start) * inverse;
            if (near > far)
                [near, far] = [far, near];
            if (near > enter)
                enter = near;
            if (far < exit)
                exit = far;
            if (enter > exit)
                return null;
        }
        return enter;
    }
    const expandedHalfX = halfExtents.x
        + sweepHalfWidth * Math.abs(cos * lateralX - sin * lateralZ) + sphereRadius;
    const expandedHalfZ = halfExtents.z
        + sweepHalfWidth * Math.abs(sin * lateralX + cos * lateralZ) + sphereRadius;
    let enter = 0;
    let exit = maxDistance;
    let enterAxis = -1, enterSign = 0, axis = -1;
    const axes = [
        [startX, deltaX, expandedHalfX],
        [startY, dy, halfExtents.y + sphereRadius],
        [startZ, deltaZ, expandedHalfZ],
    ];
    for (const [start, delta, halfExtent] of axes) {
        axis += 1;
        if (delta === 0) {
            if (start < -halfExtent || start > halfExtent)
                return null;
            continue;
        }
        const inverse = 1 / delta;
        let near = (-halfExtent - start) * inverse;
        let far = (halfExtent - start) * inverse;
        if (near > far)
            [near, far] = [far, near];
        if (near > enter) {
            enter = near;
            enterAxis = axis;
            enterSign = delta > 0 ? -1 : 1;
        }
        if (far < exit)
            exit = far;
        if (enter > exit)
            return null;
    }
    if (normal !== undefined || face !== undefined) {
        if (enterAxis < 0) {
            let nearest = Infinity;
            for (let index = 0; index < axes.length; index += 1) {
                const [start, , half] = axes[index], depth = half - Math.abs(start);
                if (depth < nearest) {
                    nearest = depth;
                    enterAxis = index;
                    enterSign = start < 0 ? -1 : 1;
                }
            }
        }
        const nx = enterAxis === 0 ? cos * enterSign : enterAxis === 2 ? sin * enterSign : 0;
        const ny = enterAxis === 1 ? enterSign : 0;
        const nz = enterAxis === 0 ? -sin * enterSign : enterAxis === 2 ? cos * enterSign : 0;
        if (normal !== undefined) {
            normal.x = nx;
            normal.y = ny;
            normal.z = nz;
        }
        if (face !== undefined) {
            face.inside = Math.abs(startX) < halfExtents.x && Math.abs(startY) < halfExtents.y && Math.abs(startZ) < halfExtents.z;
            face.faceOffset = nx * centre.x + ny * centre.y + nz * centre.z
                + (enterAxis === 0 ? halfExtents.x : enterAxis === 1 ? halfExtents.y : halfExtents.z);
        }
    }
    return enter;
}
export function paintedSurfaces(plan) {
    const surfaces = new Set(plan.heightfield.surfaces);
    for (const patch of plan.groundSurfacePatches ?? [])
        surfaces.add(patch.surface);
    return surfaces;
}
