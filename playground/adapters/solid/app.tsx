import { createSignal, For, Show } from 'solid-js';

import { PaperBook, PaperStack, usePaper } from '@hsal/paper/solid';

import { bookPages, pageText, stackPages } from '../content.js';

export function App() {
  const [shown, setShown] = createSignal(true);
  const [changes, setChanges] = createSignal(0);
  const stack = usePaper();
  const book = usePaper<'book'>();
  return (
    <>
      <p><button type="button" id="toggle" onClick={() => setShown(!shown())}>{shown() ? 'Unmount' : 'Mount'}</button></p>
      <Show when={shown()}>
        <PaperStack ref={stack.ref} id="stack" label="Solid stack" class="demo-stack" onChange={() => setChanges((n) => n + 1)}>
          <For each={stackPages}>{(title) => <section class="demo-page"><h2>{title}</h2><p>{pageText}</p></section>}</For>
        </PaperStack>
        <PaperBook ref={book.ref} id="book" label="Solid book" class="demo-book" display="double" onChange={() => setChanges((n) => n + 1)}>
          <For each={bookPages}>{(title) => <section class="demo-leaf"><h2>{title}</h2><p>{pageText}</p></section>}</For>
        </PaperBook>
      </Show>
      <p>
        Stack page <output id="stack-state">{stack.state()?.index ?? 'none'}</output>,
        book spread <output id="book-state">{book.state()?.spread ?? 'none'}</output>,
        changes <output id="changes">{changes()}</output>
      </p>
    </>
  );
}
