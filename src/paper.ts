import { enhanceStack, isEnhanced } from './enhance.js';
import { mergeOptions, parseDataOptions, resolveStackOptions } from './options.js';
import { attachStack, nextSettle, refreshStack, stackState, type StackDriver } from './stack/stack.js';
import type {
  PaperController, PaperEventListener, PaperEventType, PaperGoToOptions, PaperMode, PaperModeOptions,
  PaperOptions, PaperStackOptions,
} from './types.js';

type ModeFactory<M extends PaperMode> = (root: HTMLElement, options: PaperModeOptions[M]) => PaperController<M>;

// A mode turns options into a controller. A new mode adds its options to PaperModeOptions and its
// factory here, and the compiler asks for both.
const modes: { [M in PaperMode]: ModeFactory<M> } = {
  stack: (root, options) => createStack(root, options),
};

const modeOf = (options: PaperOptions): PaperMode => options.mode ?? 'stack';

/**
 * Turns `root` into a paper stack and returns its controller. `root`'s element children become
 * the pages, unless it already carries the markup {@link renderStack} writes. `data-paper-*`
 * attributes on `root` give options too; the ones passed here win.
 */
export function createPaper(root: HTMLElement, options?: PaperStackOptions): PaperController<'stack'>;
export function createPaper(root: HTMLElement, options?: PaperOptions): PaperController;
export function createPaper(root: HTMLElement, options: PaperOptions = {}): PaperController {
  if (typeof window === 'undefined') throw new Error('createPaper needs a DOM; render the markup with renderStack on the server');
  const { options: fromData, errors } = parseDataOptions(root.dataset, options.mode);
  for (const error of errors) console.warn(`[paper] ${error}, ignored`);
  const merged = mergeOptions(fromData, options) as PaperOptions;
  const mode = modeOf(merged);
  const factory = modes[mode] as ModeFactory<typeof mode>;
  return factory(root, merged);
}

// Observers that write are created after every other script on the page has had its turn, not as
// soon as this one runs. The browser delivers resize observations in creation order, and these
// write --paper-page-w/-h on every page, which dirtied the style of the whole document before a
// later observer that reads client rects got its turn: about 40 ms of forced style resolution per
// resize step on a heavy page. Between DOMContentLoaded and load the state is still "interactive",
// so the navigation entry says whether the event has fired rather than a wait for one that will
// not come.
const documentReady = (): Promise<void> => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (document.readyState === 'complete' || navigation?.domContentLoadedEventStart) return Promise.resolve();
  return new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
};

const statusOf = (root: HTMLElement): HTMLElement | null => {
  for (let sibling = root.nextElementSibling; sibling?.matches('[data-paper-status], [data-paper-keys]'); sibling = sibling.nextElementSibling) {
    if (sibling.matches('[data-paper-status]')) return sibling as HTMLElement;
  }
  return null;
};

const keysOf = (root: HTMLElement): HTMLElement | null => {
  for (let sibling = root.nextElementSibling; sibling?.matches('[data-paper-status], [data-paper-keys]'); sibling = sibling.nextElementSibling) {
    if (sibling.matches('[data-paper-keys]')) return sibling as HTMLElement;
  }
  return null;
};

// What both modes write on the root and beside it: the role description, the keys text, the live
// region and the event listeners. `restore` takes back the attributes it added.
interface RootWiring {
  status: HTMLElement | null;
  set(name: string, value: string): void;
  on<K extends PaperEventType>(type: K, listener: (event: Event) => void): () => void;
  off<K extends PaperEventType>(type: K, listener: (event: Event) => void): void;
  restore(): void;
}

interface RootSetup {
  strings: { roleDescription: string, keys: string };
  describedBy: string | undefined;
  keyboard: boolean;
  announce: boolean;
  callbacks: readonly (readonly [PaperEventType, ((detail: never) => void) | undefined])[];
}

