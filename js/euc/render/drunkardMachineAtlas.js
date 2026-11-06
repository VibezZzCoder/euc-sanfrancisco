// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/drunkardMachineAtlas.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { registerAppearanceCache } from './appearanceRegistry.js';
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { paintHop } from './drunkardAtlas.js';
import { inkField, inkOver, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes, } from './inkKit.js';
export const MACHINE_SHEET_WIDTH = 512;
export const MACHINE_SHEET_HEIGHT = 256;
const PIXEL_REGIONS = {
    pads: { x0: 0, y0: 0, x1: 448, y1: 208 },
    plate: { x0: 0, y0: 224, x1: 128, y1: 256 },
    blank: { x0: 480, y0: 0, x1: 512, y1: 256 },
};
export const DRUNKARD_MACHINE_REGIONS = Object.freeze(Object.fromEntries(Object.entries(PIXEL_REGIONS).map(([name, box]) => [name, Object.freeze({
        u0: (box.x0 + 0.5) / MACHINE_SHEET_WIDTH,
        v0: (box.y0 + 0.5) / MACHINE_SHEET_HEIGHT,
        u1: (box.x1 - 0.5) / MACHINE_SHEET_WIDTH,
        v1: (box.y1 - 0.5) / MACHINE_SHEET_HEIGHT,
    })])));
