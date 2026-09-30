import { useState } from 'react';
import * as cheerio from 'cheerio';

export default function App() {
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Helper to construct pagination URLs for standard, search, or category pages
  const buildPageUrl = (currentUrl: string, pageNum: number): string => {
    if (pageNum === 1) return currentUrl;

    const urlObj = new URL(currentUrl);

    // If URL contains a search query parameter (e.g. ?s=Generative+AI)
    if (urlObj.search) {
      return `${urlObj.origin}/page/${pageNum}/${urlObj.search}`;
    }

    // Standard category or search directory path
    const cleanPath = urlObj.pathname.replace(/\/page\/\d+/, '').replace(/\/$/, '');
    return `${urlObj.origin}${cleanPath}/page/${pageNum}/`;
  };

  const crawlAndDownload = async () => {
    setIsDownloading(true);
    setStatus('Detecting current tab URL...');

    try {
      // 1. Get current active browser tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes('oceanofpdf.com')) {
        setStatus('Error: Please navigate to an OceanofPDF search or list page first.');
        setIsDownloading(false);
        return;
      }

      const activeUrl = tab.url;
      let allBookLinks: string[] = [];

      // Fix 1 & 2: Loop through requested pagination range with proper selector extraction
      for (let page = startPage; page <= endPage; page++) {
        const targetPageUrl = buildPageUrl(activeUrl, page);
        setStatus(`Scraping search page ${page} of ${endPage}...`);

        const res = await fetch(targetPageUrl);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Target OceanofPDF book links in search results
        $('article h2.entry-title a, article .entry-title a').each((_, el) => {
          const link = $(el).attr('href');
          if (link && !allBookLinks.includes(link)) {
            allBookLinks.push(link);
          }
        });
      }

      if (allBookLinks.length === 0) {
        setStatus('No book links found on these pages. Check your page numbers or search query.');
        setIsDownloading(false);
        return;
      }

      setStatus(`Found ${allBookLinks.length} books. Starting downloads...`);

      // Fix 3: Loop through detail pages and resolve actual PDF targets
      for (let i = 0; i < allBookLinks.length; i++) {
        const bookUrl = allBookLinks[i];
        setStatus(`Processing book ${i + 1} of ${allBookLinks.length}...`);

        try {
          const res = await fetch(bookUrl);
          const html = await res.text();
          const $ = cheerio.load(html);

          // Check for download form submit action or direct pdf hyperlink
          const pdfForm = $('form[action*="pdf"], form[action*="download"]');
          let downloadTarget = pdfForm.attr('action') || $('a[href*=".pdf"]').attr('href');

          if (downloadTarget) {
            // Trigger Chrome native download manager
            chrome.downloads.download({
              url: downloadTarget,
              conflictAction: 'uniquify'
            });
          } else {
            console.warn(`Could not locate download button on ${bookUrl}`);
          }

          // 2-second delay to avoid triggering server rate limits
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (err) {
          console.error(`Error downloading book from ${bookUrl}:`, err);
        }
      }

      setStatus(`Completed processing ${allBookLinks.length} books!`);
    } catch (err) {
      console.error('Error during batch execution:', err);
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
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
            Start Page
          </label>
          <input
            type="number"
            min="1"
            value={startPage}
            onChange={(e) => setStartPage(Number(e.target.value))}
            style={{ width: '100%', padding: '6px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
            End Page
          </label>
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