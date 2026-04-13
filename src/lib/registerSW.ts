export function registerServiceWorker() {
  // Never run the SW in dev — Vite's dev server and a caching SW are incompatible.
  // The SW would serve stale cached files instead of Vite's freshly transformed modules,
  // causing the app to load an outdated module graph and render a blank page on refresh.
  if (!import.meta.env.PROD) return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('[SW] Registered', reg.scope);
          
          // Check for updates immediately and every 10 seconds
          reg.update();
          setInterval(() => reg.update(), 10000);
          
          // Listen for controller change (new SW activated)
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[SW] Controller changed - new version activated');
          });
        })
        .catch((err) => {
          console.warn('[SW] Registration failed', err);
        });
    });
  }
}
