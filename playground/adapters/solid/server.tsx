import { generateHydrationScript, renderToString } from '@solidjs/web';

import { App } from './app.js';

export const render = () => generateHydrationScript() + renderToString(() => <App />);
