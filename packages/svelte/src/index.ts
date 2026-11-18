import type { Component } from 'svelte';

import Book from './PaperBook.svelte';
import Stack from './PaperStack.svelte';
import type { PaperBookProps, PaperStackProps } from './types.js';

// Typed here so the declarations don't import the .svelte files, which only a Svelte-aware
// resolver finds types for.
/** A stack of pages turned from the corner, one per index the `page` snippet renders. */
export const PaperStack: Component<PaperStackProps, {}, 'controller' | 'state'> = Stack;
/** A book of pages turned across the spine, one per index the `page` snippet renders. */
export const PaperBook: Component<PaperBookProps, {}, 'controller' | 'state'> = Book;

export type { PaperBookProps, PaperComponentProps, PaperStackProps } from './types.js';
export type * from '@someonewithpc/paper';
