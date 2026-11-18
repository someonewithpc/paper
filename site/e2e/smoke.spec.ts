import { expect, test, type Page } from '@playwright/test';

import { flapGrip } from '../../e2e/support/fold';

async function recordChanges(page: Page, selector: string) {
  await page.evaluate((target) => {
    const root = document.querySelector(target)!;
    (window as unknown as { changes: number[] }).changes = [];
    root.addEventListener('paper:change', (event) => (window as unknown as { changes: number[] }).changes.push((event as CustomEvent<{ index: number }>).detail.index));
  }, selector);
  return () => page.evaluate(() => (window as unknown as { changes: number[] }).changes);
}

test('the arrow keys turn the hero stack', async ({ page }) => {
  await page.goto('/');
  const changes = await recordChanges(page, '#hero-stack');
  await page.locator('#hero-stack').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(changes).toEqual([1]);
  await expect(page.locator('#hero-stack')).toHaveAttribute('data-paper-turned', '');
});

test.describe(() => {
  // The resting dog-ear's pulse would change the corner's size under the pointer.
  test.use({ reducedMotion: 'reduce' });

  test('dragging the dog-ear past the middle turns the page', async ({ page }) => {
    await page.goto('/');
    const stack = page.locator('#hero-stack');
    await stack.scrollIntoViewIfNeeded();
    const changes = await recordChanges(page, '#hero-stack');
    await expect
      .poll(() => stack.locator('.paper-fold').evaluate((fold) => parseFloat(getComputedStyle(fold).getPropertyValue('--paper-fold-x'))))
      .toBeGreaterThan(10);
    const grip = await flapGrip(stack);
    const box = (await stack.boundingBox())!;
    const target = { x: box.x + box.width * 0.15, y: box.y + box.height * 0.25 };
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    const steps = 16;
    for (let step = 1; step <= steps; step += 1) {
      await page.mouse.move(grip.x + ((target.x - grip.x) * step) / steps, grip.y + ((target.y - grip.y) * step) / steps);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await expect.poll(changes).toEqual([1]);
  });
});

test('the book opens at its first spread and turns', async ({ page }) => {
  await page.goto('/');
  const changes = await recordChanges(page, '#fold-book');
  await page.locator('#fold-book').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(changes).toEqual([3]);
});

test('a playground option rebuilds the controller', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Wrap from the last page to the first').uncheck();
  await expect(page.locator('#playground-code')).toContainText('wrap: false');
  await expect(page.locator('.tape-list li').first()).toContainText('createPaper');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('#playground-state')).toContainText('index: 1,');
});

test('the framework tabs switch with the arrow keys', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'React' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Vue' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Atlas.vue');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no horizontal scroll at 390 px in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
}

test('without JavaScript the hero stack is a scroll-snap row @noscript', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const stack = page.locator('#hero-stack');
  await expect(stack).toHaveCSS('scroll-snap-type', 'x mandatory');
  await expect(page.locator('.options')).toBeHidden();
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
});
