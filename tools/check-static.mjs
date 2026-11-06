// Cheap source/package checks only: no browser, game execution, data regeneration or publication.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { collectStaticFiles, PUBLIC_FILES } from './static-files.mjs';

const source = path.resolve(import.meta.dirname, '..');
const root = path.join(source, 'dist');
const expected = ['.nojekyll', ...await collectStaticFiles(source)].sort();
async function walk(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    assert(!entry.isSymbolicLink(), `package symlink: ${name}`);
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), `${name}/`));
    else { assert(entry.isFile(), `not a regular file: ${name}`); result.push(name); }
  }
  return result;
}
const actual = (await walk(root)).sort();
assert.deepEqual(actual, expected, 'package must match the explicit runtime/public inventory, with no stale/private files');
const assets = new Set(actual);
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const importMap = JSON.parse(html.match(/<script\s+type="importmap"[^>]*>([^]*?)<\/script>/)?.[1] ?? '{}').imports ?? {};
let references = 0;
const missing = new Set();
function reference(specifier, from) {
  if (/^(?:data:|blob:|#)/.test(specifier)) return;
  assert(!/^(?:https?:)?\/\//.test(specifier), `external runtime dependency: ${from} -> ${specifier}`);
  if (!specifier.startsWith('.')) {
    const key = Object.keys(importMap).sort((a, b) => b.length - a.length)
      .find(key => key === specifier || (key.endsWith('/') && specifier.startsWith(key)));
    assert(key, `unmapped dependency: ${from} -> ${specifier}`);
    const mapped = importMap[key] + specifier.slice(key.length);
    return reference(mapped.startsWith('.') ? mapped : `./${mapped}`, 'index.html');
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier.split(/[?#]/)[0]));
  assert(!resolved.startsWith('../'), `dependency escapes package: ${from} -> ${specifier}`);
  if (!assets.has(resolved)) missing.add(`${from} -> ${specifier} (${resolved})`);
  references++;
}
for (const [file, pattern] of [
  ['index.html', /<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g],
]) for (const match of html.matchAll(pattern)) {
  const url = match[1];
  // Static runtime links are project-relative; navigation and attribution anchors are not fetches.
  reference(url.startsWith('.') || /^(?:[a-z]+:|\/|#)/i.test(url) ? url : `./${url}`, file);
}
for (const file of actual.filter(name => /\.(?:js|css)$/.test(name))) {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  if (file.endsWith('.css')) {
    for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g)) {
      const url = match[1] ?? match[2] ?? match[3];
      reference(url.startsWith('.') || /^(?:[a-z]+:|\/|#)/i.test(url) ? url : `./${url}`, file);
    }
  } else {
    for (const pattern of [
      /^\s*(?:import|export)\s+(?:[\w*{},\s]+?\s+from\s*)?['"]([^'"\n]+)['"]/gm,
      /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
      /\bnew\s+URL\(\s*['"]([^'"\n]+)['"]/g,
    ]) for (const match of text.matchAll(pattern)) reference(match[1], file);
  }
}
const bootstrap = await fs.readFile(path.join(root, 'js/sf-bootstrap.js'), 'utf8');
const scripts = bootstrap.match(/CITY_SCRIPTS\s*=\s*Object\.freeze\(\[([^]*?)\]\)/)?.[1];
assert(scripts, 'ordered classic city script list must be identifiable');
for (const match of scripts.matchAll(/'([a-z0-9-]+)'/g)) reference(`./${match[1]}.js`, 'js/sf-bootstrap.js');
const eucManifest = JSON.parse(await fs.readFile(path.join(root, 'js/euc/MANIFEST.json'), 'utf8'));
const preloads = [...html.matchAll(/<link\s+rel="modulepreload"\s+href="\.\/js\/euc\/([^"]+)"[^>]*>/g)].map(match => match[1]);
assert.deepEqual(preloads.slice().sort(), eucManifest.eager.slice().sort(), 'native EUC preloads must equal the generated eager inventory');
assert.deepEqual(actual.filter(name => name.startsWith('js/euc/') && name.endsWith('.js')).map(name => name.slice(7)).sort(),
  [...eucManifest.eager, ...eucManifest.deferred].sort(), 'packaged EUC modules must equal the generated eager/deferred inventory');

// Public documentation links cannot silently depend on filtered private handover. Local donor hashes are
// historical identifiers, not claims that the public project URL contains those commits or their Git history.
const seed = JSON.parse(await fs.readFile(path.join(root, 'provenance/nyc-integration.json'), 'utf8'));
const localRevisions = [seed.localDonorRevision, seed.runtimeRevision].filter(Boolean);
for (const { path: seedPath } of seed.files) {
  assert(!path.posix.isAbsolute(seedPath) && !seedPath.startsWith('../') && !seedPath.includes('\\')
    && path.posix.normalize(seedPath) === seedPath, `non-repository-relative historical seed path: ${seedPath}`);
}
const publicDocs = [...PUBLIC_FILES.filter(name => name.endsWith('.md')), 'audio/euc/PROVENANCE.md',
  ...actual.filter(name => name.startsWith('provenance/') && name.endsWith('.md'))];
let documentLinks = 0;
for (const file of [...publicDocs, ...actual.filter(name => name.startsWith('provenance/') && name.endsWith('.json'))]) {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  assert(!/(?:file:\/\/|\/home\/|\/Users\/|[a-z]:[\\/]Users[\\/])/i.test(text), `private local path in public documentation/provenance: ${file}`);
  for (const url of text.matchAll(/https?:\/\/[^\s<>"`]+/g)) {
    assert(!localRevisions.some(revision => url[0].includes(revision)), `local-only donor revision advertised as a public URL: ${file}`);
  }
  if (!file.endsWith('.md')) continue;
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:\/\/|#)/.test(target)) continue;
    assert(!/^(?:[a-z]+:|\/)/i.test(target), `non-project documentation link: ${file} -> ${target}`);
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target.split(/[?#]/)[0])));
    assert(assets.has(resolved), `public document link points outside package: ${file} -> ${target}`);
    documentLinks++;
  }
}

// GEO.data.region is documented legacy metadata, not a loader consumer. Never repackage that old binary.
const geodata = await fs.readFile(path.join(root, 'js/sf-geodata.js'), 'utf8');
const geo = JSON.parse(geodata.match(/window\.NYC\.GEO\s*=\s*([^]*);\s*\}\)\(\);/)?.[1] ?? '{}');
// Generated URLs name the raw SFB1 bytes; js/data-loader.js fetches their lossless `.gz` delivery copies.
for (const name of ['terrain', 'buildings', 'groundMask']) reference(`./${geo.data[name].url}.gz`, 'index.html');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/region/manifest.json'), 'utf8'));
function collect(value) {
  if (typeof value === 'string' && value.endsWith('.bin')) reference(`./${value}.gz`, 'index.html');
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(manifest);
let binaryCount = 0;
let packageBytes = 0;
for (const file of actual) {
  const bytes = await fs.readFile(path.join(root, file));
  packageBytes += bytes.length;
  assert(bytes.length > 0 || file === '.nojekyll', `empty static file: ${file}`);
  if (file !== '.nojekyll') assert(bytes.equals(await fs.readFile(path.join(source, file))), `package/source mismatch: ${file}`);
  assert(!(file.startsWith('data/') && file.endsWith('.bin')), `raw SFB1 data must ship only as .gz: ${file}`);
  if (file.startsWith('data/') && file.endsWith('.bin.gz')) {
    // Lossless delivery: the packaged gzip must inflate to exactly the committed raw SFB1 bytes.
    const raw = zlib.gunzipSync(bytes);
    assert(raw.equals(await fs.readFile(path.join(source, file.slice(0, -3)))), `gzip does not inflate to committed bytes: ${file}`);
    assert.equal(raw.toString('ascii', 0, 4), 'SFB1', `binary magic: ${file}`);
    assert(raw.readUInt32LE(4) + 8 <= raw.length, `truncated binary: ${file}`);
    binaryCount++;
  }
}
for (const name of ['.git', '.github', '.claude', 'AGENTS.md', 'DESIGN.md', 'CHANGELOG.md', 'PLAN.md',
  'docs', 'tests', 'tools', 'qa-artifacts', 'data/raw', 'data/terrain-region.bin', 'assets/og-waymo.jpg',
  'js/ride.js', 'js/ride-ui.js', 'js/ride-audio.js', 'js/waymo-detail.js', 'js/settings.js']) {
  assert(!actual.some(file => file === name || file.startsWith(`${name}/`)), `excluded from local package: ${name}`);
}
assert.equal(missing.size, 0, `Missing local dependencies:\n${[...missing].join('\n')}`);
console.log(`Verified ${actual.length} local packaged files, ${references} dependency references, ${binaryCount} SFB1 headers and exact source bytes.`);
console.log(`Package payload: ${packageBytes} bytes (uncompressed file contents; excludes filesystem/HTTP overhead).`);
console.log(`Public documents: ${documentLinks} local links resolved; no private checkout paths or public links to local-only donor hashes.`);
console.log(`EUC inventory: ${eucManifest.eager.length + eucManifest.deferred.length} modules / ${eucManifest.eager.length} eager / ${eucManifest.deferred.length} deferred; ${actual.filter(name => name.startsWith('audio/euc/') && name.endsWith('.wav')).length} WAVs.`);
console.log('This checks packaging, not browser behavior, curated export privacy or release acceptance.');
