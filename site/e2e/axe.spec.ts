import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const cases = [
  { width: 1440, colorScheme: 'light' },
  { width: 1440, colorScheme: 'dark' },
  { width: 390, colorScheme: 'light' },
  { width: 390, colorScheme: 'dark' },
] as const;

for (const { width, colorScheme } of cases) {
  test(`axe finds no violations at ${width} px in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.locator('.no-script-frame').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    // axe can't run inside the frame, whose sandbox blocks scripts. The noscript spec checks its page.
    const { violations } = await new AxeBuilder({ page }).exclude('.no-script-frame').analyze();
    const summary = violations.map(({ id, impact, nodes }) => `${id} (${impact}): ${nodes.map((node) => node.target.join(' ')).join(', ')}`);
    expect(summary).toEqual([]);
  });
}

// Playwright can't evaluate in a page with JavaScript off, so axe checks the frame's page with it
// on. The markup is the same; the no-script carousel styles don't apply.
test('axe finds no violations on the no-script page', async ({ page }) => {
  await page.goto('/no-script/');
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
});
