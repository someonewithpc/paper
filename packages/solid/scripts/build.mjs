// Compiles the Solid adapter the way Solid packages ship: tsc has written dist/index.jsx
// with the JSX kept, for the `solid` export condition, and Babel turns it into a DOM build and a
// server build, both hydratable.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { transformAsync } from '@babel/core';
import solid from '@solidjs/babel-plugin';

const dir = fileURLToPath(new URL('../dist/', import.meta.url));
const source = await readFile(`${dir}index.jsx`, 'utf8');

for (const [file, generate] of [['index.js', 'dom'], ['server.js', 'ssr']]) {
  const result = await transformAsync(source, {
    filename: `${dir}index.jsx`,
    babelrc: false,
    configFile: false,
    plugins: [[solid, { generate, hydratable: true }]],
    sourceMaps: false,
  });
  await writeFile(`${dir}${file}`, result.code);
}
