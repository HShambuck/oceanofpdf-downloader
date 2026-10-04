(async () => {
  const currentUrl = window.location.href;

  if (currentUrl.includes('oceanofpdf.com/') && !currentUrl.includes('?s=')) {
    const pdfForm = document.querySelector('form[action*="Fetching_Resource"], form') as HTMLFormElement;
    const pdfBtn = document.querySelector('input[type="image"][src*="pdf"], input[type="image"]') as HTMLInputElement;

    if (pdfForm) {
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