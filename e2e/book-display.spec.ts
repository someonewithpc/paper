import { expect, test } from '@playwright/test';

import { settledAfter } from './support/paperStack.js';
import { bookState, openBook, pressOnBook } from './support/book.js';

test('auto display shows a spread when the book is wide and one page when it is narrow', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  const book = await openBook(page, 'start=4');
  expect(await bookState(book)).toMatchObject({ display: 'double', spread: 2, pages: [3, 4] });

  // Narrower than 40rem the book shows the first page that was in view, on its own.
  await page.setViewportSize({ width: 500, height: 1000 });
  await expect.poll(async () => (await bookState(book)).display).toBe('single');
  expect(await bookState(book)).toMatchObject({ spread: 3, pages: [3], spreads: 10 });
  expect(await book.evaluate((el) => [...el.children].filter((p) => (p as HTMLElement).dataset['paperPlace'] === 'view').length)).toBe(1);

  await pressOnBook(book, 'ArrowRight');
  expect((await bookState(book)).pages).toEqual([4]);

  await page.setViewportSize({ width: 1200, height: 1000 });
  await expect.poll(async () => (await bookState(book)).display).toBe('double');
  expect((await bookState(book)).pages).toEqual([3, 4]);
});

test('--paper-book-double-from moves the switch', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  const book = await openBook(page);
  expect((await bookState(book)).display).toBe('double');
  await book.evaluate((el) => el.style.setProperty('--paper-book-double-from', '80rem'));
  await page.evaluate(() => window.paper!.refresh());
  expect((await bookState(book)).display).toBe('single');
});

test('in double display a turn changes the spread and both pages', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  const book = await openBook(page, 'display=double');
  for (const expected of [[1, 2], [3, 4], [5, 6]]) {
    await settledAfter(book, () => page.evaluate(() => window.paper!.next().then(() => undefined)));
    expect((await bookState(book)).pages).toEqual(expected);
  }
  const settles = await page.evaluate(() => window.paperEvents!.filter((e) => e.type === 'paper:settle').map((e) => e.detail));
  expect(settles.at(-1)).toEqual({ index: 5, count: 10, turned: 5, changed: true, spread: 3, pages: [5, 6] });
});
