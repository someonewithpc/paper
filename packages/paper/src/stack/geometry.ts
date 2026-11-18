// The fold's geometry, free of the DOM. Coordinates are page-local pixels unless a name says
// otherwise; a fold's "tip" is given relative to the page's bottom-right corner, so both of its
// components grow negative as the corner is folded up and over.

import type { Vec } from '../internal/vec.js';

// What a gesture reads off a sheet but never writes: the page's pixel size, the pin the paper is
// held at (relative to the bottom-right corner) and the resting crease's intercepts.
export type SheetMetrics = { w: number, h: number, pin: Vec, rest: Vec };

// What a release hands the glide that takes over: where the throw's speed would coast the fold's
// tip to, and that speed (px per ms). See coastTip.
export type Throw = { at: Vec, speed: number };

// Paper thrown at the stack keeps going after the hand lets go. The release measures the commit
// against where the tip would coast to on the speed it was let go at, THROW_COAST_MS of travel at
// the average speed of the drag's last THROW_WINDOW_MS, rather than where the tip stood at that
// instant, so a flick commits on the strength of the throw and a drag laid down gently still has
// to be carried past the threshold by hand. Averaging over a window rather than differencing the
// last two events keeps a single stuttering frame (or a pointer that jitters as the button comes
// up) from being read as the throw.
export const THROW_WINDOW_MS = 100;
export const THROW_COAST_MS = 120;

// The flap's transform carries the box's local (0,0) corner (the visible, grabbable tip) away
// from its untransformed position, landing here instead (relative to the sheet's bottom-right
// corner):
//   tipX = -2wh²/r²,  tipY = -2w²h/r²   (r² = w² + h²)
// The two only coincide on the w=h diagonal.
export const foldTipFromSize = (w: number, h: number): Vec => {
  const r2 = w * w + h * h;
  if (r2 === 0) return { x: 0, y: 0 };
  return { x: -2 * w * h * h / r2, y: -2 * w * w * h / r2 };
};

// Closed-form inverse of foldTipFromSize, so tracking the pointer never depends on the previous
// frame's fold size (that recursion would make dragging jittery). A tip below the bottom edge or
// right of the right edge yields a negative size, the crease's intercept sliding past the
// corner as the fold hangs off that edge, so only the near-zero singularities need guarding,
// which preserves sign continuity everywhere else.
export const foldSizeFromTip = (tx: number, ty: number): Vec => {
  const ntx = Math.abs(tx) < 0.01 ? -0.01 : tx;
  const nty = Math.abs(ty) < 0.01 ? -0.01 : ty;
  const d2 = ntx * ntx + nty * nty;
  return { x: -d2 / (2 * ntx), y: -d2 / (2 * nty) };
};

// The fully-folded tip: the page corner reflected across the resting crease, the farthest point
// the fold can carry it, out past the paper clip to the page's upper left. The resting crease
// passes through the pin, so this lies exactly on the pin's reach circle, and its fold's crease
// coincides with the folded-back corner cut every turned page wears, which makes it both where a
// forward flip finishes folding and where a back-drag starts from.
export const restSeed = ({ w, h, rest }: SheetMetrics): Vec => {
  const nl = Math.hypot(rest.x, rest.y);
  const nx = rest.y / nl, ny = rest.x / nl;
  const dist = nx * w + ny * h - rest.x * rest.y / nl;
  return { x: -2 * dist * nx, y: -2 * dist * ny };
};

export const polygonCentroid = (pts: readonly Vec[]): Vec => {
  let doubleArea = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const cross = a.x * b.y - b.x * a.y;
    doubleArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (doubleArea === 0) return pts[0] ?? { x: 0, y: 0 };
  return { x: cx / (3 * doubleArea), y: cy / (3 * doubleArea) };
};

// Single-edge Sutherland-Hodgman split (both sides in one pass) of a polygon by the line through
// mid with the given unit normal: kept is the side the normal points to, hole the other.
export const splitPolygon = (points: readonly Vec[], mid: Vec, normal: Vec) => {
  const signed = (p: Vec) => (p.x - mid.x) * normal.x + (p.y - mid.y) * normal.y;
  const kept: Vec[] = [];
  const hole: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!, next = points[(i + 1) % points.length]!;
    const sCur = signed(cur), sNext = signed(next);
    if (sCur >= 0) kept.push(cur);
    if (sCur <= 0) hole.push(cur);
    if ((sCur < 0) !== (sNext < 0) && sCur !== 0 && sNext !== 0) {
      const t = sCur / (sCur - sNext);
      const crossing = { x: cur.x + t * (next.x - cur.x), y: cur.y + t * (next.y - cur.y) };
      kept.push(crossing);
      hole.push(crossing);
    }
  }
  return { kept, hole };
};

// The page rectangle minus the back-fold's top-left corner cut (both cut vertices collapse to
// (0, 0) while the back-fold is 0, before any page has been turned). A turned page's cut and left
// edge stand `drift` over, the way the stylesheet cuts it at rest.
export const pagePentagon = (w: number, h: number, back: Vec, drift = 0): Vec[] => [
  { x: back.x + drift, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: drift, y: h }, { x: drift, y: back.y },
];

