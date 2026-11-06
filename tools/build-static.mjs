// Local working-byte runtime package only. No Git, network, upload or deployment.
import fs from 'node:fs/promises';
import path from 'node:path';
import { collectStaticFiles } from './static-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');

// Validate every input before replacing this one generated directory.
const files = await collectStaticFiles(root);
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, '.nojekyll'), '');

for (const name of files) {
  const destination = path.join(out, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, name), destination);
}

console.log(`Local runtime package: ${out} (${files.length + 1} files). Run node tools/check-static.mjs.`);
console.log('Working bytes only: not a curated source export, release acceptance, upload or publication.');
