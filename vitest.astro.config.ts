import { getViteConfig } from 'astro/config';

// Astro's own Vite setup, so the tests can render .astro components with its container.
export default getViteConfig({
  test: { name: 'astro', include: ['test/astro.test.ts'], environment: 'node' },
});
