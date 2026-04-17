const LEGACY_STORAGE_KEYS = ['bfn-auth-store', 'bfn-query-cache', 'bfn-session-store'];

export function cleanupLegacyClientStorage() {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('[Client] Failed to clear legacy local storage', error);
  }
}

export function disableServiceWorker() {
  if (typeof window === 'undefined') return;

  window.addEventListener(
    'load',
    () => {
      void teardownServiceWorkers();
    },
    { once: true },
  );
}

async function teardownServiceWorkers() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.allSettled(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }
  } catch (error) {
    console.warn('[SW] Failed to disable service worker cleanly', error);
  }
}
