// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/maribelAtlas.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { registerAppearanceCache } from './appearanceRegistry.js';
import * as THREE from '../../../vendor/three/build/three.core.js';
import { MV_LOGO_HEIGHT, MV_LOGO_PNG_BASE64, MV_LOGO_WIDTH } from '../data/mvLogoAsset.js';
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { inkDisc, inkField, inkOver, inkRaster, inkRect, inkSheet, inkWord, inkWordLength, linearFromHex, mixRgb, toSrgbBytes, } from './inkKit.js';
import { bytesFromBase64, decodePng } from './pngDecode.js';
export const ATLAS_SIZE = 1024;
const PIXEL_REGIONS = {
    chest: { x0: 0, y0: 0, x1: 512, y1: 512 },
    legScript: { x0: 512, y0: 0, x1: 768, y1: 512 },
    hair: { x0: 768, y0: 0, x1: 1024, y1: 512 },
    visor: { x0: 0, y0: 512, x1: 512, y1: 768 },
    kneeDevice: { x0: 512, y0: 512, x1: 768, y1: 768 },
    backMark: { x0: 0, y0: 768, x1: 512, y1: 1024 },
    machineMark: { x0: 768, y0: 512, x1: 1024, y1: 768 },
    legPlain: { x0: 512, y0: 768, x1: 768, y1: 1024 },
    blank: { x0: 768, y0: 768, x1: 1024, y1: 1024 },
};
export const ATLAS_REGIONS = Object.freeze(Object.fromEntries(Object.entries(PIXEL_REGIONS).map(([name, box]) => [name, Object.freeze({
        u0: (box.x0 + 0.5) / ATLAS_SIZE,
        v0: (box.y0 + 0.5) / ATLAS_SIZE,
        u1: (box.x1 - 0.5) / ATLAS_SIZE,
        v1: (box.y1 - 0.5) / ATLAS_SIZE,
    })])));
