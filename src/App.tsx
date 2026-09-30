import { useState } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Extracting links from active page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url) {
        setStatus('Error: Please navigate to a search page first.');
        setIsDownloading(false);
        return;
      }

      // 1. Extract all book links from the search page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const links: string[] = [];
          const selectors = [
            'article h2 a',
            'article .entry-title a',
            'h2.entry-title a',
            '.post-title a'
          ];
          const anchors = document.querySelectorAll(selectors.join(', '));

          anchors.forEach((el) => {
            const href = (el as HTMLAnchorElement).href;
            if (
              href &&
              !links.includes(href) &&
              !href.includes('/page/') &&
              !href.includes('?s=')
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

      setStatus(`Found ${allBookLinks.length} books. Resolving download triggers...`);

      let successCount = 0;

      // 2. Process each detail page
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`Processing book ${i + 1} of ${allBookLinks.length}...`);

        try {
          const res = await fetch(bookUrl);
          const htmlText = await res.text();

          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');

          // Look for direct download anchors or form submission targets
          const directPdf = doc.querySelector('a[href*=".pdf"], a[href*="download"]') as HTMLAnchorElement;
          const pdfForm = doc.querySelector('form') as HTMLFormElement;

          if (directPdf && directPdf.href) {
            chrome.downloads.download({
              url: directPdf.href,
              conflictAction: 'uniquify'
            });
            successCount++;
          } else if (pdfForm) {
            // Build form submit payload
            let actionUrl = pdfForm.getAttribute('action') || bookUrl;
            if (actionUrl.startsWith('/')) {
              actionUrl = `${new URL(bookUrl).origin}${actionUrl}`;
            }

            const formData = new FormData(pdfForm);
            const bodyParams = new URLSearchParams();
            formData.forEach((value, key) => bodyParams.append(key, value.toString()));

            const postRes = await fetch(actionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: bodyParams
            });

            // If POST request yields a direct download stream URL
            if (postRes.url) {
              chrome.downloads.download({
                url: postRes.url,
                conflictAction: 'uniquify'
              });
              successCount++;
            }
          }

          // Delay 3 seconds between requests to allow browser stream resolution
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } catch (err) {
          console.error(`Failed to process ${bookUrl}:`, err);
        }
      }

      setStatus(`Finished! Initiated ${successCount} downloads out of ${allBookLinks.length} books.`);
    } catch (err) {
      console.error('Execution error:', err);
      setStatus('An error occurred during execution.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ width: '320px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Batch File Downloader</h3>
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