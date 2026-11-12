/* SPIKE first-login welcome — shown once after registration / first successful session */
(() => {
  'use strict';
  if (window.__SPIKE_WELCOME__) return;
  window.__SPIKE_WELCOME__ = true;

  const KEY = 'spike-welcome-seen-v1';

  function alreadySeen() {
    try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
  }

  function markSeen() {
    try { localStorage.setItem(KEY, '1'); } catch {}
  }

  function showWelcome(name) {
    if (alreadySeen()) return;
    markSeen();

    const display = (name || 'there').trim().split(/\s+/)[0] || 'there';
    const overlay = document.createElement('div');
    overlay.id = 'spike-welcome-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Welcome to SPIKE');
    overlay.innerHTML = `
      <div class="spike-welcome-card">
        <div class="spike-welcome-mark">✨</div>
        <h2>Welcome, ${display}</h2>
        <p>You’re in. Start by saying hello to someone, exploring the feed, or joining a room.</p>
        <button type="button" class="spike-welcome-btn" id="spikeWelcomeContinue">Let’s go</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
#spike-welcome-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.spike-welcome-card{width:min(360px,100%);padding:28px 24px;border-radius:22px;background:var(--spike-surface,#14141c);border:1px solid var(--spike-line,rgba(255,255,255,.1));box-shadow:0 24px 60px rgba(0,0,0,.45);text-align:center;color:var(--spike-text,#f5f6ff)}
.spike-welcome-mark{font-size:32px;margin-bottom:10px}
.spike-welcome-card h2{margin:0 0 8px;font-size:22px;font-weight:750;letter-spacing:-.02em}
.spike-welcome-card p{margin:0 0 20px;font-size:14px;line-height:1.5;color:var(--spike-muted,#a8a0bb)}
.spike-welcome-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border:0;border-radius:14px;background:var(--spike-action-bg,#6544c8);color:var(--spike-action-text,#fff);font-size:14px;font-weight:700;cursor:pointer}
.spike-welcome-btn:hover,.spike-welcome-btn:focus-visible{filter:brightness(1.08);outline:none}
@media(prefers-reduced-motion:reduce){#spike-welcome-overlay{backdrop-filter:none}}
`;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      style.remove();
    };
    overlay.querySelector('#spikeWelcomeContinue').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  // Public API — call after successful auth when we have a display name
  window.SPIKEWelcome = {
    maybeShow(name) { showWelcome(name); },
    reset() { try { localStorage.removeItem(KEY); } catch {} }
  };
})();
