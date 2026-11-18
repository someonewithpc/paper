import { createSSRApp } from 'vue';

import { App } from './app.js';

window.hydrationErrors = [];
const app = createSSRApp(App);
app.config.warnHandler = (message) => window.hydrationErrors!.push(message);
app.mount('#app');
