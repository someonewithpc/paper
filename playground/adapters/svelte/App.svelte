<script lang="ts">
  import { PaperBook, PaperStack, type PaperBookState, type PaperStackState } from '@someonewithpc/paper/svelte';

  import { bookPages, pageText, stackPages } from '../content.js';

  let shown = $state(true);
  let changes = $state(0);
  let stack: PaperStackState | null = $state(null);
  let book: PaperBookState | null = $state(null);
</script>

<p><button type="button" id="toggle" onclick={() => (shown = !shown)}>{shown ? 'Unmount' : 'Mount'}</button></p>
{#if shown}
  <PaperStack id="stack" label="Svelte stack" class="demo-stack" pageCount={stackPages.length} bind:state={stack} onChange={() => ++changes}>
    {#snippet page(index)}
      <section class="demo-page"><h2>{stackPages[index]}</h2><p>{pageText}</p></section>
    {/snippet}
  </PaperStack>
  <PaperBook id="book" label="Svelte book" class="demo-book" display="double" pageCount={bookPages.length} bind:state={book} onChange={() => ++changes}>
    {#snippet page(index)}
      <section class="demo-leaf"><h2>{bookPages[index]}</h2><p>{pageText}</p></section>
    {/snippet}
  </PaperBook>
{/if}
<p>
  Stack page <output id="stack-state">{stack ? stack.index : 'none'}</output>,
  book spread <output id="book-state">{book ? book.spread : 'none'}</output>,
  changes <output id="changes">{changes}</output>
</p>
