import { defineConfig } from 'vite';

export default defineConfig({
  logLevel: 'warn',
  // Dependencies are pre-bundled when the server starts, not when a page first asks for them,
  // which would reload the page under a running spec.
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
});
