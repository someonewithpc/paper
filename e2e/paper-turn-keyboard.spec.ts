import { expect, test, type Locator, type Page } from '@playwright/test';

import { dogEarShown, frontPageName, playgroundStack, settledAfter } from './support/paperStack.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

type TurnRecord = { pressed: number, committed: number, last: number };

/**
 * When the turn commits and when it stops moving, both counted from the key press. A committed
 * flip renumbers every page wrapper's `--paper-page-index`, so the first style write that moves
 * the front page along is the commit; the last style write on any wrapper is the glide
 * finishing. `commit` is Infinity when nothing turns at all.
 */
async function turnTiming(page: Page, stack: Locator, key: string): Promise<{ commit: number, done: number }> {
  // Recorded in the page and read back afterwards, not awaited as a promise from evaluate():
  // a pending evaluate() holds up every later call on the page, including the key press it is
  // waiting for.
  await stack.evaluate((el) => {
    const front = () => [...el.children].findIndex(
      (child) => (child as HTMLElement).style.getPropertyValue('--paper-page-index').trim() === '1');
    const was = front();
    const record: TurnRecord = { pressed: 0, committed: 0, last: 0 };
    (window as Window & { paperTurn?: TurnRecord }).paperTurn = record;
    el.addEventListener('keydown', () => { record.pressed = performance.now(); }, { capture: true, once: true });
    const observer = new MutationObserver(() => {
      if (record.pressed === 0) return;
      record.last = performance.now();
      if (record.committed === 0 && front() !== was) record.committed = record.last;
    });
    for (const child of el.children) observer.observe(child, { attributes: true, attributeFilter: ['style'] });
  });
  await stack.focus();
  // Once the turn has settled, `last` is the glide finishing.
  await settledAfter(stack, () => page.keyboard.press(key));
  return page.evaluate(() => {
    const record = (window as Window & { paperTurn?: TurnRecord }).paperTurn!;
    return {
      commit: record.committed === 0 ? Infinity : record.committed - record.pressed,
      done: record.last - record.pressed,
    };
  });
}

test('an arrow key commits the turn without waiting', { tag: '@perf' }, async ({ page }) => {
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);

  // A key press has no hand still on the paper, so the flip commits on the spot and one glide
  // plays the turn out. The turn ending matters as much as the commit: the page coming back must
  // not commit early and then halt half way through, on the seam between two glides.
  const away = await turnTiming(page, stack, 'ArrowRight');
  expect(away.commit).toBeLessThan(900);
  expect(away.done).toBeLessThan(2000);
  expect(await frontPageName(stack)).toBe('Plain · Contents');

  const back = await turnTiming(page, stack, 'ArrowLeft');
  expect(back.commit).toBeLessThan(900);
  expect(back.done).toBeLessThan(2000);
  expect(await frontPageName(stack)).toBe('Plain · Cover');
});

test('a key turn reads the dog-ear off the screen once', async ({ page }) => {
  // The size the reader sees is the only caller that asks for the clip's ::after style (the
  // pulse's scale). The grab needs that read; the flip after it starts from the size the grab's
  // first move wrote.
  await page.addInitScript(() => {
    const read = window.getComputedStyle;
    const w = window as Window & { foldReads?: number };
    w.foldReads = 0;
    window.getComputedStyle = (el, pseudo) => {
      if (pseudo === '::after' && el.classList.contains('paper-clip')) w.foldReads!++;
      return read(el, pseudo);
    };
  });
  await page.reload();
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  await turnTiming(page, stack, 'ArrowRight');
  expect(await frontPageName(stack)).toBe('Plain · Contents');
  expect(await page.evaluate(() => (window as Window & { foldReads?: number }).foldReads)).toBe(1);
});

test('a settled turn writes the front page to the status beside the stack', async ({ page }) => {
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  const status = stack.locator('xpath=following-sibling::*[@data-paper-status][1]');
  await expect(status).toHaveAttribute('role', 'status');
  // Nothing on load: the page at the front is where the reader started.
  await expect(status).toHaveText('');

  const pages = await stack.evaluate((el) => el.childElementCount);
  await turnTiming(page, stack, 'ArrowRight');
  await expect(status).toHaveText(`Page 2 of ${pages}: Plain · Contents`);

  await turnTiming(page, stack, 'ArrowLeft');
  await expect(status).toHaveText(`Page 1 of ${pages}: Plain · Cover`);
});
