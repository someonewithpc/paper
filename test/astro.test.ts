import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import PaperBook from '../packages/astro/src/PaperBook.astro';
import Stack from './fixtures/Stack.astro';

describe('the Astro adapter on a server', () => {
  it('renders a page per slot call, with the slotted component\'s script beside the root', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Stack);
    expect(html).toMatch(/^<div data-paper-stack data-paper-flipped role="group" aria-label="Sheets" data-paper-start-page="1" data-paper-wrap="false" data-test="x" id="sheets" class="mine" style="--paper-page-count: 3; --paper-pages-turned: 1; max-width: 30rem" data-paper-astro>/);
    expect(html.match(/<div class="paper-front"/g)).toHaveLength(1);
    expect(html).toContain('<div class="paper-front" style="--paper-page-index: 1"><div class="paper-clip-under"><svg');
    expect(html).toContain('<h2>Two</h2></section><div class="paper-clip">');
    expect(html).toContain('<div style="--paper-page-index: 3"><section data-sheet><h2>One</h2></section></div>');
    const root = html.slice(0, html.indexOf('<div class="paper-sr-only"'));
    expect(root).not.toContain('<script');
    expect(html.slice(root.length)).toMatch(/^<div class="paper-sr-only" role="status" data-paper-status><\/div><span hidden id="paper-keys-sheets" data-paper-keys>The left and right arrow keys turn the pages<\/span>[^]*<script/);
    // The client script and the sheet's, once for three sheets.
    expect(html.slice(root.length).match(/<script/g)).toHaveLength(2);
  });

  it('makes a page of each top-level element of the default slot', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PaperBook, {
      props: { as: 'article', label: 'Book', display: 'double', surfaces: [undefined, 'navy'] },
      slots: { default: '<section><h2>Cover</h2></section>\n<!-- between -->\n<section><h2>Two</h2></section> <img alt="Three" src="x.png">' },
    });
    expect(html).toMatch(/^<article data-paper-book aria-label="Book" data-paper-mode="book" data-paper-display="double" style="--paper-page-count: 3" data-paper-astro>/);
    expect(html.match(/<div class="paper-book-shade" aria-hidden="true"><\/div>/g)).toHaveLength(3);
    expect(html).toContain('<div class="paper-book-page" data-paper-place="view"><section><h2>Cover</h2></section>');
    expect(html).toContain('<div class="paper-book-page" style="--paper-surface: navy"><section><h2>Two</h2></section>');
    expect(html).toContain('<div class="paper-book-page"><img alt="Three" src="x.png"><div class="paper-book-shade"');
  });

  it('leaves the root to a script of the page\'s own with enhance off, and renders nothing without pages', async () => {
    const container = await AstroContainer.create();
    const off = await container.renderToString(PaperBook, { props: { enhance: false }, slots: { default: '<p>One</p>' } });
    expect(off).toContain('<div data-paper-book');
    expect(off).not.toContain('data-paper-astro');
    expect(await container.renderToString(PaperBook, { slots: { default: ' ' } })).not.toContain('data-paper-book');
  });
});
