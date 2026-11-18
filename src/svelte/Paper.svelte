<script lang="ts" generics="M extends PaperMode">
  import { untrack } from 'svelte';

  import {
    createFor, liveOptions, markupKey, markupOf, optionsKey, splitProps, watchState,
  } from '../adapters/shared.js';
  import { elementsToString } from '../markup.js';
  import type { PaperMode } from '../types.js';
  import type { PaperComponentProps } from './types.js';

  let {
    mode, pageCount, page, as, label, id, surfaces, class: className, style,
    controller = $bindable(null), state: view = $bindable(null), ...others
  }: PaperComponentProps<M> & { mode: M } = $props();

  const split = $derived(splitProps(mode, others));
  const key = $derived(optionsKey(split.options));
  const markup = $derived(pageCount > 0 ? markupOf(mode, { pageCount, tag: as, label, id, surfaces }, split.options) : null);
  const shape = $derived(markup ? markupKey(markup) : '');
  const own = $derived.by(() => {
    const { class: ownClass, style: ownStyle, ...attributes } = markup?.attributes ?? {};
    return {
      ...attributes,
      class: [ownClass, className].filter(Boolean).join(' ') || undefined,
      style: [ownStyle, style].filter(Boolean).join('; ') || undefined,
    };
  });

  let root: HTMLElement | undefined = $state();

  $effect(() => {
    void key;
    void shape;
    if (!root) return;
    const element = root;
    const created = untrack(() => createFor(mode, element, liveOptions(split.options, () => split.options)));
    const unwatch = watchState(created, (next) => {
      view = next;
    });
    controller = created;
    return () => {
      unwatch();
      created.destroy();
      controller = null;
      view = null;
    };
  });
</script>

<!-- A new shape is a new root: the script has moved things around inside the old one. -->
{#if markup}
  {#key shape}
    <svelte:element this={markup.tag} bind:this={root} {...own} {...split.rest} {id}>
      {#each markup.pages as wrapper, index (index)}
        <div {...wrapper.attributes}>{@html elementsToString(wrapper.beforeElements)}{@render page(index)}{@html elementsToString(wrapper.afterElements)}</div>
      {/each}
    </svelte:element>{@html elementsToString(markup.afterElements)}
  {/key}
{/if}
