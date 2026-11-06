// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/maribelHair.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS } from '../data/tuning.js';
const ROWS = 22;
const COLUMNS = 65;
const MARK = new THREE.Color(BLOCKOUT_COLOURS.maribelMark);
const ROOT = new THREE.Color(BLOCKOUT_COLOURS.maribelHair);
const BLONDE = new THREE.Color(0xd3c6b0);
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const cubic = (a, b, c, d, t) => (b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a))));
function buffers() { return { position: [], colour: [], uv: [], index: [] }; }
function geometry(b) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.colour, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.index);
    g.computeVertexNormals();
    return g;
}
function colour(b, blonde, shade = 1) {
    const amount = clamp(blonde);
    b.colour.push(lerp(ROOT.r, BLONDE.r, amount) * shade / MARK.r, lerp(ROOT.g, BLONDE.g, amount) * shade / MARK.g, lerp(ROOT.b, BLONDE.b, amount) * shade / MARK.b);
}
export function sculptMaribelHair(envelope) {
    const source = envelope.getAttribute('position');
    const oldColumns = 13;
    const oldRows = source.count / 2 / oldColumns;
    const sample = (u, v, side) => {
        const x = clamp(u) * (oldColumns - 1), y = clamp(v) * (oldRows - 1);
        const column = Math.floor(x), row = Math.floor(y);
        const value = (r, c, axis) => {
            const i = side * oldRows * oldColumns
                + Math.max(0, Math.min(oldRows - 1, r)) * oldColumns
                + Math.max(0, Math.min(oldColumns - 1, c));
            return source.getComponent(i, axis);
        };
        const at = (axis) => {
            const rowAt = (r) => cubic(value(r, column - 1, axis), value(r, column, axis), value(r, column + 1, axis), value(r, column + 2, axis), x - column);
            return cubic(rowAt(row - 1), rowAt(row), rowAt(row + 1), rowAt(row + 2), y - row);
        };
        return new THREE.Vector3(at(0), at(1), at(2)
            + (side === 1 ? .006 * Math.sin(clamp(v) * Math.PI) : 0));
    };
    try {
        const base = buffers();
        for (let side = 0; side < 2; side++) {
            for (let row = 0; row < ROWS; row++) {
                const v = row / (ROWS - 1);
                for (let col = 0; col < COLUMNS; col++) {
                    const u = col / (COLUMNS - 1);
                    const wave = Math.sin(v * 7.8 - .4) * Math.sin(v * Math.PI);
                    const flowingU = u + .042 * wave * Math.sin(u * Math.PI);
                    const phase = u * 6 + .34 * wave + .045 * Math.sin(u * 9 + v * 5);
                    const lock = Math.min(5, Math.floor(phase));
                    const across = phase - Math.floor(phase);
                    const crest = (.5 - .5 * Math.cos(across * Math.PI * 2)) ** 1.25;
                    const end = .87 + .10 * (.5 - .5 * Math.cos(u * Math.PI * 12 + .5)) ** 1.5;
                    const sampleV = v - (1 - end) * smooth((v - .55) / .45);
                    const p = sample(flowingU, sampleV, side);
                    const rootFade = smooth(v * 6);
                    const tipsFade = (.25 + .75 * Math.sin(v * Math.PI) ** .7)
                        * (1 - smooth((v - .82) / .18));
                    const middleZ = (sample(flowingU, sampleV, 0).z + sample(flowingU, sampleV, 1).z) / 2;
                    p.z = lerp(p.z, middleZ + (side === 0 ? .0012 : -.0012), smooth((v - .78) / .22));
                    if (side === 1)
                        p.z -= (.001 + .009 * crest) * rootFade * tipsFade;
                    base.position.push(p.x, p.y, p.z);
                    base.uv.push(u, 1 - v);
                    const bleach = [.96, .42, .66, .36, .78, .98][Math.max(0, lock)];
                    const onset = [.16, .32, .24, .36, .20, .12][Math.max(0, lock)];
                    const ribbon = .22 + .78 * Math.exp(-(((across - .53) / .25) ** 2));
                    colour(base, smooth((v - onset) / .48) * bleach * ribbon, (.87 + .13 * rootFade) * (side === 1 ? 1 : .85));
                }
            }
        }
        const surface = ROWS * COLUMNS;
        for (let side = 0; side < 2; side++) {
            for (let r = 0; r < ROWS - 1; r++)
                for (let c = 0; c < COLUMNS - 1; c++) {
                    const a = side * surface + r * COLUMNS + c, b = a + 1, d = a + COLUMNS, e = d + 1;
                    if (side === 0)
                        base.index.push(a, d, b, b, d, e);
                    else
                        base.index.push(a, b, d, b, e, d);
                }
        }
        const close = (a, b) => {
            base.index.push(a, a + surface, b, b, a + surface, b + surface);
        };
        for (let c = 0; c < COLUMNS - 1; c++) {
            close(c + 1, c);
            close((ROWS - 1) * COLUMNS + c, (ROWS - 1) * COLUMNS + c + 1);
        }
        for (let r = 0; r < ROWS - 1; r++) {
            close(r * COLUMNS, (r + 1) * COLUMNS);
            close((r + 2) * COLUMNS - 1, (r + 1) * COLUMNS - 1);
        }
        return geometry(base);
    }
    finally {
        envelope.dispose();
    }
}
