import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';

import { PaperBook, PaperStack } from '../packages/paper/src/vue/index.js';

const page = (title: string) => h('section', [h('h2', title)]);
const render = (component: unknown) => renderToString(createSSRApp({ render: () => component }));

describe('the Vue adapter on a server', () => {
  it('renders a stack with a wrapper per slot element and the chrome on the start page', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    const html = await render(h(PaperStack, {
      id: 'sheets', label: 'Sheets', class: 'mine', style: { maxWidth: '30rem' }, startPage: 1, wrap: false, 'data-test': 'x',
    }, () => [page('One'), ' ', ['Two', 'Three'].map(page)]));
    expect(html).toMatch(/^<!--\[--><div data-paper-stack data-paper-flipped role="group" aria-label="Sheets" data-paper-start-page="1" data-paper-wrap="false" data-test="x" id="sheets" class="mine" style="--paper-page-count: 3; --paper-pages-turned: 1; max-width: 30rem">/);
    expect(html.match(/<div class="paper-front"/g)).toHaveLength(1);
    expect(html).toContain('<div class="paper-front" style="--paper-page-index: 1"><div class="paper-clip-under"><svg');
    expect(html).toContain('<h2>Two</h2></section><div class="paper-clip">');
    expect(html).toContain('<div style="--paper-page-index: 3"><section><h2>One</h2>');
    expect(html).toMatch(/<\/div><div class="paper-sr-only" role="status" data-paper-status><\/div><span hidden id="paper-keys-sheets" data-paper-keys>The left and right arrow keys turn the pages<\/span><!--\]-->$/);
  });

  it('renders a book with a shade per page and the start spread marked', async () => {
    const html = await render(h(PaperBook, { as: 'article', label: 'Book', display: 'double', surfaces: [undefined, 'navy'] },
      () => ['Cover', 'Two', 'Three'].map(page)));
    expect(html).toMatch(/^<!--\[--><article data-paper-book aria-label="Book" data-paper-mode="book" data-paper-display="double" style="--paper-page-count: 3">/);
    expect(html.match(/<div class="paper-book-shade" aria-hidden="true"><\/div>/g)).toHaveLength(3);
    expect(html).toContain('<div class="paper-book-page" data-paper-place="view"><section><h2>Cover</h2>');
    expect(html).toContain('<div class="paper-book-page" style="--paper-surface: navy"><section><h2>Two</h2>');
  });

  it('renders nothing without pages', async () => {
    expect(await render(h(PaperStack, { label: 'Empty' }))).toBe('<!---->');
  });
});
