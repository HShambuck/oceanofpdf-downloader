(() => {
  // Spoof visibility properties on background tabs
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
})();