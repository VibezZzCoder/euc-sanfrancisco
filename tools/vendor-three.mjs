#!/usr/bin/env node
// tools/vendor-three.mjs — keep three.js and the two web fonts in the repo, so the game loads from its own host only.
//
// usage: node tools/vendor-three.mjs            fetch the pinned files (network), write vendor/three/ and fonts/
//        node tools/vendor-three.mjs --check    offline: every file matches vendor/MANIFEST.json, and every three.js
//                                               module the game imports is there
//
// three.js: the pinned dev commit's own build files (build/three.webgpu.js, three.core.js, three.tsl.js) and the
// examples/jsm addons the game imports, with everything they import in turn, at their upstream paths under
// vendor/three/, unchanged and unminified (the same bytes the game was tested with; three.js has no official minified
// build of a dev commit, and GitHub Pages compresses them anyway). Plus three.js's LICENSE.
//
// Fonts: Inter (variable: opsz 14–32, wght 400–800) and Overpass (600, 700) from Google Fonts, latin and latin-ext
// subsets (the browser only fetches a subset when the page uses a character in it), as fonts/*.woff2 with their
// @font-face rules in css/fonts.css and their SIL OFL licences.
//
// To move three.js: change THREE_COMMIT, run this, run the tests and the browser QA. Node >= 18 (global fetch).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const THREE_COMMIT = 'e27dfa95ae7f453b5d7a9a36ffdb563f7c9b529b'; // mrdoob/three.js dev, 2026-10-23 (r187dev)
const THREE_RAW = `https://raw.githubusercontent.com/mrdoob/three.js/${THREE_COMMIT}/`;
const THREE_OUT = path.join(ROOT, 'vendor', 'three');
const BUILD = ['build/three.webgpu.js', 'build/three.core.js', 'build/three.tsl.js'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=Overpass:wght@600;700&display=swap';
const FONT_SUBSETS = new Set(['latin', 'latin-ext']);
const FONT_LICENCES = {
  Inter: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt',
  Overpass: 'https://raw.githubusercontent.com/google/fonts/main/ofl/overpass/OFL.txt',
};
// Google Fonts serves woff2 with unicode-range subsets only to a current browser
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MANIFEST = path.join(ROOT, 'vendor', 'MANIFEST.json');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Relative and three/addons/ module specifiers of a source file. Import statements start a line, so JSDoc examples
// (" * import ...") are not taken.
function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gms)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

// Every three/addons/ module the game's own code imports (js/, not the vendored folders)
function gameAddonImports() {
  const found = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        for (const s of importsOf(fs.readFileSync(p, 'utf8'))) if (s.startsWith('three/addons/')) found.add(s);
      }
    }
  };
  walk(path.join(ROOT, 'js'));
  return [...found].sort();
}

// The three.js files the game needs: the build files, the addons it imports and their own relative imports
function closure(read) {
  const need = new Set(BUILD);
  const queue = [...BUILD, ...gameAddonImports().map((s) => 'examples/jsm/' + s.slice('three/addons/'.length))];
  for (const q of queue) need.add(q);
  return (async () => {
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      const src = await read(file);
      for (const s of importsOf(src)) {
        let next = null;
        if (s.startsWith('three/addons/')) next = 'examples/jsm/' + s.slice('three/addons/'.length);
        else if (s.startsWith('.')) next = path.posix.normalize(path.posix.join(path.posix.dirname(file), s));
        if (next && !need.has(next)) {
          need.add(next);
          queue.push(next);
        }
      }
    }
    return [...need].sort();
  })();
}

async function get(url, as = 'text', headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}

