# @someonewithpc/paper-solid

Solid components for [@someonewithpc/paper](https://github.com/someonewithpc/paper#readme). `<PaperStack>` is a stack of pages you turn by folding the corner, and `<PaperBook>` is a book you turn across the spine. With scripting off, both are CSS carousels.

## Install

```sh
npm install @someonewithpc/paper-solid
```

`@someonewithpc/paper` comes with it. The peer dependencies are `solid-js` and `@solidjs/web` 2.0 or later. Solid 1 isn't supported, since code compiled for it imports `solid-js/web`, which Solid 2 doesn't have.

The package has the JSX source under the `solid` export condition, which `@solidjs/vite-plugin` 3 picks up and compiles with the rest of your app. Anything else gets the DOM build in browsers and the server build in Node, Deno and workers, both compiled with `@solidjs/babel-plugin` 2.

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
