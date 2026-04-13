// Connected-first: No caching, always serve fresh from network
// Version: 2024-04-13-v2 (forces update check)
// This SW exists only to serve index.html for SPA routing

self.addEventListener('install', (event) => {
  // Force immediate activation
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean ALL old caches on activation
  event.waitUntil(
    caches.keys().then((keys) => {
      console.log('[SW] Cleaning caches:', keys);
      return Promise.all(keys.map((k) => caches.delete(k)));
    })
  );
  self.clients.claim();
  console.log('[SW] Activated - all caches cleared');
});

// Only handle SPA navigation - everything else goes to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Only handle navigate requests (page navigation)
  if (request.mode !== 'navigate') return;

  // For SPA: serve /index.html for all navigation requests
  event.respondWith(
    fetch('/index.html', { cache: 'no-store' })
      .catch(() => {
        // If network fails, at least try to serve from cache as last resort
        return caches.match('/index.html');
      })
  );
});
