import { expect, test, type Locator, type Page } from '@playwright/test';

import { dogEarShown, frontPage, frontPageIndex, frontPageName, playgroundStack, stackNamed } from './support/paperStack.js';
import { framesPass } from './support/steady.js';

/**
 * The resting dog-ear breathes on a loop. Animating --paper-fold-x/-y, which the front page's
 * crease clip-path reads, would cost a style resolve of that page and a repaint of the sheet
 * every frame it advanced, for every stack on screen, for ever: time a page turn on one of them
 * no longer has. So it is three animations the compositor runs, one per layer the fold draws,
 * and the script pauses them while their stack is off screen.
 *
 * Read off the Web Animations API rather than off a class or an attribute, because that is
 * how it is driven: a class or an attribute would put the document's :has() rules back in
 * play on every scroll past, which is the cost this is avoiding in the first place.
 */
async function pulseStates(stack: Locator): Promise<string[]> {
  return stack.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>('.paper-front')]
      .flatMap((sheet) => sheet.getAnimations({ subtree: true }))
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('paper-pulse-'))
      .map((animation) => animation.playState));
}

const RUNNING = ['running', 'running', 'running'];
const PAUSED = ['paused', 'paused', 'paused'];

test('the resting dog-ear breathes only on a stack that is on screen', async ({ page }) => {
  await page.goto('/playground/stacks.html');

  const first = stackNamed(page, 'First stack');
  await expect(first).toBeVisible();

  await first.scrollIntoViewIfNeeded();
  // The pulse comes in once the dog-ear has drawn itself.
  await expect.poll(() => pulseStates(first), { timeout: 5_000 }).toEqual(RUNNING);

  // The foot of the page, nowhere near the first stack.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => pulseStates(first), { timeout: 5_000 }).toEqual(PAUSED);

  // Back in view, and the tease picks up where it left off.
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => pulseStates(first), { timeout: 5_000 }).toEqual(RUNNING);
});

test('a page turn leaves the new front page breathing', async ({ page }) => {
  await page.goto('/');

  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  const before = await frontPageName(stack);

  await stack.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press('ArrowRight');
  await expect(stack).toHaveAttribute('data-paper-settled', '', { timeout: 20_000 });
  expect(await frontPageName(stack)).not.toBe(before);

  // The pulse travels with the front-page role, and the stack is in view, so it runs.
  await expect.poll(() => pulseStates(stack), { timeout: 5_000 }).toEqual(RUNNING);
  const front = frontPage(stack, await frontPageIndex(stack));
  await expect(front).toHaveClass(/paper-front/);
});

// What each pulse layer animates. A custom property, or anything else the compositor cannot run
// by itself, would put the page's style resolve and the sheet's repaint back on every frame.
test('the pulse animates only what the compositor runs on its own', async ({ page }) => {
  await page.goto('/');
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await expect.poll(() => pulseStates(stack)).toEqual(RUNNING);

  const animated = await stack.evaluate((el) =>
    el.querySelector('.paper-front')!.getAnimations({ subtree: true })
      .filter((animation) => (animation as CSSAnimation).animationName?.startsWith('paper-pulse-'))
      .map((animation) => {
        const keys = (animation.effect as KeyframeEffect).getKeyframes()
          .flatMap((frame) => Object.keys(frame))
          .filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key));
        return `${(animation as CSSAnimation).animationName}: ${[...new Set(keys)].join(', ')}`;
      })
      .sort());
  expect(animated).toEqual([
    'paper-pulse-flap: transform',
    'paper-pulse-page: clipPath',
    'paper-pulse-shade: scale',
  ]);
});

// The pulse grows the dog-ear without moving --paper-fold-x/-y, so a hand that takes the flap at
// the pulse's peak has to start from the size it sees there, not from the resting size.
test('taking the dog-ear mid-pulse starts the drag from the size it was drawn at', async ({ page }) => {
  await page.goto('/');
  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await expect.poll(() => pulseStates(stack)).toEqual(RUNNING);
  await dogEarShown(stack);

  // Held at its peak, 3cm by 2cm (the default --paper-fold-pulse-x/-y): the delay, then 90% of
  // the 7.5s run.
  const point = await stack.evaluate((el) => {
    for (const animation of el.querySelector('.paper-front')!.getAnimations({ subtree: true })) {
      if (!(animation as CSSAnimation).animationName?.startsWith('paper-pulse-')) continue;
      animation.pause();
      animation.currentTime = 1500 + 0.9 * 7500;
    }
    const flap = el.querySelector<HTMLElement>('.paper-front > .paper-fold')!;
    const rect = flap.getBoundingClientRect();
    for (const k of [0.45, 0.4, 0.35, 0.3, 0.25, 0.2]) {
      const at = { x: rect.left + rect.width * k, y: rect.top + rect.height * k };
      if (document.elementFromPoint(at.x, at.y) === flap) return at;
    }
    return null;
  });
  expect(point, 'a point on the flap at the peak').not.toBeNull();

  await page.mouse.move(point!.x, point!.y);
  await page.mouse.down();
  await page.mouse.move(point!.x - 2, point!.y - 2);
  const size = await stack.locator('.paper-front').evaluate((sheet) => ({
    x: parseFloat(sheet.style.getPropertyValue('--paper-fold-x')),
    y: parseFloat(sheet.style.getPropertyValue('--paper-fold-y')),
  }));
  await page.mouse.up();

  // 3cm and 2cm are 113.4px and 75.6px; the resting 2cm by 1cm would be 75.6px by 37.8px.
  expect(size.x).toBeGreaterThan(105);
  expect(size.y).toBeGreaterThan(68);
});

