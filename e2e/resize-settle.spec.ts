import { expect, type Page, test } from '@playwright/test';

import { flapGrip } from './support/fold.js';
import { dogEarShown, frontPageIndex, playgroundStack } from './support/paperStack.js';
import { framesPass, steady } from './support/steady.js';

/**
 * A drag of the window edge resizes the page every frame. The crease's clip-path divides by each
 * page's --paper-page-w/-h, which a ResizeObserver keeps in step with the page's pixel size, and
 * the drag's geometry is cached per page and dropped on a resize. Both have to end on the final
 * size, or the next drag folds a page of the old size.
 *
 * Every width is below the 56rem the playground caps its content at, so each step resizes the stack.
 */

const WIDTHS = Array.from({ length: 12 }, (_, i) => 740 + i * 14);

test.use({ reducedMotion: 'reduce', viewport: { width: 720, height: 900 } });

async function nextFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

async function dragWindow(page: Page) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await nextFrame(page);
  }
}

/** Each page's --paper-page-w/-h against its own content box, in px. */
const pageSizes = (page: Page) => playgroundStack(page).evaluate((stack) => [...stack.children].map((wrapper) => {
  const style = getComputedStyle(wrapper);
  return {
    w: parseFloat(style.getPropertyValue('--paper-page-w')),
    h: parseFloat(style.getPropertyValue('--paper-page-h')),
    width: (wrapper as HTMLElement).clientWidth,
    height: (wrapper as HTMLElement).clientHeight,
  };
}));

test('a window drag leaves every page\'s --paper-page-w/-h on its final size', async ({ page }) => {
  await page.goto('/');
  const stack = playgroundStack(page);
  await dogEarShown(stack);
  const before = await steady(page, () => pageSizes(page));
  for (const size of before) {
    expect(Math.abs(size.w - size.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(size.h - size.height)).toBeLessThanOrEqual(1);
  }

  await dragWindow(page);
  const after = await steady(page, () => pageSizes(page));
  expect(after[0]!.width, 'the drag resized the stack').toBeGreaterThan(before[0]!.width + 100);
  for (const [index, size] of after.entries()) {
    expect(Math.abs(size.w - size.width), `page ${index + 1} width`).toBeLessThanOrEqual(1);
    expect(Math.abs(size.h - size.height), `page ${index + 1} height`).toBeLessThanOrEqual(1);
  }
});

test('a dog-ear drag after a window drag folds the page at its new size and turns it', async ({ page }) => {
  await page.goto('/');
  const stack = playgroundStack(page);
  await dogEarShown(stack);
  await dragWindow(page);
  await steady(page, () => pageSizes(page));
  await framesPass(page);

  // The dog-ear rests on the corner of the page as it now stands.
  const sheet = (await stack.locator('.paper-front').boundingBox())!;
  const grip = await flapGrip(stack);
  expect(grip.x, 'the grip lies on the resized sheet').toBeLessThan(sheet.x + sheet.width);
  expect(grip.x).toBeGreaterThan(sheet.x + sheet.width - 80);
  expect(grip.y).toBeLessThan(sheet.y + sheet.height);
  expect(grip.y).toBeGreaterThan(sheet.y + sheet.height - 50);

  const before = await frontPageIndex(stack);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  const pull = { dx: -sheet.width * 0.6, dy: -sheet.height * 0.6 };
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(grip.x + (pull.dx * i) / 8, grip.y + (pull.dy * i) / 8);
    await page.waitForTimeout(20);
  }
  await expect(stack.locator('.paper-fold')).toHaveClass(/paper-fold--will-commit/);
  await page.mouse.up();

  await expect.poll(() => frontPageIndex(stack), { message: 'the turn committed', timeout: 5_000 }).not.toBe(before);
});
