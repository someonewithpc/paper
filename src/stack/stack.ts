// Stack mode: the draggable dog-ear on the front page. A drag released with the page's centre
// folded over flips the page onto the back of the stack, and grabbing the folded-back top-left
// corner runs the same gesture in reverse to bring the previous page back. A sideways wheel, a
// swipe and the arrow keys drive the same gesture. The custom properties written here
// (--paper-fold-x, --paper-page-index, --paper-flip-progress and the rest) are typed by the
// @property rules in the stylesheet.

import { afterPaint } from '../internal/afterPaint.js';
import { noResizeHold, windowResizeHold } from '../internal/resizeHold.js';
import { rotateVec, type Vec } from '../internal/vec.js';
import { pageIndexOf } from '../markup.js';
import type { ResolvedStackOptions } from '../options.js';
import type {
  PaperDirection, PaperEventMap, PaperState, PaperTurnDetail, ResizeHoldSource,
} from '../types.js';
import {
  coastAlong, coastMs, coastTip, commitPoint, foldSizeFromTip, foldTipFromSize, pagePentagon,
  pointFolded, polygonCentroid, restSeed, splitByCrease, splitPolygon, track, type SheetMetrics,
  type Throw,
} from './geometry.js';
import { currentBackFoldSize, currentLanding, lengthsOf, stirLanding } from './landing.js';

// What drives a fold: somewhere the gesture is pulling towards, at the moment it got there. A
// pointer is one (a PointerEvent satisfies this as it stands); a horizontal scroll walks a point of
// its own along the fold's line (see the wheel handler), so both run the same machinery.
type Pull = { clientX: number, clientY: number, timeStamp: number };

type FoldGesture = {
  pointerId: number;
  // Scaled pointer minus tip at gesture start, in tip-local screen coordinates. It rotates with
  // the fold as it's dragged when the tip itself is grabbed, see onFoldDrag.
  offset: Vec;
  // atan2(fold-y, fold-x) at gesture start, to know how far that offset has rotated.
  theta: number;
  // The fold size the last frame solved for. The drag needs the previous frame's size (for the
  // rotating-offset correction) and it's a value the drag itself computes: carrying it here lets a
  // frame get through without asking computed style for the numbers the frame before just wrote,
  // a read-after-write that forces the browser to re-resolve style mid-frame.
  size: Vec;
  // Pointer-to-tip amplification. 1 when the tip corner itself is grabbed (the forward fold); 2
  // when the folded-back crease corner is (the back gesture), since moving a crease by d moves the
  // corner reflected across it by 2d.
  gain: number;
  // Set when the drag gives up (pointer strayed past the grace margin): the release then settles
  // back rather than considering a flip.
  canceled: boolean;
  // Client coordinates the gesture grabbed at, for a forward drag's own outward-travel check.
  grabAt: Vec;
  // The direction the tip lies in while the page is folded over, fixed when a back-drag's approach
  // hands the gesture on. The tip may run all the way back to the page corner along it but no
  // further: paper unfolds flat, it doesn't keep going and fold the other way.
  unfoldFrom: Vec | null;
  // Present while a back-drag is still in its approach phase: the previous page folding up behind
  // the stack, before it has come over the clip (see onBackApproach).
  approach: {
    // The fully-folded tip: the page corner reflected across the resting crease
    seed: Vec;
    // The pull that folds the page fully over, ending this phase (see BACK_APPROACH_PULL)
    pull: number;
    // 0 lying flat behind the stack, 1 fully folded over
    s: number;
    // Where the page's corner currently lies (page coords)
    t: Vec;
  } | null;
  // Present for a whole back-drag, both phases. Bringing the page over the clip and unfolding it
  // flat in front are one drag in one direction, so one measure spans them: the pointer's travel
  // from the grab along the pull (the resting crease's normal), which the commit is read off.
  back: {
    origin: Vec;
    dir: Vec;
    trail: { along: number, time: number }[];
  } | null;
  // The tip's recent positions, each with the event time that put it there.
  trail: { tip: Vec, time: number }[];
};

// How far past the paper's reach (see the pin check in onFoldDrag) the pointer may stray while the
// fold holds at its limit, before the drag lets go entirely.
const FOLD_CANCEL_GRACE = 48;

// How far a forward drag's pointer may travel outward (down and right, away from the page) before
// the drag gives up. A hand pulling the wrong way from the start runs the tip toward the near-zero
// singularity in foldSizeFromTip long before the pin check sees it, so this reads the pointer's
// own travel from the grab. The resting dog-ear is a fixed size, not a share of the page, so the
// singularity sits the same few pixels out from the grab on a phone as on a desktop sheet, which
// is why this is a pixel count: 2px out is barely off the resting size, 8px is a third again as
// big, and past 12px the size rockets past 300px and flips negative.
const FOLD_CANCEL_OUTWARD_MARGIN = 10;

// Outside a drag, a pointer within BACK_TEASE_RADIUS of the front page's top-left corner rotates
// the hindmost page out from behind the stack, up to BACK_TEASE_PEEK degrees at the corner.
const BACK_TEASE_RADIUS = 160;
const BACK_TEASE_PEEK = 5;

// Pointer travel along the pull that folds the previous page fully over the clip during a
// back-drag's approach, as a fraction of the fold's own reach, so the corner always travels the
// same multiple of the pointer. A fixed pixel pull made wide pages carry the corner nearly twice
// as far per pixel as portrait ones.
const BACK_APPROACH_PULL = 0.105;

// What a back-drag has to be pulled to commit: the pointer a quarter of the way to the page's
// opposite corner, measured from the grab along the pull. The unfold moves the corner at twice the
// pointer, so a commit staked on the fold's geometry would take a drag half way to the corner. A
// quarter of the diagonal sits a little inside where a forward drag's own commit falls, so
// fetching a page back asks slightly less of the hand than sending one away.
const BACK_COMMIT_REACH = 0.25;

// What a scrolled pixel is worth against a dragged one.
const SCROLL_GAIN = 1;

// A swipe walks a point along the gesture's line, and the forward fold moves its tip with the
// point while a back-drag moves the corner at twice that. Both commit once the paper has carried
// its corner half the page's diagonal, so at equal gains a swipe turned a page back on half the
// travel it took to send one away. The forward swipe is walked out at the back-drag's gain so a
// swiped pixel buys the same page turn either way.
const SWIPE_AWAY_GAIN = 2;

// A scroll has no letting go to end on, so the gesture ends once the wheel has been quiet, for a
// few times the gap between the events actually arriving, bounded either side. Trackpad momentum
// keeps events coming after the fingers lift and that is travel like any other.
const SCROLL_IDLE_GAPS = 4;
const SCROLL_IDLE_MIN = 140;
const SCROLL_IDLE_MAX = 800;

// A wheel with detents hands its travel over in lumps, so the fold eases after the scrolling on a
// time constant taken from the same pace: a fraction of the interval the events arrive at.
const SCROLL_SMOOTH_GAP = 0.6;
const SCROLL_SMOOTH_MIN = 20;
const SCROLL_SMOOTH_MAX = 150;

// How far a finger has to run sideways before the swipe is taken as one.
const SWIPE_START = 8;

// A glide to a target runs its base time plus one ms per GLIDE_PX_PER_MS of travel, at most
// GLIDE_EXTRA_MS over the base and at least GLIDE_MIN_MS.
const GLIDE_PX_PER_MS = 3;
const GLIDE_EXTRA_MS = 500;
const GLIDE_MIN_MS = 120;

const LANDING_MS = 400;
const LANDING_MIN_MS = 100;

// A flip takes FLIP_BASE_MS plus one ms per two px of tip travel, between FLIP_MIN_MS and FLIP_MAX_MS.
const FLIP_BASE_MS = 300;
const FLIP_MAX_MS = 1400;
const FLIP_MIN_MS = 200;

const WHEEL_STALL_CAP_MS = 100;
const WHEEL_LINE_PX = 16;

const CHROME = '.paper-fold, .paper-back-grab, .paper-clip, .paper-clip-under, .paper-flip-hint';
const FOLD_REVEAL_END = { x: 'var(--paper-fold-rest-x)', y: 'var(--paper-fold-rest-y)' };
const REVEAL = 'paper-fold-reveal';
const PULSES = ['paper-pulse-page', 'paper-pulse-flap', 'paper-pulse-shade'];
const LANDING = 'paper-fold--landing';
const STAND_IN = 'paper-fold--stand-in';
const HIDDEN_CLIP = 'polygon(0px 0px, 0px 0px, 0px 0px)';

// What one stack needs from its options and its controller.
type StackContext = {
  options: ResolvedStackOptions;
  hold: ResizeHoldSource;
  restPx: Vec | null;
  announced: HTMLElement | undefined;
  lastFront: number;
  lastSettled: number;
  turning: PaperTurnDetail | null;
  settleWaiters: (() => void)[];
  status: HTMLElement | null;
};

const contexts = new WeakMap<HTMLElement, StackContext>();
const ctxOf = (stack: HTMLElement): StackContext => contexts.get(stack)!;

let reducedMotionQuery: MediaQueryList | undefined;
const systemReducesMotion = (): boolean =>
  (reducedMotionQuery ??= matchMedia('(prefers-reduced-motion: reduce)')).matches;

// Under reduced motion every glide, landing and turn below settles on its next frame. A drag still
// follows the hand, since that motion is the reader's own.
const glideMs = (stack: HTMLElement, ms: number): number =>
  (ctxOf(stack).options.reducedMotion === 'reduce' || systemReducesMotion() ? 1 : ms);

const emit = <K extends keyof PaperEventMap>(
  stack: HTMLElement, type: K, detail: PaperEventMap[K]['detail'],
): void => {
  stack.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
};

// The dog-ear's resting size in px, read from --paper-fold-rest-x/-y, which are registered as
// lengths so computed style hands them over in px.
const restSizePx = (sheet: HTMLElement): Vec => {
  const ctx = ctxOf(sheet.parentElement!);
  if (!ctx.restPx) {
    const [x = 0, y = 0] = lengthsOf(sheet, '--paper-fold-rest-x', '--paper-fold-rest-y');
    ctx.restPx = { x, y };
  }
  return ctx.restPx;
};

// Reading a custom property means resolving style, and resolving style after something has been
// written to the element means the browser has to redo it there and then. A frame that reads,
// writes, reads, writes pays for that flush every time it turns around; one that takes all its
// readings first pays once. So every read goes through lengthsOf, which takes one computed-style
// object and pulls every value it needs off it, and the callers are arranged to read before they
// write anything.

// The size the reader sees. At rest the pulse grows the dog-ear without touching --paper-fold-x/-y
// (see the pulse keyframes), and its cast shadow's scale is exactly that growth, so a hand that
// takes the fold mid-pulse takes it at the size it was drawn at.
const currentFoldSize = (sheet: HTMLElement): Vec => {
  const [x = 0, y = 0] = lengthsOf(sheet, '--paper-fold-x', '--paper-fold-y');
  const clip = sheet.querySelector<HTMLElement>(':scope > .paper-clip');
  if (!clip) return { x, y };
  const [sx = NaN, sy = sx] = getComputedStyle(clip, '::after').scale.split(' ').map(parseFloat);
  return Number.isNaN(sx) ? { x, y } : { x: x * sx, y: y * sy };
};

// The size last written to a sheet's --paper-fold-x/-y, while that is also the size on screen:
// from a drag's first move, which cancels every animation on the sheet, to the moment the resting
// dog-ear takes over again. A glide, a release and a flip all start from the size the frame before
// them wrote, so they take it from here and not from computed style. A sheet with no entry is at
// rest, its reveal or pulse deciding the size, and only a read can say where that stands.
const writtenFoldSizes = new WeakMap<HTMLElement, Vec>();

const writeFoldSize = (sheet: HTMLElement, size: Vec): void => {
  writtenFoldSizes.set(sheet, size);
  sheet.style.setProperty('--paper-fold-x', `${size.x}px`);
  sheet.style.setProperty('--paper-fold-y', `${size.y}px`);
};

const forgetFoldSize = (sheet: HTMLElement): void => {
  writtenFoldSizes.delete(sheet);
};

const foldSizeOf = (sheet: HTMLElement): Vec => writtenFoldSizes.get(sheet) ?? currentFoldSize(sheet);

