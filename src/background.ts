type BatchStatusState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';

interface QueueState {
  queue: string[];
  currentIndex: number;
  activeWorkerTabId: number | null;
  status: BatchStatusState;
}

let state: QueueState = {
  queue: [],
  currentIndex: 0,
  activeWorkerTabId: null,
  status: 'IDLE'
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_BATCH') {
    state.queue = message.links;
    state.currentIndex = 0;
    state.status = 'RUNNING';
    updateStorageAndBroadcast(`Starting batch queue (0/${state.queue.length})...`);
    processNextInQueue();
    sendResponse({ status: 'started' });
  } else if (message.type === 'PAUSE_BATCH') {
    state.status = 'PAUSED';
    updateStorageAndBroadcast('Batch paused.');
    sendResponse({ status: 'paused' });
  } else if (message.type === 'RESUME_BATCH') {
    if (state.status === 'PAUSED') {
      state.status = 'RUNNING';
      updateStorageAndBroadcast(`Resuming download (${state.currentIndex}/${state.queue.length})...`);
      processNextInQueue();
    }
    sendResponse({ status: 'resumed' });
  } else if (message.type === 'STOP_BATCH') {
    state.status = 'STOPPED';
    cleanupWorkerTab();
    state.queue = [];
    state.currentIndex = 0;
    updateStorageAndBroadcast('Batch stopped.');
    sendResponse({ status: 'stopped' });
  }
  return true;
});

async function updateStorageAndBroadcast(statusText: string) {
  const payload = {
    batchStatusText: statusText,
    batchState: state.status,
    batchProgress: {
      current: state.currentIndex,
      total: state.queue.length
    }
  };
  await chrome.storage.local.set(payload);
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', ...payload });
}

async function cleanupWorkerTab() {
  if (state.activeWorkerTabId !== null) {
    try {
      await chrome.tabs.remove(state.activeWorkerTabId);
    } catch (e) {
      // Tab may already be closed
    }
    state.activeWorkerTabId = null;
  }
}

async function processNextInQueue() {
  if (state.status !== 'RUNNING') return;

  if (state.currentIndex >= state.queue.length) {
    state.status = 'IDLE';
    await cleanupWorkerTab();
    await updateStorageAndBroadcast('All downloads completed successfully!');
    return;
  }

  // Enforce closing any remaining worker tab before proceeding
  await cleanupWorkerTab();

  const currentUrl = state.queue[state.currentIndex];
  const progressMsg = `Downloading ${state.currentIndex + 1} of ${state.queue.length}...`;
  await updateStorageAndBroadcast(progressMsg);

  // Open item in a single hidden background tab
  const tab = await chrome.tabs.create({ url: currentUrl, active: false });
  state.activeWorkerTabId = tab.id || null;

  let handled = false;

  const downloadListener = (downloadItem: chrome.downloads.DownloadItem) => {
    if (downloadItem && !handled) {
      handled = true;
      chrome.downloads.onCreated.removeListener(downloadListener);
      advanceQueue();
    }
  };

  chrome.downloads.onCreated.addListener(downloadListener);

  // Timeout safety net in case download stream fails
  setTimeout(() => {
    if (!handled && state.status === 'RUNNING') {
      handled = true;
      chrome.downloads.onCreated.removeListener(downloadListener);
      advanceQueue();
    }
  }, 25000);
}

async function advanceQueue() {
  await cleanupWorkerTab();
  if (state.status === 'RUNNING') {
    state.currentIndex++;
    setTimeout(() => {
      processNextInQueue();
    }, 1500);
  }
}