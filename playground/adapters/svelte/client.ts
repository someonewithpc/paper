import { hydrate } from 'svelte';

import App from './App.svelte';

window.hydrationErrors = [];
hydrate(App, { target: document.getElementById('app')! });
