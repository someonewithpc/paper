/** Which way a turn moves the stack: `forward` sends the front page to the pile, `back` brings the last one turned back over. */
export type PaperDirection = 'forward' | 'back';

/** The ways a reader can turn pages. Every one is on by default. */
export interface PaperInteractions {
  /** Drag the dog-ear in the bottom-right corner to turn the front page away. */
  drag: boolean;
  /** Drag the folded-back top-left corner to bring the last turned page back. */
  backGrab: boolean;
  /** Left and right arrow keys on the focused stack. */
  keyboard: boolean;
  /** A sideways wheel or trackpad scroll over the stack. */
  wheel: boolean;
  /** A sideways finger or pen swipe over the stack. */
  swipe: boolean;
  /** Swing the last turned page out of the fan as the pointer nears the folded-back corner. */
  tease: boolean;
}

/** Optional drawings on the front page. Both are on by default. */
export interface PaperDecorations {
  /** The paper clip over the top-left corner. The cast shadow of the dog-ear stays either way. */
  clip: boolean;
  /** The arrows that ride the flap once a release would turn the page. */
  hint: boolean;
}

/** Text the stack gives assistive technology. */
export interface PaperStrings {
  /** `aria-roledescription` of the stack. Default `"paper stack"`. */
  roleDescription: string;
  /** Hidden text the stack is described by. Default `"The left and right arrow keys turn the pages"`. */
  keys: string;
}

export interface PaperAnnounceDetail {
  /** DOM index of the page now at the front, from 0. */
  index: number;
  count: number;
  /** From the `pageTitle` option. */
  title: string | undefined;
  /** The page's content element. */
  page: HTMLElement;
}

/**
 * Something that says when the window is being resized, so the dog-ear's pulse holds still
 * meanwhile. Pass your own to share one with the rest of the page.
 */
export interface ResizeHoldSource {
  isHeld(): boolean;
  /** Calls `listener` when the hold starts (`true`) and ends (`false`). Returns the unsubscribe. */
  subscribe(listener: (held: boolean) => void): () => void;
}

export interface PaperTurnDetail {
  direction: PaperDirection;
  /** DOM index of the front page when the turn was decided. */
  from: number;
}

export interface PaperChangeDetail {
  direction: PaperDirection;
  /** DOM index of the new front page. */
  index: number;
  previousIndex: number;
  count: number;
  /** Pages in the pile behind the stack. */
  turned: number;
}

export interface PaperSettleDetail {
  index: number;
  count: number;
  turned: number;
  /** Whether the front page differs from the one the last settle left. */
  changed: boolean;
}

export interface PaperEventMap {
  /** A turn is certain to finish: a drag past the commit point, or a key, wheel, swipe or API turn as it starts. */
  'paper:turnstart': CustomEvent<PaperTurnDetail>;
  /** The stack came to rest after a `paper:turnstart`. */
  'paper:turnend': CustomEvent<PaperTurnDetail>;
  /** A different page took the front. Fires mid-turn, the moment the pages are renumbered. */
  'paper:change': CustomEvent<PaperChangeDetail>;
  /** The front page is lying flat and still, whether or not the gesture turned it. */
  'paper:settle': CustomEvent<PaperSettleDetail>;
}

declare global {
  interface HTMLElementEventMap extends PaperEventMap {}
}

export type PaperEventType = keyof PaperEventMap;

/** The events of each mode, keyed like {@link PaperModeOptions}. A mode's details extend the shared ones. */
export interface PaperModeEventMap {
  stack: PaperEventMap;
}

export type PaperEventListener<K extends PaperEventType, E extends PaperEventMap = PaperEventMap> = (event: E[K]) => void;

