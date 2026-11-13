
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
