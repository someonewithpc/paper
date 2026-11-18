import { defineConfig } from 'astro/config';

export default defineConfig({
  outDir: './dist',
  devToolbar: { enabled: false },
  vite: { logLevel: 'warn' },
});
