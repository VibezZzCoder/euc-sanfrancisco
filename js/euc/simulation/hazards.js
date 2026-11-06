// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/simulation/hazards.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
const GRID_TARGET_CELL = 8;
const GRID_MAX_SPAN = 256;
export function isContactHazard(hazard) {
    return hazard.kind === 'potholeShallow' || hazard.kind === 'potholeDeep';
}
export class HazardField {
    hazards;
    gridOriginX;
    gridOriginZ;
    gridCell;
    gridColumns;
    gridRows;
    gridStarts;
    gridItems;
    constructor(hazards = []) {
        this.hazards = hazards.filter(isContactHazard).map((hazard) => ({
            hazard,
            x: hazard.centre.x,
            z: hazard.centre.z,
            radiusSquared: hazard.radius * hazard.radius,
            severity: hazard.kind === 'potholeDeep' ? 2 : 1,
            minX: hazard.centre.x - hazard.radius,
            maxX: hazard.centre.x + hazard.radius,
            minZ: hazard.centre.z - hazard.radius,
            maxZ: hazard.centre.z + hazard.radius,
        }));
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const prepared of this.hazards) {
            if (prepared.minX < minX)
                minX = prepared.minX;
            if (prepared.maxX > maxX)
                maxX = prepared.maxX;
            if (prepared.minZ < minZ)
                minZ = prepared.minZ;
            if (prepared.maxZ > maxZ)
                maxZ = prepared.maxZ;
        }
        if (this.hazards.length === 0) {
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
        for (const prepared of this.hazards) {
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
        for (let index = 0; index < this.hazards.length; index += 1) {
            this.eachCell(this.hazards[index], (cell) => {
                this.gridItems[cursor[cell]] = index;
                cursor[cell] += 1;
            });
        }
    }
    get count() {
        return this.hazards.length;
    }
    at(x, z) {
        const cell = this.cellAt(x, z);
        const end = this.gridStarts[cell + 1];
        let best = null;
        for (let slot = this.gridStarts[cell]; slot < end; slot += 1) {
            const prepared = this.hazards[this.gridItems[slot]];
            if (best !== null && prepared.severity <= best.severity)
                continue;
            const dx = x - prepared.x;
            const dz = z - prepared.z;
            if (dx * dx + dz * dz > prepared.radiusSquared)
                continue;
            best = prepared;
        }
        return best === null ? null : best.hazard;
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
}
export const NO_HAZARDS = new HazardField([]);
