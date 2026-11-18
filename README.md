# @hsal/paper

A stack of pages you turn by folding the corner. The front page has a dog-ear in its bottom-right corner: drag it past the middle and the page folds over and goes to the back of the stack, where turned pages pile up above the top edge. Grab the folded-back top-left corner to bring the last page back. A sideways wheel or trackpad scroll, a finger swipe and the arrow keys turn pages too.

Without JavaScript the same markup is a scroll-snap carousel, with arrows and dots in browsers that draw CSS carousels and the next page's edge peeking in elsewhere.

The library has no dependencies and no framework. It ships ESM, TypeScript types and one plain CSS file.

## Install

```sh
npm install @hsal/paper
```

## Quick start

### HTML only

Load the stylesheet and the custom element, then put one element per page inside `<paper-stack>`:

```html
<link rel="stylesheet" href="https://unpkg.com/@hsal/paper/dist/styles.css">
<script type="module" src="https://unpkg.com/@hsal/paper/dist/element.js"></script>

<paper-stack data-paper-stack aria-label="Field notes" style="aspect-ratio: 2 / 1">
  <section><h2>Monday</h2><p>…</p></section>
  <section data-paper-surface="#1f4f8f"><h2>Tuesday</h2><p>…</p></section>
  <section><h2>Wednesday</h2><p>…</p></section>
</paper-stack>
```

The `data-paper-stack` attribute in the HTML lets the no-script carousel style the stack before the element loads. Options go in `data-paper-*` attributes (see [Options](#options)).

### JavaScript

```ts
import { createPaper } from '@hsal/paper';
import '@hsal/paper/styles.css';

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
import { renderStack } from '@hsal/paper';

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
| `mode` | `data-paper-mode` | `'stack'` | The only mode so far |
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

Boolean attributes take `true`, `false` or no value. An attribute with a value it can't take logs a warning and is ignored. Options passed in code win over attributes.

`PaperOptions` is a union keyed on `mode`, so TypeScript narrows the rest of the options once `mode` is known.

## Controller

```ts
interface PaperController {
  readonly root: HTMLElement;
  readonly mode: 'stack';
  readonly state: PaperState;
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

`<paper-stack>` has `next`, `prev`, `goTo`, `state` and `controller`, and an `options` property read when it connects.

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

The defaults for colours use `light-dark()`, so they follow the page's `color-scheme`. The no-script carousel labels its controls "Previous page", "Next page" and "Page N"; override `content` on `::scroll-button()` and `::scroll-marker` to change them.

The other `--paper-*` properties are internal state the script writes. They are registered with `@property` and most don't inherit, which keeps a turn from restyling everything printed on the pages.

## Accessibility

- The stack is a `group` (unless it is an `<article>`) with `aria-roledescription="paper stack"` and is focusable when the keyboard is on. The arrow keys turn pages only when the stack itself has focus, so arrows inside a page's own controls stay theirs
- The focus ring sits on the front page's paper and follows the crease
- Pages behind the front one are `inert`, so they leave the tab order and the accessibility tree
- A live region beside the stack announces the new page once a turn has settled, one announcement per turn and none on load
- Under `prefers-reduced-motion: reduce`, or `reducedMotion: 'reduce'`, turns land at once and the dog-ear stays still. A drag still follows the hand
- Without script every page is readable in the carousel, and the carousel's dots are one tab stop

## Browser notes

The scripted stack needs `@property`, `light-dark()` and the CSS math functions, `sign()` and `log()` among them. Chrome and Edge 138, Firefox 128 and Safari 18 have all of them. The no-script carousel draws arrows and dots where `::scroll-button()` and `::scroll-marker` exist, and shows the next page's edge elsewhere.

## Development

The repository has a Nix flake with Node 22; `direnv allow` loads it.

```sh
npm run build          # dist/ JavaScript, declarations and styles.css
npm test               # unit tests
npm run test:e2e       # Playwright specs against the playground
npm run check:package  # publint and arethetypeswrong
npm run playground     # http://localhost:4320/
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
