// Links this package into a playground's node_modules as @hsal/paper, so the playground imports
// it by name and gets the files its exports name. Run with the playground's directory.
import { mkdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function linkSelf(directory) {
  await mkdir(join(directory, 'node_modules/@hsal'), { recursive: true });
  await symlink(root, join(directory, 'node_modules/@hsal/paper'), 'dir').catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await linkSelf(resolve(process.argv[2]));
