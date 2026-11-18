// Compiles the Solid adapter the way Solid packages ship: tsc has written dist/solid/index.jsx
// with the JSX kept, for the `solid` export condition, and Babel turns it into a DOM build and a
// server build, both hydratable.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { transformAsync } from '@babel/core';
import solid from 'babel-preset-solid';

const dir = fileURLToPath(new URL('../dist/solid/', import.meta.url));
const source = await readFile(`${dir}index.jsx`, 'utf8');

for (const [file, generate] of [['index.js', 'dom'], ['server.js', 'ssr']]) {
  const result = await transformAsync(source, {
    filename: `${dir}index.jsx`,
    babelrc: false,
    configFile: false,
    presets: [[solid, { generate, hydratable: true }]],
    sourceMaps: false,
  });
  await writeFile(`${dir}${file}`, result.code);
}
