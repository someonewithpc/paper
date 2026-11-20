/** @jsxImportSource @solidjs/web */
// Type-level tests: `npm run typecheck` checks them, and vitest runs them as no-ops.
import { describe, expectTypeOf, it } from 'vitest';
import type { PaperBookState, PaperController, PaperStackState } from '@someonewithpc/paper';

import { PaperBook, PaperStack, usePaper } from '../packages/solid/src/index.js';

const never = (_: () => void) => {};

describe('the Solid adapter', () => {
  it('keeps each component to its mode\'s options', () => {
    never(() => {
      <PaperStack wrap={false} decorations={{ clip: false }} interactions={{ backGrab: false }} onChange={(detail) => detail.turned} />;
      <PaperBook display="double" hardCovers onSettle={(detail) => detail.spread} />;
      // @ts-expect-error hardCovers is a book option
      <PaperStack hardCovers />;
      // @ts-expect-error a book has no pile to wrap
      <PaperBook wrap={false} />;
      // @ts-expect-error a book has no back-grab handle
      <PaperBook interactions={{ backGrab: false }} />;
      // @ts-expect-error not a display
      <PaperBook display="sideways" />;
    });
  });

  it('types the ref and the primitive by mode', () => {
    never(() => {
      let stack: PaperController<'stack'> | null = null;
      <PaperStack ref={(controller) => (stack = controller)} />;
      void stack;
      // @ts-expect-error a book's ref gets a book's controller
      <PaperBook ref={(controller: PaperController<'stack'> | null) => controller} />;
      const book = usePaper<'book'>();
      <PaperBook ref={book.ref} />;
      expectTypeOf(book.state()).toEqualTypeOf<PaperBookState | null>();
      expectTypeOf(usePaper().state()).toEqualTypeOf<PaperStackState | null>();
    });
  });
});
