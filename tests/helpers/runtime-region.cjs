// Decode committed runtime data without importing the optional geographic baking tools.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function readBin(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('ascii', 0, 4), 'SFB1');
  const n = buf.readUInt32LE(4);
  const header = JSON.parse(buf.toString('utf8', 8, 8 + n));
  // Own aligned storage, including for files read from Node's pooled small buffers.
  const ab = buf.buffer.slice(buf.byteOffset + 8 + n, buf.byteOffset + buf.length);
  return { header, ab, payload: Buffer.from(ab) };
}

function loadRegionPatches(root, terrain) {
  const manifest = JSON.parse(readFileSync(join(root, 'data/region/manifest.json'), 'utf8'));
  assert.equal(manifest.version, 1);
  // Same city-before-horizon sampling priority and Float32 decoding as region.js.
  for (const tier of [manifest.city, manifest.horizon]) {
    const heights = new Float32Array(tier.w * tier.h).fill(manifest.waterLevel);
    for (const file of tier.files) {
      const { header: h, ab } = readBin(join(root, file.url));
      const q = new Uint16Array(ab, 0, h.w * h.h);
      const ix = Math.round((h.originX - tier.x0) / tier.step), iz = Math.round((h.originZ - tier.z0) / tier.step);
      for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) {
        heights[(iz + j) * tier.w + ix + i] = h.minH + q[j * h.w + i] * h.scale;
      }
    }
    terrain.addPatch({ x0: tier.x0, z0: tier.z0, step: tier.step, nx: tier.w, nz: tier.h, h: heights, rect: true });
  }
}

module.exports = { readBin, loadRegionPatches };
