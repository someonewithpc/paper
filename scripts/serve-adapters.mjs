// Serves the framework adapters' playground pages from Vite in middleware mode: each page is
// rendered on the server by the framework, then hydrated by its client entry. The adapters are
// imported as `@someonewithpc/paper/<framework>`, through a link to the core package, so the pages use the
// built files and the export conditions a user's bundler would.
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer as createVite } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const playground = join(root, 'playground/adapters');
const port = Number(process.env.PORT ?? 4322);

const link = join(playground, 'node_modules/@someonewithpc/paper');
await mkdir(join(playground, 'node_modules/@someonewithpc'), { recursive: true });
await symlink(join(root, 'packages/paper'), link, 'dir').catch((error) => {
  if (error.code !== 'EEXIST') throw error;
});

const vite = await createVite({
  configFile: join(playground, 'vite.config.ts'),
  root,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

const frameworks = JSON.parse(await readFile(join(playground, 'frameworks.json'), 'utf8'));

createServer((request, response) => {
  vite.middlewares(request, response, async () => {
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);
    if (url.pathname === '/health') {
      response.end('ok');
      return;
    }
    const name = url.pathname.match(/^\/([a-z]+)\/$/)?.[1];
    const framework = name && frameworks[name];
    if (!framework) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    try {
      const template = (await readFile(join(playground, 'template.html'), 'utf8'))
        .replaceAll('<!--title-->', framework.title)
        .replace('<!--entry-->', `/playground/adapters/${name}/${framework.client}`);
      const { render } = await vite.ssrLoadModule(`/playground/adapters/${name}/${framework.server}`);
      const html = await vite.transformIndexHtml(url.pathname, template.replace('<!--app-->', await render()));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      console.error(error);
      response.writeHead(500, { 'content-type': 'text/plain' });
      response.end(String(error.stack ?? error));
    }
  });
}).listen(port, () => console.log(`adapter playground on http://localhost:${port}/`));