// The page's pixel size, the pin and the resting crease's intercepts are fixed by the stylesheet
// in em, and the first is measured by the ResizeObserver that feeds --paper-page-w/-h, so none of
// them can move during a gesture. They are taken the first time something asks after the page
// resizes, and again as each gesture starts; the frames in between just read this.
const metrics = new WeakMap<HTMLElement, SheetMetrics>();
const observedSizes = new WeakMap<HTMLElement, { width: number, height: number }>();

// `size` comes from the ResizeObserver entry when there is one, so the metrics and the custom
// properties can't disagree about how big the page is.
const sampleMetrics = (sheet: HTMLElement, size?: { width: number, height: number }): SheetMetrics => {
  const [pageW = 0, pageH = 0, pinX = 0, pinY = 0, restX = 0, restY = 0] = lengthsOf(
    sheet, '--paper-page-w', '--paper-page-h', '--paper-pin-x', '--paper-pin-y',
    '--paper-fold-back-rest-x', '--paper-fold-back-rest-y',
  );
  const w = size ? size.width : pageW;
  const h = size ? size.height : pageH;
  const sampled = { w, h, pin: { x: pinX - w, y: pinY - h }, rest: { x: restX, y: restY } };
  metrics.set(sheet, sampled);
  return sampled;
};

const metricsOf = (sheet: HTMLElement): SheetMetrics =>
  metrics.get(sheet) ?? sampleMetrics(sheet, observedSizes.get(sheet));

// The flip hint that pairs with each fold flap: one of each per stack, moving between pages
// together, so the pairing never changes and renderFold needn't query it every frame.
const hintOf = new WeakMap<HTMLElement, HTMLElement>();

// The page content: the sibling whose clip-path cuts the holes (the flap, clip, grab handle and
// hint ride above that cut).
const sectionOf = (sheet: HTMLElement): HTMLElement =>
  sheet.querySelector<HTMLElement>(`:scope > :not(${CHROME})`)!;

// The paper a page is printed on, as its wrapper's inline --paper-surface says, read off the
// style attribute and not off computed style, so naming it costs no style resolution. A page with
// none takes the stack's default paper.
const paperOf = (sheet: HTMLElement): string =>
  sheet.style.getPropertyValue('--paper-surface').trim() || 'var(--paper-default-surface)';

const pageIndex = (page: HTMLElement): number => parseFloat(page.style.getPropertyValue('--paper-page-index'));

const pagesOf = (stack: HTMLElement): HTMLElement[] => [...stack.children] as HTMLElement[];

const frontIndexOf = (stack: HTMLElement): number => pagesOf(stack).findIndex((page) => pageIndex(page) === 1);

const turnedOf = (stack: HTMLElement): number => {
  const first = pagesOf(stack)[0];
  return !first || pageIndex(first) === 1 ? 0 : stack.children.length - pageIndex(first) + 1;
};

const canTurnForward = (stack: HTMLElement): boolean =>
  stack.childElementCount > 1 && (ctxOf(stack).options.wrap || turnedOf(stack) < stack.childElementCount - 1);

