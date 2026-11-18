// Serves the playground and the built package for the e2e specs and for trying the stack by hand.
// /ssr.html is rendered on each request with renderStack, the way a server would.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pages } from '../playground/pages.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT ?? 4320);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const ssr = async (url) => {
  const { renderStack } = await import(`../dist/index.js?${Date.now()}`);
  const template = await readFile(join(root, 'playground/ssr.html'), 'utf8');
  const startPage = Number(url.searchParams.get('start') ?? 0);
  const stack = renderStack({
    label: 'Rendered stack',
    tag: 'article',
    className: 'demo-stack',
    pages: pages('Rendered'),
    options: { startPage },
  });
  return template.replace('<!-- stack -->', stack);
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  try {
    if (url.pathname === '/ssr.html') {
      response.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
      response.end(await ssr(url));
      return;
    }
    const path = url.pathname === '/' ? '/playground/index.html' : url.pathname;
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error('outside the root');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
}).listen(port, () => console.log(`playground on http://localhost:${port}/`));
