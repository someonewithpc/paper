import { expect, test, type Locator, type Page } from '@playwright/test';

import { dogEarShown, playgroundStack, stackNamed } from './support/paperStack.js';

/**
 * While the window is being resized the dog-ear's pulse stops where it is, so every frame of the
 * resize goes to the layout. Once the size has held for 300ms and four quiet frames it carries on
 * from where it was.
 */

/** Rocks the window by a few pixels every 100 ms for `ms`. */
async function keepResizing(page: Page, ms: number): Promise<void> {
  const start = Date.now();
  let narrow = false;
  while (Date.now() - start < ms) {
    narrow = !narrow;
    await page.setViewportSize({ width: narrow ? 1396 : 1400, height: 900 });
    await page.waitForTimeout(100);
  }
}

// The dog-ear's pulse is three animations on one clock, one per layer the fold draws: one state
// when they agree, all of them when they do not.
function pulseState(stack: Locator): Promise<string | undefined> {
  return stack.evaluate((el) => {
    const states = new Set(el.querySelector('.paper-front')?.getAnimations({ subtree: true })
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('paper-pulse-'))
      .map((animation) => animation.playState));
    return states.size ? [...states].join(', ') : undefined;
  });
}

const pulseTime = (stack: Locator) => stack.evaluate((el) => Number(el.querySelector('.paper-front')!
  .getAnimations({ subtree: true })
  .find((animation) => (animation as CSSAnimation).animationName === 'paper-pulse-page')!.currentTime));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test('a resize holds the pulse still, and it carries on once the size settles', async ({ page }) => {
  await page.goto('/');
  const stack = playgroundStack(page);
  await dogEarShown(stack);
  await expect.poll(() => pulseState(stack)).toBe('running');

  const holding = keepResizing(page, 3000);
  await page.waitForTimeout(1200);
  expect(await pulseState(stack)).toBe('paused');
  const heldAt = await pulseTime(stack);
  await page.waitForTimeout(800);
  expect(await pulseTime(stack), 'the pulse moved during the resize').toBe(heldAt);
  await holding;

  await expect.poll(() => pulseState(stack), { message: 'the pulse carries on', timeout: 5_000 }).toBe('running');
  // From where it stopped, not from the start of its run.
  expect(await pulseTime(stack)).toBeGreaterThanOrEqual(heldAt);
  await expect.poll(() => pulseTime(stack)).toBeGreaterThan(heldAt);
});

test('with resizeHold off the pulse keeps running through a resize', async ({ page }) => {
  await page.goto('/?resizeHold=false');
  const stack = playgroundStack(page);
  await dogEarShown(stack);
  await expect.poll(() => pulseState(stack)).toBe('running');

  const holding = keepResizing(page, 1500);
  await page.waitForTimeout(800);
  expect(await pulseState(stack)).toBe('running');
  await holding;
});

test('a pulse held for being off screen stays held through a resize', async ({ page }) => {
  await page.goto('/playground/stacks.html');
  const first = stackNamed(page, 'First stack');
  await dogEarShown(first);
  await expect.poll(() => pulseState(first)).toBe('running');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => pulseState(first)).toBe('paused');

  // The hold ending must not start a pulse that was paused for another reason.
  await keepResizing(page, 1500);
  await page.waitForTimeout(1500);
  expect(await pulseState(first)).toBe('paused');
});
