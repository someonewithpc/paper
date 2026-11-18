import { expect, test } from '@playwright/test';

import { bookState, openBook } from './support/book.js';

test.use({ viewport: { width: 1200, height: 1000 } });

const timedTurn = (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const start = performance.now();
  await window.paper!.next();
  return performance.now() - start;
});

test('a played turn takes its time with motion allowed', async ({ page }) => {
  await openBook(page, 'display=double');
  expect(await timedTurn(page)).toBeGreaterThan(400);
});

test('reducedMotion reduce lands a turn at once', async ({ page }) => {
  const book = await openBook(page, 'display=double&motion=reduce');
  await expect(book).toHaveAttribute('data-paper-reduced-motion', 'reduce');
  expect(await timedTurn(page)).toBeLessThan(200);
  expect((await bookState(book)).spread).toBe(1);
  // The slide from the middle doesn't run either.
  expect(await book.evaluate((el) => getComputedStyle(el.firstElementChild!).transitionDuration)).toBe('0s');
});

test('the system preference lands a turn at once too', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBook(page, 'display=double');
  expect(await timedTurn(page)).toBeLessThan(200);
});
