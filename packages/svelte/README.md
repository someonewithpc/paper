# @someonewithpc/paper-svelte

Svelte components for [@someonewithpc/paper](https://github.com/someonewithpc/paper#readme). `<PaperStack>` is a stack of pages you turn by folding the corner, and `<PaperBook>` is a book you turn across the spine. With scripting off, both are CSS carousels.

## Install

```sh
npm install @someonewithpc/paper-svelte
```

`@someonewithpc/paper` comes with it. The peer dependency is Svelte 5.

## Usage

```svelte
<script lang="ts">
  import { PaperStack, type PaperStackState } from '@someonewithpc/paper-svelte';
  import '@someonewithpc/paper/styles.css';

  let { days }: { days: Day[] } = $props();
  let sheet: PaperStackState | null = $state(null);
</script>

<PaperStack label="Field notes" pageCount={days.length} bind:state={sheet} onChange={(detail) => console.log(detail.index)}>
  {#snippet page(index)}
    <section><h2>{days[index].title}</h2></section>
  {/snippet}
</PaperStack>
```

A snippet can't be split into elements, so the pages come from a `page` snippet, which the component renders once per index up to `pageCount`. The props are the mode's options, callbacks included. `controller` and `state` are bindable.

The [main README](https://github.com/someonewithpc/paper#svelte) lists the options, events and CSS custom properties, and [paper.js.hsal.es](https://paper.js.hsal.es) has a stack and a book to try.

## License

GPL-3.0-or-later
