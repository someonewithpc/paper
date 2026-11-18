import { execFileSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['SITE_E2E_PORT'] ?? 4331);

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
  workers: Number(process.env['E2E_WORKERS'] ?? 4),
  forbidOnly: !!process.env['CI'],
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', grepInvert: /@noscript/, use: chrome },
    { name: 'chromium-noscript', grep: /@noscript/, use: { ...chrome, javaScriptEnabled: false } },
  ],
  webServer: {
    // Astro backgrounds preview when it detects an agent; --ignore-lock keeps it in the foreground,
    // where Playwright stops it.
    command: `npx astro build && npx astro preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
