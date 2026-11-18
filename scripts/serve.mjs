// Serves the playground and the built package for the e2e specs and for trying the stack by hand.
// /ssr.html and /book-ssr.html are rendered on each request with renderStack and renderBook, the
// way a server would.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bookPages } from '../playground/book-pages.mjs';
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

const bookSsr = async (url) => {
  const { renderBook } = await import(`../dist/index.js?${Date.now()}`);
  const template = await readFile(join(root, 'playground/book-ssr.html'), 'utf8');
  const options = { startPage: Number(url.searchParams.get('start') ?? 0) };
  const display = url.searchParams.get('display');
  if (display) options.display = display;
  const book = renderBook({
    label: 'Rendered book',
    tag: 'article',
    className: 'demo-book',
    pages: bookPages('Rendered', url.searchParams.has('pages') ? Number(url.searchParams.get('pages')) : undefined),
    options,
  });
  return template.replace('<!-- book -->', book);
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  try {
    if (url.pathname === '/ssr.html' || url.pathname === '/book-ssr.html') {
      response.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
      response.end(await (url.pathname === '/ssr.html' ? ssr : bookSsr)(url));
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
