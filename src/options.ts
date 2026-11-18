import type {
  PaperAnnounceDetail, PaperDecorations, PaperInteractions, PaperOptions, PaperStackOptions, PaperStrings,
} from './types.js';

export const DEFAULT_INTERACTIONS: Readonly<PaperInteractions> = Object.freeze({
  drag: true, backGrab: true, keyboard: true, wheel: true, swipe: true, tease: true,
});

export const DEFAULT_DECORATIONS: Readonly<PaperDecorations> = Object.freeze({ clip: true, hint: true });

export const DEFAULT_STRINGS: Readonly<PaperStrings> = Object.freeze({
  roleDescription: 'paper stack',
  keys: 'The left and right arrow keys turn the pages',
});

export const DEFAULT_THEME_ATTRIBUTES: readonly string[] = Object.freeze(['data-theme']);

export const defaultAnnounce = ({ index, count, title }: PaperAnnounceDetail): string =>
  `Page ${index + 1} of ${count}${title ? `: ${title}` : ''}`;

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

type Dataset = Readonly<Record<string, string | undefined>>;

/** Options that can be written as `data-paper-*` attributes. */
export type PaperDataOptions = Pick<
  PaperStackOptions,
  'mode' | 'startPage' | 'wrap' | 'reducedMotion' | 'describedBy' | 'themeAttributes'
> & {
  interactions?: Partial<PaperInteractions>;
  decorations?: Partial<PaperDecorations>;
  strings?: Partial<PaperStrings>;
  resizeHold?: boolean;
};

export interface ParsedDataOptions {
  options: PaperDataOptions;
  /** One line per attribute that was present but invalid, and so ignored. */
  errors: string[];
}

// The attribute each option is mirrored to, as `data-paper-<name>`, keyed by its dataset name.
const BOOLEAN_INTERACTIONS = {
  paperDrag: 'drag',
  paperBackGrab: 'backGrab',
  paperKeyboard: 'keyboard',
  paperWheel: 'wheel',
  paperSwipe: 'swipe',
  paperTease: 'tease',
} as const satisfies Record<string, keyof PaperInteractions>;

const BOOLEAN_DECORATIONS = {
  paperClip: 'clip',
  paperHint: 'hint',
} as const satisfies Record<string, keyof PaperDecorations>;

const STRING_OPTIONS = {
  paperRoleDescription: 'roleDescription',
  paperKeys: 'keys',
} as const satisfies Record<string, keyof PaperStrings>;

const attributeName = (key: string): string =>
  `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

const parseBoolean = (value: string): boolean | undefined =>
  value === '' || value === 'true' ? true : value === 'false' ? false : undefined;

/**
 * Reads the `data-paper-*` option attributes off an element's dataset. Pure: pass any record of
 * strings. An attribute with a value it can't take is reported in `errors` and left out.
 */
export function parseDataOptions(dataset: Dataset): ParsedDataOptions {
  const options: PaperDataOptions = {};
  const errors: string[] = [];
  const invalid = (key: string, value: string, expected: string) =>
    errors.push(`${attributeName(key)}="${value}" is not ${expected}`);

  const mode = dataset['paperMode'];
  if (mode !== undefined) {
    if (mode === 'stack') options.mode = mode;
    else invalid('paperMode', mode, '"stack"');
  }

  const startPage = dataset['paperStartPage'];
  if (startPage !== undefined) {
    const value = Number(startPage);
    if (startPage.trim() !== '' && Number.isInteger(value) && value >= 0) options.startPage = value;
    else invalid('paperStartPage', startPage, 'a whole number from 0');
  }

  const wrap = dataset['paperWrap'];
  if (wrap !== undefined) {
    const value = parseBoolean(wrap);
    if (value === undefined) invalid('paperWrap', wrap, '"true" or "false"');
    else options.wrap = value;
  }

  const resizeHold = dataset['paperResizeHold'];
  if (resizeHold !== undefined) {
    const value = parseBoolean(resizeHold);
    if (value === undefined) invalid('paperResizeHold', resizeHold, '"true" or "false"');
    else options.resizeHold = value;
  }

  const motion = dataset['paperReducedMotion'];
  if (motion !== undefined) {
    if (motion === 'system' || motion === 'reduce') options.reducedMotion = motion;
    else invalid('paperReducedMotion', motion, '"system" or "reduce"');
  }

  for (const [key, name] of Object.entries(BOOLEAN_INTERACTIONS)) {
    const raw = dataset[key];
    if (raw === undefined) continue;
    const value = parseBoolean(raw);
    if (value === undefined) invalid(key, raw, '"true" or "false"');
    else (options.interactions ??= {})[name] = value;
  }

  for (const [key, name] of Object.entries(BOOLEAN_DECORATIONS)) {
    const raw = dataset[key];
    if (raw === undefined) continue;
    const value = parseBoolean(raw);
    if (value === undefined) invalid(key, raw, '"true" or "false"');
    else (options.decorations ??= {})[name] = value;
  }

  for (const [key, name] of Object.entries(STRING_OPTIONS)) {
    const raw = dataset[key];
    if (raw !== undefined) (options.strings ??= {})[name] = raw;
  }

  const describedBy = dataset['paperDescribedBy'];
  if (describedBy !== undefined) {
    if (describedBy.trim() !== '') options.describedBy = describedBy.trim();
    else invalid('paperDescribedBy', describedBy, 'an element id');
  }

  const themeAttributes = dataset['paperThemeAttributes'];
  if (themeAttributes !== undefined) options.themeAttributes = themeAttributes.split(/\s+/).filter(Boolean);

  return { options, errors };
}

/**
 * The `data-paper-*` attributes that say the same as `options`, for markup a script will enhance
 * later. Functions can't be written down, so callbacks, `announce` and `pageTitle` are left out,
 * as is a `ResizeHoldSource`.
 */
export function dataAttributesOf(options: PaperOptions): Record<string, string> {
  const attributes: Record<string, string> = {};
  const set = (key: string, value: string | number | boolean) => {
    attributes[attributeName(key)] = String(value);
  };
  if (options.mode !== undefined) set('paperMode', options.mode);
  if (options.startPage !== undefined) set('paperStartPage', options.startPage);
  if (options.wrap !== undefined) set('paperWrap', options.wrap);
  if (typeof options.resizeHold === 'boolean') set('paperResizeHold', options.resizeHold);
  if (options.reducedMotion !== undefined) set('paperReducedMotion', options.reducedMotion);
  for (const [key, name] of Object.entries(BOOLEAN_INTERACTIONS)) {
    const value = options.interactions?.[name];
    if (value !== undefined) set(key, value);
  }
  for (const [key, name] of Object.entries(BOOLEAN_DECORATIONS)) {
    const value = options.decorations?.[name];
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

/** Options from attributes, overridden by the ones given in code. */
export function mergeOptions(fromData: PaperDataOptions, given: PaperOptions = {}): PaperOptions {
  const merged: PaperOptions = { ...fromData, ...given };
  const interactions = { ...fromData.interactions, ...given.interactions };
  const decorations = { ...fromData.decorations, ...given.decorations };
  const strings = { ...fromData.strings, ...given.strings };
  if (Object.keys(interactions).length) merged.interactions = interactions;
  if (Object.keys(decorations).length) merged.decorations = decorations;
  if (Object.keys(strings).length) merged.strings = strings;
  return merged;
}
