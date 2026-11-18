import { expect, test } from '@playwright/test';

import { frontPageName, playgroundStack, pressTurn } from './support/paperStack.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the stack is one Tab stop, described by the keys that turn it', async ({ page }) => {
  const stack = playgroundStack(page);
  await expect(stack).toHaveAttribute('tabindex', '0');
  await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');

  // aria-describedby names hidden text beside the stack, not aria-description, which many screen
  // readers skip.
  const keys = page.locator(`[id="${await stack.getAttribute('aria-describedby')}"]`);
  await expect(keys).toHaveAttribute('data-paper-keys', '');
  await expect(keys).toBeHidden();
  await expect(keys).toHaveText('The left and right arrow keys turn the pages');
  expect(await keys.evaluate((el, stack) => el.previousElementSibling === stack
    || el.previousElementSibling?.previousElementSibling === stack, await stack.elementHandle())).toBe(true);
});

test('a Tab walk meets the stack, then only the front page\'s controls', async ({ page }) => {
  const stack = playgroundStack(page);
  const stops: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      if (el.matches('[data-paper-stack]')) return 'stack';
      return el.textContent?.trim() ?? el.tagName;
    });
    if (stop === null) break;
    stops.push(stop);
  }
  // The pages behind the front one are covered, so what is printed on them is out of reach.
  expect(stops.filter((stop) => stop === 'stack')).toHaveLength(1);
  expect(stops.filter((stop) => stop.startsWith('A button on page'))).toEqual(['A button on page 1']);
  expect(stops.indexOf('stack')).toBeLessThan(stops.indexOf('A button on page 1'));

  // After a turn the next page's controls take their place.
  await pressTurn(stack, 'ArrowRight');
  await stack.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('A button on page 2');
});

test('the arrow keys turn the stack that has focus and leave focus on it', async ({ page }) => {
  const stack = playgroundStack(page);
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    if (await stack.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(stack).toBeFocused();

  const before = await frontPageName(stack);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(before);
  await expect(stack).toBeFocused();

  const afterForward = await frontPageName(stack);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => frontPageName(stack), { timeout: 15_000 }).not.toBe(afterForward);
  await expect(stack).toBeFocused();
});

test('an arrow key is a no-op while the stack does not have focus', async ({ page }) => {
  const stack = playgroundStack(page);
  await page.locator('a[href="/ssr.html"]').focus();
  const before = await frontPageName(stack);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  expect(await frontPageName(stack)).toBe(before);
  await expect(stack).not.toHaveAttribute('data-paper-flipped', '');
});
