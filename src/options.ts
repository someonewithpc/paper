import type {
  PaperAnnounceDetail, PaperBookDisplay, PaperBookInteractions, PaperBookOptions, PaperBookView, PaperDecorations,
  PaperInteractions, PaperMode, PaperOptions, PaperStackOptions, PaperStrings,
} from './types.js';

// Book mode isn't one of PaperModeOptions until its driver lands with it.
type AnyOptions = PaperOptions | PaperBookOptions;
type AnyMode = PaperMode | 'book';

export const DEFAULT_INTERACTIONS: Readonly<PaperInteractions> = Object.freeze({
  drag: true, backGrab: true, keyboard: true, wheel: true, swipe: true, tease: true,
});

export const DEFAULT_BOOK_INTERACTIONS: Readonly<PaperBookInteractions> = Object.freeze({
  drag: true, keyboard: true, wheel: true, swipe: true, tease: true,
});

export const DEFAULT_DECORATIONS: Readonly<PaperDecorations> = Object.freeze({ clip: true, hint: true });

export const DEFAULT_STRINGS: Readonly<PaperStrings> = Object.freeze({
  roleDescription: 'paper stack',
  keys: 'The left and right arrow keys turn the pages',
});

export const DEFAULT_BOOK_STRINGS: Readonly<PaperStrings> = Object.freeze({
  roleDescription: 'book',
  keys: 'The left and right arrow keys turn the pages, Home and End go to the covers',
});

export const DEFAULT_THEME_ATTRIBUTES: readonly string[] = Object.freeze(['data-theme']);

export const defaultAnnounce = ({ index, count, title }: PaperAnnounceDetail): string =>
  `Page ${index + 1} of ${count}${title ? `: ${title}` : ''}`;

export const defaultBookAnnounce = ({ pages, count, title }: PaperAnnounceDetail & PaperBookView): string => {
  const first = pages[0] ?? 0;
  const last = pages[pages.length - 1] ?? first;
  const where = last > first ? `Pages ${first + 1} and ${last + 1}` : `Page ${first + 1}`;
  return `${where} of ${count}${title ? `: ${title}` : ''}`;
};

export const defaultPageTitle = (page: HTMLElement): string | undefined => {
  const own = page.dataset['paperTitle'] ?? page.getAttribute('aria-label');
  if (own) return own.trim() || undefined;
  return page.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim() || undefined;
};

/** Options with every default filled in. */
export interface ResolvedStackOptions {
  mode: 'stack';
  startPage: number;
  wrap: boolean;
  interactions: PaperInteractions;
  decorations: PaperDecorations;
  reducedMotion: 'system' | 'reduce';
  announce: ((detail: PaperAnnounceDetail) => string) | false;
  pageTitle: (page: HTMLElement) => string | undefined;
  strings: PaperStrings;
  describedBy: string | undefined;
  themeAttributes: readonly string[];
  resizeHold: NonNullable<PaperStackOptions['resizeHold']>;
  onTurnStart: PaperStackOptions['onTurnStart'];
  onTurnEnd: PaperStackOptions['onTurnEnd'];
  onChange: PaperStackOptions['onChange'];
  onSettle: PaperStackOptions['onSettle'];
}

export const resolveStackOptions = (options: PaperStackOptions = {}): ResolvedStackOptions => ({
  mode: 'stack',
  startPage: options.startPage ?? 0,
  wrap: options.wrap ?? true,
  interactions: { ...DEFAULT_INTERACTIONS, ...options.interactions },
  decorations: { ...DEFAULT_DECORATIONS, ...options.decorations },
  reducedMotion: options.reducedMotion ?? 'system',
  announce: options.announce ?? defaultAnnounce,
  pageTitle: options.pageTitle ?? defaultPageTitle,
  strings: { ...DEFAULT_STRINGS, ...options.strings },
  describedBy: options.describedBy,
  themeAttributes: options.themeAttributes ?? DEFAULT_THEME_ATTRIBUTES,
  resizeHold: options.resizeHold ?? true,
  onTurnStart: options.onTurnStart,
  onTurnEnd: options.onTurnEnd,
  onChange: options.onChange,
  onSettle: options.onSettle,
});

export interface ResolvedBookOptions {
  mode: 'book';
  startPage: number;
  display: PaperBookDisplay;
  interactions: PaperBookInteractions;
  hardCovers: boolean;
  autoCenter: boolean;
  shading: boolean;
  reducedMotion: 'system' | 'reduce';
  announce: ((detail: PaperAnnounceDetail & PaperBookView) => string) | false;
  pageTitle: (page: HTMLElement) => string | undefined;
  strings: PaperStrings;
  describedBy: string | undefined;
  themeAttributes: readonly string[];
  onTurnStart: PaperBookOptions['onTurnStart'];
  onTurnEnd: PaperBookOptions['onTurnEnd'];
  onChange: PaperBookOptions['onChange'];
  onSettle: PaperBookOptions['onSettle'];
}

