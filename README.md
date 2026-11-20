# @someonewithpc/paper

A stack of pages you turn by folding the corner. The front page has a dog-ear in its bottom-right corner: drag it past the middle and the page folds over and goes to the back of the stack, where turned pages pile up above the top edge. Grab the folded-back top-left corner to bring the last page back. A sideways wheel or trackpad scroll, a finger swipe and the arrow keys turn pages too.

Without JavaScript the same markup is a scroll-snap carousel, with arrows and dots in browsers that draw CSS carousels and the next page's edge peeking in elsewhere.

It also does books. In [book mode](#book-mode) you drag a page corner across the spine and the leaf curls over, showing what is printed on its back as it comes. The book shows a spread of two pages when it is wide and one page when it is narrow, and without JavaScript it is a carousel of spreads.

The library has no dependencies and no framework. It ships ESM, TypeScript types and one plain CSS file. Components for React, Vue, Svelte, Solid and Astro are separate packages (see [Frameworks](#frameworks)).

[paper.js.hsal.es](https://paper.js.hsal.es) runs it: a stack and a book to turn, and the options, events and custom properties to try live.

## Install

```sh
npm install @someonewithpc/paper
```

For a framework, install its package instead, which brings this one with it:

| Framework | Package |
| --- | --- |
| React | `@someonewithpc/paper-react` |
| Vue | `@someonewithpc/paper-vue` |
| Svelte | `@someonewithpc/paper-svelte` |
| Solid | `@someonewithpc/paper-solid` |
| Astro | `@someonewithpc/paper-astro` |

## Quick start

### HTML only

Load the stylesheet and the custom element, then put one element per page inside `<paper-stack>`:

```html
<link rel="stylesheet" href="https://unpkg.com/@someonewithpc/paper/dist/styles.css">
<script type="module" src="https://unpkg.com/@someonewithpc/paper/dist/element.js"></script>

<paper-stack data-paper-stack aria-label="Field notes" style="aspect-ratio: 2 / 1">
  <section><h2>Monday</h2><p>…</p></section>
  <section data-paper-surface="#1f4f8f"><h2>Tuesday</h2><p>…</p></section>
  <section><h2>Wednesday</h2><p>…</p></section>
</paper-stack>
```

The `data-paper-stack` attribute in the HTML lets the no-script carousel style the stack before the element loads. Options go in `data-paper-*` attributes (see [Options](#options)).

### JavaScript

```ts
import { createPaper } from '@someonewithpc/paper';
import '@someonewithpc/paper/styles.css';

const paper = createPaper(document.querySelector('#notes')!, {
  wrap: false,
  onChange: ({ index }) => console.log('now on page', index),
});

await paper.next();
paper.state; // { mode: 'stack', index: 1, count: 3, turned: 1, … }
```

`createPaper` wraps each element child of the root as a page, unless the root already carries the markup from `renderStack`.

### Server rendering

`renderStack` returns the stack's HTML as a string, so a server can send the finished markup and the no-script carousel works from the first paint:

```ts
import { renderStack } from '@someonewithpc/paper';

const html = renderStack({
  label: 'Field notes',
  pages: [
    '<section><h2>Monday</h2></section>',
    { html: '<section><h2>Tuesday</h2></section>', surface: '#1f4f8f' },
  ],
  options: { wrap: false },
});
```

The options given here are written as `data-paper-*` attributes, so `createPaper(root)` on the client picks them up without being told again. Each page's `html` has to be exactly one element. Renderers that place each page themselves, such as a framework component that keeps its slot intact, can call `stackMarkup` instead: it returns the root's tag and attributes, each page wrapper's attributes with the HTML that goes before and after the page, and the HTML that follows the root.

Ids in the markup come from a hash of the label and page count, or from the `id` you pass, so two builds of the same page produce the same bytes.

## Sizing and pages

The pages share one grid cell, so the stack is as tall as its tallest page unless you size it. An `aspect-ratio` on the stack is the usual way. The stack reserves the fan's drop below itself as margin.

Each page fills its wrapper and gets `background: var(--paper-surface)` at zero specificity, so a page that paints its own background keeps it. A page's own paper goes in `data-paper-surface` on the page (client) or `surface` (server). The fold flap and the pile paint the back of each page in that colour.

## Options

| Option | Attribute | Default | What it does |
| --- | --- | --- | --- |
| `mode` | `data-paper-mode` | `'stack'` | `'book'` for [book mode](#book-mode), which has options of its own |
| `startPage` | `data-paper-start-page` | `0` | Page at the front on load, with the ones before it already turned |
| `wrap` | `data-paper-wrap` | `true` | Turning the last page forward brings the first one back |
| `interactions.drag` | `data-paper-drag` | `true` | Drag the dog-ear |
| `interactions.backGrab` | `data-paper-back-grab` | `true` | Drag the folded-back corner to bring a page back |
| `interactions.keyboard` | `data-paper-keyboard` | `true` | Left and right arrow keys on the focused stack |
| `interactions.wheel` | `data-paper-wheel` | `true` | Sideways wheel and trackpad scrolls |
| `interactions.swipe` | `data-paper-swipe` | `true` | Sideways finger and pen swipes |
| `interactions.tease` | `data-paper-tease` | `true` | The last turned page swings out as the pointer nears the folded corner |
| `decorations.clip` | `data-paper-clip` | `true` | The paper clip over the top-left corner |
| `decorations.hint` | `data-paper-hint` | `true` | The arrows on the flap once letting go would turn the page |
| `reducedMotion` | `data-paper-reduced-motion` | `'system'` | `'reduce'` lands every turn at once and stops the pulse, whatever the system says |
| `strings.roleDescription` | `data-paper-role-description` | `'paper stack'` | The stack's `aria-roledescription` |
| `strings.keys` | `data-paper-keys` | `'The left and right arrow keys turn the pages'` | Hidden text the stack is described by |
| `describedBy` | `data-paper-described-by` | | Id of your own description, used instead of the hidden text |
| `themeAttributes` | `data-paper-theme-attributes` | `['data-theme']` | Attributes on `<html>` whose change makes the stack measure its em lengths again |
| `resizeHold` | `data-paper-resize-hold` | `true` | Hold the pulse while the window is resized. Pass a `ResizeHoldSource` to share one |
| `announce` | | `Page N of M: title` | Text for the live region after a turn settles on a new page, or `false` |
| `pageTitle` | | `data-paper-title`, `aria-label`, first heading | A page's title for `announce` |
| `onTurnStart`, `onTurnEnd`, `onChange`, `onSettle` | | | Callbacks for the events below |

Boolean attributes take `true`, `false` or no value. An attribute with a value it can't take, or one the mode doesn't take, logs a warning and is ignored. Options passed in code win over attributes.

`PaperOptions` is a union keyed on `mode`, so TypeScript narrows the rest of the options once `mode` is known.

## Controller

```ts
interface PaperController<M extends 'stack' | 'book'> {
  readonly root: HTMLElement;
  readonly mode: M;
  readonly state: PaperStateMap[M];
  next(): Promise<boolean>;
  prev(): Promise<boolean>;
  goTo(index: number, options?: { animate?: boolean }): Promise<boolean>;
  refresh(): void;
  on(type, listener): () => void;
  off(type, listener): void;
  destroy(): void;
}
```

`next` and `prev` resolve once the turn has settled, or `false` at once when there is nowhere to go. `goTo` jumps to the page before the target and animates the last turn; with `animate: false` it jumps outright. Pages before the front one are in the pile, so going back to them turns pages back, and going forward turns pages away. `refresh` re-reads the lengths the stack caches, after you change its font size or custom properties. `destroy` removes the listeners and observers and leaves the pages where they are.

`createPaper` returns `PaperController<'stack'>` for stack options and `PaperController<'book'>` for book options, so `state` and the event details come typed for the mode.

`<paper-stack>` and `<paper-book>` have `next`, `prev`, `goTo`, `state` and `controller`, and an `options` property read when they connect.

## Events

The root dispatches these, typed in `HTMLElementEventMap`. They bubble; the controller's `on` and the option callbacks hear only the stack's own:

| Event | Detail | When |
| --- | --- | --- |
| `paper:turnstart` | `{ direction, from }` | A turn is certain: a drag past the commit point, or a key, wheel, swipe or API turn as it starts |
| `paper:turnend` | `{ direction, from }` | The stack came to rest after a `paper:turnstart` |
| `paper:change` | `{ direction, index, previousIndex, count, turned }` | Another page took the front, in the middle of the turn |
| `paper:settle` | `{ index, count, turned, changed }` | The front page is lying flat and still, turned or not |

A drag that comes back short of the commit point fires `paper:settle` and nothing else. Use `paper:turnstart` and `paper:turnend` to pause heavy content on a page while it turns: from the commit point on, the turn will finish.

The root also carries `data-paper-flipped` while a page is turned, `data-paper-settled` while the front page lies still, `data-paper-turned` after the first turn and `data-paper-returned` after the first page brought back.

## CSS custom properties

Set these anywhere above the stack.

| Property | Default | What it sets |
| --- | --- | --- |
| `--paper-fold-rest-x`, `--paper-fold-rest-y` | `2cm`, `1cm` | The resting dog-ear's size |
| `--paper-fold-pulse-x`, `--paper-fold-pulse-y` | `3cm`, `2cm` | How far the resting dog-ear's pulse grows it |
| `--paper-clip-lean-x`, `--paper-clip-lean-y` | `2.25em`, `4.5em` | Where the folded-back corner's crease meets the top and left edges. Swap them for a tall page |
| `--paper-splay` | `1.5deg` | Each page in the fan turns by this times the log of its place |
| `--paper-splay-room` | the fan's drop | Margin below the stack for the fan |
| `--paper-radius` | `0.5em` | The pages' corner radius |
| `--paper-sheet` | off-white, or dark grey in dark mode | The default paper |
| `--paper-surface` | `--paper-sheet` | One page's paper, set inline on its wrapper by the markup |
| `--paper-line` | translucent black or white | Hairline edges of the flap, pile and carousel |
| `--paper-ink` | `CanvasText` | Focus ring and hint arrows |
| `--paper-ink-faint` | `GrayText` | Disabled carousel arrows |
| `--paper-accent` | blue | Carousel arrows and the current dot |
| `--paper-control-surface` | `--paper-sheet` | Carousel arrow buttons |
| `--paper-carousel-peek` | `1.75rem` | How much of the next page shows without script, in browsers without CSS carousels |
| `--paper-page-block-size` | | The page's height for that fallback, needed when the stack is a size container |
| `--paper-dot-size`, `--paper-dot-mat` | `0.5rem`, `1rem` | The carousel's dots and the margin they sit in |
| `--paper-book-double-from` | `40rem` | The book width from which `display: 'auto'` shows two pages |

The defaults for colours use `light-dark()`, so they follow the page's `color-scheme`. The no-script carousel labels its controls "Previous page", "Next page" and "Page N"; override `content` on `::scroll-button()` and `::scroll-marker` to change them.

The other `--paper-*` properties are internal state the script writes. They are registered with `@property` and most don't inherit, which keeps a turn from restyling everything printed on the pages.

## Accessibility

- The stack is a `group` (unless it is an `<article>`) with `aria-roledescription="paper stack"` and is focusable when the keyboard is on. The arrow keys turn pages only when the stack itself has focus, so arrows inside a page's own controls stay theirs
- The focus ring sits on the front page's paper and follows the crease
- Pages behind the front one are `inert`, so they leave the tab order and the accessibility tree
- A live region beside the stack announces the new page once a turn has settled, one announcement per turn and none on load
- Under `prefers-reduced-motion: reduce`, or `reducedMotion: 'reduce'`, turns land at once and the dog-ear stays still. A drag still follows the hand
- Without script every page is readable in the carousel, and the carousel's dots are one tab stop
- A book is a `group` with `aria-roledescription="book"`. Its pages out of view are `inert` and skip rendering. If a turn takes away the page that holds focus, focus goes back to the book. The live region reads "Pages 4 and 5 of 10" and the first page's title

## Book mode

Pass `mode: 'book'`, or write `data-paper-mode="book"` on the root. Each element child is a page, in reading order. In double display the first page is the front cover, on the right on its own, and after it the pages go in pairs: 2 and 3, 4 and 5, and so on. A spread is what shows at once: one page in single display, a pair in double.

Drag the right-hand page's corner, top or bottom, across the spine to turn forward, and the left-hand page's corner to turn back. In single display, drag the page's left edge to bring the previous page back. Let go a quarter of the way across, or throw it, and the leaf goes over; short of that it lies back down. A sideways wheel or swipe, the arrow keys, Page Up, Page Down, Home and End turn pages too. A mouse near a corner lifts it a little.

### HTML only

```html
<link rel="stylesheet" href="https://unpkg.com/@someonewithpc/paper/dist/styles.css">
<script type="module" src="https://unpkg.com/@someonewithpc/paper/dist/element.js"></script>

<paper-book data-paper-book aria-label="Atlas" data-paper-hard-covers style="aspect-ratio: 3 / 2">
  <section><h2>Atlas</h2></section>
  <section><h2>Contents</h2></section>
  <section><h2>North</h2></section>
  <section><h2>South</h2></section>
</paper-book>
```

`<paper-book>` is a book whatever `data-paper-mode` says. It has a tag of its own, not `<paper-stack mode="book">`, because the book's styles key on `data-paper-book` from the first paint, before the element is defined.

### JavaScript

```ts
import { createPaper } from '@someonewithpc/paper';
import '@someonewithpc/paper/styles.css';

const book = createPaper(document.querySelector('#atlas')!, {
  mode: 'book',
  display: 'double',
  onChange: ({ spread, pages }) => console.log('spread', spread, 'shows pages', pages),
});

await book.goTo(5);
book.state; // { mode: 'book', spread: 3, pages: [5, 6], spreads: 6, display: 'double', index: 5, … }
```

`goTo`, `next` and `prev` work in spreads: `goTo(page)` opens the spread that holds the page.

### Server rendering

`renderBook` and `bookMarkup` take the same input as `renderStack` and `stackMarkup`, and `bookMarkup` returns the same parts:

```ts
import { renderBook } from '@someonewithpc/paper';

const html = renderBook({
  label: 'Atlas',
  pages: ['<section><h2>Atlas</h2></section>', { html: '<section><h2>Plates</h2></section>', surface: '#1f4f8f' }],
  options: { display: 'auto', startPage: 0 },
});
```

Until the script runs, the start page shows, along with the page it shares a spread with when the book is wide enough for two.

### Sizing

Size the book as a whole, with an `aspect-ratio` or a height. In double display each page takes half the width. The book is an inline-size container, so `display: 'auto'` follows the book's own width, not the window's: two pages from `--paper-book-double-from` (`40rem`) up, one below it.

### Book options

| Option | Attribute | Default | What it does |
| --- | --- | --- | --- |
| `mode` | `data-paper-mode` | | `'book'` |
| `display` | `data-paper-display` | `'auto'` | `'single'`, `'double'`, or `'auto'` to follow the book's width |
| `startPage` | `data-paper-start-page` | `0` | Opens the book at the spread that holds this page |
| `hardCovers` | `data-paper-hard-covers` | `false` | The first and last leaves are stiff boards that swing about the spine instead of curling |
| `autoCenter` | `data-paper-auto-center` | `true` | In double display, the cover alone or the back alone slides to the middle |
| `shading` | `data-paper-shading` | `true` | Shade the curl, the shadow it casts and the gutter |
| `interactions.drag` | `data-paper-drag` | `true` | Drag a corner across the spine |
| `interactions.keyboard` | `data-paper-keyboard` | `true` | Arrow keys, Page Up, Page Down, Home and End on the focused book |
| `interactions.wheel` | `data-paper-wheel` | `true` | Sideways wheel and trackpad scrolls |
| `interactions.swipe` | `data-paper-swipe` | `true` | Sideways finger and pen swipes |
| `interactions.tease` | `data-paper-tease` | `true` | A corner lifts as the mouse nears it |
| `reducedMotion` | `data-paper-reduced-motion` | `'system'` | `'reduce'` lands every played turn at once. A drag still follows the hand |
| `strings.roleDescription` | `data-paper-role-description` | `'book'` | The book's `aria-roledescription` |
| `strings.keys` | `data-paper-keys` | `'The left and right arrow keys turn the pages, Home and End go to the covers'` | Hidden text the book is described by |
| `describedBy`, `themeAttributes`, `pageTitle`, callbacks | | | As for the stack |
| `announce` | | `Pages N and N+1 of M: title` | Text for the live region after a turn, told the spread and the pages too |

`wrap`, `decorations`, `resizeHold` and `interactions.backGrab` are the stack's, and TypeScript rejects them on a book.

### Book state and events

`state` has `spread`, `spreads`, `pages` (the DOM indices in view, left to right) and `display` (what `auto` resolved to), as well as `index` (the first page in view), `count`, `settled`, `turning`, `canPrev` and `canNext`.

The events are the stack's. `paper:change` fires as the turned leaf lands, and its detail, like `paper:settle`'s, also carries `spread` and `pages`. `index` and `turned` are both the first page in view. A change of display on resize fires nothing; read `state` after it.

## Frameworks

Each framework has its own package, with the framework as a peer dependency and `@someonewithpc/paper` as a dependency on the same version: `@someonewithpc/paper-react`, `-vue`, `-svelte`, `-solid` and `-astro`. Each exports `<PaperStack>` and `<PaperBook>`, which take their mode's [options](#options) as props, so a book option on a stack is a type error. They render the markup on the server, hydrate it without a mismatch, call `createPaper` on mount and `destroy` on unmount.

There are no live setters. A changed option destroys the controller and makes a new one. When the markup changes too, with the page count or `startPage` say, the component renders a new root, because the script has moved the dog-ear and the clip between page wrappers and written their classes and styles. A new event callback needs neither.

Besides the options, the components take `as` (the root's tag), `label`, `id`, `surfaces` (each page's `--paper-surface`, by index) and other HTML attributes for the root. Load `@someonewithpc/paper/styles.css` once, as in the quick start. The Astro components import it themselves.

### React

React 19. React 18 renders it on a server too, checked by hand. The module is marked `'use client'`. Each child element is a page. The ref is the controller, and `usePaper` gives you the controller and its state:

```tsx
import { PaperStack, usePaper } from '@someonewithpc/paper-react';

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

### Vue

Vue 3.3 and later. The components are render functions compiled to JavaScript, so your bundler needs no loader for them. Each element of the default slot is a page, `v-for` included. The callbacks are events: `turn-start`, `turn-end`, `change` and `settle`. A template ref exposes `controller` and `state`, and `usePaper` reads them for you:

```vue
<script setup lang="ts">
import { PaperBook, usePaper } from '@someonewithpc/paper-vue';

defineProps<{ plates: Plate[] }>();
const { ref: book, state } = usePaper<'book'>();
</script>

<template>
  <PaperBook :ref="book" label="Atlas" display="double" @change="(detail) => console.log(detail.spread)">
    <section v-for="plate in plates" :key="plate.id"><h2>{{ plate.title }}</h2></section>
  </PaperBook>
  <p>Spread {{ state?.spread }}</p>
</template>
```

### Svelte

Svelte 5. A snippet can't be split into elements, so the pages come from a `page` snippet, which the component renders once per index up to `pageCount`. `controller` and `state` are bindable, and the callbacks are props:

```svelte
<script lang="ts">
  import { PaperStack, type PaperStackState } from '@someonewithpc/paper-svelte';

  let { days }: { days: Day[] } = $props();
  let sheet: PaperStackState | null = $state(null);
</script>

<PaperStack label="Field notes" pageCount={days.length} bind:state={sheet} onChange={(detail) => console.log(detail.index)}>
  {#snippet page(index)}
    <section><h2>{days[index].title}</h2></section>
  {/snippet}
</PaperStack>
```

### Solid

Solid 2.0 and later, with `@solidjs/web`. The package has the JSX source under the `solid` export condition, for `@solidjs/vite-plugin`, and compiled DOM and server builds for the rest. Each child element is a page. `ref` is called with each controller made, and with `null` when it goes:

```tsx
import { For } from 'solid-js';
import { PaperBook, usePaper } from '@someonewithpc/paper-solid';

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

### Astro

Astro 5 and later, tested with 7. The components ship as `.astro` source with typed props. They import the stylesheet and load a script that makes a controller for each root on load and after each view transition (`astro:page-load`), and destroys the controllers of roots a transition took off the page. Only options with a `data-paper-*` attribute are props, since functions can't travel to the browser. Listen for the `paper:*` events on the root instead.

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

A page is the HTML its slot rendered. The scripts and head content of the components in it go just before and after the root, so a slotted component keeps its `<script>`. To reach a controller, call `paperOf(root)` from `@someonewithpc/paper-astro/client`. A script that may run before the components' own calls `enhanceAll()` first. `enhance={false}` leaves the root to your own `createPaper`.

## Browser notes

The scripted stack needs `@property`, `light-dark()` and the CSS math functions, `sign()` and `log()` among them. Chrome and Edge 138, Firefox 128 and Safari 18 have all of them. The no-script carousel draws arrows and dots where `::scroll-button()` and `::scroll-marker` exist, and shows the next page's edge elsewhere.

The book works out how many pages fit with `sign()` over container units and skips pages out of view with `content-visibility`, both in the same browsers. Its no-script dots hide the right-hand page's dot with a style query from the page's `::scroll-marker`, tested in Chrome only.

## Development

The repository has a Nix flake with Node 24; `direnv allow` loads it.

It is an npm workspace. `packages/paper` is the core package, `packages/react`, `vue`, `svelte`, `solid` and `astro` are the adapters, `site/` is the landing page and `playground/` has the pages the e2e specs drive.

```sh
npm run build          # each package's dist/: JavaScript, declarations and styles.css
npm run typecheck      # tsc, svelte-check and astro check
npm test               # unit tests
npm run test:e2e       # Playwright specs against the playgrounds
npm run check:package  # publint and arethetypeswrong on each package
npm run playground     # http://localhost:4320/
npm run site:dev       # the landing page in site/, from Astro's dev server
npm run site:build     # the library, then the landing page into site/dist/
npm run site:deploy    # site:build, then wrangler deploy to paper.js.hsal.es
npm run test:e2e -w site  # the landing page's smoke and axe specs
npm run release        # check:package, then npm publish of the six packages
```

The e2e run also serves the adapter pages from Vite, rendered on the server and hydrated, at `http://localhost:4322/<framework>/`, and a built Astro site at `http://localhost:4323/`. `node scripts/serve-adapters.mjs` and `node scripts/serve-astro.mjs` start them on their own.

The packages share one version, and each adapter depends on `@someonewithpc/paper` with a caret range on it. To release a new version, set it in every `packages/*/package.json` and in the adapters' ranges, run `npm install` to update the lockfile, then `npm run release`, which runs `npm publish --workspaces --access public` once the checks pass. npm skips `site/` and `playground/`, which are private.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