// The crease is the perpendicular bisector between the page corner (w, h) and the dragged tip
// (given relative to that corner), the unique line folding one onto the other. Splitting the
// page against it covers every fold the tip can express, including creases that wrap page
// corners or hang off the bottom or right edges, without the closed-form case analysis the idle
// CSS formula needs.
export const splitByCrease = (w: number, h: number, tip: Vec, back: Vec) => {
  const length = Math.hypot(tip.x, tip.y);
  const normal = { x: tip.x / length, y: tip.y / length };
  const mid = { x: w + tip.x / 2, y: h + tip.y / 2 };
  return {
    ...splitPolygon(pagePentagon(w, h, back), mid, normal),
    mid,
    angle: Math.atan2(normal.x, -normal.y),
  };
};

// Whether the crease has folded the given point over with the corner. The folded region is the
// corner's side of the crease, so this is the same signed-side convention as splitByCrease,
// negative meaning folded. Used both as live drag feedback and as the release's commit test.
export const pointFolded = (point: Vec, w: number, h: number, tip: Vec): boolean => {
  if (Math.hypot(tip.x, tip.y) < 0.5) return false;
  const mid = { x: w + tip.x / 2, y: h + tip.y / 2 };
  return (point.x - mid.x) * tip.x + (point.y - mid.y) * tip.y < 0;
};

// The point a forward drag's release measures the fold against: the flip commits once the fold
// has carried that point over, half way from the dragged corner in to the centre, so the gesture
// doesn't have to be hauled all the way past the middle.
export const commitPoint = (w: number, h: number): Vec => ({ x: w * 3 / 4, y: h * 3 / 4 });

export const track = <T extends { time: number }>(trail: T[], sample: T): void => {
  trail.push(sample);
  while (trail.length > 1 && sample.time - trail[0]!.time > THROW_WINDOW_MS) trail.shift();
};

// The stretch of the trail the throw is read off, everything within THROW_WINDOW_MS of the
// release, with the multiplier turning its travel into the coast beyond it. The window is
// measured back from the release, not from the last move: a hand that drags fast, comes to a stop
// and then lets go has thrown nothing, and its stale samples have to age out even though no move
// event came to trim them. Null when what's left can't express a speed (a gesture that never
// moved, or one that held still), and the release then measures where things stand.
export const throwWindow = <T extends { time: number }>(
  trail: readonly T[], time: number,
): { from: T, to: T, coast: number } | null => {
  const recent = trail.filter((sample) => time - sample.time <= THROW_WINDOW_MS);
  const from = recent[0];
  const to = recent[recent.length - 1];
  if (recent.length < 2 || !from || !to) return null;
  const span = to.time - from.time;
  return span > 0 ? { from, to, coast: THROW_COAST_MS / span } : null;
};

export const coastTip = (trail: readonly { tip: Vec, time: number }[], time: number): Throw | null => {
  const thrown = throwWindow(trail, time);
  if (!thrown) return null;
  const { from, to, coast } = thrown;
  const at = {
    x: to.tip.x + (to.tip.x - from.tip.x) * coast,
    y: to.tip.y + (to.tip.y - from.tip.y) * coast,
  };
  const speed = Math.hypot(at.x - to.tip.x, at.y - to.tip.y) / THROW_COAST_MS;
  // Paper thrown at the corner stops flat there rather than folding up the other way, and the
  // commit test reads a tip past the corner as folded again, from the wrong side, so a coast that
  // would carry the tip through it lands on it instead.
  return { at: at.x * to.tip.x + at.y * to.tip.y <= 0 ? { x: 0, y: 0 } : at, speed };
};

// The same, along a back-drag's pull: how far down the pull the release's speed would carry the
// pointer.
export const coastAlong = (trail: readonly { along: number, time: number }[], time: number): number | null => {
  const thrown = throwWindow(trail, time);
  if (!thrown) return null;
  const { from, to, coast } = thrown;
  return to.along + (to.along - from.along) * coast;
};

// The duration that sets an ease-out cubic off at exactly the speed the hand let go at: the ease
// opens at three times its average speed, so that's 3·distance/speed. Used as a ceiling on the
// unhurried glide rather than a replacement, so a throw only ever carries the paper away quicker.
export const coastMs = (distance: number, speed: number): number => (speed > 0 ? 3 * distance / speed : Infinity);

export const bezier = (x1: number, y1: number, x2: number, y2: number) => (x: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    const bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    if (bx < x) lo = t; else hi = t;
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
};

// The timing functions a transition here can carry, as the browser applies them: the keywords are
// the cubic beziers the spec defines them as.
const EASINGS: Record<string, (x: number) => number> = {
  linear: (x) => x,
  ease: bezier(0.25, 0.1, 0.25, 1),
  'ease-in': bezier(0.42, 0, 1, 1),
  'ease-out': bezier(0, 0, 0.58, 1),
  'ease-in-out': bezier(0.42, 0, 0.58, 1),
};

export const easingOf = (easing: string): ((x: number) => number) | undefined => {
  const named = EASINGS[easing];
  if (named) return named;
  const bez = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
  if (!bez?.[1]) return undefined;
  const values = bez[1].split(',').map(Number);
  const [x1, y1, x2, y2] = values;
  if (values.length !== 4 || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return undefined;
  return values.some(Number.isNaN) ? undefined : bezier(x1, y1, x2, y2);
};
