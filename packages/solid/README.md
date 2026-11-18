# @someonewithpc/paper-solid

Solid components for [@someonewithpc/paper](https://github.com/someonewithpc/paper#readme). `<PaperStack>` is a stack of pages you turn by folding the corner, and `<PaperBook>` is a book you turn across the spine. With scripting off, both are CSS carousels.

## Install

```sh
npm install @someonewithpc/paper-solid
```

`@someonewithpc/paper` comes with it. The peer dependency is Solid 1.8 or later. Solid 2 came out in November 2026 and its compiler plugins don't take it yet.

The package has the JSX source under the `solid` export condition, for vite-plugin-solid, and compiled DOM and server builds for the rest.

## Usage

```tsx
import { For } from 'solid-js';
import { PaperBook, usePaper } from '@someonewithpc/paper-solid';
import '@someonewithpc/paper/styles.css';

function Atlas(props: { plates: Plate[] }) {
  const book = usePaper<'book'>();
  return (
    <>
      <PaperBook ref={book.ref} label="Atlas" hardCovers onSettle={(detail) => console.log(detail.spread)}>
        <For each={props.plates}>{(plate) => <section><h2>{plate.title}</h2></section>}</For>
      </PaperBook>
      <p>Spread {book.state()?.spread}</p>
    </>
  );
}
```

Each child element is a page. The props are the mode's options, callbacks included. `ref` is called with each controller made, and with `null` when it goes. `usePaper` gives you the controller and its state as accessors.

The [main README](https://github.com/someonewithpc/paper#solid) lists the options, events and CSS custom properties, and [paper.js.hsal.es](https://paper.js.hsal.es) has a stack and a book to try.

## License

GPL-3.0-or-later
