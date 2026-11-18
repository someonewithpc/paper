import { hydrate } from 'solid-js/web';

import { App } from './app.js';

window.hydrationErrors = [];
hydrate(() => <App />, document.getElementById('app')!);
