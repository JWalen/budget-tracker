// PWA helpers. Deliberately does NOT persist auth tokens or financial data to
// IndexedDB/Cache — see service-worker.js for the caching-safety rationale.

/**
 * Register the service worker and wire an update flow. When a new SW is waiting,
 * `onUpdate` is called so the app can prompt the user to reload.
 */
export const registerServiceWorker = ({ onUpdate } = {}) => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        // Detect a new worker taking over and surface an update prompt.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              if (onUpdate) onUpdate(registration);
            }
          });
        });

        // Check for updates periodically.
        setInterval(() => registration.update(), 60_000);
      })
      .catch((error) => console.error('SW registration failed:', error));
  });
};

/** Tell a waiting worker to activate, then reload once it takes control. */
export const applyUpdate = (registration) => {
  const waiting = registration?.waiting;
  if (!waiting) return;
  waiting.postMessage('SKIP_WAITING');
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
};

/**
 * Purge every Cache Storage entry. Call on logout so no cached asset/response
 * lingers for the next person on a shared device.
 */
export const clearAppCaches = async () => {
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage('CLEAR_CACHES');
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch (error) {
    console.error('Failed to clear caches:', error);
  }
};

/** Request notification permission (no-op if unsupported or already decided). */
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    return (await Notification.requestPermission()) === 'granted';
  }
  return false;
};

/** Whether the app is running as an installed PWA. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

let deferredPrompt = null;

export const setupInstallPrompt = (onInstallable) => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (onInstallable) onInstallable(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (onInstallable) onInstallable(false);
  });
};

export const promptInstall = async () => {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
};

/** Subscribe to online/offline changes; returns an unsubscribe function. */
export const setupOnlineStatus = (onStatusChange) => {
  const update = () => onStatusChange(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
};