const polygonClip = (pts: readonly Vec[]) => `polygon(${pts.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;

// Closes the fan by one page for the duration of a drag (--paper-flip-progress on the stack),
// squaring the front page and the one behind it up with each other. Every page wears the same
// folded-back top-left corner, so any splay between those two fans their two cuts apart and opens
// a gap right where the drag has the eye.
const holdUnsplayed = (sheet: HTMLElement): void => {
  sheet.parentElement!.style.setProperty('--paper-flip-progress', '1');
};

// Hands the page and its flap back to the stylesheet's own rules, dropping everything renderFold
// drives inline, the hint's position included. Those are page-local pixels, and only a drag frame
// recomputes them, so left behind they pin the hint (invisible at rest, but still laid out) where
// the corner of a wider page used to be. Narrow the window after a gesture and it stands off the
// page's right edge as scrollable overflow; a tablet answers overflow by widening the layout
// viewport, and every `position: fixed` box on the page rides along.
const clearFoldRender = (section: HTMLElement, fold: HTMLElement): void => {
  section.style.clipPath = '';
  section.style.transform = '';
  section.style.transformOrigin = '';
  fold.style.clipPath = '';
  fold.style.transform = '';
  fold.style.transformOrigin = '';
  clearLandingShade(fold);
  const hint = hintOf.get(fold);
  if (hint) {
    hint.style.removeProperty('--paper-hint-x');
    hint.style.removeProperty('--paper-hint-y');
  }
};

// The landing's second crease, handed to the flap's shading (--paper-land-x/-y) in
// --paper-fold-x/-y's terms: in the flap's own coordinates, before its reflection across the first
// crease, it is the corner fold whose tip is the corner's target pulled back through that
// reflection. The class puts the layer in the flap's background list for the landing's length.
const landingShade = (fold: HTMLElement, w: number, h: number, tipBack: Vec): void => {
  const size = foldSizeFromTip(tipBack.x - w, tipBack.y - h);
  fold.style.setProperty('--paper-land-x', `${size.x}px`);
  fold.style.setProperty('--paper-land-y', `${size.y}px`);
  fold.classList.add(LANDING);
};

const clearLandingShade = (fold: HTMLElement): void => {
  fold.style.removeProperty('--paper-land-x');
  fold.style.removeProperty('--paper-land-y');
  fold.classList.remove(LANDING);
};

// Drives the page's clip-path and the flap directly while dragging (and while settling back
// afterwards) instead of the stylesheet's idle rules, which only fit the simple bottom-and-right
// crease. The folded-over region is the hole polygon pushed through a reflection across the
// crease line: rotate(α) scaleY(-1) rotate(-α) about any point on the crease, α being the crease's
// direction angle. (Not the idle rule's scaleX(-1): that one reflects across the crease's
// perpendicular, which only lands right because the idle box-clip feeds it the opposite triangle.)
//
// The flap takes the reflection, painting the sheet's blank back, wherever the sheet is. In front
// of the stack a face-up page folded over shows its back. Behind it, the pages fan with their
// printed sides showing, so a fold there doubles that same face over and its back is again what
// rises, never the content mirrored.
const renderFold = (
  section: HTMLElement, fold: HTMLElement, w: number, h: number, tip: Vec, back: Vec,
): void => {
  const degenerate = Math.hypot(tip.x, tip.y) < 0.5;
  const { kept, hole, mid, angle } = degenerate
    ? { kept: [], hole: [], mid: { x: 0, y: 0 }, angle: 0 }
    : splitByCrease(w, h, tip, back);

  if (degenerate || hole.length < 3) {
    // Tip at the corner, or crease off the page: page whole, flap hidden
    section.style.clipPath = '';
    section.style.transform = '';
    section.style.transformOrigin = '';
    fold.style.clipPath = HIDDEN_CLIP;
    return;
  }

  section.style.clipPath = polygonClip(kept);
  section.style.transform = '';
  section.style.transformOrigin = '';
  fold.style.clipPath = polygonClip(hole);
  fold.style.transformOrigin = `${mid.x}px ${mid.y}px`;
  fold.style.transform = `rotate(${angle}rad) scaleY(-1) rotate(${-angle}rad)`;

  // The flip hint rides at the flap's visual centre: the hole's centroid pushed through the same
  // reflection the flap paints with. It's a sibling of the flap, not a child, so it stays
  // unmirrored. The stylesheet keeps it on the sheet when that centre is off the paper.
  const hint = hintOf.get(fold);
  if (hint) {
    const centroid = polygonCentroid(hole);
    const local = rotateVec({ x: centroid.x - mid.x, y: centroid.y - mid.y }, -angle);
    const reflected = rotateVec({ x: local.x, y: -local.y }, angle);
    hint.style.setProperty('--paper-hint-x', `${mid.x + reflected.x}px`);
    hint.style.setProperty('--paper-hint-y', `${mid.y + reflected.y}px`);
  }
};

// The page carries the mark too, for the flip hint's commit feedback to key on. Read through
// :has() on the flap instead, each flip of it would restyle the whole document on a page that
// carries :has() rules.
const markWillCommit = (fold: HTMLElement, willCommit: boolean) => {
  fold.classList.toggle('paper-fold--will-commit', willCommit);
  fold.parentElement?.classList.toggle('paper-will-commit', willCommit);
};

// The flap in hand, dragged or hovered: the page carries paper-in-hand for the lift rules, for
// the same reason. Hover and drag each hold it on their own, so a release under the pointer keeps
// the flap lifted until the pointer leaves.
const hoveredFolds = new WeakSet<HTMLElement>();
const markInHand = (fold: HTMLElement, active: boolean) => {
  fold.classList.toggle('paper-fold--active', active);
  fold.parentElement?.classList.toggle('paper-in-hand', active || hoveredFolds.has(fold));
};

const onFoldGrab = (sheet: HTMLElement, gesture: FoldGesture, at: Pull, size = foldSizeOf(sheet)) => {
  // Once per gesture the metrics are taken fresh rather than trusted from the cache: a resize drops
  // them, but this is what catches anything that moved the em-based pin without changing the
  // page's pixel size. The landing reading goes with them.
  sampleMetrics(sheet);
  stirLanding(sheet.parentElement!);
  const contentRect = sheet.getBoundingClientRect();
  const tip = foldTipFromSize(size.x, size.y);
  gesture.offset = {
    x: gesture.gain * at.clientX - (contentRect.right + tip.x),
    y: gesture.gain * at.clientY - (contentRect.bottom + tip.y),
  };
  gesture.theta = Math.atan2(size.y, size.x);
  gesture.size = size;
  gesture.grabAt = { x: at.clientX, y: at.clientY };
};

// A back-drag's progress: the pointer's travel from the grab, projected on the pull.
const backAlong = (back: NonNullable<FoldGesture['back']>, at: Pull): number =>
  (at.clientX - back.origin.x) * back.dir.x + (at.clientY - back.origin.y) * back.dir.y;

const backReach = (sheet: HTMLElement): number => {
  const { w, h } = metricsOf(sheet);
  return Math.hypot(w, h) * BACK_COMMIT_REACH;
};

const backThrow = (back: NonNullable<FoldGesture['back']>, time: number): number =>
  coastAlong(back.trail, time) ?? back.trail[back.trail.length - 1]?.along ?? 0;

// From here a turn is certain to finish: a drag past the commit point, or a key, wheel, swipe or
// API turn, which decides everything the moment it starts. Reaching it is one-way for the rest of
// the gesture: dragging back below the threshold after passing it would otherwise flicker the
// listeners' state for the second or two until the hand makes up its mind. A release that settles
// back ends the turn at the settle instead.
const commitTurn = (stack: HTMLElement, direction: PaperDirection): void => {
  const ctx = ctxOf(stack);
  if (ctx.turning) return;
  ctx.turning = { direction, from: frontIndexOf(stack) };
  emit(stack, 'paper:turnstart', ctx.turning);
};

// T(θ), the fold's reflection transform, is self-inverse, and T(θ)·T(θ₀) works out to exactly
// R(2(θ₀-θ)), a pure rotation. So a point grabbed slightly off the tip stays fixed relative to the
// fold's surface (rather than sliding off it as the fold's aspect ratio changes) if its
// screen-space offset from the tip is rotated by 2(θ₀-θ) as θ moves from its grab-time value θ₀.
// This frame's θ isn't known until after size is solved for below, so the last solved frame's θ is
// used instead, a one-frame lag invisible at drag sampling rates.
const onFoldDrag = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, at: Pull) => {
  // Every computed-style and layout read the frame needs, taken before it writes anything: the
  // sheet's screen box (the page can still scroll vertically under a drag), the corner cut
  // (mid-transition for 300ms after a flip state change), and the cached page metrics. They come
  // before the first move's class writes below: a class anywhere on the page invalidates every
  // element the document's :has() rules could reach, so a read taken afterwards could make the
  // browser resolve the whole document on the spot.
  const contentRect = sheet.getBoundingClientRect();
  const backCut = currentBackFoldSize(sheet);
  const sheetMetrics = metricsOf(sheet);
  const { w, h, pin } = sheetMetrics;
  const stack = sheet.parentElement!;

  // A gesture's first move (a back-drag arrives with the class already on): the sheet's animations
  // have to be dropped outright rather than paused, since animations outrank inline styles in the
  // cascade and a paused one still forces its own value, and the fan closes up behind the drag.
  // Neither may repeat per frame: cancelling again would also cancel the rotate transition the
  // un-splay rides on. releaseFold keys off the class to know whether a grab ever became a drag,
  // so it is added here and not at the grab.
  if (!fold.classList.contains('paper-fold--active')) {
    markInHand(fold, true);
    unsettle(stack);
    // Cancelling the reveal or pulse drops whatever size it was mid-playing, and a cancel further
    // down can return before this function's own size write, so the size the grab captured is
    // frozen first: the dog-ear stays at what it visibly was.
    writeFoldSize(sheet, gesture.size);
    sheet.getAnimations().forEach((animation) => animation.cancel());
    retirePulse(sheet);
    holdUnsplayed(sheet);
  }

  // A forward drag whose pointer runs outward gives up before the geometry below sees it. The
  // margin keeps a hand that merely wavers a few pixels the wrong way on grab from tripping it.
  // Back-drags run their pointer toward the bottom-right on purpose (that's the unfold), so this
  // only watches a forward one.
  if (gesture.gain === 1) {
    const pull = restSeed(sheetMetrics);
    const pullLen = Math.hypot(pull.x, pull.y);
    const outward = { x: -pull.x / pullLen, y: -pull.y / pullLen };
    const travel = { x: at.clientX - gesture.grabAt.x, y: at.clientY - gesture.grabAt.y };
    if (travel.x * outward.x + travel.y * outward.y > FOLD_CANCEL_OUTWARD_MARGIN) {
      gesture.canceled = true;
      return;
    }
  }

  const { x: wPrev, y: hPrev } = gesture.size;
  // The rotating offset keeps a point grabbed on the flap fixed to its surface, only meaningful
  // when the tip itself was grabbed.
  const offset = gesture.gain === 1
    ? rotateVec(gesture.offset, 2 * (gesture.theta - Math.atan2(hPrev, wPrev)))
    : gesture.offset;

  let tip = {
    x: (gesture.gain * at.clientX - offset.x) - contentRect.right,
    y: (gesture.gain * at.clientY - offset.y) - contentRect.bottom,
  };

  // An unfold splits the pointer two ways. How far the corner still stands off its home is read
  // only along the unfold axis, the line the page came over on, so any drag carrying some pull
  // along it lays the page flat in the end, whatever its lean. Which way the corner points is the
  // pointer's to say, so it rides the ray out to the pointer at whatever distance the pull has left
  // it. The two agree at the promotion, so the phases meet without a kink. Clamped at the seed:
  // paper unfolds flat, it doesn't keep going and fold the other way.
  const { unfoldFrom } = gesture;
  if (unfoldFrom) {
    const span = Math.hypot(unfoldFrom.x, unfoldFrom.y);
    const axis = { x: unfoldFrom.x / span, y: unfoldFrom.y / span };
    const along = Math.min(Math.max(tip.x * axis.x + tip.y * axis.y, 0), span);
    const stand = Math.hypot(tip.x, tip.y);
    const dir = stand > 0 ? { x: tip.x / stand, y: tip.y / stand } : axis;
    tip = { x: dir.x * along, y: dir.y * along };
  }

  // Paper doesn't stretch: folding keeps the dragged corner within |corner - pin| of the paper
  // clip's pin (folding preserves the corner's distance to every point on the crease, and the
  // crease can at most pass through the pin). Slightly past that rim the fold holds there, the
  // crease pivoting around the pin as the pointer arcs, and on a forward drag past the grace margin
  // the drag gives up. A back-drag never gives up: its pointer leaves the rim by unfolding the page
  // flat, which is the gesture succeeding.
  const reach = Math.hypot(pin.x, pin.y);
  const fromPin = { x: tip.x - pin.x, y: tip.y - pin.y };
  const overshoot = Math.hypot(fromPin.x, fromPin.y) - reach;
  if (gesture.gain === 1 && overshoot > FOLD_CANCEL_GRACE) {
    gesture.canceled = true;
    return;
  }
  if (overshoot > 0) {
    const scale = reach / (reach + overshoot);
    tip = { x: pin.x + fromPin.x * scale, y: pin.y + fromPin.y * scale };
  }

  const size = foldSizeFromTip(tip.x, tip.y);
  gesture.size = size;
  writeFoldSize(sheet, size);

  // Live commit feedback: past the threshold the flap brightens and the hint appears, meaning the
  // same thing whichever way the page is going: let go now and the gesture goes through.
  const { back } = gesture;
  const along = back ? backAlong(back, at) : 0;
  const willCommit = back
    ? along >= backReach(sheet)
    : canTurnForward(stack) && pointFolded(commitPoint(w, h), w, h, tip);
  markWillCommit(fold, willCommit);
  if (willCommit) commitTurn(stack, back ? 'back' : 'forward');

  if (back) track(back.trail, { along, time: at.timeStamp });

  // The tip as the drag rendered it, after the gain, the unfold axis and the rim clamp, so the
  // throw is measured on the fold's own motion: a drag held against the rim has stopped moving the
  // paper however hard it's still pushing, and lets go with nothing to coast on.
  track(gesture.trail, { tip, time: at.timeStamp });
  renderFold(section, fold, w, h, tip, backCut);
};

// One ease-out run on its own rAF clock: `draw` gets the cubic-eased progress each frame, then
// `onDone` runs once after the frame that reaches 1. The timestamp is clamped below zero too: a rAF
// timestamp is the frame's vsync time, which can precede the start captured here. Returns the
// cancel.
const runEaseOut = (duration: number, draw: (eased: number) => void, onDone: () => void): (() => void) => {
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    draw(1 - (1 - t) ** 3);
    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    onDone();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
};

// Glides the fold's tip to a target along a straight tip-space path, easing out like released
// tension, over a duration scaled to how far the tip has to travel, and no longer than the
// release's own speed would take to cover it. Its own rAF clock rather than a CSS transition on
// --paper-fold-x/-y, so the path is the tip's, not the crease intercepts', which diverge wildly
// for large folds.
const glideFoldTip = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  to: Vec, baseMs: number, thrown: number, onDone: () => void,
): (() => void) => {
  // The observed layout size, not getBoundingClientRect: a sheet gliding behind the stack still
  // carries its splay rotation, which would inflate the rect to the rotated bounding box.
  const { w: width, h: height } = metricsOf(sheet);
  const { x: fx, y: fy } = foldSizeOf(sheet);
  const from = foldTipFromSize(fx, fy);
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  const duration = glideMs(sheet.parentElement!, Math.max(Math.min(
    baseMs + distance / GLIDE_PX_PER_MS, baseMs + GLIDE_EXTRA_MS, coastMs(distance, thrown),
  ), GLIDE_MIN_MS));

  return runEaseOut(duration, (eased) => {
    const tip = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
    // Read every frame, not once at glide start: a restack begins the stack's own 300ms corner cut
    // transition, so a value captured up front would go stale mid-glide. Read before the writes,
    // while style is clean from the last paint.
    const backCut = currentBackFoldSize(sheet);
    const size = foldSizeFromTip(tip.x, tip.y);
    writeFoldSize(sheet, size);
    renderFold(section, fold, width, height, tip, backCut);
  }, onDone);
};

// The second half of a flip: the page lies folded fully over at the resting crease, blank back up,
// and goes over to the back of the stack by folding back down, starting at the extreme (the tip,
// where the page's bottom-right corner ended up) with the fold-back crease travelling in to the
// base, never retracing the first fold. The state is parameterised by t, where the page's corner
// currently lies: the fold-back crease is the perpendicular bisector between the corner's packet
// position (the tip) and t. Two reflections compose to a rotation, so the folded-back material is
// the page's own printed front, unmirrored, its animations still running, coming home behind the
// stack as t arrives at the corner's natural place. What the crease hasn't reached yet is the
// still-doubled band between it and the base, blank back up, shrinking to nothing.
//
// The folded-back material tucks in under the band: the page is sliding in beneath the stack, so
// its returning front goes between the doubled packet and the desk. The flap paints after the
// section, so the band covering the front is just their natural order. The never-folded sliver
// beyond the resting crease drops out of the section's clip: behind the stack it sits under the
// other pages' paint.
//
// Run in reverse (t pulled from the corner's home out to the tip) this is also a back-drag's
// approach phase, with t free to leave the straight line so the fold follows the pointer.
const renderLanding = (
  section: HTMLElement, fold: HTMLElement, w: number, h: number, seed: Vec, back: Vec, t: Vec,
  drift = 0,
): void => {
  const length = Math.hypot(seed.x, seed.y);
  const n = { x: seed.x / length, y: seed.y / length };
  // The seed's crease is the resting cut of a page with no drift. On a page of the pile the cut
  // stands `drift` over, and the crease has to go with it or a sliver of sheet shows between the
  // two. Sliding the crease that far along x moves the corner's reflection by twice the crease's
  // shift along its own normal, which the seed lies along, so t stays on the seed's line.
  const shift = 2 * drift * n.x;
  const seedX = seed.x + shift * n.x;
  const seedY = seed.y + shift * n.y;
  const mid = { x: w + seedX / 2, y: h + seedY / 2 };
  const tip = { x: w + seedX, y: h + seedY };
  const { hole: packet } = splitPolygon(pagePentagon(w, h, back, drift), mid, n);
  const angle = Math.atan2(n.x, -n.y);
  fold.style.transformOrigin = `${mid.x}px ${mid.y}px`;
  fold.style.transform = `rotate(${angle}rad) scaleY(-1) rotate(${-angle}rad)`;

  const d = { x: t.x - tip.x, y: t.y - tip.y };
  const dl = Math.hypot(d.x, d.y);
  if (packet.length < 3 || dl < 0.5) {
    // Nothing folded back yet (or no packet at all): everything still doubled
    section.style.clipPath = HIDDEN_CLIP;
    section.style.transform = '';
    section.style.transformOrigin = '';
    fold.style.clipPath = packet.length < 3 ? HIDDEN_CLIP : polygonClip(packet);
    clearLandingShade(fold);
    return;
  }

  const n2 = { x: d.x / dl, y: d.y / dl };
  const mid2 = { x: (tip.x + t.x) / 2, y: (tip.y + t.y) / 2 };
  // The fold-back crease lives on the folded material, so it splits the unfolded page along its
  // pull-back through the first fold (a reflection is its own inverse)
  const proj = (mid2.x - mid.x) * n.x + (mid2.y - mid.y) * n.y;
  const mid2Back = { x: mid2.x - 2 * proj * n.x, y: mid2.y - 2 * proj * n.y };
  const dot = n2.x * n.x + n2.y * n.y;
  const n2Back = { x: n2.x - 2 * dot * n.x, y: n2.y - 2 * dot * n.y };
  const { kept: band, hole: landed } = splitPolygon(packet, mid2Back, n2Back);
  const projT = (t.x - mid.x) * n.x + (t.y - mid.y) * n.y;
  landingShade(fold, w, h, { x: t.x - 2 * projT * n.x, y: t.y - 2 * projT * n.y });

  // The landed material paints through both folds composed, Ref2·Ref1, whose linear part is a
  // rotation, written as an explicit matrix about the page origin
  const r1 = { xx: 1 - 2 * n.x * n.x, xy: -2 * n.x * n.y, yy: 1 - 2 * n.y * n.y };
  const r2 = { xx: 1 - 2 * n2.x * n2.x, xy: -2 * n2.x * n2.y, yy: 1 - 2 * n2.y * n2.y };
  const s1 = 2 * (mid.x * n.x + mid.y * n.y);
  const s2 = 2 * (mid2.x * n2.x + mid2.y * n2.y);
  const b1 = { x: s1 * n.x, y: s1 * n.y };
  const a = r2.xx * r1.xx + r2.xy * r1.xy;
  const b = r2.xy * r1.xx + r2.yy * r1.xy;
  const c = r2.xx * r1.xy + r2.xy * r1.yy;
  const dd = r2.xy * r1.xy + r2.yy * r1.yy;
  const e = r2.xx * b1.x + r2.xy * b1.y + s2 * n2.x;
  const f = r2.xy * b1.x + r2.yy * b1.y + s2 * n2.y;

  section.style.clipPath = landed.length < 3 ? HIDDEN_CLIP : polygonClip(landed);
  section.style.transformOrigin = '0px 0px';
  section.style.transform = `matrix(${a}, ${b}, ${c}, ${dd}, ${e}, ${f})`;
  fold.style.clipPath = band.length < 3 ? HIDDEN_CLIP : polygonClip(band);
};

// The landing's own glide: the corner easing straight from wherever it stands to where the
// gesture leaves it. The corner cut can be mid-transition while this runs, so it is re-read every
// frame.
const glideLanding = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  seed: Vec, from: Vec, to: Vec, ms: number, onDone: () => void,
): (() => void) => {
  const { w: width, h: height } = metricsOf(sheet);
  // Duration in proportion to the flight left to run, so a barely-started approach lays back down
  // quickly instead of crawling
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  const duration = glideMs(sheet.parentElement!, Math.max(ms * distance / Math.hypot(seed.x, seed.y), LANDING_MIN_MS));
  return runEaseOut(duration, (eased) => {
    const t = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
    const { back, drift } = currentLanding(sheet);
    renderLanding(section, fold, width, height, seed, back, t, drift);
  }, onDone);
};

// Covered pages leave the tab order and the accessibility tree. The page content is what goes
// inert, not the wrapper: the fold chrome stays a sibling of it and keeps its pointer capture.
const syncInert = (stack: HTMLElement, direction: PaperDirection | null): void => {
  for (const page of pagesOf(stack)) {
    // Only the pages whose state changes get written: setting the attribute again on the others
    // re-resolves the style of everything printed on them.
    const section = sectionOf(page);
    const covered = pageIndex(page) !== 1;
    if (section && section.inert !== covered) section.inert = covered;
  }
  const ctx = ctxOf(stack);
  const index = frontIndexOf(stack);
  if (direction === null || index === ctx.lastFront) {
    ctx.lastFront = index;
    return;
  }
  const previousIndex = ctx.lastFront;
  ctx.lastFront = index;
  emit(stack, 'paper:change', {
    direction, index, previousIndex, count: stack.childElementCount, turned: turnedOf(stack),
  });
};

// [data-paper-flipped] means there is a previous page to go back to: the stack isn't in its
// original order (the originally-first page is always the first DOM child, since flips only
// renumber --paper-page-index, never reorder the DOM). It gates the folded-back top-left corner
// and its grab handle.
const updateFlippedState = (stack: HTMLElement): void => {
  // Either branch can start the corner cut's 300ms transition, so the kept reading goes stale.
  stirLanding(stack);
  const first = pageIndex(stack.children[0] as HTMLElement);
  if (first === 1) {
    delete stack.dataset['paperFlipped'];
  } else {
    stack.dataset['paperFlipped'] = '';
  }
  // How many pages have been turned, which the stylesheet shows as a pile behind the stack. The
  // originally-first page counts them on its own: a flip sends the front page to the back and
  // shifts every other page down one, so that page's distance from the back is how many turns it
  // has sat through. Back at 1 it is the front page again and the stack has come full circle.
  stack.style.setProperty('--paper-pages-turned', `${first === 1 ? 0 : stack.children.length - first + 1}`);
  syncPileSurface(stack);
};

// The strip behind the front page's crease is the back of the page turned most recently, so it
// paints in that page's paper. That page is the furthest of the pile, the highest
// --paper-page-index. With nothing turned there is no pile, and the strip falls back to the front
// page's paper under an opacity of 0.
const syncPileSurface = (stack: HTMLElement): void => {
  const pages = pagesOf(stack);
  const furthest = pages[0] && pageIndex(pages[0]) === 1
    ? undefined
    : pages.find((page) => pageIndex(page) === pages.length);
  if (furthest) {
    stack.style.setProperty('--paper-pile-surface', paperOf(furthest));
  } else {
    stack.style.removeProperty('--paper-pile-surface');
  }
};

// What a screen reader hears once a turn has settled. The live region beside the stack speaks when
// its text changes, so it is written only from a settle that left a different page at the front:
// one announcement per turn, none on load, none while a drag is still moving the paper, and none
// for a drag that came back to the page it started on.
const announceFront = (stack: HTMLElement): void => {
  const ctx = ctxOf(stack);
  const index = frontIndexOf(stack);
  const front = pagesOf(stack)[index];
  if (!front || ctx.announced === front) return;
  ctx.announced = front;
  const { announce, pageTitle } = ctx.options;
  if (!announce || !ctx.status) return;
  const page = sectionOf(front);
  ctx.status.textContent = announce({ index, count: stack.childElementCount, title: page ? pageTitle(page) : undefined, page });
};

// [data-paper-settled] means the front page is lying flat and still: set as a flip or a settle
// hands the rendering back, and dropped the moment a gesture starts moving a page again.
const settle = (stack: HTMLElement): void => {
  stack.dataset['paperSettled'] = '';
  announceFront(stack);
  const ctx = ctxOf(stack);
  const index = frontIndexOf(stack);
  const changed = index !== ctx.lastSettled;
  ctx.lastSettled = index;
  emit(stack, 'paper:settle', { index, count: stack.childElementCount, turned: turnedOf(stack), changed });
  const { turning } = ctx;
  if (turning) {
    ctx.turning = null;
    emit(stack, 'paper:turnend', turning);
  }
  for (const resolve of ctx.settleWaiters.splice(0)) resolve();
};

const unsettle = (stack: HTMLElement): void => {
  delete stack.dataset['paperSettled'];
};

// The one thing on a stack that never stops: the fold pulse, breathing the resting dog-ear on a
// 7.5s loop for as long as the page is open. It is three animations, one on each layer the fold
// draws (the page's crease clip-path, the flap's transform, the cast shadow's scale), which the
// compositor runs without the page; they share one clock, so everything here handles them
// together. The page's content has animations of its own, so the three are told apart by name.
//
// A tease has no one to tease off screen, so there it holds still. Through the Web Animations API
// rather than a class or a data attribute: a class or an attribute would put a document's :has()
// rules back in play on every scroll past. A paused animation keeps its value, so the dog-ear is
// where the reader left it when the stack comes back.
export const isFoldPulse = (animation: Animation): boolean =>
  PULSES.includes((animation as CSSAnimation).animationName);

const stillStacks = new WeakSet<HTMLElement>();

// Asked of the layers themselves, the sheet's children, rather than of the sheet's whole subtree:
// that walk went through every animation on the page to find these three. The shade runs on the
// clip's ::after, which only a subtree query reports, and the clip holds nothing else.
const sheetPulses = (sheet: HTMLElement): Animation[] =>
  [...sheet.children].flatMap((layer) =>
    layer.getAnimations({ subtree: layer.classList.contains('paper-clip') })).filter(isFoldPulse);

const pulsesOf = (stack: HTMLElement): Animation[] =>
  [...stack.querySelectorAll<HTMLElement>(':scope > .paper-front')].flatMap(sheetPulses);

// Hands the fold's rendering over to whatever writes it next, a drag or a flat relax: each pulse
// layer's animation outranks the inline clip-path and transform written there, paused or not.
const retirePulse = (sheet: HTMLElement): void => {
  for (const pulse of sheetPulses(sheet)) pulse.cancel();
};

// Puts the three layers' clocks back in step, then runs or holds them as the stack's place calls
// for: held off screen and while the window is being resized. A layer can fall behind the other
// two (a flap handed back after a flip starts its run over), so each takes the one furthest along,
// once all three are under way. Run or held through play() and pause(), which overrule the CSS
// play state from then on. Every stack's layers are read before any is run or held: asking for
// an animation resolves style, and a stack written in between made that a whole-document resolve
// per stack on load.
const alignPulses = (stacks: readonly HTMLElement[], running?: boolean): void => {
  const reads = stacks.filter((stack) => contexts.has(stack)).map((stack) => ({
    pulses: pulsesOf(stack),
    running: running ?? (!stillStacks.has(stack) && !ctxOf(stack).hold.isHeld()),
  }));
  for (const { pulses, running: run } of reads) syncClocks(pulses, run);
};

const syncClocks = (pulses: Animation[], running: boolean): void => {
  for (const pulse of pulses) {
    if (running) pulse.play();
    else pulse.pause();
  }
  Promise.all(pulses.map((pulse) => pulse.ready)).then(() => {
    const at = Math.max(...pulses.map((pulse) => Number(pulse.currentTime)));
    for (const pulse of pulses) pulse.currentTime = at;
  }, () => {
    // A drag took the pulse off in the meantime, and restarts it when it lets go.
  });
};

// The same after anything that starts the pulse over (a flip hands it to the next page, a settle
// restarts it), once the next frame has painted. The new animations come into being in that
// frame's style resolve, and asking for them now would force one in the middle of the turn. After
// the paint style is clean, and every stack due is read in one go.
const pulsesDue = new Set<HTMLElement>();
const syncPulse = (stack: HTMLElement): void => {
  if (pulsesDue.size === 0) {
    afterPaint(() => {
      const stacks = [...pulsesDue];
      pulsesDue.clear();
      alignPulses(stacks);
    });
  }
  pulsesDue.add(stack);
};

// The stylesheet holds each stack's reveal, and the pulse after it, until the stack's bottom edge
// is on screen: the dog-ear sits in the bottom-right corner, so a stack that has only just come up
// over the bottom of the window has not shown it yet. Two observers with one threshold each catch
// the edge whichever way it comes. From below, the first one's root reaches far up above the
// window, so a stack is wholly inside it exactly when its bottom edge has come up past the bottom
// of the window, however tall the stack is; its 1px bottom margin is a pixel of slack for a bottom
// edge on a fractional pixel. From above, the bottom edge is the first thing on screen, so the
// second one, on the window itself, sees it come in. A stack already above the window when the
// page loads is wholly inside the first root too, which is why both check the edge against the top
// of the window. The entry carries both rectangles, so nothing here reads layout. The reveal runs
// once per stack.
let revealObservers: IntersectionObserver[] | undefined;

const revealStack = (stack: HTMLElement): void => {
  for (const observer of revealObservers ?? []) observer.unobserve(stack);
  stack.style.setProperty('--paper-reveal', 'running');
};

const revealOnScreen = (entries: IntersectionObserverEntry[]): void => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !entry.rootBounds) continue;
    const { bottom } = entry.boundingClientRect;
    if (bottom >= 0 && bottom <= entry.rootBounds.bottom + 1) revealStack(entry.target as HTMLElement);
  }
};

// The pulse comes in once the reveal is over (see the reveal keyframes for why not during it):
// `initial` is no value at all, so each layer falls back to its own animation.
const releasePulse = (stack: HTMLElement): void => {
  if (stack.style.getPropertyValue('--paper-pulse') === 'initial') return;
  stack.style.setProperty('--paper-pulse', 'initial');
  syncPulse(stack);
};

const watchStackReveal = (stack: HTMLElement, signal: AbortSignal): void => {
  revealObservers ??= [
    new IntersectionObserver(revealOnScreen, { threshold: 1, rootMargin: '10000% 0px 1px 0px' }),
    new IntersectionObserver(revealOnScreen, { threshold: 0 }),
  ];
  for (const observer of revealObservers) observer.observe(stack);
  stack.addEventListener('animationend', (event) => {
    if (event.animationName === REVEAL) releasePulse(stack);
  }, { signal });
  signal.addEventListener('abort', () => {
    for (const observer of revealObservers ?? []) observer.unobserve(stack);
  });
};

// A margin so the pulse is already running by the time the stack is looked at, rather than
// starting under the reader's eye as it crosses the viewport edge. One observer for every stack,
// so the first pass on load is one callback that reads them all, then writes.
let pulseObserver: IntersectionObserver | undefined;

const watchStackPulse = (stack: HTMLElement, signal: AbortSignal): void => {
  pulseObserver ??= new IntersectionObserver((entries) => {
    const stacks = new Set<HTMLElement>();
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      if (entry.isIntersecting) stillStacks.delete(target);
      else stillStacks.add(target);
      stacks.add(target);
    }
    alignPulses([...stacks]);
  }, { rootMargin: '25%' });
  const unsubscribe = ctxOf(stack).hold.subscribe((holding) => {
    if (stillStacks.has(stack)) return;
    alignPulses([stack], !holding);
  });
  pulseObserver.observe(stack);
  signal.addEventListener('abort', () => {
    unsubscribe();
    pulseObserver?.unobserve(stack);
  });
};

// Puts a front page's fold back in its resting idle state: the dog-ear held at the reveal size
// with the pulse running. The drag cancelled the reveal, so its forwards-fill is gone for good, and
// leaving --paper-fold-x/-y set here is what holds the resting size, before and under the pulse.
// The reveal stays retired, since restarting it would replay its zero start and flash the fold
// back down. --paper-pulse at none takes the pulse layers' animations off, and clearing it puts
// them back, together and from the start.
const restIdleFold = (sheet: HTMLElement): void => {
  forgetFoldSize(sheet);
  sheet.style.setProperty('--paper-fold-x', FOLD_REVEAL_END.x);
  sheet.style.setProperty('--paper-fold-y', FOLD_REVEAL_END.y);
  sheet.style.animationName = 'none';
  sheet.style.setProperty('--paper-pulse', 'none');
  void sheet.offsetWidth;
  sheet.style.removeProperty('--paper-pulse');
  sheet.parentElement!.style.setProperty('--paper-pulse', 'initial');
  syncPulse(sheet.parentElement!);
};

// What a page that has come to rest at the front hands back: the stylesheet's own rules take the
// rendering again, with the resting dog-ear running on it.
const restFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): void => {
  // The dog-ear first, because restarting its pulse forces a reflow, and a reflow forced after the
  // class below has come off is one that re-resolves the whole document wherever :has() rules
  // watch classes. Both land in the same frame either way.
  restIdleFold(sheet);
  markInHand(fold, false);
  clearFoldRender(section, fold);

  sheet.parentElement!.style.removeProperty('--paper-flip-progress');
  // A settled back-drag may have restored the stack's original order
  updateFlippedState(sheet.parentElement!);
  settle(sheet.parentElement!);
};

// Glides back to the resting dog-ear, then hands rendering back to the stylesheet's idle rules
const settleFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, thrown = 0): (() => void) => {
  // The glide opens by reading where the fold stands, so it goes first: dropping the commit
  // feedback is a class change, and a read after one can cost a whole-document resolve.
  const rest = restSizePx(sheet);
  const glide = glideFoldTip(sheet, section, fold, foldTipFromSize(rest.x, rest.y), 1000, thrown, () => {
    restFold(sheet, section, fold);
  });
  markWillCommit(fold, false);
  return glide;
};

// Puts the stack's turn clock at its starting value with no transition, so the value set right
// after runs the transition from there. Turning the stack's transitions off for the reflow is
// safe: the only other ones there are the corner cut's, which a committed flip has long since
// finished growing.
const restartTurn = (stack: HTMLElement, name: string, from: string): void => {
  stack.style.transition = 'none';
  stack.style.setProperty(name, from);
  void stack.offsetWidth;
  stack.style.transition = '';
};

// A stack has one flap, and a committed flip keeps it on the outgoing sheet to the very end,
// painting that sheet folding away behind the stack. So the page taking the front would get its
// corner cut on time with nothing folded over the cut until the flip handed the flap over. This
// stands in for it meanwhile: same element and so the same idle rules, sized by the reveal like
// any resting dog-ear, and swapped out for the real flap the moment the flip lets go of it.
const standInFold = (): HTMLElement => {
  const standIn = document.createElement('div');
  standIn.className = `paper-fold ${STAND_IN}`;
  return standIn;
};

const present = <T>(value: T | null | undefined): value is T => value != null;

const restack = (sheet: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  const pages = pagesOf(stack);
  const under = sheet.querySelector<HTMLElement>(':scope > .paper-clip-under');
  const clip = sheet.querySelector<HTMLElement>(':scope > .paper-clip');
  const grab = sheet.querySelector<HTMLElement>(':scope > .paper-back-grab');
  const hint = sheet.querySelector<HTMLElement>(':scope > .paper-flip-hint');

  const next = pages.find((page) => pageIndex(page) === 2)!;
  // restartTurn's forced reflow is the last flush this function makes: after it come the moves and
  // the classes, and the whole restack costs one document-wide resolve rather than three.

  // The strip behind the front crease follows this page up to the pile on --paper-turn-ease: back
  // to 0 without a transition, then eased to 1 in the same recalc that renumbers the pages, so it
  // runs on the page's own clock.
  restartTurn(stack, '--paper-turn-ease', '0');
  markWillCommit(fold, false);
  // Renumbering starts every page's 250ms drift transition.
  stirLanding(stack);
  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--paper-page-index', `${index === 1 ? pages.length : index - 1}`);
  }
  stack.style.removeProperty('--paper-flip-progress');
  stack.style.setProperty('--paper-turn-ease', '1');
  sheet.classList.remove('paper-front');
  // The stylesheet holds the reveal back half a second so the dog-ear draws itself once the page
  // has loaded, and restarting the animation here would bring that wait along: the flip would land
  // on a front page with a square corner. It has been introduced by now, so it starts at once and
  // curls up while the sheet it replaces folds away. The pulse keeps its own gap after it.
  next.style.animationDelay = '0s';
  // The new page's pulse waits for its reveal to end, as on load: a clip-path pulse there in its
  // delay keeps Chrome painting the page uncut under the growing flap.
  stack.style.setProperty('--paper-pulse', 'none');
  next.classList.add('paper-front');
  // The clip's back bar goes before the page content so the page hides it
  if (under) next.prepend(under);
  next.append(...[clip, grab, hint].filter(present));
  // After the clip, so paper dragged over the wire covers it
  next.insertBefore(standInFold(), grab ?? hint ?? null);
  updateFlippedState(stack);
  stack.dataset['paperTurned'] = '';
  syncInert(stack, 'forward');
  // The dog-ear's pulse goes with the front-page role, so an off-screen stack holds the new page's
  // still too.
  syncPulse(stack);
};

// Drops everything the front-page role leaves behind on a sheet, so its next turn at the front
// starts from the stylesheet's own rules. animationName above all: restIdleFold pins it inline to
// keep the reveal retired, and an inline name that never changes is one the reveal can't be
// restarted under.
const clearFrontFold = (sheet: HTMLElement): void => {
  forgetFoldSize(sheet);
  sheet.style.removeProperty('--paper-fold-x');
  sheet.style.removeProperty('--paper-fold-y');
  sheet.style.animationName = '';
  sheet.style.animationDelay = '';
};

// The second half: the flipped page's inline fold state is cleared, so its next turn at the front
// starts fresh, and the fold rejoins the new front page's companions.
const finishFlip = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement): void => {
  const stack = sheet.parentElement!;
  // The flap leaves this sheet below, so a hover it still holds goes with it.
  hoveredFolds.delete(fold);
  markInHand(fold, false);
  clearFoldRender(section, fold);
  clearFrontFold(sheet);
  // A back-drag's grab squares this sheet up with the front page; letting go of the inline
  // rotation eases it back into the fan.
  sheet.style.rotate = '';
  stack.style.removeProperty('--paper-flip-progress');
  const front = stack.querySelector<HTMLElement>(':scope > .paper-front')!;
  // Straight swap when a restack left a stand-in holding the dog-ear, so nothing changes on screen
  // as the real flap arrives. A back-drag laid back down never restacked, and its front page is
  // waiting for its flap where the markup left it.
  const standIn = front.querySelector<HTMLElement>(`:scope > .${STAND_IN}`);
  if (standIn) standIn.replaceWith(fold);
  else front.insertBefore(fold, front.querySelector(':scope > .paper-back-grab, :scope > .paper-flip-hint'));
  syncPulse(stack);
  settle(stack);
};

// Inverse of a flip's restack: promotes the page most recently sent to the back over the front,
// handing it the front-page role and companion elements. Runs mid-gesture, the moment a
// back-drag's approach completes: the fold is looked up stack-wide (the approach already moved it
// onto the promoted page), and the grab handle stays behind on the old front page, since moving it
// here would risk dropping the pointer capture the gesture lives on; the release brings it over.
const bringToFront = (stack: HTMLElement): HTMLElement => {
  const pages = pagesOf(stack);
  const front = pages.find((page) => pageIndex(page) === 1)!;
  const prev = pages.find((page) => pageIndex(page) === pages.length)!;
  const under = front.querySelector<HTMLElement>(':scope > .paper-clip-under');
  const clip = front.querySelector<HTMLElement>(':scope > .paper-clip');
  const fold = stack.querySelector<HTMLElement>(`:scope > * > .paper-fold:not(.${STAND_IN})`);
  const hint = front.querySelector<HTMLElement>(':scope > .paper-flip-hint');

  // Renumbering starts every page's 250ms drift transition.
  stirLanding(stack);
  for (const page of pages) {
    const index = pageIndex(page);
    page.style.setProperty('--paper-page-index', `${index === pages.length ? 1 : index + 1}`);
  }
  front.classList.remove('paper-front');
  clearFrontFold(front);
  prev.classList.add('paper-front');
  if (under) prev.prepend(under);
  prev.append(...[clip, fold, hint].filter(present));
  stack.dataset['paperTurned'] = '';
  // Coming back is the harder half to find, so it is marked apart from having turned at all.
  stack.dataset['paperReturned'] = '';
  syncInert(stack, 'back');
  // Promoting the originally-first page puts the stack back in its own order, so the corner cut
  // unfolds from here: re-deriving the state now runs the cut's 300ms transition under the page as
  // it comes over, uncovering the clip's wire as the corner it pins flattens out. A release that
  // sends the page back sets the flipped state again on its way (flipFold).
  updateFlippedState(stack);
  syncPulse(stack);
  return prev;
};

// The handover at the end of a back-drag's approach, with the page lying fully folded over at the
// resting crease: the fold state goes over to the first fold's own parameterisation (the same
// state on screen, since the two renderings agree there) and the page takes the front.
const promoteFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, seed: Vec): void => {
  const { w, h } = metricsOf(sheet);
  const backCut = currentBackFoldSize(sheet);
  const size = foldSizeFromTip(seed.x, seed.y);
  writeFoldSize(sheet, size);
  renderFold(section, fold, w, h, seed, backCut);
  clearLandingShade(fold);
  sheet.style.rotate = '';
  bringToFront(sheet.parentElement!);
  sheet.getAnimations().forEach((animation) => animation.cancel());
  retirePulse(sheet);
};

// A back-drag's approach phase: the landing run in reverse, driven by the pointer. Pull along the
// resting crease's normal sets how far the fold has come (s); the pointer's own direction steers
// where the corner heads, the delta's angle off the pull swinging the corner's travel off the seed
// line by that same angle, so the fold comes over the way it's dragged. The corner stays on the arc
// of radius s·|seed| around its home, and the swing eases out as s completes so the gesture still
// ends fully folded. At s 1 the page lies fully folded at the resting crease, the very state a
// forward flip restacks in, so promoting it at that moment changes nothing on screen: the ordinary
// unfold drag (onFoldDrag, gain 2) takes over, with the pointer offset re-derived for continuity.
const onBackApproach = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, gesture: FoldGesture, at: Pull) => {
  const approach = gesture.approach!;
  const back = gesture.back!;
  const { w, h } = metricsOf(sheet);
  const { back: backCut, drift } = currentLanding(sheet);
  const delta = { x: at.clientX - back.origin.x, y: at.clientY - back.origin.y };
  const along = delta.x * back.dir.x + delta.y * back.dir.y;
  const s = Math.min(Math.max(along / approach.pull, 0), 1);
  const across = -delta.x * back.dir.y + delta.y * back.dir.x;
  // The floor on along only matters while s is still ~0, where it keeps the angle from whipping
  // through ±180° as the delta passes the perpendicular
  const swing = -Math.atan2(across, Math.max(along, 1)) * (1 - s);
  const swung = rotateVec(approach.seed, swing);
  const t = { x: w + swung.x * s, y: h + swung.y * s };
  approach.s = s;
  approach.t = t;
  track(back.trail, { along, time: at.timeStamp });
  if (along >= backReach(sheet)) commitTurn(sheet.parentElement!, 'back');
  renderLanding(section, fold, w, h, approach.seed, backCut, t, drift);
  if (s < 1) return;

  promoteFold(sheet, section, fold, approach.seed);
  gesture.unfoldFrom = approach.seed;
  gesture.approach = null;
  onFoldGrab(sheet, gesture, at);
  // Seeding the unfold's trail from the seed means the very next move already carries a speed.
  track(gesture.trail, { tip: approach.seed, time: at.timeStamp });
};

// A committed flip: glide the tip the rest of the way out to the resting seed, the crease pivoting
// around the pin to the resting angle as the fold completes. Only that crease lets the page lie
// flat behind the stack wearing the same folded-back corner as every turned page. Restacking
// happens there, and from there the landing folds the sheet back down from the extreme.
const flipFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, thrown: number): (() => void) => {
  const stack = sheet.parentElement!;
  const sheetMetrics = metricsOf(sheet);
  const { w: width, h: height } = sheetMetrics;
  const to = restSeed(sheetMetrics);

  // Both halves, folding out to the resting seed and the landing back down behind the stack, run
  // on one clock measured in crease travel (the edge the eye follows) under a single ease-out, so
  // the crease keeps its speed through the restack and the flip reads as one released motion.
  //
  // Where the fold stands, taken before the attributes below are written.
  const { x: fx, y: fy } = foldSizeOf(sheet);

  // The flip is committed, so a first flip grows every page's corner cut now: the glide out to the
  // seed outlasts the cut's 300ms transition, which would otherwise still be mid-growth while the
  // landing folds material in behind it.
  stirLanding(stack);
  stack.dataset['paperFlipped'] = '';
  unsettle(stack);
  commitTurn(stack, 'forward');

  const from = foldTipFromSize(fx, fy);
  const d1 = Math.hypot(to.x - from.x, to.y - from.y) / 2;
  const d2 = Math.hypot(to.x, to.y) / 2;
  const total = d1 + d2;
  // Weighted by the travel left at release, so an early let-go takes proportionally longer instead
  // of launching at full tilt, unless the hand let go faster than that. The crease covers half the
  // ground the tip does, so the throw reaches it halved.
  const duration = glideMs(stack, Math.max(Math.min(FLIP_BASE_MS + total / 2, FLIP_MAX_MS, coastMs(total, thrown / 2)), FLIP_MIN_MS));
  const home = { x: width, y: height };

  let settling = false;
  const cancelRun = runEaseOut(duration, (eased) => {
    const p = eased * total;
    // The corner cut and the drift are read at the top of the frame, while style is still clean
    // from the last paint, then everything writes. The frame that restacks writes a dozen classes,
    // attributes and moved nodes, and reading after it would resolve the whole document twice.
    const { back: backCut, drift } = currentLanding(sheet);
    if (p < d1) {
      const k = p / d1;
      const tip = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      const size = foldSizeFromTip(tip.x, tip.y);
      writeFoldSize(sheet, size);
      renderFold(section, fold, width, height, tip, backCut);
    } else {
      if (!settling) {
        settling = true;
        const size = foldSizeFromTip(to.x, to.y);
        writeFoldSize(sheet, size);
        restack(sheet, fold);
      }
      const k = (p - d1) / d2;
      const t = { x: home.x + to.x * (1 - k), y: home.y + to.y * (1 - k) };
      renderLanding(section, fold, width, height, to, backCut, t, drift);
    }
  }, () => finishFlip(sheet, section, fold));

  // A re-grab mid-fold-back-down fast-forwards to the settled end state; before the restack the
  // fold is still the front page's, and the grab takes it over where it stands.
  return () => {
    cancelRun();
    if (settling) finishFlip(sheet, section, fold);
  };
};

// The mirror of flipFold, for a page fetched back by a gesture with nothing left to let go of: the
// previous page comes over the clip and then unfolds flat in front, both halves on one clock under
// a single ease-out. Run as two glides the page visibly halts half way through the turn.
const bringFold = (
  sheet: HTMLElement, section: HTMLElement, fold: HTMLElement,
  approach: NonNullable<FoldGesture['approach']>, onPromoted: () => void,
): (() => void) => {
  const stack = sheet.parentElement!;
  const { w, h } = metricsOf(sheet);
  unsettle(stack);
  commitTurn(stack, 'back');
  const { seed } = approach;
  const over = { x: w + seed.x, y: h + seed.y };
  const restSize = restSizePx(sheet);
  const rest = foldTipFromSize(restSize.x, restSize.y);
  const from = approach.t;
  const d1 = Math.hypot(over.x - from.x, over.y - from.y) / 2;
  const d2 = Math.hypot(seed.x - rest.x, seed.y - rest.y) / 2;
  const total = d1 + d2;
  const duration = glideMs(stack, Math.max(Math.min(FLIP_BASE_MS + total / 2, FLIP_MAX_MS), FLIP_MIN_MS));

  let promoted = false;
  const promote = () => {
    promoted = true;
    promoteFold(sheet, section, fold, seed);
    onPromoted();
  };

  const cancelRun = runEaseOut(duration, (eased) => {
    const p = eased * total;
    const { back: backCut, drift } = currentLanding(sheet);
    if (p < d1) {
      const k = p / d1;
      const t = { x: from.x + (over.x - from.x) * k, y: from.y + (over.y - from.y) * k };
      renderLanding(section, fold, w, h, seed, backCut, t, drift);
    } else {
      if (!promoted) promote();
      const k = (p - d1) / d2;
      const tip = { x: seed.x + (rest.x - seed.x) * k, y: seed.y + (rest.y - seed.y) * k };
      const size = foldSizeFromTip(tip.x, tip.y);
      writeFoldSize(sheet, size);
      renderFold(section, fold, w, h, tip, backCut);
    }
  }, () => restFold(sheet, section, fold));

  // The turn was committed when it started, so a re-grab mid-flight takes the page as arrived
  // rather than undoing it.
  return () => {
    cancelRun();
    if (!promoted) promote();
    restFold(sheet, section, fold);
  };
};

const shouldFlip = (sheet: HTMLElement, coast: Vec | null): boolean => {
  const { w: width, h: height } = metricsOf(sheet);
  const { x: fx, y: fy } = foldSizeOf(sheet);
  return pointFolded(commitPoint(width, height), width, height, coast ?? foldTipFromSize(fx, fy));
};

const releaseFold = (sheet: HTMLElement, section: HTMLElement, fold: HTMLElement, canceled: boolean, thrown: Throw | null): (() => void) => {
  // A grab that never dragged left the animations alone, so there is nothing to hand back. The
  // class, not the inline size: once a gesture has rested, restIdleFold keeps that set for good,
  // and a tap would run the whole settle glide back to where the fold already lies.
  if (!fold.classList.contains('paper-fold--active')) return () => {};

  const speed = thrown ? thrown.speed : 0;
  if (!canceled && canTurnForward(sheet.parentElement!) && shouldFlip(sheet, thrown?.at ?? null)) {
    return flipFold(sheet, section, fold, speed);
  }
  return settleFold(sheet, section, fold, speed);
};

// Keeps --paper-page-w/-h in sync with each page's pixel size: the crease clip-path formula needs
// a real length to divide by (percentages aren't real lengths until layout). Every page is
// observed, since flips move the front-page role around. The cached metrics go stale here too.
const observeFoldPageSizes = (stack: HTMLElement, signal: AbortSignal): void => {
  const observer = new ResizeObserver((entries) => {
    // A resize re-derives the corner cut, which is written in em: the kept landing reading goes
    // stale with no transition to announce it.
    stirLanding(stack);
    // The metrics are dropped rather than sampled: sampling reads computed style, which the other
    // stacks' observers have just dirtied, so every stack would pay a style pass of its own on
    // every resize step. The next gesture or frame that needs them samples them once.
    for (const entry of entries) {
      const page = entry.target as HTMLElement;
      metrics.delete(page);
      const { width, height } = entry.contentRect;
      observedSizes.set(page, { width, height });
      page.style.setProperty('--paper-page-w', `${width}px`);
      page.style.setProperty('--paper-page-h', `${height}px`);
    }
  });
  for (const page of stack.children) observer.observe(page);
  signal.addEventListener('abort', () => observer.disconnect());
};

// Outside a drag, approaching the front page's top-left corner rotates the hindmost page out from
// behind the stack, teasing the drag-back gesture by showing the page it would bring over.
// --paper-peek feeds into the pages' splay rotation; the rotate transition eases every update, so
// the peek follows the pointer and glides back on its own once the property is cleared.
const attachBackFoldTease = (stack: HTMLElement, isDragging: () => boolean, enabled: boolean, signal: AbortSignal) => {
  const clearTease = () => {
    for (const page of pagesOf(stack)) page.style.removeProperty('--paper-peek');
  };
  if (!enabled) return clearTease;

  stack.addEventListener('pointermove', (e) => {
    if (!('paperFlipped' in stack.dataset) || isDragging()) return;
    const corner = stack.querySelector<HTMLElement>(':scope > .paper-front')!.getBoundingClientRect();
    const distance = Math.hypot(e.clientX - corner.left, e.clientY - corner.top);
    if (distance >= BACK_TEASE_RADIUS) {
      clearTease();
      return;
    }
    const pages = pagesOf(stack);
    const back = pages.find((page) => pageIndex(page) === pages.length);
    if (!back) return;
    const t = 1 - distance / BACK_TEASE_RADIUS;
    // Counter-fan (negative): the page pivots up, rising above the stack's top edge, the direction
    // the drag would bring it over.
    back.style.setProperty('--paper-peek', `${-BACK_TEASE_PEEK * t}deg`);
  }, { signal });
  stack.addEventListener('pointerleave', clearTease, { signal });

  return clearTease;
};

// What the controller drives a stack with.
export interface StackDriver {
  turn(forward: boolean): boolean;
  jump(index: number): boolean;
  busy(): boolean;
}

const attachFoldDrag = (stack: HTMLElement, fold: HTMLElement, grab: HTMLElement, signal: AbortSignal): StackDriver => {
  const { interactions } = ctxOf(stack).options;
  // Re-derived on every grab: a completed flip moves the fold (and its companions) onto the new
  // front page, so the sheet and section they ride on change over time.
  let sheet = fold.parentElement!;
  let section = sectionOf(sheet);
  let gesture: FoldGesture | null = null;
  let cancelSettle: () => void = () => {};
  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window, type: K, listener: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions,
  ) => target.addEventListener(type, listener as EventListener, { ...options, signal });

  const clearTease = attachBackFoldTease(stack, () => gesture !== null, interactions.tease, signal);

  if (interactions.drag) {
    on(fold, 'pointerenter', () => {
      hoveredFolds.add(fold);
      markInHand(fold, fold.classList.contains('paper-fold--active'));
    });
    on(fold, 'pointerleave', () => {
      hoveredFolds.delete(fold);
      markInHand(fold, fold.classList.contains('paper-fold--active'));
    });

    on(fold, 'pointerdown', (e) => {
      if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();

      // Grabbing mid-settle freezes the fold where it is and takes over from there, and a grab
      // mid-fold-back-down fast-forwards that flip first, so the fold is back on the front page
      // before the parent is read.
      cancelSettle();
      sheet = fold.parentElement!;
      section = sectionOf(sheet);
      clearTease();

      gesture = {
        pointerId: e.pointerId, offset: { x: 0, y: 0 }, theta: 0, size: { x: 0, y: 0 }, gain: 1, canceled: false,
        grabAt: { x: 0, y: 0 }, unfoldFrom: null, approach: null, back: null, trail: [],
      };
      onFoldGrab(sheet, gesture, e);
      try {
        fold.setPointerCapture(e.pointerId);
      } catch {
        gesture = null;
        cancelSettle = releaseFold(sheet, section, fold, true, null);
      }
    });

    on(fold, 'pointermove', (e) => {
      const active = gesture;
      if (active === null || e.pointerId !== active.pointerId) return;
      if (!fold.hasPointerCapture(e.pointerId)) return;
      if (e.buttons === 0) {
        fold.releasePointerCapture(e.pointerId);
        return;
      }
      onFoldDrag(sheet, section, fold, active, e);
      // The drag strayed too far past the fold's reach and gave up; dropping the capture is what
      // ends it, and the release settles the fold back.
      if (active.canceled) fold.releasePointerCapture(e.pointerId);
    });

    // Pointer capture is released, on pointerup or pointercancel, right before this fires, so it's
    // the one place that decides what the released fold does.
    on(fold, 'lostpointercapture', (e) => {
      if (gesture === null || e.pointerId !== gesture.pointerId) return;
      const { canceled, trail } = gesture;
      gesture = null;
      cancelSettle = releaseFold(sheet, section, fold, canceled, coastTip(trail, e.timeStamp));
    });
  }

  // A back-drag released before its approach completed: the landing resumes from where the
  // reverse sweep stood, laying the previous page back down flat behind the stack, and the front
  // page gets its flap and resting dog-ear back.
  const returnBehind = (approach: NonNullable<FoldGesture['approach']>): (() => void) => {
    let done = false;
    const front = stack.querySelector<HTMLElement>(':scope > .paper-front')!;
    const { w, h } = metricsOf(sheet);
    const home = { x: w, y: h };
    const finish = () => {
      done = true;
      finishFlip(sheet, section, fold);
      restIdleFold(front);
    };
    const cancelGlide = glideLanding(sheet, section, fold, approach.seed, approach.t, home, LANDING_MS, finish);
    return () => {
      cancelGlide();
      if (!done) finish();
    };
  };

  // The other way a released approach can go: thrown hard enough, the corner finishes its flight
  // out to the fully-folded seed on the release's own momentum, and the page is promoted there and
  // settles flat as the new front page.
  const throwFront = (approach: NonNullable<FoldGesture['approach']>): (() => void) => {
    const { w, h } = metricsOf(sheet);
    const tip = { x: w + approach.seed.x, y: h + approach.seed.y };
    let done = false;
    let cancelSettleFold: () => void = () => {};
    const finish = () => {
      done = true;
      promoteFold(sheet, section, fold, approach.seed);
      sheet.insertBefore(grab, sheet.querySelector(':scope > .paper-flip-hint'));
      cancelSettleFold = settleFold(sheet, section, fold);
    };
    const cancelGlide = glideLanding(sheet, section, fold, approach.seed, approach.t, tip, LANDING_MS, finish);
    return () => {
      cancelGlide();
      if (!done) finish();
      cancelSettleFold();
    };
  };

  // Going back a page runs in two phases. First the approach: grabbing the folded-back corner moves
  // only the fold flap onto the hindmost page, which stays behind the stack, so nothing snaps into
  // place; dragging folds it progressively over the clip. The moment it has come fully over it is
  // promoted, and the forward fold's drag machinery unfolds it from there. Both phases are one
  // pull, and the release measures that. Returns the gesture it starts, or null when there is no
  // previous page to go back to.
  const beginBack = (at: Pull, pointerId: number): FoldGesture | null => {
    if (!('paperFlipped' in stack.dataset)) return null;

    cancelSettle();
    clearTease();
    const pages = pagesOf(stack);
    const front = stack.querySelector<HTMLElement>(':scope > .paper-front')!;
    sheet = pages.find((page) => pageIndex(page) === pages.length)!;
    section = sectionOf(sheet);

    // The front page lends its flap to paint the arriving page's fold, so its own resting dog-ear
    // relaxes flat for the duration (restored by returnBehind if the drag lets go).
    front.getAnimations().forEach((animation) => animation.cancel());
    retirePulse(front);
    forgetFoldSize(front);
    front.style.removeProperty('--paper-fold-x');
    front.style.removeProperty('--paper-fold-y');
    sectionOf(front).style.clipPath = '';

    const sheetMetrics = sampleMetrics(sheet);
    stirLanding(stack);
    const { w, h } = sheetMetrics;
    // Read before the node move and the class below.
    const { back: backCut, drift } = currentLanding(sheet);
    sheet.append(fold);
    markInHand(fold, true);
    unsettle(stack);
    // Active mode sizes the flap to the whole page, and the idle clip-path it still carries fills
    // that box: a page-sized slab of flap colour. Render the reverse landing's flat start now so it
    // begins hidden.
    const seed = restSeed(sheetMetrics);
    // The flap shades the resting crease from the sheet's --paper-fold-x/-y, which a page behind
    // the stack no longer has. Writing the seed now keeps the crease shaded the same on both sides
    // of the hand-over.
    writeFoldSize(sheet, foldSizeFromTip(seed.x, seed.y));
    renderLanding(section, fold, w, h, seed, backCut, { x: w, y: h }, drift);
    // The pull direction: the resting crease's normal, which the seed lies opposite along
    const seedLength = Math.hypot(seed.x, seed.y);
    const dir = { x: -seed.x / seedLength, y: -seed.y / seedLength };

    // The arriving page squares up with the front one for the whole gesture, so their folded-back
    // corners stay flush as it comes over.
    sheet.style.rotate = '0deg';
    holdUnsplayed(sheet);

    return {
      pointerId, offset: { x: 0, y: 0 }, theta: 0, size: { x: 0, y: 0 }, gain: 2, canceled: false,
      grabAt: { x: at.clientX, y: at.clientY },
      unfoldFrom: null,
      approach: { seed, pull: seedLength * BACK_APPROACH_PULL, s: 0, t: { x: w, y: h } },
      back: { origin: { x: at.clientX, y: at.clientY }, dir, trail: [] },
      trail: [],
    };
  };

  // What a back-drag's release does, from either phase: committed, the page stays in front
  // (carried the rest of the way over first if it hasn't got there), short of that it goes back.
  const releaseBack = (ended: FoldGesture, time: number): (() => void) => {
    const { approach, back, trail } = ended;
    const committed = backThrow(back!, time) >= backReach(sheet);
    if (approach) return committed ? throwFront(approach) : returnBehind(approach);
    // The grab handle sat out the promotion so the DOM move couldn't break its pointer capture;
    // with the gesture over it rejoins its sheet, back in canonical sibling order.
    sheet.insertBefore(grab, sheet.querySelector(':scope > .paper-flip-hint'));
    const speed = coastTip(trail, time)?.speed ?? 0;
    return committed
      ? settleFold(sheet, section, fold, speed)
      : flipFold(sheet, section, fold, speed);
  };

  if (interactions.backGrab) {
    on(grab, 'pointerdown', (e) => {
      if (gesture !== null || e.button !== 0 || !e.isPrimary) return;
      const started = beginBack(e, e.pointerId);
      if (!started) return;
      e.preventDefault();
      e.stopPropagation();
      gesture = started;
      try {
        grab.setPointerCapture(e.pointerId);
      } catch {
        const { approach } = gesture;
        gesture = null;
        cancelSettle = returnBehind(approach!);
      }
    });

    on(grab, 'pointermove', (e) => {
      if (gesture === null || e.pointerId !== gesture.pointerId) return;
      if (!grab.hasPointerCapture(e.pointerId)) return;
      if (e.buttons === 0) {
        grab.releasePointerCapture(e.pointerId);
        return;
      }
      if (gesture.approach) {
        onBackApproach(sheet, section, fold, gesture, e);
      } else {
        onFoldDrag(sheet, section, fold, gesture, e);
      }
    });

    // A canceled back-drag doesn't force a settle: straying lets go with the fold still near-fully
    // folded, and the pull's own threshold already resolves that to "return to the back".
    on(grab, 'lostpointercapture', (e) => {
      if (gesture === null || e.pointerId !== gesture.pointerId) return;
      const ended = gesture;
      gesture = null;
      cancelSettle = releaseBack(ended, e.timeStamp);
    });
  }

  // Taking the stack sideways turns its pages, whether that's a wheel, a trackpad or a finger. The
  // travel walks a point of its own along the line the matching drag would have taken (out from
  // the fold's tip to take the page away, down the back-drag's pull to fetch the one behind it) and
  // everything downstream is the drag's. Taking the stack left sends the page away and right brings
  // the last one back. The gesture's pointer id is one no real pointer can have.
  let swipe: {
    at: Vec, dir: Vec,
    // Where the scrolling has got to, and where the fold has eased to behind it. A finger keeps
    // the two together; a wheel is what pulls them apart.
    target: number, travel: number,
    idle: number, last: number,
    // The easing's rAF handle, the time of its last frame and the constant it closes the gap on,
    // and the flag the idle wait sets to say the wheel has fallen quiet.
    frame: number, painted: number, ease: number, quiet: boolean,
  } | null = null;

  const restingSwipe = (at: Vec, dir: Vec) => ({
    at, dir, target: 0, travel: 0, idle: 0, last: 0,
    frame: 0, painted: 0, ease: SCROLL_SMOOTH_MAX, quiet: false,
  });

  const beginSwipe = (forward: boolean, time: number): boolean => {
    if (forward && !canTurnForward(stack)) return false;
    cancelSettle();
    clearTease();
    if (!forward) {
      // The swipe only measures travel from here, so with the grab handle hidden the front page's
      // corner serves as well.
      const box = grab.offsetParent ? grab.getBoundingClientRect() : stack.querySelector(':scope > .paper-front')!.getBoundingClientRect();
      const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const started = beginBack({ clientX: at.x, clientY: at.y, timeStamp: time }, -1);
      if (!started) return false;
      gesture = started;
      swipe = restingSwipe(at, started.back!.dir);
      return true;
    }
    sheet = fold.parentElement!;
    section = sectionOf(sheet);
    const box = sheet.getBoundingClientRect();
    const size = foldSizeOf(sheet);
    const tip = foldTipFromSize(size.x, size.y);
    const at = { x: box.right + tip.x, y: box.bottom + tip.y };
    const diagonal = Math.hypot(box.width, box.height);
    gesture = {
      pointerId: -1, offset: { x: 0, y: 0 }, theta: 0, size: { x: 0, y: 0 }, gain: 1, canceled: false,
      grabAt: { x: 0, y: 0 }, unfoldFrom: null, approach: null, back: null, trail: [],
    };
    onFoldGrab(sheet, gesture, { clientX: at.x, clientY: at.y, timeStamp: time }, size);
    swipe = restingSwipe(at, { x: -box.width / diagonal, y: -box.height / diagonal });
    return true;
  };

  const swipeTo = (travel: number, time: number) => {
    const live = swipe!;
    const active = gesture!;
    const held = live.travel;
    live.travel = Math.max(travel, 0);
    const reach = live.travel * (active.back ? 1 : SWIPE_AWAY_GAIN);
    const at = {
      clientX: live.at.x + live.dir.x * reach,
      clientY: live.at.y + live.dir.y * reach,
      timeStamp: time,
    };
    if (active.approach) {
      onBackApproach(sheet, section, fold, active, at);
    } else {
      onFoldDrag(sheet, section, fold, active, at);
    }
    if (active.canceled) {
      // A swipe only ever runs along the one line, so carrying on past the paper's reach holds the
      // fold at its rim instead of giving the gesture up, and the scrolling is brought back to the
      // position it can still honour, so the easing isn't left chasing somewhere the paper can't go.
      active.canceled = false;
      live.travel = held;
      live.target = held;
    }
  };

  // The fold eases after the scrolling instead of matching it: every frame it closes the same
  // fraction of whatever gap is left, on a constant taken from the scrolling's own pace. The wheel
  // falling quiet doesn't end the gesture on its own: the fold has to have caught up first, so the
  // release measures where the scrolling got to and not wherever the easing had reached.
  const followScroll = (now: number) => {
    const live = swipe;
    if (!live) return;
    // A frame that arrives after a long stall (a hidden tab) shouldn't close the whole gap at once
    const span = Math.min(now - live.painted, WHEEL_STALL_CAP_MS);
    live.painted = now;
    const gap = live.target - live.travel;
    if (Math.abs(gap) >= 0.5) {
      swipeTo(live.travel + gap * (1 - Math.exp(-span / live.ease)), now);
    } else {
      if (live.travel !== live.target) swipeTo(live.target, now);
      if (live.quiet) {
        endSwipe(now);
        return;
      }
    }
    live.frame = requestAnimationFrame(followScroll);
  };

  const endSwipe = (time: number) => {
    stack.removeEventListener('wheel', holdWheel);
    const ended = gesture;
    if (swipe) {
      clearTimeout(swipe.idle);
      cancelAnimationFrame(swipe.frame);
    }
    swipe = null;
    gesture = null;
    if (!ended) return;
    cancelSettle = ended.back
      ? releaseBack(ended, time)
      : releaseFold(sheet, section, fold, ended.canceled, coastTip(ended.trail, time));
  };

  // Ends a gesture nothing is going to let go of, by committing it where it stands and leaving the
  // release's own glide to play the whole turn out.
  const commitSwipe = (time: number) => {
    const { approach } = gesture!;
    // Arming the forward fold without moving it: a drag's first move is what hands the page's
    // rendering to the flap and retires the resting dog-ear's animations, so the flip glides on
    // from the dog-ear rather than jumping. A back-drag's grab has already done that.
    if (!approach) swipeTo(0, time);
    gesture = null;
    swipe = null;
    cancelSettle = approach
      ? bringFold(sheet, section, fold, approach, () => {
        sheet.insertBefore(grab, sheet.querySelector(':scope > .paper-flip-hint'));
      })
      : flipFold(sheet, section, fold, 0);
  };

  // Lines and pages only reach here from wheels that report in them; a trackpad's own units are
  // already the pixels the fold is measured in.
  const wheelUnit = (e: WheelEvent) => (e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? sheet.clientHeight : 1);

  // A cancelling wheel listener on a stack makes every scroll that starts over it wait for the
  // main thread. So the stack listens passively, and this one, which claims the mostly sideways
  // events, is only attached while a wheel swipe is underway. A browser decides whether a scroll
  // waits on the page when the scroll starts, so the scroll that started the swipe stays
  // uncancellable; the claim covers the ones that follow. A sideways wheel the stack has nothing
  // to turn to still gets claimed: let through, it starts a sideways page scroll that moves
  // nothing, and Chrome holds the scrolling after it to that axis until the mouse moves, so the
  // next upright scroll goes nowhere. The claim lasts until the sideways scrolling has been quiet
  // for the longest idle wait.
  let declined = 0;
  const releaseDeclined = () => {
    declined = 0;
    if (swipe === null) stack.removeEventListener('wheel', holdWheel);
  };
  const holdDeclined = () => {
    clearTimeout(declined);
    declined = window.setTimeout(releaseDeclined, SCROLL_IDLE_MAX);
    stack.addEventListener('wheel', holdWheel, { passive: false, signal });
  };

  const holdWheel = (e: WheelEvent) => {
    if (swipe === null && declined === 0) {
      stack.removeEventListener('wheel', holdWheel);
      return;
    }
    const unit = wheelUnit(e);
    if (e.cancelable && e.deltaX !== 0 && Math.abs(e.deltaX * unit) >= Math.abs(e.deltaY * unit)) e.preventDefault();
  };

  if (interactions.wheel) {
    on(stack, 'wheel', (e) => {
      // A pointer already working the fold owns it until it lets go
      if (gesture !== null && swipe === null) return;
      const unit = wheelUnit(e);
      const sideways = e.deltaX * unit;
      const upright = Math.abs(e.deltaY * unit);
      if (swipe === null) {
        // Starting one takes a scroll that is mostly sideways. Scrolling right takes the content
        // left, which is the way the page leaves.
        if (Math.abs(sideways) <= upright) return;
        if (!beginSwipe(sideways > 0, e.timeStamp)) {
          holdDeclined();
          return;
        }
        stack.addEventListener('wheel', holdWheel, { passive: false, signal });
      } else if (sideways === 0) {
        // Nothing sideways in it at all: the page's own scrolling, which the gesture has no claim
        // on and which doesn't keep it alive either
        return;
      }
      const live = swipe!;
      // Once underway the gesture takes whatever sideways an event has in it, however much upright
      // came along: scrolling slowly wobbles off the horizontal. holdWheel only claims the event
      // outright while sideways is what it is mostly made of, so a deliberate scroll down
      // mid-gesture still scrolls the page. Each gesture counts the scroll running its own way as
      // progress, so reversing the wheel walks the fold back the way it came.
      live.target = Math.max(live.target + (gesture!.back ? -sideways : sideways) * SCROLL_GAIN, 0);

      // Until a second event there is no pace to read, so it waits the longest it ever would
      // rather than cut off a scroll that merely started slowly.
      const gap = live.last === 0 ? SCROLL_IDLE_MAX : e.timeStamp - live.last;
      live.last = e.timeStamp;
      live.ease = Math.min(Math.max(gap * SCROLL_SMOOTH_GAP, SCROLL_SMOOTH_MIN), SCROLL_SMOOTH_MAX);
      live.quiet = false;
      if (live.painted === 0) {
        live.painted = e.timeStamp;
        live.frame = requestAnimationFrame(followScroll);
      }
      clearTimeout(live.idle);
      // Falling quiet doesn't release on its own: followScroll does, once the fold has caught up,
      // timed from the quiet rather than from the last event, so the throw window has closed on
      // the scrolling. A flick's momentum arrives as scroll events of its own, so it is already in
      // the travel, and coasting it again would spend it twice.
      live.idle = window.setTimeout(
        () => { if (swipe) swipe.quiet = true; },
        Math.min(Math.max(gap * SCROLL_IDLE_GAPS, SCROLL_IDLE_MIN), SCROLL_IDLE_MAX),
      );
    }, { passive: true });
  }

  // A key press turns the page as the same gesture a swipe drives, committed on the spot: it has
  // no hand still on the paper to wait for. Easing a swipe's worth of travel in first left the fold
  // standing there for a second with the turn already decided.
  const turn = (forward: boolean): boolean => {
    if (gesture !== null || stack.childElementCount < 2) return false;
    if (!beginSwipe(forward, performance.now())) return false;
    commitSwipe(performance.now());
    return true;
  };

  // Only the stack itself listens, so arrows inside a page's own controls stay theirs.
  if (interactions.keyboard) {
    on(stack, 'keydown', (e) => {
      if (e.target !== stack || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      if (turn(e.key === 'ArrowRight')) e.preventDefault();
    });
  }

  // A finger never reaches the wheel: swiping the stack scrolls without a scroll event, so it drives
  // the same gesture from the pointer directly. touch-action: pan-y leaves the page's own scrolling
  // to the browser, which takes the gesture back (pointercancel) the moment it decides the finger
  // meant to scroll after all. The first few pixels are spent deciding which way the swipe runs and
  // aren't paid out to the fold, so it starts from rest rather than jumping.
  let touch: { id: number, from: Vec } | null = null;

  // Pointer events have no say over scrolling: preventDefault on a pointermove is ignored, and
  // touch-action is read when the finger lands. The flap and the grab are touch-action: none, so a
  // finger on them never scrolls the page. A swipe starts from the stack's pan-y, and Chromium and
  // Firefox stop a pan-y touch that sets off sideways from scrolling at all; for browsers that
  // don't, the swipe cancels its finger's moves from here, attached only while it owns the finger.
  // A stack-wide listener held every scroll that started over a stack until the main thread was
  // free. A browser that already committed the touch as uncancellable keeps it.
  const holdTouch = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };

  if (interactions.swipe) {
    on(stack, 'pointerdown', (e) => {
      if (gesture !== null || touch !== null || e.pointerType === 'mouse') return;
      touch = { id: e.pointerId, from: { x: e.clientX, y: e.clientY } };
    });

    on(stack, 'pointermove', (e) => {
      if (touch === null || e.pointerId !== touch.id) return;
      const sideways = e.clientX - touch.from.x;
      if (swipe === null) {
        const upright = e.clientY - touch.from.y;
        if (Math.abs(sideways) < SWIPE_START && Math.abs(upright) < SWIPE_START) return;
        // Gone further up or down than sideways, the finger means to scroll the page, and the
        // browser has already started doing it. The swipe stands down for the rest of this touch,
        // rather than folding a page over underneath a scroll.
        if (Math.abs(sideways) <= Math.abs(upright)) {
          touch = null;
          return;
        }
        // Swiping left carries the page off to the left, the way it goes
        if (!beginSwipe(sideways < 0, e.timeStamp)) {
          touch = null;
          return;
        }
        try {
          stack.setPointerCapture(e.pointerId);
        } catch { /* the finger is gone already; the release below still tidies up */ }
        stack.addEventListener('touchmove', holdTouch, { passive: false, signal });
      }
      e.preventDefault();
      // A finger arrives already smooth, so it drives the fold outright and the easing has
      // nothing to do.
      const along = (gesture!.back ? sideways : -sideways) - SWIPE_START;
      swipe!.target = along * SCROLL_GAIN;
      swipeTo(swipe!.target, e.timeStamp);
    });

    const liftTouch = (e: PointerEvent) => {
      if (touch === null || e.pointerId !== touch.id) return;
      touch = null;
      stack.removeEventListener('touchmove', holdTouch);
      if (swipe) endSwipe(e.timeStamp);
    };
    // On the window, not the stack: a pen has no implicit capture until a swipe takes it, and a pen
    // pressed on the stack, moved less than SWIPE_START and lifted off it delivers its pointerup
    // elsewhere, which would leave `touch` set and every later swipe refused.
    on(window, 'pointerup', liftTouch);
    on(window, 'pointercancel', liftTouch);
  }

  // Puts `target` at the front at once, as if the turns between had already landed.
  const jump = (target: number): boolean => {
    const pages = pagesOf(stack);
    const next = pages[target];
    if (gesture !== null || !next) return false;
    cancelSettle();
    cancelSettle = () => {};
    clearTease();
    const front = stack.querySelector<HTMLElement>(':scope > .paper-front')!;
    if (front === next) return true;
    const from = frontIndexOf(stack);

    clearFoldRender(sectionOf(front), fold);
    hoveredFolds.delete(fold);
    markInHand(fold, false);
    markWillCommit(fold, false);
    const find = (name: string) => stack.querySelector<HTMLElement>(`:scope > * > .${name}`);
    const under = find('paper-clip-under');
    const clip = find('paper-clip');
    const hint = find('paper-flip-hint');
    for (const standIn of stack.querySelectorAll(`:scope > * > .${STAND_IN}`)) standIn.remove();

    stirLanding(stack);
    pages.forEach((page, index) => page.style.setProperty('--paper-page-index', `${pageIndexOf(index, target, pages.length)}`));
    front.classList.remove('paper-front');
    clearFrontFold(front);
    front.style.rotate = '';
    restartTurn(stack, '--paper-turn-ease', '1');
    stack.style.removeProperty('--paper-flip-progress');
    // Once the stack has revealed its dog-ear the new front page curls its own up at once, and its
    // pulse waits for that to end, as after a flip.
    if (stack.style.getPropertyValue('--paper-reveal')) {
      next.style.animationDelay = '0s';
      stack.style.setProperty('--paper-pulse', 'none');
    }
    next.classList.add('paper-front');
    if (under) next.prepend(under);
    next.append(...[clip, fold, grab, hint].filter(present));
    sheet = next;
    section = sectionOf(next);
    updateFlippedState(stack);
    syncInert(stack, target > from ? 'forward' : 'back');
    syncPulse(stack);
    settle(stack);
    return true;
  };

  return { turn, jump, busy: () => gesture !== null };
};

export interface StackSetup {
  options: ResolvedStackOptions;
  status: HTMLElement | null;
  signal: AbortSignal;
}

/** Wires one enhanced stack. Returns null when the markup lacks the front page's chrome. */
export function attachStack(stack: HTMLElement, { options, status, signal }: StackSetup): StackDriver | null {
  const fold = stack.querySelector<HTMLElement>(':scope > .paper-front > .paper-fold');
  const grab = stack.querySelector<HTMLElement>(':scope > .paper-front > .paper-back-grab');
  if (!fold || !grab) return null;
  const hint = stack.querySelector<HTMLElement>(':scope > .paper-front > .paper-flip-hint');
  if (hint) hintOf.set(fold, hint);

  const hold = options.resizeHold === true ? windowResizeHold
    : options.resizeHold === false ? noResizeHold
      : options.resizeHold;
  const front = frontIndexOf(stack);
  contexts.set(stack, {
    options, hold, restPx: null,
    // The page at the front on load is known, not announced.
    announced: stack.children[front] as HTMLElement | undefined,
    lastFront: front, lastSettled: front, turning: null, settleWaiters: [], status,
  });
  signal.addEventListener('abort', () => {
    const ctx = contexts.get(stack);
    for (const resolve of ctx?.settleWaiters.splice(0) ?? []) resolve();
    contexts.delete(stack);
    stillStacks.delete(stack);
  });

  observeFoldPageSizes(stack, signal);
  const driver = attachFoldDrag(stack, fold, grab, signal);
  syncPileSurface(stack);
  syncInert(stack, null);
  watchStackPulse(stack, signal);
  watchStackReveal(stack, signal);
  return driver;
}

/** Drops the cached lengths, for a change to the stack's type or custom properties. */
export function refreshStack(stack: HTMLElement): void {
  const ctx = contexts.get(stack);
  if (!ctx) return;
  ctx.restPx = null;
  for (const page of pagesOf(stack)) metrics.delete(page);
  stirLanding(stack);
}

export function stackState(stack: HTMLElement): PaperState {
  const ctx = contexts.get(stack);
  const index = Math.max(frontIndexOf(stack), 0);
  const count = stack.childElementCount;
  const turned = turnedOf(stack);
  return {
    mode: 'stack',
    index,
    count,
    turned,
    settled: 'paperSettled' in stack.dataset,
    turning: Boolean(ctx?.turning),
    canPrev: turned > 0,
    canNext: ctx ? canTurnForward(stack) : false,
  };
}

/** Resolves at the stack's next settle, or when it is destroyed. */
export function nextSettle(stack: HTMLElement): Promise<void> {
  const ctx = contexts.get(stack);
  if (!ctx) return Promise.resolve();
  return new Promise((resolve) => ctx.settleWaiters.push(resolve));
}
