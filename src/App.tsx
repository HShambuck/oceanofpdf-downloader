import { useState } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Reading book links from active search page...');

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id || !activeTab.url) {
        setStatus('Error: Please navigate to an OceanofPDF search page first.');
        setIsDownloading(false);
        return;
      }

      // 1. Extract book links from the search page DOM
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
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

      setStatus(`Found ${allBookLinks.length} books. Automating detail page downloads...`);
      let successCount = 0;

      // 2. Process each book detail page inside a temporary background tab
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`Processing book ${i + 1} of ${allBookLinks.length}...`);

        try {
          const newTab = await chrome.tabs.create({ url: bookUrl, active: false });

          if (newTab.id) {
            // Set up a promise to listen for Chrome download stream creation
            const downloadPromise = new Promise<boolean>((resolve) => {
              const listener = (downloadItem: chrome.downloads.DownloadItem) => {
                if (downloadItem) {
                  chrome.downloads.onCreated.removeListener(listener);
                  resolve(true);
                }
              };
              chrome.downloads.onCreated.addListener(listener);

              // Timeout after 15 seconds if download doesn't trigger
              setTimeout(() => {
                chrome.downloads.onCreated.removeListener(listener);
                resolve(false);
              }, 15000);
            });

            // Wait 4 seconds for detail page DOM scripts to render
            await new Promise((resolve) => setTimeout(resolve, 4000));

            // Execute automated button search & click logic inside the page
            await chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              func: () => {
                // Find forms or buttons matching "pdf" across attributes
                const allElements = Array.from(document.querySelectorAll('a, button, input, form'));

                let targetElement: HTMLElement | null = null;

                for (const el of allElements) {
                  const htmlContent = el.outerHTML.toLowerCase();
                  if (
                    htmlContent.includes('pdf') &&
                    !htmlContent.includes('report') &&
                    !htmlContent.includes('how-to')
                  ) {
                    targetElement = el as HTMLElement;
                    break;
                  }
                }

                if (targetElement) {
                  if (targetElement.tagName === 'FORM') {
                    (targetElement as HTMLFormElement).submit();
                  } else {
                    // Dispatch natural click event
                    targetElement.click();
                    const event = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window
                    });
                    targetElement.dispatchEvent(event);
                  }
                }
              }
            });

            // Await Chrome download manager response
            const downloaded = await downloadPromise;
            if (downloaded) {
              successCount++;
            }

            // Close temporary tab
            await chrome.tabs.remove(newTab.id);
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