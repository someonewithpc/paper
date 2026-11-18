# @someonewithpc/paper-vue

Vue components for [@someonewithpc/paper](https://github.com/someonewithpc/paper#readme). `<PaperStack>` is a stack of pages you turn by folding the corner, and `<PaperBook>` is a book you turn across the spine. With scripting off, both are CSS carousels.

## Install

```sh
npm install @someonewithpc/paper-vue
```

`@someonewithpc/paper` comes with it. The peer dependency is Vue 3.3 or later. The components are render functions compiled to JavaScript, so your bundler needs no loader for them.

## Usage

```vue
<script setup lang="ts">
import { PaperBook, usePaper } from '@someonewithpc/paper-vue';
import '@someonewithpc/paper/styles.css';

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

Each element of the default slot is a page, `v-for` included. The props are the mode's options, and the callbacks are events: `turn-start`, `turn-end`, `change` and `settle`. A template ref exposes `controller` and `state`, and `usePaper` reads them for you.

The [main README](https://github.com/someonewithpc/paper#vue) lists the options, events and CSS custom properties, and [paper.js.hsal.es](https://paper.js.hsal.es) has a stack and a book to try.

## License

GPL-3.0-or-later
