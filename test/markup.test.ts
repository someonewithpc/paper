import { describe, expect, it } from 'vitest';

import { bookMarkup, pageIndexOf, renderBook, renderStack, spreadPartnerOf, stackMarkup } from '../src/markup.js';

const pages = ['<section>One</section>', '<section>Two</section>', { html: '<section>Three</section>', surface: 'navy' }];

describe('renderStack', () => {
  it('wraps each page and puts the chrome on the first', () => {
    const html = renderStack({ label: 'Demo', pages });
    expect(html).toMatch(/^<div data-paper-stack role="group" aria-label="Demo" style="--paper-page-count: 3">/);
    expect(html.match(/<div class="paper-front"/g)).toHaveLength(1);
    expect(html).toContain('<div class="paper-front" style="--paper-page-index: 1"><div class="paper-clip-under">');
    expect(html).toContain('<section>One</section><div class="paper-clip">');
    expect(html).toContain('<div style="--paper-page-index: 3; --paper-surface: navy"><section>Three</section></div>');
    expect(html).toContain('</div><div class="paper-sr-only" role="status" data-paper-status></div>');
    expect(html).toMatch(/<span hidden id="paper-keys-[a-z0-9]+" data-paper-keys>The left and right arrow keys turn the pages<\/span>$/);
  });

  it('gives the same ids on every build and different ones to different stacks', () => {
    expect(renderStack({ label: 'A', pages })).toBe(renderStack({ label: 'A', pages }));
    expect(renderStack({ label: 'A', pages })).not.toBe(renderStack({ label: 'B', pages }));
    expect(renderStack({ id: 'mine', pages })).toContain('url(#paper-clip-over-mine)');
  });

  it('starts on another page with the pile already turned', () => {
    const html = renderStack({ pages, options: { startPage: 2 } });
    expect(html).toContain('data-paper-flipped');
    expect(html).toContain('--paper-pages-turned: 2');
    expect(html).toContain('data-paper-start-page="2"');
    expect(html).toContain('<div class="paper-front" style="--paper-page-index: 1; --paper-surface: navy">');
    expect(html).toContain('<div style="--paper-page-index: 2"><section>One</section></div>');
  });

  it('names the pile paper when the page turned last has its own', () => {
    expect(renderStack({ pages: [...pages, '<section>Four</section>'], options: { startPage: 3 } })).toContain('--paper-pile-surface: navy');
  });

  it('leaves out the decorations it is told to', () => {
    const html = renderStack({ pages, options: { decorations: { clip: false, hint: false } } });
    expect(html).not.toContain('paper-clip-under');
    expect(html).not.toContain('paper-flip-hint');
    expect(html).toContain('<div class="paper-clip"></div><div class="paper-fold"></div>');
  });

  it('needs no keys text when the keyboard is off or described elsewhere', () => {
    expect(renderStack({ pages, options: { interactions: { keyboard: false } } })).not.toContain('data-paper-keys');
    expect(renderStack({ pages, options: { describedBy: 'help' } })).not.toContain('data-paper-keys');
  });

  it('escapes attribute values and text', () => {
    const html = renderStack({ label: '"><script>', pages, options: { strings: { keys: '<b>' } } });
    expect(html).toContain('aria-label="&quot;&gt;&lt;script&gt;"');
    expect(html).toContain('data-paper-keys>&lt;b&gt;</span>');
  });

  it('leaves the role to an article', () => {
    expect(renderStack({ tag: 'article', pages })).not.toContain('role="group"');
  });

  it('keeps a style given with the attributes after its own', () => {
    expect(renderStack({ pages, attributes: { style: 'width: 10rem', 'data-x': '1' } })).toContain('style="--paper-page-count: 3; width: 10rem"');
  });
});

describe('stackMarkup', () => {
  it('rejects what it cannot render', () => {
    expect(() => stackMarkup({ pageCount: 0 })).toThrow(RangeError);
    expect(() => stackMarkup({ pageCount: 2, tag: 'div onclick' })).toThrow(RangeError);
    expect(() => stackMarkup({ pageCount: 2, options: { startPage: 2 } })).toThrow(RangeError);
  });
});

describe('pageIndexOf', () => {
  it('rotates the order so the start page is 1', () => {
    expect([0, 1, 2, 3].map((page) => pageIndexOf(page, 1, 4))).toEqual([4, 1, 2, 3]);
  });
});

describe('renderBook', () => {
  const leaves = ['<section>One</section>', { html: '<section>Two</section>', surface: 'navy' }, '<section>Three</section>', '<section>Four</section>'];

  it('wraps each page with its shade and marks the book', () => {
    const html = renderBook({ label: 'Atlas', pages: leaves });
    expect(html).toMatch(/^<div data-paper-book role="group" aria-label="Atlas" data-paper-mode="book" style="--paper-page-count: 4">/);
    expect(html.match(/class="paper-book-page"/g)).toHaveLength(4);
    expect(html.match(/<div class="paper-book-shade" aria-hidden="true"><\/div><\/div>/g)).toHaveLength(4);
    expect(html).toContain('<div class="paper-book-page" style="--paper-surface: navy"><section>Two</section>');
    expect(html).toMatch(/<span hidden id="paper-keys-[a-z0-9]+" data-paper-keys>The left and right arrow keys turn the pages, Home and End go to the covers<\/span>$/);
  });

  it('shows the start page and its partner until the script places them', () => {
    const at = (start: number) => bookMarkup({ pageCount: 5, options: { startPage: start } }).pages.map((page) => page.attributes['data-paper-place']);
    expect(at(0)).toEqual(['view', undefined, undefined, undefined, undefined]);
    expect(at(1)).toEqual([undefined, 'view', 'pair', undefined, undefined]);
    expect(at(4)).toEqual([undefined, undefined, undefined, 'pair', 'view']);
    expect(spreadPartnerOf(3, 4)).toBe(undefined);
  });

  it('writes the book options down', () => {
    const html = renderBook({ pages: leaves, options: { display: 'double', hardCovers: true, startPage: 2 } });
    expect(html).toContain('data-paper-mode="book" data-paper-start-page="2" data-paper-hard-covers="true" data-paper-display="double"');
  });

  it('refuses a start page it does not have', () => {
    expect(() => bookMarkup({ pageCount: 2, options: { startPage: 2 } })).toThrow(RangeError);
  });
});
