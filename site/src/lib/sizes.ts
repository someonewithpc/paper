import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { build } from 'esbuild';

// Measured from the package this build links, so the numbers on the page follow the source.
const require = createRequire(join(process.cwd(), 'package.json'));
const packageDir = dirname(require.resolve('@someonewithpc/paper/package.json'));

const kilobytes = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

async function gzippedScript(): Promise<number> {
  const result = await build({
    stdin: { contents: "export { createPaper } from './dist/index.js';", resolveDir: packageDir, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  return gzipSync(result.outputFiles[0]!.contents, { level: 9 }).byteLength;
}

async function gzippedStyles(): Promise<number> {
  return gzipSync(await readFile(join(packageDir, 'dist/styles.css')), { level: 9 }).byteLength;
}

export const sizes = {
  script: kilobytes(await gzippedScript()),
  styles: kilobytes(await gzippedStyles()),
};
