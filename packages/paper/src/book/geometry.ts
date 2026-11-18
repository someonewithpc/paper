// The book's geometry, free of the DOM. A turn is drawn in the frame of the leaf's front page, the
// right-hand page of a spread: x runs from the spine (0) to the fore-edge (w), y from the top (0)
// to the bottom (h). A fold's tip is where the grabbed corner has been carried to in that frame, so
// a leaf lying flat on the left has its corner at (-w, y).

import type { Vec } from '../internal/vec.js';
import { splitPolygon } from '../stack/geometry.js';

/** Pages side by side: 1 in single display, 2 in double. */
export type Across = 1 | 2;

// In double display spread 0 is the first page alone on the right, and spread s > 0 is pages
// 2s - 1 (left) and 2s (right). The last spread may hold a left page alone.
export const spreadCount = (count: number, across: Across): number =>
  count <= 0 ? 0 : across === 1 ? count : Math.floor(count / 2) + 1;

export const spreadOfPage = (page: number, across: Across): number =>
  across === 1 ? page : page === 0 ? 0 : Math.floor((page + 1) / 2);

export const pagesOfSpread = (spread: number, count: number, across: Across): number[] => {
  if (across === 1) return spread >= 0 && spread < count ? [spread] : [];
  if (spread === 0) return count > 0 ? [0] : [];
  return [2 * spread - 1, 2 * spread].filter((page) => page < count);
};

/** Whether a DOM index is a right-hand page in double display. */
export const isRightPage = (page: number): boolean => page % 2 === 0;

/**
 * The pages a turn moves, by role. `front` is the leaf's front page, drawn in the right-hand slot
 * and folded away; `back` is the leaf's other side, drawn in the left-hand slot as the flap (double
 * display only); `under` is the right-hand page the fold uncovers, and `left` the left-hand page
 * the flap comes down on. A role with no page is undefined. Null when there is no leaf to turn.
 */
export interface TurnRoles {
  leaf: number;
  front: number;
  back: number | undefined;
  under: number | undefined;
  left: number | undefined;
}

export const turnRoles = (spread: number, forward: boolean, count: number, across: Across): TurnRoles | null => {
  const spreads = spreadCount(count, across);
  const target = spread + (forward ? 1 : -1);
  if (target < 0 || target >= spreads) return null;
  const leaf = forward ? spread : spread - 1;
  const exists = (page: number) => (page >= 0 && page < count ? page : undefined);
  if (across === 1) return { leaf, front: leaf, back: undefined, under: exists(leaf + 1), left: undefined };
  const front = 2 * leaf;
  if (front >= count) return null;
  return { leaf, front, back: exists(front + 1), under: exists(front + 2), left: exists(front - 1) };
};

/** The leaves with stiff boards when the covers are hard: the first and the last. */
export const isHardLeaf = (leaf: number, count: number, across: Across): boolean => {
  const leaves = across === 1 ? count : Math.ceil(count / 2);
  return leaf === 0 || leaf === leaves - 1;
};

/**
 * Keeps a dragged tip where paper bound at the spine can take it. A point stays on the spine side
 * of the crease while it is no nearer the corner than the tip is, so the tip has to stay within w
 * of the spine's end on the corner's own edge. Past that edge the corner would fold under the
 * book, so it is held to the edge's line, and that also keeps it within the page's diagonal of the
 * spine's other end.
 */
export const constrainTip = (tip: Vec, w: number, h: number, cornerY: number): Vec => {
  const p = { x: tip.x, y: cornerY === 0 ? Math.max(tip.y, 0) : Math.min(tip.y, h) };
  const dx = p.x, dy = p.y - cornerY;
  const d = Math.hypot(dx, dy);
  return d <= w || d === 0 ? p : { x: dx * w / d, y: cornerY + dy * w / d };
};

export interface Crease {
  /** The front page's part that stays on the spine side. */
  kept: Vec[];
  /** The part that has folded over, in the front page's frame before the fold. */
  hole: Vec[];
  /** A point on the crease. */
  mid: Vec;
  /** Unit normal of the crease, pointing away from the corner. */
  normal: Vec;
}