const MARK_BASE = linearFromHex(BLOCKOUT_COLOURS.maribelMark);
const VISOR_BASE = linearFromHex(BLOCKOUT_COLOURS.maribelVisor);
const CLEAR = [1, 1, 1];
const LEATHER = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelSuit));
const PANEL = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelPanel));
const PRINT_GROUND = inkOver(MARK_BASE, linearFromHex(0xe6e7ea));
const AQUA = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelAqua));
const CORAL = inkOver(MARK_BASE, linearFromHex(BLOCKOUT_COLOURS.maribelCoral));
const WHITE = inkOver(MARK_BASE, linearFromHex(0xf2f3f5));
const HARDWARE = inkOver(MARK_BASE, linearFromHex(0x8d919c));
export const MARK_ASPECT = MV_LOGO_HEIGHT / MV_LOGO_WIDTH;
const CHEST_STRETCH = 0.8492;
const BACK_STRETCH = 0.4136;
const BADGE_STRETCH = 1.3508;
const KNEE_STRETCH = 1.6155;
let cachedMark = null;
function markRaster() {
    if (cachedMark === null)
        cachedMark = decodePng(bytesFromBase64(MV_LOGO_PNG_BASE64));
    return cachedMark;
}
function paintMark(sheet, x, y, width, pageStretch = 1) {
    inkRaster(sheet, { x0: x, y0: y, x1: x + width, y1: y + width * MARK_ASPECT * pageStretch }, markRaster(), MARK_BASE);
}
function paintChest(sheet) {
    const box = PIXEL_REGIONS.chest;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const markW = width * 0.300;
    const markBottom = 0.750;
    const markTop = markBottom + markW * MARK_ASPECT * CHEST_STRETCH / height;
    const insideMarkSeat = (s, t) => {
        const radius = 0.022;
        const halfWidth = markW / width * 0.5 + 0.018;
        const halfHeight = (markTop - markBottom) * 0.5 + 0.014;
        const centreT = (markBottom + markTop) * 0.5;
        const qx = Math.max(Math.abs(s - 0.5) - (halfWidth - radius), 0);
        const qy = Math.max(Math.abs(t - centreT) - (halfHeight - radius), 0);
        return Math.hypot(qx, qy) <= radius;
    };
    inkRect(sheet, box, LEATHER, 1, 1);
    const coverage = (s, t) => {
        const clamp = (value) => Math.min(1, Math.max(0, value));
        const across = Math.abs(s - 0.5) * 2;
        const span = 0.44 + 0.64 * clamp((t - 0.17) / 0.53);
        const lateral = 1 - clamp((across - span * 0.62) / 0.30);
        const lower = clamp((t - 0.058) / 0.150);
        const upper = 1 - clamp((t - 0.72) / 0.14);
        void insideMarkSeat;
        return Math.max(0, Math.min(lateral, lower, upper));
    };
    const pitch = 13.5;
    const rows = Math.ceil(height / pitch);
    const columns = Math.ceil(width / pitch);
    for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
            const px = box.x0 + (column + (row % 2 === 0 ? 0 : 0.5)) * pitch;
            const py = box.y0 + row * pitch;
            const s = (px - box.x0) / width;
            const t = (py - box.y0) / height;
            const cover = coverage(s, t);
            if (cover <= 0.02)
                continue;
            const lean = Math.min(1, Math.abs(s - 0.5) / 0.44) ** 0.85;
            const rise = 0.32 + 0.68 * Math.min(1, Math.max(0, (t - 0.22) / 0.42));
            const accent = s < 0.5 ? CORAL : AQUA;
            const colour = mixRgb(PRINT_GROUND, accent, lean * rise * 0.96);
            const half = 0.5 * pitch * 0.62 * cover ** 0.55;
            inkRect(sheet, { x0: px - half, y0: py - half, x1: px + half, y1: py + half }, colour, Math.min(1, 0.55 + cover), 1.35);
        }
    }
    const centre = box.x0 + width * 0.5;
    inkRect(sheet, { x0: centre - 6.0, y0: box.y0 + height * 0.020, x1: centre + 6.0, y1: box.y0 + height * 0.965 }, PANEL, 0.30, 1.4);
    inkRect(sheet, { x0: centre - 1.6, y0: box.y0 + height * 0.020, x1: centre + 1.6, y1: box.y0 + height * 0.965 }, HARDWARE, 0.95, 0.8);
    inkRect(sheet, { x0: centre - 4.5, y0: box.y0 + height * 0.600, x1: centre + 4.5, y1: box.y0 + height * 0.632 }, HARDWARE, 1, 0.8);
    paintMark(sheet, centre - markW / 2, box.y0 + height * markBottom, markW, CHEST_STRETCH);
}
function paintBackMark(sheet) {
    const box = PIXEL_REGIONS.backMark;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    inkRect(sheet, box, LEATHER, 1, 1);
    const markWidth = width * 0.86;
    const markHeight = markWidth * MARK_ASPECT * BACK_STRETCH;
    paintMark(sheet, box.x0 + (width - markWidth) / 2, box.y0 + height * 0.50 - markHeight / 2, markWidth, BACK_STRETCH);
}
function paintLegScript(sheet) {
    const box = PIXEL_REGIONS.legScript;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    inkRect(sheet, box, LEATHER, 1, 1);
    inkRect(sheet, { x0: box.x0 + width * 0.32, y0: box.y0 + height * 0.14, x1: box.x0 + width * 0.68, y1: box.y0 + height * 0.86 }, PANEL, 0.55, 9);
    const cap = width * 0.34;
    const length = inkWordLength('VARGAS', cap);
    inkWord(sheet, 'VARGAS', [box.x0 + width * 0.33, box.y0 + height * 0.5 + length / 2], cap, Math.max(3, cap * 0.15), WHITE, { angle: -Math.PI / 2, alpha: 0.94, flip: true });
}
function paintMachineMark(sheet) {
    const box = PIXEL_REGIONS.machineMark;
    const size = box.x1 - box.x0;
    const plate = inkOver(MARK_BASE, linearFromHex(0x2e3036));
    inkRect(sheet, box, inkOver(MARK_BASE, linearFromHex(0x24252a)), 1, 1);
    inkRect(sheet, {
        x0: box.x0 + size * 0.045,
        y0: box.y0 + size * 0.085,
        x1: box.x1 - size * 0.045,
        y1: box.y1 - size * 0.085,
    }, plate, 1, 5);
    paintMark(sheet, box.x0 + size * 0.18, box.y0 + size * (1 - 0.64 * MARK_ASPECT * BADGE_STRETCH) / 2, size * 0.64, BADGE_STRETCH);
}
function paintLegPlain(sheet) {
    const box = PIXEL_REGIONS.legPlain;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    inkRect(sheet, box, LEATHER, 1, 1);
    inkRect(sheet, { x0: box.x0 + width * 0.32, y0: box.y0 + height * 0.14, x1: box.x0 + width * 0.68, y1: box.y0 + height * 0.86 }, PANEL, 0.55, 9);
}
function paintKneeDevice(sheet) {
    const box = PIXEL_REGIONS.kneeDevice;
    const size = box.x1 - box.x0;
    const centre = [box.x0 + size * 0.5, box.y0 + size * 0.52];
    const plate = inkOver(MARK_BASE, linearFromHex(0x2b2c32));
    inkRect(sheet, box, LEATHER, 1, 1);
    inkDisc(sheet, centre, size * 0.46, PANEL, 0.5, 8);
    inkDisc(sheet, centre, size * 0.405, WHITE, 0.92, 2.5);
    inkDisc(sheet, centre, size * 0.345, plate, 1, 2.5);
    const markSize = size * 0.40;
    paintMark(sheet, centre[0] - markSize / 2, centre[1] - markSize * MARK_ASPECT * KNEE_STRETCH * 0.5, markSize, KNEE_STRETCH);
}
function paintVisor(sheet) {
    const box = PIXEL_REGIONS.visor;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const deep = inkOver(VISOR_BASE, linearFromHex(0x1d3f86));
    const cyan = inkOver(VISOR_BASE, linearFromHex(0x64e2ee));
    inkField(sheet, box, (x, y) => {
        const s = (x - box.x0) / width;
        const t = (y - box.y0) / height;
        const toward = Math.min(1, Math.max(0, (0.72 - t) / 0.72)) * (0.55 + 0.45 * (1 - s));
        const base = mixRgb(deep, cyan, toward);
        const band = Math.exp(-(((s * 0.8 + t) - 0.92) ** 2) / 0.020);
        return [mixRgb(base, CLEAR, band * 0.42), 1];
    });
}
function paintHair(sheet) {
    const box = PIXEL_REGIONS.hair;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const shadow = inkOver(MARK_BASE, linearFromHex(0xa2a2a2));
    inkField(sheet, box, (x, y) => {
        const s = (x - box.x0) / width;
        const t = (y - box.y0) / height;
        if (y >= box.y1) {
            const wander = Math.sin(t * 7.0) * .10 + Math.sin(t * 2.3 + 1.7) * .06;
            const lane = Math.sin((s + wander) * Math.PI * 2 * 7);
            const depth = Math.min(1, Math.max(0, (.86 - t) / .5));
            const dark = Math.max(0, lane) ** 2.6 * (.10 + .20 * depth);
            const brk = .5 + .5 * Math.sin(t * 23 + s * 6);
            const root = Math.min(1, Math.max(0, (t - .72) / .28)) * .16;
            return [shadow, dark + brk ** 3 * .07 + root];
        }
        const wander = Math.sin(t * 6.1) * .024 + Math.sin(t * 13.3 + 1.7) * .007;
        const lane = .5 + .5 * Math.sin((s + wander) * Math.PI * 2 * 31);
        const fibre = .5 + .5 * Math.sin((s + wander * .7) * Math.PI * 2 * 89 + t * 2);
        const broken = .5 + .5 * Math.sin(t * 31 + s * 9);
        const root = Math.min(1, Math.max(0, (t - .79) / .21)) * .10;
        const dark = lane ** 4 * (.30 + .06 * broken) + fibre ** 7 * .18 + root;
        return [shadow, dark];
    });
}
let cachedPixels = null;
export function maribelAtlasPixels() {
    if (cachedPixels !== null)
        return cachedPixels;
    const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
    paintChest(sheet);
    paintBackMark(sheet);
    paintLegScript(sheet);
    paintKneeDevice(sheet);
    paintLegPlain(sheet);
    paintMachineMark(sheet);
    paintVisor(sheet);
    paintHair(sheet);
    cachedPixels = toSrgbBytes(sheet);
    return cachedPixels;
}
export function createMaribelAtlas() {
    const texture = new THREE.DataTexture(maribelAtlasPixels(), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
    texture.name = 'maribel-atlas';
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
registerAppearanceCache('maribelAtlas.ts', () => { cachedPixels = null; cachedMark = null; }, () => [cachedPixels, cachedMark?.rgba], () => ({ pixels: cachedPixels, mark: cachedMark }), bank => { cachedPixels = bank.pixels; cachedMark = bank.mark; });
