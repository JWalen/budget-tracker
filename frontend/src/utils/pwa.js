/**
 * Register service worker for PWA support
 */
export const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered:', registration);

          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Every minute
        })
        .catch((error) => {
          console.error('SW registration failed:', error);
        });
    });
  }
};

/**
 * Request notification permission
 */
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

/**
 * Show local notification
 */
export const showNotification = (title, options) => {
  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body: options.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        ...options,
      });
    });
  }
};

/**
 * Check if app is running standalone (PWA)
 */
export const isStandalone = () => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
};

/**
 * Prompt user to install PWA
 */
let deferredPrompt = null;

export const setupInstallPrompt = (onInstallable) => {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing
    e.preventDefault();
    deferredPrompt = e;
    
    if (onInstallable) {
      onInstallable(true);
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    deferredPrompt = null;
    
    if (onInstallable) {
      onInstallable(false);
    }
  });
};

export const promptInstall = async () => {
  if (!deferredPrompt) {
    return false;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log(`User ${outcome} the install prompt`);
  deferredPrompt = null;
  
  return outcome === 'accepted';
};

/**
 * Check online/offline status
 */
export const setupOnlineStatus = (onStatusChange) => {
  const updateOnlineStatus = () => {
    const isOnline = navigator.onLine;
    onStatusChange(isOnline);
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Initial check
  updateOnlineStatus();

  // Cleanup function
  return () => {
    window.removeEventListener('online', updateOnlineStatus);
    window.removeEventListener('offline', updateOnlineStatus);
  };
};

/**
 * Register background sync
 */
export const registerBackgroundSync = async (tag) => {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register(tag);
      console.log('Background sync registered:', tag);
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }
  return false;
};

/**
 * Save transaction for offline sync
 */
export const saveOfflineTransaction = async (transaction) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BudgetTrackerDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('pendingTransactions', 'readwrite');
      const store = tx.objectStore('pendingTransactions');

      const addRequest = store.add({
        data: transaction,
        token: localStorage.getItem('token'),
        timestamp: new Date().toISOString(),
      });

      addRequest.onsuccess = () => {
        // Register sync
        registerBackgroundSync('sync-transactions');
        resolve(addRequest.result);
      };

      addRequest.onerror = () => reject(addRequest.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingTransactions')) {
        db.createObjectStore('pendingTransactions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
};

/**
 * Get pending offline transactions
 */
export const getPendingTransactions = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BudgetTrackerDB', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('pendingTransactions', 'readonly');
      const store = tx.objectStore('pendingTransactions');
      const getRequest = store.getAll();

      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
};
