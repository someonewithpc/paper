import { expect, type Locator, type Page, test } from '@playwright/test';

import { bookState, dragCorner, openBook, pagesInView } from './support/book.js';
import { settledAfter } from './support/paperStack.js';

// Stops the page's clock. The mark is well ahead, so the running clock can't pass it before the
// pause lands.
const holdClock = async (page: Page) => page.clock.pauseAt(await page.evaluate(() => Date.now() + 10_000));

declare global {
  interface Window {
    wheelTaken?: number;
  }
}

const wheelTaken = (book: Locator) => book.evaluate((el) => {
  if (window.wheelTaken === undefined) {
    window.wheelTaken = 0;
    el.addEventListener('wheel', (e) => { window.wheelTaken! += (e as WheelEvent).deltaX; }, { capture: true, passive: true });
  }
  return window.wheelTaken;
});

// Scrolls sideways over the book and waits until the page has taken all of it. Chrome hands a
// passive wheel listener its events on its own frames, which a held clock doesn't hold back, and
// may merge them, so this waits on the travel and not on a count.
async function wheel(page: Page, book: Locator, dx: number, times = 1): Promise<void> {
  const from = await wheelTaken(book);
  for (let i = 0; i < times; i++) await page.mouse.wheel(dx, 0);
  await expect.poll(async () => Math.abs(await wheelTaken(book) - from - dx * times) < 0.5).toBe(true);
}

test('dragging the right-hand corner across the spine turns forward, the left-hand one back', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  const book = await openBook(page, 'display=double&center=false&start=1');
  expect(await pagesInView(book)).toEqual(['Plain · Inside cover', 'Plain · Contents']);

  await dragCorner(page, book, 'right', 1.6);
  expect(await pagesInView(book)).toEqual(['Plain · Chapter one', 'Plain · Chapter two']);
  expect(await bookState(book)).toMatchObject({ spread: 2, pages: [3, 4], index: 3, canPrev: true, canNext: true });

  await dragCorner(page, book, 'left', 1.6, { corner: 'top' });
  expect(await pagesInView(book)).toEqual(['Plain · Inside cover', 'Plain · Contents']);

  const events = await page.evaluate(() => window.paperEvents!.map(({ type, detail }) => ({ type, detail })));
  expect(events.filter((e) => e.type === 'paper:change').map((e) => e.detail)).toEqual([
    { direction: 'forward', index: 3, previousIndex: 1, count: 10, turned: 3, spread: 2, pages: [3, 4] },
    { direction: 'back', index: 1, previousIndex: 3, count: 10, turned: 1, spread: 1, pages: [1, 2] },
  ]);
});

test('a drag let go short of a quarter of the way lays the leaf back down', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  const book = await openBook(page, 'display=double&start=1');
  await dragCorner(page, book, 'right', 0.3);
  expect(await bookState(book)).toMatchObject({ spread: 1, settled: true, turning: false });
  const types = await page.evaluate(() => window.paperEvents!.map((e) => e.type));
  expect(types).toEqual(['paper:settle']);
  // Nothing the turn drew is left on the pages.
  expect(await book.evaluate((el) => [...el.querySelectorAll<HTMLElement>('.paper-book-page, .paper-book-page > *')]
    .filter((node) => node.style.clipPath || node.style.transform).length)).toBe(0);
});

test('while it is dragged the front page is cut at the crease and the back page comes over', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  const book = await openBook(page, 'display=double&start=1');
  const right = book.locator(':scope > .paper-book-page').nth(2);
  const box = (await right.boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.8, { steps: 8 });
  const drawn = await book.evaluate((el) => {
    const pages = [...el.children] as HTMLElement[];
    return {
      places: pages.map((p) => p.dataset['paperPlace'] ?? null),
      frontClip: (pages[2]!.firstElementChild as HTMLElement).style.clipPath.startsWith('polygon('),
      backTransform: pages[3]!.style.transform.startsWith('matrix('),
      cast: (pages[4]!.querySelector('.paper-book-shade') as HTMLElement).dataset['paperShade'],
      settled: el.hasAttribute('data-paper-settled'),
    };
  });
  expect(drawn).toEqual({
    places: [null, 'view', 'front', 'back', 'under', null, null, null, null, null],
    frontClip: true, backTransform: true, cast: 'cast', settled: false,
  });
  await page.mouse.up();
  await expect(book).toHaveAttribute('data-paper-settled', '');
});

test('in single display a drag turns one page, and the left edge brings it back', async ({ page }) => {
  const book = await openBook(page, 'display=single&width=480px');
  await dragCorner(page, book, 'right', 1.6);
  expect(await bookState(book)).toMatchObject({ display: 'single', spread: 1, pages: [1] });
  await dragCorner(page, book, 'left', 0.9);
  expect(await bookState(book)).toMatchObject({ spread: 0, pages: [0] });
});

test('a sideways wheel turns forward one way and back the other', async ({ page }) => {
  // The book ends a wheel turn once the wheel has been quiet for a moment, and a busy runner can
  // stall that long between two events and split one swipe into two turns. The page's clock is
  // held while a swipe goes in, so it is one turn however slowly its events arrive.
  await page.clock.install();
  await page.setViewportSize({ width: 1200, height: 1000 });
  const book = await openBook(page, 'display=double&start=1');
  const box = (await book.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const swipe = async (dx: number) => settledAfter(book, async () => {
    await holdClock(page);
    await wheel(page, book, dx / 8, 8);
    await page.clock.resume();
  });
  await swipe(box.width * 0.4);
  expect((await bookState(book)).spread).toBe(2);
  await swipe(-box.width * 0.4);
  expect((await bookState(book)).spread).toBe(1);
  // An upright scroll is the page's own.
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400);
  expect(await book.getAttribute('data-paper-settled')).toBe('');
  expect((await bookState(book)).spread).toBe(1);
});
