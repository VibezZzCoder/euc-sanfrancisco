// Vendored by tools/vendor-euc.mjs from VibezZzCoder/EUC-thrills@5f45fff src/shared/riderSideContact.ts.
// MIT, (c) 2026 VibezZzCoder. See js/euc/LICENSE and NOTICE-EUC-THRILLS.md. Do not edit; re-run the tool.
/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { buildRiderOccupancyEnvelope, buildRiderWheelOccupancy } from './riderOccupancy.js';
const axes = (heading) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
const support = (body, axis) => {
    const [x, z] = axes(body.headingY);
    return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidth + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLength;
};
const footprint = (body) => ({ ...body, halfWidth: body.halfWidthMetres, halfLength: body.halfLengthMetres });
function axisGap(body, blocker, axis) {
    return Math.abs((body.x - blocker.x) * axis.x + (body.z - blocker.z) * axis.z) - support(body, axis) - support(footprint(blocker), axis);
}
function proposeSideProjection(first, last, blockers, standoffMetres) {
    if (!(standoffMetres >= 0 && Number.isFinite(standoffMetres)))
        throw new RangeError('Side-contact standoff must be finite and nonnegative');
    const planes = [];
    let incoming = false;
    for (const blocker of blockers) {
        if (last.topY < blocker.minY || blocker.maxY < last.baseY)
            continue;
        const directions = [...axes(first.headingY), ...axes(blocker.headingY)];
        const best = directions.map(axis => ({ axis, gap: axisGap(first, blocker, axis) })).sort((a, b) => b.gap - a.gap)[0];
        if (best.gap <= 0)
            return null;
        const sign = (first.x - blocker.x) * best.axis.x + (first.z - blocker.z) * best.axis.z < 0 ? -1 : 1;
        const normal = { x: best.axis.x * sign, z: best.axis.z * sign };
        const currentGap = (last.x - blocker.x) * normal.x + (last.z - blocker.z) * normal.z - support(last, normal) - support(footprint(blocker), normal);
        const required = standoffMetres - currentGap;
        planes.push({ ...normal, required });
        incoming ||= required > 0;
    }
    if (!incoming)
        return { x: 0, z: 0, normals: [], planes };
    const candidates = [{ x: 0, z: 0 }, ...planes.map(p => ({ x: p.x * p.required, z: p.z * p.required }))];
    for (let a = 0; a < planes.length; a += 1)
        for (let b = a + 1; b < planes.length; b += 1) {
            const p = planes[a], q = planes[b], determinant = p.x * q.z - p.z * q.x;
            if (determinant === 0)
                continue;
            candidates.push({ x: (p.required * q.z - p.z * q.required) / determinant,
                z: (p.x * q.required - p.required * q.x) / determinant });
        }
    const feasible = candidates.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)
        && planes.every(p => p.x * point.x + p.z * point.z >= p.required - 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))));
    feasible.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
    if (!feasible.length)
        return null;
    const value = feasible[0];
    return { ...value, planes, normals: planes.filter(p => p.required > 0 || Math.abs(p.x * value.x + p.z * value.z - p.required) <= 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))).map(p => ({ x: p.x, z: p.z })) };
}
export function proposeFullRagSideProjection(previous, proposed, blockers, coefficients, standoffMetres) {
    if (previous.ragdollBlend !== 1 || proposed.ragdollBlend !== 1)
        return null;
    return proposeSideProjection(buildRiderOccupancyEnvelope(previous, coefficients).human, buildRiderOccupancyEnvelope(proposed, coefficients).human, blockers, standoffMetres);
}
export function proposeFullRagWheelSideProjection(previous, proposed, blockers, coefficients, standoffMetres) {
    if (previous.ragdollBlend !== 1 || proposed.ragdollBlend !== 1)
        return null;
    return proposeSideProjection(buildRiderWheelOccupancy(previous, coefficients), buildRiderWheelOccupancy(proposed, coefficients), blockers, standoffMetres);
}
export function proposeWheelClearOfBodies(pose, blockers, coefficients, standoffMetres) {
    const wheel = buildRiderWheelOccupancy(pose, coefficients), planes = [];
    for (const blocker of blockers) {
        if (blocker.minY > wheel.topY)
            continue;
        const best = [...axes(wheel.headingY), ...axes(blocker.headingY)].map(axis => ({ axis, gap: axisGap(wheel, blocker, axis) }))
            .sort((a, b) => b.gap - a.gap)[0];
        if (best.gap >= standoffMetres)
            continue;
        const sign = (wheel.x - blocker.x) * best.axis.x + (wheel.z - blocker.z) * best.axis.z < 0 ? -1 : 1;
        planes.push({ x: best.axis.x * sign, z: best.axis.z * sign, required: standoffMetres - best.gap });
    }
    if (!planes.length)
        return { x: 0, z: 0, normals: [], planes };
    const points = planes.map(p => ({ x: p.x * p.required, z: p.z * p.required }));
    for (let a = 0; a < planes.length; a += 1)
        for (let b = a + 1; b < planes.length; b += 1) {
            const p = planes[a], q = planes[b], determinant = p.x * q.z - p.z * q.x;
            if (determinant !== 0)
                points.push({ x: (p.required * q.z - p.z * q.required) / determinant, z: (p.x * q.required - p.required * q.x) / determinant });
        }
    const feasible = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)
        && planes.every(p => p.x * point.x + p.z * point.z >= p.required - 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))));
    feasible.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
    return feasible.length ? { ...feasible[0], planes, normals: planes.map(p => ({ x: p.x, z: p.z })) } : null;
}
export function proposeWheelSideProjection(previous, proposed, blockers, coefficients, standoffMetres) {
    return proposeSideProjection(buildRiderWheelOccupancy(previous, coefficients), buildRiderWheelOccupancy(proposed, coefficients), blockers, standoffMetres);
}
export function proposeRiderPhaseSideProjection(previous, proposed, blockers, coefficients, standoffMetres) {
    const first = buildRiderOccupancyEnvelope(previous, coefficients), last = buildRiderOccupancyEnvelope(proposed, coefficients);
    const wheel = proposeSideProjection(first.wheel, last.wheel, blockers, standoffMetres), human = proposeSideProjection(first.human, last.human, blockers, standoffMetres);
    if (!wheel || !human)
        return null;
    const planes = [...wheel.planes, ...human.planes];
    if (!planes.some(p => p.required > 0))
        return { x: 0, z: 0, normals: [], planes };
    const points = [{ x: 0, z: 0 }, ...planes.map(p => ({ x: p.x * p.required, z: p.z * p.required }))];
    for (let a = 0; a < planes.length; a += 1)
        for (let b = a + 1; b < planes.length; b += 1) {
            const p = planes[a], q = planes[b], determinant = p.x * q.z - p.z * q.x;
            if (determinant !== 0)
                points.push({ x: (p.required * q.z - p.z * q.required) / determinant, z: (p.x * q.required - p.required * q.x) / determinant });
        }
    const feasible = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)
        && planes.every(p => p.x * point.x + p.z * point.z >= p.required - 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))));
    feasible.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
    if (!feasible.length)
        return null;
    const point = feasible[0];
    return { ...point, planes, normals: planes.filter(p => p.required > 0 || Math.abs(p.x * point.x + p.z * point.z - p.required) <= 32 * Number.EPSILON * Math.max(1, Math.abs(p.required))).map(p => ({ x: p.x, z: p.z })) };
}
