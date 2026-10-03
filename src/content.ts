// src/content.ts

(async () => {
  const currentUrl = window.location.href;

  // STEP 1: If on a Book Detail Page, find and dispatch genuine click on PDF image button
  if (currentUrl.includes('oceanofpdf.com/') && !currentUrl.includes('?s=')) {
    const pdfBtn = document.querySelector('input[type="image"][src*="pdf"], input[type="image"]') as HTMLInputElement;

    if (pdfBtn) {
      // Simulate authentic mouse click with coordinates
      const rect = pdfBtn.getBoundingClientRect();
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      });
      pdfBtn.dispatchEvent(clickEvent);
      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', message: 'Triggered PDF form submission...' });
    }
  }

  // STEP 2: If on degital5 timer page, let its internal JS run
  if (currentUrl.includes('degital5.com')) {
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', message: 'On timer page. Awaiting download stream...' });
  }
})();