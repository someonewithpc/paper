// The corner cut and the drift, which every landing frame needs. (The drift is how far a turned
// page's corner cut stands over from its left edge, see --paper-turned-drift in the stylesheet;
// the page slides back by the same amount, so the cut stays on the stack's edge.)
//
// Both are transitioned, and every one of those transitions is started from the stack's script:
// the cut by a change of flipped state (300ms, on the stack), the drift by a renumbering (250ms,
// on the page). stirLanding marks every place that starts one, plus the two that can move the
// values without a transition at all: a resize and a theme change, both of which re-derive the
// em lengths the cut is written in.
//
// A frame never reads them off computed style. By the time a frame callback runs, the browser has
// advanced its animations and marked everything they touch for a style resolve, so a read there
// resolves the stack on the spot, and the frame's own writes then make it resolve the stack again
// before paint: two style passes and two layouts a frame, 36 to 47 forced ones a turn, 90 to
// 135 ms on a page with heavy content. Instead, after the frame that starts a transition has
// painted, the transition itself is taken from the browser: a CSSTransition carries its from and
// to values, its start time and its timing, and the value at any frame follows from those and the
// frame's own time, the very interpolation the browser paints. A frame computes it and reads
// nothing: the transition's own getters would resolve style again, so none of them is called once
// the reading is taken. A reading is taken then too, while style is still clean from the paint and
// so costs nothing, for any value that moved without a transition (reduced motion makes the
// transitions instant). Until a browser has handed a transition out once, the readings are retaken
// each frame for as long as one could still be running, so a browser that never does follows them
// one frame behind instead of not at all.

import { afterPaint } from '../internal/afterPaint.js';
import type { Vec } from '../internal/vec.js';
import { easingOf } from './geometry.js';

const LANDING_SETTLE_MS = 600;

// A transition under way: where it runs from and to, when it started on the document's timeline
// (null while the browser has yet to start it, when it still stands at from) and how it eases.
type Move = { anim: Animation, from: number, to: number, start: number | null, delay: number, duration: number, ease: (x: number) => number };
type Reading = { at: number, move: Move | null };

const CUT_X = '--paper-fold-back-x';
const CUT_Y = '--paper-fold-back-y';
const DRIFT = '--paper-turned-drift';
const CUT_NAMES = [CUT_X, CUT_Y];
const DRIFT_NAMES = [DRIFT];

const landingReadings = new WeakMap<Element, Map<string, Reading>>();
const landingLive = new WeakMap<Element, number>();
// Stirred and not yet read: the one case a frame has to go to computed style.
const landingStale = new WeakSet<Element>();
const landingPending = new WeakSet<Element>();
let movesSeen = false;

export const lengthsOf = (el: Element, ...names: string[]): number[] => {
  const style = getComputedStyle(el);
  return names.map((name) => parseFloat(style.getPropertyValue(name)));
};

const takeReadings = (el: Element, names: readonly string[]): void => {
  const moves = new Map<string, Move>();
  for (const anim of el.getAnimations()) {
    const name = (anim as CSSTransition).transitionProperty;
    if (!name || !names.includes(name)) continue;
    const effect = anim.effect as KeyframeEffect | null;
    if (!effect) continue;
    const [from, to] = effect.getKeyframes().map((k) => parseFloat(k[name] as string));
    const { delay, duration, easing } = effect.getTiming();
    const ease = easingOf(easing ?? 'linear');
    if (from === undefined || to === undefined || Number.isNaN(from) || Number.isNaN(to)) continue;
    if (typeof duration !== 'number' || !ease) continue;
    moves.set(name, { anim, from, to, start: anim.startTime as number | null, delay: delay ?? 0, duration, ease });
    movesSeen = true;
  }
  const style = getComputedStyle(el);
  const readings = new Map<string, Reading>();
  for (const name of names) {
    readings.set(name, { at: parseFloat(style.getPropertyValue(name)), move: moves.get(name) ?? null });
  }
  landingReadings.set(el, readings);
};

const readLanding = (stack: HTMLElement): void => {
  landingStale.delete(stack);
  landingPending.delete(stack);
  if (!stack.isConnected) return;
  takeReadings(stack, CUT_NAMES);
  for (const page of stack.children) takeReadings(page, DRIFT_NAMES);
  if (!movesSeen && performance.now() < (landingLive.get(stack) ?? 0)) readLandingAfterPaint(stack);
};

const readLandingAfterPaint = (stack: HTMLElement): void => {
  if (landingPending.has(stack)) return;
  landingPending.add(stack);
  afterPaint(() => readLanding(stack));
};

export const stirLanding = (stack: HTMLElement): void => {
  landingLive.set(stack, performance.now() + LANDING_SETTLE_MS);
  landingStale.add(stack);
  readLandingAfterPaint(stack);
};

// Where a value stands this frame, or nothing when it has to be read. A transition whose target
// moved again under it was started from the stack's script too, so a fresh reading is on its way.
const readingOf = (el: Element, name: string): number | undefined => {
  const reading = landingReadings.get(el)?.get(name);
  if (!reading) return undefined;
  const { move } = reading;
  if (!move) return reading.at;
  move.start ??= move.anim.startTime as number | null;
  if (move.start === null) return move.from;
  const now = document.timeline.currentTime as number | null;
  if (now === null) return undefined;
  const elapsed = now - move.start - move.delay;
  if (elapsed >= move.duration) return move.to;
  return move.from + (move.to - move.from) * move.ease(Math.max(elapsed, 0) / move.duration);
};

export const currentLanding = (sheet: HTMLElement): { back: Vec, drift: number } => {
  const stack = sheet.parentElement!;
  if (!landingStale.has(stack)) {
    const x = readingOf(stack, CUT_X);
    const y = readingOf(stack, CUT_Y);
    const drift = readingOf(sheet, DRIFT);
    if (x !== undefined && y !== undefined && drift !== undefined) return { back: { x, y }, drift: drift || 0 };
  }
  const [x = 0, y = 0, drift = 0] = lengthsOf(sheet, CUT_X, CUT_Y, DRIFT);
  return { back: { x, y }, drift: drift || 0 };
};

export const currentBackFoldSize = (sheet: HTMLElement): Vec => currentLanding(sheet).back;
