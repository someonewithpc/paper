// What the framework adapters share: which props are options, when a change of them needs a new
// controller, and the markup each mode renders. Exported as @someonewithpc/paper/adapter for the
// adapter packages, which are released at the same version as this one.

import { bookMarkup, stackMarkup, type StackMarkup } from '../markup.js';
import { createPaper } from '../paper.js';
import type {
  PaperBookOptions, PaperController, PaperEventType, PaperMode, PaperStackOptions, PaperStateMap,
} from '../types.js';

/** A mode's options without `mode`, which the component names. */
export interface AdapterOptions {
  stack: Omit<PaperStackOptions, 'mode'>;
  book: Omit<PaperBookOptions, 'mode'>;
}

const COMMON_KEYS = [
  'startPage', 'reducedMotion', 'announce', 'pageTitle', 'strings', 'describedBy', 'themeAttributes',
  'interactions', 'onTurnStart', 'onTurnEnd', 'onChange', 'onSettle',
] as const;

export const OPTION_KEYS = {
  stack: [...COMMON_KEYS, 'wrap', 'decorations', 'resizeHold'],
  book: [...COMMON_KEYS, 'display', 'hardCovers', 'autoCenter', 'shading'],
} as const satisfies { [M in PaperMode]: readonly (keyof AdapterOptions[M])[] };

// A new option has to be listed above, or the adapters would pass it to the root as an attribute.
type Unlisted<M extends PaperMode> = Exclude<keyof AdapterOptions[M], (typeof OPTION_KEYS)[M][number]>;
const listed: [Unlisted<'stack'>, Unlisted<'book'>] extends [never, never] ? true : never = true;
void listed;

const CALLBACKS = ['onTurnStart', 'onTurnEnd', 'onChange', 'onSettle'] as const;

/** Splits props into the mode's options, with undefined ones left out, and the rest. */
export function splitProps<M extends PaperMode, P extends object>(
  mode: M, props: P,
): { options: AdapterOptions[M], rest: Omit<P, (typeof OPTION_KEYS)[M][number]> } {
  const keys: readonly string[] = OPTION_KEYS[mode];
  const options: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!keys.includes(key)) rest[key] = value;
    else if (value !== undefined) options[key] = value;
  }
  return { options: options as AdapterOptions[M], rest: rest as Omit<P, (typeof OPTION_KEYS)[M][number]> };
}

const sources = new WeakMap<object, number>();
let sourceCount = 0;

/**
 * A string that changes when the options change in a way only a new controller can take. The
 * event callbacks are left out: {@link liveOptions} reads them when they fire. `announce` and
 * `pageTitle` count by kind, a function, `false` or left out, and a resize-hold source by identity.
 */
export function optionsKey(options: object): string {
  return JSON.stringify(options, (key, value: unknown) => {
    if ((CALLBACKS as readonly string[]).includes(key)) return undefined;
    if (typeof value === 'function') return '(function)';
    if (key === 'resizeHold' && typeof value === 'object' && value !== null) {
      if (!sources.has(value)) sources.set(value, ++sourceCount);
      return `(source ${sources.get(value)})`;
    }
    return value;
  });
}

/**
 * `options` with the callbacks, `announce` and `pageTitle` swapped for ones that call what
 * `latest()` holds when they run, so a new function from a re-render needs no new controller.
 */
export function liveOptions<O extends object>(options: O, latest: () => O): O {
  const live = { ...options } as Record<string, unknown>;
  const current = (name: string) => (latest() as unknown as Record<string, unknown>)[name] as ((detail: unknown) => unknown) | undefined;
  for (const name of CALLBACKS) live[name] = (detail: unknown) => current(name)?.(detail);
  for (const name of ['announce', 'pageTitle']) {
    if (typeof live[name] === 'function') live[name] = (detail: unknown) => current(name)?.(detail);
  }
  return live as O;
}

/** What a component renders around its pages. */
export interface MarkupInput {
  pageCount: number;
  tag?: string | undefined;
  label?: string | undefined;
  id?: string | undefined;
  surfaces?: readonly (string | undefined)[] | undefined;
}

export function markupOf<M extends PaperMode>(mode: M, input: MarkupInput, options: AdapterOptions[M]): StackMarkup {
  const given = {
    pageCount: input.pageCount,
    ...(input.tag === undefined ? {} : { tag: input.tag }),
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.id === undefined ? {} : { id: input.id }),
    ...(input.surfaces === undefined ? {} : { surfaces: input.surfaces }),
  };
  return mode === 'book'
    ? bookMarkup({ ...given, options: options as AdapterOptions['book'] })
    : stackMarkup({ ...given, options: options as AdapterOptions['stack'] });
}

/**
 * A string that changes whenever the markup does. The script moves the chrome between page
 * wrappers and writes their classes and styles as pages turn, so a framework must not patch them:
 * when the markup changes, the component renders a new root instead.
 */
export const markupKey = (markup: StackMarkup): string => JSON.stringify(markup);

export function createFor<M extends PaperMode>(mode: M, root: HTMLElement, options: AdapterOptions[M]): PaperController<M> {
  return (mode === 'book'
    ? createPaper(root, { ...(options as AdapterOptions['book']), mode: 'book' })
    : createPaper(root, { ...(options as AdapterOptions['stack']), mode: 'stack' })) as PaperController<M>;
}

const EVENTS: readonly PaperEventType[] = ['paper:turnstart', 'paper:turnend', 'paper:change', 'paper:settle'];

/** Calls `listener` with the controller's state now and after every paper event. Returns the unsubscribe. */
export function watchState<M extends PaperMode>(
  controller: PaperController<M>, listener: (state: PaperStateMap[M]) => void,
): () => void {
  const update = () => listener(controller.state);
  const offs = EVENTS.map((type) => controller.on(type, update));
  update();
  return () => offs.forEach((off) => off());
}

/**
 * The declarations of a style attribute, in order. Semicolons inside quotes or brackets, as in
 * a `url()` with a data URI, don't end one.
 */
export function parseStyle(css: string): [string, string][] {
  const declarations: [string, string][] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const push = (end: number) => {
    const text = css.slice(start, end);
    const colon = text.indexOf(':');
    if (colon > 0) declarations.push([text.slice(0, colon).trim(), text.slice(colon + 1).trim()]);
    start = end + 1;
  };
  for (let i = 0; i < css.length; ++i) {
    const char = css[i]!;
    if (quote) {
      if (char === '\\') ++i;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') ++depth;
    else if ((char === ')' || char === ']') && depth > 0) --depth;
    else if (char === ';' && depth === 0) push(i);
  }
  push(css.length);
  return declarations;
}

