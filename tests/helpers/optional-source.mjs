// Optional comparison inputs are not shipped with every source copy. Once a ref/package
// exists, read/import failures and every comparison assertion must still fail normally.
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function gitHistory(root, ref) {
  const probe = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' });
  if (probe.error) throw probe.error;
  const absent = probe.status === 1 || (probe.status === 128 && /not a git repository/i.test(probe.stderr));
  if (probe.status !== 0 && !absent) {
    throw new Error(`Git history probe failed: ${probe.stderr}`);
  }
  const available = probe.status === 0;
  return {
    available,
    skip: available ? false : `optional comparison history ${ref} is unavailable`,
    read(path) {
      if (!available) return null;
      return execFileSync('git', ['show', `${ref}:${path}`], {
        cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
      });
    }
  };
}

export function optionalSourceTest(skip) {
  return (name, options, fn) => {
    if (typeof options === 'function') { fn = options; options = {}; }
    return test(name, { ...options, skip: skip || options?.skip }, fn);
  };
}

export function offlineGeoSkip(root) {
  const require = createRequire(new URL('tools/package.json', root));
  const missing = [];
  for (const name of ['geotiff', 'proj4']) {
    try { require.resolve(name); }
    catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      // A present installation with a broken entry point is an error, not optional absence.
      if (require.resolve.paths(name).some(path => existsSync(join(path, name)))) throw error;
      missing.push(name);
    }
  }
  return missing.length ? `optional offline tool dependencies unavailable: ${missing.join(', ')}` : false;
}
