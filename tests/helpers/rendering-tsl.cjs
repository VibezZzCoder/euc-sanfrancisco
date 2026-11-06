// CPU formula/interpolation executor adapted from NYC tests/oct29-pedestrians.test.cjs
// @9c4cfc9 (MIT). Float32 node boundaries approximate shader arithmetic, not driver sin/FMA.
module.exports = function numericTSL() {
  const f = Math.fround;
  const state = { epoch: 0, attrs: {}, instance: 0, stage: 'fragment', snapshots: new Map(), fragmentSin: 0, branches: 0, derivatives: 0 };
  const arr = v => v instanceof N ? v.eval() : Array.isArray(v) ? v.map(f) : [f(v)];
  const binary = (a, b, op) => new N(() => {
    const x = arr(a), y = arr(b);
    return Array.from({ length: Math.max(x.length, y.length) }, (_, i) => op(x[i % x.length], y[i % y.length]));
  });
  class N {
    constructor(value) { this.value = typeof value === 'function' ? value : () => value; }
    eval() {
      // Production graphs share DAG nodes. Cache each sample/stage rather than
      // recursively expanding body SDFs exponentially; variables remain live.
      if (this.dynamic || this.epoch !== state.epoch || this.stage !== state.stage) {
        this.cached = this.value().map(f); this.epoch = state.epoch; this.stage = state.stage;
      }
      return this.cached;
    }
    add(b) { return binary(this, b, (a, b) => a + b); }
    sub(b) { return binary(this, b, (a, b) => a - b); }
    mul(b) { return binary(this, b, (a, b) => a * b); }
    div(b) { return binary(this, b, (a, b) => a / b); }
    negate() { return this.mul(-1); }
    lessThan(b) { return binary(this, b, (a, b) => +(a < b)); }
    greaterThan(b) { return binary(this, b, (a, b) => +(a > b)); }
    toVar() {
      let slot = this.eval();
      const variable = new N(() => slot);
      variable.dynamic = true;
      variable.assign = rhs => { slot = arr(rhs); };
      return variable;
    }
    setInterpolation(mode) { this.interpolation = mode; return this; }
  }
  for (const [name, indices] of Object.entries({ x: [0], y: [1], z: [2], w: [3], xyz: [0, 1, 2] })) {
    Object.defineProperty(N.prototype, name, { get() { return new N(() => { const a = this.eval(); return indices.map(i => a[i]); }); } });
  }
  const vertex = fn => {
    const previous = state.stage;
    state.stage = 'vertex';
    try { return fn(); } finally { state.stage = previous; }
  };
  const varying = node => {
    const out = new N(() => {
      if (!state.snapshots.has(out)) state.snapshots.set(out, vertex(() => arr(node)));
      return state.snapshots.get(out);
    });
    return out;
  };
  const vector = size => (...args) => new N(() => {
    const v = args.flatMap(arr);
    return v.length === 1 ? Array(size).fill(v[0]) : v.slice(0, size);
  });
  const unary = fn => a => new N(() => arr(a).map(fn));
  const tsl = {
    Fn: body => (...args) => new N(() => arr(body(args))),
    If(condition, body) {
      state.branches++;
      let matched = arr(condition)[0] !== 0;
      if (matched) body();
      return { ElseIf(condition, body) {
        if (!matched && arr(condition)[0] !== 0) { matched = true; body(); }
        return this;
      } };
    },
    float: a => a instanceof N ? a : new N([f(a)]),
    int: unary(Math.trunc), vec2: vector(2), vec3: vector(3), vec4: vector(4),
    color: hex => new N([16, 8, 0].map(shift => {
      const v = ((hex >> shift) & 255) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })),
    attribute: name => new N(() => state.attrs[name]),
    instanceIndex: new N(() => [state.instance]),
    attributeArray: count => {
      const value = { array: new Float32Array(count * 4) };
      return { value, element(index) { return new N(() => Array.from(value.array.slice(arr(index)[0] * 4, arr(index)[0] * 4 + 4))); } };
    },
    varying, vertexStage: varying,
    sin: a => new N(() => { if (state.stage === 'fragment') state.fragmentSin++; return arr(a).map(Math.sin); }),
    abs: unary(Math.abs), fract: unary(x => x - Math.floor(x)),
    min: (a, b) => binary(a, b, Math.min), max: (a, b) => binary(a, b, Math.max),
    clamp: (a, lo, hi) => binary(binary(a, lo, Math.max), hi, Math.min),
    step: (edge, value) => binary(edge, value, (e, v) => +(v >= e)),
    mix: (a, b, t) => new N(() => {
      const x = arr(a), y = arr(b), k = arr(t);
      return Array.from({ length: Math.max(x.length, y.length, k.length) }, (_, i) =>
        f(x[i % x.length] * f(1 - k[i % k.length])) + f(y[i % y.length] * k[i % k.length]));
    }),
    smoothstep: (a, b, x) => new N(() => {
      const lo = arr(a), hi = arr(b), v = arr(x);
      return v.map((x, i) => {
        const t = Math.max(0, Math.min(1, f(f(x - lo[i % lo.length]) / f(hi[i % hi.length] - lo[i % lo.length]))));
        return f(t * t) * f(3 - f(2 * t));
      });
    }),
    length: a => new N(() => [Math.hypot(...arr(a))]),
    normalize: a => new N(() => { const v = arr(a), l = Math.hypot(...v) || 1; return v.map(x => x / l); }),
    fwidth: a => new N(() => { state.derivatives++; return arr(a).map(() => 0.001); }),
    uniform: v => new N(v.toArray ? v.toArray() : [v])
  };
  return { tsl, state };
};
