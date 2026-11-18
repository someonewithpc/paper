// The stack's markup as strings, with no DOM, so a server can render it and the stack reads as a
// scroll-snap row before any script runs (or when none does). The client enhancement builds the
// same markup from plain children (see enhance.ts).

import { stableId } from './internal/hash.js';
import { dataAttributesOf, resolveBookOptions, resolveStackOptions } from './options.js';
import type { PaperBookOptions, PaperStackOptions } from './types.js';

export type Attributes = Record<string, string>;

/** A page for {@link renderStack}: the HTML of exactly one element, and optionally its paper. */
export interface PaperPageInput {
  html: string;
  /** Any CSS `<color>` or `<image>` value the page's back and the pile paint with. */
  surface?: string;
}

export interface StackMarkupInput {
  pageCount: number;
  /** Tag of the stack element. Default `div`. */
  tag?: string;
  className?: string;
  /** Accessible name of the stack. */
  label?: string;
  /** Base for the ids the markup needs. Default: a hash of `label` and `pageCount`, stable across builds. */
  id?: string;
  /** Per page, the value of its `--paper-surface`. */
  surfaces?: readonly (string | undefined)[];
  /** Written as `data-paper-*` attributes for the client to read back, and used for `startPage`, decorations and strings. */
  options?: PaperStackOptions;
  /** Extra attributes on the stack element. A `style` here is kept after the stack's own. */
  attributes?: Attributes;
}

/** An element of the markup, for renderers that build elements instead of writing HTML. */
export interface MarkupElement {
  tag: string;
  attributes: Attributes;
  /** Its contents, as HTML. */
  html: string;
}

export interface PageMarkup {
  /** Attributes of the page's wrapper `<div>`. */
  attributes: Attributes;
  /** HTML to put inside the wrapper before the page. */
  before: string;
  /** HTML to put inside the wrapper after the page. */
  after: string;
  /** `before` as elements. */
  beforeElements: readonly MarkupElement[];
  /** `after` as elements. */
  afterElements: readonly MarkupElement[];
}

/** The stack in parts, for renderers that have to place the pages themselves. */
export interface StackMarkup {
  tag: string;
  attributes: Attributes;
  pages: PageMarkup[];
  /** HTML that goes right after the stack element, as its sibling: the live region and the keys text. */
  after: string;
  /** `after` as elements. */
  afterElements: readonly MarkupElement[];
}

export const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const attributesToString = (attributes: Attributes): string =>
  Object.entries(attributes)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`))
    .join('');

const TAG = /^[a-z][a-z0-9-]*$/;

export const elementsToString = (elements: readonly MarkupElement[]): string =>
  elements.map(({ tag, attributes, html }) => `<${tag}${attributesToString(attributes)}>${html}</${tag}>`).join('');

// One gem-clip wire, split at the top bend into its two layers. The wire leans with the resting
// fold-back crease, its outer edge running along that crease and bottoming out at the pin, so the
// whole body sits inside the corner region a flip folds behind the stack: the wrappers' crease
// cut swallows the wire with the corner, and the clip vanishes with the paper it sits on. The
// under path's far half is the back bar, hidden by the page itself (it renders before the page
// content), so only the bend peeks past the page edge. The over path is the front bar pressing on
// the page.
const clipGradient = (id: string) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="28" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f2f4f7"/><stop offset="40%" stop-color="#aeb4bd"/><stop offset="60%" stop-color="#7c828d"/><stop offset="100%" stop-color="#d8dbe0"/></linearGradient></defs>`;

const svgAttributes = (viewBox: string): Attributes => ({
  'aria-hidden': 'true', focusable: 'false', viewBox, fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
});

const clipSvg = (path: string, gradient: string) =>
  elementsToString([{
    tag: 'svg',
    attributes: svgAttributes('0 0 28 64'),
    html: `<path d="${path}" stroke="url(#${gradient})" stroke-width="3" stroke-linecap="round"/>${clipGradient(gradient)}`,
  }]);

