import { expect, type Locator, test } from '@playwright/test';

test.describe('a book without JS', { tag: '@noscript' }, () => {
  const scrolled = (book: Locator) => book.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth * 2) / 2);
  const widths = (book: Locator) => book.evaluate((el) => [...el.children].map((page) => Math.round(page.getBoundingClientRect().width / el.clientWidth * 100)));

  test('is a row of spreads that snaps spread to spread when wide', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.goto('/book-ssr.html');
    const book = page.locator('[data-paper-book]');
    // Every page is laid out and readable, half the row wide.
    expect(await widths(book)).toEqual(Array(10).fill(50));
    await expect(book.locator('h2')).toHaveCount(10);
    await expect(book.getByText('Rendered · Back cover')).toBeAttached();

    // The cover sits alone on the right; a scroll that stops part way lands on a whole spread.
    expect(await scrolled(book)).toBe(0);
    await book.evaluate((el) => {
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = el.clientWidth * 0.7;
    });
    await expect.poll(() => scrolled(book)).toBe(1);
    const inView = await book.evaluate((el) => {
      const row = el.getBoundingClientRect();
      return [...el.querySelectorAll('h2')].filter((h) => {
        const box = h.parentElement!.getBoundingClientRect();
        return box.left >= row.left - 1 && box.right <= row.right + 1;
      }).map((h) => h.textContent);
    });
    expect(inView).toEqual(['Rendered · Inside cover', 'Rendered · Contents']);

    // The back cover is alone on the left, with room to scroll to it.
    await book.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(() => book.evaluate((el) => {
      const last = el.lastElementChild!.getBoundingClientRect();
      return Math.round(last.left - el.getBoundingClientRect().left);
    })).toBe(0);
  });

  test('turns one page at a time when narrow, and the arrows move it', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/book-ssr.html');
    const book = page.locator('[data-paper-book]');
    expect(await widths(book)).toEqual(Array(10).fill(100));
    const box = (await book.boundingBox())!;
    // The next arrow straddles the row's right edge, half way down.
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    await expect.poll(() => scrolled(book)).toBe(1);
  });

  test('follows a display fixed in the markup', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/book-ssr.html?display=double');
    expect(await widths(page.locator('[data-paper-book]'))).toEqual(Array(10).fill(50));
  });
});
