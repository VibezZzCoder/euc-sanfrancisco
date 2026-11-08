(function () {
// js/terrain.js
// The ground's height API over the baked height field (data/terrain-<box>.bin, provenance/formats.md; loaded by
// data-loader.js). Pure JS, no THREE: every system that needs the ground (terrain mesh, curbs, buildings, controllers,
// cameras, road network, traffic, pedestrians, street details) asks here. Heights are metres NAVD88 = world y.
//
//   Terrain.load(header, q)        Uint16 samples, row-major, row j = z originZ + j * cell, column i = x originX + i * cell
//   Terrain.heightAt(x, z)         bilinear; outside the data -> the region ground (addPatch), else waterLevel - 5
//   Terrain.groundAt(x, z)         max(heightAt, waterLevel): what stands on land or floats on the bay
//   Terrain.normalAt(x, z, out)    unit normal {x, y, z} from central differences of heightAt
//   Terrain.slopeAt(x, z)          |grad heightAt| (rise over run)
//   Terrain.waterLevel             the hydro-flattened bay surface

const Terrain = {
  loaded: false,
  waterLevel: 0,
  header: null,
  cell: 1,
  originX: 0,
  originZ: 0,
  w: 0,
  h: 0,
  heights: null, // Float32Array of decoded samples (decoding once keeps heightAt to 4 loads)
  patches: [], // ground outside the data (the interim region ground, P5-1): { x0, z0, step, nx, nz, h, rect | cx, cz, rx, rz }
  patchesEnabled: true, // off while main.js builds the street network: it stays on the core's own terrain
  coreTransition: null,

  load(header, q) {
    if (this.coreTransition) {
      const owned = new Set(this.coreTransition.patches);
      this.patches = this.patches.filter(p => !owned.has(p));
    }
    this.header = header;
    this.cell = header.cell;
    this.originX = header.originX;
    this.originZ = header.originZ;
    this.w = header.w;
    this.h = header.h;
    this.waterLevel = header.waterLevel;
    const heights = new Float32Array(header.w * header.h);
    for (let k = 0; k < heights.length; k++) heights[k] = header.minH + q[k] * header.scale;
    this.heights = heights;
    this.coreTransition = null;
    this.loaded = true;
    return this;
  },

  heightAt(x, z) {
    const fi = (x - this.originX) / this.cell;
    const fj = (z - this.originZ) / this.cell;
    if (!(fi >= 0 && fj >= 0 && fi <= this.w - 1 && fj <= this.h - 1)) return this.patchAt(x, z);
    const i = Math.min(this.w - 2, fi | 0);
    const j = Math.min(this.h - 2, fj | 0);
    const tx = fi - i;
    const tz = fj - j;
    const H = this.heights;
    const k = j * this.w + i;
    const a = H[k] + (H[k + 1] - H[k]) * tx;
    const b = H[k + this.w] + (H[k + this.w + 1] - H[k + this.w]) * tx;
    return a + (b - a) * tz;
  },

  // A patch of DEM ground outside the data (data/terrain-region.bin, js/data-loader.js): heights h (m) on a step grid
  // from (x0, z0), over its whole grid (`rect`) or inside the rounded rectangle |u|^4 + |v|^4 <= 1 round (cx, cz) with
  // half sizes rx, rz; elsewhere the bay floor
  addPatch(p) {
    this.patches.push(p);
    return p;
  },
  // Construction-only collar OUTSIDE the detailed core. Keep the measured core untouched and meet the original
  // regional triangles again on an 8 m grid line, at least 32 m away. Four nonoverlapping rectangles include every
  // corner without an all-world fine grid. The ordinary field sampler indexes these Float64 grids directly;
  // region.js draws their identical 00,01,10 / 10,01,11 facets at every camera LOD.
  installCoreTransition(region) {
    if (this.coreTransition) return this.coreTransition;
    if (!this.loaded || !this.heights || !(region.step > this.cell)) return null;
    const step = this.cell, x0 = this.originX, z0 = this.originZ;
    const x1 = x0 + (this.w - 1) * step, z1 = z0 + (this.h - 1) * step;
    const align = (v, origin, upper) => origin + (upper ? Math.ceil : Math.floor)((v - origin) / region.step) * region.step;
    const outer = { x0: align(x0 - 32, region.x0, false), x1: align(x1 + 32, region.x0, true),
      z0: align(z0 - 32, region.z0, false), z1: align(z1 + 32, region.z0, true) };
    if (outer.x0 < region.x0 || outer.z0 < region.z0 || outer.x1 > region.x0 + (region.nx - 1) * region.step ||
        outer.z1 > region.z0 + (region.nz - 1) * region.step) throw Error('Core transition needs regional coverage');
    // Both grids must share fine grid lines; silently snapping would move actual terrain boundaries.
    for (const [v, origin] of [[outer.x0,x0],[outer.x1,x0],[outer.z0,z0],[outer.z1,z0]])
      if (Math.abs((v-origin)/step-Math.round((v-origin)/step)) > 1e-9) throw Error('Unaligned core transition');
    const regional = (x,z) => {
      const u=(x-region.x0)/region.step,v=(z-region.z0)/region.step;
      const i=Math.min(region.nx-2,Math.floor(u)),j=Math.min(region.nz-2,Math.floor(v));
      const a=u-i,b=v-j,k=j*region.nx+i,H=region.h;
      return a+b<=1 ? H[k]+(H[k+1]-H[k])*a+(H[k+region.nx]-H[k])*b
        : H[k+region.nx+1]-(H[k+region.nx+1]-H[k+region.nx])*(1-a)-(H[k+region.nx+1]-H[k+1])*(1-b);
    };
    const at = (x,z) => {
      const cx=Math.max(x0,Math.min(x1,x)),cz=Math.max(z0,Math.min(z1,z));
      const dx=x-cx,dz=z-cz;
      const u=(cx-x0)/step,v=(cz-z0)/step,i=Math.min(this.w-2,Math.floor(u)),j=Math.min(this.h-2,Math.floor(v));
      const a=u-i,b=v-j,k=j*this.w+i,H=this.heights;
      const h0=H[k]+(H[k+1]-H[k])*a,h1=H[k+this.w]+(H[k+this.w+1]-H[k+this.w])*a;
      const core=h0+(h1-h0)*b;
      // Continue the last measured core tangent, not a flat shelf. No mixed dx*dz extrapolation at corners.
      const gx=((H[k+1]-H[k])*(1-b)+(H[k+this.w+1]-H[k+this.w])*b)/step,gz=(h1-h0)/step;
      const t=Math.max(Math.abs(dx)/(dx<0?x0-outer.x0:outer.x1-x1),Math.abs(dz)/(dz<0?z0-outer.z0:outer.z1-z1));
      const base=regional(x,z),weight=1-t*t*(3-2*t);
      return base+(core+gx*dx+gz*dz-base)*weight;
    };
    const patches=[];
    for (const r of [
      [outer.x0,outer.z0,outer.x1,z0], [outer.x0,z1,outer.x1,outer.z1],
      [outer.x0,z0,x0,z1], [x1,z0,outer.x1,z1]
    ]) {
      const nx=Math.round((r[2]-r[0])/step)+1,nz=Math.round((r[3]-r[1])/step)+1;
      const h=new Float64Array(nx*nz);
      for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)h[j*nx+i]=at(r[0]+i*step,r[1]+j*step);
      patches.push({x0:r[0],z0:r[1],step,nx,nz,h,rect:true,coreTransition:true});
    }
    // Publish only after all owned buffers are complete. Existing fine landmark patches retain priority.
    this.patches.push(...patches);
    return this.coreTransition={outer,patches};
  },
  patchInside(p, x, z) {
    if (p.rect) return true;
    const u = (x - p.cx) / p.rx, v = (z - p.cz) / p.rz;
    return u * u * u * u + v * v * v * v <= 1;
  },
  patchAt(x, z) {
    if (!this.patchesEnabled) return this.waterLevel - 5;
    for (const p of this.patches) {
      const fi = (x - p.x0) / p.step, fj = (z - p.z0) / p.step;
      if (!(fi >= 0 && fj >= 0 && fi <= p.nx - 1 && fj <= p.nz - 1) || !this.patchInside(p, x, z)) continue;
      const i = Math.min(p.nx - 2, fi | 0), j = Math.min(p.nz - 2, fj | 0);
      const tx = fi - i, tz = fj - j, k = j * p.nx + i, H = p.h;
      if (p.coreTransition) return tx+tz<=1 ? H[k]+(H[k+1]-H[k])*tx+(H[k+p.nx]-H[k])*tz
        : H[k+p.nx+1]-(H[k+p.nx+1]-H[k+p.nx])*(1-tx)-(H[k+p.nx+1]-H[k+1])*(1-tz);
      const a = H[k] + (H[k + 1] - H[k]) * tx;
      const b = H[k + p.nx] + (H[k + p.nx + 1] - H[k + p.nx]) * tx;
      return a + (b - a) * tz;
    }
    return this.waterLevel - 5;
  },

  groundAt(x, z) {
    const y = this.heightAt(x, z);
    return y > this.waterLevel ? y : this.waterLevel;
  },

  // central differences half a cell either side (smooth across cell borders)
  gradientAt(x, z, out = { x: 0, z: 0 }) {
    const e = this.cell * 0.5;
    out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  },

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const g = this.gradientAt(x, z, _grad);
    const len = Math.hypot(g.x, 1, g.z);
    out.x = -g.x / len;
    out.y = 1 / len;
    out.z = -g.z / len;
    return out;
  },

  slopeAt(x, z) {
    const g = this.gradientAt(x, z, _grad);
    return Math.hypot(g.x, g.z);
  }
};
const _grad = { x: 0, z: 0 };

Object.assign(window.NYC, { Terrain });
})();
