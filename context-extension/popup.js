document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadState();
  setupListeners();
}

async function loadState() {
  const res = await chrome.runtime.sendMessage({ action: 'getState' });
  updateUI(res.state, res.session);
  
  if (res.session && res.session.pages.length > 0) {
    renderSession(res.session);
  } else if (res.sessions && res.sessions.length > 0) {
    renderEmpty('Resume previous session?', 'Last: ' + res.sessions[0].topic);
  } else {
    renderEmpty('No active session', 'Click Start to begin tracking');
  }
}

function updateUI(state, session) {
  // Update status
  const badge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  
  badge.className = 'status-indicator ' + (state === 'active' ? 'status-active' : '');
  statusText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  
  // Update buttons
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  
  btnStart.disabled = state === 'active';
  btnPause.disabled = state !== 'active';
  btnStop.disabled = state === 'stopped';
  
  // Visual active state
  btnStart.classList.toggle('btn-active', state === 'active');
}

function renderSession(session) {
  const duration = Math.round((Date.now() - session.startTime) / 60000);
  const pages = session.pages || [];
  
  // Info card
  document.getElementById('sessionInfo').innerHTML = `
    <div class="info-card glass">
      <div class="info-row">
        <span class="info-label">Topic</span>
        <span class="info-value" style="text-transform: capitalize">${session.topic || 'General'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Duration</span>
        <span class="info-value">${duration} minutes</span>
      </div>
      <div class="info-row">
        <span class="info-label">Pages tracked</span>
        <span class="info-value">${pages.length}</span>
      </div>
    </div>
  `;
  
  // Pages section
  const pagesHtml = pages.length === 0 ? '' : `
    <div class="section-header">
      <span class="section-title">Tracked Pages</span>
      <span class="section-count">${pages.length} total</span>
    </div>
    <div class="pages-list">
      ${pages.slice().reverse().map((p, i) => `
        <div class="page-item glass" data-url="${p.url}" data-scroll="${p.scrollY || 0}">
          <div class="page-header">
            <span class="page-icon">◉</span>
            <span class="page-domain">${p.domain}</span>
          </div>
          <div class="page-title">${escapeHtml(p.title)}</div>
          <div class="page-footer">
            <div class="progress-bg">
              <div class="progress-fill" style="width: ${p.scrollPercent || 0}%"></div>
            </div>
            <span class="progress-text">${p.scrollPercent || 0}%</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  document.getElementById('pagesSection').innerHTML = pagesHtml;
  
  // Add click handlers
  document.querySelectorAll('.page-item').forEach(item => {
    item.addEventListener('click', async () => {
      const url = item.dataset.url;
      const scrollY = parseInt(item.dataset.scroll) || 0;
      
      // Save scroll position to storage before opening
      await chrome.runtime.sendMessage({
        action: 'scrollUpdate',
        url: url,
        position: { y: scrollY, percent: 0 }
      });
      
      // Open tab
      chrome.tabs.create({ url: url });
    });
  });
}

function renderEmpty(title, subtitle) {
  document.getElementById('sessionInfo').innerHTML = `
    <div class="empty">
      <div class="empty-icon">◯</div>
      <div class="empty-text">${title}</div>
      <div class="empty-sub">${subtitle}</div>
    </div>
  `;
  document.getElementById('pagesSection').innerHTML = '';
}

function setupListeners() {
  document.getElementById('btnStart').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'start' });
    updateUI('active', res.session);
    renderSession(res.session);
  });
  
  document.getElementById('btnPause').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'pause' });
    const res = await chrome.runtime.sendMessage({ action: 'getState' });
    updateUI(res.state, res.session);
  });
  
  document.getElementById('btnStop').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'stop' });
    updateUI('stopped', null);
    renderEmpty('Session saved', 'View in History');
  });
  
  document.getElementById('btnClear').addEventListener('click', async () => {
    if (confirm('Clear all research history?')) {
      await chrome.runtime.sendMessage({ action: 'clearAll' });
      renderEmpty('All cleared', 'Start new session');
      updateUI('stopped', null);
    }
  });
  
  document.getElementById('btnHistory').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'getState' });
    const sessions = res.sessions || [];
    
    if (sessions.length === 0) {
      alert('No saved sessions yet');
      return;
    }
    
    const list = sessions.map((s, i) => 
      `${i+1}. ${s.topic || 'General'} - ${s.pages?.length || 0} pages (${new Date(s.startTime).toLocaleDateString()})`
    ).join('\n');
    
    alert(`Saved Sessions (${sessions.length}):\n\n${list}`);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || 'Untitled';
  return div.innerHTML;
}