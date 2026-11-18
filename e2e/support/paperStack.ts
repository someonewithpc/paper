import { expect, type Locator, type Page } from '@playwright/test';

import type { PaperController, PaperEventType } from '../../packages/paper/src/types.js';

/** The sheet inside a page wrapper: the flap and the rest of the chrome ride on top of it. */
export const SHEET = ':scope > :not(.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint)';

/** The playground's one stack, built from plain children by createPaper. */
export function playgroundStack(page: Page): Locator {
  return page.locator('#plain');
}

/** A stack found by its accessible name rather than by its place on the page. */
export function stackNamed(page: Page, label: string): Locator {
  return page.locator(`[data-paper-stack][aria-label="${label}"]`);
}

/**
 * Each page keeps its DOM position; a committed flip only renumbers which wrapper's
 * `--paper-page-index` reads `1`. So "the front page" is whichever direct child currently
 * carries that index, not a fixed DOM index.
 */
export async function frontPageIndex(stack: Locator): Promise<number> {
  const index = await stack.locator(':scope > div').evaluateAll((wrappers) =>
    wrappers.findIndex((w) => getComputedStyle(w).getPropertyValue('--paper-page-index').trim() === '1'),
  );
  if (index < 0) throw new Error('No page reports --paper-page-index: 1');
  return index;
}

export function frontPage(stack: Locator, index: number): Locator {
  return stack.locator(':scope > div').nth(index);
}

/** The front page's `<h2>`, stable per page. */
export async function frontPageName(stack: Locator): Promise<string> {
  const page = frontPage(stack, await frontPageIndex(stack));
  return (await page.locator('h2').first().textContent())?.trim() ?? '';
}

/**
 * Turns the stack one page via a wheel swipe. A swipe has to cover a quarter of the page's
 * diagonal to commit, whichever way it runs, and `fraction` is how much of that diagonal this
 * swipe covers, kept to what a trackpad flick actually hands over. `forward` leaves the front page
 * and reveals the next; `!forward` brings the previous one back, clamped at the first page.
 */
export async function swipeStack(page: Page, stack: Locator, forward: boolean, fraction = 0.4): Promise<void> {
  const box = await stack.boundingBox();
  if (!box) throw new Error('The stack has no layout box to swipe');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // A back swipe with nothing turned has no page to bring back: the stack declines it without
  // starting a gesture, so no settle is coming.
  const starts = forward || (await stack.evaluate((el) => 'paperFlipped' in (el as HTMLElement).dataset));
  const diagonal = Math.hypot(box.width, box.height);
  const totalDeltaX = diagonal * fraction * (forward ? 1 : -1);
  const steps = 8;
  await settledAfter(stack, async () => {
    for (let i = 0; i < steps; i += 1) {
      await page.mouse.wheel(totalDeltaX / steps, 0);
      await page.waitForTimeout(40);
    }
  }, starts);
}

/** Presses an arrow key on the stack and waits for the turn it starts to land. */
export async function pressTurn(stack: Locator, key: 'ArrowRight' | 'ArrowLeft'): Promise<void> {
  await stack.focus();
  await settledAfter(stack, () => stack.page().keyboard.press(key));
}

declare global {
  interface Window {
    paperSettles?: WeakMap<Element, number>;
    /** The playground's controller and the paper:* events it logged. */
    paper?: PaperController;
    paperEvents?: { type: PaperEventType, detail: unknown }[];
  }
}

/**
 * Runs `act`, then waits for the gesture it started to end. The stack sets `data-paper-settled`
 * when a turn lands or a fold eases back to rest, whichever way the gesture went, so the
 * attribute going on after `act` is the end of the gesture. That holds however long a starved
 * renderer takes over the glide, and it cannot mistake a turn that has not started yet for one
 * that is over. After the settle, the stack's own transitions and the new front page's dog-ear
 * reveal still have to run out before anything is measured.
 */
export async function settledAfter(stack: Locator, act: () => Promise<void>, starts = true): Promise<void> {
  await stack.evaluate((el) => {
    const settles = (window.paperSettles ??= new WeakMap());
    settles.set(el, 0);
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.oldValue === null) || !el.hasAttribute('data-paper-settled')) return;
      settles.set(el, 1);
      observer.disconnect();
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-paper-settled'], attributeOldValue: true });
  });
  await act();
  if (starts) {
    await expect
      .poll(() => stack.evaluate((el) => window.paperSettles?.get(el) ?? 0), {
        message: 'the stack never settled after the gesture',
        intervals: [100],
        timeout: 15_000,
      })
      .toBe(1);
  }
  await transitionsRunOut(stack);
}

/**
 * Waits for the stack's own transitions to run out: the pile's drift, the corner cut's and the
 * new front page's dog-ear reveal, which go on after a turn has landed.
 */
export async function transitionsRunOut(stack: Locator): Promise<void> {
  await expect
    .poll(() => stack.evaluate((el) => {
      const own = new Set<Element>([el, ...el.children]);
      return el.getAnimations({ subtree: true }).filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return !!target && own.has(target) && animation.playState === 'running'
          && Number.isFinite(Number(animation.effect!.getComputedTiming().endTime));
      }).length;
    }), { message: 'the stack\'s transitions never ran out', intervals: [100], timeout: 10_000 })
    .toBe(0);
}

/**
 * Waits for the front page's dog-ear to finish drawing itself. The reveal waits for the stack's
 * bottom edge to come on screen and then takes a second, so a spec that scrolls a stack in and
 * goes straight for the flap would find it 0 by 0. A drag retires the reveal for good, which
 * counts as done.
 */
export async function dogEarShown(stack: Locator): Promise<void> {
  await expect
    .poll(() => stack.evaluate((el) => {
      const reveal = el.querySelector('.paper-front')?.getAnimations()
        .find((animation) => (animation as CSSAnimation).animationName === 'paper-fold-reveal');
      return !reveal || reveal.playState === 'finished';
    }), { message: 'the dog-ear never drew itself', timeout: 10_000 })
    .toBe(true);
}
