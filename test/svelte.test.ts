import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import { PaperBook, PaperStack } from '../packages/paper/src/svelte/index.js';

const pages = (...titles: string[]) =>
  createRawSnippet((index: () => number) => ({ render: () => `<section><h2>${titles[index()]}</h2></section>` }));
// Without the comments Svelte hydrates by.
const html = (body: string) => body.replace(/<!--[^]*?-->/g, '');

describe('the Svelte adapter on a server', () => {
  it('renders a stack with a wrapper per page and the chrome on the start page', () => {
    expect(typeof globalThis.window).toBe('undefined');
    const body = html(render(PaperStack, {
      props: {
        pageCount: 3, page: pages('One', 'Two', 'Three'), id: 'sheets', label: 'Sheets', class: 'mine', style: 'max-width: 30rem',
        startPage: 1, wrap: false, 'data-test': 'x',
      },
    }).body);
    expect(body).toMatch(/^<div data-paper-stack="" data-paper-flipped="" role="group" aria-label="Sheets" data-paper-start-page="1" data-paper-wrap="false" class="mine" style="--paper-page-count: 3; --paper-pages-turned: 1; max-width: 30rem" data-test="x" id="sheets">/);
    expect(body.match(/<div class="paper-front"/g)).toHaveLength(1);
    expect(body).toContain('<div class="paper-front" style="--paper-page-index: 1"><div class="paper-clip-under"><svg');
    expect(body).toContain('<h2>Two</h2></section><div class="paper-clip">');
    expect(body).toContain('<div style="--paper-page-index: 3"><section><h2>One</h2>');
    expect(body).toMatch(/<\/div><div class="paper-sr-only" role="status" data-paper-status><\/div><span hidden id="paper-keys-sheets" data-paper-keys>The left and right arrow keys turn the pages<\/span>$/);
  });

  it('renders a book with a shade per page and the start spread marked', () => {
    const body = html(render(PaperBook, {
      props: { pageCount: 3, page: pages('Cover', 'Two', 'Three'), as: 'article', label: 'Book', display: 'double', surfaces: [undefined, 'navy'] },
    }).body);
    expect(body).toMatch(/^<article data-paper-book="" aria-label="Book" data-paper-mode="book" data-paper-display="double" style="--paper-page-count: 3">/);
    expect(body.match(/<div class="paper-book-shade" aria-hidden="true"><\/div>/g)).toHaveLength(3);
    expect(body).toContain('<div class="paper-book-page" data-paper-place="view"><section><h2>Cover</h2>');
    expect(body).toContain('<div class="paper-book-page" style="--paper-surface: navy"><section><h2>Two</h2>');
  });

  it('renders nothing without pages', () => {
    expect(html(render(PaperStack, { props: { pageCount: 0, page: pages() } }).body)).toBe('');
  });
});
