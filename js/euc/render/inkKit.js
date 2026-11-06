// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/inkKit.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LETTER_ASPECT, wordLength, wordStrokes, } from '../shared/letterPaths.js';
export function linearFromHex(hex) {
    return [
        linearFromByte((hex >> 16) & 0xff),
        linearFromByte((hex >> 8) & 0xff),
        linearFromByte(hex & 0xff),
    ];
}
export function linearFromByte(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
const LINEAR_BYTE = (() => {
    const table = new Float32Array(256);
    for (let i = 0; i < 256; i += 1)
        table[i] = linearFromByte(i);
    return table;
})();
export function inkOver(base, target) {
    return [
        Math.min(1, target[0] / Math.max(1e-4, base[0])),
        Math.min(1, target[1] / Math.max(1e-4, base[1])),
        Math.min(1, target[2] / Math.max(1e-4, base[2])),
    ];
}
export function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function inkSheet(width, height, base) {
    const data = new Float32Array(width * height * 3);
    for (let i = 0; i < data.length; i += 3) {
        data[i] = base[0];
        data[i + 1] = base[1];
        data[i + 2] = base[2];
    }
    return { width, height, data };
}
function blend(sheet, x, y, colour, alpha) {
    if (alpha <= 0)
        return;
    if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height)
        return;
    const i = (y * sheet.width + x) * 3;
    const a = alpha >= 1 ? 1 : alpha;
    const keep = 1 - a;
    sheet.data[i] = sheet.data[i] * keep + colour[0] * a;
    sheet.data[i + 1] = sheet.data[i + 1] * keep + colour[1] * a;
    sheet.data[i + 2] = sheet.data[i + 2] * keep + colour[2] * a;
}
function clipBox(sheet, box) {
    return {
        x0: Math.max(0, Math.floor(box.x0)),
        y0: Math.max(0, Math.floor(box.y0)),
        x1: Math.min(sheet.width - 1, Math.ceil(box.x1)),
        y1: Math.min(sheet.height - 1, Math.ceil(box.y1)),
    };
}
export function inkField(sheet, box, shade) {
    const clipped = clipBox(sheet, box);
    for (let y = clipped.y0; y <= clipped.y1; y += 1) {
        for (let x = clipped.x0; x <= clipped.x1; x += 1) {
            const sample = shade(x + 0.5, y + 0.5);
            if (sample === null)
                continue;
            blend(sheet, x, y, sample[0], sample[1]);
        }
    }
}
export function inkShape(sheet, box, distance, colour, alpha = 1, softness = 1) {
    inkField(sheet, box, (x, y) => {
        const d = distance(x, y);
        const coverage = Math.min(1, Math.max(0, 0.5 - d / softness));
        return coverage <= 0 ? null : [colour, coverage * alpha];
    });
}
export function inkDisc(sheet, centre, radius, colour, alpha = 1, softness = 1) {
    const box = {
        x0: centre[0] - radius - 2,
        y0: centre[1] - radius - 2,
        x1: centre[0] + radius + 2,
        y1: centre[1] + radius + 2,
    };
    inkShape(sheet, box, (x, y) => Math.hypot(x - centre[0], y - centre[1]) - radius, colour, alpha, softness);
}
function distanceToSegment(x, y, a, b) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const wx = x - a[0];
    const wy = y - a[1];
    const length = ex * ex + ey * ey;
    const t = length < 1e-9 ? 0 : Math.min(1, Math.max(0, (wx * ex + wy * ey) / length));
    return Math.hypot(wx - ex * t, wy - ey * t);
}
export function inkStroke(sheet, points, width, colour, alpha = 1, softness = 1) {
    if (points.length < 2)
        return;
    const radius = width / 2;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [px, py] of points) {
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
    }
    const box = { x0: x0 - radius - 2, y0: y0 - radius - 2, x1: x1 + radius + 2, y1: y1 + radius + 2 };
    inkShape(sheet, box, (x, y) => {
        let nearest = Infinity;
        for (let i = 1; i < points.length; i += 1) {
            nearest = Math.min(nearest, distanceToSegment(x, y, points[i - 1], points[i]));
        }
        return nearest - radius;
    }, colour, alpha, softness);
}
export function inkPolygon(sheet, points, colour, alpha = 1, softness = 1) {
    if (points.length < 3)
        return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [px, py] of points) {
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
    }
    inkShape(sheet, { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 }, (x, y) => {
        let nearest = Infinity;
        let inside = 1;
        for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
            const a = points[i];
            const b = points[j];
            nearest = Math.min(nearest, distanceToSegment(x, y, a, b));
            const crossesRow = (y >= a[1]) !== (y >= b[1]);
            if (crossesRow) {
                const at = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
                if (x < at)
                    inside = -inside;
            }
        }
        return inside < 0 ? -nearest : nearest;
    }, colour, alpha, softness);
}
export function inkRect(sheet, box, colour, alpha = 1, softness = 1) {
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const hx = (box.x1 - box.x0) / 2;
    const hy = (box.y1 - box.y0) / 2;
    inkShape(sheet, { x0: box.x0 - 2, y0: box.y0 - 2, x1: box.x1 + 2, y1: box.y1 + 2 }, (x, y) => {
        const dx = Math.abs(x - cx) - hx;
        const dy = Math.abs(y - cy) - hy;
        return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
    }, colour, alpha, softness);
}
export { LETTER_ASPECT, wordStrokes };
export function inkWord(sheet, word, origin, height, weight, colour, options = {}) {
    const angle = options.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const stroke of wordStrokes(word, height, options)) {
        const placed = stroke.map(([px, py]) => ([origin[0] + px * cos - py * sin, origin[1] + px * sin + py * cos]));
        inkStroke(sheet, placed, weight, colour, options.alpha ?? 1);
    }
}
export function inkWordLength(word, height, tracking = 0.16) {
    return wordLength(word, height, tracking);
}
export function inkRaster(sheet, box, raster, base) {
    const x0 = Math.max(0, Math.floor(box.x0));
    const y0 = Math.max(0, Math.floor(box.y0));
    const x1 = Math.min(sheet.width, Math.ceil(box.x1));
    const y1 = Math.min(sheet.height, Math.ceil(box.y1));
    const spanX = box.x1 - box.x0;
    const spanY = box.y1 - box.y0;
    if (spanX <= 0 || spanY <= 0)
        return;
    const scaleX = raster.width / spanX;
    const scaleY = raster.height / spanY;
    const guard = [Math.max(1e-4, base[0]), Math.max(1e-4, base[1]), Math.max(1e-4, base[2])];
    for (let y = y0; y < y1; y += 1) {
        const topEdge = (box.y1 - (y + 1)) * scaleY;
        const bottomEdge = (box.y1 - y) * scaleY;
        const sy0 = Math.max(0, Math.floor(topEdge));
        const sy1 = Math.min(raster.height, Math.ceil(bottomEdge));
        for (let x = x0; x < x1; x += 1) {
            const leftEdge = (x - box.x0) * scaleX;
            const rightEdge = (x + 1 - box.x0) * scaleX;
            const sx0 = Math.max(0, Math.floor(leftEdge));
            const sx1 = Math.min(raster.width, Math.ceil(rightEdge));
            let weight = 0;
            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            for (let sy = sy0; sy < sy1; sy += 1) {
                const coverY = Math.min(bottomEdge, sy + 1) - Math.max(topEdge, sy);
                if (coverY <= 0)
                    continue;
                const row = sy * raster.width * 4;
                for (let sx = sx0; sx < sx1; sx += 1) {
                    const coverX = Math.min(rightEdge, sx + 1) - Math.max(leftEdge, sx);
                    if (coverX <= 0)
                        continue;
                    const area = coverX * coverY;
                    const i = row + sx * 4;
                    const a = raster.rgba[i + 3] / 255;
                    const share = area * a;
                    red += LINEAR_BYTE[raster.rgba[i]] * share;
                    green += LINEAR_BYTE[raster.rgba[i + 1]] * share;
                    blue += LINEAR_BYTE[raster.rgba[i + 2]] * share;
                    alpha += share;
                    weight += area;
                }
            }
            if (weight <= 0 || alpha <= 0)
                continue;
            const coverage = alpha / weight;
            blend(sheet, x, y, [
                Math.min(1, red / alpha / guard[0]),
                Math.min(1, green / alpha / guard[1]),
                Math.min(1, blue / alpha / guard[2]),
            ], coverage);
        }
    }
}
export function toSrgbBytes(sheet) {
    const encode = (channel) => {
        const clamped = Math.min(1, Math.max(0, channel));
        const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
        return Math.round(srgb * 255);
    };
    const bytes = new Uint8Array(sheet.width * sheet.height * 4);
    for (let i = 0, j = 0; i < sheet.data.length; i += 3, j += 4) {
        const r = sheet.data[i], g = sheet.data[i + 1], b = sheet.data[i + 2];
        if (r === g && g === b) {
            bytes[j] = bytes[j + 1] = bytes[j + 2] = encode(r);
        }
        else {
            bytes[j] = encode(r);
            bytes[j + 1] = encode(g);
            bytes[j + 2] = encode(b);
        }
        bytes[j + 3] = 255;
    }
    return bytes;
}
export function inkSample(sheet, x, y) {
    const cx = Math.min(sheet.width - 1, Math.max(0, Math.round(x)));
    const cy = Math.min(sheet.height - 1, Math.max(0, Math.round(y)));
    const i = (cy * sheet.width + cx) * 3;
    return [sheet.data[i], sheet.data[i + 1], sheet.data[i + 2]];
}
