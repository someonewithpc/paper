import { describe, expect, it, vi } from 'vitest';

import { liveOptions, markupKey, markupOf, optionsKey, parseStyle, splitProps } from '../packages/paper/src/adapters/shared.js';

describe('splitProps', () => {
  it('keeps the mode\'s options apart from the rest and drops undefined ones', () => {
    const { options, rest } = splitProps('stack', { wrap: false, startPage: undefined, className: 'x', display: 'single' });
    expect(options).toEqual({ wrap: false });
    expect(rest).toEqual({ className: 'x', display: 'single' });
    expect(splitProps('book', { display: 'single', wrap: false }).options).toEqual({ display: 'single' });
  });
});

describe('optionsKey', () => {
  it('ignores new callbacks and counts announce and pageTitle by kind', () => {
    const base = optionsKey({ wrap: true, onChange: () => 1 });
    expect(optionsKey({ wrap: true, onChange: () => 2 })).toBe(base);
    expect(optionsKey({ wrap: true })).toBe(base);
    expect(optionsKey({ wrap: false })).not.toBe(base);
    expect(optionsKey({ announce: () => 'a' })).toBe(optionsKey({ announce: () => 'b' }));
    expect(optionsKey({ announce: false })).not.toBe(optionsKey({ announce: () => 'a' }));
    expect(optionsKey({ interactions: { wheel: false } })).not.toBe(optionsKey({ interactions: {} }));
  });

  it('tells resize-hold sources apart by identity', () => {
    const source = { isHeld: () => false, subscribe: () => () => {} };
    expect(optionsKey({ resizeHold: source })).toBe(optionsKey({ resizeHold: source }));
    expect(optionsKey({ resizeHold: source })).not.toBe(optionsKey({ resizeHold: { ...source } }));
  });
});

describe('liveOptions', () => {
  it('calls the callback the latest props hold', () => {
    const first = vi.fn();
    const second = vi.fn();
    let latest: { onChange?: (detail: unknown) => void, announce?: (detail: unknown) => string } = { onChange: first, announce: () => 'one' };
    const live = liveOptions(latest, () => latest);
    latest = { onChange: second, announce: () => 'two' };
    live.onChange!({ index: 1 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ index: 1 });
    expect(live.announce!({})).toBe('two');
  });

  it('leaves announce false alone', () => {
    expect(liveOptions({ announce: false as const }, () => ({ announce: false as const })).announce).toBe(false);
  });
});

describe('markupKey', () => {
  it('changes with what the markup writes, not with what only the script reads', () => {
    const key = (options: object) => markupKey(markupOf('stack', { pageCount: 3 }, options));
    expect(key({ onChange: () => {} })).toBe(key({}));
    expect(key({ startPage: 1 })).not.toBe(key({}));
    expect(key({ decorations: { hint: false } })).not.toBe(key({}));
    expect(markupKey(markupOf('stack', { pageCount: 4 }, {}))).not.toBe(key({}));
  });
});

describe('parseStyle', () => {
  it('splits declarations outside quotes and brackets', () => {
    expect(parseStyle('--a: 1; --b: url("data:image/svg+xml;utf8,<svg/>"); color: red;')).toEqual([
      ['--a', '1'],
      ['--b', 'url("data:image/svg+xml;utf8,<svg/>")'],
      ['color', 'red'],
    ]);
    expect(parseStyle("--c: 'a;b'; --d: image-set(url(x;y) 1x)")).toEqual([['--c', "'a;b'"], ['--d', 'image-set(url(x;y) 1x)']]);
    expect(parseStyle('')).toEqual([]);
  });
});
