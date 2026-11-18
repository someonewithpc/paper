/** @jsxImportSource vue */
// Type-level tests: `npm run typecheck` checks them, and vitest runs them as no-ops.
import { describe, expectTypeOf, it } from 'vitest';

import { PaperBook, PaperStack, usePaper } from '../packages/paper/src/vue/index.js';
import type { PaperBookState, PaperStackState } from '../packages/paper/src/types.js';

const never = (_: () => void) => {};

describe('the Vue adapter', () => {
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
      // @ts-expect-error a stack's change has no spread
      <PaperStack onChange={(detail) => detail.spread} />;
    });
  });

  it('types the composable by mode', () => {
    never(() => {
      expectTypeOf(usePaper<'book'>().state.value).toEqualTypeOf<PaperBookState | null>();
      expectTypeOf(usePaper().state.value).toEqualTypeOf<PaperStackState | null>();
    });
  });
});
