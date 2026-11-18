// Type-level tests: `npm run typecheck` checks them, and vitest runs them as no-ops.
import { describe, expectTypeOf, it } from 'vitest';

import { createPaper } from '../packages/paper/src/paper.js';
import { bookMarkup, stackMarkup } from '../packages/paper/src/markup.js';
import type {
  PaperBookElement, PaperStackElement,
} from '../packages/paper/src/element.js';
import type {
  PaperBookOptions, PaperBookState, PaperChangeDetail, PaperController, PaperOptions, PaperStackState, PaperState,
} from '../packages/paper/src/types.js';

declare const root: HTMLElement;
// Never called: the bodies only have to type-check.
const never = (_: () => void) => {};

describe('createPaper', () => {
  it('narrows the controller to the mode it is given', () => {
    never(() => {
      expectTypeOf(createPaper(root)).toEqualTypeOf<PaperController<'stack'>>();
      expectTypeOf(createPaper(root, { wrap: false })).toEqualTypeOf<PaperController<'stack'>>();
      expectTypeOf(createPaper(root, { mode: 'book' })).toEqualTypeOf<PaperController<'book'>>();
      expectTypeOf(createPaper(root, { mode: 'book' }).state).toEqualTypeOf<PaperBookState>();
      expectTypeOf(createPaper(root).state).toEqualTypeOf<PaperStackState>();
      expectTypeOf(createPaper(root, {} as PaperOptions).state).toEqualTypeOf<PaperState>();
    });
  });

  it('keeps each mode to its own options', () => {
    never(() => {
      // @ts-expect-error display is a book option
      createPaper(root, { display: 'double' });
      // @ts-expect-error display is a book option
      createPaper(root, { mode: 'stack', display: 'double' });
      // @ts-expect-error a book has no pile to wrap
      createPaper(root, { mode: 'book', wrap: false });
      // @ts-expect-error a book has no back-grab handle
      createPaper(root, { mode: 'book', interactions: { backGrab: false } });
      // @ts-expect-error a book has no pulse to hold
      createPaper(root, { mode: 'book', resizeHold: false });
      // @ts-expect-error not a display
      createPaper(root, { mode: 'book', display: 'triple' });
      // @ts-expect-error hardCovers is a book option
      createPaper(root, { hardCovers: true });
    });
  });

  it('gives a book view to the book events and callbacks', () => {
    never(() => {
      createPaper(root, { mode: 'book', onChange: (detail) => expectTypeOf(detail.pages).toEqualTypeOf<readonly number[]>() });
      createPaper(root, { mode: 'book' }).on('paper:settle', (event) => expectTypeOf(event.detail.spread).toBeNumber());
      createPaper(root).on('paper:change', (event) => expectTypeOf(event.detail).toEqualTypeOf<PaperChangeDetail>());
      // @ts-expect-error a stack's change has no spread
      createPaper(root).on('paper:change', (event) => event.detail.spread);
    });
  });

  it('tags the state with its mode', () => {
    never(() => {
      const state = createPaper(root, {} as PaperOptions).state;
      if (state.mode === 'book') expectTypeOf(state.spread).toBeNumber();
      else expectTypeOf(state.turned).toBeNumber();
      // @ts-expect-error turned is the stack's
      expectTypeOf(createPaper(root, { mode: 'book' }).state.turned);
    });
  });
});

describe('markup and elements', () => {
  it('take each mode its own options', () => {
    never(() => {
      bookMarkup({ pageCount: 2, options: { display: 'single' } });
      // @ts-expect-error a book's markup takes no decorations
      bookMarkup({ pageCount: 2, options: { decorations: { clip: false } } });
      // @ts-expect-error a stack's markup takes no display
      stackMarkup({ pageCount: 2, options: { display: 'single' } });
      expectTypeOf<PaperBookElement['options']>().toEqualTypeOf<Omit<PaperBookOptions, 'mode'>>();
      expectTypeOf<PaperBookElement['state']>().toEqualTypeOf<PaperBookState | null>();
      expectTypeOf<PaperStackElement['options']>().toEqualTypeOf<PaperOptions>();
    });
  });
});
