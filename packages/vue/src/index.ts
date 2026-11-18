import {
  Comment, computed, defineComponent, Fragment, h, onBeforeUnmount, onMounted, onUpdated, shallowRef, Text,
  type ComputedRef, type ShallowRef, type SlotsType, type VNode, type VNodeChild,
} from 'vue';

import {
  createFor, liveOptions, markupKey, markupOf, OPTION_KEYS, optionsKey, splitProps, watchState, type AdapterOptions,
} from '@someonewithpc/paper/adapter';
import type { MarkupElement, PaperController, PaperMode, PaperModeEventMap, PaperStateMap } from '@someonewithpc/paper';

type Callback = 'onTurnStart' | 'onTurnEnd' | 'onChange' | 'onSettle';

/** What both components take besides the mode's options. Other attributes go on the root. */
export interface PaperComponentProps {
  /** Tag of the root. Default `div`. */
  as?: keyof HTMLElementTagNameMap;
  /** Accessible name of the root. */
  label?: string;
  /** The root's id, and the base of the ids the markup needs. */
  id?: string;
  /** Per page, its `--paper-surface`: any CSS `<color>` or `<image>`. */
  surfaces?: readonly (string | undefined)[];
}

/** The mode's options, less the callbacks, which are events here. */
export type PaperStackProps = PaperComponentProps & Omit<AdapterOptions['stack'], Callback>;
export type PaperBookProps = PaperComponentProps & Omit<AdapterOptions['book'], Callback>;

type Detail<M extends PaperMode, K extends keyof PaperModeEventMap[M]> =
  PaperModeEventMap[M][K] extends CustomEvent<infer D> ? D : never;

export type PaperEmits<M extends PaperMode> = {
  turnStart: (detail: Detail<M, 'paper:turnstart'>) => true;
  turnEnd: (detail: Detail<M, 'paper:turnend'>) => true;
  change: (detail: Detail<M, 'paper:change'>) => true;
  settle: (detail: Detail<M, 'paper:settle'>) => true;
};

/** What a template ref on `<PaperStack>` or `<PaperBook>` holds. */
export interface PaperExposed<M extends PaperMode> {
  /** Null until mounted. A changed option makes a new one. */
  readonly controller: PaperController<M> | null;
  readonly state: PaperStateMap[M] | null;
}

const EVENTS = { onTurnStart: 'turnStart', onTurnEnd: 'turnEnd', onChange: 'change', onSettle: 'settle' } as const;
const emits = { turnStart: () => true, turnEnd: () => true, change: () => true, settle: () => true } as const;

const element = ({ tag, attributes, html }: MarkupElement): VNode => h(tag, html ? { ...attributes, innerHTML: html } : attributes);

// A v-for in the slot comes as a fragment, and comments and whitespace between pages are no pages.
const pagesOf = (children: VNodeChild): VNode[] => {
  if (Array.isArray(children)) return children.flatMap(pagesOf);
  if (!children || typeof children !== 'object') return [];
  const node = children as VNode;
  if (node.type === Fragment) return pagesOf(node.children as VNodeChild);
  if (node.type === Comment) return [];
  if (node.type === Text && !String(node.children).trim()) return [];
  return [node];
};

const hyphenate = (name: string) => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));

// One string, so a re-render with the same style leaves the root's style alone: Vue writes every
// property of an object style on each patch, over what the script wrote meanwhile.
const styleText = (style: unknown): string => {
  if (!style) return '';
  if (typeof style === 'string') return style;
  if (Array.isArray(style)) return style.map(styleText).filter(Boolean).join('; ');
  return Object.entries(style as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => `${hyphenate(name)}: ${String(value)}`).join('; ');
};

const classText = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(classText).filter(Boolean).join(' ');
  return Object.entries(value as Record<string, unknown>).filter(([, on]) => on).map(([name]) => name).join(' ');
};

const nonEmpty = (name: string, value: string) => (value ? { [name]: value } : {});

