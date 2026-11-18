// The playground's pages, shared by the server-rendered stack and the client ones.
const titles = ['Cover', 'Contents', 'Blueprint', 'Notes', 'Back matter'];

export const pages = (prefix) => titles.map((title, index) => ({
  html: `<section class="demo-page"><h2>${prefix} · ${title}</h2><p>Page ${index + 1} of ${titles.length}. Drag the bottom-right corner, swipe sideways, or use the arrow keys.</p><p><button type="button">A button on page ${index + 1}</button></p></section>`,
  ...(title === 'Blueprint' ? { surface: '#1f4f8f' } : {}),
}));
