import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INTERACTIONS, dataAttributesOf, defaultAnnounce, mergeOptions, parseDataOptions, resolveStackOptions,
} from '../src/options.js';

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
      'data-paper-mode': 'book',
      'data-paper-start-page': '-1',
      'data-paper-wrap': 'yes',
      'data-paper-reduced-motion': 'none',
    }));
    expect(options).toEqual({});
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('data-paper-mode="book"');
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