function wireRoot(root: HTMLElement, setup: RootSetup, signal: AbortSignal): RootWiring {
  const added: string[] = [];
  const set = (name: string, value: string) => {
    if (root.getAttribute(name) === value) return;
    root.setAttribute(name, value);
    added.push(name);
  };

  set('aria-roledescription', setup.strings.roleDescription);
  // Only the scripted root turns pages by keyboard; without script it is a scroll row.
  if (setup.keyboard) {
    if (root.tabIndex < 0) {
      root.tabIndex = 0;
      added.push('tabindex');
    }
    // Hidden text, not aria-description: that attribute is still a draft and many screen readers
    // skip it. A describedby reference reads hidden text all the same.
    let describedBy = setup.describedBy;
    if (describedBy === undefined) {
      const keys = keysOf(root);
      if (keys) {
        keys.textContent = setup.strings.keys;
        describedBy = keys.id;
      }
    }
    if (describedBy) set('aria-describedby', describedBy);
  }

  let status = statusOf(root);
  if (!status && setup.announce) {
    status = document.createElement('div');
    status.className = 'paper-sr-only';
    status.setAttribute('role', 'status');
    status.dataset['paperStatus'] = '';
    root.after(status);
  }

  // The events bubble, so a stack inside one of this stack's pages would reach these listeners too.
  const own = new Map<string, Map<EventListener, EventListener>>();
  const listen = (type: string, listener: (event: Event) => void): EventListener => {
    const filtered: EventListener = (event) => {
      if (event.target === root) listener(event);
    };
    root.addEventListener(type, filtered, { signal });
    return filtered;
  };
  for (const [type, callback] of setup.callbacks) {
    if (callback) listen(type, (event) => (callback as (detail: unknown) => void)((event as CustomEvent).detail));
  }

  const off = (type: PaperEventType, listener: (event: Event) => void) => {
    const key = listener as EventListener;
    const filtered = own.get(type)?.get(key);
    if (!filtered) return;
    own.get(type)!.delete(key);
    root.removeEventListener(type, filtered);
  };

  return {
    status,
    set,
    on(type, listener) {
      const key = listener as EventListener;
      const byListener = own.get(type) ?? new Map<EventListener, EventListener>();
      own.set(type, byListener);
      if (!byListener.has(key)) byListener.set(key, listen(type, key));
      return () => off(type, listener);
    },
    off,
    restore() {
      for (const name of added) root.removeAttribute(name);
    },
  };
}

// Calls `refresh` when an attribute on <html> named in `attributes` changes, or the colour scheme.
const watchTheme = (attributes: readonly string[], refresh: () => void, signal: AbortSignal): void => {
  if (attributes.length) {
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [...attributes] });
    signal.addEventListener('abort', () => observer.disconnect());
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh, { signal });
};

function createStack(root: HTMLElement, given: PaperStackOptions): PaperController<'stack'> {
  if (!isEnhanced(root)) enhanceStack(root, given);
  const options = resolveStackOptions(given);
  const count = root.childElementCount;
  if (!Number.isInteger(options.startPage) || options.startPage < 0 || options.startPage >= count) {
    throw new RangeError(`startPage must be a page index from 0 to ${count - 1}, got ${options.startPage}`);
  }

  const aborter = new AbortController();
  const { signal } = aborter;
  const wiring = wireRoot(root, {
    strings: options.strings,
    describedBy: options.describedBy,
    keyboard: options.interactions.keyboard,
    announce: Boolean(options.announce),
    callbacks: [
      ['paper:turnstart', options.onTurnStart],
      ['paper:turnend', options.onTurnEnd],
      ['paper:change', options.onChange],
      ['paper:settle', options.onSettle],
    ],
  }, signal);
  const { set, status } = wiring;

  // What the stylesheet keys on, written once here, never during a turn.
  if (!options.interactions.drag) set('data-paper-drag', 'false');
  if (!options.interactions.backGrab) set('data-paper-back-grab', 'false');
  if (options.reducedMotion === 'reduce') set('data-paper-reduced-motion', 'reduce');

  let driver: StackDriver | null = null;
  let destroyed = false;
  const ready = documentReady().then(() => {
    if (destroyed) return;
    driver = attachStack(root, { options, status, signal });
    if (!driver) {
      console.warn('[paper] the stack has no front page chrome, so it will not turn');
      return;
    }
    if (given.startPage !== undefined && stackState(root).index !== options.startPage) driver.jump(options.startPage);

    // A theme can carry its own type, and the corner cut is written in em, so the stack's kept
    // lengths are retaken whenever the theme moves.
    watchTheme(options.themeAttributes, () => refreshStack(root), signal);
  });

  const turn = async (forward: boolean): Promise<boolean> => {
    await ready;
    if (!driver || destroyed || !driver.turn(forward)) return false;
    await nextSettle(root);
    return !destroyed;
  };

  const controller: PaperController<'stack'> = {
    root,
    mode: 'stack',
    get state() {
      return stackState(root);
    },
    next: () => turn(true),
    prev: () => turn(false),
    async goTo(index: number, { animate = true }: PaperGoToOptions = {}) {
      await ready;
      if (!driver || destroyed) return false;
      const { index: front, count: pages } = stackState(root);
      if (!Number.isInteger(index) || index < 0 || index >= pages) {
        throw new RangeError(`goTo needs a page index from 0 to ${pages - 1}, got ${index}`);
      }
      if (index === front) return true;
      if (driver.busy()) return false;
      if (!animate) return driver.jump(index);
      const forward = index > front;
      const neighbour = forward ? index - 1 : index + 1;
      if (neighbour !== front && !driver.jump(neighbour)) return false;
      return turn(forward);
    },
    refresh: () => refreshStack(root),
    on: <K extends PaperEventType>(type: K, listener: PaperEventListener<K>) => wiring.on(type, listener as (event: Event) => void),
    off: <K extends PaperEventType>(type: K, listener: PaperEventListener<K>) => wiring.off(type, listener as (event: Event) => void),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      aborter.abort();
      wiring.restore();
    },
  };
  return controller;
}
