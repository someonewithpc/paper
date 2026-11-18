// Builds the stack's markup around plain children, for pages that don't render it on a server.
// Each element child becomes a page; text between them is left where it is.

import { stableId } from './internal/hash.js';
import { bookMarkup, stackMarkup, type PaperBookMarkupOptions, type StackMarkup } from './markup.js';
import type { PaperStackOptions } from './types.js';

const fragment = (html: string): DocumentFragment => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
};

/** Whether `root` already carries the stack's markup, from a server or an earlier enhancement. */
export const isEnhanced = (root: HTMLElement): boolean =>
  root.querySelector(':scope > .paper-front > .paper-fold') !== null;

/** Whether `root` already carries the book's markup. */
export const isBookEnhanced = (root: HTMLElement): boolean =>
  root.querySelector(':scope > .paper-book-page > .paper-book-shade') !== null;

const uniqueId = (base: string): string => {
  let id = base;
  for (let n = 2; document.getElementById(`paper-keys-${id}`); n++) id = `${base}-${n}`;
  return id;
};

const enhance = (root: HTMLElement, kind: string, build: (input: {
  pageCount: number, tag: string, label?: string, id: string, surfaces: (string | undefined)[],
}) => StackMarkup): void => {
  const pages = [...root.children] as HTMLElement[];
  if (pages.length === 0) throw new Error(`A paper ${kind} needs at least one child element to be its page`);
  const label = root.getAttribute('aria-label') ?? undefined;
  const markup = build({
    pageCount: pages.length,
    tag: root.localName,
    ...(label === undefined ? {} : { label }),
    id: uniqueId(root.id || stableId(label ?? kind, pages.length)),
    surfaces: pages.map((page) => page.dataset['paperSurface']),
  });

  for (const [name, value] of Object.entries(markup.attributes)) {
    if (name === 'class') root.classList.add(...value.split(/\s+/).filter(Boolean));
    else if (name === 'style') root.style.cssText = `${value}; ${root.style.cssText}`;
    else if (name === 'role' || name.startsWith('aria-') || name.startsWith('data-paper-')) {
      if (!root.hasAttribute(name)) root.setAttribute(name, value);
    } else root.setAttribute(name, value);
  }

  pages.forEach((page, index) => {
    const { attributes, before, after } = markup.pages[index]!;
    const wrapper = document.createElement('div');
    for (const [name, value] of Object.entries(attributes)) wrapper.setAttribute(name, value);
    page.replaceWith(wrapper);
    wrapper.append(fragment(before), page, fragment(after));
  });

  if (!root.nextElementSibling?.hasAttribute('data-paper-status')) root.after(fragment(markup.after));
};

export function enhanceStack(root: HTMLElement, options: PaperStackOptions = {}): void {
  enhance(root, 'stack', (input) => stackMarkup({ ...input, options }));
}

export function enhanceBook(root: HTMLElement, options: PaperBookMarkupOptions = {}): void {
  enhance(root, 'book', (input) => bookMarkup({ ...input, options }));
}
