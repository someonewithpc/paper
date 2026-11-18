// Book mode: leaves turned across a spine. A drag from a page corner, a sideways wheel or swipe,
// a key or a call to the controller all drive one gesture, a tip that the grabbed corner is carried
// to, and every frame draws the turn from that tip alone. Nothing is read from layout or computed
// style while a turn moves: the page's frame is measured once, as the gesture starts.

import type { Vec } from '../internal/vec.js';
import type { ResolvedBookOptions } from '../options.js';
import { coastMs, coastTip, track } from '../stack/geometry.js';
import type {
  PaperBookEventMap, PaperBookState, PaperBookView, PaperDirection, PaperTurnDetail,
} from '../types.js';
import {
  backPageTransform, constrainTip, crease, flapTransform, gradientAt, hardAngle, isHardLeaf, matrixCss,
  pagesOfSpread, reflect, spreadCount, spreadOfPage, toBackPage, turnCommits, turnPath, turnRoles,
  type Across, type TurnRoles,
} from './geometry.js';
import { splitPolygon } from '../stack/geometry.js';

// A corner answers the pointer within this share of the page's width, at most CORNER_MAX px.
const CORNER_SHARE = 0.2;
const CORNER_MAX = 96;

// How far the tease lifts a corner towards the pointer.
const TEASE_SHARE = 0.12;
const TEASE_MAX = 56;

// A glide runs GLIDE_BASE_MS plus one ms per GLIDE_PX_PER_MS of tip travel, at most GLIDE_MAX_MS,
// and no longer than the release's own speed would take.
const GLIDE_BASE_MS = 200;
const GLIDE_PX_PER_MS = 3;
const GLIDE_MAX_MS = 700;
const GLIDE_MIN_MS = 120;

// A turn the book plays by itself, from a key, the controller or the rest of a committed swipe.
const PLAY_MS = 750;

// A swipe or wheel travel of one page width turns the leaf the whole way.
const SWIPE_START = 8;
const WHEEL_IDLE_MS = 220;
const WHEEL_SMOOTH_MS = 60;
const WHEEL_LINE_PX = 16;

const HIDDEN_CLIP = 'polygon(0px 0px, 0px 0px, 0px 0px)';
const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"])';

type Frame = { x: number, y: number, w: number, h: number };

type Gesture = {
  kind: 'drag' | 'tease' | 'swipe' | 'wheel' | 'play';
  pointerId: number;
  roles: TurnRoles;
  // The leaf started on the right (a forward turn) or on the left (a turn back).
  fromRight: boolean;
  hard: boolean;
  cornerY: number;
  frame: Frame;
  // The tip as the gesture took it, and the pointer then, for drags; the tip moves `gain` times
  // as far as the pointer.
  start: Vec;
  grab: Vec;
  gain: number;
  tip: Vec;
  trail: { tip: Vec, time: number }[];
  // Swipes and wheels: progress along the played path, its target and the easing's clock.
  travel: number;
  target: number;
  // Let go: gliding or playing out on its own.
  released: boolean;
  painted: number;
  frameId: number;
  idle: number;
};

type Book = {
  root: HTMLElement;
  options: ResolvedBookOptions;
  status: HTMLElement | null;
  pages: HTMLElement[];
  across: Across;
  spread: number;
  gesture: Gesture | null;
  cancelGlide: () => void;
  turning: PaperTurnDetail | null;
  settledKey: string;
  announcedKey: string;
  waiters: (() => void)[];
};

const books = new WeakMap<HTMLElement, Book>();

let reducedMotionQuery: MediaQueryList | undefined;
const reducesMotion = (book: Book): boolean =>
  book.options.reducedMotion === 'reduce' || (reducedMotionQuery ??= matchMedia('(prefers-reduced-motion: reduce)')).matches;

const motionMs = (book: Book, ms: number): number => (reducesMotion(book) ? 1 : ms);

const emit = <K extends keyof PaperBookEventMap>(book: Book, type: K, detail: PaperBookEventMap[K]['detail']): void => {
  book.root.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
};

const sectionOf = (wrapper: HTMLElement): HTMLElement | null =>
  wrapper.querySelector<HTMLElement>(':scope > :not(.paper-book-shade)');

const shadeOf = (wrapper: HTMLElement): HTMLElement | null =>
  wrapper.querySelector<HTMLElement>(':scope > .paper-book-shade');

