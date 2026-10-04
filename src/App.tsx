import { useState, useEffect } from 'react';
import { parsePaginationFromDOM } from './pagination';

type BatchStatusState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';

interface BatchProgress {
  current: number;
  total: number;
}

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [maxPages, setMaxPages] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const [batchState, setBatchState] = useState<BatchStatusState>('IDLE');
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });

  useEffect(() => {
    chrome.storage.local.get(['batchStatusText', 'batchState', 'batchProgress'], (result) => {
      if (typeof result.batchStatusText === 'string') setStatusText(result.batchStatusText);
      if (typeof result.batchState === 'string') setBatchState(result.batchState as BatchStatusState);
      if (result.batchProgress && typeof result.batchProgress === 'object') {
        setProgress(result.batchProgress as BatchProgress);
      }
    });

    detectTotalPages();

    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        if (typeof message.batchStatusText === 'string') setStatusText(message.batchStatusText);
        if (typeof message.batchState === 'string') setBatchState(message.batchState as BatchStatusState);
        if (message.batchProgress && typeof message.batchProgress === 'object') {
          setProgress(message.batchProgress as BatchProgress);
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const detectTotalPages = async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id && activeTab.url?.includes('oceanofpdf.com')) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: parsePaginationFromDOM
        });

        const detectedMax = results[0]?.result;
        if (detectedMax) {
          setMaxPages(detectedMax);
          setEndPage(detectedMax);
        }
      }
    } catch (e) {
      // Not on search results page or permission restricted
    }
  };

  const startBatch = async () => {
    setStatusText('Gathering book URLs across selected pages...');

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      setStatusText('Error: Please open OceanofPDF search results tab first.');
      return;
    }

    const currentUrl = activeTab.url || '';
    const baseUrl = currentUrl.replace(/\/page\/\d+\//, '/');

    let allLinks: string[] = [];

    for (let page = startPage; page <= endPage; page++) {
      const pageUrl = page === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/page/${page}/`;
      setStatusText(`Scanning page ${page} of ${endPage}...`);

      if (page === startPage && currentUrl === pageUrl) {
        const results = await extractLinksFromTab(activeTab.id);
        allLinks.push(...results);
      } else {
        const tempTab = await chrome.tabs.create({ url: pageUrl, active: false });
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (tempTab.id) {
          const results = await extractLinksFromTab(tempTab.id);
          allLinks.push(...results);
          await chrome.tabs.remove(tempTab.id);
        }
      }
    }

    const uniqueLinks = Array.from(new Set(allLinks));

    if (uniqueLinks.length === 0) {
      setStatusText('No downloadable book links found.');
      return;
    }

    chrome.runtime.sendMessage({ type: 'START_BATCH', links: uniqueLinks });
  };

  const pauseBatch = () => chrome.runtime.sendMessage({ type: 'PAUSE_BATCH' });
  const resumeBatch = () => chrome.runtime.sendMessage({ type: 'RESUME_BATCH' });
  const stopBatch = () => chrome.runtime.sendMessage({ type: 'STOP_BATCH' });

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

  const isRunning = batchState === 'RUNNING';
  const isPaused = batchState === 'PAUSED';

  return (
    <div style={{ width: '330px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 12px 0' }}>OceanofPDF Downloader</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>From Page:</label>
          <input
            type="number"
            min="1"
            value={startPage}
            disabled={isRunning || isPaused}
            onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
            To Page: {maxPages ? `(of ${maxPages})` : ''}
          </label>
          <input
            type="number"
            min={startPage}
            max={maxPages || undefined}
            value={endPage}
            disabled={isRunning || isPaused}
            onChange={(e) => setEndPage(Math.max(startPage, parseInt(e.target.value) || 1))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {maxPages && (
        <p style={{ fontSize: '11px', color: '#666', margin: '0 0 12px 0' }}>
          Detected search range: Page {startPage} to {endPage} of {maxPages} total pages.
        </p>
      )}

      {batchState === 'IDLE' || batchState === 'STOPPED' ? (
        <button
          onClick={startBatch}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Start Download
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '6px' }}>
          {isRunning ? (
            <button
              onClick={pauseBatch}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#ffc107',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Pause
            </button>
          ) : (
            <button
              onClick={resumeBatch}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Resume
            </button>
          )}

          <button
            onClick={stopBatch}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Stop
          </button>
        </div>
      )}

      {progress.total > 0 && (
        <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 'bold' }}>
          Progress: {progress.current} / {progress.total}
        </div>
      )}

      {statusText && <p style={{ marginTop: '8px', fontSize: '12px', color: '#333' }}>{statusText}</p>}
    </div>
  );
}