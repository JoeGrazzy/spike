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
        showError('SPIKE could not start secure sign-in. Check your connection and reload the page.');
      });
      return;
    }
    if (Date.now() >= deadline) {
      showError('Secure sign-in could not connect. Check your internet connection and reload the page.');
      return;
    }
    window.setTimeout(start, 100);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
