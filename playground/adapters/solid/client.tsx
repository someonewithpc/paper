import { hydrate } from '@solidjs/web';

import { App } from './app.js';

window.hydrationErrors = [];
hydrate(() => <App />, document.getElementById('app')!);