const HINT: MarkupElement = {
  tag: 'svg',
  attributes: { class: 'paper-flip-hint', ...svgAttributes('0 0 24 24') },
  html: '<path d="M4 8 H18 M13 3 L18 8 L13 13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16 H6 M11 11 L6 16 L11 21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** The chrome a front page carries, split around its content. */
export const frontChrome = (id: string, decorations: { clip: boolean, hint: boolean }): {
  before: string, after: string, beforeElements: MarkupElement[], afterElements: MarkupElement[],
} => {
  // The flap, clip, back-grab handle and hint are siblings of the page content, not children:
  // the page's crease clip-path clips descendants, and these have to overhang the page (the flap
  // when a large fold wraps past an edge, the clip because its bend wraps over the top edge).
  // The flap comes after the clip so folded-over paper covers the wire when dragged across it,
  // and the hint rides above everything. The clip's wrapper stays without its wire, since the
  // dog-ear's cast shadow is painted on it.
  const beforeElements: MarkupElement[] = decorations.clip
    ? [{ tag: 'div', attributes: { class: 'paper-clip-under' }, html: clipSvg('M5 22 V50 a9 9 0 0 0 18 0 V14 a6.25 6.25 0 0 0 -12.5 0', `paper-clip-under-${id}`) }]
    : [];
  const wire = decorations.clip ? clipSvg('M10.5 14 V44 a4 4 0 0 0 8 0 V22', `paper-clip-over-${id}`) : '';
  const afterElements: MarkupElement[] = [
    { tag: 'div', attributes: { class: 'paper-clip' }, html: wire },
    { tag: 'div', attributes: { class: 'paper-fold' }, html: '' },
    { tag: 'div', attributes: { class: 'paper-back-grab' }, html: '' },
    ...(decorations.hint ? [HINT] : []),
  ];
  return { before: elementsToString(beforeElements), after: elementsToString(afterElements), beforeElements, afterElements };
};

/** The page order that puts `start` at the front: a page's `--paper-page-index`, from 1. */
export const pageIndexOf = (page: number, start: number, count: number): number =>
  ((page - start + count) % count) + 1;

export function stackMarkup(input: StackMarkupInput): StackMarkup {
  const { pageCount: count, surfaces = [], options = {} } = input;
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`pageCount must be a whole number from 1, got ${count}`);
  const tag = input.tag ?? 'div';
  if (!TAG.test(tag)) throw new RangeError(`"${tag}" is not a tag name`);
  const resolved = resolveStackOptions(options);
  const start = resolved.startPage;
  if (!Number.isInteger(start) || start < 0 || start >= count) {
    throw new RangeError(`startPage must be a page index from 0 to ${count - 1}, got ${start}`);
  }
  const id = input.id ?? stableId(input.label ?? 'stack', count);

  const styles = [`--paper-page-count: ${count}`];
  const own: Attributes = { 'data-paper-stack': '' };
  if (start > 0) {
    own['data-paper-flipped'] = '';
    styles.push(`--paper-pages-turned: ${start}`);
    const pile = surfaces[start - 1];
    if (pile) styles.push(`--paper-pile-surface: ${pile}`);
  }
  const attributes = rootAttributes(own, styles, input, tag, dataAttributesOf(options));

  const chrome = frontChrome(id, resolved.decorations);
  const pages = Array.from({ length: count }, (_, page): PageMarkup => {
    const surface = surfaces[page];
    const style = `--paper-page-index: ${pageIndexOf(page, start, count)}${surface ? `; --paper-surface: ${surface}` : ''}`;
    const front = page === start;
    return {
      attributes: front ? { class: 'paper-front', style } : { style },
      before: front ? chrome.before : '',
      after: front ? chrome.after : '',
      beforeElements: front ? chrome.beforeElements : [],
      afterElements: front ? chrome.afterElements : [],
    };
  });

  const siblings = rootSiblings(id, resolved);
  return { tag, attributes, pages, after: elementsToString(siblings), afterElements: siblings };
}

// The live region is a sibling, not a child: every child of the root is a page.
const rootSiblings = (
  id: string, { describedBy, interactions, strings }: { describedBy: string | undefined, interactions: { keyboard: boolean }, strings: { keys: string } },
): MarkupElement[] => {
  const after: MarkupElement[] = [{ tag: 'div', attributes: { class: 'paper-sr-only', role: 'status', 'data-paper-status': '' }, html: '' }];
  if (describedBy === undefined && interactions.keyboard) {
    after.push({ tag: 'span', attributes: { hidden: '', id: `paper-keys-${id}`, 'data-paper-keys': '' }, html: escapeText(strings.keys) });
  }
  return after;
};

// The root's attributes: its own, then the options as data attributes, then the caller's, with
// the caller's style after the root's own.
const rootAttributes = (own: Attributes, styles: string[], input: { className?: string, label?: string, attributes?: Attributes }, tag: string, data: Attributes): Attributes => {
  const attributes: Attributes = { ...own };
  if (input.className) attributes['class'] = input.className;
  if (tag !== 'article') attributes['role'] = 'group';
  if (input.label) attributes['aria-label'] = input.label;
  Object.assign(attributes, data);
  const extra = { ...input.attributes };
  const extraStyle = extra['style'];
  delete extra['style'];
  Object.assign(attributes, extra);
  attributes['style'] = [...styles, ...(extraStyle ? [extraStyle] : [])].join('; ');
  return attributes;
};