async function fetchAll() {
  const files = {}; // repo path -> Buffer
  const cache = new Map();
  const read = async (file) => {
    if (!cache.has(file)) cache.set(file, await get(THREE_RAW + file));
    return cache.get(file);
  };
  const list = await closure(read);
  for (const f of list) files[rel(path.join(THREE_OUT, f))] = Buffer.from(await read(f));
  files[rel(path.join(THREE_OUT, 'LICENSE'))] = Buffer.from(await get(THREE_RAW + 'LICENSE'));

  // Fonts: keep the latin and latin-ext @font-face rules, point them at local files
  const css = await get(FONT_CSS, 'text', { 'User-Agent': BROWSER_UA });
  const rules = [];
  const names = new Map(); // font URL -> local file name
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)) {
    const [, subset, rule] = m;
    if (!FONT_SUBSETS.has(subset)) continue;
    const family = /font-family:\s*'([^']+)'/.exec(rule)[1];
    const weight = /font-weight:\s*([\d ]+);/.exec(rule)[1].trim().replace(' ', '-');
    const url = /url\(([^)]+)\)/.exec(rule)[1];
    // One file per URL: Google serves a variable font for several weights (Overpass 600 and 700 share one)
    let name = names.get(url);
    if (!name) {
      name = `${family.toLowerCase()}-${subset}.woff2`;
      if (files[`fonts/${name}`]) name = `${family.toLowerCase()}-${weight}-${subset}.woff2`;
      names.set(url, name);
      files[`fonts/${name}`] = await get(url, 'buffer');
    }
    rules.push(`/* ${family} ${weight}, ${subset} */\n` + rule.replace(/url\([^)]+\)/, `url('../fonts/${name}')`));
  }
  if (rules.length < 4) throw new Error(`expected latin and latin-ext rules for both fonts, got ${rules.length}`);
  files['css/fonts.css'] = Buffer.from(
    '/* Generated by tools/vendor-three.mjs from Google Fonts. Inter and Overpass: SIL Open Font License 1.1\n'
    + '   (fonts/OFL-Inter.txt, fonts/OFL-Overpass.txt). Do not edit; re-run the tool. */\n\n' + rules.join('\n\n') + '\n');
  for (const [family, url] of Object.entries(FONT_LICENCES)) files[`fonts/OFL-${family}.txt`] = Buffer.from(await get(url));
  return files;
}

function check() {
  const problems = [];
  if (!fs.existsSync(MANIFEST)) {
    console.error('vendor/MANIFEST.json missing: run node tools/vendor-three.mjs');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (manifest.threeCommit !== THREE_COMMIT) problems.push(`manifest is for three.js@${manifest.threeCommit}, the tool pins ${THREE_COMMIT}`);
  for (const [file, hash] of Object.entries(manifest.files)) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) problems.push(`missing ${file}`);
    else if (sha256(fs.readFileSync(p)) !== hash) problems.push(`changed ${file}`);
  }
  // Every module the game imports must be vendored (offline closure over the local copies)
  return closure(async (f) => {
    const p = path.join(THREE_OUT, f);
    if (!fs.existsSync(p)) {
      problems.push(`not vendored: vendor/three/${f}`);
      return '';
    }
    return fs.readFileSync(p, 'utf8');
  }).then((list) => {
    for (const f of list) if (!manifest.files[rel(path.join(THREE_OUT, f))]) problems.push(`not in the manifest: vendor/three/${f}`);
    if (problems.length) {
      console.error(problems.join('\n') + '\nRun node tools/vendor-three.mjs');
      process.exit(1);
    }
    console.log(`vendor/ is current (three.js@${THREE_COMMIT.slice(0, 7)}, ${Object.keys(manifest.files).length} files)`);
  });
}

async function write() {
  const files = await fetchAll();
  // Replace the previous output entirely (no stale addons left behind)
  fs.rmSync(THREE_OUT, { recursive: true, force: true });
  for (const f of fs.existsSync(path.join(ROOT, 'fonts')) ? fs.readdirSync(path.join(ROOT, 'fonts')) : []) {
    fs.rmSync(path.join(ROOT, 'fonts', f));
  }
  const manifest = { threeCommit: THREE_COMMIT, fonts: FONT_CSS, files: {} };
  for (const [file, buf] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const p = path.join(ROOT, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
    manifest.files[file] = sha256(buf);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  const size = Object.values(files).reduce((a, b) => a + b.length, 0);
  console.log(`wrote ${Object.keys(files).length} files (${(size / 1e6).toFixed(2)} MB) and vendor/MANIFEST.json`);
}

if (process.argv.includes('--check')) await check();
else await write();
