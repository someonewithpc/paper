// The browser side of the Astro components: makes a controller for each root they rendered, on
// load and after every view transition, and destroys the ones a transition took off the page.

import { createPaper } from '../paper.js';
import type { PaperController } from '../types.js';

const controllers = new Map<HTMLElement, PaperController>();

/** The controller of a root an Astro component rendered, once enhanced. */
export const paperOf = (root: Element | null | undefined): PaperController | undefined =>
  root ? controllers.get(root as HTMLElement) : undefined;

/** Destroys the controllers of roots no longer in the document, then enhances the new roots. */
export function enhanceAll(): void {
  for (const [root, controller] of controllers) {
    if (root.isConnected) continue;
    controller.destroy();
    controllers.delete(root);
  }
  for (const root of document.querySelectorAll<HTMLElement>('[data-paper-astro]')) {
    if (controllers.has(root)) continue;
    controllers.set(root, createPaper(root, { mode: root.hasAttribute('data-paper-book') ? 'book' : 'stack' }));
  }
}

let started = false;

/** Enhances the page now and again on each `astro:page-load`. Runs once however often it is called. */
export function start(): void {
  if (started) return;
  started = true;
  enhanceAll();
  document.addEventListener('astro:page-load', enhanceAll);
}