// The crease is the perpendicular bisector of the corner and the tip, the line that folds one onto
// the other, as in the stack.
export const crease = (w: number, h: number, corner: Vec, tip: Vec): Crease | null => {
  const dx = tip.x - corner.x, dy = tip.y - corner.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return null;
  const normal = { x: dx / length, y: dy / length };
  const mid = { x: (corner.x + tip.x) / 2, y: (corner.y + tip.y) / 2 };
  const page = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const { kept, hole } = splitPolygon(page, mid, normal);
  return { kept, hole, mid, normal };
};

export const reflect = (p: Vec, mid: Vec, normal: Vec): Vec => {
  const d = (p.x - mid.x) * normal.x + (p.y - mid.y) * normal.y;
  return { x: p.x - 2 * d * normal.x, y: p.y - 2 * d * normal.y };
};

export type Affine = { a: number, b: number, c: number, d: number, e: number, f: number };

/** The affine map that sends (0,0), (1,0) and (0,1) where `map` does. */
export const affineOf = (map: (p: Vec) => Vec): Affine => {
  const o = map({ x: 0, y: 0 });
  const x = map({ x: 1, y: 0 });
  const y = map({ x: 0, y: 1 });
  return { a: x.x - o.x, b: x.y - o.y, c: y.x - o.x, d: y.y - o.y, e: o.x, f: o.y };
};

export const applyAffine = (m: Affine, p: Vec): Vec => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

export const matrixCss = (m: Affine): string => `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;

/**
 * Where the back page goes while the leaf is folded. The back page sits in the left-hand slot,
 * its own (0,0) at the front frame's (-w, 0). A point of the leaf at front-frame x shows the back
 * page's u = w - x, and the fold carries that point across the crease, so the back page's point
 * (u, y) lands at the reflection of (w - u, y). Mirror then reflection: a rotation, so the back
 * page reads the right way round. In the back page's own coordinates, with a transform origin of 0 0.
 */
export const backPageTransform = (w: number, mid: Vec, normal: Vec): Affine =>
  affineOf((p) => {
    const landed = reflect({ x: w - p.x, y: p.y }, mid, normal);
    return { x: landed.x + w, y: landed.y };
  });

/** The front frame's region, in the back page's coordinates. */
export const toBackPage = (points: readonly Vec[], w: number): Vec[] => points.map((p) => ({ x: w - p.x, y: p.y }));

/** The fold's reflection as a transform of something drawn in the front frame. */
export const flapTransform = (mid: Vec, normal: Vec): Affine => affineOf((p) => reflect(p, mid, normal));

/**
 * A stiff board's swing for a corner at front-frame `x`: 0 degrees flat on the right, 180 flat on
 * the left, the board standing up from the spine at 90.
 */
export const hardAngle = (x: number, w: number): number =>
  Math.acos(Math.min(Math.max(x / w, -1), 1)) * 180 / Math.PI;

// How far a turn the book plays by itself lifts the corner off its edge at half way, as a share of
// the page's height, so the crease runs aslant the way a hand turns a page.
export const TURN_LIFT = 0.18;

/** A played turn's tip at progress `u`, from the corner on the right (0) to the left (1). */
export const turnPath = (u: number, w: number, h: number, cornerY: number): Vec => {
  const lift = TURN_LIFT * h * Math.sin(Math.PI * u);
  return { x: w - 2 * w * u, y: cornerY === 0 ? lift : h - lift };
};

/**
 * Whether a released turn goes over. A leaf picked up on the right goes over once its corner has
 * been carried a quarter of the way across, past the middle of the right-hand page, and one picked
 * up on the left the same distance back the other way.
 */
export const turnCommits = (x: number, w: number, fromRight: boolean): boolean =>
  fromRight ? x < w / 2 : x > -w / 2;

/**
 * A `linear-gradient` that starts at a line and runs along `toward` (a unit vector) across a w×h
 * box: its angle in degrees, and the length along the gradient line where the line falls. CSS
 * runs the gradient line through the box's centre, as long as the box's extent in that direction.
 */
export const gradientAt = (w: number, h: number, through: Vec, toward: Vec): { angle: number, at: number } => {
  const angle = Math.atan2(toward.x, -toward.y);
  const length = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle));
  const start = { x: w / 2 - toward.x * length / 2, y: h / 2 - toward.y * length / 2 };
  return { angle: angle * 180 / Math.PI, at: (through.x - start.x) * toward.x + (through.y - start.y) * toward.y };
};
