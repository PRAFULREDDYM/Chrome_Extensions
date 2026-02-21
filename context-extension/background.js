// State management
let appState = 'stopped';
let currentSession = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    state: 'stopped',
    currentSession: null,
    sessions: [],
    scrollMemory: {}
  });
});

// Message handler
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    switch(req.action) {
      case 'start':
        appState = 'active';
        currentSession = {
          id: Date.now(),
          startTime: Date.now(),
          lastActive: Date.now(),
          topic: 'general',
          pages: []
        };
        await saveState();
        updateBadge();
        sendResponse({ success: true, session: currentSession });
        break;
        
      case 'pause':
        appState = 'paused';
        await saveState();
        updateBadge();
        sendResponse({ success: true });
        break;
        
      case 'stop':
        appState = 'stopped';
        if (currentSession && currentSession.pages.length > 0) {
          currentSession.endTime = Date.now();
          const { sessions = [] } = await chrome.storage.local.get('sessions');
          sessions.push(currentSession);
          await chrome.storage.local.set({ sessions });
        }
        currentSession = null;
        await saveState();
        updateBadge();
        sendResponse({ success: true });
        break;
        
      case 'getState':
        const { sessions = [] } = await chrome.storage.local.get('sessions');
        sendResponse({ 
          state: appState, 
          session: currentSession,
          sessions: sessions
        });
        break;
        
      case 'pageVisited':
        if (appState === 'active' && currentSession) {
          await addPage(req.data);
        }
        sendResponse({ success: true });
        break;
        
      case 'scrollUpdate':
        if (currentSession && appState === 'active') {
          await updateScroll(req.url, req.position);
        }
        sendResponse({ success: true });
        break;
        
      case 'clearAll':
        appState = 'stopped';
        currentSession = null;
        await chrome.storage.local.set({ sessions: [], scrollMemory: {} });
        updateBadge();
        sendResponse({ success: true });
        break;
        
      case 'getPageScroll':
        const { scrollMemory = {} } = await chrome.storage.local.get('scrollMemory');
        sendResponse({ position: scrollMemory[req.url] || null });
        break;
    }
  })();
  return true;
});

// Tab tracking
chrome.tabs.onActivated.addListener(async (info) => {
  if (appState !== 'active') return;
  const tab = await chrome.tabs.get(info.tabId);
  trackTab(tab);
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (appState !== 'active') return;
  if (change.status === 'complete' && tab.active) trackTab(tab);
});

async function trackTab(tab) {
  if (!tab?.url?.startsWith('http')) return;
  
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        title: document.title,
        domain: location.hostname,
        scrollY: window.scrollY,
        maxScroll: Math.max(1, document.body.scrollHeight - window.innerHeight)
      })
    });
    
    await addPage({
      url: result.url,
      title: result.title,
      domain: result.domain,
      scrollPercent: Math.min(100, Math.round((result.scrollY / result.maxScroll) * 100)),
      scrollY: result.scrollY,
      timestamp: Date.now()
    });
  } catch(e) {
    console.error('Track error:', e);
  }
}

async function addPage(data) {
  if (!currentSession) return;
  
  const existing = currentSession.pages.findIndex(p => p.url === data.url);
  if (existing >= 0) {
    currentSession.pages[existing].scrollPercent = data.scrollPercent;
    currentSession.pages[existing].scrollY = data.scrollY;
    currentSession.pages[existing].lastVisit = Date.now();
  } else {
    currentSession.pages.push({
      ...data,
      firstVisit: Date.now()
    });
    currentSession.topic = inferTopic(data.title);
  }
  
  currentSession.lastActive = Date.now();
  await saveState();
  
  chrome.action.setBadgeText({ 
    text: currentSession.pages.length.toString() 
  });
  chrome.action.setBadgeBackgroundColor({ color: 'rgba(255,255,255,0.3)' });
}

async function updateScroll(url, position) {
  if (!currentSession) return;
  const page = currentSession.pages.find(p => p.url === url);
  if (page) {
    page.scrollPercent = position.percent;
    page.scrollY = position.y;
    await saveState();
  }
  
  // Also save to scrollMemory for resume
  const { scrollMemory = {} } = await chrome.storage.local.get('scrollMemory');
  scrollMemory[url] = position;
  await chrome.storage.local.set({ scrollMemory });
}

async function saveState() {
  await chrome.storage.local.set({ 
    state: appState, 
    currentSession 
  });
}

function updateBadge() {
  const text = appState === 'active' && currentSession ? 
    currentSession.pages.length.toString() : 
    (appState === 'active' ? '●' : (appState === 'paused' ? '⏸' : '○'));
  
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: 'rgba(255,255,255,0.2)' });
}

function inferTopic(title) {
  const t = (title || '').toLowerCase();
  if (/react|javascript|python|code|api|app/.test(t)) return 'technology';
  if (/business|startup|marketing|sale/.test(t)) return 'business';
  if (/research|study|paper|university/.test(t)) return 'academic';
  return 'general';
}

// Init
chrome.storage.local.get(['state', 'currentSession']).then(data => {
  appState = data.state || 'stopped';
  currentSession = data.currentSession || null;
  updateBadge();
});