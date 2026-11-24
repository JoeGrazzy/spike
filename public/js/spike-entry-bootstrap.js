/* Small, bounded entry bootstrap. The interface renders before auth initialization. */
(() => {
  'use strict';
  const status = document.getElementById('status');
  const showError = (message) => {
    if (!status) return;
    status.textContent = message;
    status.className = 'status show error';
  };
  const connectionStatus = document.getElementById('connectionStatus');
  const updateConnection = () => {
    if (!connectionStatus) return;
    const offline = navigator.onLine === false;
    connectionStatus.hidden = !offline;
    connectionStatus.textContent = offline
      ? 'You appear to be offline. SPIKE will reconnect when your internet connection returns.'
      : '';
  };
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();

  const deadline = Date.now() + 12000;
  const start = () => {
    if (window.SPIKE_SUPABASE_READY && window.SPIKE_SUPABASE) {
      import('./spike-auth.js').catch((error) => {
        console.error('[SPIKE entry auth]', error);
        showError('SPIKE could not start secure sign-in. Reload the page or check your connection.');
      });
      return;
    }
    if (Date.now() >= deadline) {
      // Clearer, non-"offline" language so it is never confused with a PWA offline shell
      const reason = !navigator.onLine
        ? 'You are offline. Reconnect and reload the page.'
        : 'Secure sign-in could not initialize. Reload the page. If this keeps happening, clear site data for this domain.';
      showError(reason);
      return;
    }
    window.setTimeout(start, 100);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
