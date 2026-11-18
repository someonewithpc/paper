// The stack's markup as strings, with no DOM, so a server can render it and the stack reads as a
// scroll-snap row before any script runs (or when none does). The client enhancement builds the
// same markup from plain children (see enhance.ts).

import { stableId } from './internal/hash.js';
import { dataAttributesOf, resolveStackOptions } from './options.js';
import type { PaperStackOptions } from './types.js';

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

export interface PageMarkup {
  /** Attributes of the page's wrapper `<div>`. */
  attributes: Attributes;
  /** HTML to put inside the wrapper before the page. */
  before: string;
  /** HTML to put inside the wrapper after the page. */
  after: string;
}

/** The stack in parts, for renderers that have to place the pages themselves. */
export interface StackMarkup {
  tag: string;
  attributes: Attributes;
  pages: PageMarkup[];
  /** HTML that goes right after the stack element, as its sibling: the live region and the keys text. */
  after: string;
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

// One gem-clip wire, split at the top bend into its two layers. The wire leans with the resting
// fold-back crease, its outer edge running along that crease and bottoming out at the pin, so the
// whole body sits inside the corner region a flip folds behind the stack: the wrappers' crease
// cut swallows the wire with the corner, and the clip vanishes with the paper it sits on. The
// under path's far half is the back bar, hidden by the page itself (it renders before the page
// content), so only the bend peeks past the page edge. The over path is the front bar pressing on
// the page.
const clipGradient = (id: string) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="28" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f2f4f7"/><stop offset="40%" stop-color="#aeb4bd"/><stop offset="60%" stop-color="#7c828d"/><stop offset="100%" stop-color="#d8dbe0"/></linearGradient></defs>`;

const clipSvg = (path: string, gradient: string) =>
  `<svg aria-hidden="true" focusable="false" viewBox="0 0 28 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${path}" stroke="url(#${gradient})" stroke-width="3" stroke-linecap="round"/>${clipGradient(gradient)}</svg>`;

const HINT_SVG = '<svg class="paper-flip-hint" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8 H18 M13 3 L18 8 L13 13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16 H6 M11 11 L6 16 L11 21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The chrome a front page carries, split around its content. */
export const frontChrome = (id: string, decorations: { clip: boolean, hint: boolean }): { before: string, after: string } => {
  // The flap, clip, back-grab handle and hint are siblings of the page content, not children:
  // the page's crease clip-path clips descendants, and these have to overhang the page (the flap
  // when a large fold wraps past an edge, the clip because its bend wraps over the top edge).
  // The flap comes after the clip so folded-over paper covers the wire when dragged across it,
  // and the hint rides above everything. The clip's wrapper stays without its wire, since the
  // dog-ear's cast shadow is painted on it.
  const before = decorations.clip
    ? `<div class="paper-clip-under">${clipSvg('M5 22 V50 a9 9 0 0 0 18 0 V14 a6.25 6.25 0 0 0 -12.5 0', `paper-clip-under-${id}`)}</div>`
    : '';
  const wire = decorations.clip ? clipSvg('M10.5 14 V44 a4 4 0 0 0 8 0 V22', `paper-clip-over-${id}`) : '';
  const after = `<div class="paper-clip">${wire}</div><div class="paper-fold"></div><div class="paper-back-grab"></div>${decorations.hint ? HINT_SVG : ''}`;
  return { before, after };
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
  const attributes: Attributes = { 'data-paper-stack': '' };
  if (start > 0) {
    attributes['data-paper-flipped'] = '';
    styles.push(`--paper-pages-turned: ${start}`);
    const pile = surfaces[start - 1];
    if (pile) styles.push(`--paper-pile-surface: ${pile}`);
  }
  if (input.className) attributes['class'] = input.className;
  if (tag !== 'article') attributes['role'] = 'group';
  if (input.label) attributes['aria-label'] = input.label;
  Object.assign(attributes, dataAttributesOf(options));
  const extra = { ...input.attributes };
  const extraStyle = extra['style'];
  delete extra['style'];
  Object.assign(attributes, extra);
  attributes['style'] = [...styles, ...(extraStyle ? [extraStyle] : [])].join('; ');

  const chrome = frontChrome(id, resolved.decorations);
  const pages = Array.from({ length: count }, (_, page): PageMarkup => {
    const surface = surfaces[page];
    const style = `--paper-page-index: ${pageIndexOf(page, start, count)}${surface ? `; --paper-surface: ${surface}` : ''}`;
    const front = page === start;
    return {
      attributes: front ? { class: 'paper-front', style } : { style },
      before: front ? chrome.before : '',
      after: front ? chrome.after : '',
    };
  });

  // The live region is a sibling, not a child: every child of the stack is a page.
  let after = '<div class="paper-sr-only" role="status" data-paper-status></div>';
  if (resolved.describedBy === undefined && resolved.interactions.keyboard) {
    after += `<span hidden id="paper-keys-${escapeAttribute(id)}" data-paper-keys>${escapeText(resolved.strings.keys)}</span>`;
  }

  return { tag, attributes, pages, after };
}

/** The whole stack as one HTML string. Each page's `html` has to be exactly one element. */
export function renderStack(input: Omit<StackMarkupInput, 'pageCount' | 'surfaces'> & {
  pages: readonly (string | PaperPageInput)[];
}): string {
  const pages = input.pages.map((page) => (typeof page === 'string' ? { html: page } : page));
  const markup = stackMarkup({ ...input, pageCount: pages.length, surfaces: pages.map((page) => page.surface) });
  const inner = markup.pages
    .map((page, index) => `<div${attributesToString(page.attributes)}>${page.before}${pages[index]!.html}${page.after}</div>`)
    .join('');
  return `<${markup.tag}${attributesToString(markup.attributes)}>${inner}</${markup.tag}>${markup.after}`;
}
