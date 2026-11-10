// Lossless gzip delivery copies of the committed SFB1 runtime data. No download, regeneration or
// change to the raw bytes: each `X.bin.gz` must inflate to exactly the committed `X.bin`.
// The raw files stay the repository/test source of truth; the preview/package serve only `.bin.gz`
// (js/data-loader.js sniffs gzip magic, so a host that already applied Content-Encoding still works).
//   node tools/compress-data.mjs          write/refresh every .bin.gz
//   node tools/compress-data.mjs --check  verify exact inflation, completeness and no orphans
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
export const CORE_DATA = Object.freeze(['terrain-core.bin', 'buildings-core.bin', 'groundmask-core.bin']);
export const TIER_DATA = Object.freeze(['light-terrain.bin']);

export async function runtimeBinaries(base = root) {
  const region = (await fs.readdir(path.join(base, 'data/region'))).filter(name => name.endsWith('.bin')).sort();
  return [...CORE_DATA.map(name => `data/${name}`), ...TIER_DATA.map(name => `data/${name}`), ...region.map(name => `data/region/${name}`)];
}

export async function compressedOrphans(base = root, expected) {
  const wanted = new Set(expected.map(name => `${name}.gz`)), orphans = [];
  for (const directory of ['data', 'data/region']) {
    for (const name of await fs.readdir(path.join(base, directory))) {
      const file = `${directory}/${name}`;
      if (name.endsWith('.gz') && !wanted.has(file)) orphans.push(file);
    }
  }
  return orphans;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const check = process.argv.includes('--check');
  const files = await runtimeBinaries();
  let raw = 0, packed = 0, written = 0;
  for (const name of files) {
    const bytes = await fs.readFile(path.join(root, name));
    if (bytes.toString('ascii', 0, 4) !== 'SFB1') throw new Error(`not SFB1: ${name}`);
    const target = path.join(root, `${name}.gz`);
    let gz = null;
    try { gz = await fs.readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!gz || !zlib.gunzipSync(gz).equals(bytes)) {
      if (check) throw new Error(`${name}.gz is missing or does not inflate to the committed bytes`);
      gz = zlib.gzipSync(bytes, { level: 9 });
      if (!zlib.gunzipSync(gz).equals(bytes)) throw new Error(`gzip round trip failed: ${name}`);
      await fs.writeFile(target, gz); written++;
    }
    raw += bytes.length; packed += gz.length;
  }
  const orphans = await compressedOrphans(root, files);
  if (orphans.length) throw new Error(`orphan compressed data: ${orphans.join(', ')}`);
  console.log(`${files.length} SFB1 files: ${raw} raw bytes -> ${packed} gzip bytes${check ? ' (verified exact)' : `; ${written} written`}`);
}
