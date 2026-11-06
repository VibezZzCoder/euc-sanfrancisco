// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/sealAtlas.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { registerAppearanceCache } from './appearanceRegistry.js';
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { inkField, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes, } from './inkKit.js';
export const ATLAS_SIZE = 512;
const PIXEL_REGIONS = {
    helmet: { x0: 0, y0: 0, x1: 512, y1: 384 },
    rim: { x0: 0, y0: 384, x1: 64, y1: 448 },
    blank: { x0: 448, y0: 448, x1: 512, y1: 512 },
};
const EDGE_INSET = Object.freeze({ helmet: 4.5 });
export const SEAL_REGIONS = Object.freeze(Object.fromEntries(Object.entries(PIXEL_REGIONS).map(([name, box]) => {
    const inset = EDGE_INSET[name] ?? 0.5;
    return [name, Object.freeze({
            u0: (box.x0 + inset) / ATLAS_SIZE,
            v0: (box.y0 + 0.5) / ATLAS_SIZE,
            u1: (box.x1 - inset) / ATLAS_SIZE,
            v1: (box.y1 - 0.5) / ATLAS_SIZE,
        })];
})));
const PRINT = linearFromHex(BLOCKOUT_COLOURS.sealGarment);
const CLEAR = [1, 1, 1];
export const SEAL_LID_INKS = Object.freeze({
    red: BLOCKOUT_COLOURS.sealHelmetRed,
    white: BLOCKOUT_COLOURS.sealHelmetWhite,
    black: BLOCKOUT_COLOURS.sealHelmetBlack,
});
export const SEAL_PRINT_GROUND = PRINT;
function inkFor(hex) {
    const target = linearFromHex(hex);
    return [
        Math.min(1, target[0] / Math.max(1e-4, PRINT[0])),
        Math.min(1, target[1] / Math.max(1e-4, PRINT[1])),
        Math.min(1, target[2] / Math.max(1e-4, PRINT[2])),
    ];
}
const RED = inkFor(SEAL_LID_INKS.red);
const WHITE = inkFor(SEAL_LID_INKS.white);
const BLACK = inkFor(SEAL_LID_INKS.black);
function halfWidthAt(profile, y) {
    const first = profile[0];
    const last = profile[profile.length - 1];
    if (y <= first.y)
        return first.halfWidth;
    if (y >= last.y)
        return last.halfWidth;
    for (let i = 1; i < profile.length; i += 1) {
        const upper = profile[i];
        if (upper.y < y)
            continue;
        const lower = profile[i - 1];
        return lower.halfWidth
            + (upper.halfWidth - lower.halfWidth) * ((y - lower.y) / (upper.y - lower.y));
    }
    return last.halfWidth;
}
function paintWrapped(sheet, box, profile, shade) {
    const rings = profile.map((ring) => ring.y);
    const last = rings.length - 1;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const heightOf = (t) => {
        const v = Math.min(last, Math.max(0, t * last));
        const i = Math.min(last - 1, Math.floor(v));
        return rings[i] + (rings[i + 1] - rings[i]) * (v - i);
    };
    inkField(sheet, box, (x, y) => {
        const s = (x - box.x0) / width;
        const t = (y - box.y0) / height;
        return [shade(s, heightOf(t)), 1];
    });
}
const EDGE = 0.0022;
function paintSealHelmet(sheet, layout) {
    const profile = layout.head;
    const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / EDGE));
    const clamp01 = (t) => Math.min(1, Math.max(0, t));
    const stroke = (px, py, ax, ay, bx, by, halfA, halfB = halfA) => {
        const dx = bx - ax;
        const dy = by - ay;
        const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
        return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) - (halfA + (halfB - halfA) * t);
    };
    const wedge = (px, py, ax, ay, bx, by, halfA, halfB = halfA) => {
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy);
        const ux = dx / length;
        const uy = dy / length;
        const along = (px - ax) * ux + (py - ay) * uy;
        const across = Math.abs((px - ax) * -uy + (py - ay) * ux);
        const t = clamp01(along / length);
        return Math.max(across - (halfA + (halfB - halfA) * t), along - length, -along);
    };
    const { from: portBottom, to: portTop, halfSpan } = layout.visor;
    paintWrapped(sheet, PIXEL_REGIONS.helmet, profile, (s, y) => {
        const r = halfWidthAt(profile, y);
        const turn = Math.abs((((s - 0.25 + 0.5) % 1) + 1) % 1 - 0.5);
        const xf = turn * Math.PI * 2 * r;
        const xb = (0.5 - turn) * Math.PI * 2 * r;
        const portArc = halfSpan * r;
        const insidePort = xf <= portArc && y >= portBottom && y <= portTop;
        const outsidePort = Math.max(xf - portArc, portBottom - y, y - portTop);
        let white = 0;
        white = Math.max(white, cover(stroke(xf, y, 0.052, portTop + 0.006, 0.020, 0.322, 0.0055, 0.0045)));
        white = Math.max(white, cover(stroke(xb, y, 0.052, 0.196, 0.020, 0.322, 0.0055, 0.0045)));
        white = Math.max(white, cover(wedge(xf, y, portArc + 0.006, portTop - 0.020, portArc + 0.070, portTop + 0.030, 0.030, 0.010)));
        white = Math.max(white, cover(wedge(xf, y, portArc - 0.004, portBottom - 0.012, 0.030, layout.rimTop + 0.010, 0.026, 0.012)));
        white = Math.max(white, cover(Math.max(xb - 0.160, layout.rimTop - y, y - (layout.rimTop + 0.064))));
        let black = 0;
        const crest = 0.004 * clamp01(1 - xf / 0.030);
        black = Math.max(black, cover(Math.max(xf - portArc - 0.030, portTop - y, y - (portTop + 0.042 + crest - 0.16 * xf))));
        black = Math.max(black, cover(Math.max(-outsidePort, outsidePort - 0.020)));
        black = Math.max(black, cover(Math.max(y - (layout.rimTop + 0.026), xf - 0.085)));
        black = Math.max(black, cover(Math.max(xb - 0.120, y - 0.162, 0.134 - y)));
        if (insidePort)
            return BLACK;
        return mixRgb(mixRgb(RED, BLACK, black), WHITE, white);
    });
}
let cachedPixels = null;
let cachedFor = null;
export function sealAtlasPixels(layout) {
    if (cachedPixels !== null && (cachedFor === layout || cachedFor === null)) {
        cachedFor = layout;
        return cachedPixels;
    }
    const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
    paintSealHelmet(sheet, layout);
    inkRect(sheet, PIXEL_REGIONS.rim, BLACK, 1, 1);
    cachedPixels = toSrgbBytes(sheet);
    cachedFor = layout;
    return cachedPixels;
}
export function createSealAtlas(layout) {
    const texture = new THREE.DataTexture(sealAtlasPixels(layout), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
    texture.name = 'seal-on-a-wheel-atlas';
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
export function sealLidInkShares(layout, window) {
    const pixels = sealAtlasPixels(layout);
    const box = PIXEL_REGIONS.helmet;
    const profile = layout.head;
    const rings = profile.map((ring) => ring.y);
    const last = rings.length - 1;
    const heightOf = (t) => {
        const v = Math.min(last, Math.max(0, t * last));
        const i = Math.min(last - 1, Math.floor(v));
        return rings[i] + (rings[i + 1] - rings[i]) * (v - i);
    };
    const targets = [
        { name: 'red', rgb: linearFromHex(SEAL_LID_INKS.red) },
        { name: 'white', rgb: linearFromHex(SEAL_LID_INKS.white) },
        { name: 'black', rgb: linearFromHex(SEAL_LID_INKS.black) },
    ];
    const tally = { red: 0, white: 0, black: 0, counted: 0 };
    const toLinear = (byte) => {
        const v = byte / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    for (let py = box.y0; py < box.y1; py += 1) {
        const t = (py + 0.5 - box.y0) / (box.y1 - box.y0);
        const y = heightOf(t);
        if (window?.from !== undefined && y < window.from)
            continue;
        if (window?.to !== undefined && y > window.to)
            continue;
        for (let px = box.x0; px < box.x1; px += 1) {
            const s = (px + 0.5 - box.x0) / (box.x1 - box.x0);
            const turn = Math.abs((((s - 0.25 + 0.5) % 1) + 1) % 1 - 0.5);
            const xf = turn * Math.PI * 2 * halfWidthAt(profile, y);
            if (window?.frontArc !== undefined && xf > window.frontArc)
                continue;
            if (window?.rearArc !== undefined
                && (0.5 - turn) * Math.PI * 2 * halfWidthAt(profile, y) > window.rearArc)
                continue;
            if (xf <= layout.visor.halfSpan * halfWidthAt(profile, y)
                && y >= layout.visor.from && y <= layout.visor.to)
                continue;
            const i = (py * ATLAS_SIZE + px) * 4;
            const here = [
                toLinear(pixels[i]) * PRINT[0],
                toLinear(pixels[i + 1]) * PRINT[1],
                toLinear(pixels[i + 2]) * PRINT[2],
            ];
            let best = targets[0];
            let bestGap = Infinity;
            for (const target of targets) {
                const gap = Math.hypot(here[0] - target.rgb[0], here[1] - target.rgb[1], here[2] - target.rgb[2]);
                if (gap < bestGap) {
                    bestGap = gap;
                    best = target;
                }
            }
            tally[best.name] += 1;
            tally.counted += 1;
        }
    }
    return tally;
}
registerAppearanceCache('sealAtlas.ts', () => { cachedPixels = null; cachedFor = null; }, () => [cachedPixels], () => ({ pixels: cachedPixels }), bank => { cachedPixels = bank.pixels; cachedFor = null; });
