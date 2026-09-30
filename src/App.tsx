import { useState } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Extracting book links from search page...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url) {
        setStatus('Error: Please navigate to an OceanofPDF search page first.');
        setIsDownloading(false);
        return;
      }

      // 1. Grab all book detail links rendered on the current search page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const links: string[] = [];
          const selectors = ['article h2 a', 'article .entry-title a', 'h2.entry-title a', '.post-title a'];
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

      setStatus(`Found ${allBookLinks.length} books. Opening tabs to trigger downloads...`);

      let successCount = 0;

      // 2. Open each book URL in a tab to let its JS execute the download
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`Processing book ${i + 1} of ${allBookLinks.length}...`);

        try {
          // Create a new background tab for the book
          const newTab = await chrome.tabs.create({ url: bookUrl, active: false });

          if (newTab.id) {
            // Wait 4 seconds for the detail page DOM and download scripts to execute
            await new Promise((resolve) => setTimeout(resolve, 4000));

            // Execute script inside the opened tab to click the PDF button directly
            await chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              func: () => {
                const pdfBtn = document.querySelector('input[value*="PDF"], button[value*="PDF"], a[href*="pdf"]') as HTMLElement;
                const downloadForm = document.querySelector('form') as HTMLFormElement;

                if (pdfBtn) {
                  pdfBtn.click();
                } else if (downloadForm) {
                  downloadForm.submit();
                }
              }
            });

            // Allow 3 seconds for browser download manager to capture stream
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Close the temporary tab
            await chrome.tabs.remove(newTab.id);
            successCount++;
          }
        } catch (err) {
          console.error(`Failed on ${bookUrl}:`, err);
        }
      }

      setStatus(`Finished! Processed ${successCount} out of ${allBookLinks.length} books.`);
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