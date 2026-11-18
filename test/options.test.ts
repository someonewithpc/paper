import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BOOK_INTERACTIONS, DEFAULT_BOOK_STRINGS, DEFAULT_INTERACTIONS, dataAttributesOf, defaultAnnounce,
  defaultBookAnnounce, mergeOptions, parseDataOptions, resolveBookOptions, resolveStackOptions,
} from '../packages/paper/src/options.js';

const dataset = (attributes: Record<string, string>) =>
  Object.fromEntries(Object.entries(attributes).map(([name, value]) => [
    name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    value,
  ]));

describe('resolveStackOptions', () => {
  it('fills in the defaults the CV ran with', () => {
    const resolved = resolveStackOptions();
    expect(resolved).toMatchObject({
      mode: 'stack', startPage: 0, wrap: true, reducedMotion: 'system', resizeHold: true,
      decorations: { clip: true, hint: true }, themeAttributes: ['data-theme'],
    });
    expect(resolved.interactions).toEqual(DEFAULT_INTERACTIONS);
  });

  it('keeps the interactions it is not told about', () => {
    expect(resolveStackOptions({ interactions: { wheel: false } }).interactions).toEqual({ ...DEFAULT_INTERACTIONS, wheel: false });
  });
});

describe('parseDataOptions', () => {
  it('reads every option attribute', () => {
    const { options, errors } = parseDataOptions(dataset({
      'data-paper-mode': 'stack',
      'data-paper-start-page': '2',
      'data-paper-wrap': 'false',
      'data-paper-drag': 'false',
      'data-paper-back-grab': '',
      'data-paper-reduced-motion': 'reduce',
      'data-paper-clip': 'false',
      'data-paper-keys': 'Arrows turn',
      'data-paper-theme-attributes': 'data-theme  class',
      'data-paper-resize-hold': 'false',
    }));
    expect(errors).toEqual([]);
    expect(options).toEqual({
      mode: 'stack',
      startPage: 2,
      wrap: false,
      interactions: { drag: false, backGrab: true },
      reducedMotion: 'reduce',
      decorations: { clip: false },
      strings: { keys: 'Arrows turn' },
      themeAttributes: ['data-theme', 'class'],
      resizeHold: false,
    });
  });

  it('reports and leaves out invalid values', () => {
    const { options, errors } = parseDataOptions(dataset({
      'data-paper-mode': 'scroll',
      'data-paper-start-page': '-1',
      'data-paper-wrap': 'yes',
      'data-paper-reduced-motion': 'none',
    }));
    expect(options).toEqual({});
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('data-paper-mode="scroll"');
    expect(errors[1]).toContain('data-paper-start-page');
  });

  it('ignores attributes that are not options', () => {
    expect(parseDataOptions(dataset({ 'data-paper-flipped': '', 'data-paper-settled': '' }))).toEqual({ options: {}, errors: [] });
  });
});

describe('dataAttributesOf', () => {
  it('writes what parseDataOptions reads back', () => {
    const given = {
      startPage: 1, wrap: false, reducedMotion: 'reduce' as const, resizeHold: false,
      interactions: { swipe: false }, decorations: { hint: false }, strings: { roleDescription: 'book' },
    };
    const attributes = dataAttributesOf(given);
    expect(attributes['data-paper-start-page']).toBe('1');
    expect(parseDataOptions(dataset(attributes))).toEqual({ options: given, errors: [] });
  });

  it('leaves out what cannot be written down', () => {
    expect(dataAttributesOf({ announce: () => '', onChange: () => {} })).toEqual({});
  });
});

describe('mergeOptions', () => {
  it('lets options in code win over attributes, key by key', () => {
    expect(mergeOptions(
      { wrap: false, interactions: { drag: false, wheel: false } },
      { wrap: true, interactions: { wheel: true } },
    )).toEqual({ wrap: true, interactions: { drag: false, wheel: true } });
  });
});

