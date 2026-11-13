#!/usr/bin/env node
// MIT © 2026 VibezZzCoder. Local derivation ONLY from committed runtime data; no downloads/geographic regeneration.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const sha = b => createHash('sha256').update(b).digest('hex');
const sources = {};
const read = name => { const b = fs.readFileSync(path.join(root, name)); sources[name] = sha(b); return b; };
const manifest = JSON.parse(read('data/region/manifest.json'));
function bin(name) {
  const b = read(name);
  if (b.toString('ascii', 0, 4) !== 'SFB1') throw Error('Not SFB1: ' + name);
  const offset = 8 + b.readUInt32LE(4);
  return { b, header: JSON.parse(b.toString('utf8', 8, offset)), offset };
}
function grid(tier) {
  const heights = new Float32Array(tier.w * tier.h).fill(manifest.waterLevel);
  for (const file of tier.files) {
    const { b, header: h, offset } = bin(file.url);
    const ix = Math.round((h.originX - tier.x0) / tier.step), iz = Math.round((h.originZ - tier.z0) / tier.step);
    for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++)
      heights[(iz + j) * tier.w + ix + i] = h.minH + b.readUInt16LE(offset + (j * h.w + i) * 2) * h.scale;
  }
  return { x0: tier.x0, z0: tier.z0, step: tier.step, w: tier.w, h: tier.h, heights };
}
const city = grid(manifest.city), originalHorizon = grid(manifest.horizon);
// The distant horizon is visual only. Native 8 m city heights remain unchanged for all routes/destinations.
const stride = 8, w = Math.ceil((originalHorizon.w - 1) / stride) + 1, h = Math.ceil((originalHorizon.h - 1) / stride) + 1;
const horizon = { x0: originalHorizon.x0, z0: originalHorizon.z0, step: originalHorizon.step * stride, w, h,
  x1: manifest.horizon.x1, z1: manifest.horizon.z1,
  heights: new Float32Array(w * h) };
// Ceil counts retain the final source sample; its coordinate is NOT a full stride beyond the penultimate one.
// Keep the original bounds so only the terminal cell shortens (32 m X / 160 m Z), without rescaling the grid.
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++)
  horizon.heights[j * w + i] = originalHorizon.heights[Math.min(originalHorizon.h - 1, j * stride) * originalHorizon.w + Math.min(originalHorizon.w - 1, i * stride)];
// Store exact 4 m material classes as row runs, rather than a 17 MB expanded raster. No mask texture is needed.
const { b: maskBin, header: mh, offset: mo } = bin(manifest.mask.url);
const ends = [], values = [], rows = [0];
let remaining = 0, value = 0, at = mo;
for (let j = 0; j < mh.h; j++) {
  let col = 0;
  while (col < mh.w) {
    if (!remaining) { const run = maskBin.readUInt32LE(at); at += 4; remaining = run >>> 8; value = run & 255;
      if (!remaining || value > 8) throw Error('Invalid source mask'); }
    const n = Math.min(remaining, mh.w - col); col += n; remaining -= n;
    if (ends.length > rows[j] && values.at(-1) === value) ends[ends.length - 1] = col;
    else { ends.push(col); values.push(value); }
  }
  rows.push(ends.length);
}
if (remaining || at !== maskBin.length) throw Error('Unconsumed source mask');
// Destination audit: Yerba Buena has no core road. Retain only source segments its existing nearest-road arrival
// can consume, rather than downloading/retaining the entire regional road file for one island pin.
const sandbox = { window: { NYC: {} } };
vm.runInNewContext(read('js/sf-geodata.js').toString(), sandbox);
const island = sandbox.window.NYC.GEO.landmarks['Yerba Buena Island'];
const rb = bin(manifest.roads.url), roadSource = new Float32Array(rb.b.buffer, rb.b.byteOffset + rb.offset, (rb.b.length - rb.offset) / 4);
const roads = [];
for (let i = 0; i < roadSource.length; i += 4) {
  const [ax, az, bx, bz] = roadSource.subarray(i, i + 4), dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz;
  if (!len) continue;
  const t = Math.max(0, Math.min(1, ((island.x - ax) * dx + (island.z - az) * dz) / len));
  if (Math.hypot(ax + dx * t - island.x, az + dz * t - island.z) <= 450) roads.push(ax, az, bx, bz);
}
const arrays = { city: city.heights, horizon: horizon.heights, roads: Float32Array.from(roads),
  maskRows: Uint32Array.from(rows), maskEnds: Uint16Array.from(ends), maskValues: Uint8Array.from(values) };
let byteLength = 0;
const layout = Object.fromEntries(Object.entries(arrays).map(([name, array]) => {
  byteLength = Math.ceil(byteLength / 4) * 4;
  const item = { offset: byteLength, length: array.length }; byteLength += array.byteLength;
  return [name, item];
}));
const field = ({ heights, ...metadata }) => metadata;
// Light v1 fixes the row-run layout; its loader fetches the containing binary, not the original mask URL.
// Keep source delivery metadata in the original manifest (hashed in provenance), outside retained runtime data.
const mask = { ...manifest.mask };
delete mask.url;
delete mask.encoding;
const header = { format: 'sf-light-terrain', version: 1, waterLevel: manifest.waterLevel,
  city: field(city), horizon: field(horizon), mask, layout };
let json = Buffer.from(JSON.stringify(header));
json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const output = Buffer.alloc(8 + json.length + byteLength);
output.write('SFB1'); output.writeUInt32LE(json.length, 4); json.copy(output, 8);
for (const [name, array] of Object.entries(arrays))
  Buffer.from(array.buffer, array.byteOffset, array.byteLength).copy(output, 8 + json.length + layout[name].offset);
const compressed = gzipSync(output, { level: 9 });
const provenance = { description: 'Terrain-only phone tier derived locally from existing SF runtime data. Native city 8 m heights and exact 4 m classes; visual-only 256 m horizon.',
  license: 'ODbL geographic data; retain NOTICE.md, provenance/data-sources.md and upstream credits.',
  sources, outputs: { 'data/light-terrain.bin': { sha256: sha(output), bytes: output.length },
    'data/light-terrain.bin.gz': { sha256: sha(compressed), bytes: compressed.length } },
  decodedBytes: Object.fromEntries(Object.entries(arrays).map(([k, a]) => [k, a.byteLength])) };
const files = { 'data/light-terrain.bin': output, 'data/light-terrain.bin.gz': compressed,
  'provenance/light-terrain.json': Buffer.from(JSON.stringify(provenance, null, 2) + '\n') };
for (const [name, bytes] of Object.entries(files)) {
  if (check) { if (!fs.readFileSync(path.join(root, name)).equals(bytes)) throw Error('Stale light terrain: ' + name); }
  else fs.writeFileSync(path.join(root, name), bytes);
}
console.log(JSON.stringify({ check, bytes: output.length, compressed: compressed.length, decoded: provenance.decodedBytes }));
