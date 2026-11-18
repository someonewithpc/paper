import type { HTMLTag } from 'astro/types';

import type { PaperBookDataOptions, PaperStackDataOptions } from '../options.js';

type AttributeValue = string | number | boolean | null | undefined;

/**
 * What both components take besides the mode's options. Only the options that can be written as
 * `data-paper-*` attributes: the page's script reads them back, and functions don't get there.
 * Listen for the `paper:*` events, or get the controller with `paperOf`, for the rest.
 */
export interface PaperComponentProps {
  /**
   * How many times the default slot is called, with the page's index, for one page each. Left out,
   * every top-level element of the default slot is a page.
   */
  pageCount?: number;
  /** Tag of the root. Default `div`. */
  as?: HTMLTag;
  /** Accessible name of the root. */
  label?: string;
  /** The root's id, and the base of the ids the markup needs. */
  id?: string;
  class?: string;
  style?: string;
  /** Per page, its `--paper-surface`: any CSS `<color>` or `<image>`. */
  surfaces?: readonly (string | undefined)[];
  /** `false` leaves the root to a script of your own, which calls createPaper on it. Default `true`. */
  enhance?: boolean;
  [attribute: `data-${string}`]: AttributeValue;
  [attribute: `aria-${string}`]: AttributeValue;
}

export type PaperStackProps = PaperComponentProps & Omit<PaperStackDataOptions, 'mode'>;
export type PaperBookProps = PaperComponentProps & Omit<PaperBookDataOptions, 'mode'>;
