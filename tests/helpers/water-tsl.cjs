// Focused lazy numerical TSL executor adapted from NYC tests/oct29-materials.test.mjs @
// 9c4cfc9e32a425d58bac36cf9e074a2aa77fac70 (same bytes at cf56976).
// Executes production expressions, including Fn/If/variable assignment; no copied water formulas.
// Fixed texture samples/derivative footprints isolate arithmetic. Real shader builders are tested separately.
const assert = require('node:assert/strict');

module.exports = function waterTSL(THREE, config) {
  const env = { world: [0, -2.2, 0], normal: [0, 1, 0], camera: [180, 12, 0], glow: 0.48,
    footprint: 0.02, spatialRead: false, spatialDepth: 0, derivatives: 0, unsafe: 0, hashes: 0, gates: [],
    derivativeInputs: [], variables: {}, waveSample: [0.04, -0.03, 0.015, 0.2] };
  let epoch = 0;
  const arr = v => v instanceof N ? v.eval() : Array.isArray(v) ? v : [v];
  const binary = (a, b, fn) => {
    const aa = arr(a), bb = arr(b);
    return Array.from({ length: Math.max(aa.length, bb.length) }, (_, i) => fn(aa[i % aa.length], bb[i % bb.length]));
  };
  class N {
    constructor(value) { this.fn = typeof value === 'function' ? value : () => value; this.epoch = -1; }
    eval() {
      // Shared TSL expressions form a DAG. Re-evaluating every path expands wave/noise work exponentially.
      // Memoize immutable expressions within one sample; mutable variable reads must always see the current slot.
      if (this.dynamic || this.epoch !== epoch) {
        const previous = env.spatialRead;
        env.spatialRead = false;
        this.value = this.fn(); this.spatial = env.spatialRead; this.epoch = epoch;
        env.spatialRead ||= previous;
      } else env.spatialRead ||= this.spatial;
      return this.value;
    }
    add(b) { return new N(() => binary(this, b, (a, b) => a + b)); }
    sub(b) { return new N(() => binary(this, b, (a, b) => a - b)); }
    mul(b) { return new N(() => binary(this, b, (a, b) => a * b)); }
    div(b) { return new N(() => binary(this, b, (a, b) => a / b)); }
    negate() { return this.mul(-1); }
    max(b) { return new N(() => binary(this, b, Math.max)); }
    min(b) { return new N(() => binary(this, b, Math.min)); }
    clamp(a, b) { return this.max(a).min(b); }
    greaterThan(b) { return new N(() => binary(this, b, (a, b) => +(a > b))); }
    normalize() { return this.div(new N(() => [Math.hypot(...this.eval()) || 1])); }
    toVar(name) {
      const previous = env.spatialRead;
      env.spatialRead = false;
      let slot = this.eval().slice(), spatial = env.spatialRead;
      env.spatialRead ||= previous;
      const variable = new N(() => { env.spatialRead ||= spatial; return slot; });
      variable.dynamic = true;
      variable.assign = rhs => { slot = arr(rhs).slice(); spatial ||= env.spatialRead; };
      variable.addAssign = rhs => { slot = binary(slot, rhs, (a, b) => a + b); spatial ||= env.spatialRead; };
      if (name) env.variables[name] = variable;
      return variable;
    }
  }
  for (const [name, indexes] of Object.entries({ x: [0], y: [1], z: [2], w: [3], xy: [0, 1], xz: [0, 2] })) {
    Object.defineProperty(N.prototype, name, { get() { return new N(() => {
      const a = this.eval(); return indexes.map(i => a[i]);
    }); } });
  }
  const wrap = v => v instanceof N ? v : new N(arr(v));
  const vector = n => (...values) => new N(() => {
    const flat = values.flatMap(arr);
    return flat.length === 1 ? Array(n).fill(flat[0]) : flat.slice(0, n);
  });
  const unary = fn => a => new N(() => arr(a).map(fn));
  const spatial = name => new N(() => { env.spatialRead = true; return env[name]; });
  const context = {
    Fn: body => (...args) => new N(() => arr(body(args.map(wrap)))),
    If(condition, body) {
      const previous = env.spatialRead;
      env.spatialRead = false;
      const values = arr(condition), spatial = env.spatialRead;
      assert.equal(values.length, 1, 'this water gate must be scalar');
      const matched = values[0] > 0;
      env.gates.push({ matched, spatial });
      env.spatialRead ||= previous;
      if (matched) {
        if (spatial) env.spatialDepth++;
        try { body(); } finally { if (spatial) env.spatialDepth--; }
      }
    },
    float: wrap, vec2: vector(2), vec3: vector(3), vec4: vector(4),
    positionWorld: spatial('world'), normalWorldGeometry: spatial('normal'),
    cameraPosition: new N(() => env.camera), time: wrap(1.5),
    cameraViewMatrix: { transformDirection: n => n },
    cityUniforms: { uInteriorGlow: new N(() => [env.glow]) },
    color: hex => wrap(new THREE.Color(hex).toArray()),
    sin: unary(x => { env.hashes++; return Math.sin(x); }), cos: unary(Math.cos), abs: unary(Math.abs),
    floor: unary(Math.floor), fract: unary(x => x - Math.floor(x)), sqrt: unary(Math.sqrt),
    min: (a, b) => wrap(a).min(b), max: (a, b) => wrap(a).max(b), clamp: (a, b, c) => wrap(a).clamp(b, c),
    pow: (a, b) => new N(() => binary(a, b, Math.pow)),
    mix: (a, b, t) => wrap(a).mul(wrap(1).sub(t)).add(wrap(b).mul(t)),
    step: (edge, x) => new N(() => binary(edge, x, (e, x) => +(x >= e))),
    smoothstep: (a, b, x) => {
      const t = wrap(x).sub(a).div(wrap(b).sub(a)).clamp(0, 1);
      return t.mul(t).mul(wrap(3).sub(t.mul(2)));
    },
    length: a => new N(() => [Math.hypot(...arr(a))]), normalize: a => wrap(a).normalize(),
    dot: (a, b) => new N(() => [binary(a, b, (a, b) => a * b).reduce((a, b) => a + b, 0)]),
    reflect: (i, n) => wrap(i).sub(wrap(n).mul(new N(() => [2 * binary(i, n, (a, b) => a * b).reduce((a, b) => a + b, 0)]))),
    fwidth: a => new N(() => {
      env.derivatives++;
      if (env.spatialDepth) env.unsafe++;
      const values = arr(a);
      assert.ok(values.every(Number.isFinite), 'derivatives must receive finite coordinates, including misses');
      env.derivativeInputs.push(values);
      return values.map(() => env.footprint);
    }),
    texture: () => new N(() => env.waveSample), getWaterWaveTexture: () => ({})
  };
  context.window = { NYC: { ...config, TSL: context } };
  context.THREE = { MeshStandardNodeMaterial: class { constructor(opts) { Object.assign(this, opts); } } };
  const reset = () => {
    epoch++;
    env.hashes = env.derivatives = env.unsafe = env.spatialDepth = 0;
    env.spatialRead = false; env.gates = []; env.derivativeInputs = []; env.variables = {};
  };
  return { env, context, arr, reset };
};
