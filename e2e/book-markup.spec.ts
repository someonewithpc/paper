import { expect, test } from '@playwright/test';

import type { PaperBookElement } from '../packages/paper/src/element.js';

test.use({ viewport: { width: 1200, height: 1600 } });

test('a server-rendered book turns with the options its attributes carry', async ({ page }) => {
  await page.goto('/book-ssr.html?start=3&display=double');
  const book = page.locator('[data-paper-book]');
  await expect(book).toHaveAttribute('data-paper-settled', '');
  expect(await page.evaluate(() => window.paper!.state)).toMatchObject({ mode: 'book', spread: 2, pages: [3, 4] });
  await page.evaluate(() => window.paper!.next());
  expect(await page.evaluate(() => window.paper!.state)).toMatchObject({ spread: 3, pages: [5, 6] });
});

test('<paper-book> and the single and double books on one page', async ({ page }) => {
  await page.goto('/playground/books.html');
  const element = page.locator('paper-book');
  await expect(element).toHaveAttribute('data-paper-settled', '');
  expect(await element.evaluate((el) => (el as PaperBookElement).state)).toMatchObject({ mode: 'book', pages: [1, 2] });
  expect(await element.evaluate((el) => (el as PaperBookElement).next())).toBe(true);
  expect(await element.evaluate((el) => (el as PaperBookElement).state!.pages)).toEqual([3]);
  expect(await page.evaluate(() => (window as unknown as { papers: Record<string, { state: unknown }> }).papers['single']!.state))
    .toMatchObject({ display: 'single', spreads: 10 });
});