export function drunkardMachineRegion(art) {
    return art !== undefined && art in DRUNKARD_MACHINE_REGIONS
        ? DRUNKARD_MACHINE_REGIONS[art]
        : DRUNKARD_MACHINE_REGIONS.blank;
}
const TRIM = linearFromHex(BLOCKOUT_COLOURS.machineDrunkardTrim);
const CLEAR = [1, 1, 1];
const AMBER = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.machineDrunkardAmber));
const BROWN = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.drunkardBrown));
const RIM = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.drunkardGear));
export const PAD_ROUNDEL_RADIUS = 0.052;
export const PAD_HOP_WIDTH = 0.056;
const PAD_RIM = 0.005;
function ringAtT(layout, t) {
    const rings = layout.pad;
    const last = rings.length - 1;
    const v = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(v));
    const f = v - i;
    const lower = rings[i];
    const upper = rings[i + 1];
    return {
        v,
        y: lower.y + (upper.y - lower.y) * f,
        halfWidth: lower.halfWidth + (upper.halfWidth - lower.halfWidth) * f,
        halfDepth: lower.halfDepth + (upper.halfDepth - lower.halfDepth) * f,
        square: lower.square + (upper.square - lower.square) * f,
    };
}
function sectionPoint(section, u) {
    const e = 2 / section.square;
    const c = Math.cos(u);
    const s = Math.sin(u);
    return {
        x: section.halfWidth * Math.sign(c) * Math.abs(c) ** e,
        z: section.halfDepth * Math.sign(s) * Math.abs(s) ** e,
    };
}
function padFace(layout, s, t) {
    const section = ringAtT(layout, t);
    const columns = layout.segments;
    const column = ((s - 0.5) * columns + columns) % columns;
    const k = Math.floor(column);
    const f = column - k;
    const a = sectionPoint(section, (k / columns) * Math.PI * 2);
    const b = sectionPoint(section, ((k + 1) / columns) * Math.PI * 2);
    const x = a.x + (b.x - a.x) * f;
    const z = a.z + (b.z - a.z) * f;
    return { z, y: section.y, outboard: x > 0 };
}
export function drunkardPadPagePixel(layout, z, y) {
    const box = PIXEL_REGIONS.pads;
    const rings = layout.pad;
    const last = rings.length - 1;
    let v = last;
    for (let i = 1; i <= last; i += 1) {
        if (y <= rings[i].y) {
            v = i - 1 + (y - rings[i - 1].y) / (rings[i].y - rings[i - 1].y);
            break;
        }
    }
    const section = ringAtT(layout, v / last);
    const columns = layout.segments;
    const quarter = Math.floor(columns / 4);
    let s = 0.5;
    for (let k = -quarter; k < quarter; k += 1) {
        const a = sectionPoint(section, (k / columns) * Math.PI * 2).z;
        const b = sectionPoint(section, ((k + 1) / columns) * Math.PI * 2).z;
        if (z >= a && z <= b) {
            s = 0.5 + (k + (z - a) / (b - a)) / columns;
            break;
        }
    }
    return [box.x0 + (box.x1 - box.x0) * s, box.y0 + (box.y1 - box.y0) * (v / last)];
}
const STAMP_DENSITY = 2000;
const STAMP_SIZE = Math.ceil(PAD_ROUNDEL_RADIUS * 2 * STAMP_DENSITY) + 8;
function paintStamp() {
    const stamp = inkSheet(STAMP_SIZE, STAMP_SIZE, BROWN);
    paintHop(stamp, STAMP_SIZE / 2, STAMP_SIZE / 2, PAD_HOP_WIDTH * STAMP_DENSITY, 1);
    return stamp;
}
function stampAt(stamp, dz, dy) {
    const x = STAMP_SIZE / 2 + dz * STAMP_DENSITY - 0.5;
    const y = STAMP_SIZE / 2 + dy * STAMP_DENSITY - 0.5;
    const x0 = Math.min(STAMP_SIZE - 2, Math.max(0, Math.floor(x)));
    const y0 = Math.min(STAMP_SIZE - 2, Math.max(0, Math.floor(y)));
    const fx = Math.min(1, Math.max(0, x - x0));
    const fy = Math.min(1, Math.max(0, y - y0));
    const at = (px, py) => {
        const i = (py * STAMP_SIZE + px) * 3;
        return [stamp.data[i], stamp.data[i + 1], stamp.data[i + 2]];
    };
    return mixRgb(mixRgb(at(x0, y0), at(x0 + 1, y0), fx), mixRgb(at(x0, y0 + 1), at(x0 + 1, y0 + 1), fx), fy);
}
function paintPads(sheet, layout) {
    const box = PIXEL_REGIONS.pads;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const stamp = paintStamp();
    const EDGE = 0.003;
    const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / EDGE));
    inkField(sheet, box, (px, py) => {
        const s = (px - box.x0) / width;
        const t = (py - box.y0) / height;
        const { z, y, outboard } = padFace(layout, s, t);
        if (!outboard)
            return [AMBER, 1];
        const r = Math.hypot(z, y);
        let colour = AMBER;
        colour = mixRgb(colour, RIM, cover(r - (PAD_ROUNDEL_RADIUS + PAD_RIM)));
        colour = mixRgb(colour, stampAt(stamp, z, y), cover(r - PAD_ROUNDEL_RADIUS));
        return [colour, 1];
    });
}
let cachedPixels = null;
let cachedFor = null;
export function drunkardMachineAtlasPixels(layout) {
    if (cachedPixels !== null && (cachedFor === layout || cachedFor === null)) {
        cachedFor = layout;
        return cachedPixels;
    }
    const sheet = inkSheet(MACHINE_SHEET_WIDTH, MACHINE_SHEET_HEIGHT, CLEAR);
    inkRect(sheet, PIXEL_REGIONS.plate, CLEAR, 1, 1);
    paintPads(sheet, layout);
    cachedPixels = toSrgbBytes(sheet);
    cachedFor = layout;
    return cachedPixels;
}
export function createDrunkardMachineAtlas(layout) {
    const texture = new THREE.DataTexture(drunkardMachineAtlasPixels(layout), MACHINE_SHEET_WIDTH, MACHINE_SHEET_HEIGHT, THREE.RGBAFormat);
    texture.name = 'drunkard-machine-atlas';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}
registerAppearanceCache('drunkardMachineAtlas.ts', () => { cachedPixels = null; cachedFor = null; }, () => [cachedPixels], () => ({ pixels: cachedPixels }), bank => { cachedPixels = bank.pixels; cachedFor = null; });
