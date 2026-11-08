import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loader(fetch) {
  const window = { NYC: { GEO: {} } };
  vm.runInNewContext(readFileSync(new URL('../js/data-loader.js', import.meta.url), 'utf8'),
    { window, fetch, setTimeout: (f) => f(), TextDecoder, Response, Uint8Array, DataView });
  return window.NYC.fetchWithRetry;
}

test('transient 5xx and network errors are retried a bounded number of times', async () => {
  const seen = [];
  const replies = [() => { throw new TypeError('network'); }, () => ({ ok: false, status: 503 }), () => ({ ok: true, status: 200 })];
  const fetchWithRetry = loader(url => { seen.push(url); return replies[seen.length - 1](); });
  assert.equal((await fetchWithRetry('a.bin.gz')).status, 200);
  assert.equal(seen.length, 3);
});

test('404 fails at once and persistent 503 stops after three attempts', async () => {
  let calls = 0;
  assert.equal((await loader(() => { calls++; return { ok: false, status: 404 }; })('x')).status, 404);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal((await loader(() => { calls++; return { ok: false, status: 503 }; })('x')).status, 503);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(loader(() => { calls++; throw new TypeError('offline'); })('x'), /offline/);
  assert.equal(calls, 3);
});
