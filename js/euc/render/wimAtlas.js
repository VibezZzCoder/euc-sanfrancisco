// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/wimAtlas.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import { registerAppearanceCache } from './appearanceRegistry.js';
import * as THREE from '../../../vendor/three/build/three.core.js';
import { WIM_LOGO_HEIGHT, WIM_LOGO_PNG_BASE64, WIM_LOGO_WIDTH } from '../data/wimLogoAsset.js';
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
import { loftPoint } from './blockoutKit.js';
import { inkField, inkOver, inkRaster, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes, } from './inkKit.js';
import { bytesFromBase64, decodePng } from './pngDecode.js';
export const ATLAS_SIZE = 1024;
const PIXEL_REGIONS = {
    jersey: { x0: 0, y0: 0, x1: 1024, y1: 512 },
    sleeve: { x0: 0, y0: 512, x1: 512, y1: 768 },
    forearm: { x0: 512, y0: 512, x1: 1024, y1: 768 },
    packMark: { x0: 512, y0: 768, x1: 768, y1: 896 },
    guardUpper: { x0: 768, y0: 768, x1: 1024, y1: 896 },
    guardPlain: { x0: 512, y0: 896, x1: 768, y1: 1024 },
    guardFlat: { x0: 960, y0: 896, x1: 1024, y1: 960 },
    guardLower: { x0: 768, y0: 896, x1: 896, y1: 1024 },
    lens: { x0: 896, y0: 896, x1: 960, y1: 960 },
    helmet: { x0: 0, y0: 768, x1: 512, y1: 1024 },
    blue: { x0: 896, y0: 960, x1: 960, y1: 1024 },
    cap: { x0: 960, y0: 960, x1: 992, y1: 1024 },
    blank: { x0: 992, y0: 960, x1: 1024, y1: 1024 },
};
const EDGE_INSET = Object.freeze({
    helmet: 4.5, sleeve: 4.5, forearm: 4.5, guardUpper: 4.5, guardPlain: 4.5, guardLower: 4.5, packMark: 4.5,
});
export const WIM_REGIONS = Object.freeze(Object.fromEntries(Object.entries(PIXEL_REGIONS).map(([name, box]) => {
    const inset = EDGE_INSET[name] ?? 0.5;
    return [name, Object.freeze({
            u0: (box.x0 + inset) / ATLAS_SIZE,
            v0: (box.y0 + 0.5) / ATLAS_SIZE,
            u1: (box.x1 - inset) / ATLAS_SIZE,
            v1: (box.y1 - 0.5) / ATLAS_SIZE,
        })];
})));
const PRINT = linearFromHex(BLOCKOUT_COLOURS.wheelInMotionPrint);
const LENS_BASE = linearFromHex(BLOCKOUT_COLOURS.wheelInMotionLens);
const CLEAR = [1, 1, 1];
const BLUE = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionBlue));
const YELLOW = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionYellow));
const GUARD = [1, 1, 1];
const CAP = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.wheelInMotionGear));
export const MARK_ASPECT = WIM_LOGO_HEIGHT / WIM_LOGO_WIDTH;
const cachedMarks = { upright: null, turned: null };
function markRaster(upright = false) {
    const slot = upright ? 'upright' : 'turned';
    const cached = cachedMarks[slot];
    if (cached !== null)
        return cached;
    const source = decodePng(bytesFromBase64(WIM_LOGO_PNG_BASE64));
    if (upright) {
        cachedMarks.upright = source;
        return source;
    }
    const rgba = new Uint8Array(source.rgba.length);
    const stride = source.width * 4;
    for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
            const from = y * stride + (source.width - 1 - x) * 4;
            const to = y * stride + x * 4;
            rgba[to] = source.rgba[from];
            rgba[to + 1] = source.rgba[from + 1];
            rgba[to + 2] = source.rgba[from + 2];
            rgba[to + 3] = source.rgba[from + 3];
        }
    }
    const turned = { width: source.width, height: source.height, rgba };
    cachedMarks.turned = turned;
    return turned;
}
function paintMark(sheet, x, y, width, pageStretch, upright = false) {
    inkRaster(sheet, { x0: x, y0: y, x1: x + width, y1: y + width * MARK_ASPECT * pageStretch }, markRaster(upright), PRINT);
}
function arcAcross(profile, v, u0, u1) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const steps = 96;
    let length = 0;
    loftPoint(profile, u0, v, a);
    for (let i = 1; i <= steps; i += 1) {
        loftPoint(profile, u0 + (u1 - u0) * (i / steps), v, b);
        length += a.distanceTo(b);
        a.copy(b);
    }
    return length;
}
function vOfHeight(rings, y) {
    const last = rings.length - 1;
    if (y <= rings[0])
        return 0;
    if (y >= rings[last])
        return last;
    for (let i = 1; i <= last; i += 1) {
        if (y <= rings[i])
            return i - 1 + (y - rings[i - 1]) / (rings[i] - rings[i - 1]);
    }
    return last;
}
function metresPerT(rings, y) {
    const last = rings.length - 1;
    const v = Math.min(last - 1e-6, Math.max(0, vOfHeight(rings, y)));
    const i = Math.floor(v);
    return (rings[i + 1] - rings[i]) * last;
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
function within(y, centre, half) {
    return Math.abs(y - centre) <= half;
}
function paintJersey(sheet, layout) {
    const box = PIXEL_REGIONS.jersey;
    const rings = layout.torso.map((ring) => ring.y);
    const atRight = 0.215 + 0.55 * 0.25;
    const frontCentre = (s) => {
        const m = 0.5 - s;
        const base = 0.215 - 0.55 * (m - 0.25);
        return m <= 0.32 ? base : base - 1.1 * (m - 0.32);
    };
    const atLeft = frontCentre(0);
    const sweepCentre = (s) => (s <= 0.5 ? frontCentre(s) : atRight + (atLeft - atRight) * ((s - 0.5) / 0.5));
    const overShoulder = (_s, y) => y > 0.492 && y < 0.520;
    const frontness = (s) => {
        const toFront = Math.min(Math.abs(s - 0.25), Math.abs(s + 0.75));
        return Math.min(1, Math.max(0, (0.21 - toFront) / 0.06));
    };
    paintWrapped(sheet, box, layout.torso, (s, y) => {
        if (overShoulder(s, y))
            return YELLOW;
        const centre = sweepCentre(s);
        if (y > centre + 0.050)
            return within(y, centre + 0.082, 0.008) ? YELLOW : BLUE;
        if (y > centre - 0.050)
            return YELLOW;
        if (y < 0.062)
            return within(y, 0.046, 0.007) ? YELLOW : BLUE;
        if (frontness(s) < 0.5)
            return within(y, centre - 0.088, 0.008) ? YELLOW : BLUE;
        if (within(y, centre - 0.088, 0.008) || within(y, centre - 0.122, 0.006))
            return YELLOW;
        return BLUE;
    });
    const { width: markWidth, bottom } = layout.chestMark;
    const v = vOfHeight(rings, bottom + markWidth * MARK_ASPECT / 2);
    const pageWidth = box.x1 - box.x0;
    const pageHeight = box.y1 - box.y0;
    const front = Math.PI / 2;
    let span = (markWidth / arcAcross(layout.torso, v, 0, Math.PI * 2)) * Math.PI * 2;
    for (let i = 0; i < 3; i += 1) {
        span *= markWidth / arcAcross(layout.torso, v, front - span / 2, front + span / 2);
    }
    const widthPx = (span / (Math.PI * 2)) * pageWidth;
    const metresUp = metresPerT(rings, bottom);
    const stretch = (markWidth * pageHeight) / (metresUp * widthPx);
    const x = box.x0 + pageWidth * 0.25 - widthPx / 2;
    const y = box.y0 + (vOfHeight(rings, bottom) / (rings.length - 1)) * pageHeight;
    paintMark(sheet, x, y, widthPx, stretch);
}
function paintSleeves(sheet, layout) {
    const rake = (s) => 0.060 * Math.sin(s * Math.PI * 2);
    paintWrapped(sheet, PIXEL_REGIONS.sleeve, layout.upperArm, (s, y) => {
        const cant = rake(s);
        if (y > -0.205 + cant * 0.5) {
            for (const centre of [-0.100, -0.150]) {
                if (within(y, centre + cant, 0.007))
                    return BLUE;
            }
            return YELLOW;
        }
        return BLUE;
    });
    paintWrapped(sheet, PIXEL_REGIONS.forearm, layout.forearm, (s, y) => {
        const cant = 0.040 * Math.sin(s * Math.PI * 2);
        for (const centre of [-0.048, -0.086]) {
            if (within(y, centre + cant, 0.0055))
                return YELLOW;
        }
        return BLUE;
    });
}
function patchStretch(profile, span, page, anchor = Math.PI / 2) {
    const rings = profile.map((ring) => ring.y);
    const mid = (span.from + span.to) / 2;
    const across = arcAcross(profile, vOfHeight(rings, mid), anchor + span.u0, anchor + span.u1);
    const up = Math.abs(span.to - span.from);
    return (across / up) * ((page.y1 - page.y0) / (page.x1 - page.x0));
}
function paintGuardShell(sheet, layout, box, withMark, upright = true) {
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    inkRect(sheet, box, GUARD, 1, 1);
    inkRect(sheet, { x0: box.x0, y0: box.y1 - height * 0.14, x1: box.x1, y1: box.y1 }, CAP, 1, 1.5);
    inkRect(sheet, { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 + height * 0.05 }, mixRgb(GUARD, CAP, 0.35), 1, 1.5);
    if (!withMark)
        return;
    const stretch = patchStretch(layout.thigh, layout.thighShell, box);
    const markWidth = width * 0.30;
    const markHeight = markWidth * MARK_ASPECT * stretch;
    const span = layout.thighShell;
    const front = (0 - span.u0) / (span.u1 - span.u0);
    paintMark(sheet, box.x0 + width * front - markWidth / 2, box.y0 + height * 0.44 - markHeight / 2, markWidth, stretch, upright);
}
function paintGuardLower(sheet) {
    const box = PIXEL_REGIONS.guardLower;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    inkRect(sheet, box, GUARD, 1, 1);
    const centre = box.x0 + width * 0.5;
    for (let i = 0; i < 3; i += 1) {
        const y = box.y0 + height * (0.68 - i * 0.11);
        inkRect(sheet, { x0: centre - width * 0.20, y0: y - height * 0.022, x1: centre + width * 0.20, y1: y + height * 0.022 }, CAP, 0.9, 1.4);
    }
    inkRect(sheet, { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 + height * 0.07 }, CAP, 1, 1.5);
    inkRect(sheet, { x0: box.x0, y0: box.y1 - height * 0.03, x1: box.x1, y1: box.y1 }, mixRgb(GUARD, CAP, 0.35), 1, 1.5);
}
function paintPackMark(sheet, layout) {
    const box = PIXEL_REGIONS.packMark;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    inkRect(sheet, box, CAP, 1, 1);
    const stretch = patchStretch(layout.torso, layout.packSticker, box, -Math.PI / 2);
    const markWidth = width * 0.78;
    const markHeight = markWidth * MARK_ASPECT * stretch;
    paintMark(sheet, box.x0 + (width - markWidth) / 2, box.y0 + height * 0.5 - markHeight / 2, markWidth, stretch);
}
function paintLens(sheet) {
    const box = PIXEL_REGIONS.lens;
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const deep = inkOver(LENS_BASE, linearFromHex(0x1c2229));
    const tint = inkOver(LENS_BASE, linearFromHex(0x2f4a4f));
    inkField(sheet, box, (x, y) => {
        const s = (x - box.x0) / width;
        const t = (y - box.y0) / height;
        const base = mixRgb(deep, tint, Math.min(1, Math.max(0, (0.8 - t) / 0.8)));
        const band = Math.exp(-(((s * 0.7 + t) - 0.85) ** 2) / 0.030);
        return [mixRgb(base, CLEAR, band * 0.55), 1];
    });
}
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
        const f = (y - lower.y) / (upper.y - lower.y);
        return lower.halfWidth + (upper.halfWidth - lower.halfWidth) * f;
    }
    return last.halfWidth;
}
function paintHelmet(sheet, layout) {
    const profile = layout.head;
    const EDGE = 0.0022;
    const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / EDGE));
    const clamp01 = (t) => Math.min(1, Math.max(0, t));
    const stroke = (px, py, ax, ay, bx, by, halfA, halfB = halfA) => {
        const dx = bx - ax;
        const dy = by - ay;
        const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
        return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) - (halfA + (halfB - halfA) * t);
    };
    paintWrapped(sheet, PIXEL_REGIONS.helmet, profile, (s, y) => {
        const r = halfWidthAt(profile, y);
        const turn = Math.abs((((s - 0.25 + 0.5) % 1) + 1) % 1 - 0.5);
        const xf = turn * Math.PI * 2 * r;
        const xb = (0.5 - turn) * Math.PI * 2 * r;
        let yellow = 0;
        yellow = Math.max(yellow, cover(stroke(xf, y, 0.1081, 0.2525, 0.010, 0.334, 0.014, 0.009)));
        const chinHalf = y >= 0.152
            ? 0.072 + (0.104 - 0.072) * clamp01((y - 0.152) / (0.176 - 0.152))
            : 0.030 + (0.072 - 0.030) * clamp01((y - 0.086) / (0.152 - 0.086));
        yellow = Math.max(yellow, cover(Math.max(xf - chinHalf, 0.078 - y, y - 0.153)));
        yellow = Math.max(yellow, cover(stroke(xf, y, 0.096, 0.160, 0.052, 0.088, 0.013, 0.006)));
        yellow = Math.max(yellow, cover(stroke(xb, y, 0.012, 0.316, 0.165, 0.222, 0.022, 0.013)));
        yellow = Math.max(yellow, cover(stroke(xb, y, 0.008, 0.160, 0.170, 0.104, 0.022, 0.013)));
        const vy = Math.abs(y - 0.104);
        const black = cover(Math.max(xf - 0.032, vy - 0.031, xf + vy - 0.055));
        return mixRgb(mixRgb(BLUE, YELLOW, yellow), CAP, black);
    });
}
let cachedPixels = null;
let cachedFor = null;
export function wimAtlasPixels(layout) {
    if (cachedPixels !== null && (cachedFor === layout || cachedFor === null)) {
        cachedFor = layout;
        return cachedPixels;
    }
    const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
    paintJersey(sheet, layout);
    paintSleeves(sheet, layout);
    paintGuardShell(sheet, layout, PIXEL_REGIONS.guardUpper, true);
    paintGuardShell(sheet, layout, PIXEL_REGIONS.guardPlain, true, false);
    inkRect(sheet, PIXEL_REGIONS.guardFlat, GUARD, 1, 1);
    paintGuardLower(sheet);
    paintPackMark(sheet, layout);
    paintLens(sheet);
    paintHelmet(sheet, layout);
    inkRect(sheet, PIXEL_REGIONS.blue, BLUE, 1, 1);
    inkRect(sheet, PIXEL_REGIONS.cap, CAP, 1, 1);
    cachedPixels = toSrgbBytes(sheet);
    cachedFor = layout;
    return cachedPixels;
}
export function createWimAtlas(layout) {
    const texture = new THREE.DataTexture(wimAtlasPixels(layout), ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
    texture.name = 'wheel-in-motion-atlas';
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
export { markRaster as wimMarkRaster, patchStretch as wimPatchStretch };
registerAppearanceCache('wimAtlas.ts', () => { cachedPixels = null; cachedFor = null; cachedMarks.upright = cachedMarks.turned = null; }, () => [cachedPixels, cachedMarks.upright?.rgba, cachedMarks.turned?.rgba], () => ({ pixels: cachedPixels, upright: cachedMarks.upright, turned: cachedMarks.turned }), bank => { cachedPixels = bank.pixels; cachedFor = null; cachedMarks.upright = bank.upright; cachedMarks.turned = bank.turned; });
