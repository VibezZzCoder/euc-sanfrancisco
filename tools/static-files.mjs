// Local preview/package boundary; not a curated source exporter or deployment tool.
import fs from 'node:fs/promises';
import path from 'node:path';

export const PUBLIC_FILES = Object.freeze([
  'index.html', 'manifest.webmanifest', 'README.md', 'PLAYER_GUIDE.md', 'CONTRIBUTING.md', 'LICENSE', 'NOTICE.md',
  'NOTICE-EUC-THRILLS.md', 'FORK_GUIDE.md', 'LICENSING.md',
]);
export const PUBLIC_DIRECTORIES = Object.freeze(['css', 'js', 'audio', 'fonts', 'vendor', 'provenance']);
// SFB1 data is delivered only as lossless gzip copies (tools/compress-data.mjs); raw .bin stays repository-only.
export const DATA_FILES = Object.freeze(['terrain-core.bin.gz', 'buildings-core.bin.gz', 'groundmask-core.bin.gz', 'light-terrain.bin.gz']);
export const REQUIRED_FILES = Object.freeze([
  ...PUBLIC_FILES, ...DATA_FILES.map(name => `data/${name}`),
  'data/region/manifest.json', 'css/style.css', 'css/fonts.css', 'js/boot.js', 'js/main.js',
  'js/sf-bootstrap.js', 'js/euc/LICENSE', 'js/euc/MANIFEST.json', 'audio/euc/PROVENANCE.md',
  'vendor/MANIFEST.json', 'vendor/three/LICENSE', 'fonts/OFL-Inter.txt', 'fonts/OFL-Overpass.txt',
  'assets/app-icon-180.png', 'assets/app-icon-192.png', 'assets/app-icon-512.png',
  'provenance/README.md', 'provenance/data-sources.md', 'provenance/formats.md',
]);
const privatePart = name => name.startsWith('.') || ['node_modules', 'qa-artifacts', '__pycache__'].includes(name);

export async function collectStaticFiles(root, { packaged = false } = {}) {
  const files = [];
  async function visit(relative, optional = false, skip = null) {
    let stat;
    try { stat = await fs.lstat(path.join(root, relative)); }
    catch (error) { if (optional && error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Static inputs cannot be symlinks: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
        if (!privatePart(name) && !/\.(?:map|test\.[cm]?js|tmp)$/.test(name) && !skip?.test(name)) await visit(`${relative}/${name}`);
      }
    } else if (stat.isFile()) files.push(relative);
    else throw new Error(`Unsupported static input: ${relative}`);
  }
  for (const name of PUBLIC_FILES) await visit(name);
  for (const name of PUBLIC_DIRECTORIES) await visit(name);
  await visit('assets', true);
  for (const name of DATA_FILES) await visit(`data/${name}`);
  await visit('data/region', false, /\.bin$/);
  if (packaged) await visit('.nojekyll');
  const inventory = new Set(files);
  for (const name of REQUIRED_FILES) {
    if (!inventory.has(name)) throw new Error(`Required static input missing: ${name}`);
  }
  return files.sort();
}
