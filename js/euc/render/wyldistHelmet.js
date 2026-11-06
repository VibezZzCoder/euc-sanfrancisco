// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/wyldistHelmet.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
import { BLOCKOUT_COLOURS as C } from '../data/tuning.js';
import { loftGeometry, loftProfile, mergeGeometries, shaded, tintOver, vAtHeight, } from './blockoutKit.js';
import { wyldistScoopOutline, wyldistSpoilerArc, wyldistSpoilerHalfWidth } from './wyldistAtlas.js';
const profile = (rows, square = 2.3) => loftProfile(rows.map(([y, halfWidth, halfDepth, z = 0, x = 0]) => ({
    y: y, halfWidth: halfWidth, halfDepth: halfDepth, z, x, square,
})));
const TAU = Math.PI * 2, RADIAL = 32;
const DOME = Object.freeze({ hw: .146, hd: .159, mid: .190, top: .356, base: .070 });
export const WYLDIST_HEAD_SCALE = .88;
export const WYLDIST_HEAD_NAPE = Object.freeze({ y: .070, z: -.079 });
const NAPE = WYLDIST_HEAD_NAPE;
const toHead = (v, i) => i % 3 === 0 ? v * WYLDIST_HEAD_SCALE : i % 3 === 1 ? NAPE.y + (v - NAPE.y) * WYLDIST_HEAD_SCALE : NAPE.z + (v - NAPE.z) * WYLDIST_HEAD_SCALE;
function shrink(g) {
    const p = g.getAttribute('position'), a = p.array;
    for (let i = 0; i < a.length; i++)
        a[i] = toHead(a[i], i);
    p.needsUpdate = true;
    return g;
}
function meridian(y) {
    if (y >= DOME.mid) {
        const u = Math.min(1, (y - DOME.mid) / (DOME.top - DOME.mid)), k = Math.max(.001 / DOME.hw, Math.max(0, 1 - u ** 2.4) ** (1 / 2.4));
        return { hw: DOME.hw * k, hd: DOME.hd * k, z: .005 - .014 * u ** 1.5 };
    }
    const u = (DOME.mid - y) / (DOME.mid - DOME.base);
    return { hw: DOME.hw * Math.max(0, 1 - (u * .716) ** 2.4) ** (1 / 2.4), hd: DOME.hd * Math.max(0, 1 - (u * .843) ** 2.4) ** (1 / 2.4), z: .005 + .017 * u ** 1.5 };
}
const ROWS = [.070, .076, .090, .106, .121, .130, .140, .152, .172, .195, .210, .218, .224, .228, .248, .274, .300, .322, .339, .351, .356];
export const WYLDIST_HELMET = loftProfile(ROWS.map((y) => { const m = meridian(y); return { y, halfWidth: m.hw, halfDepth: m.hd, z: m.z, x: 0, square: 2.35 }; }));
const PORT = [0, 0, 0, 0, 0, .050, .060, .070, .088, .096, .096, .086, .064];
export const WYLDIST_HELMET_OPENINGS = WYLDIST_HELMET.map((ring, r) => (PORT[r] ?? 0) > 0
    ? Math.asin(Math.min(1, (PORT[r] / ring.halfWidth) ** (ring.square / 2))) : 0);
export const WYLDIST_NECK = profile([[-.034, .080, .072], [0, .072, .066, .004], [.035, .067, .061, .010],
    [.070, .064, .057, .016], [.120, .058, .051, .022]]);
export const WYLDIST_HELMET_SHEET = Object.freeze({
    head: WYLDIST_HELMET,
    visor: Object.freeze({ halfSpan: Math.max(...WYLDIST_HELMET_OPENINGS), from: .121, to: .228 }), rimTop: .097,
    headOpenings: WYLDIST_HELMET_OPENINGS,
});
function tint(g, base, target, scale = 1) {
    const colour = g.getAttribute('color'), ratio = tintOver(base, target, scale);
    for (let i = 0; i < colour.count; i++)
        colour.setXYZ(i, ...ratio);
    return g;
}
const liftAt = (y) => { const t = Math.min(1, Math.max(0, (y - .070) / .075)); return 1 - t * t * (3 - 2 * t); };
const prowDepth = (y) => .024 * Math.exp(-(((y - .120) / .035) ** 2));
const OUTER = WYLDIST_HELMET.map((ring, r) => ({ y: ring.y, hw: ring.halfWidth, hd: ring.halfDepth, z: ring.z,
    sq: ring.square, open: WYLDIST_HELMET_OPENINGS[r], lift: liftAt(ring.y), prow: prowDepth(ring.y), cheek: true }));
