import { useState } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Reading current page links...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url || !tab.url.includes('oceanofpdf.com')) {
        setStatus('Error: Please navigate to an OceanofPDF search page first.');
        setIsDownloading(false);
        return;
      }

      // 1. Extract all rendered book detail page URLs from the active DOM
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const links: string[] = [];
          const anchors = document.querySelectorAll(
            'article h2 a, article .entry-title a, h2.entry-title a, .post-title a'
          );

          anchors.forEach((el) => {
            const href = (el as HTMLAnchorElement).href;
            if (
              href &&
              !links.includes(href) &&
              !href.includes('/page/') &&
              !href.includes('?s=') &&
              href.includes('oceanofpdf.com')
            ) {
              links.push(href);
            }
          });
          return links;
        }
      });

      const allBookLinks = results[0]?.result || [];

      if (allBookLinks.length === 0) {
        setStatus('No book links found on this page.');
        setIsDownloading(false);
        return;
      }

      setStatus(`Found ${allBookLinks.length} books. Resolving download targets...`);

      let downloadedCount = 0;

      // 2. Process each book link
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`Processing book ${i + 1} of ${allBookLinks.length}...`);

        try {
          const res = await fetch(bookUrl);
          const htmlText = await res.text();

          // Parse returned HTML text using DOMParser
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');

          // Find PDF download form or direct anchor tag
          const pdfForm = doc.querySelector('form[action*="pdf"], form[action*="download"]') as HTMLFormElement;
          const pdfLink = doc.querySelector('a[href*=".pdf"]') as HTMLAnchorElement;

          if (pdfForm && pdfForm.action) {
            // Build form data parameters if inputs are required
            const formData = new FormData(pdfForm);
            const params = new URLSearchParams();
            formData.forEach((value, key) => params.append(key, value.toString()));

            // Send POST request to get the file redirect stream
            const postRes = await fetch(pdfForm.action, {
              method: 'POST',
              body: params,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            });

            if (postRes.url) {
              chrome.downloads.download({
                url: postRes.url,
                conflictAction: 'uniquify'
              });
              downloadedCount++;
            }
          } else if (pdfLink && pdfLink.href) {
            chrome.downloads.download({
              url: pdfLink.href,
              conflictAction: 'uniquify'
            });
            downloadedCount++;
          } else {
            console.warn(`No PDF form or link found for ${bookUrl}`);
          }

          // Delay 2.5 seconds to ensure Chrome handles the file stream
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } catch (err) {
          console.error(`Error processing ${bookUrl}:`, err);
        }
      }

      setStatus(`Finished! Initiated ${downloadedCount} downloads out of ${allBookLinks.length} books.`);
    } catch (err) {
      console.error('Error during execution:', err);
      setStatus('An error occurred during execution.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ width: '320px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>OceanofPDF Batch Downloader</h3>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start Page</label>
          <input
            type="number"
            min="1"
            value={startPage}
            onChange={(e) => setStartPage(Number(e.target.value))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>End Page</label>
          <input
            type="number"
            min="1"
            value={endPage}
            onChange={(e) => setEndPage(Number(e.target.value))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      <button
        onClick={crawlAndDownload}
        disabled={isDownloading}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: isDownloading ? '#999' : '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: isDownloading ? 'not-allowed' : 'pointer'
        }}
      >
        {isDownloading ? 'Downloading...' : 'Start Download All'}
      </button>
      {status && (
        <p style={{ marginTop: '12px', fontSize: '12px', color: '#444', wordBreak: 'break-word' }}>
          {status}
        </p>
      )}
    </div>
  );
}