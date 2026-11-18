import { expect, test } from '@playwright/test';

import { bookState, dragCorner, openBook } from './support/book.js';

test.use({ viewport: { width: 1200, height: 1000 } });

test('a closed book sits in the middle and slides over as it opens', async ({ page }) => {
  const book = await openBook(page, 'display=double');
  await expect(book).toHaveAttribute('data-paper-center', 'start');
  const middle = async () => book.evaluate((el) => {
    const cover = el.firstElementChild!.getBoundingClientRect();
    const row = el.getBoundingClientRect();
    return Math.round((cover.left + cover.right) / 2 - (row.left + row.right) / 2);
  });
  expect(await middle()).toBe(0);

  await page.evaluate(() => window.paper!.next());
  await expect(book).not.toHaveAttribute('data-paper-center');
  await page.evaluate(() => window.paper!.goTo(9));
  await expect(book).toHaveAttribute('data-paper-center', 'end');
});

test('autoCenter off leaves the cover on the right', async ({ page }) => {
  const book = await openBook(page, 'display=double&center=false');
  await expect(book).not.toHaveAttribute('data-paper-center');
});

test('hard covers swing about the spine without a crease', async ({ page }) => {
  const book = await openBook(page, 'display=double&hard&center=false');
  const cover = book.locator(':scope > .paper-book-page').first();
  const box = (await cover.boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height - 20, { steps: 6 });
  const drawn = await book.evaluate((el) => {
    const [front, back] = el.children as unknown as HTMLElement[];
    return {
      front: front!.style.transform,
      clip: (front!.firstElementChild as HTMLElement).style.clipPath,
      backHidden: back!.style.opacity,
      shade: (front!.querySelector('.paper-book-shade') as HTMLElement).dataset['paperShade'],
    };
  });
  expect(drawn.front).toMatch(/^perspective\(\d+(\.\d+)?px\) rotateY\(-\d+(\.\d+)?deg\)$/);
  expect(drawn.clip).toBe('');
  expect(drawn.backHidden).toBe('0');
  expect(drawn.shade).toBe('board');
  await page.mouse.move(box.x - box.width * 0.6, box.y + box.height - 20, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect.poll(async () => (await bookState(book)).spread).toBe(1);
});

test('the leaves between the covers still curl', async ({ page }) => {
  const book = await openBook(page, 'display=double&hard&center=false&start=1');
  const right = book.locator(':scope > .paper-book-page').nth(2);
  const box = (await right.boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8, { steps: 6 });
  expect(await right.evaluate((el) => (el.firstElementChild as HTMLElement).style.clipPath)).toMatch(/^polygon\(/);
  // Let go of without a throw, short of a quarter of the way: it lies back down.
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.8, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(book).toHaveAttribute('data-paper-settled', '');
  expect((await bookState(book)).spread).toBe(1);
  await dragCorner(page, book, 'right', 1.6);
  expect((await bookState(book)).spread).toBe(2);
});
