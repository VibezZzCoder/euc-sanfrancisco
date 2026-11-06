// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/wimMachineAtlas.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { registerAppearanceCache } from './appearanceRegistry.js';
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { inkField, inkOver, inkRaster, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes, } from './inkKit.js';
import { MARK_ASPECT, wimMarkRaster, wimPatchStretch } from './wimAtlas.js';
export const MACHINE_SHEET_WIDTH = 512;
export const MACHINE_SHEET_HEIGHT = 512;
const PIXEL_REGIONS = {
    plate: { x0: 0, y0: 0, x1: 448, y1: 256 },
    pads: { x0: 0, y0: 288, x1: 448, y1: 512 },
    blank: { x0: 480, y0: 0, x1: 512, y1: 512 },
};
export const WIM_MACHINE_REGIONS = Object.freeze(Object.fromEntries(Object.entries(PIXEL_REGIONS).map(([name, box]) => [name, Object.freeze({
        u0: (box.x0 + 0.5) / MACHINE_SHEET_WIDTH,
        v0: (box.y0 + 0.5) / MACHINE_SHEET_HEIGHT,
        u1: (box.x1 - 0.5) / MACHINE_SHEET_WIDTH,
        v1: (box.y1 - 0.5) / MACHINE_SHEET_HEIGHT,
    })])));
export function wimMachineRegion(art) {
    return art !== undefined && art in WIM_MACHINE_REGIONS
        ? WIM_MACHINE_REGIONS[art]
        : WIM_MACHINE_REGIONS.blank;
}
const TRIM = linearFromHex(BLOCKOUT_COLOURS.machineWheelInMotionTrim);
const CLEAR = [1, 1, 1];
const CYAN = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.machineWheelInMotionBlue));
const ORANGE = inkOver(TRIM, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionOrange));
const GRIP = inkOver(TRIM, linearFromHex(0x2a2c31));
const HUB = inkOver(TRIM, linearFromHex(0x1c1d21));
const HUB_RING = inkOver(TRIM, linearFromHex(0x8a8d94));
const MARK_ACROSS = 0.86;
const MARK_UP = 0.92;
export function wimMachinePlateBox(layout) {
    const box = PIXEL_REGIONS.plate;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const stretch = wimPatchStretch(layout.shell, layout.plate, box, 0);
    let markWidth = width * MARK_ACROSS;
    let markHeight = markWidth * MARK_ASPECT * stretch;
    if (markHeight > height * MARK_UP) {
        markWidth *= (height * MARK_UP) / markHeight;
        markHeight = height * MARK_UP;
    }
    const x0 = box.x0 + (width - markWidth) / 2;
    const y0 = box.y0 + (height - markHeight) / 2;
    return { x0, y0, x1: x0 + markWidth, y1: y0 + markHeight, stretch };
}
function paintPlate(sheet, layout) {
    inkRect(sheet, PIXEL_REGIONS.plate, CLEAR, 1, 1);
    inkRaster(sheet, wimMachinePlateBox(layout), wimMarkRaster(), TRIM);
}
function padFace(layout, s, t) {
    const rings = layout.pad;
    const last = rings.length - 1;
    const v = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(v));
    const f = v - i;
    const lower = rings[i];
    const upper = rings[i + 1];
    const y = lower.y + (upper.y - lower.y) * f;
    const halfDepth = lower.halfDepth + (upper.halfDepth - lower.halfDepth) * f;
    const square = lower.square + (upper.square - lower.square) * f;
    const u = (s - 0.5) * Math.PI * 2;
    const sine = Math.sin(u);
    const z = halfDepth * Math.sign(sine) * Math.abs(sine) ** (2 / square);
    return { z, y, outboard: Math.cos(u) > 0 };
}
export function wimPadPagePixel(layout, z, y) {
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
    const i = Math.min(last - 1, Math.floor(v));
    const f = v - i;
    const halfDepth = rings[i].halfDepth + (rings[i + 1].halfDepth - rings[i].halfDepth) * f;
    const square = rings[i].square + (rings[i + 1].square - rings[i].square) * f;
    const sine = Math.sign(z) * Math.min(1, Math.abs(z) / halfDepth) ** (square / 2);
    const u = Math.asin(sine);
    const s = 0.5 + u / (Math.PI * 2);
    return [box.x0 + (box.x1 - box.x0) * s, box.y0 + (box.y1 - box.y0) * (v / last)];
}
function paintPads(sheet, layout) {
    const box = PIXEL_REGIONS.pads;
    const EDGE = 0.003;
    const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / EDGE));
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const sector = (z, y, cz, cy, r0, r1, a0, a1) => {
        const dz = z - cz;
        const dy = y - cy;
        const r = Math.hypot(dz, dy);
        let angle = (Math.atan2(dy, dz) * 180) / Math.PI;
        while (angle < a0 - 180)
            angle += 360;
        while (angle > a1 + 180)
            angle -= 360;
        const outside = Math.max(a0 - angle, angle - a1);
        return Math.max(r0 - r, r - r1, (outside * Math.PI / 180) * r);
    };
    const disc = (z, y, cz, cy, radius) => Math.hypot(z - cz, y - cy) - radius;
    const slab = (z, y, z0, z1, y0, y1) => (Math.max(z0 - z, z - z1, y0 - y, y - y1));
    inkField(sheet, box, (px, py) => {
        const s = (px - box.x0) / width;
        const t = (py - box.y0) / height;
        const { z, y, outboard } = padFace(layout, s, t);
        if (!outboard)
            return [GRIP, 1];
        let colour = GRIP;
        const lay = (ink, d) => { colour = mixRgb(colour, ink, cover(d)); };
        lay(HUB_RING, disc(z, y, 0, -0.012, 0.030));
        lay(HUB, disc(z, y, 0, -0.012, 0.021));
        lay(CYAN, sector(z, y, 0.070, -0.010, 0.052, 0.094, -128, 128));
        lay(ORANGE, sector(z, y, 0.070, -0.010, 0.028, 0.047, -100, 104));
        lay(CYAN, sector(z, y, -0.080, -0.012, 0.040, 0.076, 62, 298));
        lay(ORANGE, sector(z, y, -0.080, -0.012, 0.018, 0.034, 85, 275));
        lay(CYAN, slab(z, y, 0.096, 0.164, 0.026, 0.070));
        lay(CYAN, slab(z, y, -0.164, -0.100, 0.026, 0.070));
        return [colour, 1];
    });
}
let cachedPixels = null;
let cachedFor = null;
export function wimMachineAtlasPixels(layout) {
    if (cachedPixels !== null && (cachedFor === layout || cachedFor === null)) {
        cachedFor = layout;
        return cachedPixels;
    }
    const sheet = inkSheet(MACHINE_SHEET_WIDTH, MACHINE_SHEET_HEIGHT, CLEAR);
    paintPlate(sheet, layout);
    paintPads(sheet, layout);
    cachedPixels = toSrgbBytes(sheet);
    cachedFor = layout;
    return cachedPixels;
}
export function createWimMachineAtlas(layout) {
    const texture = new THREE.DataTexture(wimMachineAtlasPixels(layout), MACHINE_SHEET_WIDTH, MACHINE_SHEET_HEIGHT, THREE.RGBAFormat);
    texture.name = 'wheel-in-motion-machine-atlas';
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
registerAppearanceCache('wimMachineAtlas.ts', () => { cachedPixels = null; cachedFor = null; }, () => [cachedPixels], () => ({ pixels: cachedPixels }), bank => { cachedPixels = bank.pixels; cachedFor = null; });
