import { useState, useEffect } from 'react';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  useEffect(() => {
    chrome.storage.local.get(['batchStatus', 'batchIsRunning', 'batchProgress'], (result) => {
      if (result.batchStatus) setStatus(result.batchStatus);
      if (result.batchIsRunning !== undefined) setIsDownloading(result.batchIsRunning);
      if (result.batchProgress) setProgress(result.batchProgress);
    });

    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        if (message.batchStatus) setStatus(message.batchStatus);
        if (message.batchIsRunning !== undefined) setIsDownloading(message.batchIsRunning);
        if (message.batchProgress) setProgress(message.batchProgress);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const startBatch = async () => {
    setIsDownloading(true);
    setStatus('Gathering book URLs across selected pages...');

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      setStatus('Error: Open OceanofPDF search results tab first.');
      setIsDownloading(false);
      return;
    }

    const currentUrl = activeTab.url || '';
    const baseUrl = currentUrl.replace(/\/page\/\d+\//, '/');

    let allLinks: string[] = [];

    for (let page = startPage; page <= endPage; page++) {
      const pageUrl = page === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/page/${page}/`;
      setStatus(`Scanning page ${page} of ${endPage}...`);

      if (page === startPage && currentUrl === pageUrl) {
        const results = await extractLinksFromTab(activeTab.id);
        allLinks.push(...results);
      } else {
        const tempTab = await chrome.tabs.create({ url: pageUrl, active: false });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (tempTab.id) {
          const results = await extractLinksFromTab(tempTab.id);
          allLinks.push(...results);
          await chrome.tabs.remove(tempTab.id);
        }
      }
    }

    const uniqueLinks = Array.from(new Set(allLinks));

    if (uniqueLinks.length === 0) {
      setStatus('No downloadable item links found.');
      setIsDownloading(false);
      return;
    }

    chrome.runtime.sendMessage({ type: 'START_BATCH', links: uniqueLinks });
  };

  const extractLinksFromTab = async (tabId: number): Promise<string[]> => {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
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
      return results[0]?.result || [];
    } catch (e) {
      return [];
    }
  };

  return (
    <div style={{ width: '320px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 12px 0' }}>OceanofPDF Downloader</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>From Page:</label>
          <input
            type="number"
            min="1"
            value={startPage}
            disabled={isDownloading}
            onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>To Page:</label>
          <input
            type="number"
            min={startPage}
            value={endPage}
            disabled={isDownloading}
            onChange={(e) => setEndPage(Math.max(startPage, parseInt(e.target.value) || 1))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <button
        onClick={startBatch}
        disabled={isDownloading}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: isDownloading ? '#888' : '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: isDownloading ? 'not-allowed' : 'pointer'
        }}
      >
        {isDownloading ? 'Processing Batch...' : 'Start Download'}
      </button>

      {progress.total > 0 && (
        <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 'bold' }}>
          Progress: {progress.current} / {progress.total}
        </div>
      )}

      {status && <p style={{ marginTop: '8px', fontSize: '12px', color: '#333' }}>{status}</p>}
    </div>
  );
}