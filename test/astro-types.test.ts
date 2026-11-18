// Type-level tests: `npm run typecheck` checks them, and vitest runs them as no-ops.
import { describe, it } from 'vitest';

import type { PaperBookProps, PaperStackProps } from '../src/astro/types.js';

const never = (_: () => void) => {};

describe('the Astro adapter', () => {
  it('keeps each component to its mode\'s data options', () => {
    never(() => {
      const stack: PaperStackProps = { pageCount: 3, wrap: false, interactions: { backGrab: false }, resizeHold: false, 'data-x': 1 };
      const book: PaperBookProps = { display: 'double', hardCovers: true, 'aria-describedby': 'keys' };
      // @ts-expect-error hardCovers is a book option
      const coveredStack: PaperStackProps = { hardCovers: true };
      // @ts-expect-error a book has no pile to wrap
      const wrappedBook: PaperBookProps = { wrap: false };
      // @ts-expect-error functions don't reach the page's script
      const announced: PaperStackProps = { onChange: () => {} };
      // @ts-expect-error a resize-hold source is code, not an attribute
      const held: PaperStackProps = { resizeHold: { isHeld: () => false, subscribe: () => () => {} } };
      void [stack, book, coveredStack, wrappedBook, announced, held];
    });
  });
});
