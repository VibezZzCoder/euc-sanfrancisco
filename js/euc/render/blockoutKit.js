// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/render/blockoutKit.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
import * as THREE from '../../../vendor/three/build/three.core.js';
export function loftProfile(rings) {
    if (rings.length < 2)
        throw new Error('a loft profile needs at least two rings');
    const ordered = rings[0].y <= rings[rings.length - 1].y ? rings : [...rings].reverse();
    const resolved = ordered.map((ring) => ({
        y: ring.y,
        halfWidth: ring.halfWidth,
        halfDepth: ring.halfDepth,
        z: ring.z ?? 0,
        x: ring.x ?? 0,
        square: ring.square ?? 2,
    }));
    for (let i = 1; i < resolved.length; i += 1) {
        if (!(resolved[i].y > resolved[i - 1].y)) {
            throw new Error(`loft ring ${i} does not rise above ring ${i - 1}`);
        }
    }
    return resolved;
}
function ringAt(profile, v) {
    const last = profile.length - 1;
    const clamped = Math.min(Math.max(v, 0), last);
    const index = Math.min(Math.floor(clamped), last - 1);
    const f = clamped - index;
    const a = profile[index];
    const b = profile[index + 1];
    return {
        y: a.y + (b.y - a.y) * f,
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * f,
        halfDepth: a.halfDepth + (b.halfDepth - a.halfDepth) * f,
        z: a.z + (b.z - a.z) * f,
        x: a.x + (b.x - a.x) * f,
        square: a.square + (b.square - a.square) * f,
    };
}
export function vAtHeight(profile, y) {
    const last = profile.length - 1;
    if (y <= profile[0].y)
        return 0;
    if (y >= profile[last].y)
        return last;
    for (let i = 1; i <= last; i += 1) {
        const above = profile[i];
        if (y <= above.y) {
            const below = profile[i - 1];
            return i - 1 + (y - below.y) / (above.y - below.y);
        }
    }
    return last;
}
export function loftPoint(profile, u, v, out) {
    const ring = ringAt(profile, v);
    const e = 2 / ring.square;
    const c = Math.cos(u);
    const s = Math.sin(u);
    return out.set(ring.x + ring.halfWidth * Math.sign(c) * Math.abs(c) ** e, ring.y, ring.z + ring.halfDepth * Math.sign(s) * Math.abs(s) ** e);
}
const NORMAL_TANGENT_U = new THREE.Vector3();
const NORMAL_TANGENT_V = new THREE.Vector3();
const NORMAL_SAMPLE_A = new THREE.Vector3();
const NORMAL_SAMPLE_B = new THREE.Vector3();
export function loftNormal(profile, u, v, out) {
    const du = 1e-3;
    const dv = 1e-3;
    const last = profile.length - 1;
    loftPoint(profile, u + du, v, NORMAL_SAMPLE_A);
    loftPoint(profile, u - du, v, NORMAL_SAMPLE_B);
    NORMAL_TANGENT_U.subVectors(NORMAL_SAMPLE_A, NORMAL_SAMPLE_B);
    const vHigh = Math.min(v + dv, last);
    const vLow = Math.max(v - dv, 0);
    loftPoint(profile, u, vHigh, NORMAL_SAMPLE_A);
    loftPoint(profile, u, vLow, NORMAL_SAMPLE_B);
    NORMAL_TANGENT_V.subVectors(NORMAL_SAMPLE_A, NORMAL_SAMPLE_B);
    out.crossVectors(NORMAL_TANGENT_V, NORMAL_TANGENT_U);
    const length = out.length();
    if (length < 1e-9)
        return out.set(0, v > (last - v) ? 1 : -1, 0);
    return out.multiplyScalar(1 / length);
}
function isPole(ring) {
    return ring.halfWidth < 1e-4 && ring.halfDepth < 1e-4;
}
export function loftGeometry(profile, options = {}) {
    const radial = Math.max(3, Math.round(options.radialSegments ?? 16));
    const subdivisions = Math.max(0, Math.round(options.subdivisions ?? 0));
    const shade = options.shade ?? 1;
    const splitSeam = options.splitSeam ?? false;
    const columns = splitSeam ? radial + 1 : radial;
    const rows = [];
    for (let i = 0; i < profile.length - 1; i += 1) {
        for (let s = 0; s <= subdivisions; s += 1)
            rows.push(i + s / (subdivisions + 1));
    }
    rows.push(profile.length - 1);
    const positions = [];
    const colours = [];
    const uvs = [];
    const indices = [];
    const point = new THREE.Vector3();
    const bottomPole = isPole(profile[0]);
    const topPole = isPole(profile[profile.length - 1]);
    const vSpan = Math.max(1e-6, profile.length - 1);
    for (const v of rows) {
        for (let i = 0; i < columns; i += 1) {
            loftPoint(profile, (i / radial) * Math.PI * 2, v, point);
            positions.push(point.x, point.y, point.z);
            colours.push(shade, shade, shade);
            uvs.push(i / radial, v / vSpan);
        }
    }
    const at = (row, i) => row * columns + (splitSeam ? i : i % radial);
    for (let row = 0; row < rows.length - 1; row += 1) {
        for (let i = 0; i < radial; i += 1) {
            const a = at(row, i);
            const b = at(row, i + 1);
            const c = at(row + 1, i + 1);
            const d = at(row + 1, i);
            indices.push(a, d, b, b, d, c);
        }
    }
    const fan = (row, ring, upward) => {
        if (isPole(ring))
            return;
        const centre = positions.length / 3;
        positions.push(ring.x, ring.y, ring.z);
        colours.push(shade, shade, shade);
        uvs.push(0.5, upward ? 1 : 0);
        for (let i = 0; i < radial; i += 1) {
            const a = at(row, i);
            const b = at(row, i + 1);
            if (upward)
                indices.push(centre, b, a);
            else
                indices.push(centre, a, b);
        }
    };
    if ((options.capBottom ?? true) && !bottomPole)
        fan(0, profile[0], false);
    if ((options.capTop ?? true) && !topPole)
        fan(rows.length - 1, profile[profile.length - 1], true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    if (splitSeam) {
        const normal = geometry.getAttribute('normal');
        for (let row = 0; row < rows.length; row += 1) {
            const a = at(row, 0);
            const b = at(row, radial);
            const x = normal.getX(a) + normal.getX(b);
            const y = normal.getY(a) + normal.getY(b);
            const z = normal.getZ(a) + normal.getZ(b);
            const length = Math.hypot(x, y, z) || 1;
            normal.setXYZ(a, x / length, y / length, z / length);
            normal.setXYZ(b, x / length, y / length, z / length);
        }
        normal.needsUpdate = true;
    }
    return geometry;
}
export function patchGeometry(profile, options) {
    const uSegments = Math.max(1, Math.round(options.uSegments ?? 8));
    const vSegments = Math.max(1, Math.round(options.vSegments ?? 4));
    const lift = options.lift ?? 0.01;
    const sink = options.sink ?? -0.006;
    const skew = options.skew ?? 0;
    const taper = options.taper ?? 0;
    const bulge = options.bulge ?? 0;
    const bow = options.bow ?? 0;
    const shade = options.shade ?? 1;
    const positions = [];
    const colours = [];
    const uvs = [];
    const indices = [];
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const push = (u, v, offset, s, t) => {
        const index = positions.length / 3;
        loftPoint(profile, u, v, point);
        loftNormal(profile, u, v, normal);
        positions.push(point.x + normal.x * offset, point.y + normal.y * offset, point.z + normal.z * offset);
        colours.push(shade, shade, shade);
        uvs.push(s, t);
        return index;
    };
    const uAt = (() => {
        if (!options.uByArc)
            return (s) => options.u0 + (options.u1 - options.u0) * s;
        const steps = 192;
        const vMid = (options.v0 + options.v1) / 2;
        const arcs = new Float64Array(steps + 1);
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        loftPoint(profile, options.u0, vMid, a);
        for (let k = 1; k <= steps; k += 1) {
            loftPoint(profile, options.u0 + (options.u1 - options.u0) * (k / steps), vMid, b);
            arcs[k] = arcs[k - 1] + a.distanceTo(b);
            a.copy(b);
        }
        const total = arcs[steps];
        const arcBetween = (ua, ub) => {
            loftPoint(profile, ua, vMid, a);
            let length = 0;
            for (let k = 1; k <= 24; k += 1) {
                loftPoint(profile, ua + (ub - ua) * (k / 24), vMid, b);
                length += a.distanceTo(b);
                a.copy(b);
            }
            return length;
        };
        return (s) => {
            const target = Math.min(1, Math.max(0, s)) * total;
            let k = 1;
            while (k < steps && arcs[k] < target)
                k += 1;
            const ua = options.u0 + (options.u1 - options.u0) * ((k - 1) / steps);
            const ub = options.u0 + (options.u1 - options.u0) * (k / steps);
            let low = ua;
            let high = ub;
            for (let it = 0; it < 16; it += 1) {
                const mid = (low + high) / 2;
                if (arcs[k - 1] + arcBetween(ua, mid) < target)
                    low = mid;
                else
                    high = mid;
            }
            return (low + high) / 2;
        };
    })();
    const coords = (s, t) => {
        const u = uAt(s);
        const middle = 1 - Math.abs(s - 0.5) * 2;
        const centre = (options.v0 + options.v1) / 2 + skew * (s - 0.5) + bow * middle;
        const halfSpan = ((options.v1 - options.v0) / 2)
            * (1 - taper * Math.abs(s - 0.5) * 2)
            * (1 + bulge * middle);
        return [u, centre + halfSpan * (t * 2 - 1)];
    };
    const outer = [];
    const inner = [];
    for (let i = 0; i <= uSegments; i += 1) {
        const outerRow = [];
        const innerRow = [];
        for (let j = 0; j <= vSegments; j += 1) {
            const s = i / uSegments;
            const t = j / vSegments;
            const [u, v] = coords(s, t);
            outerRow.push(push(u, v, lift, s, t));
            innerRow.push(push(u, v, sink, s, t));
        }
        outer.push(outerRow);
        inner.push(innerRow);
    }
    for (let i = 0; i < uSegments; i += 1) {
        for (let j = 0; j < vSegments; j += 1) {
            const a = outer[i][j];
            const b = outer[i + 1][j];
            const c = outer[i + 1][j + 1];
            const d = outer[i][j + 1];
            indices.push(a, d, b, b, d, c);
            const ia = inner[i][j];
            const ib = inner[i + 1][j];
            const ic = inner[i + 1][j + 1];
            const id = inner[i][j + 1];
            indices.push(ia, ib, id, ib, ic, id);
        }
    }
    const rim = (a0, a1, flip) => {
        for (let k = 0; k < a0.length - 1; k += 1) {
            const p = positions.length / 3;
            for (const index of [a0[k], a0[k + 1], a1[k + 1], a1[k]]) {
                positions.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
                colours.push(shade, shade, shade);
                uvs.push(uvs[index * 2], uvs[index * 2 + 1]);
            }
            if (flip)
                indices.push(p, p + 2, p + 1, p, p + 3, p + 2);
            else
                indices.push(p, p + 1, p + 2, p, p + 2, p + 3);
        }
    };
    const outerLow = outer.map((row) => row[0]);
    const innerLow = inner.map((row) => row[0]);
    const outerHigh = outer.map((row) => row[vSegments]);
    const innerHigh = inner.map((row) => row[vSegments]);
    rim(outerLow, innerLow, false);
    rim(outerHigh, innerHigh, true);
    rim(outer[0], inner[0], true);
    rim(outer[uSegments], inner[uSegments], false);
    if ((options.u1 - options.u0) * (options.v1 - options.v0) < 0) {
        for (let i = 0; i < indices.length; i += 3) {
            const middle = indices[i + 1];
            indices[i + 1] = indices[i + 2];
            indices[i + 2] = middle;
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
export function shaded(geometry, shade = 1) {
    const count = geometry.getAttribute('position').count;
    const colours = new Float32Array(count * 3).fill(shade);
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return geometry;
}
export function tintOver(base, target, targetScale = 1) {
    const b = new THREE.Color(base);
    const t = new THREE.Color(target).multiplyScalar(targetScale);
    return [
        t.r / Math.max(1e-3, b.r),
        t.g / Math.max(1e-3, b.g),
        t.b / Math.max(1e-3, b.b),
    ];
}
export function mergeGeometries(parts) {
    if (parts.length === 0)
        throw new Error('nothing to merge');
    const positions = [];
    const normals = [];
    const colours = [];
    const uvs = [];
    const indices = [];
    const mapped = parts.every((part) => part.getAttribute('uv') !== undefined);
    for (const part of parts) {
        const position = part.getAttribute('position');
        const normal = part.getAttribute('normal');
        const colour = part.getAttribute('color');
        const uv = part.getAttribute('uv');
        if (!normal)
            throw new Error('a merged geometry needs normals');
        if (!colour)
            throw new Error('a merged geometry needs a color attribute; see shaded()');
        const offset = positions.length / 3;
        for (let i = 0; i < position.count; i += 1) {
            positions.push(position.getX(i), position.getY(i), position.getZ(i));
            normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
            colours.push(colour.getX(i), colour.getY(i), colour.getZ(i));
            if (mapped && uv)
                uvs.push(uv.getX(i), uv.getY(i));
        }
        const index = part.getIndex();
        if (index) {
            for (let i = 0; i < index.count; i += 1)
                indices.push(index.getX(i) + offset);
        }
        else {
            for (let i = 0; i < position.count; i += 1)
                indices.push(i + offset);
        }
        part.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    if (mapped)
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return geometry;
}
export function mapUvInto(geometry, rect) {
    const uv = geometry.getAttribute('uv');
    if (!uv)
        throw new Error('mapUvInto needs a geometry with texture coordinates');
    const width = rect.u1 - rect.u0;
    const height = rect.v1 - rect.v0;
    for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, rect.u0 + uv.getX(i) * width, rect.v0 + uv.getY(i) * height);
    }
    uv.needsUpdate = true;
    return geometry;
}
export function limbProfile(length, radii, seams = [], options = {}) {
    const flatten = options.flatten ?? 0.92;
    const square = options.square ?? 2.3;
    const [top, mid, end] = radii;
    const radiusAt = (t) => (t < 0.5 ? top + (mid - top) * (t / 0.5) : mid + (end - mid) * ((t - 0.5) / 0.5));
    const rings = [];
    const add = (t, scale = 1) => {
        const radius = radiusAt(Math.min(Math.max(t, 0), 1)) * scale;
        rings.push({ y: -t * length, halfWidth: radius, halfDepth: radius * flatten, square });
    };
    add(0);
    const stops = new Set([0.25, 0.5, 0.75]);
    for (const seam of seams) {
        stops.add(seam - 0.018);
        stops.add(seam + 0.018);
    }
    const sorted = [...stops].filter((t) => t > 0.02 && t < 0.97).sort((a, b) => a - b);
    for (const t of sorted) {
        const onSeam = seams.some((seam) => Math.abs(t - seam) < 0.02);
        add(t, onSeam ? (t < seams.find((seam) => Math.abs(t - seam) < 0.02) ? 1.05 : 0.95) : 1);
    }
    if (options.roundEnd ?? true) {
        const endRadius = radiusAt(1);
        for (const [t, scale] of [[0.5, 0.86], [0.85, 0.54], [1, 0]]) {
            rings.push({
                y: -length - endRadius * 0.55 * t,
                halfWidth: endRadius * scale,
                halfDepth: endRadius * scale * flatten,
                square,
            });
        }
    }
    else {
        add(1);
    }
    return loftProfile(rings);
}
