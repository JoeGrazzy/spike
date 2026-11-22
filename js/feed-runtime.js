(()=>{try{const n=performance.getEntriesByType?.('navigation')?.[0];const back=n?.type==='back_forward';const raw=sessionStorage.getItem('spike.feed.snapshot');const snap=raw?JSON.parse(raw):null;const fresh=!!(snap&&snap.v===1&&snap.at&&Date.now()-Number(snap.at)<30*60*1000);const intent=sessionStorage.getItem('spike.feed.return.intent.v1');const returnIntent=intent?JSON.parse(intent):null;const intentFresh=!!(returnIntent&&returnIntent.v===1&&Date.now()-Number(returnIntent.at||0)<30*60*1000);if((back||intentFresh)&&fresh){document.documentElement.dataset.spikeFeedRestore='1'}else if(n?.type==='reload'){sessionStorage.removeItem('spike.feed.snapshot');sessionStorage.removeItem('spike.feed.return.intent.v1')}}catch(_){}})();

(() => {
  try {
    const c = navigator.connection;
    if (c && c.saveData) document.documentElement.dataset.saveData = "1";
    if ("contentVisibility" in document.documentElement.style) {
      document.documentElement.classList.add("spike-cv-ready");
    }
  } catch(_) {}
})();

// Relative timestamps
(function() {
  function dateValue(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
    const n = Number(v);
    if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? t : NaN;
  }
  function relativeTime(v) {
    const ms = dateValue(v);
    if (!Number.isFinite(ms)) return "";
    const diff = Math.max(0, Date.now() - ms);
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return "now";
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    const week = Math.floor(day / 7);
    if (week < 5) return `${week}w`;
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, {month:"short", day:"numeric", year:d.getFullYear() === new Date().getFullYear() ? undefined : "numeric"});
  }
  function refresh() {
    document.querySelectorAll("[data-spike-time]").forEach(el => {
      const raw = el.dataset.spikeTime;
      const txt = relativeTime(raw);
      if (txt) {
        el.textContent = txt;
        el.title = new Date(dateValue(raw)).toLocaleString();
      }
    });
  }
  window.SPIKETime = { dateValue, relativeTime, refresh };

  // Avoid waking the Feed every 30 seconds while its tab is backgrounded.
  let refreshTimer = null;
  function startRefreshTimer() {
    if (refreshTimer !== null || document.visibilityState !== "visible") return;
    refresh();
    refreshTimer = window.setInterval(refresh, 30000);
  }
  function stopRefreshTimer() {
    if (refreshTimer === null) return;
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") startRefreshTimer();
    else stopRefreshTimer();
  });
  startRefreshTimer();
})();

// Edit detection
(function() {
  const EDIT_KEYS = new Set(["content","text","body","mediaUrl","mediaType","linkUrl","scheduledAt"]);
  window.SPIKEIsContentEdit = function(changes) {
    if (!changes || typeof changes !== "object") return false;
    return Object.keys(changes).some(k => EDIT_KEYS.has(k));
  };
})();

(()=>{
  const lock=()=>{
    const h=document.querySelector('body > header.header');
    if(!h)return;
    h.hidden=false;
    h.removeAttribute('aria-hidden');
    h.style.removeProperty('display');
    h.style.removeProperty('visibility');
    h.style.removeProperty('opacity');
    h.style.removeProperty('transform');
    h.style.removeProperty('filter');
  };
  const boot=()=>{
    lock();
    const h=document.querySelector('body > header.header');
    if(h)new MutationObserver(lock).observe(h,{attributes:true,attributeFilter:['hidden','aria-hidden','style','class']});
    new MutationObserver(lock).observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme','data-spikestyle']});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(()=>{let last=0;const isNet=e=>{const m=String(e?.message||e?.reason?.message||e||'').toLowerCase();return !navigator.onLine||/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out/.test(m)};const notice=(msg)=>{const now=Date.now();if(now-last<5000)return;last=now;try{if(typeof window.spikePremiumToast==='function')window.spikePremiumToast(msg,'warning',4500);else console.warn('[SPIKE network]',msg)}catch{console.warn('[SPIKE network]',msg)}};window.addEventListener('offline',()=>notice('You are offline. Actions will resume when your connection returns.'));window.addEventListener('online',()=>notice('Connection restored. Retry the last action if needed.'));window.addEventListener('unhandledrejection',e=>{if(isNet(e)){e.preventDefault();notice(navigator.onLine?'SPIKE could not complete a network request. Please retry.':'You are offline. Please reconnect and retry.')}})})();
