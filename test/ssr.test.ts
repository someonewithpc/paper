import { describe, expect, it } from 'vitest';

describe('on a server', () => {
  it('imports both entries without a DOM', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    const core = await import('../packages/paper/src/index.js');
    const element = await import('../packages/paper/src/element.js');
    expect(typeof core.renderStack).toBe('function');
    expect(typeof core.renderBook).toBe('function');
    expect(typeof element.definePaperStack).toBe('function');
    expect(typeof element.definePaperBook).toBe('function');
  });

  it('refuses to enhance without a DOM', async () => {
    const { createPaper } = await import('../packages/paper/src/index.js');
    expect(() => createPaper({} as HTMLElement)).toThrow(/needs a DOM/);
  });
});