/** Book options for markup: `mode` may be left out. */
export type PaperBookMarkupOptions = Omit<PaperBookOptions, 'mode'> & { mode?: 'book' };

export interface BookMarkupInput extends Omit<StackMarkupInput, 'options'> {
  /** Written as `data-paper-*` attributes for the client to read back, and used for `startPage` and strings. */
  options?: PaperBookMarkupOptions;
}

/** The book in parts, for renderers that have to place the pages themselves. Same shape as {@link StackMarkup}. */
export type BookMarkup = StackMarkup;

/** The page that shares a spread with `page` in double display, if any. */
export const spreadPartnerOf = (page: number, count: number): number | undefined => {
  if (page === 0) return undefined;
  const partner = page % 2 === 1 ? page + 1 : page - 1;
  return partner < count ? partner : undefined;
};

const BOOK_SHADE: MarkupElement = { tag: 'div', attributes: { class: 'paper-book-shade', 'aria-hidden': 'true' }, html: '' };
const BOOK_SHADE_HTML = elementsToString([BOOK_SHADE]);

export function bookMarkup(input: BookMarkupInput): BookMarkup {
  const { pageCount: count, surfaces = [], options = {} } = input;
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`pageCount must be a whole number from 1, got ${count}`);
  const tag = input.tag ?? 'div';
  if (!TAG.test(tag)) throw new RangeError(`"${tag}" is not a tag name`);
  const resolved = resolveBookOptions(options);
  const start = resolved.startPage;
  if (!Number.isInteger(start) || start < 0 || start >= count) {
    throw new RangeError(`startPage must be a page index from 0 to ${count - 1}, got ${start}`);
  }
  const id = input.id ?? stableId(input.label ?? 'book', count);
  const attributes = rootAttributes(
    { 'data-paper-book': '' }, [`--paper-page-count: ${count}`], input, tag,
    dataAttributesOf({ ...options, mode: 'book' }),
  );

  // Until the script places the pages, the start page shows, and the page it shares a spread with
  // shows too wherever the stylesheet lays the book out two across.
  const partner = spreadPartnerOf(start, count);
  const pages = Array.from({ length: count }, (_, page): PageMarkup => {
    const surface = surfaces[page];
    const pageAttributes: Attributes = { class: 'paper-book-page' };
    if (page === start) pageAttributes['data-paper-place'] = 'view';
    else if (page === partner) pageAttributes['data-paper-place'] = 'pair';
    if (surface) pageAttributes['style'] = `--paper-surface: ${surface}`;
    return { attributes: pageAttributes, before: '', after: BOOK_SHADE_HTML, beforeElements: [], afterElements: [BOOK_SHADE] };
  });

  const siblings = rootSiblings(id, resolved);
  return { tag, attributes, pages, after: elementsToString(siblings), afterElements: siblings };
}

const renderPages = (markup: StackMarkup, pages: readonly PaperPageInput[]): string => {
  const inner = markup.pages
    .map((page, index) => `<div${attributesToString(page.attributes)}>${page.before}${pages[index]!.html}${page.after}</div>`)
    .join('');
  return `<${markup.tag}${attributesToString(markup.attributes)}>${inner}</${markup.tag}>${markup.after}`;
};

const pageInputs = (pages: readonly (string | PaperPageInput)[]): PaperPageInput[] =>
  pages.map((page) => (typeof page === 'string' ? { html: page } : page));

/** The whole book as one HTML string. Each page's `html` has to be exactly one element. */
export function renderBook(input: Omit<BookMarkupInput, 'pageCount' | 'surfaces'> & {
  pages: readonly (string | PaperPageInput)[];
}): string {
  const pages = pageInputs(input.pages);
  return renderPages(bookMarkup({ ...input, pageCount: pages.length, surfaces: pages.map((page) => page.surface) }), pages);
}

/** The whole stack as one HTML string. Each page's `html` has to be exactly one element. */
export function renderStack(input: Omit<StackMarkupInput, 'pageCount' | 'surfaces'> & {
  pages: readonly (string | PaperPageInput)[];
}): string {
  const pages = pageInputs(input.pages);
  return renderPages(stackMarkup({ ...input, pageCount: pages.length, surfaces: pages.map((page) => page.surface) }), pages);
}
