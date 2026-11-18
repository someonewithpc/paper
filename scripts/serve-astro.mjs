// Builds the Astro playground against the workspace's @someonewithpc/paper-astro, the way the
// adapter pages use theirs, and serves the build.
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, preview } from 'astro';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const playground = join(root, 'playground/astro');
const port = Number(process.env.PORT ?? 4323);

await build({ root: playground, logLevel: 'warn' });
await preview({ root: playground, logLevel: 'warn', server: { port } });
console.log(`astro playground on http://localhost:${port}/`);
