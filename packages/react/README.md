# @someonewithpc/paper-react

React components for [@someonewithpc/paper](https://github.com/someonewithpc/paper#readme). `<PaperStack>` is a stack of pages you turn by folding the corner, and `<PaperBook>` is a book you turn across the spine. With scripting off, both are CSS carousels.

## Install

```sh
npm install @someonewithpc/paper-react
```

`@someonewithpc/paper` comes with it. The peer dependency is React 19, and React 18 renders the components on a server too.

## Usage

```tsx
import { PaperStack, usePaper } from '@someonewithpc/paper-react';
import '@someonewithpc/paper/styles.css';

function Notes({ days }: { days: Day[] }) {
  const paper = usePaper();
  return (
    <>
      <PaperStack ref={paper.ref} label="Field notes" wrap={false} onChange={(detail) => console.log(detail.index)}>
        {days.map((day) => <section key={day.id}><h2>{day.title}</h2></section>)}
      </PaperStack>
      <p>Page {(paper.state?.index ?? 0) + 1} of {days.length}</p>
    </>
  );
}
```

Each child element is a page. The props are the mode's options, so a book option on a stack is a type error. The ref is the controller, and `usePaper` gives you the controller and its state. The module is marked `'use client'`.

The [main README](https://github.com/someonewithpc/paper#react) lists the options, events and CSS custom properties, and [paper.js.hsal.es](https://paper.js.hsal.es) has a stack and a book to try.

## License

GPL-3.0-or-later