OUTER[OUTER.length - 1] = { ...OUTER.at(-1), hw: 0, hd: 0 };
function crown(y, k) {
    const r = meridian(y);
    return { y, hw: r.hw * k, hd: r.hd * k, z: r.z, sq: 2.35, open: 0, lift: 0, prow: 0 };
}
const lined = (r) => {
    const s = OUTER[r], k = s.y >= .215 || s.y <= .13 ? .92 : .88;
    return { ...s, hw: s.hw * k, hd: s.hd * k, prow: s.prow * .8, pad: true };
};
const PORT_FIRST = OUTER.findIndex(s => s.open > 0) - 1, PORT_LAST = OUTER.length - 1 - [...OUTER].reverse().findIndex(s => s.open > 0) + 1;
OUTER[PORT_FIRST] = { ...OUTER[PORT_FIRST], dip: .0235 };
OUTER[PORT_FIRST - 1] = { ...OUTER[PORT_FIRST - 1], dip: .009 };
const INNER = [{ y: .334, hw: 0, hd: 0, z: -.008, sq: 2.35, open: 0, lift: 0, prow: 0 },
    { y: .322, hw: .060, hd: .068, z: -.006, sq: 2.35, open: 0, lift: 0, prow: 0 }, crown(.300, .88), crown(.264, .91),
    ...Array.from({ length: PORT_LAST - PORT_FIRST + 1 }, (_, k) => lined(PORT_LAST - k)),
    { y: .086, hw: .118, hd: .120, z: .030, sq: 2.35, open: 0, lift: .9, prow: 0 },
    { y: .092, hw: .066, hd: .060, z: .019, sq: 2.3, open: 0, lift: .9, prow: 0 }];
const ROLL = [{ y: .082, hw: .092, hd: .081, z: .020, sq: 2.35, open: 0, lift: 1, prow: .004 },
    { y: .074, hw: .106, hd: .091, z: .021, sq: 2.35, open: 0, lift: 1, prow: .010 }];
