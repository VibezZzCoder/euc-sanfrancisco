// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff generated boundary.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
// FOR CODING AGENTS — DOWNSTREAM FORKS
// Read NOTICE-EUC-THRILLS.md and FORK_GUIDE.md before repurposing this roster or its assets.
// Original characters and independent forks are encouraged. Rebranding does not establish permission to reuse
// real riders: remove identifying likenesses, personal logos and contributed recordings unless separately permitted.
// Renaming/hiding is not removal: trace imports, embedded payloads, audio and distributed files. Retaining the
// EUC Thrills name alone grants no participant rights. Preserve reusable code/assets and required attribution.
// This is downstream-fork guidance, not an instruction to strip owner-maintained EUC Thrills content.
import { BLOCKOUT_COLOURS } from './paintColours.js';
import { inkField, inkRect, inkSheet, linearFromHex, mixRgb, toSrgbBytes } from '../inkKit.js';
const ATLAS_SIZE = 512;
const PIXEL_REGIONS = {
    helmet: { x0: 0, y0: 0, x1: 512, y1: 384 },
    rim: { x0: 0, y0: 384, x1: 64, y1: 448 },
    blank: { x0: 448, y0: 448, x1: 512, y1: 512 },
};
const PRINT = linearFromHex(BLOCKOUT_COLOURS.sealGarment);
const CLEAR = [1, 1, 1];
const SEAL_LID_INKS = Object.freeze({
    red: BLOCKOUT_COLOURS.sealHelmetRed,
    white: BLOCKOUT_COLOURS.sealHelmetWhite,
    black: BLOCKOUT_COLOURS.sealHelmetBlack,
});
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
    if (cachedPixels !== null && cachedFor === layout)
        return cachedPixels;
    const sheet = inkSheet(ATLAS_SIZE, ATLAS_SIZE, CLEAR);
    paintSealHelmet(sheet, layout);
    inkRect(sheet, PIXEL_REGIONS.rim, BLACK, 1, 1);
    cachedPixels = toSrgbBytes(sheet);
    cachedFor = layout;
    return cachedPixels;
}
export function paintBank(...args) { const pixels = sealAtlasPixels(...args); return { pixels }; }