/**
 * Takes hold of the front page's dog-ear and returns the point the pointer is now on. The flap
 * is a triangle inside its box and it breathes, so a point picked off the box can be paper one
 * moment and page the next: the browser's own hit test has the last word, and it is asked again
 * after the pointer has landed (a pointer resting on the flap holds the pulse still).
 */
async function takeFlap(stack: Locator): Promise<{ x: number, y: number }> {
  const page = stack.page();
  await expect.poll(async () => (await stack.locator('.paper-fold').boundingBox())?.width ?? 0).toBeGreaterThan(20);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const point = await stack.evaluate((el) => {
      const flap = el.querySelector<HTMLElement>('.paper-fold')!;
      const rect = flap.getBoundingClientRect();
      for (const k of [0.45, 0.4, 0.35, 0.3, 0.25, 0.2]) {
        const at = { x: rect.left + rect.width * k, y: rect.top + rect.height * k };
        if (document.elementFromPoint(at.x, at.y) === flap) return at;
      }
      return null;
    });
    if (!point) continue;
    await page.mouse.move(point.x, point.y);
    await framesPass(page);
    const held = await stack.evaluate(
      (el, at) => document.elementFromPoint(at.x, at.y) === el.querySelector('.paper-fold'),
      point,
    );
    if (held) return point;
  }
  throw new Error('no point on the dog-ear takes the pointer');
}

async function dragTo(page: Page, from: { x: number, y: number }, to: { x: number, y: number }): Promise<void> {
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(from.x + (to.x - from.x) * step / 12, from.y + (to.y - from.y) * step / 12);
    await page.waitForTimeout(30);
  }
}

const eventTypes = (page: Page) => page.evaluate(() => window.paperEvents!.map((event) => event.type));

/**
 * A page's own content can hold still for a turn, but only from the commit point: paper:turnstart
 * fires once the turn is certain, which for a drag is the moment it passes the commit point with
 * the hand still on the paper. A drag that comes back short of the threshold must not announce a
 * turn at all, since content that stopped there would stop for nothing. paper:turnend comes with
 * the settle, once the arriving page is lying flat.
 */
test('a drag announces the turn once it is certain, not before, and ends it at the settle', async ({ page }) => {
  await page.goto('/');

  const stack = playgroundStack(page);
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  const started = await frontPageIndex(stack);
  const box = (await stack.boundingBox())!;
  await page.evaluate(() => { window.paperEvents!.length = 0; });

  const grab = await takeFlap(stack);
  await page.mouse.down();

  // Short of the commit point: the flap says so, and no turn has been announced.
  const shy = { x: box.x + box.width * 0.88, y: box.y + box.height * 0.88 };
  await dragTo(page, grab, shy);
  await expect(stack.locator('.paper-fold')).not.toHaveClass(/paper-fold--will-commit/);
  await page.waitForTimeout(600);
  expect(await eventTypes(page)).not.toContain('paper:turnstart');
  expect(await page.evaluate(() => window.paper!.state.turning)).toBe(false);

  // Past it, with the hand still on the paper: the turn is going to happen, so it is announced
  // now rather than at the release.
  await dragTo(page, shy, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 });
  await expect(stack.locator('.paper-fold')).toHaveClass(/paper-fold--will-commit/);
  await expect.poll(() => eventTypes(page)).toContain('paper:turnstart');
  expect(await page.evaluate(() => window.paper!.state.turning)).toBe(true);
  expect(await eventTypes(page)).not.toContain('paper:turnend');

  // And the turn ends once the stack has settled on the arriving page, not before.
  await page.mouse.up();
  await expect(stack).toHaveAttribute('data-paper-settled', '', { timeout: 20_000 });
  const landed = await frontPageIndex(stack);
  expect(landed).not.toBe(started);
  await expect.poll(() => eventTypes(page)).toContain('paper:turnend');
  const types = await eventTypes(page);
  expect(types.filter((type) => type === 'paper:turnstart')).toHaveLength(1);
  expect(types.indexOf('paper:turnend')).toBeGreaterThan(types.indexOf('paper:settle'));
  expect(await page.evaluate(() => window.paper!.state.turning)).toBe(false);
});
