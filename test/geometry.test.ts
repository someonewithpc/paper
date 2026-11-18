import { describe, expect, it } from 'vitest';

import {
  coastTip, commitPoint, easingOf, foldSizeFromTip, foldTipFromSize, pagePentagon, pointFolded,
  polygonCentroid, restSeed, splitByCrease, splitPolygon, THROW_COAST_MS,
} from '../src/stack/geometry.js';

const area = (pts: { x: number, y: number }[]) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
};

describe('fold size and tip', () => {
  it('are inverses of each other', () => {
    for (const [w, h] of [[75, 37], [200, 120], [12, 300], [500, 500]] as const) {
      const tip = foldTipFromSize(w, h);
      const size = foldSizeFromTip(tip.x, tip.y);
      expect(size.x).toBeCloseTo(w, 6);
      expect(size.y).toBeCloseTo(h, 6);
    }
  });

  it('meet at the corner on the diagonal', () => {
    const tip = foldTipFromSize(100, 100);
    expect(tip.x).toBeCloseTo(-100);
    expect(tip.y).toBeCloseTo(-100);
  });

  it('keeps a zero fold at the corner', () => {
    expect(foldTipFromSize(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('guards the singularity at a tip on an edge', () => {
    const size = foldSizeFromTip(0, -50);
    expect(Number.isFinite(size.x)).toBe(true);
    expect(Number.isFinite(size.y)).toBe(true);
  });
});

describe('restSeed', () => {
  it('lies on the pin reach circle and reflects the corner across the resting crease', () => {
    const w = 900, h = 450;
    const rest = { x: 36, y: 72 };
    const pin = { x: rest.x / 2 - w, y: rest.y / 2 - h };
    const seed = restSeed({ w, h, pin, rest });
    expect(Math.hypot(seed.x - pin.x, seed.y - pin.y)).toBeCloseTo(Math.hypot(pin.x, pin.y), 6);
    // The midpoint between the corner and the folded tip lies on the crease x/rest.x + y/rest.y = 1.
    const mid = { x: w + seed.x / 2, y: h + seed.y / 2 };
    expect(mid.x / rest.x + mid.y / rest.y).toBeCloseTo(1, 6);
  });
});

describe('splitPolygon', () => {
  it('keeps the area of the page across both sides', () => {
    const page = pagePentagon(800, 400, { x: 30, y: 60 });
    const { kept, hole } = splitPolygon(page, { x: 700, y: 350 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
    expect(area(kept) + area(hole)).toBeCloseTo(area(page), 6);
  });

  it('puts the corner on the hole side of a fold', () => {
    const { hole, mid } = splitByCrease(800, 400, foldTipFromSize(75, 37), { x: 0, y: 0 });
    expect(hole).toContainEqual({ x: 800, y: 400 });
    expect(mid.x).toBeLessThan(800);
  });
});

describe('pointFolded', () => {
  it('commits once the fold carries the point three quarters in', () => {
    const w = 800, h = 400;
    const point = commitPoint(w, h);
    expect(pointFolded(point, w, h, foldTipFromSize(75, 37))).toBe(false);
    expect(pointFolded(point, w, h, { x: -w, y: -h })).toBe(true);
  });

  it('never counts a fold that has not left the corner', () => {
    expect(pointFolded({ x: 799, y: 399 }, 800, 400, { x: 0.1, y: 0.1 })).toBe(false);
  });
});

describe('polygonCentroid', () => {
  it('finds the middle of a square', () => {
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])).toEqual({ x: 1, y: 1 });
  });
});

describe('coastTip', () => {
  it('coasts on the average speed of the last 100 ms', () => {
    const thrown = coastTip([{ tip: { x: -10, y: -10 }, time: 0 }, { tip: { x: -60, y: -10 }, time: 50 }], 60);
    expect(thrown?.speed).toBeCloseTo(1, 6);
    expect(thrown?.at.x).toBeCloseTo(-60 - THROW_COAST_MS, 6);
  });

  it('has nothing to throw once the hand held still', () => {
    expect(coastTip([{ tip: { x: -10, y: -10 }, time: 0 }, { tip: { x: -60, y: -10 }, time: 50 }], 500)).toBeNull();
  });

  it('stops a throw through the corner at the corner', () => {
    const thrown = coastTip([{ tip: { x: -100, y: -50 }, time: 0 }, { tip: { x: -20, y: -10 }, time: 20 }], 20);
    expect(thrown?.at).toEqual({ x: 0, y: 0 });
  });
});

describe('easingOf', () => {
  it('knows the keywords and cubic-bezier()', () => {
    expect(easingOf('linear')?.(0.3)).toBe(0.3);
    expect(easingOf('ease-in-out')?.(0.5)).toBeCloseTo(0.5, 4);
    expect(easingOf('cubic-bezier(0, 0, 1, 1)')?.(0.25)).toBeCloseTo(0.25, 4);
    expect(easingOf('steps(4)')).toBeUndefined();
    expect(easingOf('cubic-bezier(0, 0, 1)')).toBeUndefined();
  });
});
