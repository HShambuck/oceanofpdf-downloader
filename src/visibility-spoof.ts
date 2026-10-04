(() => {
  // Override page visibility attributes on document start
  try {
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });

    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true
    });

    window.addEventListener(
      'visibilitychange',
      (e) => {
        e.stopImmediatePropagation();
      },
      true
    );
  } catch (e) {
    // Ignore override errors on non-HTML pages
  }
})();