export const resolveBookOptions = (options: Omit<PaperBookOptions, 'mode'> = {}): ResolvedBookOptions => ({
  mode: 'book',
  startPage: options.startPage ?? 0,
  display: options.display ?? 'auto',
  interactions: { ...DEFAULT_BOOK_INTERACTIONS, ...options.interactions },
  hardCovers: options.hardCovers ?? false,
  autoCenter: options.autoCenter ?? true,
  shading: options.shading ?? true,
  reducedMotion: options.reducedMotion ?? 'system',
  announce: options.announce ?? defaultBookAnnounce,
  pageTitle: options.pageTitle ?? defaultPageTitle,
  strings: { ...DEFAULT_BOOK_STRINGS, ...options.strings },
  describedBy: options.describedBy,
  themeAttributes: options.themeAttributes ?? DEFAULT_THEME_ATTRIBUTES,
  onTurnStart: options.onTurnStart,
  onTurnEnd: options.onTurnEnd,
  onChange: options.onChange,
  onSettle: options.onSettle,
});

type Dataset = Readonly<Record<string, string | undefined>>;

type SharedDataOptions = 'startPage' | 'reducedMotion' | 'describedBy' | 'themeAttributes';

/** The stack options that can be written as `data-paper-*` attributes. */
export type PaperStackDataOptions = Pick<PaperStackOptions, 'mode' | SharedDataOptions | 'wrap'> & {
  interactions?: Partial<PaperInteractions>;
  decorations?: Partial<PaperDecorations>;
  strings?: Partial<PaperStrings>;
  resizeHold?: boolean;
};

/** The book options that can be written as `data-paper-*` attributes. */
export type PaperBookDataOptions = Pick<PaperBookOptions, 'mode' | SharedDataOptions | 'display' | 'hardCovers' | 'autoCenter' | 'shading'> & {
  interactions?: Partial<PaperBookInteractions>;
  strings?: Partial<PaperStrings>;
};

export type PaperDataOptions = PaperStackDataOptions | PaperBookDataOptions;

export interface ParsedDataOptions {
  options: PaperDataOptions;
  /** One line per attribute that was present but invalid, and so ignored. */
  errors: string[];
}

// The attribute each option is mirrored to, as `data-paper-<name>`, keyed by its dataset name, and
// the modes that take it.
const BOOLEAN_OPTIONS = {
  paperWrap: { name: 'wrap', modes: ['stack'] },
  paperResizeHold: { name: 'resizeHold', modes: ['stack'] },
  paperHardCovers: { name: 'hardCovers', modes: ['book'] },
  paperAutoCenter: { name: 'autoCenter', modes: ['book'] },
  paperShading: { name: 'shading', modes: ['book'] },
} as const satisfies Record<string, { name: string, modes: readonly AnyMode[] }>;

const BOOLEAN_INTERACTIONS = {
  paperDrag: { name: 'drag', modes: ['stack', 'book'] },
  paperBackGrab: { name: 'backGrab', modes: ['stack'] },
  paperKeyboard: { name: 'keyboard', modes: ['stack', 'book'] },
  paperWheel: { name: 'wheel', modes: ['stack', 'book'] },
  paperSwipe: { name: 'swipe', modes: ['stack', 'book'] },
  paperTease: { name: 'tease', modes: ['stack', 'book'] },
} as const satisfies Record<string, { name: keyof PaperInteractions, modes: readonly AnyMode[] }>;

const BOOLEAN_DECORATIONS = {
  paperClip: 'clip',
  paperHint: 'hint',
} as const satisfies Record<string, keyof PaperDecorations>;

const STRING_OPTIONS = {
  paperRoleDescription: 'roleDescription',
  paperKeys: 'keys',
} as const satisfies Record<string, keyof PaperStrings>;

const MODES: readonly AnyMode[] = ['stack', 'book'];
const DISPLAYS: readonly PaperBookDisplay[] = ['single', 'double', 'auto'];

