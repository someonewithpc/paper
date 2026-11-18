import { expect, test } from '@playwright/test';

import { flapGrip } from './support/fold.js';
import { dogEarShown, playgroundStack, settledAfter } from './support/paperStack.js';
import { installProbes } from './support/pageProbes.js';

// The pulse grows the drawn dog-ear past its resting size; held still, the rest is all there is.
test.use({ reducedMotion: 'reduce' });

/** The front page's dog-ear as the script and the stylesheet see it, in px. */
const restingFold = (stack: ReturnType<typeof playgroundStack>) => stack.locator('.paper-front').evaluate((sheet) => {
  const style = getComputedStyle(sheet);
  // The flap is drawn reflected across the crease, so its layout box, not its painted one, is the
  // fold's size: that plus a 1px border all round.
  const flap = sheet.querySelector<HTMLElement>(':scope > .paper-fold')!;
  return {
    x: parseFloat(style.getPropertyValue('--paper-fold-x')),
    y: parseFloat(style.getPropertyValue('--paper-fold-y')),
    flapW: flap.offsetWidth - 2,
    flapH: flap.offsetHeight - 2,
  };
});

test('the stack\'s fold-rest size is 2cm by 1cm, in px', async ({ page }) => {
  await page.goto('/');
  await installProbes(page);
  const pxPerCm = await page.evaluate(() => window.e2eProbes!.px('1cm'));

  const [x, y] = await playgroundStack(page).evaluate((stack) => {
    const style = getComputedStyle(stack);
    return [parseFloat(style.getPropertyValue('--paper-fold-rest-x')), parseFloat(style.getPropertyValue('--paper-fold-rest-y'))];
  });
  expect(Math.abs(x! - 2 * pxPerCm), '--paper-fold-rest-x').toBeLessThanOrEqual(0.5);
  expect(Math.abs(y! - 1 * pxPerCm), '--paper-fold-rest-y').toBeLessThanOrEqual(0.5);
});

test('overriding --paper-fold-rest-x/-y moves the resting dog-ear, and a drag settles back to it', async ({ page }) => {
  await page.goto('/');
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  await installProbes(page);
  const pxPerCm = await page.evaluate(() => window.e2eProbes!.px('1cm'));

  const before = await restingFold(stack);
  expect(Math.abs(before.x - 2 * pxPerCm)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(before.y - 1 * pxPerCm)).toBeLessThanOrEqual(0.5);

  // Set above the stack: the properties are inherited, so a page can size every stack at once.
  await page.addStyleTag({ content: 'main { --paper-fold-rest-x: 3cm; --paper-fold-rest-y: 1.5cm; }' });
  await page.evaluate(() => window.paper!.refresh());
  await expect.poll(async () => {
    const now = await restingFold(stack);
    return [now.x, now.y, now.flapW, now.flapH].map((v) => Math.round(v));
  }).toEqual([3 * pxPerCm, 1.5 * pxPerCm, 3 * pxPerCm, 1.5 * pxPerCm].map((v) => Math.round(v)));

  // A short drag released short of the commit point glides back to the new rest, not the old one.
  const grip = await flapGrip(stack);
  await settledAfter(stack, async () => {
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(grip.x - 5 * i, grip.y - 5 * i);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
  });
  const after = await restingFold(stack);
  expect(Math.abs(after.x - 3 * pxPerCm), 'rest x after the drag').toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.y - 1.5 * pxPerCm), 'rest y after the drag').toBeLessThanOrEqual(0.5);
});
