
(() => {
  try {
    const c = navigator.connection;
    if (c && c.saveData) document.documentElement.dataset.saveData = "1";
    if ("contentVisibility" in document.documentElement.style) {
      document.documentElement.classList.add("spike-cv-ready");
    }
  } catch(_) {}
})();

// Presence heartbeat
(function() {
  const INTERVAL = 30000;
  let timer = null, inFlight = false;
  function userId() {
    return window.state?.user?.id || window.currentUser?.id || window.user?.id || null;
  }
  async function send() {
    const uid = userId();
    if (!uid || inFlight || document.visibilityState === "hidden") return;
    inFlight = true;
    try {
      if (window.AppPresence?.heartbeat) await window.AppPresence.heartbeat(uid);
      else if (window.AppPresence?.start) window.AppPresence.start(window.db);
    } catch(e) { console.debug("[SPIKE PRESENCE]", e); }
    finally { inFlight = false; }
  }
  function start() { clearInterval(timer); send(); timer = setInterval(send, INTERVAL); }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") start();
    else { clearInterval(timer); timer = null; }
  });
  window.addEventListener("pagehide", () => clearInterval(timer), {passive:true});
  window.addEventListener("pageshow", start, {passive:true});
  window.addEventListener("online", start, {passive:true});
  window.SPIKEPresencePatch = { start, stop: () => { clearInterval(timer); timer = null; } };
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
  setInterval(refresh, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
})();

// Edit detection
(function() {
  const EDIT_KEYS = new Set(["content","text","body","mediaUrl","mediaType","linkUrl","scheduledAt"]);
  window.SPIKEIsContentEdit = function(changes) {
    if (!changes || typeof changes !== "object") return false;
    return Object.keys(changes).some(k => EDIT_KEYS.has(k));
  };
})();
