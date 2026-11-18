// <paper-stack>: the stack as a custom element, for pages with no build step and for frameworks
// that render custom elements (Angular, Lit, htmx). Importing this module defines the element.

import { createPaper } from './paper.js';
import type { PaperController, PaperGoToOptions, PaperOptions, PaperState } from './types.js';

// The module may be imported on a server, where there is no HTMLElement to extend.
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class PaperStackElement extends Base {
  #controller: PaperController | null = null;
  #options: PaperOptions = {};

  /** Options given in code, on top of the `data-paper-*` attributes. Read when the element connects. */
  get options(): PaperOptions {
    return this.#options;
  }

  set options(options: PaperOptions) {
    this.#options = options;
  }

  /** Null until the element has connected and its children have been parsed. */
  get controller(): PaperController | null {
    return this.#controller;
  }

  get state(): PaperState | null {
    return this.#controller?.state ?? null;
  }

  connectedCallback(): void {
    if (this.#controller) return;
    // An element defined before the parser reaches its children connects while it has none yet.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.connectedCallback(), { once: true });
      return;
    }
    if (!this.isConnected || this.childElementCount === 0) return;
    this.#controller = createPaper(this, this.#options);
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

export const PAPER_STACK_TAG = 'paper-stack';

/** Defines the element under `tag`, once. A no-op where there is no `customElements`. */
export function definePaperStack(tag: string = PAPER_STACK_TAG): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, tag === PAPER_STACK_TAG ? PaperStackElement : class extends PaperStackElement {});
}

definePaperStack();

declare global {
  interface HTMLElementTagNameMap {
    'paper-stack': PaperStackElement;
  }
}

export type * from './types.js';
