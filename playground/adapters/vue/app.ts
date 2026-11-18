import { defineComponent, h, ref } from 'vue';

import { PaperBook, PaperStack, usePaper } from '@hsal/paper/vue';

import { bookPages, pageText, stackPages } from '../content.js';

export const App = defineComponent(() => {
  const shown = ref(true);
  const changes = ref(0);
  const stack = usePaper();
  const book = usePaper<'book'>();
  const counted = () => ++changes.value;
  return () => [
    h('p', [h('button', { type: 'button', id: 'toggle', onClick: () => (shown.value = !shown.value) }, shown.value ? 'Unmount' : 'Mount')]),
    shown.value
      ? [
          h(PaperStack, { ref: stack.ref, id: 'stack', label: 'Vue stack', class: 'demo-stack', onChange: counted }, () =>
            stackPages.map((title) => h('section', { key: title, class: 'demo-page' }, [h('h2', title), h('p', pageText)]))),
          h(PaperBook, { ref: book.ref, id: 'book', label: 'Vue book', class: 'demo-book', display: 'double', onChange: counted }, () =>
            bookPages.map((title) => h('section', { key: title, class: 'demo-leaf' }, [h('h2', title), h('p', pageText)]))),
        ]
      : null,
    h('p', [
      'Stack page ', h('output', { id: 'stack-state' }, String(stack.state.value?.index ?? 'none')),
      ', book spread ', h('output', { id: 'book-state' }, String(book.state.value?.spread ?? 'none')),
      ', changes ', h('output', { id: 'changes' }, String(changes.value)),
    ]),
  ];
});
