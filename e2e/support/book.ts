import { expect, type Locator, type Page } from '@playwright/test';

import type { PaperBookState } from '../../src/types.js';
import { settledAfter } from './paperStack.js';

/** The playground's one book, built from plain children by createPaper. */
export const playgroundBook = (page: Page): Locator => page.locator('#book');

export async function openBook(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/playground/book.html${query ? `?${query}` : ''}`);
  const book = playgroundBook(page);
  await expect(book).toHaveAttribute('data-paper-settled', '');
  return book;
}

export const bookState = (book: Locator): Promise<PaperBookState> =>
  book.evaluate(() => window.paper!.state as PaperBookState);

/** The `<h2>` of each page in view, left to right. */
export const pagesInView = (book: Locator): Promise<string[]> =>
  book.evaluate((el) => [...el.querySelectorAll(':scope > [data-paper-place="view"] h2')].map((h) => h.textContent?.trim() ?? ''));

type Side = 'right' | 'left';

/**
 * Drags a corner of the page in view on `side` across the book: `reach` is how far, as a share of
 * the page's width, and `lift` how far the hand rises on the way. A page lies a page width from
 * the spine, so a reach of 2 carries the corner over to the other side.
 */
export async function dragCorner(page: Page, book: Locator, side: Side, reach: number, { corner = 'bottom', lift = 0.15, steps = 16 } = {}): Promise<void> {
  const box = await book.evaluate((el, side) => {
    const pages = [...el.querySelectorAll<HTMLElement>(':scope > [data-paper-place="view"]')];
    const single = window.paper!.state.mode === 'book' && (window.paper!.state as { display: string }).display === 'single';
    const index = (p: HTMLElement) => [...el.children].indexOf(p);
    const target = single ? pages[0] : pages.find((p) => (index(p) % 2 === 0) === (side === 'right'));
    const rect = target!.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
  }, side);
  const x0 = side === 'right' ? box.right - 3 : box.left + 3;
  const y0 = corner === 'bottom' ? box.bottom - 3 : box.top + 3;
  const dx = (side === 'right' ? -1 : 1) * reach * box.width;
  const dy = (corner === 'bottom' ? -1 : 1) * lift * box.width;
  await settledAfter(book, async () => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(x0 + dx * t, y0 + dy * Math.sin(Math.PI * t));
    }
    // Held still before letting go, so the release carries no throw.
    await page.waitForTimeout(150);
    await page.mouse.up();
  });
}

/** Presses a key on the focused book and waits for the turn it starts to land. */
export async function pressOnBook(book: Locator, key: string): Promise<void> {
  await book.focus();
  await settledAfter(book, () => book.page().keyboard.press(key));
}
