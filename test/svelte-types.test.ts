// Type-level tests: `npm run typecheck` checks them, and vitest runs them as no-ops.
import type { Snippet } from 'svelte';
import { describe, expectTypeOf, it } from 'vitest';
import type { PaperBookState, PaperController } from '@someonewithpc/paper';

import type { PaperBookProps, PaperStackProps } from '../packages/svelte/src/types.js';

declare const page: Snippet<[number]>;
const never = (_: () => void) => {};

describe('the Svelte adapter', () => {
  it('keeps each component to its mode\'s options', () => {
    never(() => {
      const stack: PaperStackProps = { pageCount: 2, page, wrap: false, interactions: { backGrab: false }, onChange: (detail) => detail.turned };
      const book: PaperBookProps = { pageCount: 2, page, display: 'double', hardCovers: true, onSettle: (detail) => detail.spread };
      // @ts-expect-error hardCovers is a book option
      const coveredStack: PaperStackProps = { pageCount: 2, page, hardCovers: true };
      // @ts-expect-error a book has no pile to wrap
      const wrappedBook: PaperBookProps = { pageCount: 2, page, wrap: false };
      // @ts-expect-error not a display
      const sideways: PaperBookProps = { pageCount: 2, page, display: 'sideways' };
      // @ts-expect-error the pages come from a snippet
      const noPages: PaperStackProps = { pageCount: 2 };
      void [stack, book, coveredStack, wrappedBook, sideways, noPages];
    });
  });

  it('types the bindings by mode', () => {
    never(() => {
      expectTypeOf<PaperBookProps['controller']>().toEqualTypeOf<PaperController<'book'> | null | undefined>();
      expectTypeOf<PaperBookProps['state']>().toEqualTypeOf<PaperBookState | null | undefined>();
    });
  });
});
