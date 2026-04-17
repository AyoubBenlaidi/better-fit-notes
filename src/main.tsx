import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { cleanupLegacyClientStorage, disableServiceWorker } from './lib/registerSW.ts';

cleanupLegacyClientStorage();
disableServiceWorker();
reloadDiscardedPage();

function reloadDiscardedPage() {
  const handlePageShow = (_event: PageTransitionEvent) => {
    const wasDiscarded = 'wasDiscarded' in document
      ? Boolean((document as Document & { wasDiscarded?: boolean }).wasDiscarded)
      : false;

    if (wasDiscarded) {
      window.location.reload();
    }
  };

  window.addEventListener('pageshow', handlePageShow, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
