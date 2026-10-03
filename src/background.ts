// src/background.ts

interface QueueState {
  queue: string[];
  currentIndex: number;
  activeTabId: number | null;
}

let state: QueueState = {
  queue: [],
  currentIndex: 0,
  activeTabId: null
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_BATCH') {
    state.queue = message.links;
    state.currentIndex = 0;
    processNextInQueue();
    sendResponse({ status: 'started' });
  }
  return true;
});

async function processNextInQueue() {
  if (state.currentIndex >= state.queue.length) {
    chrome.runtime.sendMessage({ type: 'BATCH_COMPLETE' });
    return;
  }

  const currentUrl = state.queue[state.currentIndex];
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    message: `[Book ${state.currentIndex + 1}/${state.queue.length}] Opening detail page...`
  });

  // Open book URL in active tab
  const tab = await chrome.tabs.create({ url: currentUrl, active: true });
  state.activeTabId = tab.id || null;

  // Setup download listener for this book item
  const downloadListener = (downloadItem: chrome.downloads.DownloadItem) => {
    if (downloadItem) {
      chrome.downloads.onCreated.removeListener(downloadListener);
      cleanupAndAdvance();
    }
  };

  chrome.downloads.onCreated.addListener(downloadListener);

  // 25s safety timeout
  setTimeout(() => {
    chrome.downloads.onCreated.removeListener(downloadListener);
    cleanupAndAdvance();
  }, 25000);
}

async function cleanupAndAdvance() {
  if (state.activeTabId) {
    try {
      await chrome.tabs.remove(state.activeTabId);
    } catch (e) {
      // Tab might have already closed
    }
    state.activeTabId = null;
  }
  state.currentIndex++;
  setTimeout(() => {
    processNextInQueue();
  }, 2000);
}