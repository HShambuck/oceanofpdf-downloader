type BatchStatusState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';

interface QueueState {
  queue: string[];
  currentIndex: number;
  activeWorkerTabId: number | null;
  status: BatchStatusState;
}

const KEY = 'batch_queue_state';

const fresh = (): QueueState => ({
  queue: [],
  currentIndex: 0,
  activeWorkerTabId: null,
  status: 'IDLE'
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const load = async (): Promise<QueueState> => ({
  ...fresh(),
  ...((await chrome.storage.local.get(KEY))[KEY] ?? {})
});

const save = (s: QueueState) => chrome.storage.local.set({ [KEY]: s });

// Serialize all handlers so they can't interleave across awaits
let chain: Promise<unknown> = Promise.resolve();
const locked = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
};

// Register MAIN-world visibility spoofer on install
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['vis-spoof'] });
  } catch (e) {}

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: 'vis-spoof',
        matches: ['https://oceanofpdf.com/*', 'https://*.degital5.com/*'],
        js: ['src/visibility-spoof.ts'],
        runAt: 'document_start',
        world: 'MAIN'
      }
    ]);
  } catch (e) {
    console.error('Failed to register vis-spoof content script:', e);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_BATCH') {
    locked(async () => {
      const state: QueueState = {
        queue: message.links,
        currentIndex: 0,
        activeWorkerTabId: null,
        status: 'RUNNING'
      };
      await save(state);
      await updateStorageAndBroadcast(`Starting batch queue (0/${state.queue.length})...`, state);
      processNextInQueue();
    });
    sendResponse({ status: 'started' });
  } else if (message.type === 'PAUSE_BATCH') {
    locked(async () => {
      const state = await load();
      state.status = 'PAUSED';
      await save(state);
      await updateStorageAndBroadcast('Batch paused.', state);
    });
    sendResponse({ status: 'paused' });
  } else if (message.type === 'RESUME_BATCH') {
    locked(async () => {
      const state = await load();
      if (state.status === 'PAUSED') {
        state.status = 'RUNNING';
        await save(state);
        await updateStorageAndBroadcast(`Resuming (${state.currentIndex}/${state.queue.length})...`, state);
        processNextInQueue();
      }
    });
    sendResponse({ status: 'resumed' });
  } else if (message.type === 'STOP_BATCH') {
    locked(async () => {
      const state = await load();
      state.status = 'STOPPED';
      await cleanupWorkerTab(state);
      state.queue = [];
      state.currentIndex = 0;
      await save(state);
      await updateStorageAndBroadcast('Batch stopped.', state);
    });
    sendResponse({ status: 'stopped' });
  }
  return true;
});

async function updateStorageAndBroadcast(statusText: string, state: QueueState) {
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

async function cleanupWorkerTab(state: QueueState) {
  if (state.activeWorkerTabId !== null) {
    try {
      await chrome.tabs.remove(state.activeWorkerTabId);
    } catch (e) {
      // Tab already closed
    }
    state.activeWorkerTabId = null;
  }
}

async function processNextInQueue() {
  locked(async () => {
    const state = await load();
    if (state.status !== 'RUNNING') return;

    if (state.currentIndex >= state.queue.length) {
      state.status = 'IDLE';
      await cleanupWorkerTab(state);
      await save(state);
      await updateStorageAndBroadcast('All downloads completed successfully!', state);
      return;
    }

    await cleanupWorkerTab(state);

    const currentUrl = state.queue[state.currentIndex];
    const progressMsg = `Downloading ${state.currentIndex + 1} of ${state.queue.length}...`;
    await updateStorageAndBroadcast(progressMsg, state);

    // Open item in background tab
    const tab = await chrome.tabs.create({ url: currentUrl, active: false });
    state.activeWorkerTabId = tab.id || null;
    await save(state);

    let handled = false;

    const downloadListener = (downloadItem: chrome.downloads.DownloadItem) => {
      if (downloadItem && !handled) {
        handled = true;
        chrome.downloads.onCreated.removeListener(downloadListener);
        advanceQueue();
      }
    };

    chrome.downloads.onCreated.addListener(downloadListener);

    // Fallback timeout
    setTimeout(() => {
      if (!handled) {
        handled = true;
        chrome.downloads.onCreated.removeListener(downloadListener);
        advanceQueue();
      }
    }, 25000);
  });
}

async function advanceQueue() {
  locked(async () => {
    const state = await load();
    await cleanupWorkerTab(state);
    if (state.status === 'RUNNING') {
      state.currentIndex++;
      await save(state);
      await sleep(1500);
      processNextInQueue();
    }
  });
}