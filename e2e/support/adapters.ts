import { expect, test, type Locator, type Page } from '@playwright/test';

import { flapGrip } from './fold.js';
import { dogEarShown, settledAfter } from './paperStack.js';

export const ASTRO_URL = `http://localhost:${Number(process.env['E2E_ASTRO_PORT'] ?? 4323)}`;
export const ADAPTERS_URL = `http://localhost:${Number(process.env['E2E_ADAPTERS_PORT'] ?? 4322)}`;

declare global {
  interface Window {
    hydrationErrors?: string[];
    /** Listeners and observers the page holds now, as `target type` and observer class names, sorted. */
    liveCount?: () => { listeners: string[], observers: string[] };
  }
}

/**
 * Counts the event listeners and observers the page holds: added and not yet removed, aborted
 * or fired once. Installed before any of the page's scripts run.
 */
export const countLive = () => {
  const listeners = new Map<EventTarget, Map<string, string>>();
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (value: object) => {
    if (!ids.has(value)) ids.set(value, ++next);
    return ids.get(value);
  };
  const keyOf = (type: string, listener: object, options?: boolean | EventListenerOptions) =>
    `${type} ${id(listener)} ${typeof options === 'boolean' ? options : !!options?.capture}`;
  const describe = (target: EventTarget) => {
    if (target instanceof Element) return target.id ? `#${target.id}` : target.localName;
    if (target === document) return 'document';
    if (target === window) return 'window';
    return target.constructor.name;
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    add.call(this, type, listener, options);
    if (!listener || (typeof options === 'object' && (options.once || options.signal?.aborted))) return;
    const key = keyOf(type, listener, options);
    const keys = listeners.get(this) ?? new Map<string, string>();
    listeners.set(this, keys);
    keys.set(key, `${describe(this)} ${type}`);
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (signal) add.call(signal, 'abort', () => keys.delete(key), { once: true });
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    remove.call(this, type, listener, options);
    if (listener) listeners.get(this)?.delete(keyOf(type, listener, options));
  };

  const observers = new Set<{ constructor: { name: string } }>();
  for (const name of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver'] as const) {
    const Original = window[name] as unknown as { new (...args: never[]): { observe(...args: unknown[]): void, disconnect(): void } };
    (window as unknown as Record<string, unknown>)[name] = class Counted extends Original {
      static override get name() {
        return name;
      }

      override observe(...args: unknown[]) {
        observers.add(this);
        super.observe(...args);
      }

      override disconnect() {
        observers.delete(this);
        super.disconnect();
      }
    };
  }

  window.liveCount = () => ({
    // An aborted signal fires no more, and an element out of the document goes with what listens
    // to it: a leak holds on to the window, the document or a live element.
    listeners: [...listeners]
      .filter(([target]) => !(target instanceof AbortSignal && target.aborted) && !(target instanceof Node && !target.isConnected))
      .flatMap(([, keys]) => [...keys.values()]).sort(),
    observers: [...observers].map((observer) => observer.constructor.name).sort(),
  });
};

/** Opens a framework's playground page and waits for both components to have their controllers. */
export async function openAdapter(page: Page, framework: string): Promise<{ stack: Locator, book: Locator }> {
  await page.addInitScript(countLive);
  await page.goto(`${ADAPTERS_URL}/${framework}/`);
  // A page's first load on a cold dev server waits for its modules to compile.
  await expect(page.locator('#stack-state')).not.toHaveText('none', { timeout: 30_000 });
  await expect(page.locator('#book-state')).not.toHaveText('none');
  const stack = page.locator('#stack');
  const book = page.locator('#book');
  await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
  await expect(book).toHaveAttribute('aria-roledescription', 'book');
  return { stack, book };
}

