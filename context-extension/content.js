let lastScrollY = -1;
let scrollTimeout;

function reportScroll() {
  const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
  const percent = Math.min(100, Math.round((window.scrollY / maxScroll) * 100));
  
  if (Math.abs(window.scrollY - lastScrollY) > 50 || lastScrollY === -1) {
    lastScrollY = window.scrollY;
    
    chrome.runtime.sendMessage({
      action: 'scrollUpdate',
      url: location.href,
      position: { 
        y: window.scrollY, 
        percent: percent,
        max: maxScroll
      }
    }).catch(() => {});
  }
}

// Throttled scroll listener
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(reportScroll, 300);
}, { passive: true });

// Initial report
setTimeout(reportScroll, 1000);

// Report page visit
chrome.runtime.sendMessage({
  action: 'pageVisited',
  data: {
    url: location.href,
    title: document.title,
    domain: location.hostname,
    timestamp: Date.now()
  }
}).catch(() => {});