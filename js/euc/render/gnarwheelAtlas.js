// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/gnarwheelAtlas.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { registerAppearanceCache } from './appearanceRegistry.js';
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS as C } from '../data/tuning.js';
import { GNARWHEEL_LOGO_PNG_BASE64 } from '../data/gnarwheelLogoAsset.js';
import { loftPoint, vAtHeight } from './blockoutKit.js';
import { inkRaster, inkRect, inkSheet, linearFromHex, toSrgbBytes } from './inkKit.js';
import { bytesFromBase64, decodePng } from './pngDecode.js';
export const GNARWHEEL_ATLAS_SIZE = 512;
const rect = (x0, y0, x1, y1) => Object.freeze({ u0: x0 / 512, v0: y0 / 512, u1: x1 / 512, v1: y1 / 512 });
export const GNARWHEEL_REGIONS = Object.freeze({
    chest: rect(4, 4, 508, 130), back: rect(4, 138, 508, 264),
    forearmLeft: rect(4, 284, 252, 508), forearmRight: rect(260, 284, 508, 508),
    cloth: rect(232, 266, 248, 282), limb: rect(256, 266, 272, 282),
    blank: rect(280, 266, 296, 282),
});
export function gnarwheelMarkRaster(turn) {
    const source = decodePng(bytesFromBase64(GNARWHEEL_LOGO_PNG_BASE64));
    const rotate = turn !== 'mirror';
    const width = rotate ? source.height : source.width;
    const height = rotate ? source.width : source.height;
    const rgba = new Uint8Array(source.rgba.length);
    for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
            const sx = turn === 'mirror' ? source.width - 1 - x : turn === 'left' ? y : source.width - 1 - y;
            const sy = turn === 'mirror' ? y : source.height - 1 - x;
            rgba.set(source.rgba.subarray((sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4), (y * width + x) * 4);
        }
    return { width, height, rgba };
}
let cached = null;
export function gnarwheelAtlasPixels(forearm) {
    if (cached !== null)
        return cached;
    const base = linearFromHex(C.gnarwheelPrint);
    const cloth = linearFromHex(C.gnarwheelCloth).map((value, i) => value / base[i]);
    const sheet = inkSheet(512, 512, cloth);
    const sleeve = linearFromHex(C.gnarwheelTrouser).map((value, i) => value / base[i]);
    const plain = GNARWHEEL_REGIONS.limb;
    inkRect(sheet, { x0: plain.u0 * 512 - 1, x1: plain.u1 * 512 + 1,
        y0: plain.v0 * 512 - 1, y1: plain.v1 * 512 + 1 }, sleeve);
    for (const [name, turn] of [
        ['chest', 'mirror'], ['back', 'mirror'],
    ]) {
        const page = GNARWHEEL_REGIONS[name], raster = gnarwheelMarkRaster(turn);
        const width = (page.u1 - page.u0) * 512 * .91;
        const height = width * raster.height / raster.width;
        const cx = (page.u0 + page.u1) * 256, cy = (page.v0 + page.v1) * 256;
        inkRaster(sheet, { x0: cx - width / 2, x1: cx + width / 2, y0: cy - height / 2, y1: cy + height / 2 }, raster, base);
    }
    const cuff = -.222, elbow = -.077, middle = (cuff + elbow) / 2;
    const raster = gnarwheelMarkRaster('right');
    const inkWidth = (elbow - cuff) / (raster.height / raster.width);
    const v = vAtHeight(forearm, middle);
    const arc = (span) => {
        const point = new THREE.Vector3(), prior = loftPoint(forearm, -span / 2, v, new THREE.Vector3());
        let length = 0;
        for (let i = 1; i <= 96; i++) {
            loftPoint(forearm, -span / 2 + span * i / 96, v, point);
            length += point.distanceTo(prior);
            prior.copy(point);
        }
        return length;
    };
    let span = .8;
    for (let i = 0; i < 4; i++)
        span *= inkWidth / arc(span);
    for (const [name, centre] of [['forearmLeft', 0], ['forearmRight', .5]]) {
        const page = GNARWHEEL_REGIONS[name], width = Math.round((page.u1 - page.u0) * 512);
        const height = Math.round((page.v1 - page.v0) * 512), field = inkSheet(width, height, sleeve);
        const dx = span / (Math.PI * 2) * width / 2;
        const y0 = vAtHeight(forearm, cuff) / (forearm.length - 1) * height;
        const y1 = vAtHeight(forearm, elbow) / (forearm.length - 1) * height;
        for (const at of centre === 0 ? [0, width] : [width * centre]) {
            inkRaster(field, { x0: at - dx, x1: at + dx, y0, y1 }, raster, base);
        }
        const x0 = Math.round(page.u0 * 512), top = Math.round(page.v0 * 512);
        for (let y = -2; y < height + 2; y++)
            for (let x = -2; x < width + 2; x++) {
                const source = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 3;
                const target = ((top + y) * 512 + x0 + x) * 3;
                sheet.data.set(field.data.subarray(source, source + 3), target);
            }
    }
    cached = toSrgbBytes(sheet);
    return cached;
}
export function createGnarwheelAtlas(forearm) {
    const texture = new THREE.DataTexture(gnarwheelAtlasPixels(forearm), 512, 512, THREE.RGBAFormat);
    texture.name = 'gnarwheel-atlas';
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}
registerAppearanceCache('gnarwheelAtlas.ts', () => { cached = null; }, () => [cached], () => ({ pixels: cached }), bank => { cached = bank.pixels; });
