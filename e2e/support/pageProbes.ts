import type { Page } from '@playwright/test';

declare global {
  interface Window {
    e2eProbes?: {
      /** The width a CSS length resolves to, in px, measured on a hidden box inside `within`. `var()` works. */
      px(length: string, within?: Element): number;
    };
  }
}

const define = () => {
  if (window.e2eProbes) return;
  window.e2eProbes = {
    px(length, within = document.body) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;width:${length}`;
      within.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    },
  };
};

const wired = new WeakSet<Page>();

/**
 * Puts `window.e2eProbes` into the page now and into every page it loads after, for use inside
 * `evaluate`. Lengths written as expressions resolve to pixels only in the browser.
 */
export async function installProbes(page: Page): Promise<void> {
  if (!wired.has(page)) {
    wired.add(page);
    await page.addInitScript(define);
  }
  await page.evaluate(define);
}
