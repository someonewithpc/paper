<script lang="ts">
  import Paper from './Paper.svelte';
  import type { PaperBookProps } from './types.js';

  let { controller = $bindable(null), state = $bindable(null), ...props }: PaperBookProps = $props();
</script>

<Paper mode="book" bind:controller bind:state {...props} />
