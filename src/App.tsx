import { useState } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Extracting book links from search results...');

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id || !activeTab.url) {
        setStatus('Error: Please navigate to an OceanofPDF search page first.');
        setIsDownloading(false);
        return;
      }

      // 1. Extract book links from search results page
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
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

      setStatus(`Found ${allBookLinks.length} books. Automating downloads in background tabs...`);
      let successCount = 0;

      // 2. Process each book URL in a new background tab
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`[Book ${i + 1}/${allBookLinks.length}] Opening background tab...`);

        try {
          const newTab = await chrome.tabs.create({ url: bookUrl, active: false });

          if (newTab.id) {
            // Set up listener for Chrome download stream event
            const downloadPromise = new Promise<boolean>((resolve) => {
              const listener = (downloadItem: chrome.downloads.DownloadItem) => {
                if (downloadItem) {
                  chrome.downloads.onCreated.removeListener(listener);
                  resolve(true);
                }
              };
              chrome.downloads.onCreated.addListener(listener);

              // 20s timeout window to allow for degital5.com redirect countdown
              setTimeout(() => {
                chrome.downloads.onCreated.removeListener(listener);
                resolve(false);
              }, 20000);
            });

            // Wait 3 seconds for page setup
            await sleep(3000);

            setStatus(`[Book ${i + 1}/${allBookLinks.length}] Waiting for PDF button & submitting...`);

            // Execute resilient polling script to locate and click the PDF form/button
            await chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              func: async () => {
                const maxAttempts = 16; // 16 * 500ms = 8 seconds polling
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  const pdfForm = document.querySelector('form[action*="Fetching_Resource"], form[action*="pdf"], form') as HTMLFormElement;
                  const pdfInput = document.querySelector('input[type="image"][alt*="PDF"], input[value*="PDF"], button[value*="PDF"], a[href*="pdf"]') as HTMLElement;

                  if (pdfForm) {
                    pdfForm.submit();
                    return true;
                  } else if (pdfInput) {
                    pdfInput.click();
                    return true;
                  }
                  await new Promise((r) => setTimeout(r, 500));
                }
                return false;
              }
            });

            setStatus(`[Book ${i + 1}/${allBookLinks.length}] Awaiting redirect and download stream...`);

            // Await Chrome download manager confirmation
            const downloaded = await downloadPromise;
            if (downloaded) {
              successCount++;
              setStatus(`[Book ${i + 1}/${allBookLinks.length}] Download started successfully!`);
            } else {
              setStatus(`[Book ${i + 1}/${allBookLinks.length}] Download timed out.`);
            }

            // Close background tab after stream trigger
            await chrome.tabs.remove(newTab.id);
            await sleep(1500);
          }
        } catch (err) {
          console.error(`Error on book ${bookUrl}:`, err);
        }
      }

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