import type { ResizeHoldSource } from '../types.js';

// The dog-ear's pulse holds still while the window is being resized, from the first resize
// event until the size has held for HOLD_MS and for HOLD_FRAMES frames that began after the last
// one. On a slow machine, where one frame of a drag can take longer than HOLD_MS, the frames
// decide, so the hold does not lapse between two frames of the same drag.
const HOLD_MS = 300;
const HOLD_FRAMES = 4;

let holding = false;
let looping = false;
let lastResize = 0;
let quietFrames = 0;
let listening = false;
const listeners = new Set<(held: boolean) => void>();

function tick(frameStart: number) {
  if (frameStart > lastResize) quietFrames += 1;
  if (holding && quietFrames >= HOLD_FRAMES && performance.now() - lastResize >= HOLD_MS) {
    holding = false;
    for (const listener of [...listeners]) listener(false);
  }
  looping = holding;
  if (looping) requestAnimationFrame(tick);
}

function onResize() {
  lastResize = performance.now();
  quietFrames = 0;
  if (!holding) {
    holding = true;
    for (const listener of [...listeners]) listener(true);
  }
  if (!looping) {
    looping = true;
    requestAnimationFrame(tick);
  }
}

export const windowResizeHold: ResizeHoldSource = {
  isHeld: () => holding,
  subscribe(listener) {
    if (!listening) {
      listening = true;
      window.addEventListener('resize', onResize, { passive: true });
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const noResizeHold: ResizeHoldSource = {
  isHeld: () => false,
  subscribe: () => () => {},
};
