/* SPIKE menu tap guard: independent of the feed's asynchronous runtime boot. */
(function () {
  'use strict';
  if (window.__SPIKE_MENU_TAP_GUARD__) return;
  window.__SPIKE_MENU_TAP_GUARD__ = true;

  function closeMenu() {
    const menu = document.getElementById('menuOverlay');
    if (!menu) return;
    menu.classList.remove('open', 'show');
    menu.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('spike-menu-open');
  }
  function openPanel(panel, focusTarget) {
    if (!panel) return false;
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    if (focusTarget) window.setTimeout(() => focusTarget.focus(), 80);
    return true;
  }
  document.addEventListener('click', function (event) {
    const control = event.target && event.target.closest && event.target.closest('[data-menu-action]');
    if (!control) return;
    const action = control.getAttribute('data-menu-action');
    if (!['ask-spike', 'coffee', 'theme', 'pulse'].includes(action)) return;

    // Own these taps at document capture phase so a failed/late feed initializer
    // or an older handler cannot swallow the action.
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    try {
      if (action === 'coffee') {
        closeMenu();
        window.location.href = new URL('coffee.html', window.location.href).href;
        return;
      }
      if (action === 'ask-spike') {
        closeMenu();
        const panel = document.getElementById('spikeAiSearchOverlay');
        const input = document.getElementById('spikeAiInput');
        if (!openPanel(panel, input)) console.error('[SPIKE menu] AI Search panel/input missing');
        return;
      }
      if (action === 'theme') {
        const api = window.SPIKE_THEME;
        if (api && typeof api.next === 'function') api.next();
        else console.error('[SPIKE menu] SPIKE_THEME.next unavailable');
        return;
      }
      if (action === 'pulse') {
        closeMenu();
        if (typeof window.SPIKE_OPEN_PULSE === 'function') {
          window.SPIKE_OPEN_PULSE();
          return;
        }
        const hub = document.getElementById('spikeFeatureHub');
        if (!openPanel(hub)) console.error('[SPIKE menu] Feature Center/Pulse panel missing');
        else document.body.classList.add('spike-feature-open');
      }
    } catch (error) {
      console.error('[SPIKE menu] tap action failed:', action, error);
    }
  }, true);
})();
