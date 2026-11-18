import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

// A trace injects its snapshot script into every frame, and the sandboxed frame logs that as a
// blocked script, which no reader would see.
test.use({ trace: 'off' });

test('the page loads with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pages you turn by folding the corner');
  await expect(page.locator('#hero-stack .paper-front')).toBeVisible();
  await page.locator('.no-script-frame').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
