// Real loopback HTTP regressions; no browser/game execution, package build or parent QA port.
// node --test tests/static-preview.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PUBLIC_DIRECTORIES, REQUIRED_FILES } from '../tools/static-files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const serverFile = path.join(root, 'tools/serve.mjs');
const timeout = async (promise, milliseconds, message) => {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
      timer.unref();
    })]);
  } finally { clearTimeout(timer); }
};

function childServer(t, file, packaged = false) {
  // Port 0 is assigned atomically by the OS. Never reserve or request 8002, even temporarily.
  const child = spawn(process.execPath, [file, '0', ...(packaged ? ['--dist'] : [])], {
    cwd: path.dirname(file), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout = (stdout + bytes).slice(-32768); });
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-32768); });
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', error => resolve({ error }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    try { await timeout(exited, 2000, 'Preview child did not stop'); }
    catch {
      child.kill('SIGKILL');
      await timeout(exited, 2000, 'Preview child survived SIGKILL');
    }
  });
  async function ready() {
    const listening = new Promise((resolve, reject) => {
      function check() {
        const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { child.stdout.off('data', check); resolve(Number(match[1])); }
      }
      child.stdout.on('data', check);
      check();
      exited.then(result => {
        child.stdout.off('data', check);
        reject(new Error(`Preview exited before readiness: ${JSON.stringify(result)}\n${stderr}`));
      });
    });
    const port = await timeout(listening, 10000, `Preview readiness timed out\n${stderr}`);
    assert.notEqual(port, 8002, 'parent QA port must never be used');
    assert(port > 0 && port <= 65535);
    return port;
  }
  return { child, exited, ready, output: () => ({ stdout, stderr }) };
}

function request(port, target, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    // Raw http.request path deliberately preserves encoded dot segments; fetch/URL normalizes some away.
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method, headers, agent: false }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', bytes => {
        size += bytes.length;
        if (size > 4 * 1024 * 1024) res.destroy(new Error('Unexpectedly large preview response'));
        else chunks.push(bytes);
      });
      res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error(`HTTP timeout: ${method} ${target}`)));
    req.once('error', reject);
    req.end();
  });
}

function responseHeaders(response, contentType) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  if (contentType) assert.equal(response.headers['content-type'], contentType);
}

async function fixture(t, { packaged = false } = {}) {
  const artifacts = path.join(root, 'qa-artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(artifacts, 'static-preview-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const site = path.join(temporary, 'site');
  const content = packaged ? path.join(site, 'dist') : site;
  await fs.mkdir(path.join(site, 'tools'), { recursive: true });
  for (const name of ['serve.mjs', 'static-files.mjs']) {
    await fs.copyFile(path.join(root, 'tools', name), path.join(site, 'tools', name));
  }
  for (const directory of PUBLIC_DIRECTORIES) await fs.mkdir(path.join(content, directory), { recursive: true });
  for (const name of [...REQUIRED_FILES, ...(packaged ? ['.nojekyll'] : []),
    '.git/config', 'AGENTS.md', '.env', 'docs/private.md', 'node_modules/private.js', 'js/.private.js',
    'js/public-probe.js', 'js/directory-probe/inside.js', 'docs/private-directory/inside.js']) {
    const file = path.join(content, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, name === '.nojekyll' ? '' : `fixture:${name}\n`);
  }
  await fs.writeFile(path.join(temporary, 'outside-private.txt'), 'private outside the preview root\n');
  return { temporary, content, file: path.join(site, 'tools/serve.mjs') };
}

test('source preview: actual public files, private paths and malformed requests', { timeout: 15000 }, async t => {
  const server = childServer(t, serverFile);
  const port = await server.ready();
  const index = await fs.readFile(path.join(root, 'index.html'));
  t.diagnostic(`isolated source child on loopback port ${port}; parent port 8002 unused`);

  await t.test('allowlisted index/runtime/font/audio/data files return exact bytes with no-store', async () => {
    for (const [target, file, contentType] of [
      ['/', 'index.html', 'text/html; charset=utf-8'],
      ['/index.html?fresh=1', 'index.html', 'text/html; charset=utf-8'],
      ['/js/boot.js', 'js/boot.js', 'text/javascript; charset=utf-8'],
      ['/css/style.css', 'css/style.css', 'text/css; charset=utf-8'],
      ['/fonts/inter-latin.woff2', 'fonts/inter-latin.woff2', 'font/woff2'],
      ['/audio/euc/overspeed_beep.wav', 'audio/euc/overspeed_beep.wav', 'audio/wav'],
      ['/data/region/manifest.json', 'data/region/manifest.json', 'application/json; charset=utf-8'],
      ['/data/groundmask-core.bin.gz', 'data/groundmask-core.bin.gz', 'application/gzip'],
      ['/data/region/trees.bin.gz', 'data/region/trees.bin.gz', 'application/gzip'],
      ['/NOTICE.md', 'NOTICE.md', 'text/plain; charset=utf-8'],
      ['/provenance/README.md', 'provenance/README.md', 'text/plain; charset=utf-8'],
    ]) {
      const response = await request(port, target);
      assert.equal(response.status, 200, target);
      responseHeaders(response, contentType);
      const expected = await fs.readFile(path.join(root, file));
      assert.equal(Number(response.headers['content-length']), expected.length, target);
      assert(response.body.equals(expected), `exact public bytes: ${target}`);
    }
  });
  await t.test('private root/docs/dependency paths and directory listings return 404', async () => {
    for (const target of ['/.git/config', '/docs/REMOVAL_INVENTORY.md', '/AGENTS.md',
      '/node_modules/private.js', '/tools/serve.mjs', '/.env', '/data/raw/MANIFEST.json', '/js/',
      '/data/terrain-core.bin', '/data/region/trees.bin']) {
      const response = await request(port, target);
      assert.equal(response.status, 404, target);
      responseHeaders(response);
      assert.equal(response.body.toString(), 'Not found');
    }
  });
  await t.test('raw and encoded dot/traversal paths cannot bypass the allowlist', async () => {
    for (const target of ['/../AGENTS.md', '/%2egit/config', '/%2Egit%2Fconfig', '/%2eenv',
      '/js/%2e%2e/AGENTS.md', '/js/%2e%2e%2fAGENTS.md', '/js/%2e/boot.js',
      '/js/%2e%2e/%2e%2e/.git/config', '/%252egit/config']) {
      const response = await request(port, target);
      assert.equal(response.status, 404, target);
      assert.equal(response.body.toString(), 'Not found');
    }
  });
  await t.test('malformed percent/UTF-8 paths return 400; each is followed by a healthy index response', async () => {
    for (const target of ['/%', '/%ZZ', '/%E0%A4%A', '/%FF']) {
      const rejected = await request(port, target);
      assert.equal(rejected.status, 400, target);
      responseHeaders(rejected);
      const healthy = await request(port, '/');
      assert.equal(healthy.status, 200, `server survived ${target}`);
      assert(healthy.body.equals(index));
      assert.equal(server.child.exitCode, null);
    }
  });
  await t.test('decoded control bytes, backslashes and non-origin paths are rejected', async () => {
    for (const target of ['/%00', '/js%5cboot.js', '//index.html']) {
      assert.equal((await request(port, target)).status, 400, target);
    }
  });
  await t.test('HEAD has GET metadata/length and no response body', async () => {
    const get = await request(port, '/js/boot.js');
    const head = await request(port, '/js/boot.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    responseHeaders(head, get.headers['content-type']);
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.body.length, 0);
    const missing = await request(port, '/AGENTS.md', { method: 'HEAD' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.length, 0);
  });
  await t.test('unsupported methods return 405 and advertise only GET/HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await request(port, '/', { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.allow, 'GET, HEAD');
      responseHeaders(response);
    }
  });
  await t.test('Host allowlist accepts localhost and rejects a foreign host', async () => {
    assert.equal((await request(port, '/', { headers: { Host: `localhost:${port}` } })).status, 200);
    assert.equal((await request(port, '/', { headers: { Host: `untrusted.invalid:${port}` } })).status, 400);
    assert.equal((await request(port, '/')).status, 200);
  });
  assert.equal(server.output().stderr, '', 'source preview logged no unexpected errors');
});

