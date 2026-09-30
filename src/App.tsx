import { useState } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Helper to delay execution
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Helper to wait until a tab finishes loading completely
  // Helper to wait until a tab finishes loading completely
  const waitForTabLoad = (tabId: number): Promise<void> => {
    return new Promise((resolve) => {
      const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  };

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Extracting book links from search page...');

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id || !activeTab.url) {
        setStatus('Error: Please navigate to an OceanofPDF search page first.');
        setIsDownloading(false);
        return;
      }

      const activeTabId = activeTab.id;
      const originalSearchUrl = activeTab.url;

      // 1. Extract book URLs from the search results page
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          const links: string[] = [];
          const anchors = document.querySelectorAll('article h2 a, article .entry-title a, h2.entry-title a, .post-title a');
          anchors.forEach((el) => {
            const href = (el as HTMLAnchorElement).href;
            if (href && !links.includes(href) && !href.includes('/page/') && !href.includes('?s=')) {
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

      setStatus(`Found ${allBookLinks.length} books. Starting sequential step-by-step downloads...`);
      let successCount = 0;

      // 2. Loop through each book sequentially
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`[Book ${i + 1}/${allBookLinks.length}] Navigating to book page...`);

        // Step A: Navigate active tab to book detail page
        await chrome.tabs.update(activeTabId, { url: bookUrl });
        await waitForTabLoad(activeTabId);
        await sleep(2000);

        // Step B: Listen for download start event
        const downloadPromise = new Promise<boolean>((resolve) => {
          const listener = (downloadItem: chrome.downloads.DownloadItem) => {
            if (downloadItem) {
              chrome.downloads.onCreated.removeListener(listener);
              resolve(true);
            }
          };
          chrome.downloads.onCreated.addListener(listener);

          // Timeout after 15s if download stream doesn't fire
          setTimeout(() => {
            chrome.downloads.onCreated.removeListener(listener);
            resolve(false);
          }, 15000);
        });

        setStatus(`[Book ${i + 1}/${allBookLinks.length}] Clicking PDF download button...`);

        // Step C: Trigger PDF button/form click inside book page
        await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          func: () => {
            // Find OceanofPDF red PDF button form or input
            const pdfForm = document.querySelector('form[action*="Fetching_Resource"], form[action*="pdf"], form') as HTMLFormElement;
            const pdfInput = document.querySelector('input[type="image"][alt*="PDF"], input[value*="PDF"], button[value*="PDF"], a[href*="pdf"]') as HTMLElement;

            if (pdfForm) {
              pdfForm.submit();
            } else if (pdfInput) {
              pdfInput.click();
            }
          }
        });

        setStatus(`[Book ${i + 1}/${allBookLinks.length}] Waiting on redirect landing page for download to start...`);

        // Step D: Await download manager event
        const downloaded = await downloadPromise;
        if (downloaded) {
          successCount++;
          setStatus(`[Book ${i + 1}/${allBookLinks.length}] Download started! Waiting 3s before next book...`);
          await sleep(3000);
        } else {
          setStatus(`[Book ${i + 1}/${allBookLinks.length}] Timed out waiting for download.`);
        }
      }

      // Step E: Return active tab back to original search page
      await chrome.tabs.update(activeTabId, { url: originalSearchUrl });
      setStatus(`Finished! Successfully triggered ${successCount} out of ${allBookLinks.length} downloads.`);
    } catch (err) {
      console.error('Execution error:', err);
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