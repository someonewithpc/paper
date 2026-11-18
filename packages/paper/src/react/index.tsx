'use client';

import {
  Children, createElement, forwardRef, Fragment, isValidElement, useCallback, useEffect, useImperativeHandle, useMemo,
  useRef, useState, type CSSProperties, type ForwardedRef, type HTMLAttributes, type ReactElement, type ReactNode,
} from 'react';

import {
  createFor, liveOptions, markupKey, markupOf, optionsKey, parseStyle, splitProps, watchState, type AdapterOptions,
} from '../adapters/shared.js';
import type { Attributes, MarkupElement } from '../markup.js';
import type { PaperController, PaperMode, PaperStateMap } from '../types.js';

/** What both components take besides the mode's options. Other HTML attributes go on the root. */
export interface PaperComponentProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onChange'> {
  /** One page per child element. */
  children?: ReactNode;
  /** Tag of the root. Default `div`. */
  as?: keyof HTMLElementTagNameMap;
  /** Accessible name of the root. */
  label?: string;
  /** The root's id, and the base of the ids the markup needs. */
  id?: string;
  /** Per page, its `--paper-surface`: any CSS `<color>` or `<image>`. */
  surfaces?: readonly (string | undefined)[];
}

export type PaperStackProps = PaperComponentProps & AdapterOptions['stack'];
export type PaperBookProps = PaperComponentProps & AdapterOptions['book'];

const camel = (name: string) => (name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()));

const styleObject = (css: string | undefined): CSSProperties =>
  Object.fromEntries(parseStyle(css ?? '').map(([name, value]) => [camel(name), value])) as CSSProperties;

const reactAttributes = (attributes: Attributes): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') props['className'] = value;
    else if (name === 'style') props['style'] = styleObject(value);
    else if (name === 'hidden') props['hidden'] = true;
    else props[name] = value;
  }
  return props;
};

const element = ({ tag, attributes, html }: MarkupElement, key: number) =>
  createElement(tag, { ...reactAttributes(attributes), key, ...(html ? { dangerouslySetInnerHTML: { __html: html } } : {}) });

function usePaperRoot<M extends PaperMode>(mode: M, props: PaperComponentProps & AdapterOptions[M], ref: ForwardedRef<PaperController<M>>) {
  const { children, as, label, id, surfaces, className, style, ...others } = props;
  const { options, rest } = splitProps(mode, others);
  const pages = Children.toArray(children).filter(isValidElement) as ReactElement[];
  const count = pages.length;
  const key = optionsKey(options);
  const surfacesKey = JSON.stringify(surfaces ?? []);

  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  // The options are read through `key`, so a new object with the same options keeps the markup.
  const markup = useMemo(
    () => (count ? markupOf(mode, { pageCount: count, tag: as, label, id, surfaces }, options) : null),
    [mode, count, as, label, id, surfacesKey, key],
  );
  const shape = markup ? markupKey(markup) : '';

  const root = useRef<HTMLElement>(null);
  const [controller, setController] = useState<PaperController<M> | null>(null);
  useEffect(() => {
    if (!root.current) return;
    const created = createFor(mode, root.current, liveOptions(latest.current, () => latest.current));
    setController(created);
    return () => created.destroy();
  }, [mode, shape, key]);

  useImperativeHandle(ref, () => controller as PaperController<M>, [controller]);

  if (!markup) return null;
  const { class: ownClass, style: ownStyle, ...attributes } = markup.attributes;
  const wrappers = pages.map((page, index) => {
    const wrapper = markup.pages[index]!;
    return (
      <div key={index} {...reactAttributes(wrapper.attributes)}>
        {wrapper.beforeElements.map(element)}
        {page}
        {wrapper.afterElements.map(element)}
      </div>
    );
  });
  // A new shape is a new root: the script has moved things around inside the old one.
  return (
    <Fragment key={shape}>
      {createElement(markup.tag, {
        ...reactAttributes(attributes),
        ...rest,
        id,
        ref: root,
        className: [ownClass, className].filter(Boolean).join(' ') || undefined,
        style: { ...styleObject(ownStyle), ...style },
      }, wrappers)}
      {markup.afterElements.map(element)}
    </Fragment>
  );
}

/** A stack of pages turned from the corner. The ref is its controller, once mounted. */
export const PaperStack = forwardRef<PaperController<'stack'>, PaperStackProps>(function PaperStack(props, ref) {
  return usePaperRoot('stack', props, ref);
});

/** A book of pages turned across the spine. The ref is its controller, once mounted. */
export const PaperBook = forwardRef<PaperController<'book'>, PaperBookProps>(function PaperBook(props, ref) {
  return usePaperRoot('book', props, ref);
});

export interface UsePaper<M extends PaperMode> {
  /** Pass as the component's `ref`. */
  ref: (controller: PaperController<M> | null) => void;
  controller: PaperController<M> | null;
  /** The controller's state, kept up to date by its events. Null until it mounts. */
  state: PaperStateMap[M] | null;
}

/** The controller of a `<PaperStack>` or `<PaperBook>` and its state, for rendering from. */
export function usePaper<M extends PaperMode = 'stack'>(): UsePaper<M> {
  const [controller, setController] = useState<PaperController<M> | null>(null);
  const [state, setState] = useState<PaperStateMap[M] | null>(null);
  const ref = useCallback((value: PaperController<M> | null) => setController(value), []);
  useEffect(() => {
    if (!controller) {
      setState(null);
      return;
    }
    return watchState(controller, setState);
  }, [controller]);
  return { ref, controller, state };
}

export type * from '../types.js';
