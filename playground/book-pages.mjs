// The playground's book pages, shared by the server-rendered book and the client ones.
const titles = ['Cover', 'Inside cover', 'Contents', 'Chapter one', 'Chapter two', 'Plates', 'Chapter three', 'Notes', 'Index', 'Back cover'];

export const bookPages = (prefix, count = titles.length) => titles.slice(0, count).map((title, index) => ({
  html: `<section class="demo-leaf"><h2>${prefix} · ${title}</h2><p>Page ${index + 1} of ${count}. Drag a corner across the spine, swipe sideways, or use the arrow keys.</p><p><button type="button">A button on page ${index + 1}</button></p></section>`,
  ...(title === 'Plates' ? { surface: '#1f4f8f' } : {}),
}));