const EDGE = [[0, .045], [.5, .046], [1.1, .080], [1.6, .084], [2.1, .083], [2.7, .078], [Math.PI, .070]];
function baseLift(phi) {
    const a = Math.abs(phi > Math.PI ? phi - TAU : phi);
    for (let i = 1; i < EDGE.length; i++) {
        const [p0, y0] = EDGE[i - 1], [p1, y1] = EDGE[i];
        if (a <= p1) {
            const t = (a - p0) / (p1 - p0);
            return y0 + (y1 - y0) * t * t * (3 - 2 * t) - EDGE.at(-1)[1];
        }
    }
    return 0;
}
const prowAt = (phi) => Math.max(0, 1 - Math.abs(phi > Math.PI ? phi - TAU : phi) / .95) ** 1.7;
const phiOf = (s, c) => s.open + (TAU - 2 * s.open) * c / RADIAL;
const NORMAL = new THREE.Vector3();
function place(s, phi, out) {
    const u = Math.PI / 2 + phi, e = 2 / s.sq, cu = Math.cos(u), su = Math.sin(u), wrapped = phi > Math.PI ? phi - TAU : phi;
    return out.set(s.hw * Math.sign(cu) * Math.abs(cu) ** e, s.y + s.lift * baseLift(phi) - (s.dip ?? 0) * Math.max(0, 1 - Math.abs(wrapped) / .30) ** 2, s.z + s.hd * Math.sign(su) * Math.abs(su) ** e + s.prow * prowAt(wrapped) + (s.cheek ? cheekWall(s.y, wrapped) : 0));
}
function cheekWall(y, phi) {
    const a = Math.abs(phi), w = Math.max(0, 1 - ((a - .4) / .45) ** 2);
    return .013 * Math.exp(-(((y - .150) / .022) ** 2)) * w;
}
function stationPoints(s) {
    const out = [], p = new THREE.Vector3();
    for (let c = 0; c <= RADIAL; c++) {
        place(s, s.open + (TAU - 2 * s.open) * c / RADIAL, p);
        if (s.pad && s.open > 0 && (c === 0 || c === RADIAL)) {
            p.x = Math.sign(p.x) * (faceHalfWidth(p.y) - .008);
            p.z = faceZ(p.x, p.y) + .010;
        }
        out.push(p.x, p.y, p.z);
    }
    return out;
}
function outerNormal(y, phi, out) {
    const at = (h, f, o) => {
        const m = meridian(h);
        return place({ y: h, hw: m.hw, hd: m.hd, z: m.z, sq: 2.35, open: 0, lift: liftAt(h), prow: prowDepth(h), cheek: true }, f, o);
    };
    const d = 1e-4, A = new THREE.Vector3(), B = new THREE.Vector3(), rows = new THREE.Vector3(), round = new THREE.Vector3();
    rows.subVectors(at(Math.min(DOME.top, y + d), phi, A), at(Math.max(DOME.base, y - d), phi, B));
    round.subVectors(at(y, phi + d, A), at(y, phi - d, B));
    out.crossVectors(rows.normalize(), round.normalize());
    return out.lengthSq() < 1e-10 ? out.set(0, 1, 0) : out.normalize();
}
function sheet(stations, points, v) {
    const positions = [], uv = [], index = [], cols = RADIAL + 1;
    points.forEach((ring, i) => { positions.push(...ring); for (let c = 0; c < cols; c++)
        uv.push(v ? c / RADIAL : .001, v ? v(i) : .001); });
    for (let i = 0; i < stations.length - 1; i++)
        for (let c = 0; c < RADIAL; c++) {
            const p = i * cols + c, q = p + cols;
            if (stations[i + 1].hw > 0)
                index.push(p, q, q + 1);
            if (stations[i].hw > 0)
                index.push(p, q + 1, p + 1);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    shaded(g);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    stations.forEach((s, i) => {
        const ids = s.hw === 0 ? Array.from({ length: cols }, (_, c) => i * cols + c) : s.open === 0 ? [i * cols, i * cols + RADIAL] : [];
        if (!ids.length)
            return;
        const sum = new THREE.Vector3();
        for (const id of ids)
            sum.add(NORMAL.fromBufferAttribute(n, id));
        sum.normalize();
        for (const id of ids)
            n.setXYZ(id, sum.x, sum.y, sum.z);
    });
    return g;
}
function portWalls(outer, inner) {
    const positions = [], index = [], at = (ring, c) => ring.slice(c * 3, c * 3 + 3);
    for (let r = PORT_FIRST; r < PORT_LAST; r++) {
        const o0 = outer[r], o1 = outer[r + 1], i0 = inner[r - PORT_FIRST], i1 = inner[r - PORT_FIRST + 1];
        for (const c of [0, RADIAL]) {
            const base = positions.length / 3;
            positions.push(...at(o0, c), ...at(o1, c), ...at(i1, c), ...at(i0, c));
            if (c === 0)
                index.push(base + 1, base, base + 3, base + 1, base + 3, base + 2);
            else
                index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(.001), 2));
    g.setIndex(index);
    shaded(g);
    g.computeVertexNormals();
    return g;
}
function spoiler() {
    const { centre, drop, halfSpan, ends } = wyldistSpoilerArc(WYLDIST_HELMET[0].y, WYLDIST_HELMET.at(-1).y), steps = 24, h = 1e-4;
    const surface = (x, y) => { const r = meridian(y); return r.z - r.hd * Math.max(0, 1 - Math.min(1, Math.abs(x) / r.hw) ** 2.35) ** (1 / 2.35); };
    const rails = [[], [], [], []], along = [];
    for (let i = 0; i <= steps; i++) {
        const t = -ends + 2 * ends * i / steps, x = halfSpan * Math.sin(t), y = centre + drop * Math.cos(t), z = surface(x, y), f = Math.abs(t / ends);
        const fx = (surface(x + h, y) - surface(x - h, y)) / (2 * h), fy = (surface(x, y + h) - surface(x, y - h)) / (2 * h);
        const normal = new THREE.Vector3(fx, fy, -1).normalize(), dx = halfSpan * Math.cos(t), dy = -drop * Math.sin(t);
        const tangent = new THREE.Vector3(dx, dy, fx * dx + fy * dy).normalize(), across = new THREE.Vector3().crossVectors(tangent, normal);
        const p = new THREE.Vector3(x, y, z), top = .007 * (1 - f ** 6), half = wyldistSpoilerHalfWidth(t);
        rails[0].push(p.clone().addScaledVector(normal, top).addScaledVector(across, half));
        rails[1].push(p.clone().addScaledVector(normal, top).addScaledVector(across, -half));
        rails[2].push(p.clone().addScaledVector(normal, -.004).addScaledVector(across, -half));
        rails[3].push(p.clone().addScaledVector(normal, -.004).addScaledVector(across, half));
        along.push(tangent);
    }
    const positions = [], index = [];
    const face = (corners, outward) => {
        const base = positions.length / 3, n = corners[0].length;
        for (const line of corners)
            for (const p of line)
                positions.push(p.x, p.y, p.z);
        for (let k = 0; k < n - 1; k++) {
            const a = base + k, b = a + 1, c = base + n + k + 1, d = base + n + k;
            const e1 = corners[0][k + 1].clone().sub(corners[0][k]), e2 = corners[1][k].clone().sub(corners[0][k]);
            if (e1.cross(e2).dot(outward(k)) > 0)
                index.push(a, b, c, a, c, d);
            else
                index.push(a, c, b, a, d, c);
        }
    };
    for (let side = 0; side < 4; side++) {
        const next = (side + 1) % 4;
        face([rails[side], rails[next]], k => rails[side][k].clone().add(rails[next][k]).sub(rails[(side + 2) % 4][k]).sub(rails[(side + 3) % 4][k]));
    }
    for (const [i, sign] of [[0, -1], [steps, 1]])
        face([[rails[0][i], rails[3][i]], [rails[1][i], rails[2][i]]], () => along[i].clone().multiplyScalar(sign));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(0).map((_, i) => i % 2 ? .02 : .5), 2));
    g.setIndex(index);
    shaded(g);
    g.computeVertexNormals();
    return g;
}
function scoopInsert(side) {
    const outline = wyldistScoopOutline(WYLDIST_HELMET_SHEET.visor.to), cx = outline.reduce((a, p) => a + p[0], 0) / 4, cy = outline.reduce((a, p) => a + p[1], 0) / 4;
    const corner = outline.map(([x, y]) => [cx + (x - cx) * .84, cy + (y - cy) * .84]);
    const surface = (x, y) => { const m = meridian(y); return m.z + m.hd * Math.max(0, 1 - Math.min(1, Math.abs(x) / m.hw) ** 2.35) ** (1 / 2.35); };
    const N = 3, positions = [], index = [], h = 1e-4, P = new THREE.Vector3(), Nn = new THREE.Vector3();
    const grid = (lift) => {
        const base = positions.length / 3;
        for (let j = 0; j <= N; j++)
            for (let i = 0; i <= N; i++) {
                const u = i / N, v = j / N, [a, b, c, d] = corner;
                const x = (a[0] * (1 - u) + b[0] * u) * (1 - v) + (d[0] * (1 - u) + c[0] * u) * v, y = (a[1] * (1 - u) + b[1] * u) * (1 - v) + (d[1] * (1 - u) + c[1] * u) * v;
                const z = surface(x, y);
                Nn.set(-(surface(x + h, y) - surface(x - h, y)) / (2 * h), -(surface(x, y + h) - surface(x, y - h)) / (2 * h), 1).normalize();
                P.set(side * x, y, z).addScaledVector(Nn.set(side * Nn.x, Nn.y, Nn.z), lift);
                positions.push(P.x, P.y, P.z);
            }
        return base;
    };
    const top = grid(.0010), bottom = grid(-.0030), at = (base, i, j) => base + j * (N + 1) + i;
    const quad = (a, b, c, d, flip) => flip ? index.push(a, c, b, a, d, c) : index.push(a, b, c, a, c, d);
    const outward = side > 0;
    for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
            quad(at(top, i, j), at(top, i + 1, j), at(top, i + 1, j + 1), at(top, i, j + 1), !outward);
            quad(at(bottom, i, j), at(bottom, i + 1, j), at(bottom, i + 1, j + 1), at(bottom, i, j + 1), outward);
        }
    const ring = [];
    for (let i = 0; i < N; i++)
        ring.push([i, 0]);
    for (let j = 0; j < N; j++)
        ring.push([N, j]);
    for (let i = N; i > 0; i--)
        ring.push([i, N]);
    for (let j = N; j > 0; j--)
        ring.push([0, j]);
    ring.forEach(([i, j], k) => {
        const [i2, j2] = ring[(k + 1) % ring.length];
        quad(at(top, i, j), at(bottom, i, j), at(bottom, i2, j2), at(top, i2, j2), !outward);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(.001), 2));
    g.setIndex(index);
    shaded(g);
    g.computeVertexNormals();
    return g;
}
function helmetParts() {
    const raw = OUTER.map(stationPoints), outer = raw.map(ring => ring.map(toHead));
    const inner = INNER.map((s, i) => i === INNER.length - 1 ? stationPoints(s) : stationPoints(s).map(toHead));
    const roll = ROLL.map((s, j) => stationPoints(s).map((v, i) => v + (outer[0][i] - raw[0][i]) * [.55, .85][j]));
    const rows = OUTER.length;
    const skin = sheet(OUTER, outer, i => i === 0 ? .065 : i / (rows - 1));
    const n = skin.getAttribute('normal'), colour = skin.getAttribute('color');
    OUTER.forEach((s, r) => {
        for (let c = 0; c <= RADIAL; c++) {
            const id = r * (RADIAL + 1) + c;
            if (s.hw === 0) {
                n.setXYZ(id, 0, 1, 0);
                continue;
            }
            outerNormal(s.y, phiOf(s, c), NORMAL);
            n.setXYZ(id, NORMAL.x, NORMAL.y, NORMAL.z);
            const fill = (1 + .50 * (1 - NORMAL.y) / 2) * (s.y < .13 ? 1 + .2 * prowAt(phiOf(s, c)) : 1);
            colour.setXYZ(id, fill, fill, fill);
        }
    });
    const shell = skin;
    const aligned = Array.from({ length: PORT_LAST - PORT_FIRST + 1 }, (_, k) => inner[INNER.length - 3 - k]);
    const rollSheet = sheet([INNER.at(-1), ...ROLL, OUTER[0]], [inner.at(-1), ...roll, outer[0]]);
    const rollColour = rollSheet.getAttribute('color');
    [2.6, 3.6, 4.2, 3.0].forEach((scale, station) => {
        const ratio = tintOver(C.wyldistGear, C.wyldistInk, scale);
        for (let c = 0; c <= RADIAL; c++)
            rollColour.setXYZ(station * (RADIAL + 1) + c, ...ratio);
    });
    const lining = mergeGeometries([
        tint(sheet(INNER, inner), C.wyldistGear, C.wyldistInk, .3),
        rollSheet,
        tint(portWalls(outer, aligned), C.wyldistGear, C.wyldistInk, .25),
        tint(shrink(spoiler()), C.wyldistGear, C.wyldistInk, .7),
        ...[-1, 1].map(side => tint(shrink(scoopInsert(side)), C.wyldistGear, C.wyldistInk, .5)),
    ]);
    return { shell, lining };
}
export function wyldistHelmetShell() { const { shell, lining } = helmetParts(); lining.dispose(); return shell; }
export function wyldistHelmetLining() { const { shell, lining } = helmetParts(); shell.dispose(); return lining; }
const FACE = loftProfile([
    [.100, .012, .012, .078, 2.4], [.105, .024, .024, .072, 2.6], [.112, .034, .032, .066, 2.8], [.122, .042, .039, .062, 2.8],
    [.134, .047, .044, .055, 2.6], [.146, .051, .047, .049, 2.4], [.158, .055, .050, .047, 2.3], [.170, .059, .052, .046, 2.2],
    [.182, .063, .053, .045, 2.1], [.194, .062, .053, .044, 2.1], [.206, .059, .052, .042, 2.1], [.222, .055, .049, .036, 2.1],
    [.240, .055, .044, .028, 2.1], [.256, .045, .035, .022, 2.1], [.268, .029, .022, .018, 2.1],
].map(([y, halfWidth, halfDepth, z, square]) => ({ y, halfWidth, halfDepth, z, square })));
const FACE_FIT = Object.freeze({ x: 1.28, y: 1.15, z: 1.1, eyes: .2005, forward: .044 });
const designY = (y) => FACE_FIT.eyes + (y - FACE_FIT.eyes) / FACE_FIT.y;
const G = (a, sa, b, sb) => Math.exp(-((a / sa) ** 2 + (b / sb) ** 2));
function relief(x, y) {
    const ax = Math.abs(x);
    return .005 * G(ax - .026, .014, y - .213, .007) + .010 * G(ax - .045, .014, y - .184, .012)
        - .007 * G(ax - .044, .012, y - .155, .013) - .0045 * G(ax - .026, .011, y - .200, .008)
        + .004 * G(x, .012, y - .108, .009) + .003 * G(x, .017, y - .146, .012) + .0015 * G(x, .010, y - .1418, .003);
}
function skinShade(x, y, front) {
    const ax = Math.abs(x), jaw = Math.min(1, Math.max(0, (ax - .040) / .016)) * Math.min(1, Math.max(0, (.150 - y) / .02));
    return 1.04 + .34 * G(ax - .045, .014, y - .185, .010) + .10 * G(x, .03, y - .235, .02) - .32 * G(ax - .046, .012, y - .155, .015)
        - .18 * G(ax - .026, .012, y - .201, .009) - .22 * jaw - .08 * G(x, .006, y - .1515, .007) - .38 * (1 - front) ** 1.2;
}
function ringOf(p, y) {
    const v = vAtHeight(p, y), i = Math.min(p.length - 2, Math.floor(v)), t = v - i, a = p[i], b = p[i + 1];
    const mix = (m, n) => m + (n - m) * t;
    return { hw: mix(a.halfWidth, b.halfWidth), hd: mix(a.halfDepth, b.halfDepth), z: mix(a.z, b.z), sq: mix(a.square, b.square) };
}
function designZ(x, y) {
    const r = ringOf(FACE, y), q = Math.min(1, Math.abs(x) / r.hw) ** r.sq;
    return r.z + r.hd * Math.max(0, 1 - q) ** (1 / r.sq) + relief(x, y);
}
const faceHalfWidth = (y) => FACE_FIT.x * ringOf(FACE, designY(y)).hw;
const faceZ = (x, y) => FACE_FIT.z * designZ(x / FACE_FIT.x, designY(y)) + FACE_FIT.forward;
function faceSurface() {
    const U = [];
    for (let i = 0; i < 16; i++)
        U.push(Math.PI / 2 - 1.75 + 3.5 * i / 16);
    for (let i = 0; i < 5; i++)
        U.push(Math.PI / 2 + 1.75 + (TAU - 3.5) * i / 5);
    const positions = [], colours = [], uv = [], index = [], p = new THREE.Vector3(), n = U.length;
    FACE.forEach((ring, r) => U.forEach((u, c) => {
        const e = 2 / ring.square, cu = Math.cos(u), su = Math.sin(u);
        p.set(ring.halfWidth * Math.sign(cu) * Math.abs(cu) ** e, ring.y, ring.z + ring.halfDepth * Math.sign(su) * Math.abs(su) ** e);
        const front = Math.max(0, su) ** 1.5;
        p.z += relief(p.x, p.y) * front;
        positions.push(p.x, p.y, p.z);
        const s = skinShade(p.x, p.y, Math.max(0, su));
        colours.push(s, s, s);
        uv.push(c / n, r / (FACE.length - 1));
    }));
    for (let r = 0; r < FACE.length - 1; r++)
        for (let c = 0; c < n; c++) {
            const a = r * n + c, b = r * n + (c + 1) % n, d = a + n, e = b + n;
            index.push(a, d, b, b, d, e);
        }
    for (const [r, up] of [[0, false], [FACE.length - 1, true]]) {
        const ring = FACE[r], centre = positions.length / 3;
        positions.push(0, ring.y, ring.z);
        colours.push(.8, .8, .8);
        uv.push(.5, up ? 1 : 0);
        for (let c = 0; c < n; c++) {
            const a = r * n + c, b = r * n + (c + 1) % n;
            if (up)
                index.push(centre, b, a);
            else
                index.push(centre, a, b);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
}
function ellipsoid(x, y, z, rx, ry, rz, target, w = 8, h = 5, yaw = 0) {
    return tint(shaded(new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).rotateY(yaw).translate(x, y, z)), C.wyldistSkin, target);
}
function cord(skin, points, radius, target, segments = 6) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, lift]) => new THREE.Vector3(x, y, skin(x, y) + lift)));
    const [a, m, b] = typeof radius === 'number' ? [radius, radius, radius] : radius;
    const tube = new THREE.TubeGeometry(curve, segments, 1, 4, false), p = tube.getAttribute('position'), centre = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
        const t = i / segments, r = t < .5 ? a + (m - a) * t * 2 : m + (b - m) * (t - .5) * 2;
        curve.getPointAt(t, centre);
        for (let j = 0; j <= 4; j++) {
            const id = i * 5 + j;
            v.fromBufferAttribute(p, id).sub(centre).multiplyScalar(r).add(centre);
            p.setXYZ(id, v.x, v.y, v.z);
        }
    }
    tube.computeVertexNormals();
    return tint(shaded(tube), C.wyldistSkin, target);
}
function ribbon(skin, points, half, lift, target, vertical = false) {
    const positions = [], index = [], n = points.length;
    for (let i = 0; i < n; i++)
        for (const sgn of [-1, 1]) {
            const [x, y] = points[i], ox = vertical ? sgn * half[i] : 0, oy = vertical ? 0 : sgn * half[i];
            positions.push(x + ox, y + oy, skin(x + ox, y + oy) + lift);
        }
    for (let i = 0; i < n - 1; i++) {
        const a = i * 2, b = a + 2, c = a + 3, d = a + 1;
        index.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(.5), 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return tint(shaded(g), C.wyldistSkin, target);
}
function goatee(skin, rows, lift, target) {
    const positions = [], index = [];
    for (const [y, half] of rows)
        for (const x of [-half, 0, half])
            positions.push(x, y, skin(x, y) + lift);
    for (let i = 0; i < rows.length - 1; i++)
        for (const c of [0, 1]) {
            const a = i * 3 + c, b = a + 3;
            index.push(a, b, b + 1, a, b + 1, a + 1);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(.5), 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return tint(shaded(g), C.wyldistSkin, target);
}
const HAIR = 0x5a3d2c, BEARD = 0x553420;
const LIP = 0xa0604c, MOUTH = 0x55302a;
export function wyldistFace() {
    const surface = faceSurface(), material = new THREE.MeshBasicMaterial(), probe = new THREE.Mesh(surface, material);
    const ray = new THREE.Raycaster(), from = new THREE.Vector3(), down = new THREE.Vector3(0, 0, -1);
    const skin = (x, y) => { ray.set(from.set(x, y, 1), down); return ray.intersectObject(probe, false)[0]?.point.z ?? designZ(x, y); };
    const parts = [surface];
    const nz = (y) => skin(0, y);
    const nose = loftGeometry(profile([[.1615, .0078, .0048, nz(.1615) + .0036], [.1640, .0104, .0070, nz(.1640) + .0060],
        [.1680, .0112, .0076, nz(.1680) + .0066], [.1730, .0102, .0070, nz(.1730) + .0060], [.1800, .0088, .0060, nz(.1800) + .0050],
        [.1900, .0072, .0046, nz(.1900) + .0034], [.1990, .0058, .0032, nz(.1990) + .0014], [.2090, .0044, .0024, nz(.2090)]], 2.4), { radialSegments: 12, shade: .94, capTop: false });
    const noseNormal = nose.getAttribute('normal'), soft = new THREE.Vector3();
    for (let i = 0; i < noseNormal.count; i++) {
        soft.fromBufferAttribute(noseNormal, i).add(new THREE.Vector3(0, .1, .7)).normalize();
        noseNormal.setXYZ(i, soft.x, soft.y, soft.z);
    }
    parts.push(nose);
    for (const side of [-1, 1]) {
        const ex = side * .024, ey = .2005, ez = skin(ex, ey) - .0008, yaw = side * .30, on = (depth) => [ex + Math.sin(yaw) * depth, ey - .0003, ez + Math.cos(yaw) * depth];
        parts.push(ellipsoid(side * .0064, .1622, nz(.1622) + .0062, .0025, .0014, .0020, 0x5a3a2c, 6, 4));
        parts.push(ellipsoid(ex, ey, ez, .0110, .0048, .0035, 0xdacdbd, 8, 5, yaw));
        parts.push(ellipsoid(...on(.0031), .0046, .0046, .0012, 0x6a3f24, 8, 4, yaw));
        parts.push(ellipsoid(...on(.0040), .0019, .0022, .0008, 0x15110e, 6, 4, yaw));
        parts.push(cord(skin, [[side * .0130, .2040, .0016], [side * .0240, .2053, .0018], [side * .0345, .2042, .0014]], .0011, 0x3a281e));
        parts.push(cord(skin, [[side * .0100, .2162, .0016], [side * .0265, .2172, .0020], [side * .0430, .2140, .0016]], [.0022, .0032, .0027], HAIR));
    }
    parts.push(ribbon(skin, [[-.0145, .1458], [-.0100, .1466], [-.0045, .1469], [0, .1469], [.0045, .1469], [.0100, .1466], [.0145, .1458]], [.0010, .0024, .0028, .0029, .0028, .0024, .0010], .0012, 0x6c4630));
    parts.push(cord(skin, [[-.0150, .1410], [0, .1416], [.0150, .1410]].map(([x, y]) => [x, y, .0009]), .0010, LIP));
    parts.push(cord(skin, [[-.0160, .1401, .0006], [0, .1396, .0008], [.0160, .1401, .0006]], .0007, MOUTH));
    parts.push(cord(skin, [[-.0130, .1385, .0008], [0, .1379, .0011], [.0130, .1385, .0008]], .0013, LIP));
    parts.push(goatee(skin, [[.1362, .0030], [.1335, .0034], [.1300, .0042], [.1264, .0057], [.1228, .0073],
        [.1196, .0084], [.1168, .0080], [.1146, .0064], [.1130, .0038], [.1120, .0010]], .0010, BEARD));
    material.dispose();
    const face = mergeGeometries(parts), p = face.getAttribute('position'), n = face.getAttribute('normal'), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, toHead(p.getX(i) * FACE_FIT.x, 0), toHead(FACE_FIT.eyes + (p.getY(i) - FACE_FIT.eyes) * FACE_FIT.y, 1), toHead(p.getZ(i) * FACE_FIT.z + FACE_FIT.forward, 2));
        v.set(n.getX(i) / FACE_FIT.x, n.getY(i) / FACE_FIT.y, n.getZ(i) / FACE_FIT.z).normalize();
        n.setXYZ(i, v.x, v.y, v.z);
    }
    return face;
}
