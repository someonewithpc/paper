/** @jsxImportSource solid-js */
import {
  children as resolveChildren, createEffect, createMemo, createSignal, For, onCleanup, Show, splitProps as split, untrack,
  type Accessor, type JSX,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';

import {
  createFor, liveOptions, markupKey, markupOf, optionsKey, splitProps, watchState, type AdapterOptions,
} from '@someonewithpc/paper/adapter';
import type { Attributes, MarkupElement, PaperController, PaperMode, PaperStateMap } from '@someonewithpc/paper';

/** What both components take besides the mode's options. Other HTML attributes go on the root. */
export interface PaperComponentProps<M extends PaperMode> extends Omit<JSX.HTMLAttributes<HTMLElement>, 'children' | 'onChange' | 'ref'> {
  /** One page per child element. */
  children?: JSX.Element;
  /** Tag of the root. Default `div`. */
  as?: keyof HTMLElementTagNameMap;
  /** Accessible name of the root. */
  label?: string;
  /** The root's id, and the base of the ids the markup needs. */
  id?: string;
  /** Per page, its `--paper-surface`: any CSS `<color>` or `<image>`. */
  surfaces?: readonly (string | undefined)[];
  /** Called with each controller made, and with null when it goes. */
  ref?: (controller: PaperController<M> | null) => void;
}

export type PaperStackProps = PaperComponentProps<'stack'> & AdapterOptions['stack'];
export type PaperBookProps = PaperComponentProps<'book'> & AdapterOptions['book'];

const OWN = ['children', 'as', 'label', 'id', 'surfaces', 'ref', 'class', 'style'] as const;

// Solid takes an empty string for a boolean attribute as false.
const withBooleans = (attributes: Attributes): Record<string, string | boolean> =>
  'hidden' in attributes ? { ...attributes, hidden: true } : attributes;

const Chrome = (props: { element: MarkupElement }) => (
  <Dynamic component={props.element.tag} {...withBooleans(props.element.attributes)} innerHTML={props.element.html} />
);

// Whitespace between pages is no page. On a server the children are strings and template objects.
const isPage = (node: unknown): boolean =>
  typeof Node === 'undefined' ? !(typeof node === 'string' && !node.trim()) && node != null && node !== false
    : node instanceof Element;

function Paper<M extends PaperMode>(props: PaperComponentProps<M> & AdapterOptions[M] & { mode: M }) {
  const [own, rest] = split(props, OWN);
  const resolved = resolveChildren(() => own.children);
  const pages = createMemo(() => resolved.toArray().filter(isPage));
  const options = createMemo(() => {
    const { mode: _, ...others } = rest as Record<string, unknown>;
    return splitProps(props.mode, others).options;
  });
  const attributes = createMemo(() => {
    const { mode: _, ...others } = rest as Record<string, unknown>;
    return splitProps(props.mode, others).rest;
  });
  const key = createMemo(() => optionsKey(options()));
  const markup = createMemo(() => {
    const input = { pageCount: pages().length, tag: own.as, label: own.label, id: own.id, surfaces: own.surfaces };
    void key();
    return input.pageCount ? markupOf(props.mode, input, untrack(options)) : null;
  });
  const shape = createMemo(() => {
    const value = markup();
    return value ? markupKey(value) : '';
  });

  const [root, setRoot] = createSignal<HTMLElement>();
  createEffect(() => {
    void shape();
    void key();
    const element = root();
    if (!element) return;
    const created = untrack(() => createFor(props.mode, element, liveOptions(options(), () => options())));
    untrack(() => own.ref?.(created));
    onCleanup(() => {
      created.destroy();
      untrack(() => own.ref?.(null));
    });
  });

  const rootProps = (ownClass: string | undefined, ownStyle: string | undefined) => {
    const className = [ownClass, own.class].filter(Boolean).join(' ');
    const style = [ownStyle, typeof own.style === 'string' ? own.style : ''].filter(Boolean).join('; ');
    return { ...(own.id ? { id: own.id } : {}), ...(className ? { class: className } : {}), ...(style ? { style } : {}) };
  };

  // A new shape is a new root: the script has moved things around inside the old one.
  return (
    <Show when={shape()} keyed>
      {(_) => {
        const current = markup()!;
        const { class: ownClass, style: ownStyle, ...rootAttributes } = current.attributes;
        return (
          <>
            <Dynamic component={current.tag} {...rootAttributes} {...attributes()} {...rootProps(ownClass, ownStyle)} ref={setRoot}>
              <For each={current.pages}>
                {(wrapper, index) => (
                  <div {...wrapper.attributes}>
                    <For each={wrapper.beforeElements}>{(element) => <Chrome element={element} />}</For>
                    {pages()[index()] as JSX.Element}
                    <For each={wrapper.afterElements}>{(element) => <Chrome element={element} />}</For>
                  </div>
                )}
              </For>
            </Dynamic>
            <For each={current.afterElements}>{(element) => <Chrome element={element} />}</For>
          </>
        );
      }}
    </Show>
  );
}

/** A stack of pages turned from the corner. */
export function PaperStack(props: PaperStackProps): JSX.Element {
  return <Paper {...props} mode="stack" />;
}

/** A book of pages turned across the spine. */
export function PaperBook(props: PaperBookProps): JSX.Element {
  return <Paper {...props} mode="book" />;
}

export interface UsePaper<M extends PaperMode> {
  /** Pass as the component's `ref`. */
  ref: (controller: PaperController<M> | null) => void;
  controller: Accessor<PaperController<M> | null>;
  /** The controller's state, kept up to date by its events. Null until it mounts. */
  state: Accessor<PaperStateMap[M] | null>;
}

/** The controller of a `<PaperStack>` or `<PaperBook>` and its state, for rendering from. */
export function usePaper<M extends PaperMode = 'stack'>(): UsePaper<M> {
  const [controller, setController] = createSignal<PaperController<M> | null>(null);
  const [state, setState] = createSignal<PaperStateMap[M] | null>(null);
  createEffect(() => {
    const current = controller();
    if (!current) {
      setState(null);
      return;
    }
    onCleanup(watchState(current, (next) => setState(() => next)));
  });
  return { ref: (value) => setController(() => value), controller, state };
}

export type * from '@someonewithpc/paper';