/** What every mode takes. `E` is the mode's event map, `A` what its `announce` is told. */
export interface PaperCommonOptions<E extends PaperEventMap = PaperEventMap, A extends PaperAnnounceDetail = PaperAnnounceDetail> {
  /** DOM index of the page at the front on load. Default `0`. */
  startPage?: number;
  /**
   * `system` follows `prefers-reduced-motion`. `reduce` lands every turn at once and holds the
   * dog-ear still whatever the system says. Default `system`.
   */
  reducedMotion?: 'system' | 'reduce';
  /** What the live region says once a turn has settled on a new page, or `false` for nothing. */
  announce?: ((detail: A) => string) | false;
  /** A page's title for `announce`. Default: `data-paper-title`, `aria-label`, then the first heading's text. */
  pageTitle?: (page: HTMLElement) => string | undefined;
  strings?: Partial<PaperStrings>;
  /** Id of an element that describes the keys, used instead of the hidden text the stack makes. */
  describedBy?: string;
  /**
   * Attributes on `<html>` whose change can move the stack's em lengths (a theme with its own
   * type). Default `["data-theme"]`. Call `refresh()` for anything else.
   */
  themeAttributes?: readonly string[];
  onTurnStart?: (detail: E['paper:turnstart']['detail']) => void;
  onTurnEnd?: (detail: E['paper:turnend']['detail']) => void;
  onChange?: (detail: E['paper:change']['detail']) => void;
  onSettle?: (detail: E['paper:settle']['detail']) => void;
}

/** A stack of pages turned from the bottom-right corner onto a pile behind it. */
export interface PaperStackOptions extends PaperCommonOptions {
  mode?: 'stack';
  interactions?: Partial<PaperInteractions>;
  /** Turning the last page forward brings the first one back to the front. Default `true`. */
  wrap?: boolean;
  decorations?: Partial<PaperDecorations>;
  /** `true` holds the pulse through window resizes, `false` never does. Default `true`. */
  resizeHold?: ResizeHoldSource | boolean;
}

/**
 * Options per mode. A new mode adds its options here with a required `mode` literal, which keeps
 * {@link PaperOptions} a discriminated union.
 */
export interface PaperModeOptions {
  stack: PaperStackOptions;
}

export type PaperMode = keyof PaperModeOptions;
export type PaperOptions = PaperModeOptions[PaperMode];

/** What every mode's state has. */
export interface PaperStateBase {
  readonly mode: PaperMode;
  /** DOM index of the page in front, or of the first page in view. */
  readonly index: number;
  readonly count: number;
  /** The pages in view are lying flat and still. */
  readonly settled: boolean;
  /** A turn is under way and certain to finish. */
  readonly turning: boolean;
  readonly canPrev: boolean;
  readonly canNext: boolean;
}

export interface PaperStackState extends PaperStateBase {
  readonly mode: 'stack';
  /** Pages in the pile behind the stack. Equals `index`. */
  readonly turned: number;
}

/** The state of each mode, keyed like {@link PaperModeOptions}. */
export interface PaperStateMap {
  stack: PaperStackState;
}

export type PaperState = PaperStateMap[PaperMode];

export interface PaperGoToOptions {
  /** Animate the last turn. Pages further away are jumped over first. Default `true`. */
  animate?: boolean;
}

/** Drives one paper root. `M` narrows `state` and the event details to one mode's. */
export interface PaperController<M extends PaperMode = PaperMode> {
  readonly root: HTMLElement;
  readonly mode: M;
  /** A snapshot, taken when read. */
  readonly state: PaperStateMap[M];
  /** Turns the front page away. Resolves `false` when there is nowhere to turn to. */
  next(): Promise<boolean>;
  /** Brings the last turned page back. Resolves `false` with nothing turned. */
  prev(): Promise<boolean>;
  goTo(index: number, options?: PaperGoToOptions): Promise<boolean>;
  /** Re-reads lengths the stack caches, after a change to its type or custom properties. */
  refresh(): void;
  /** Returns the unsubscribe. */
  on<K extends PaperEventType>(type: K, listener: PaperEventListener<K, PaperModeEventMap[M]>): () => void;
  off<K extends PaperEventType>(type: K, listener: PaperEventListener<K, PaperModeEventMap[M]>): void;
  /** Removes every listener and observer. The pages stay where they are. */
  destroy(): void;
}