const polygon = (points: readonly Vec[]): string =>
  points.length < 3 ? HIDDEN_CLIP : `polygon(${points.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;

const viewOf = (book: Book): PaperBookView => ({
  spread: book.spread,
  pages: pagesOfSpread(book.spread, book.pages.length, book.across),
});

const firstInView = (book: Book): number => viewOf(book).pages[0] ?? 0;

const spreadsOf = (book: Book): number => spreadCount(book.pages.length, book.across);

// Pages are written only when their place changes: a write restyles the wrapper, and a page
// coming into view lays out its content for the first time since it left.
const setPlace = (wrapper: HTMLElement, place: string | null): void => {
  if ((wrapper.dataset['paperPlace'] ?? null) === place) return;
  if (place === null) delete wrapper.dataset['paperPlace'];
  else wrapper.dataset['paperPlace'] = place;
};

const restPlaces = (book: Book): void => {
  const inView = new Set(viewOf(book).pages);
  book.pages.forEach((wrapper, index) => setPlace(wrapper, inView.has(index) ? 'view' : null));
};

// Pages out of view leave the tab order and the accessibility tree. Focus on one of them goes back
// to the book first, so it isn't dropped on the document.
const syncInert = (book: Book): void => {
  const inView = new Set(viewOf(book).pages);
  book.pages.forEach((wrapper, index) => {
    const section = sectionOf(wrapper);
    if (!section) return;
    const covered = !inView.has(index);
    if (section.inert === covered) return;
    if (covered && section.contains(document.activeElement)) {
      if (book.root.tabIndex >= 0) book.root.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
    section.inert = covered;
  });
};

// A closed book in double display moves to the middle: the cover alone, or the back alone.
const centerFor = (book: Book, spread: number): string | null => {
  if (!book.options.autoCenter || book.across !== 2) return null;
  const pages = pagesOfSpread(spread, book.pages.length, 2);
  if (pages.length !== 1) return null;
  return pages[0]! % 2 === 0 ? 'start' : 'end';
};

const syncCenter = (book: Book, spread = book.spread): void => {
  const center = centerFor(book, spread);
  if ((book.root.dataset['paperCenter'] ?? null) === center) return;
  if (center === null) delete book.root.dataset['paperCenter'];
  else book.root.dataset['paperCenter'] = center;
};

const announce = (book: Book): void => {
  const view = viewOf(book);
  const key = view.pages.join(',');
  if (key === book.announcedKey) return;
  book.announcedKey = key;
  const { announce: say, pageTitle } = book.options;
  if (!say || !book.status) return;
  const sections = view.pages.map((index) => sectionOf(book.pages[index]!)).filter((section) => section !== null);
  const title = sections.map((section) => pageTitle(section)).find(Boolean);
  const page = sections[0];
  if (!page) return;
  book.status.textContent = say({ index: firstInView(book), count: book.pages.length, title, page, ...view });
};

const settle = (book: Book): void => {
  book.root.dataset['paperSettled'] = '';
  announce(book);
  const view = viewOf(book);
  const key = view.pages.join(',');
  const changed = key !== book.settledKey;
  book.settledKey = key;
  const index = firstInView(book);
  emit(book, 'paper:settle', { index, count: book.pages.length, turned: index, changed, ...view });
  const { turning } = book;
  if (turning) {
    book.turning = null;
    emit(book, 'paper:turnend', turning);
  }
  for (const resolve of book.waiters.splice(0)) resolve();
};

const commitTurn = (book: Book, direction: PaperDirection): void => {
  if (book.turning) return;
  book.turning = { direction, from: firstInView(book) };
  emit(book, 'paper:turnstart', book.turning);
  // The book slides to or from the middle while the leaf turns.
  syncCenter(book, book.spread + (direction === 'forward' ? 1 : -1));
};

// The frame of a turn's front page, the right-hand slot, in client pixels: its top at the spine.
// Read off a page in view, which carries no transform at rest; with only a left-hand page in
// view, the spine is that page's right edge.
const frameOf = (book: Book): Frame => {
  const pages = viewOf(book).pages;
  const right = pages.find((index) => book.across === 1 || index % 2 === 0);
  const wrapper = book.pages[right ?? pages[0]!]!;
  const rect = wrapper.getBoundingClientRect();
  return {
    x: right === undefined ? rect.right : rect.left,
    y: rect.top,
    w: wrapper.offsetWidth || rect.width,
    h: wrapper.offsetHeight || rect.height,
  };
};

const clearPage = (wrapper: HTMLElement): void => {
  wrapper.style.removeProperty('clip-path');
  wrapper.style.removeProperty('transform');
  wrapper.style.removeProperty('transform-origin');
  wrapper.style.removeProperty('opacity');
  const section = sectionOf(wrapper);
  section?.style.removeProperty('clip-path');
  const shade = shadeOf(wrapper);
  if (shade) {
    delete shade.dataset['paperShade'];
    for (const name of ['clip-path', 'transform', 'transform-origin', 'opacity', '--paper-shade-angle', '--paper-shade-at', '--paper-shade-reach']) {
      shade.style.removeProperty(name);
    }
  }
};

const rolePages = (book: Book, roles: TurnRoles) => ({
  front: book.pages[roles.front]!,
  back: roles.back === undefined ? undefined : book.pages[roles.back],
  under: roles.under === undefined ? undefined : book.pages[roles.under],
  left: roles.left === undefined ? undefined : book.pages[roles.left],
});

const clearTurn = (book: Book, roles: TurnRoles): void => {
  const { front, back, under, left } = rolePages(book, roles);
  for (const wrapper of [front, back, under, left]) if (wrapper) clearPage(wrapper);
};

const prepareTurn = (book: Book, roles: TurnRoles, hard: boolean): void => {
  const { front, back, under, left } = rolePages(book, roles);
  setPlace(front, 'front');
  if (back) setPlace(back, 'back');
  for (const wrapper of [under, left]) if (wrapper && wrapper.dataset['paperPlace'] !== 'view') setPlace(wrapper, 'under');
  const mark = (wrapper: HTMLElement | undefined, shade: string) => {
    const element = wrapper && shadeOf(wrapper);
    if (element) element.dataset['paperShade'] = shade;
  };
  if (hard) {
    mark(front, 'board');
    mark(back, 'board');
    return;
  }
  mark(under, 'cast');
  if (book.across === 1) mark(front, 'flap');
  else mark(back, 'curl');
};

const shadeAt = (shade: HTMLElement, w: number, h: number, through: Vec, toward: Vec, reach: number): void => {
  const { angle, at } = gradientAt(w, h, through, toward);
  shade.style.setProperty('--paper-shade-angle', `${angle}deg`);
  shade.style.setProperty('--paper-shade-at', `${at}px`);
  shade.style.setProperty('--paper-shade-reach', `${reach}px`);
};

// In single display the left of the spine is off the book, so the flap is cut where its image
// crosses the spine: the cut line is the spine pulled back through the fold.
const onBookSide = (hole: Vec[], mid: Vec, normal: Vec): Vec[] => {
  const a = reflect({ x: 0, y: 0 }, mid, normal);
  const b = reflect({ x: 0, y: 1 }, mid, normal);
  const inward = reflect({ x: 1, y: 0 }, mid, normal);
  const dir = { x: b.x - a.x, y: b.y - a.y };
  let n = { x: -dir.y, y: dir.x };
  if ((inward.x - a.x) * n.x + (inward.y - a.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  return splitPolygon(hole, a, n).kept;
};

const renderSoft = (book: Book, gesture: Gesture, tip: Vec): void => {
  const { roles, frame: { w, h }, cornerY } = gesture;
  const { front, back, under } = rolePages(book, roles);
  const section = sectionOf(front);
  const corner = { x: w, y: cornerY };
  const cut = crease(w, h, corner, tip);
  const frontShade = shadeOf(front);
  const backShade = back && shadeOf(back);
  const underShade = under && shadeOf(under);
  if (!cut) {
    section?.style.removeProperty('clip-path');
    if (back) back.style.clipPath = HIDDEN_CLIP;
    if (book.across === 1 && frontShade) frontShade.style.clipPath = HIDDEN_CLIP;
    if (underShade) underShade.style.clipPath = HIDDEN_CLIP;
    return;
  }
  const { kept, hole, mid, normal } = cut;
  const intoHole = { x: -normal.x, y: -normal.y };
  const depth = Math.hypot(tip.x - corner.x, tip.y - corner.y) / 2;
  if (section) section.style.clipPath = polygon(kept);

  if (book.across === 2 && back) {
    back.style.clipPath = polygon(toBackPage(hole, w));
    back.style.transformOrigin = '0 0';
    back.style.transform = matrixCss(backPageTransform(w, mid, normal));
    if (backShade) shadeAt(backShade, w, h, { x: w - mid.x, y: mid.y }, { x: normal.x, y: -normal.y }, Math.min(depth, w) * 0.9);
  } else if (book.across === 1 && frontShade) {
    frontShade.style.clipPath = polygon(onBookSide(hole, mid, normal));
    frontShade.style.transformOrigin = '0 0';
    frontShade.style.transform = matrixCss(flapTransform(mid, normal));
    shadeAt(frontShade, w, h, mid, intoHole, Math.min(depth, w) * 0.9);
  }

  if (underShade) {
    underShade.style.clipPath = polygon(hole);
    shadeAt(underShade, w, h, mid, intoHole, Math.min(depth * 0.4, w * 0.25));
  }
};

const renderHard = (book: Book, gesture: Gesture, tip: Vec): void => {
  const { roles, frame: { w } } = gesture;
  const { front, back } = rolePages(book, roles);
  const angle = hardAngle(tip.x, w);
  const perspective = `perspective(${3 * w}px)`;
  const up = angle < 90;
  front.style.transformOrigin = '0 50%';
  front.style.transform = `${perspective} rotateY(${-Math.min(angle, 90)}deg)`;
  front.style.opacity = up ? '' : '0';
  const frontShade = shadeOf(front);
  if (frontShade) frontShade.style.opacity = `${(Math.min(angle, 90) / 90) * 0.6}`;
  if (!back) return;
  back.style.transformOrigin = '100% 50%';
  back.style.transform = `${perspective} rotateY(${Math.min(180 - angle, 90)}deg)`;
  back.style.opacity = up ? '0' : '';
  const backShade = shadeOf(back);
  if (backShade) backShade.style.opacity = `${(Math.min(180 - angle, 90) / 90) * 0.6}`;
};

const render = (book: Book, gesture: Gesture, tip: Vec): void => {
  const { frame: { w, h }, cornerY } = gesture;
  const held = constrainTip(tip, w, h, cornerY);
  gesture.tip = held;
  if (gesture.hard) renderHard(book, gesture, held);
  else renderSoft(book, gesture, held);
};

const runEase = (
  duration: number, ease: (t: number) => number, draw: (eased: number) => void, done: () => void,
): (() => void) => {
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    draw(ease(t));
    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    done();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
};

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export interface BookDriver {
  /** Plays a turn of one leaf. False when there is none to turn or a gesture holds the book. */
  turn(forward: boolean): boolean;
  /** Shows `spread`, playing the last turn when `animate`. */
  go(spread: number, animate: boolean): boolean;
  busy(): boolean;
  /** Re-reads how many pages sit side by side. */
  refresh(): void;
  spreadOfPage(page: number): number;
}

export interface BookSetup {
  options: ResolvedBookOptions;
  status: HTMLElement | null;
  signal: AbortSignal;
}

const acrossOf = (book: Book): Across => {
  const first = book.pages[0];
  if (!first) return 1;
  return getComputedStyle(first).getPropertyValue('--paper-book-across').trim() === '2' ? 2 : 1;
};

/** Wires one book whose children are page wrappers. */
export function attachBook(root: HTMLElement, { options, status, signal }: BookSetup): BookDriver {
  const pages = [...root.children] as HTMLElement[];
  const book: Book = {
    root, options, status, pages, across: 1, spread: 0, gesture: null, cancelGlide: () => {},
    turning: null, settledKey: '', announcedKey: '', waiters: [],
  };
  book.across = acrossOf(book);
  book.spread = spreadOfPage(Math.min(options.startPage, pages.length - 1), book.across);
  books.set(root, book);
  const { interactions } = options;

  restPlaces(book);
  syncInert(book);
  syncCenter(book);
  book.settledKey = book.announcedKey = viewOf(book).pages.join(',');
  root.dataset['paperSettled'] = '';
  // Transitions start once the opening layout has been painted.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!signal.aborted) root.dataset['paperReady'] = '';
  }));

  const on = <K extends keyof HTMLElementEventMap>(
    target: EventTarget, type: K, listener: (event: HTMLElementEventMap[K]) => void, extra?: AddEventListenerOptions,
  ) => target.addEventListener(type, listener as EventListener, { ...extra, signal });

  const hardFor = (roles: TurnRoles): boolean => options.hardCovers && isHardLeaf(roles.leaf, pages.length, book.across);

  const begin = (kind: Gesture['kind'], forward: boolean, cornerY: 'top' | 'bottom', pointerId = -1): Gesture | null => {
    const roles = turnRoles(book.spread, forward, pages.length, book.across);
    if (!roles) return null;
    const frame = frameOf(book);
    const y = cornerY === 'top' ? 0 : frame.h;
    const hard = hardFor(roles);
    const start = forward ? { x: frame.w, y } : { x: -frame.w, y };
    const gesture: Gesture = {
      kind, pointerId, roles, fromRight: forward, hard, cornerY: y, frame, start, grab: { x: 0, y: 0 },
      gain: 1, tip: start, trail: [], travel: 0, target: 0, released: false, painted: 0, frameId: 0, idle: 0,
    };
    prepareTurn(book, roles, hard);
    if (kind !== 'tease') delete root.dataset['paperSettled'];
    book.gesture = gesture;
    render(book, gesture, start);
    return gesture;
  };

  const land = (gesture: Gesture, over: boolean): void => {
    clearTurn(book, gesture.roles);
    book.gesture = null;
    // The leaf ends on the other side from where it started: a turn forward or back.
    if (over) {
      const previous = firstInView(book);
      const direction: PaperDirection = gesture.fromRight ? 'forward' : 'back';
      commitTurn(book, direction);
      book.spread += gesture.fromRight ? 1 : -1;
      restPlaces(book);
      syncInert(book);
      syncCenter(book);
      const view = viewOf(book);
      emit(book, 'paper:change', {
        direction, index: firstInView(book), previousIndex: previous, count: pages.length, turned: firstInView(book), ...view,
      });
    } else {
      restPlaces(book);
      syncCenter(book);
    }
    delete root.dataset['paperCorner'];
    delete root.dataset['paperDragging'];
    if (gesture.kind !== 'tease' || over) settle(book);
  };

  // Eases the tip in a straight line to where the leaf lies flat, on whichever side.
  const glide = (gesture: Gesture, over: boolean, speed = 0): void => {
    const { frame: { w }, cornerY } = gesture;
    const leafOnLeft = gesture.fromRight === over;
    const to = { x: leafOnLeft ? -w : w, y: cornerY };
    gesture.released = true;
    const from = gesture.tip;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (over) commitTurn(book, gesture.fromRight ? 'forward' : 'back');
    const duration = motionMs(book, Math.max(Math.min(
      GLIDE_BASE_MS + distance / GLIDE_PX_PER_MS, GLIDE_MAX_MS, coastMs(distance, speed),
    ), GLIDE_MIN_MS));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      book.cancelGlide = () => {};
      land(gesture, over);
    };
    const cancel = runEase(duration, easeOut, (t) => {
      render(book, gesture, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }, finish);
    book.cancelGlide = () => {
      cancel();
      finish();
    };
  };

  // Plays the rest of the turn along the lifted path, from `u` (0 on the side it started) to 1.
  const play = (gesture: Gesture, u: number, ms = PLAY_MS): void => {
    const { frame: { w, h }, cornerY } = gesture;
    gesture.released = true;
    commitTurn(book, gesture.fromRight ? 'forward' : 'back');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      book.cancelGlide = () => {};
      land(gesture, true);
    };
    const along = (v: number) => turnPath(gesture.fromRight ? v : 1 - v, w, h, cornerY);
    const cancel = runEase(motionMs(book, ms * (1 - u)), u > 0 ? easeOut : easeInOut, (t) => {
      render(book, gesture, along(u + (1 - u) * t));
    }, finish);
    book.cancelGlide = () => {
      cancel();
      finish();
    };
  };

  // Ends whatever the book is doing that no hand holds: a glide or a played turn runs to its end
  // at once, and a tease lays its corner back down.
  const settleNow = () => {
    const cancel = book.cancelGlide;
    book.cancelGlide = () => {};
    cancel();
    const gesture = book.gesture;
    if (gesture?.kind === 'tease') land(gesture, false);
  };

  const local = (gesture: Gesture, e: { clientX: number, clientY: number }): Vec =>
    ({ x: e.clientX - gesture.frame.x, y: e.clientY - gesture.frame.y });

  // Which corner a client point is on, if any, and the way a drag from it turns.
  const cornerAt = (clientX: number, clientY: number): { forward: boolean, y: 'top' | 'bottom' } | null => {
    // Mid-tease a page in view may be the one folding, so the frame the tease measured stands.
    const frame = book.gesture?.frame ?? frameOf(book);
    const x = clientX - frame.x, y = clientY - frame.y;
    const reach = Math.min(frame.w * CORNER_SHARE, CORNER_MAX);
    const edge = y <= reach ? 'top' : y >= frame.h - reach ? 'bottom' : null;
    if (!edge || y < -reach || y > frame.h + reach) return null;
    const view = viewOf(book).pages;
    const hasRight = view.some((index) => book.across === 1 || index % 2 === 0);
    const hasLeft = book.across === 2 && view.some((index) => index % 2 === 1);
    const leftEdge = book.across === 1 ? 0 : -frame.w;
    if (hasRight && Math.abs(x - frame.w) <= reach && turnRoles(book.spread, true, pages.length, book.across)) return { forward: true, y: edge };
    if ((hasLeft || book.across === 1) && Math.abs(x - leftEdge) <= reach && turnRoles(book.spread, false, pages.length, book.across)) {
      return { forward: false, y: edge };
    }
    return null;
  };

  // The tease: a mouse near a corner lifts it off the page, the more the nearer it comes.
  const teaseTo = (gesture: Gesture, e: PointerEvent) => {
    const { frame, start, fromRight, cornerY } = gesture;
    const zone = Math.min(frame.w * CORNER_SHARE, CORNER_MAX);
    const reach = Math.min(frame.w * TEASE_SHARE, TEASE_MAX);
    const p = local(gesture, e);
    const grabbed = { x: fromRight ? frame.w : book.across === 1 ? 0 : -frame.w, y: cornerY };
    const near = 1 - Math.min(Math.hypot(p.x - grabbed.x, p.y - grabbed.y) / (zone * Math.SQRT2), 1);
    const lift = reach * (0.35 + 0.65 * near);
    const dir = { x: fromRight ? -0.86 : 0.86, y: cornerY === 0 ? 0.5 : -0.5 };
    render(book, gesture, { x: start.x + dir.x * lift, y: start.y + dir.y * lift });
  };

  const endTease = () => {
    const gesture = book.gesture;
    if (gesture?.kind !== 'tease' || gesture.released) return;
    glide(gesture, false);
  };

  if (interactions.drag || interactions.tease) {
    on(root, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
      if (book.gesture && book.gesture.kind !== 'tease') return;
      const corner = cornerAt(e.clientX, e.clientY);
      if (interactions.tease) {
        let live = book.gesture;
        const y = corner?.y === 'top' ? 0 : live?.frame.h;
        if (live && (live.released || !corner || live.fromRight !== corner.forward || live.cornerY !== y)) {
          if (!live.released) glide(live, false);
          live = null;
        }
        if (corner && !live) {
          settleNow();
          live = begin('tease', corner.forward, corner.y);
          if (live?.hard) {
            land(live, false);
            live = null;
          }
        }
        if (live) teaseTo(live, e);
      }
      if (!interactions.drag) return;
      if (corner) root.dataset['paperCorner'] = '';
      else delete root.dataset['paperCorner'];
    });
    on(root, 'pointerleave', () => {
      delete root.dataset['paperCorner'];
      endTease();
    });
  }

  if (interactions.drag) {
    on(root, 'pointerdown', (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      if (book.gesture && book.gesture.kind !== 'tease') return;
      if ((e.target as Element | null)?.closest?.(INTERACTIVE)) return;
      const corner = cornerAt(e.clientX, e.clientY);
      if (!corner) return;
      let gesture = book.gesture;
      if (gesture && (gesture.released || gesture.fromRight !== corner.forward)) {
        settleNow();
        gesture = null;
      }
      gesture ??= begin('drag', corner.forward, corner.y, e.pointerId);
      if (!gesture) return;
      e.preventDefault();
      gesture.kind = 'drag';
      gesture.pointerId = e.pointerId;
      delete root.dataset['paperSettled'];
      gesture.start = gesture.tip;
      gesture.grab = { x: e.clientX, y: e.clientY };
      // In single display the leaf coming back lies off the book, its corner a page away from the
      // hand: the crease follows the hand instead, so the corner moves twice as far.
      gesture.gain = book.across === 1 && !gesture.fromRight ? 2 : 1;
      root.dataset['paperDragging'] = '';
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        glide(gesture, false);
      }
    });

    on(root, 'pointermove', (e) => {
      const gesture = book.gesture;
      if (gesture?.kind !== 'drag' || e.pointerId !== gesture.pointerId) return;
      if (e.buttons === 0) {
        if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
        return;
      }
      const tip = {
        x: gesture.start.x + (e.clientX - gesture.grab.x) * gesture.gain,
        y: gesture.start.y + (e.clientY - gesture.grab.y) * gesture.gain,
      };
      render(book, gesture, tip);
      const corner = { x: gesture.frame.w, y: gesture.cornerY };
      track(gesture.trail, { tip: { x: gesture.tip.x - corner.x, y: gesture.tip.y - corner.y }, time: e.timeStamp });
    });

    on(root, 'lostpointercapture', (e) => {
      const gesture = book.gesture;
      if (gesture?.kind !== 'drag' || e.pointerId !== gesture.pointerId) return;
      const thrown = coastTip(gesture.trail, e.timeStamp);
      const x = thrown ? gesture.frame.w + thrown.at.x : gesture.tip.x;
      glide(gesture, turnCommits(x, gesture.frame.w, gesture.fromRight), thrown?.speed ?? 0);
    });
  }

  // Sideways travel walks the tip along the played path: one page width of travel turns the leaf
  // over. A release past a quarter of the way plays the rest, short of it lays the leaf back.
  const progressOf = (gesture: Gesture) => Math.min(Math.max(gesture.travel / gesture.frame.w, 0), 1);
  const walk = (gesture: Gesture, time: number) => {
    const { frame: { w, h }, cornerY } = gesture;
    const u = progressOf(gesture);
    render(book, gesture, turnPath(gesture.fromRight ? u : 1 - u, w, h, cornerY));
    track(gesture.trail, { tip: { x: gesture.tip.x - w, y: gesture.tip.y - cornerY }, time });
  };
  const releaseWalk = (gesture: Gesture, time: number) => {
    const thrown = coastTip(gesture.trail, time);
    const { w } = gesture.frame;
    const x = thrown ? w + thrown.at.x : gesture.tip.x;
    const u = progressOf(gesture);
    if (turnCommits(x, w, gesture.fromRight)) play(gesture, u);
    else glide(gesture, false);
  };

  const wheelUnit = (e: WheelEvent) => (e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? root.clientWidth : 1);

  // Claims the sideways scrolls while a wheel turn is under way, so the browser doesn't also go
  // back a page. Attached only then: a cancelling wheel listener makes every scroll over the book
  // wait for the main thread.
  const holdWheel = (e: WheelEvent) => {
    if (book.gesture?.kind !== 'wheel') {
      root.removeEventListener('wheel', holdWheel);
      return;
    }
    if (e.cancelable && Math.abs(e.deltaX) >= Math.abs(e.deltaY)) e.preventDefault();
  };

  const followWheel = (now: number) => {
    const gesture = book.gesture;
    if (gesture?.kind !== 'wheel') return;
    const span = Math.min(now - gesture.painted, 100);
    gesture.painted = now;
    const gap = gesture.target - gesture.travel;
    gesture.travel += Math.abs(gap) < 0.5 ? gap : gap * (1 - Math.exp(-span / WHEEL_SMOOTH_MS));
    walk(gesture, now);
    gesture.frameId = requestAnimationFrame(followWheel);
  };

  if (interactions.wheel) {
    on(root, 'wheel', (e) => {
      const unit = wheelUnit(e);
      const sideways = e.deltaX * unit;
      let gesture = book.gesture;
      if (gesture && gesture.kind !== 'wheel' && gesture.kind !== 'tease') return;
      if (!gesture || gesture.kind === 'tease') {
        if (Math.abs(sideways) <= Math.abs(e.deltaY * unit)) return;
        settleNow();
        gesture = begin('wheel', sideways > 0, 'bottom');
        if (!gesture) return;
        root.addEventListener('wheel', holdWheel, { passive: false, signal });
        gesture.painted = e.timeStamp;
        gesture.frameId = requestAnimationFrame(followWheel);
      }
      const live = gesture;
      live.target = Math.max(live.target + (live.fromRight ? sideways : -sideways), 0);
      clearTimeout(live.idle);
      live.idle = window.setTimeout(() => {
        if (book.gesture !== live) return;
        cancelAnimationFrame(live.frameId);
        root.removeEventListener('wheel', holdWheel);
        live.travel = live.target;
        walk(live, performance.now());
        releaseWalk(live, performance.now());
      }, WHEEL_IDLE_MS);
    }, { passive: true });
  }

  if (interactions.swipe) {
    let touch: { id: number, from: Vec } | null = null;
    on(root, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' || touch !== null || book.gesture) return;
      touch = { id: e.pointerId, from: { x: e.clientX, y: e.clientY } };
    });
    on(root, 'pointermove', (e) => {
      if (touch === null || e.pointerId !== touch.id) return;
      const sideways = e.clientX - touch.from.x;
      let gesture = book.gesture;
      if (!gesture) {
        const upright = e.clientY - touch.from.y;
        if (Math.abs(sideways) < SWIPE_START && Math.abs(upright) < SWIPE_START) return;
        if (Math.abs(sideways) <= Math.abs(upright)) {
          touch = null;
          return;
        }
        gesture = begin('swipe', sideways < 0, 'bottom', e.pointerId);
        if (!gesture) {
          touch = null;
          return;
        }
        try {
          root.setPointerCapture(e.pointerId);
        } catch { /* the finger is gone already; the release below still tidies up */ }
      }
      if (gesture.kind !== 'swipe') return;
      gesture.travel = (gesture.fromRight ? -sideways : sideways) - SWIPE_START;
      walk(gesture, e.timeStamp);
    });
    const lift = (e: PointerEvent) => {
      if (touch === null || e.pointerId !== touch.id) return;
      touch = null;
      const gesture = book.gesture;
      if (gesture?.kind === 'swipe') releaseWalk(gesture, e.timeStamp);
    };
    on(window, 'pointerup', lift);
    on(window, 'pointercancel', lift);
  }

  const turn = (forward: boolean): boolean => {
    if (book.gesture && book.gesture.kind !== 'tease') return false;
    settleNow();
    const gesture = begin('play', forward, 'bottom');
    if (!gesture) return false;
    play(gesture, 0);
    return true;
  };

  const jump = (spread: number): void => {
    settleNow();
    if (spread === book.spread) return;
    const previous = firstInView(book);
    const direction: PaperDirection = spread > book.spread ? 'forward' : 'back';
    book.spread = spread;
    restPlaces(book);
    syncInert(book);
    syncCenter(book);
    emit(book, 'paper:change', {
      direction, index: firstInView(book), previousIndex: previous, count: pages.length, turned: firstInView(book), ...viewOf(book),
    });
    settle(book);
  };

  const go = (spread: number, animate: boolean): boolean => {
    if (book.gesture && book.gesture.kind !== 'tease') return false;
    if (spread < 0 || spread >= spreadsOf(book)) return false;
    if (spread === book.spread) return true;
    if (!animate) {
      jump(spread);
      return true;
    }
    const forward = spread > book.spread;
    const neighbour = forward ? spread - 1 : spread + 1;
    if (neighbour !== book.spread) jump(neighbour);
    return turn(forward);
  };

  // Only the book itself listens, so keys inside a page's own controls stay theirs.
  if (interactions.keyboard) {
    on(root, 'keydown', (e) => {
      if (e.target !== root || e.altKey || e.ctrlKey || e.metaKey) return;
      const last = spreadsOf(book) - 1;
      const target = { ArrowRight: book.spread + 1, PageDown: book.spread + 1, ArrowLeft: book.spread - 1, PageUp: book.spread - 1, Home: 0, End: last }[e.key];
      if (target === undefined) return;
      e.preventDefault();
      if (target < 0 || target > last || target === book.spread) return;
      if (Math.abs(target - book.spread) === 1) turn(target > book.spread);
      else go(target, true);
    });
  }

  const refresh = (): void => {
    const across = acrossOf(book);
    if (across === book.across) return;
    settleNow();
    // A hand still on the leaf lets go of it: the page it holds may not be in the new layout.
    const held = book.gesture;
    if (held) {
      if (root.hasPointerCapture(held.pointerId)) root.releasePointerCapture(held.pointerId);
      if (book.gesture === held) land(held, false);
    }
    const first = firstInView(book);
    book.across = across;
    book.spread = spreadOfPage(first, across);
    restPlaces(book);
    syncInert(book);
    syncCenter(book);
    book.settledKey = book.announcedKey = viewOf(book).pages.join(',');
  };

  // A resize that crosses --paper-book-double-from changes how many pages fit side by side.
  const observer = new ResizeObserver(() => refresh());
  observer.observe(root);
  signal.addEventListener('abort', () => {
    observer.disconnect();
    delete root.dataset['paperReady'];
    settleNow();
    for (const resolve of book.waiters.splice(0)) resolve();
    root.removeEventListener('wheel', holdWheel);
    books.delete(root);
  });

  return {
    turn,
    go,
    busy: () => book.gesture !== null && book.gesture.kind !== 'tease',
    refresh,
    spreadOfPage: (page) => spreadOfPage(page, book.across),
  };
}

export function bookState(root: HTMLElement): PaperBookState {
  const book = books.get(root);
  const count = root.childElementCount;
  if (!book) {
    return {
      mode: 'book', index: 0, count, spread: 0, spreads: count, pages: [], display: 'single',
      settled: false, turning: false, canPrev: false, canNext: false,
    };
  }
  const view = viewOf(book);
  const spreads = spreadsOf(book);
  return {
    mode: 'book',
    index: view.pages[0] ?? 0,
    count,
    spread: view.spread,
    spreads,
    pages: view.pages,
    display: book.across === 2 ? 'double' : 'single',
    settled: 'paperSettled' in root.dataset,
    turning: Boolean(book.turning),
    canPrev: book.spread > 0,
    canNext: book.spread < spreads - 1,
  };
}

/** Resolves at the book's next settle, or when it is destroyed. */
export function nextBookSettle(root: HTMLElement): Promise<void> {
  const book = books.get(root);
  if (!book) return Promise.resolve();
  return new Promise((resolve) => book.waiters.push(resolve));
}
