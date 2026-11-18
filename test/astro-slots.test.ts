import { describe, expect, it } from 'vitest';

import { slotPages, topLevelElements } from '../packages/astro/src/slots.js';

describe('topLevelElements', () => {
  it('splits a fragment at its top-level elements', () => {
    expect(topLevelElements(`
      <section class="a" data-x="1 > 0"><h2>One</h2><br><img src="x"></section>
      <!-- <div>not a page</div> -->
      <svg viewBox="0 0 1 1"><path d="M0 0"/></svg><input value='<b>'>
      <div><script>if (a < b) document.write('</div>')</script></div>
    `)).toEqual([
      '<section class="a" data-x="1 > 0"><h2>One</h2><br><img src="x"></section>',
      '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>',
      "<input value='<b>'>",
      "<div><script>if (a < b) document.write('</div>')</script></div>",
    ]);
  });

  it('refuses text between pages', () => {
    expect(() => topLevelElements('<p>One</p> loose words <p>Two</p>')).toThrow(/has the text "loose words"/);
  });
});

describe('slotPages', () => {
  class SlotString extends String {
    constructor(content: string, public instructions: unknown[] | null, public chunks: unknown[] = []) {
      super(content);
    }
  }

  it('keeps the instructions and scripts for beside the root', () => {
    const script = { type: 'script', id: 'a' };
    const head = { type: 'head' };
    const { pages, before, after } = slotPages([
      new SlotString('<p>One</p>', [head], ['<p>One</p>', script]),
      new SlotString('<p>Two</p>', null, ['<p>Two</p>']),
    ], false);
    expect(pages).toEqual(['<p>One</p>', '<p>Two</p>']);
    expect(before).toBeInstanceOf(SlotString);
    expect((before as SlotString).instructions).toEqual([head]);
    expect((after as SlotString).chunks).toEqual([script]);
    expect(String(after)).toBe('');
  });

  it('splits one render of the whole slot', () => {
    const { pages, before, after } = slotPages([new SlotString('<p>One</p>\n<p>Two</p>', null, [])], true);
    expect(pages).toEqual(['<p>One</p>', '<p>Two</p>']);
    expect(before).toBeNull();
    expect(after).toBeNull();
  });
});
