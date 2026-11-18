import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PaperBook, PaperStack } from '../packages/paper/src/react/index.js';

const Page = ({ title }: { title: string }) => <section><h2>{title}</h2></section>;

describe('the React adapter on a server', () => {
  it('renders a stack with a wrapper per child and the chrome on the start page', () => {
    expect(typeof globalThis.window).toBe('undefined');
    const html = renderToString(
      <PaperStack id="sheets" label="Sheets" className="mine" style={{ maxWidth: '30rem' }} startPage={1} wrap={false} data-test="x">
        <Page title="One" />
        <Page title="Two" />
        {null}
        <Page title="Three" />
      </PaperStack>,
    );
    expect(html).toMatch(/^<div data-paper-stack="" data-paper-flipped="" role="group" aria-label="Sheets" data-paper-start-page="1" data-paper-wrap="false" data-test="x" id="sheets" class="mine" style="--paper-page-count:3;--paper-pages-turned:1;max-width:30rem">/);
    expect(html.match(/<div class="paper-front"/g)).toHaveLength(1);
    expect(html).toContain('<div class="paper-front" style="--paper-page-index:1"><div class="paper-clip-under"><svg');
    expect(html).toContain('<h2>Two</h2></section><div class="paper-clip">');
    expect(html).toContain('<div style="--paper-page-index:3"><section><h2>One</h2>');
    expect(html).toMatch(/<\/div><div class="paper-sr-only" role="status" data-paper-status=""><\/div><span hidden="" id="paper-keys-[a-z0-9]+" data-paper-keys="">The left and right arrow keys turn the pages<\/span>$/);
  });

  it('renders a book with a shade per page and the start spread marked', () => {
    const html = renderToString(
      <PaperBook as="article" label="Book" display="double" surfaces={[undefined, 'navy']}>
        <Page title="Cover" />
        <Page title="Two" />
        <Page title="Three" />
      </PaperBook>,
    );
    expect(html).toMatch(/^<article data-paper-book="" aria-label="Book" data-paper-mode="book" data-paper-display="double" style="--paper-page-count:3">/);
    expect(html.match(/<div class="paper-book-shade" aria-hidden="true"><\/div>/g)).toHaveLength(3);
    expect(html).toContain('<div class="paper-book-page" data-paper-place="view"><section><h2>Cover</h2>');
    expect(html).toContain('<div class="paper-book-page" style="--paper-surface:navy"><section><h2>Two</h2>');
  });

  it('renders nothing without pages', () => {
    expect(renderToString(<PaperStack label="Empty" />)).toBe('');
  });
});
