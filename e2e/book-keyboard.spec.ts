import { expect, test } from '@playwright/test';

import { bookState, openBook, pagesInView, pressOnBook } from './support/book.js';

test.use({ viewport: { width: 1200, height: 1000 } });

test('the book is one Tab stop, described by its keys', async ({ page }) => {
  const book = await openBook(page, 'display=double');
  await expect(book).toHaveAttribute('tabindex', '0');
  await expect(book).toHaveAttribute('aria-roledescription', 'book');
  const keys = page.locator(`[id="${await book.getAttribute('aria-describedby')}"]`);
  await expect(keys).toHaveText('The left and right arrow keys turn the pages, Home and End go to the covers');
});

test('arrows, Page Up, Page Down, Home and End move between spreads and keep focus on the book', async ({ page }) => {
  const book = await openBook(page, 'display=double');
  await pressOnBook(book, 'ArrowRight');
  expect((await bookState(book)).spread).toBe(1);
  await pressOnBook(book, 'PageDown');
  expect((await bookState(book)).spread).toBe(2);
  await pressOnBook(book, 'ArrowLeft');
  expect((await bookState(book)).spread).toBe(1);
  await pressOnBook(book, 'End');
  expect(await bookState(book)).toMatchObject({ spread: 5, pages: [9], canNext: false });
  await pressOnBook(book, 'PageUp');
  expect((await bookState(book)).pages).toEqual([7, 8]);
  await pressOnBook(book, 'Home');
  expect(await bookState(book)).toMatchObject({ spread: 0, pages: [0], canPrev: false });
  await expect(book).toBeFocused();
  // Past either cover a key does nothing.
  await book.press('ArrowLeft');
  await page.waitForTimeout(300);
  expect((await bookState(book)).spread).toBe(0);
});

test('a Tab walk reaches only the pages in view, and a turn announces the new ones', async ({ page }) => {
  const book = await openBook(page, 'display=double&start=1');
  const stops: string[] = [];
  await book.focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (!stop.startsWith('A button')) break;
    stops.push(stop);
  }
  expect(stops).toEqual(['A button on page 2', 'A button on page 3']);

  await pressOnBook(book, 'ArrowRight');
  expect(await pagesInView(book)).toEqual(['Plain · Chapter one', 'Plain · Chapter two']);
  await expect(page.locator('[data-paper-status]')).toHaveText('Pages 4 and 5 of 10: Plain · Chapter one');
});

test('focus on a page that leaves view goes back to the book', async ({ page }) => {
  const book = await openBook(page, 'display=double&start=1');
  await page.getByRole('button', { name: 'A button on page 3' }).focus();
  await page.evaluate(() => window.paper!.next());
  await expect(book).toBeFocused();
  expect(await book.evaluate((el) => (el.children[2]!.firstElementChild as HTMLElement).inert)).toBe(true);
});

test('next, prev and goTo resolve once the book has settled', async ({ page }) => {
  const book = await openBook(page, 'display=double');
  expect(await page.evaluate(() => window.paper!.next())).toBe(true);
  expect(await bookState(book)).toMatchObject({ spread: 1, settled: true, turning: false });
  expect(await page.evaluate(() => window.paper!.goTo(6))).toBe(true);
  expect((await bookState(book)).pages).toEqual([5, 6]);
  expect(await page.evaluate(() => window.paper!.goTo(0, { animate: false }))).toBe(true);
  expect((await bookState(book)).spread).toBe(0);
  expect(await page.evaluate(() => window.paper!.prev())).toBe(false);
  const types = await page.evaluate(() => window.paperEvents!.map((e) => e.type));
  expect(types.slice(0, 4)).toEqual(['paper:turnstart', 'paper:change', 'paper:settle', 'paper:turnend']);
});
