import { useState, useEffect } from 'react';

export default function App() {
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        setStatus(message.message);
      } else if (message.type === 'BATCH_COMPLETE') {
        setStatus('Batch download process completed!');
        setIsDownloading(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const startBatch = async () => {
    setIsDownloading(true);
    setStatus('Extracting book links from search page...');

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      setStatus('Error: Please navigate to OceanofPDF search page first.');
      setIsDownloading(false);
      return;
    }

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

    const links = results[0]?.result || [];
    if (links.length === 0) {
      setStatus('No book links found on this page.');
      setIsDownloading(false);
      return;
    }

    chrome.runtime.sendMessage({ type: 'START_BATCH', links });
  };

  return (
    <div style={{ width: '300px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 12px 0' }}>OceanofPDF Downloader</h3>
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
        {isDownloading ? 'Processing Batch...' : 'Start Download All'}
      </button>
      {status && <p style={{ marginTop: '12px', fontSize: '12px', color: '#333' }}>{status}</p>}
    </div>
  );
}