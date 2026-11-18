// <paper-stack> and <paper-book>: the two modes as custom elements, for pages with no build step
// and for frameworks that render custom elements (Angular, Lit, htmx). Importing this module
// defines both.

import { createPaper } from './paper.js';
import type { PaperBookOptions, PaperController, PaperGoToOptions, PaperOptions } from './types.js';

// The module may be imported on a server, where there is no HTMLElement to extend.
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

abstract class PaperElement<C extends PaperController, O> extends Base {
  #controller: C | null = null;
  #options: O = {} as O;

  /** Options given in code, on top of the `data-paper-*` attributes. Read when the element connects. */
  get options(): O {
    return this.#options;
  }

  set options(options: O) {
    this.#options = options;
  }

  /** Null until the element has connected and its children have been parsed. */
  get controller(): C | null {
    return this.#controller;
  }

  get state(): C['state'] | null {
    return this.#controller?.state ?? null;
  }

  protected abstract create(options: O): C;

  connectedCallback(): void {
    if (this.#controller) return;
    // An element defined before the parser reaches its children connects while it has none yet.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.connectedCallback(), { once: true });
      return;
    }
    if (!this.isConnected || this.childElementCount === 0) return;
    this.#controller = this.create(this.#options);
  }

  disconnectedCallback(): void {
    // A move within the document disconnects and connects again in the same task.
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.#controller?.destroy();
      this.#controller = null;
    });
  }

  next(): Promise<boolean> {
    return this.#controller?.next() ?? Promise.resolve(false);
  }

  prev(): Promise<boolean> {
    return this.#controller?.prev() ?? Promise.resolve(false);
  }

  goTo(index: number, options?: PaperGoToOptions): Promise<boolean> {
    return this.#controller?.goTo(index, options) ?? Promise.resolve(false);
  }
}

/** A stack, or the mode `options` or `data-paper-mode` names. */
export class PaperStackElement extends PaperElement<PaperController, PaperOptions> {
  protected create(options: PaperOptions): PaperController {
    return createPaper(this, options);
  }
}

/** A book, whatever `data-paper-mode` says. */
export class PaperBookElement extends PaperElement<PaperController<'book'>, Omit<PaperBookOptions, 'mode'>> {
  protected create(options: Omit<PaperBookOptions, 'mode'>): PaperController<'book'> {
    return createPaper(this, { ...options, mode: 'book' });
  }
}

export const PAPER_STACK_TAG = 'paper-stack';
export const PAPER_BOOK_TAG = 'paper-book';

/** Defines the stack element under `tag`, once. A no-op where there is no `customElements`. */
export function definePaperStack(tag: string = PAPER_STACK_TAG): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, tag === PAPER_STACK_TAG ? PaperStackElement : class extends PaperStackElement {});
}

/** Defines the book element under `tag`, once. A no-op where there is no `customElements`. */
export function definePaperBook(tag: string = PAPER_BOOK_TAG): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, tag === PAPER_BOOK_TAG ? PaperBookElement : class extends PaperBookElement {});
}

definePaperStack();
definePaperBook();

declare global {
  interface HTMLElementTagNameMap {
    'paper-stack': PaperStackElement;
    'paper-book': PaperBookElement;
  }
}

export type * from './types.js';