/** Drags the stack's dog-ear up and left across the sheet, far past the commit point. */
export async function dragStackForward(page: Page, stack: Locator): Promise<void> {
  await stack.scrollIntoViewIfNeeded();
  await dogEarShown(stack);
  const grip = await flapGrip(stack);
  const box = (await stack.boundingBox())!;
  await settledAfter(stack, async () => {
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    const steps = 16;
    for (let i = 1; i <= steps; ++i) {
      await page.mouse.move(grip.x - (box.width * 0.9 * i) / steps, grip.y - (box.height * 0.6 * i) / steps);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
  });
}

/** Drags the bottom corner of the book's right-hand page across the spine to the left. */
export async function dragBookForward(page: Page, book: Locator): Promise<void> {
  await book.scrollIntoViewIfNeeded();
  const box = await book.evaluate((el) => {
    const pages = [...el.querySelectorAll<HTMLElement>(':scope > [data-paper-place="view"]')];
    const rect = pages[pages.length - 1]!.getBoundingClientRect();
    return { right: rect.right, bottom: rect.bottom, width: rect.width };
  });
  const x0 = box.right - 3;
  const y0 = box.bottom - 3;
  await settledAfter(book, async () => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    const steps = 16;
    for (let i = 1; i <= steps; ++i) {
      const t = i / steps;
      await page.mouse.move(x0 - 2 * box.width * t, y0 - 0.15 * box.width * Math.sin(Math.PI * t));
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
  });
}

export async function press(root: Locator, key: string): Promise<void> {
  await root.scrollIntoViewIfNeeded();
  await root.focus();
  await settledAfter(root, () => root.page().keyboard.press(key));
}

/** The specs every framework's adapter passes, on its playground page at `/<framework>/`. */
export function adapterSpecs(framework: string): void {
  test.describe(`the ${framework} adapter`, () => {
    test('renders on the server and hydrates without a mismatch', async ({ page }) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(String(error)));
      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) problems.push(message.text());
      });
      const response = await page.request.get(`${ADAPTERS_URL}/${framework}/`);
      const html = await response.text();
      expect(html).toMatch(/<div[^>]* data-paper-stack(="")?[ >]/);
      expect(html).toMatch(/<div[^>]* data-paper-book(="")?[ >]/);
      expect(html).toContain('First sheet');
      await openAdapter(page, framework);
      expect(await page.evaluate(() => window.hydrationErrors ?? [])).toEqual([]);
      expect(problems).toEqual([]);
    });

    test('turns the stack by keyboard and by drag', async ({ page }) => {
      const { stack } = await openAdapter(page, framework);
      const state = page.locator('#stack-state');
      await expect(state).toHaveText('0');
      await press(stack, 'ArrowRight');
      await expect(state).toHaveText('1');
      await dragStackForward(page, stack);
      await expect(state).toHaveText('2');
      await expect(page.locator('#changes')).toHaveText('2');
      await expect(stack.locator(':scope > .paper-front h2')).toHaveText('Third sheet');
    });

    test('turns the book by keyboard and by drag', async ({ page }) => {
      const { book } = await openAdapter(page, framework);
      const state = page.locator('#book-state');
      await expect(state).toHaveText('0');
      await press(book, 'ArrowRight');
      await expect(state).toHaveText('1');
      await dragBookForward(page, book);
      await expect(state).toHaveText('2');
      await expect(book.locator(':scope > [data-paper-place="view"] h2')).toHaveText(['Chapter two', 'Notes']);
    });

    test('mounts, unmounts and mounts again without leaking listeners', async ({ page }) => {
      const { stack } = await openAdapter(page, framework);
      const toggle = () => page.locator('#toggle').evaluate((button: HTMLElement) => button.click());
      const live = () => page.evaluate(() => window.liveCount!());
      // Playwright's own actions listen on the window too, so each count follows the same ones.
      const turnOnce = async () => {
        await expect(stack).toHaveAttribute('aria-roledescription', 'paper stack');
        await expect(page.locator('#stack-state')).toHaveText('0');
        await press(stack, 'ArrowRight');
        await expect(page.locator('#stack-state')).toHaveText('1');
      };

      await turnOnce();
      const mounted = await live();
      await toggle();
      await expect(page.locator('#stack')).toHaveCount(0);
      await expect(page.locator('#stack-state')).toHaveText('none');
      const unmounted = await live();
      expect(unmounted.listeners.length).toBeLessThan(mounted.listeners.length);
      expect(unmounted.observers.length).toBeLessThan(mounted.observers.length);

      await toggle();
      await turnOnce();
      await expect.poll(live).toEqual(mounted);
      await toggle();
      await expect(page.locator('#stack')).toHaveCount(0);
      await expect.poll(live).toEqual(unmounted);
    });
  });
}
