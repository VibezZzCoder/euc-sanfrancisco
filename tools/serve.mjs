// Dependency-free loopback preview of allowlisted runtime/public files, never the repository root.
// node tools/serve.mjs [port=8002] [--dist]
// Explicit port 0 asks the OS for an isolated available port (used by HTTP regression tests).
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { collectStaticFiles } from './static-files.mjs';

const args = process.argv.slice(2);
const ports = args.filter(arg => arg !== '--dist');
if (ports.length > 1 || ports.some(arg => !/^\d+$/.test(arg))) throw new Error('Usage: node tools/serve.mjs [port] [--dist]');
const port = Number(ports[0] ?? 8002);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be 0–65535 (0 selects an available port)');
const packaged = args.includes('--dist');
const root = await fs.realpath(path.resolve(import.meta.dirname, packaged ? '../dist' : '..'));
const allowed = new Set(await collectStaticFiles(root, { packaged }));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.bin': 'application/octet-stream', '.wav': 'audio/wav',
  // Plain gzip file bytes, deliberately without Content-Encoding (the loader inflates; GitHub Pages behaves alike).
  '.gz': 'application/gzip',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function reply(res, code, text, extra = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'text/plain; charset=utf-8', ...extra });
  res.end(text);
}
const server = http.createServer(async (req, res) => {
  const boundPort = server.address().port;
  if (![ `127.0.0.1:${boundPort}`, `localhost:${boundPort}` ].includes(req.headers.host)) return reply(res, 400, 'Invalid host');
  if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405, 'GET or HEAD only', { Allow: 'GET, HEAD' });
  let pathname;
  try { pathname = decodeURIComponent((req.url ?? '').split('?')[0]); }
  catch { return reply(res, 400, 'Malformed URL'); }
  if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(pathname)) return reply(res, 400, 'Invalid path');
  let relative = pathname.slice(1) || 'index.html';
  if (relative.split('/').some(part => part === '..' || part.startsWith('.'))) return reply(res, 404, 'Not found');
  if (!allowed.has(relative)) return reply(res, 404, 'Not found');
  const file = path.join(root, relative);
  try {
    // Recheck real paths per request: replacing an allowlisted file with a symlink cannot expose private files.
    if (await fs.realpath(file) !== file) return reply(res, 404, 'Not found');
    const stat = await fs.stat(file);
    if (!stat.isFile()) return reply(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end();
    else await pipeline(createReadStream(file), res);
  } catch (error) {
    if (res.headersSent) res.destroy();
    else reply(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Preview read failed');
  }
});
server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
server.on('error', error => { console.error(`Preview failed: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Local ${packaged ? 'package' : 'source'} preview: http://127.0.0.1:${server.address().port} (Ctrl+C to stop)`));
