// src/background.ts

interface QueueState {
  queue: string[];
  currentIndex: number;
  activeTabId: number | null;
  isRunning: boolean;
}

let state: QueueState = {
  queue: [],
  currentIndex: 0,
  activeTabId: null,
  isRunning: false
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_BATCH') {
    state.queue = message.links;
    state.currentIndex = 0;
    state.isRunning = true;
    updateStorageAndBroadcast(`Starting batch download of ${state.queue.length} items...`);
    processNextInQueue();
    sendResponse({ status: 'started' });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({
      isRunning: state.isRunning,
      currentIndex: state.currentIndex,
      total: state.queue.length
    });
  }
  return true;
});

async function updateStorageAndBroadcast(statusText: string) {
  const payload = {
    batchStatus: statusText,
    batchIsRunning: state.isRunning,
    batchProgress: {
      current: state.currentIndex,
      total: state.queue.length
    }
  };
  await chrome.storage.local.set(payload);
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', ...payload });
}

async function processNextInQueue() {
  if (state.currentIndex >= state.queue.length) {
    state.isRunning = false;
    if (state.activeTabId) {
      try {
        await chrome.tabs.remove(state.activeTabId);
      } catch (e) {}
      state.activeTabId = null;
    }
    await updateStorageAndBroadcast('Batch process completed!');
    return;
  }

  const currentUrl = state.queue[state.currentIndex];
  const progressMsg = `Downloading ${state.currentIndex + 1} of ${state.queue.length}...`;
  await updateStorageAndBroadcast(progressMsg);

  if (!state.activeTabId) {
    const tab = await chrome.tabs.create({ url: currentUrl, active: true });
    state.activeTabId = tab.id || null;
  } else {
    try {
      await chrome.tabs.update(state.activeTabId, { url: currentUrl, active: true });
    } catch (e) {
      const tab = await chrome.tabs.create({ url: currentUrl, active: true });
      state.activeTabId = tab.id || null;
    }
  }

  let Handled = false;

  const downloadListener = (downloadItem: chrome.downloads.DownloadItem) => {
    if (downloadItem && !Handled) {
      Handled = true;
      chrome.downloads.onCreated.removeListener(downloadListener);
      advanceQueue();
    }
  };

  chrome.downloads.onCreated.addListener(downloadListener);

  setTimeout(() => {
    if (!Handled) {
      Handled = true;
      chrome.downloads.onCreated.removeListener(downloadListener);
      advanceQueue();
    }
  }, 25000);
}

function advanceQueue() {
  state.currentIndex++;
  setTimeout(() => {
    processNextInQueue();
  }, 2000);
}