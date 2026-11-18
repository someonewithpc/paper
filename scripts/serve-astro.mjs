// Builds the Astro playground against the package, linked in as @hsal/paper the way the adapter
// pages are, and serves the build.
import { join } from 'node:path';

import { build, preview } from 'astro';

import { linkSelf, root } from './link-self.mjs';

const playground = join(root, 'playground/astro');
const port = Number(process.env.PORT ?? 4323);

await linkSelf(playground);
await build({ root: playground, logLevel: 'warn' });
await preview({ root: playground, logLevel: 'warn', server: { port } });
console.log(`astro playground on http://localhost:${port}/`);
