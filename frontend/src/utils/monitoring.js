/**
 * Performance monitoring utilities
 */

/**
 * Measure component render time
 */
export const measureRender = (componentName) => {
  if (!performance.mark) return;

  const startMark = `${componentName}-start`;
  const endMark = `${componentName}-end`;
  const measureName = `${componentName}-render`;

  return {
    start: () => performance.mark(startMark),
    end: () => {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);

      const measure = performance.getEntriesByName(measureName)[0];
      console.log(`${componentName} rendered in ${measure.duration.toFixed(2)}ms`);

      // Clean up
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    },
  };
};

/**
 * Measure API call duration
 */
export const measureAPICall = (endpoint) => {
  const startTime = performance.now();

  return {
    end: () => {
      const duration = performance.now() - startTime;
      console.log(`API ${endpoint} took ${duration.toFixed(2)}ms`);

      // Send to analytics if needed
      if (window.gtag) {
        window.gtag('event', 'timing_complete', {
          name: endpoint,
          value: Math.round(duration),
          event_category: 'API',
        });
      }
    },
  };
};

/**
 * Monitor Core Web Vitals
 */
export const monitorWebVitals = () => {
  // Largest Contentful Paint (LCP)
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        console.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay (FID)
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          console.log('FID:', entry.processingStart - entry.startTime);
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift (CLS)
      let clsScore = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsScore += entry.value;
            console.log('CLS:', clsScore);
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      console.error('Web Vitals monitoring error:', error);
    }
  }
};

/**
 * Log bundle size information
 */
export const logBundleSize = () => {
  if (!performance.getEntriesByType) return;

  const resources = performance.getEntriesByType('resource');
  const scripts = resources.filter((r) => r.initiatorType === 'script');
  const styles = resources.filter((r) => r.initiatorType === 'css');

  const totalScriptSize = scripts.reduce((sum, s) => sum + (s.transferSize || 0), 0);
  const totalStyleSize = styles.reduce((sum, s) => sum + (s.transferSize || 0), 0);

  console.log('Bundle Sizes:');
  console.log(`- Scripts: ${(totalScriptSize / 1024).toFixed(2)} KB`);
  console.log(`- Styles: ${(totalStyleSize / 1024).toFixed(2)} KB`);
  console.log(`- Total: ${((totalScriptSize + totalStyleSize) / 1024).toFixed(2)} KB`);
};

/**
 * Monitor memory usage (Chrome only)
 */
export const monitorMemory = () => {
  if (!performance.memory) {
    console.log('Memory monitoring not available');
    return;
  }

  setInterval(() => {
    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
    console.log('Memory Usage:', {
      used: `${(usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      total: `${(totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      limit: `${(jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
      percentage: `${((usedJSHeapSize / jsHeapSizeLimit) * 100).toFixed(2)}%`,
    });
  }, 10000); // Every 10 seconds
};

/**
 * Get performance metrics summary
 */
export const getPerformanceMetrics = () => {
  if (!performance.timing) return null;

  const timing = performance.timing;
  const navigation = performance.navigation;

  return {
    // Page load metrics
    dns: timing.domainLookupEnd - timing.domainLookupStart,
    tcp: timing.connectEnd - timing.connectStart,
    request: timing.responseStart - timing.requestStart,
    response: timing.responseEnd - timing.responseStart,
    dom: timing.domComplete - timing.domLoading,
    total: timing.loadEventEnd - timing.navigationStart,

    // User experience metrics
    ttfb: timing.responseStart - timing.navigationStart, // Time to First Byte
    domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
    pageLoad: timing.loadEventEnd - timing.navigationStart,

    // Navigation type
    navigationType: navigation.type, // 0: navigate, 1: reload, 2: back/forward
    redirectCount: navigation.redirectCount,
  };
};
