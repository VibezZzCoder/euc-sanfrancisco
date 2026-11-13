// MIT © 2026 VibezZzCoder. Terrain-only tier, derived from the committed ODbL SF data (provenance/light-terrain.json).
export async function loadLightTerrain(fetchBin) {
  const { header: h, buf, offset } = await fetchBin('data/light-terrain.bin');
  if (h.format !== 'sf-light-terrain' || h.version !== 1 || offset % 4 || buf.byteLength > 32000000)
    throw new Error('Invalid light terrain format');
  for (const g of [h.city, h.horizon]) {
    if (!g || ![g.x0, g.z0, g.step, g.w, g.h].every(Number.isFinite) || !(g.step > 0)
      || !Number.isInteger(g.w) || !Number.isInteger(g.h) || g.w < 2 || g.h < 2 || g.w * g.h > 5000000)
      throw new Error('Invalid light terrain grid');
  }
  const far = h.horizon;
  if (![far.x1, far.z1].every(Number.isFinite)
    || !(far.x1 > far.x0 + (far.w - 2) * far.step && far.x1 <= far.x0 + (far.w - 1) * far.step)
    || !(far.z1 > far.z0 + (far.h - 2) * far.step && far.z1 <= far.z0 + (far.h - 1) * far.step))
    throw new Error('Invalid light terrain horizon bounds');
  const array = (name, Type, expected) => {
    const d = h.layout?.[name], start = offset + (d?.offset ?? NaN);
    if (!d || !Number.isSafeInteger(d.length) || d.length < 0 || (expected !== undefined && d.length !== expected)
      || !Number.isSafeInteger(start) || start < offset || start % Type.BYTES_PER_ELEMENT
      || start + d.length * Type.BYTES_PER_ELEMENT > buf.byteLength) throw new Error('Invalid light terrain array: ' + name);
    return new Type(buf, start, d.length);
  };
  const grid = (name, g, x1 = g.x0 + (g.w - 1) * g.step, z1 = g.z0 + (g.h - 1) * g.step) => ({ ...g, x1, z1,
    heights: array(name, Float32Array, g.w * g.h) });
  const city = grid('city', h.city);
  const horizon = grid('horizon', far, far.x1, far.z1);
  if (!h.mask || !Number.isInteger(h.mask.w) || h.mask.w > 65535 || h.mask.w < 1
    || !Number.isInteger(h.mask.h) || h.mask.h < 1 || h.mask.h > 10000) throw new Error('Invalid light terrain mask');
  const mask = { header: h.mask, rows: array('maskRows', Uint32Array, h.mask.h + 1),
    ends: array('maskEnds', Uint16Array), values: array('maskValues', Uint8Array) };
  if (mask.ends.length !== mask.values.length || mask.rows[0] !== 0 || mask.rows.at(-1) !== mask.ends.length)
    throw new Error('Invalid light terrain mask ownership');
  for (let row = 0; row < h.mask.h; row++) {
    const start = mask.rows[row], end = mask.rows[row + 1];
    if (!(end > start) || end > mask.ends.length || mask.ends[end - 1] !== h.mask.w) throw new Error('Invalid light mask row');
    for (let i = start; i < end; i++) if (mask.values[i] > 8 || mask.ends[i] <= (i === start ? 0 : mask.ends[i - 1]))
      throw new Error('Invalid light mask run');
  }
  const roads = array('roads', Float32Array);
  if (roads.length % 4 || roads.length > 100000 || !Number.isFinite(h.waterLevel)) throw new Error('Invalid light terrain metadata');
  return { city, horizon, mask, roads, waterLevel: h.waterLevel };
}

export function lightMaskValue(mask, column, row) {
  let low = mask.rows[row], high = mask.rows[row + 1];
  while (low < high) { const mid = (low + high) >>> 1; if (mask.ends[mid] <= column) low = mid + 1; else high = mid; }
  return mask.values[low];
}

export function installLightTerrain(city, data) {
  const g = data.city, patch = { x0: g.x0, z0: g.z0, step: g.step, nx: g.w, nz: g.h, h: g.heights, rect: true };
  // Same measured city grid/collar as full. The cheap far horizon is scenery, never phantom riding support.
  city.Terrain.installCoreTransition(patch);
  city.Terrain.addPatch(patch);
  city.lightCoverage = { minX: g.x0, minZ: g.z0, maxX: g.x0 + (g.w - 1) * g.step, maxZ: g.z0 + (g.h - 1) * g.step };
}