test('package preview uses --dist without exposing neighboring source/private files', { timeout: 15000 }, async t => {
  const files = await fixture(t, { packaged: true });
  const server = childServer(t, files.file, true);
  const port = await server.ready();
  const index = await request(port, '/');
  assert.equal(index.status, 200);
  responseHeaders(index, 'text/html; charset=utf-8');
  assert.equal(index.body.toString(), 'fixture:index.html\n');
  assert.equal((await request(port, '/js/boot.js')).status, 200);
  for (const target of ['/.git/config', '/docs/private.md', '/AGENTS.md', '/node_modules/private.js',
    '/js/.private.js', '/%2e%2e/tools/serve.mjs', '/dist/index.html']) {
    const response = await request(port, target);
    assert.equal(response.status, 404, target);
    assert.equal(response.body.toString(), 'Not found');
  }
  assert.equal(server.output().stderr, '');
});

test('startup fails closed on file and directory symlinks inside allowed roots', { timeout: 15000 }, async t => {
  const files = await fixture(t);
  for (const [name, target] of [['file-link.js', '../docs/private.md'], ['directory-link', '../docs']]) {
    const link = path.join(files.content, 'js', name);
    await fs.symlink(target, link);
    const server = childServer(t, files.file);
    const exit = await timeout(server.exited, 10000, 'Symlink-containing preview did not exit');
    assert.equal(exit.code, 1);
    assert.match(server.output().stderr, /Static inputs cannot be symlinks/);
    assert.doesNotMatch(server.output().stdout, /http:\/\/127\.0\.0\.1:/);
    await fs.unlink(link);
  }
});

test('post-start symlink swaps cannot expose private files or directories', { timeout: 15000 }, async t => {
  const files = await fixture(t);
  const server = childServer(t, files.file);
  const port = await server.ready();
  const file = path.join(files.content, 'js/public-probe.js');
  assert.equal((await request(port, '/js/public-probe.js')).status, 200);
  await fs.unlink(file);
  for (const target of [path.join(files.content, 'docs/private.md'), path.join(files.temporary, 'outside-private.txt')]) {
    await fs.symlink(target, file);
    const blocked = await request(port, '/js/public-probe.js');
    assert.equal(blocked.status, 404);
    assert.equal(blocked.body.toString(), 'Not found');
    assert.equal((await request(port, '/js/boot.js')).status, 200);
    await fs.unlink(file);
  }
  await fs.writeFile(file, 'restored ordinary public file\n');
  assert.equal((await request(port, '/js/public-probe.js')).body.toString(), 'restored ordinary public file\n');

  const directory = path.join(files.content, 'js/directory-probe');
  await fs.rm(directory, { recursive: true });
  await fs.symlink(path.join(files.content, 'docs/private-directory'), directory);
  const blockedDirectory = await request(port, '/js/directory-probe/inside.js');
  assert.equal(blockedDirectory.status, 404);
  assert.equal(blockedDirectory.body.toString(), 'Not found');
  assert.equal((await request(port, '/')).status, 200);
  assert.equal(server.output().stderr, '');
});
