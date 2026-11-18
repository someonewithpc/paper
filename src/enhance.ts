// Builds the stack's markup around plain children, for pages that don't render it on a server.
// Each element child becomes a page; text between them is left where it is.

import { stableId } from './internal/hash.js';
import { stackMarkup } from './markup.js';
import type { PaperStackOptions } from './types.js';

const fragment = (html: string): DocumentFragment => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
};

/** Whether `root` already carries the stack's markup, from a server or an earlier enhancement. */
export const isEnhanced = (root: HTMLElement): boolean =>
  root.querySelector(':scope > .paper-front > .paper-fold') !== null;

const uniqueId = (base: string): string => {
  let id = base;
  for (let n = 2; document.getElementById(`paper-keys-${id}`); n++) id = `${base}-${n}`;
  return id;
};

export function enhanceStack(root: HTMLElement, options: PaperStackOptions = {}): void {
  const pages = [...root.children] as HTMLElement[];
  if (pages.length === 0) throw new Error('A paper stack needs at least one child element to be its page');
  const label = root.getAttribute('aria-label') ?? undefined;
  const markup = stackMarkup({
    pageCount: pages.length,
    tag: root.localName,
    ...(label === undefined ? {} : { label }),
    id: uniqueId(root.id || stableId(label ?? 'stack', pages.length)),
    surfaces: pages.map((page) => page.dataset['paperSurface']),
    options,
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
}
