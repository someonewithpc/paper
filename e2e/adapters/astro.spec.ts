import { expect, test, type Page } from '@playwright/test';

import { ASTRO_URL, countLive, dragBookForward, dragStackForward, press } from '../support/adapters.js';

async function open(page: Page, path = '/') {
  await page.addInitScript(countLive);
  await page.goto(`${ASTRO_URL}${path}`);
  await expect(page.locator('#stack')).toHaveAttribute('aria-roledescription', 'paper stack');
  await expect(page.locator('#stack-state')).toHaveText('0');
}

test.describe('the Astro adapter', () => {
  test('renders a page per slot call or per top-level child, with the slotted scripts outside the root', async ({ page }) => {
    const html = await (await page.request.get(`${ASTRO_URL}/`)).text();
    const stack = /<div data-paper-stack[^>]*>([^]*?)<div class="paper-sr-only"/.exec(html)![1]!;
    expect(stack).not.toContain('<script');
    expect(stack.match(/<section class="demo-page" data-card>/g)).toHaveLength(4);
    expect(stack).toContain('--paper-surface: #1f4f8f');
    expect(html.match(/<div class="paper-book-page"/g)).toHaveLength(6);
    expect(html.match(/data-card\]/g), 'the card\'s script, once').toHaveLength(1);
    const second = await (await page.request.get(`${ASTRO_URL}/second/`)).text();
    expect(second).toContain('data-paper-wrap="false"');
    expect(second.match(/<div style="--paper-page-index: \d"><section class="demo-page">|<div class="paper-front"[^>]*>/g)).toHaveLength(2);
  });

  test('enhances on load and runs the scripts of slotted components', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(String(error)));
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) problems.push(message.text());
    });
    await open(page);
    await expect(page.locator('#book')).toHaveAttribute('aria-roledescription', 'book');
    await expect(page.locator('[data-card][data-scripted]')).toHaveCount(4);
    expect(problems).toEqual([]);
  });

  test('turns the stack and the book by keyboard and by drag', async ({ page }) => {
    await open(page);
    const stack = page.locator('#stack');
    const book = page.locator('#book');
    await press(stack, 'ArrowRight');
    await expect(page.locator('#stack-state')).toHaveText('1');
    await dragStackForward(page, stack);
    await expect(page.locator('#stack-state')).toHaveText('2');
    await press(book, 'ArrowRight');
    await expect(page.locator('#book-state')).toHaveText('1');
    await dragBookForward(page, book);
    await expect(page.locator('#book-state')).toHaveText('2');
  });

  test('enhances after a view transition and leaves nothing behind from the page it left', async ({ page }) => {
    await open(page);
    const live = () => page.evaluate(() => window.liveCount!());
    const link = (id: string) => page.locator(id).evaluate((anchor: HTMLElement) => anchor.click());

    await link('#next');
    await expect(page.locator('h1')).toHaveText('Second page');
    await expect(page.locator('#stack')).toHaveAttribute('aria-roledescription', 'paper stack');
    await expect(page.locator('#stack')).toHaveAttribute('aria-label', 'Second stack');
    await expect(page.locator('#book-state')).toHaveText('none');
    await press(page.locator('#stack'), 'ArrowRight');
    await expect(page.locator('#stack-state')).toHaveText('1');
    const second = await live();

    await link('#back');
    await expect(page.locator('h1')).toHaveText('Astro adapter');
    await expect(page.locator('#book')).toHaveAttribute('aria-roledescription', 'book');
    await expect(page.locator('#stack-state')).toHaveText('0');
    await press(page.locator('#stack'), 'ArrowRight');
    await expect(page.locator('#stack-state')).toHaveText('1');
    const again = await live();
    // The router's own listeners come with the first navigation, so compare from the second visit.
    await link('#next');
    await expect(page.locator('#stack')).toHaveAttribute('aria-label', 'Second stack');
    await press(page.locator('#stack'), 'ArrowRight');
    await expect.poll(live).toEqual(second);
    await link('#back');
    await expect(page.locator('#book')).toHaveAttribute('aria-roledescription', 'book');
    await press(page.locator('#stack'), 'ArrowRight');
    await expect.poll(live).toEqual(again);
  });
});
