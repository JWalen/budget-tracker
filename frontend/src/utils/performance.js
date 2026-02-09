/**
 * Debounce function calls
 * @param {Function} func Function to debounce
 * @param {number} wait Wait time in ms
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function calls
 * @param {Function} func Function to throttle
 * @param {number} limit Minimum time between calls in ms
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Memoize expensive function calls
 * @param {Function} func Function to memoize
 */
export const memoize = (func) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = func(...args);
    cache.set(key, result);
    return result;
  };
};

/**
 * Format currency with memoization
 */
export const formatCurrency = memoize((amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
});

/**
 * Format date with memoization
 */
export const formatDate = memoize((date, format = 'short') => {
  const options = format === 'short'
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  
  return new Intl.DateTimeFormat('en-US', options).format(new Date(date));
});

/**
 * Chunk array for virtual scrolling
 */
export const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Lazy load images
 */
export const lazyLoadImage = (img) => {
  const src = img.getAttribute('data-src');
  if (!src) return;

  img.src = src;
  img.removeAttribute('data-src');
};

/**
 * Intersection Observer for lazy loading
 */
export const createIntersectionObserver = (callback, options = {}) => {
  const defaultOptions = {
    root: null,
    rootMargin: '50px',
    threshold: 0.01,
    ...options,
  };

  if ('IntersectionObserver' in window) {
    return new IntersectionObserver(callback, defaultOptions);
  }

  return null;
};

/**
 * Preload critical resources
 */
export const preloadResources = (resources) => {
  resources.forEach(({ href, as, type }) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    if (type) link.type = type;
    document.head.appendChild(link);
  });
};

/**
 * Prefetch next page resources
 */
export const prefetchPage = (url) => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  document.head.appendChild(link);
};

/**
 * Check if device has low memory
 */
export const isLowEndDevice = () => {
  // Check if navigator.deviceMemory is available (Chrome only)
  if ('deviceMemory' in navigator) {
    return navigator.deviceMemory < 4; // Less than 4GB RAM
  }

  // Check if navigator.hardwareConcurrency is available
  if ('hardwareConcurrency' in navigator) {
    return navigator.hardwareConcurrency < 4; // Less than 4 CPU cores
  }

  return false; // Can't determine, assume high-end
};

/**
 * Adaptive loading based on device capabilities
 */
export const getLoadingStrategy = () => {
  const isLowEnd = isLowEndDevice();
  const isSlow = 'connection' in navigator && navigator.connection.effectiveType === '2g';

  if (isLowEnd || isSlow) {
    return {
      imageQuality: 'low',
      enableAnimations: false,
      chunkSize: 25,
      prefetch: false,
    };
  }

  return {
    imageQuality: 'high',
    enableAnimations: true,
    chunkSize: 50,
    prefetch: true,
  };
};

/**
 * Request Idle Callback polyfill
 */
export const requestIdleCallback =
  window.requestIdleCallback ||
  function (cb) {
    const start = Date.now();
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, 1);
  };

/**
 * Cancel Idle Callback polyfill
 */
export const cancelIdleCallback =
  window.cancelIdleCallback ||
  function (id) {
    clearTimeout(id);
  };

/**
 * Run task during idle time
 */
export const runWhenIdle = (task) => {
  return requestIdleCallback((deadline) => {
    if (deadline.timeRemaining() > 0) {
      task();
    } else {
      runWhenIdle(task);
    }
  });
};