const attributeName = (key: string): string =>
  `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

const parseBoolean = (value: string): boolean | undefined =>
  value === '' || value === 'true' ? true : value === 'false' ? false : undefined;

const isMode = (value: string): value is AnyMode => (MODES as readonly string[]).includes(value);

/**
 * Reads the `data-paper-*` option attributes off an element's dataset. Pure: pass any record of
 * strings. The mode is `mode` if given, else `data-paper-mode`, else `stack`. An attribute with a
 * value it can't take, or one the mode doesn't take, is reported in `errors` and left out.
 */
export function parseDataOptions(dataset: Dataset, mode?: AnyMode): ParsedDataOptions {
  const errors: string[] = [];
  const invalid = (key: string, value: string, expected: string) =>
    errors.push(`${attributeName(key)}="${value}" is not ${expected}`);

  const raw = dataset['paperMode'];
  let own: AnyMode | undefined;
  if (raw !== undefined) {
    if (isMode(raw)) own = raw;
    else invalid('paperMode', raw, '"stack" or "book"');
  }
  const active = mode ?? own ?? 'stack';
  const options: Record<string, unknown> = {};
  if (own !== undefined) options['mode'] = own;
  const takes = (key: string, modes: readonly AnyMode[]): boolean => {
    if (modes.includes(active)) return true;
    errors.push(`${attributeName(key)} only applies in ${modes.join(' and ')} mode`);
    return false;
  };

  const startPage = dataset['paperStartPage'];
  if (startPage !== undefined) {
    const value = Number(startPage);
    if (startPage.trim() !== '' && Number.isInteger(value) && value >= 0) options['startPage'] = value;
    else invalid('paperStartPage', startPage, 'a whole number from 0');
  }

  for (const [key, { name, modes }] of Object.entries(BOOLEAN_OPTIONS)) {
    const value = dataset[key];
    if (value === undefined || !takes(key, modes)) continue;
    const parsed = parseBoolean(value);
    if (parsed === undefined) invalid(key, value, '"true" or "false"');
    else options[name] = parsed;
  }

  const display = dataset['paperDisplay'];
  if (display !== undefined && takes('paperDisplay', ['book'])) {
    if ((DISPLAYS as readonly string[]).includes(display)) options['display'] = display;
    else invalid('paperDisplay', display, '"single", "double" or "auto"');
  }

  const motion = dataset['paperReducedMotion'];
  if (motion !== undefined) {
    if (motion === 'system' || motion === 'reduce') options['reducedMotion'] = motion;
    else invalid('paperReducedMotion', motion, '"system" or "reduce"');
  }

  const group = (name: string) => (options[name] ??= {}) as Record<string, unknown>;

  for (const [key, { name, modes }] of Object.entries(BOOLEAN_INTERACTIONS)) {
    const value = dataset[key];
    if (value === undefined || !takes(key, modes)) continue;
    const parsed = parseBoolean(value);
    if (parsed === undefined) invalid(key, value, '"true" or "false"');
    else group('interactions')[name] = parsed;
  }

  for (const [key, name] of Object.entries(BOOLEAN_DECORATIONS)) {
    const value = dataset[key];
    if (value === undefined || !takes(key, ['stack'])) continue;
    const parsed = parseBoolean(value);
    if (parsed === undefined) invalid(key, value, '"true" or "false"');
    else group('decorations')[name] = parsed;
  }

  for (const [key, name] of Object.entries(STRING_OPTIONS)) {
    const value = dataset[key];
    if (value !== undefined) group('strings')[name] = value;
  }

  const describedBy = dataset['paperDescribedBy'];
  if (describedBy !== undefined) {
    if (describedBy.trim() !== '') options['describedBy'] = describedBy.trim();
    else invalid('paperDescribedBy', describedBy, 'an element id');
  }

  const themeAttributes = dataset['paperThemeAttributes'];
  if (themeAttributes !== undefined) options['themeAttributes'] = themeAttributes.split(/\s+/).filter(Boolean);

  return { options: options as PaperDataOptions, errors };
}

/**
 * The `data-paper-*` attributes that say the same as `options`, for markup a script will enhance
 * later. Functions can't be written down, so callbacks, `announce` and `pageTitle` are left out,
 * as is a `ResizeHoldSource`.
 */
export function dataAttributesOf(options: AnyOptions): Record<string, string> {
  const attributes: Record<string, string> = {};
  const set = (key: string, value: string | number | boolean) => {
    attributes[attributeName(key)] = String(value);
  };
  const given = options as Record<string, unknown> & {
    interactions?: Record<string, boolean | undefined>;
    decorations?: Record<string, boolean | undefined>;
  };
  if (options.mode !== undefined) set('paperMode', options.mode);
  if (options.startPage !== undefined) set('paperStartPage', options.startPage);
  for (const [key, { name }] of Object.entries(BOOLEAN_OPTIONS)) {
    const value = given[name];
    if (typeof value === 'boolean') set(key, value);
  }
  if (options.mode === 'book' && options.display !== undefined) set('paperDisplay', options.display);
  if (options.reducedMotion !== undefined) set('paperReducedMotion', options.reducedMotion);
  for (const [key, { name }] of Object.entries(BOOLEAN_INTERACTIONS)) {
    const value = given.interactions?.[name];
    if (value !== undefined) set(key, value);
  }
  for (const [key, name] of Object.entries(BOOLEAN_DECORATIONS)) {
    const value = given.decorations?.[name];
    if (value !== undefined) set(key, value);
  }
  for (const [key, name] of Object.entries(STRING_OPTIONS)) {
    const value = options.strings?.[name];
    if (value !== undefined) set(key, value);
  }
  if (options.describedBy !== undefined) set('paperDescribedBy', options.describedBy);
  if (options.themeAttributes !== undefined) set('paperThemeAttributes', options.themeAttributes.join(' '));
  return attributes;
}

/** Options from attributes, overridden by the ones given in code, key by key in the nested groups. */
export function mergeOptions(fromData: PaperDataOptions, given: AnyOptions = {}): AnyOptions {
  const data = fromData as Record<string, unknown>;
  const code = given as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...data, ...code };
  for (const name of ['interactions', 'decorations', 'strings']) {
    const nested = { ...(data[name] as object | undefined), ...(code[name] as object | undefined) };
    if (Object.keys(nested).length) merged[name] = nested;
  }
  return merged as AnyOptions;
}