describe('defaultAnnounce', () => {
  it('names the page by place and title', () => {
    expect(defaultAnnounce({ index: 1, count: 4, title: 'Notes', page: {} as HTMLElement })).toBe('Page 2 of 4: Notes');
    expect(defaultAnnounce({ index: 0, count: 4, title: undefined, page: {} as HTMLElement })).toBe('Page 1 of 4');
  });
});

describe('book options', () => {
  it('fill in the book defaults', () => {
    const resolved = resolveBookOptions();
    expect(resolved).toMatchObject({
      mode: 'book', startPage: 0, display: 'auto', hardCovers: false, autoCenter: true, shading: true,
      reducedMotion: 'system', strings: DEFAULT_BOOK_STRINGS,
    });
    expect(resolved.interactions).toEqual(DEFAULT_BOOK_INTERACTIONS);
    expect(resolved.interactions).not.toHaveProperty('backGrab');
  });

  it('read the book attributes in book mode', () => {
    const { options, errors } = parseDataOptions(dataset({
      'data-paper-mode': 'book',
      'data-paper-display': 'double',
      'data-paper-hard-covers': '',
      'data-paper-auto-center': 'false',
      'data-paper-shading': 'false',
      'data-paper-tease': 'false',
      'data-paper-start-page': '3',
    }));
    expect(errors).toEqual([]);
    expect(options).toEqual({
      mode: 'book', display: 'double', hardCovers: true, autoCenter: false, shading: false,
      interactions: { tease: false }, startPage: 3,
    });
  });

  it('take the mode from code over the attribute', () => {
    const { options, errors } = parseDataOptions(dataset({ 'data-paper-display': 'single' }), 'book');
    expect(errors).toEqual([]);
    expect(options).toEqual({ display: 'single' });
  });

  it('report attributes the mode does not take', () => {
    const book = parseDataOptions(dataset({ 'data-paper-mode': 'book', 'data-paper-wrap': 'false', 'data-paper-back-grab': 'false', 'data-paper-clip': 'false' }));
    expect(book.options).toEqual({ mode: 'book' });
    expect(book.errors).toEqual([
      'data-paper-wrap only applies in stack mode',
      'data-paper-back-grab only applies in stack mode',
      'data-paper-clip only applies in stack mode',
    ]);
    const stack = parseDataOptions(dataset({ 'data-paper-display': 'double', 'data-paper-hard-covers': '' }));
    expect(stack.options).toEqual({});
    expect(stack.errors).toEqual(['data-paper-hard-covers only applies in book mode', 'data-paper-display only applies in book mode']);
  });

  it('reject a display it does not know', () => {
    expect(parseDataOptions(dataset({ 'data-paper-display': 'triple' }), 'book').errors)
      .toEqual(['data-paper-display="triple" is not "single", "double" or "auto"']);
  });

  it('write what parseDataOptions reads back', () => {
    const given = {
      mode: 'book' as const, display: 'single' as const, hardCovers: true, autoCenter: false, shading: false,
      startPage: 4, interactions: { wheel: false }, strings: { keys: 'Turn with the arrows' },
    };
    expect(parseDataOptions(dataset(dataAttributesOf(given)))).toEqual({ options: given, errors: [] });
  });

  it('merge code over attributes', () => {
    expect(mergeOptions({ mode: 'book', display: 'double', interactions: { drag: false } }, { mode: 'book', interactions: { wheel: false } }))
      .toEqual({ mode: 'book', display: 'double', interactions: { drag: false, wheel: false } });
  });

  it('announce one page or two', () => {
    const page = {} as HTMLElement;
    expect(defaultBookAnnounce({ index: 3, count: 10, title: 'Plates', page, spread: 2, pages: [3, 4] })).toBe('Pages 4 and 5 of 10: Plates');
    expect(defaultBookAnnounce({ index: 0, count: 10, title: undefined, page, spread: 0, pages: [0] })).toBe('Page 1 of 10');
  });
});
