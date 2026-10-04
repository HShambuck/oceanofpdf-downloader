// src/content.ts

(async () => {
  const currentUrl = window.location.href;

  // STEP 1: Handle Book Detail Page
  if (currentUrl.includes('oceanofpdf.com/') && !currentUrl.includes('?s=')) {
    const pdfForm = document.querySelector('form[action*="Fetching_Resource"], form') as HTMLFormElement;
    const pdfBtn = document.querySelector('input[type="image"][src*="pdf"], input[type="image"]') as HTMLInputElement;

    if (pdfForm) {
      // Prevent form from opening target="_blank" in a new focused tab
      pdfForm.removeAttribute('target');
    }

    if (pdfBtn) {
      const rect = pdfBtn.getBoundingClientRect();
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      });
      pdfBtn.dispatchEvent(clickEvent);
    }
  }
})();