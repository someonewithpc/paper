import { describe, expect, it } from 'vitest';

import {
  applyAffine, backPageTransform, constrainTip, crease, gradientAt, hardAngle, isHardLeaf, pagesOfSpread, spreadCount,
  spreadOfPage, toBackPage, turnCommits, turnPath, turnRoles,
} from '../src/book/geometry.js';

const area = (pts: { x: number, y: number }[]) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
};

describe('spreads', () => {
  it('put the first page alone on the right in double display', () => {
    expect(spreadCount(10, 2)).toBe(6);
    expect(spreadCount(9, 2)).toBe(5);
    expect(pagesOfSpread(0, 10, 2)).toEqual([0]);
    expect(pagesOfSpread(1, 10, 2)).toEqual([1, 2]);
    expect(pagesOfSpread(5, 10, 2)).toEqual([9]);
    expect(pagesOfSpread(4, 9, 2)).toEqual([7, 8]);
  });

  it('are pages in single display', () => {
    expect(spreadCount(10, 1)).toBe(10);
    expect(pagesOfSpread(3, 10, 1)).toEqual([3]);
    expect(pagesOfSpread(10, 10, 1)).toEqual([]);
  });

  it('find the spread every page is on', () => {
    for (const across of [1, 2] as const) {
      for (let page = 0; page < 11; page++) {
        expect(pagesOfSpread(spreadOfPage(page, across), 11, across)).toContain(page);
      }
    }
  });
});

describe('turnRoles', () => {
  it('names the leaf and the pages around it', () => {
    expect(turnRoles(0, true, 10, 2)).toEqual({ leaf: 0, front: 0, back: 1, under: 2, left: undefined });
    expect(turnRoles(2, true, 10, 2)).toEqual({ leaf: 2, front: 4, back: 5, under: 6, left: 3 });
    expect(turnRoles(2, false, 10, 2)).toEqual({ leaf: 1, front: 2, back: 3, under: 4, left: 1 });
    expect(turnRoles(3, false, 10, 1)).toEqual({ leaf: 2, front: 2, back: undefined, under: 3, left: undefined });
  });

  it('has nothing to turn past either cover', () => {
    expect(turnRoles(0, false, 10, 2)).toBeNull();
    expect(turnRoles(5, true, 10, 2)).toBeNull();
    expect(turnRoles(9, true, 10, 1)).toBeNull();
  });

  it('marks the first and last leaves hard', () => {
    expect([0, 1, 2, 3, 4].map((leaf) => isHardLeaf(leaf, 10, 2))).toEqual([true, false, false, false, true]);
    expect(isHardLeaf(9, 10, 1)).toBe(true);
  });
});

describe('constrainTip', () => {
  const w = 300, h = 400;

  it('keeps the tip within a page width of the spine end on the corner edge', () => {
    for (const tip of [{ x: -500, y: 100 }, { x: 0, y: -200 }, { x: 290, y: 10 }]) {
      const held = constrainTip(tip, w, h, h);
      expect(Math.hypot(held.x, held.y - h)).toBeLessThanOrEqual(w + 1e-9);
    }
  });

  it('holds the corner to its own edge', () => {
    expect(constrainTip({ x: 100, y: 450 }, w, h, h).y).toBe(h);
    expect(constrainTip({ x: 100, y: -50 }, w, h, 0).y).toBe(0);
  });

  it('leaves a reachable tip where it is', () => {
    expect(constrainTip({ x: 100, y: 300 }, w, h, h)).toEqual({ x: 100, y: 300 });
  });
});

describe('crease', () => {
  const w = 300, h = 400;

  it('splits the page into what stays and what folds', () => {
    const cut = crease(w, h, { x: w, y: h }, { x: 50, y: 320 })!;
    expect(area(cut.kept) + area(cut.hole)).toBeCloseTo(w * h, 6);
    expect(cut.hole.length).toBeGreaterThanOrEqual(3);
  });

  it('is nothing while the corner lies at rest', () => {
    expect(crease(w, h, { x: w, y: h }, { x: w, y: h })).toBeNull();
  });
});

describe('backPageTransform', () => {
  const w = 300, h = 400;

  it('lays the back page flat in the left-hand slot once the leaf is over', () => {
    const cut = crease(w, h, { x: w, y: h }, { x: -w, y: h })!;
    const m = backPageTransform(w, cut.mid, cut.normal);
    for (const p of [{ x: 0, y: 0 }, { x: w, y: h }, { x: 120, y: 33 }]) {
      const q = applyAffine(m, p);
      expect(q.x).toBeCloseTo(p.x, 6);
      expect(q.y).toBeCloseTo(p.y, 6);
    }
  });

  it('turns the back page without mirroring it', () => {
    const cut = crease(w, h, { x: w, y: h }, { x: 40, y: 250 })!;
    const m = backPageTransform(w, cut.mid, cut.normal);
    expect(m.a * m.d - m.b * m.c).toBeCloseTo(1, 9);
  });

  it('puts the folded region where the fold carries the leaf', () => {
    const corner = { x: w, y: h };
    const tip = { x: 40, y: 250 };
    const cut = crease(w, h, corner, tip)!;
    const m = backPageTransform(w, cut.mid, cut.normal);
    // The leaf's corner is the back page's bottom-left, and it lands on the tip, in client terms a
    // page to the right of the back page's own origin.
    const [landed] = toBackPage([corner], w).map((p) => applyAffine(m, p));
    expect(landed!.x - w).toBeCloseTo(tip.x, 6);
    expect(landed!.y).toBeCloseTo(tip.y, 6);
  });
});

describe('turns', () => {
  it('swings a hard leaf from 0 to 180 degrees', () => {
    expect(hardAngle(300, 300)).toBeCloseTo(0);
    expect(hardAngle(0, 300)).toBeCloseTo(90);
    expect(hardAngle(-300, 300)).toBeCloseTo(180);
    expect(hardAngle(-900, 300)).toBeCloseTo(180);
  });

  it('plays from corner to corner, lifted half way', () => {
    expect(turnPath(0, 300, 400, 400)).toEqual({ x: 300, y: 400 });
    const end = turnPath(1, 300, 400, 400);
    expect(end.x).toBe(-300);
    expect(end.y).toBeCloseTo(400, 9);
    expect(turnPath(0.5, 300, 400, 400).y).toBeLessThan(400);
    expect(turnPath(0.5, 300, 400, 0).y).toBeGreaterThan(0);
  });

  it('commits a quarter of the way across, from either side', () => {
    expect(turnCommits(160, 300, true)).toBe(false);
    expect(turnCommits(140, 300, true)).toBe(true);
    expect(turnCommits(-160, 300, false)).toBe(false);
    expect(turnCommits(-140, 300, false)).toBe(true);
  });
});

describe('gradientAt', () => {
  it('puts a line through the gradient start at 0', () => {
    expect(gradientAt(200, 100, { x: 0, y: 50 }, { x: 1, y: 0 })).toEqual({ angle: 90, at: 0 });
    expect(gradientAt(200, 100, { x: 50, y: 50 }, { x: 1, y: 0 }).at).toBeCloseTo(50);
    expect(gradientAt(200, 100, { x: 100, y: 100 }, { x: 0, y: -1 }).angle).toBeCloseTo(0);
  });
});