function setupPaper<M extends PaperMode>(
  mode: M,
  props: PaperComponentProps & Record<string, unknown>,
  { slots, attrs, emit, expose }: {
    slots: { default?: () => VNodeChild }, attrs: Record<string, unknown>,
    emit: (event: string, detail: unknown) => void, expose: (exposed: Record<string, unknown>) => void,
  },
) {
  const options = computed(() => {
    const { options: own } = splitProps(mode, props);
    for (const [callback, event] of Object.entries(EVENTS)) {
      (own as Record<string, unknown>)[callback] = (detail: unknown) => emit(event, detail);
    }
    return own;
  });
  const key = computed(() => optionsKey(options.value));

  const root = shallowRef<HTMLElement | null>(null);
  const controller = shallowRef<PaperController<M> | null>(null);
  const state = shallowRef<PaperStateMap[M] | null>(null);
  expose({ controller, state });

  let made: { root: HTMLElement, key: string, unwatch: () => void } | null = null;
  const teardown = () => {
    if (!made) return;
    made.unwatch();
    controller.value?.destroy();
    controller.value = null;
    state.value = null;
    made = null;
  };
  const sync = () => {
    if (made && made.root === root.value && made.key === key.value) return;
    teardown();
    if (!root.value) return;
    const created = createFor(mode, root.value, liveOptions(options.value, () => options.value));
    controller.value = created;
    made = { root: root.value, key: key.value, unwatch: watchState(created, (next) => { state.value = next; }) };
  };
  onMounted(sync);
  onUpdated(sync);
  onBeforeUnmount(teardown);

  let cached: { input: string, markup: ReturnType<typeof markupOf>, shape: string } | null = null;
  return () => {
    const pages = pagesOf(slots.default?.());
    if (!pages.length) return null;
    const input = { pageCount: pages.length, tag: props.as, label: props.label, id: props.id, surfaces: props.surfaces };
    const inputKey = JSON.stringify([input, key.value]);
    if (cached?.input !== inputKey) {
      const markup = markupOf(mode, input, options.value);
      cached = { input: inputKey, markup, shape: markupKey(markup) };
    }
    const { markup, shape } = cached;
    const { class: ownClass, style: ownStyle, ...own } = markup.attributes;
    const { class: givenClass, style: givenStyle, ...given } = attrs;
    const wrappers = pages.map((page, index) => {
      const wrapper = markup.pages[index]!;
      return h('div', { key: index, ...wrapper.attributes }, [
        ...wrapper.beforeElements.map(element), page, ...wrapper.afterElements.map(element),
      ]);
    });
    // A new shape is a new root: the script has moved things around inside the old one.
    return h(Fragment, { key: shape }, [
      h(markup.tag, {
        ...own,
        ...given,
        ...(props.id === undefined ? {} : { id: props.id }),
        ...nonEmpty('class', [ownClass, classText(givenClass)].filter(Boolean).join(' ')),
        ...nonEmpty('style', [ownStyle, styleText(givenStyle)].filter(Boolean).join('; ')),
        ref: root,
      }, wrappers),
      ...markup.afterElements.map(element),
    ]);
  };
}

const propsOf = (mode: PaperMode): string[] =>
  ['as', 'label', 'id', 'surfaces', ...OPTION_KEYS[mode].filter((name) => !(name in EVENTS))];

/** A stack of pages turned from the corner, one per element in the default slot. */
export const PaperStack = defineComponent<PaperStackProps, PaperEmits<'stack'>, string, SlotsType<{ default?: () => VNodeChild }>>(
  (props, context) => setupPaper('stack', props as PaperStackProps & Record<string, unknown>, context as never),
  { name: 'PaperStack', inheritAttrs: false, props: propsOf('stack') as (keyof PaperStackProps)[], emits: emits as unknown as PaperEmits<'stack'> },
);

/** A book of pages turned across the spine, one per element in the default slot. */
export const PaperBook = defineComponent<PaperBookProps, PaperEmits<'book'>, string, SlotsType<{ default?: () => VNodeChild }>>(
  (props, context) => setupPaper('book', props as PaperBookProps & Record<string, unknown>, context as never),
  { name: 'PaperBook', inheritAttrs: false, props: propsOf('book') as (keyof PaperBookProps)[], emits: emits as unknown as PaperEmits<'book'> },
);

export interface UsePaper<M extends PaperMode> {
  /** Pass as the component's `ref`. */
  ref: (instance: unknown) => void;
  controller: ComputedRef<PaperController<M> | null>;
  /** The controller's state, kept up to date by its events. Null until it mounts. */
  state: ComputedRef<PaperStateMap[M] | null>;
}

/** The controller of a `<PaperStack>` or `<PaperBook>` and its state, for rendering from. */
export function usePaper<M extends PaperMode = 'stack'>(): UsePaper<M> {
  const instance: ShallowRef<PaperExposed<M> | null> = shallowRef(null);
  return {
    ref: (value) => {
      instance.value = (value as PaperExposed<M> | null) ?? null;
    },
    controller: computed(() => instance.value?.controller ?? null),
    state: computed(() => instance.value?.state ?? null),
  };
}

export type * from '@someonewithpc/paper';
