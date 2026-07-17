let offscreenCreating;
let activeTabId = null;
let recordingState = 'inactive'; // inactive, recording, transcribing

async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
  } else {
    offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording audio for voice dictation'
    });
    await offscreenCreating;
    offscreenCreating = null;
  }
}

async function handleCommand(command) {
  console.log("Command received:", command);
  if (command === 'capture-voice') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    activeTabId = tab.id;

    // Inject content scripts if not already there. 
    // We ignore errors since they might already be injected or it's a restricted page.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    } catch(e) {}
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch(e) {}

    await setupOffscreenDocument();

    if (recordingState === 'inactive') {
      recordingState = 'recording';
      // Tell content script to show "listening..."
      chrome.tabs.sendMessage(tab.id, { type: 'ui_state', state: 'listening' }).catch(() => {});
      // Tell offscreen to start
      chrome.runtime.sendMessage({ type: 'start_recording' }).catch(() => {});
    } else if (recordingState === 'recording') {
      recordingState = 'transcribing';
      chrome.tabs.sendMessage(tab.id, { type: 'ui_state', state: 'transcribing' }).catch(() => {});
      chrome.runtime.sendMessage({ type: 'stop_recording' }).catch(() => {});
    }
  }
}

chrome.commands.onCommand.addListener(handleCommand);

// Expose for playwright testing
globalThis.triggerVoiceCapture = () => handleCommand('capture-voice');

// Relay messages from offscreen to content script, and handle popup opening
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'volume_update' || message.type === 'ui_state' || message.type === 'no_audio_warning') {
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
    }
  }
  
  if (message.type === 'ui_state' && (message.state === 'done' || message.state === 'error')) {
    recordingState = 'inactive';
    
    // Automatically open options page if permission is denied
    if (message.error === 'Microphone access denied') {
      chrome.runtime.openOptionsPage();
    }
  }

  if (message.type === 'open_popup') {
    chrome.windows.create({ 
      type: 'popup', 
      url: 'https://ghostwriter-intern-production.up.railway.app',
      width: 420, 
      height: 640 
    });
  }
});
