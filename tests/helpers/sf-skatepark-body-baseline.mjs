// Frozen pre-contour partition (2026-11-07 working source, not committed HEAD).
// Inject ONLY this function into the current kit for matched geometry/query controls.
export const baselineBodySource = String.raw`function inscribedBodies(q, base, bodies, options) {
  const range = p => [Math.max(Math.abs(p[3][1] - p[0][1]), Math.abs(p[2][1] - p[1][1])),
    Math.max(Math.abs(p[1][1] - p[0][1]), Math.abs(p[2][1] - p[3][1]))];
  const topRange = range(q), baseRange = range(base);
  const split = (range, budget, axis) => Math.ceil(range[axis] / (budget / (range[1 - axis] > 1e-10 ? 2 : 1)));
  const nu = Math.max(1, split(topRange, .06, 0), split(baseRange, .03, 0));
  const ns = Math.max(1, split(topRange, .06, 1), split(baseRange, .03, 1));
  if (!Number.isFinite(nu * ns) || nu * ns > 32768) throw new RangeError('Skatepark feature body subdivision exceeds 32768 cells');
  const point = (u, s) => ({ x: (1 - u) * ((1 - s) * q[0][0] + s * q[1][0]) + u * ((1 - s) * q[3][0] + s * q[2][0]),
    z: (1 - u) * ((1 - s) * q[0][2] + s * q[1][2]) + u * ((1 - s) * q[3][2] + s * q[2][2]) });
  for (const ids of [[0, 1, 2], [0, 2, 3]]) {
    const tri = ids.map(i => q[i]), roof = plane(tri), floor = plane(ids.map(i => base[i])), boundary = tri.map(xz);
    for (let u = 0; u < nu; u++) for (let s = 0; s < ns; s++) {
      const outer = clipTriangle([point(u / nu, s / ns), point(u / nu, (s + 1) / ns),
        point((u + 1) / nu, (s + 1) / ns), point((u + 1) / nu, s / ns)], boundary);
      if (outer.length < 3 || Math.abs(outer.reduce((sum, p, i) => sum + cross(outer[0], p, outer[(i + 1) % outer.length]), 0)) < 1e-12) continue;
      const minY = Math.max(...outer.map(floor)) + 1e-7, maxY = Math.min(...outer.map(roof)) - 1e-7;
      if (maxY > minY + 1e-6) bodies.push({ outer, minY, maxY, options });
    }
  }
}`;
