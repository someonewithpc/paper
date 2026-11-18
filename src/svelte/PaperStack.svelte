<script lang="ts">
  import Paper from './Paper.svelte';
  import type { PaperStackProps } from './types.js';

  let { controller = $bindable(null), state = $bindable(null), ...props }: PaperStackProps = $props();
</script>

<Paper mode="stack" bind:controller bind:state {...props} />
