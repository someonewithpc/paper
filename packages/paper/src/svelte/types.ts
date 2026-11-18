import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

import type { AdapterOptions } from '../adapters/shared.js';
import type { PaperController, PaperMode, PaperStateMap } from '../types.js';

/** What both components take besides the mode's options. Other HTML attributes go on the root. */
export interface PaperComponentProps<M extends PaperMode> extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'id' | 'class' | 'style'> {
  pageCount: number;
  /** Renders the page at an index, from 0. Its output has to be one element. */
  page: Snippet<[number]>;
  /** Tag of the root. Default `div`. */
  as?: keyof HTMLElementTagNameMap;
  /** Accessible name of the root. */
  label?: string;
  /** The root's id, and the base of the ids the markup needs. */
  id?: string;
  /** Per page, its `--paper-surface`: any CSS `<color>` or `<image>`. */
  surfaces?: readonly (string | undefined)[];
  class?: string;
  style?: string;
  /** Bindable: null until mounted. A changed option makes a new one. */
  controller?: PaperController<M> | null;
  /** Bindable: the controller's state, kept up to date by its events. */
  state?: PaperStateMap[M] | null;
}

export type PaperStackProps = PaperComponentProps<'stack'> & AdapterOptions['stack'];
export type PaperBookProps = PaperComponentProps<'book'> & AdapterOptions['book'];
