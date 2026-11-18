import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [svelte()],
        test: { name: 'unit', include: ['test/**/*.test.{ts,tsx}'], exclude: ['test/solid*'], environment: 'node' },
      },
      {
        // Solid's JSX compiles to its own runtime, so its tests get the Solid plugin and nothing else.
        plugins: [solid({ ssr: true })],
        test: { name: 'solid', include: ['test/solid*.test.tsx'], environment: 'node' },
      },
    ],
  },
});
