import { generateHydrationScript, renderToString } from 'solid-js/web';

import { App } from './app.js';

export const render = () => generateHydrationScript() + renderToString(() => <App />);
