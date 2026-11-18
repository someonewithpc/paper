import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  logLevel: 'warn',
  // Solid compiles its own JSX, so it only gets the Solid files; Vite turns React's into calls.
  plugins: [svelte(), solid({ ssr: true, include: ['playground/adapters/solid/**', 'dist/solid/**'] })],
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
  },
  // Dependencies are pre-bundled when the server starts, not when a page first asks for them,
  // which would reload the page under a running spec.
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'vue', 'solid-js', 'solid-js/web'],
  },
});
