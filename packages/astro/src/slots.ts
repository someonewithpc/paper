// Turns what Astro.slots.render returns into pages. Astro hands back a SlotString: the HTML, plus
// the instructions (head and hydration scripts) and the component scripts it writes out with it.
// Concatenating one drops those, so the pages here are the HTML alone and the rest goes into two
// empty SlotStrings the component writes just before and after the root, which also keeps the
// scripts out of the page wrappers.

type Chunk = string | { type: string };

interface SlotStringLike {
  toString(): string;
  instructions?: unknown[] | null;
  chunks?: Chunk[];
}

export interface SlotPages {
  /** One element's HTML per page. */
  pages: string[];
  /** Write before the root: what the slots asked to put in the head or ahead of their islands. */
  before: unknown;
  /** Write after the root: the slots' component scripts. */
  after: unknown;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

/** The top-level elements of an HTML fragment. Comments and whitespace between them are dropped. */
export function topLevelElements(html: string): string[] {
  const elements: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  const close = (end: number) => {
    if (depth === 0) elements.push(html.slice(start, end));
  };
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i] !== '<' || !/[a-zA-Z/!]/.test(html[i + 1] ?? '')) {
      if (depth === 0 && html[i]!.trim()) {
        const text = html.slice(i, i + 40).split('<')[0]!.trim();
        throw new Error(`Every top-level child of a paper slot has to be an element, but it has the text "${text}"`);
      }
      ++i;
      continue;
    }
    if (html[i + 1] === '!') {
      i = html.indexOf('>', i) + 1 || html.length;
      continue;
    }
    if (html[i + 1] === '/') {
      i = html.indexOf('>', i) + 1 || html.length;
      --depth;
      close(i);
      continue;
    }
    if (depth === 0) start = i;
    const name = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(i))![1]!.toLowerCase();
    let quote = '';
    let j = i + name.length + 1;
    for (; j < html.length; ++j) {
      const char = html[j];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    const selfClosing = html[j - 1] === '/' || VOID.has(name);
    i = j + 1;
    if (selfClosing) {
      close(i);
    } else if (RAW.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      i = end < 0 ? html.length : html.indexOf('>', end) + 1;
      close(i);
    } else {
      ++depth;
    }
  }
  return elements;
}

/**
 * The pages in `rendered`, the result of one Astro.slots.render per page, or of one call for the
 * whole default slot with `split` on, where each top-level element is a page.
 */
export function slotPages(rendered: readonly unknown[], split: boolean): SlotPages {
  const pages: string[] = [];
  const instructions: unknown[] = [];
  const scripts: Chunk[] = [];
  type SlotStringClass = new (content: string, instructions: unknown[] | null, chunks?: Chunk[]) => unknown;
  let SlotString: SlotStringClass | null = null;
  for (const slot of rendered) {
    const value = slot as SlotStringLike;
    // The content is the HTML without the scripts, which are only among the chunks.
    const html = String(slot ?? '');
    if (value && typeof value === 'object') {
      if (Array.isArray(value.chunks) || Array.isArray(value.instructions)) SlotString ??= value.constructor as SlotStringClass;
      for (const chunk of value.chunks ?? []) if (typeof chunk !== 'string') scripts.push(chunk);
      instructions.push(...(value.instructions ?? []));
    }
    if (split) pages.push(...topLevelElements(html));
    else pages.push(html.trim());
  }
  const empty = (own: unknown[] | null, chunks: Chunk[]) => (SlotString ? new SlotString('', own, chunks) : null);
  return {
    pages,
    before: instructions.length ? empty(instructions, []) : null,
    after: scripts.length ? empty(null, scripts) : null,
  };
}
