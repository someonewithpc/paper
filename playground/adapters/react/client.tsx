import { hydrateRoot } from 'react-dom/client';

import { App } from './app.js';

declare global {
  interface Window {
    hydrationErrors: string[];
  }
}

window.hydrationErrors = [];
hydrateRoot(document.getElementById('app')!, <App />, {
  onRecoverableError: (error) => window.hydrationErrors.push(String(error)),
});
