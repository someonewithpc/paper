# @someonewithpc/paper-astro

Astro components for [@someonewithpc/paper](https://github.com/someonewithpc/paper#readme). `<PaperStack>` is a stack of pages you turn by folding the corner, and `<PaperBook>` is a book you turn across the spine. With scripting off, both are CSS carousels.

## Install

```sh
npm install @someonewithpc/paper-astro
```

`@someonewithpc/paper` comes with it. The peer dependency is Astro 5 or later, tested with 7. The components ship as `.astro` source with typed props, and they import the stylesheet and start the script themselves.

## Usage

With `pageCount`, the default slot is called once per index:

```astro
---
import { PaperStack } from '@someonewithpc/paper-astro';
import Sheet from '../components/Sheet.astro';

const sheets = [{ title: 'Monday' }, { title: 'Tuesday', surface: '#1f4f8f' }];
---

<PaperStack label="Sheets" pageCount={sheets.length} surfaces={sheets.map((sheet) => sheet.surface)}>
  {(index: number) => <Sheet title={sheets[index].title} />}
</PaperStack>
```

Without it, each top-level element of the default slot is a page:

```astro
<PaperBook label="Atlas" display="double" hardCovers>
  <section><h2>Cover</h2></section>
  <section><h2>Contents</h2></section>
</PaperBook>
```

Only options with a `data-paper-*` attribute are props, since functions can't travel to the browser. Listen for the `paper:*` events on the root instead, or get a root's controller with `paperOf(root)` from `@someonewithpc/paper-astro/client`. The script makes a controller for each root on load and after each view transition.

The [main README](https://github.com/someonewithpc/paper#astro) lists the options, events and CSS custom properties, and [paper.js.hsal.es](https://paper.js.hsal.es) is built with these components.

## License

GPL-3.0-or-later
