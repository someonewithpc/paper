import { execFileSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['E2E_PORT'] ?? 4321);

// Playwright's downloaded Chromium doesn't run on NixOS, so the specs drive a system Chrome.
function systemChrome(): string {
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      continue;
    }
  }
  throw new Error('No Chrome or Chromium on PATH');
}

const chrome = { ...devices['Desktop Chrome'], launchOptions: { executablePath: systemChrome() } };

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  // Several specs time the page's own frames, which a crowded machine slows down for real.
  workers: Number(process.env['E2E_WORKERS'] ?? 6),
  forbidOnly: !!process.env['CI'],
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', grepInvert: /@noscript/, use: chrome },
    { name: 'chromium-noscript', grep: /@noscript/, use: { ...chrome, javaScriptEnabled: false } },
  ],
  webServer: {
    command: `npm run build && node scripts/serve.mjs`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT) },
  },
});
