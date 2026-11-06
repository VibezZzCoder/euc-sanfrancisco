// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { PaintVector3 } from './paintVector.js';
import { BLOCKOUT_COLOURS } from './paintColours.js';
import { loftNormal, loftPoint } from './paintSurface.js';
import { inkField, inkOver, inkPolygon, inkRect, inkSheet, inkStroke, linearFromHex, mixRgb, toSrgbBytes } from '../inkKit.js';
const ATLAS_SIZE = 1024;
const PIXEL_REGIONS = {
    jersey: { x0: 0, y0: 0, x1: 1024, y1: 512 },
    sleeve: { x0: 0, y0: 512, x1: 512, y1: 768 },
    forearm: { x0: 512, y0: 512, x1: 1024, y1: 768 },
    hat: { x0: 0, y0: 768, x1: 512, y1: 1024 },
    kit: { x0: 512, y0: 768, x1: 768, y1: 1024 },
    pack: { x0: 768, y0: 768, x1: 1024, y1: 896 },
    knee: { x0: 768, y0: 896, x1: 896, y1: 1024 },
    handCan: { x0: 896, y0: 896, x1: 1024, y1: 1000 },
    blank: { x0: 992, y0: 1008, x1: 1024, y1: 1024 },
};
const EDGE_INSET = Object.freeze({
    sleeve: 4.5, forearm: 4.5, hat: 4.5, kit: 4.5, pack: 4.5, knee: 4.5, handCan: 4.5,
});
const KIT_LABEL = Object.freeze({ s0: 0, t0: 0.58, s1: 1, t1: 0.94 });
const KIT_PEAK = Object.freeze({ s0: 0.10, t0: 0.30, s1: 0.90, t1: 0.44 });
const PACK_WINDOW = Object.freeze({ s0: 0.63, s1: 0.87, bottom: 0.205, top: 0.446 });
const PACK_BAND = Object.freeze({ bottom: 0.255, top: 0.446 });
const PACK_FOAM_HEAD = 0.055;
const PACK_FOAM_DRIP = 0.040;
const PACK_PLAIN = Object.freeze({ s0: 0.14, t0: 0.319, s1: 0.36, t1: 0.487 });
const HAND_CAN_FACE_SHARE = 0.75;
function handCanPageS(u01) {
    return u01 <= 0.5
        ? u01 * 2 * HAND_CAN_FACE_SHARE
        : HAND_CAN_FACE_SHARE + (u01 - 0.5) * 2 * (1 - HAND_CAN_FACE_SHARE);
}
function handCanAngle01(s) {
    return s <= HAND_CAN_FACE_SHARE
        ? (s / HAND_CAN_FACE_SHARE) * 0.5
        : 0.5 + ((s - HAND_CAN_FACE_SHARE) / (1 - HAND_CAN_FACE_SHARE)) * 0.5;
}
const PRINT = linearFromHex(BLOCKOUT_COLOURS.drunkardPrint);
const CLEAR = [1, 1, 1];
const IVORY = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardIvory));
const AMBER = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardAmber));
const AMBER_DEEP = mixRgb(AMBER, inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardBrown)), 0.28);
const BROWN = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardBrown));
const BROWN_LIGHT = mixRgb(BROWN, AMBER, 0.22);
const PACK_LIQUID = mixRgb(AMBER, BROWN, 0.45);
const PACK_LIQUID_SHADE = mixRgb(PACK_LIQUID, BROWN, 0.28);
const PACK_BUBBLE = mixRgb(PACK_LIQUID, CLEAR, 0.16);
const HOP = inkOver(PRINT, linearFromHex(BLOCKOUT_COLOURS.drunkardHop));
const HOP_DEEP = inkOver(PRINT, linearFromHex(0x3b6a1a));
const HOP_EDGE = inkOver(PRINT, linearFromHex(0x2b1c0d));
const HOP_PALE = inkOver(PRINT, linearFromHex(0x8fc44e));
const HOP_ASPECT = 1.35;
function hash01(index) {
    let t = (index * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function drips(s, count, seed, widthScale = 1) {
    let fall = 0.10 + 0.10 * (0.5 + 0.5 * Math.sin(s * Math.PI * 2 * 3 + 1.3));
    for (let i = 0; i < count; i += 1) {
        const centre = hash01(seed + i * 3);
        const width = (0.012 + 0.020 * hash01(seed + i * 3 + 1)) * widthScale;
        const length = 0.35 + 0.65 * hash01(seed + i * 3 + 2);
        const away = Math.abs(s - centre);
        const gap = Math.min(away, 1 - away);
        fall = Math.max(fall, length * Math.exp(-((gap / width) ** 2)));
    }
    return fall;
}
export function paintHop(sheet, x, y, size, stretch = 1) {
    const height = size * HOP_ASPECT * stretch;
    const top = y + height / 2;
    inkStroke(sheet, [[x, top - height * 0.04], [x + size * 0.06, top + height * 0.10]], Math.max(1.5, size * 0.07), HOP_DEEP);
    const LEAF = [
        [0, -1], [0.30, -0.56], [0.62, 0.05], [0.40, 0.60], [0, 1],
        [-0.40, 0.60], [-0.62, 0.05], [-0.30, -0.56],
    ];
    const bract = (cx, cy, w, h) => {
        const shape = (scale) => (LEAF.map(([lx, ly]) => [cx + lx * (w / 2) * scale, cy + ly * (h / 2) * scale]));
        inkPolygon(sheet, shape(1.42), HOP_EDGE, 1, 1.4);
        inkPolygon(sheet, shape(1), HOP, 1, 1.2);
        inkStroke(sheet, [[cx, cy - h * 0.34], [cx, cy + h * 0.30]], Math.max(1, w * 0.10), HOP_PALE, 0.75, 1.2);
    };
    const rows = [
        { t: 0.20, offsets: [-0.26, 0.26], scale: 0.95 },
        { t: 0.42, offsets: [-0.36, 0.36], scale: 1.05 },
        { t: 0.50, offsets: [0], scale: 1.45 },
        { t: 0.68, offsets: [-0.30, 0.30], scale: 1.0 },
        { t: 0.86, offsets: [-0.13, 0.13], scale: 0.85 },
    ];
    for (const row of rows) {
        for (const offset of row.offsets) {
            bract(x + offset * size, top - row.t * height, size * 0.60 * row.scale, height * 0.28 * row.scale);
        }
    }
}
function arcAcross(profile, v, u0, u1, lift = 0) {
    const a = new PaintVector3();
    const b = new PaintVector3();
    const n = new PaintVector3();
    const steps = 96;
    let length = 0;
    const at = (u, out) => {
        loftPoint(profile, u, v, out);
        if (lift !== 0)
            out.addScaledVector(loftNormal(profile, u, v, n), lift);
    };
    at(u0, a);
    for (let i = 1; i <= steps; i += 1) {
        at(u0 + (u1 - u0) * (i / steps), b);
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
function patchStretch(profile, span, page, inset, anchor = Math.PI / 2) {
    const rings = profile.map((ring) => ring.y);
    const mid = (span.from + span.to) / 2;
    const across = arcAcross(profile, vOfHeight(rings, mid), anchor + span.u0, anchor + span.u1, span.lift ?? 0);
    const up = Math.abs(span.to - span.from);
    return (across / up) * ((page.y1 - page.y0 - 1) / (page.x1 - page.x0 - 2 * inset));
}
function foamCover(y, edge, feather) {
    return Math.min(1, Math.max(0, 0.5 + (y - edge) / Math.max(1e-6, feather)));
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
    const columnMetres = (t) => {
        const v = Math.min(last, Math.max(0, t * last));
        const i = Math.min(last - 1, Math.floor(v));
        const f = v - i;
        const a = profile[i];
        const b = profile[i + 1];
        const radius = ((a.halfWidth + a.halfDepth) / 2) * (1 - f) + ((b.halfWidth + b.halfDepth) / 2) * f;
        return (Math.PI * 2 * radius) / width;
    };
    inkField(sheet, box, (x, y) => {
        const s = (x - box.x0) / width;
        const t = (y - box.y0) / height;
        const rowMetres = Math.abs(heightOf(t + 1 / height) - heightOf(t));
        return [shade(s, heightOf(t), Math.max(rowMetres, columnMetres(t))), 1];
    });
}
function frontness(s) {
    const toFront = Math.min(Math.abs(s - 0.25), Math.abs(s + 0.75));
    return Math.min(1, Math.max(0, (0.21 - toFront) / 0.06));
}
const JERSEY_BELT = Object.freeze({ bottom: 0.030, top: 0.078 });
const JERSEY_YOKE = 0.445;
const JERSEY_BIB = 0.360;
const JERSEY_PANEL_HALF = 0.075;
const JERSEY_PANEL_SPREAD = 0.085;
const JERSEY_BIB_OUTER = 0.180;
const PIPING = 0.004;
function paintJersey(sheet, layout) {
    const box = PIXEL_REGIONS.jersey;
    const rings = layout.torso.map((ring) => ring.y);
    paintWrapped(sheet, box, layout.torso, (s, y) => {
        if (y < JERSEY_BELT.bottom)
            return AMBER;
        if (y < JERSEY_BELT.top) {
            const front = frontness(s) > 0.9 && Math.abs(s - 0.25) < 0.020;
            if (front && y > JERSEY_BELT.bottom + 0.010 && y < JERSEY_BELT.top - 0.010)
                return IVORY;
            if (y < JERSEY_BELT.bottom + 0.005 || y > JERSEY_BELT.top - 0.005)
                return BROWN_LIGHT;
            return BROWN;
        }
        if (y > JERSEY_YOKE)
            return y < JERSEY_YOKE + PIPING ? BROWN : IVORY;
        const off = Math.abs(s - 0.25);
        if (off < JERSEY_BIB_OUTER) {
            const down = Math.min(1, Math.max(0, (JERSEY_BIB - y) / (JERSEY_BIB - JERSEY_BELT.top)));
            const panelHalf = JERSEY_PANEL_HALF + JERSEY_PANEL_SPREAD * (down * down * (3 - 2 * down));
            if (off > panelHalf) {
                if (off < panelHalf + 0.006 || off > JERSEY_BIB_OUTER - 0.006)
                    return BROWN;
                return IVORY;
            }
        }
        return AMBER;
    });
    const { width: hopWidth, centre } = layout.chestHop;
    const v = vOfHeight(rings, centre);
    const pageWidth = box.x1 - box.x0;
    const pageHeight = box.y1 - box.y0;
    const front = Math.PI / 2;
    let span = (hopWidth / arcAcross(layout.torso, v, 0, Math.PI * 2)) * Math.PI * 2;
    for (let i = 0; i < 3; i += 1) {
        span *= hopWidth / arcAcross(layout.torso, v, front - span / 2, front + span / 2);
    }
    const widthPx = (span / (Math.PI * 2)) * pageWidth;
    const metresUp = metresPerT(rings, centre);
    const stretch = (hopWidth * pageHeight) / (metresUp * widthPx);
    paintHop(sheet, box.x0 + pageWidth * 0.25, box.y0 + (v / (rings.length - 1)) * pageHeight, widthPx, stretch);
}
const SLEEVE_WEDGE_HALF = 0.10;
const SLEEVE_WEDGE_FADE = -0.060;
const SLEEVE_WEDGE_END = -0.170;
const SLEEVE_HEM = Object.freeze({ top: -0.258, bottom: -0.280 });
const SLEEVE_CUFF = -0.218;
const SLEEVE_CHEVRONS = [
    { apex: -0.108, ink: BROWN },
    { apex: -0.126, ink: BROWN },
    { apex: -0.144, ink: AMBER },
];
const SLEEVE_CHEVRON = Object.freeze({ halfSpan: 0.11, rise: 0.026, depth: 0.012 });
const SLEEVE_DASHES = [-0.172, -0.192];
const SLEEVE_DASH = Object.freeze({ halfSpan: 0.05, depth: 0.010 });
function paintSleeveChevrons(s, y) {
    const lat = Math.min(s, 1 - s);
    if (lat < SLEEVE_CHEVRON.halfSpan) {
        const centre = SLEEVE_CHEVRON.rise * (lat / SLEEVE_CHEVRON.halfSpan);
        for (const bar of SLEEVE_CHEVRONS) {
            if (Math.abs(y - (bar.apex + centre)) < SLEEVE_CHEVRON.depth / 2)
                return bar.ink;
        }
    }
    if (lat < SLEEVE_DASH.halfSpan) {
        for (const dash of SLEEVE_DASHES) {
            if (Math.abs(y - dash) < SLEEVE_DASH.depth / 2)
                return BROWN;
        }
    }
    return null;
}
function paintSleeves(sheet, layout) {
    paintWrapped(sheet, PIXEL_REGIONS.sleeve, layout.upperArm, (s, y) => {
        if (y > -0.012)
            return IVORY;
        if (y > -0.012 - PIPING)
            return BROWN;
        if (y < SLEEVE_HEM.top)
            return BROWN;
        if (y > SLEEVE_WEDGE_END) {
            const down = Math.min(1, Math.max(0, (SLEEVE_WEDGE_FADE - y) / (SLEEVE_WEDGE_FADE - SLEEVE_WEDGE_END)));
            const half = SLEEVE_WEDGE_HALF * (1 - down * down * (3 - 2 * down));
            const rear = Math.abs(s - 0.75);
            if (rear < half)
                return AMBER;
            if (rear < half + PIPING)
                return BROWN;
        }
        return paintSleeveChevrons(s, y) ?? IVORY;
    });
    paintWrapped(sheet, PIXEL_REGIONS.forearm, layout.forearm, (_s, y) => {
        if (y < SLEEVE_CUFF)
            return HOP;
        if (y < SLEEVE_CUFF + PIPING)
            return BROWN;
        return IVORY;
    });
}
const HAT_FOAM_EDGE = 0.345;
const HAT_FOAM_DRIP = 0.113;
const HAT_BRIM = 0.224;
function hatFoamEdge(s) {
    return HAT_FOAM_EDGE - HAT_FOAM_DRIP * drips(s, 5, 11, 2.4);
}
function paintHat(sheet, layout) {
    paintWrapped(sheet, PIXEL_REGIONS.hat, layout.hat, (s, y, texel) => {
        const edge = hatFoamEdge(s);
        if (y < HAT_BRIM)
            return AMBER_DEEP;
        const shadow = mixRgb(AMBER, AMBER_DEEP, foamCover(y, edge - 0.005, texel));
        return mixRgb(shadow, CLEAR, foamCover(y, edge, texel));
    });
}
const CAN_RIM = 0.009;
const CAN_TOP = 0.116;
const CAN_DRIP = 0.020;
const CAN_LID = 0.0145;
function subBox(page, rect) {
    const width = page.x1 - page.x0;
    const height = page.y1 - page.y0;
    return {
        x0: page.x0 + rect.s0 * width,
        y0: page.y0 + rect.t0 * height,
        x1: page.x0 + rect.s1 * width,
        y1: page.y0 + rect.t1 * height,
    };
}
function paintKit(sheet, layout) {
    const page = PIXEL_REGIONS.kit;
    inkRect(sheet, page, CLEAR, 1, 1);
    const label = subBox(page, KIT_LABEL);
    const width = label.x1 - label.x0;
    const height = label.y1 - label.y0;
    const lid = layout.can[layout.can.length - 1].y - CAN_LID;
    paintWrapped(sheet, label, layout.can, (s, y, texel) => {
        if (y > lid)
            return BROWN;
        if (y > lid - 0.003)
            return AMBER_DEEP;
        if (y < CAN_RIM)
            return CLEAR;
        if (y < CAN_RIM + 0.004)
            return BROWN;
        const foam = CAN_TOP - CAN_DRIP * drips(s, 7, 29);
        const shadow = mixRgb(AMBER, AMBER_DEEP, foamCover(y, foam - 0.003, texel));
        return mixRgb(shadow, CLEAR, foamCover(y, foam, texel));
    });
    const rings = layout.can.map((ring) => ring.y);
    const radius = Math.max(...layout.can.map((ring) => ring.halfWidth));
    const acrossPerM = width / (Math.PI * 2 * radius);
    const hopCentre = 0.045;
    const upPerM = height / metresPerT(rings, hopCentre);
    const hopWidth = radius * 0.66;
    paintHop(sheet, label.x0 + width * 0.25, label.y0 + (vOfHeight(rings, hopCentre) / (rings.length - 1)) * height, hopWidth * acrossPerM, upPerM / acrossPerM);
    const peak = subBox(page, KIT_PEAK);
    const split = peak.y0 + (peak.y1 - peak.y0) * 0.5;
    inkRect(sheet, { x0: peak.x0, y0: peak.y0, x1: peak.x1, y1: split }, AMBER_DEEP, 1, 1);
    inkRect(sheet, { x0: peak.x0, y0: split, x1: peak.x1, y1: peak.y1 }, AMBER, 1, 1);
}
const PACK_BUBBLES = 24;
const PACK_METRES_PER_S = 0.50;
function packBubbleCover(s, y, bottom, top, feather) {
    const span = top - bottom;
    let nearest = Infinity;
    for (let i = 0; i < PACK_BUBBLES; i += 1) {
        const up = hash01(53 + i * 4 + 2);
        const cy = bottom + span * (0.20 + 0.80 * Math.sqrt(up));
        const cs = hash01(53 + i * 4);
        const r = 0.0060 + 0.0080 * hash01(53 + i * 4 + 1) * (0.5 + 0.5 * up);
        const ds = Math.min(Math.abs(s - cs), 1 - Math.abs(s - cs)) * PACK_METRES_PER_S;
        const dy = y - cy;
        nearest = Math.min(nearest, Math.hypot(ds, dy) - r);
    }
    return Math.min(1, Math.max(0, 0.5 - nearest / Math.max(1e-6, feather)));
}
function paintPack(sheet, layout) {
    const page = PIXEL_REGIONS.pack;
    const rings = layout.pack.map((ring) => ring.y);
    const last = rings.length - 1;
    const width = page.x1 - page.x0;
    const height = page.y1 - page.y0;
    const heightOf = (t) => {
        const v = Math.min(last, Math.max(0, t * last));
        const i = Math.min(last - 1, Math.floor(v));
        return rings[i] + (rings[i + 1] - rings[i]) * (v - i);
    };
    const window = PACK_WINDOW;
    const band = PACK_BAND;
    const capBottom = band.top;
    const columnMetres = PACK_METRES_PER_S / width;
    inkField(sheet, page, (x, py) => {
        const s = (x - page.x0) / width;
        const t = (py - page.y0) / height;
        const plain = PACK_PLAIN;
        if (s > plain.s0 && s < plain.s1 && t > plain.t0 && t < plain.t1)
            return [CLEAR, 1];
        const y = heightOf(t);
        const texel = Math.max(Math.abs(heightOf(t + 1 / height) - y), columnMetres);
        if (y > capBottom)
            return [BROWN, 1];
        const inWindow = s > window.s0 && s < window.s1 && y > window.bottom && y < window.top;
        if (inWindow || y >= band.bottom) {
            if (inWindow && y < band.bottom) {
                const frame = 0.018;
                if (s < window.s0 + frame || s > window.s1 - frame || y < window.bottom + 0.012)
                    return [BROWN_LIGHT, 1];
            }
            const foam = band.top - (PACK_FOAM_HEAD + PACK_FOAM_DRIP * drips(s, 8, 47, 2.2));
            const foamCoverage = foamCover(y, foam, texel);
            if (foamCoverage >= 1)
                return [CLEAR, 1];
            const shadeCoverage = foamCover(y, foam - 0.022, texel);
            const bubble = packBubbleCover(s, y, window.bottom, foam - 0.022, texel);
            const body = mixRgb(mixRgb(PACK_LIQUID, PACK_BUBBLE, bubble), PACK_LIQUID_SHADE, shadeCoverage);
            return [mixRgb(body, CLEAR, foamCoverage), 1];
        }
        return [BROWN, 1];
    });
}
function paintKnee(sheet, layout) {
    const box = PIXEL_REGIONS.knee;
    inkRect(sheet, box, BROWN, 1, 1);
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const stretch = patchStretch(layout.shin, layout.kneePad, box, EDGE_INSET.knee ?? 0.5);
    paintHop(sheet, box.x0 + width * 0.5, box.y0 + height * 0.50, width * 0.36, stretch);
}
let cachedPixels = null;
let cachedFor = null;
export function drunkardAtlasPixels(layout) {
    if (cachedPixels !== null && cachedFor === layout)
        return cachedPixels;
    const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
    paintJersey(sheet, layout);
    paintSleeves(sheet, layout);
    paintHat(sheet, layout);
    paintKit(sheet, layout);
    paintPack(sheet, layout);
    paintKnee(sheet, layout);
    paintHandCan(sheet, layout);
    cachedPixels = toSrgbBytes(sheet);
    cachedFor = layout;
    return cachedPixels;
}
const HAND_CAN_HOP = Object.freeze({
    angle: 0.22,
    centre: 0.0335,
    width: 0.79,
});
function paintHandCan(sheet, layout) {
    const box = PIXEL_REGIONS.handCan;
    const rings = layout.handCan.map((ring) => ring.y);
    const radius = Math.max(...layout.handCan.map((ring) => ring.halfWidth));
    const { rim, line, drip } = layout.handCanBands;
    const barrelTop = layout.handCan.filter((ring, i) => i > 0 && Math.abs(ring.halfWidth - radius) < 1e-9).pop().y;
    paintWrapped(sheet, box, layout.handCan, (s, y, texel) => {
        if (y < rim)
            return CLEAR;
        if (y < rim + line)
            return BROWN;
        const foam = barrelTop - drip * drips(handCanAngle01(s), 7, 61);
        const shadow = mixRgb(AMBER, AMBER_DEEP, foamCover(y, foam - 0.003, texel));
        return mixRgb(shadow, CLEAR, foamCover(y, foam, texel));
    });
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const acrossPerM = (width * HAND_CAN_FACE_SHARE) / (Math.PI * radius);
    const upPerM = height / metresPerT(rings, HAND_CAN_HOP.centre);
    paintHop(sheet, box.x0 + width * handCanPageS(HAND_CAN_HOP.angle), box.y0 + (vOfHeight(rings, HAND_CAN_HOP.centre) / (rings.length - 1)) * height, radius * HAND_CAN_HOP.width * acrossPerM, upPerM / acrossPerM);
}
export function paintBank(...args) { const pixels = drunkardAtlasPixels(...args); return { pixels }; }
