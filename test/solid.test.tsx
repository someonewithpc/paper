/** @jsxImportSource solid-js */
import { renderToString } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { PaperBook, PaperStack } from '../packages/solid/src/index.js';

const Page = (props: { title: string }) => <section><h2>{props.title}</h2></section>;
// Without the hydration keys and markers Solid hydrates by.
const html = (body: string) => body.replace(/ data-hk="[^"]*"/g, '').replace(/<!--[^]*?-->/g, '')
  .replace(/ class="([^"]*) "/g, ' class="$1"').replace(/ >/g, '>');

describe('the Solid adapter on a server', () => {
  it('renders a stack with a wrapper per child and the chrome on the start page', () => {
    expect(typeof globalThis.window).toBe('undefined');
    const body = html(renderToString(() => (
      <PaperStack id="sheets" label="Sheets" class="mine" style="max-width: 30rem" startPage={1} wrap={false} data-test="x">
        <Page title="One" />
        <Page title="Two" />
        <Page title="Three" />
      </PaperStack>
    )));
    expect(body).toMatch(/^<div data-paper-stack="" data-paper-flipped="" role="group" aria-label="Sheets" data-paper-start-page="1" data-paper-wrap="false" data-test="x" id="sheets" class="mine" style="--paper-page-count: 3; --paper-pages-turned: 1; max-width: 30rem">/);
    expect(body.match(/<div class="paper-front"/g)).toHaveLength(1);
    expect(body).toContain('<div class="paper-front" style="--paper-page-index: 1"><div class="paper-clip-under"><svg');
    expect(body).toContain('<h2>Two</h2></section><div class="paper-clip">');
    expect(body).toContain('<div style="--paper-page-index: 3"><section><h2>One</h2>');
    expect(body).toMatch(/<\/div><div class="paper-sr-only" role="status" data-paper-status=""><\/div><span hidden id="paper-keys-sheets" data-paper-keys="">The left and right arrow keys turn the pages<\/span>$/);
  });

  it('renders a book with a shade per page and the start spread marked', () => {
    const body = html(renderToString(() => (
      <PaperBook as="article" label="Book" display="double" surfaces={[undefined, 'navy']}>
        <Page title="Cover" />
        <Page title="Two" />
        <Page title="Three" />
      </PaperBook>
    )));
    expect(body).toMatch(/^<article data-paper-book="" aria-label="Book" data-paper-mode="book" data-paper-display="double" style="--paper-page-count: 3">/);
    expect(body.match(/<div class="paper-book-shade" aria-hidden="true"><\/div>/g)).toHaveLength(3);
    expect(body).toContain('<div class="paper-book-page" data-paper-place="view"><section><h2>Cover</h2>');
    expect(body).toContain('<div class="paper-book-page" style="--paper-surface: navy"><section><h2>Two</h2>');
  });

  it('renders nothing without pages', () => {
    expect(html(renderToString(() => <PaperStack label="Empty" />))).toBe('');
  });
});
