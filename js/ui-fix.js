/* SPIKE shared runtime hardening: error reporting, menu/nav sync, network state. */
(function () {
  'use strict';
  if (window.__SPIKE_UI_FIX__) return;
  window.__SPIKE_UI_FIX__ = true;

  function boundary() {
    let el = document.getElementById('spikeRuntimeError');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'spikeRuntimeError';
    el.className = 'spike-error-boundary';
    el.setAttribute('role', 'alert');
    el.innerHTML = '<span class="spike-error-text"></span><button type="button" aria-label="Dismiss error">Dismiss</button>';
    el.querySelector('button').addEventListener('click', function () { el.classList.remove('show'); });
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function report(message) {
    try {
      const text = String(message || 'Something went wrong. Please try again.').slice(0, 240);
      const el = boundary();
      el.querySelector('.spike-error-text').textContent = text;
      el.classList.add('show');
      clearTimeout(el._timer);
      el._timer = setTimeout(function () { el.classList.remove('show'); }, 7000);
    } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    if (event && event.error) console.error('[SPIKE runtime]', event.error);
    report('SPIKE encountered an unexpected error. Please retry the action.');
  });
  window.addEventListener('unhandledrejection', function (event) {
    if (event && event.reason) console.error('[SPIKE async]', event.reason);
    report('SPIKE could not complete that action. Please try again.');
  });

  function syncMenuNav() {
    const body = document.body;
    if (!body) return;
    const open = !!document.querySelector(
      '.spike-menu-overlay.open, .spike-menu-overlay[aria-hidden="false"], ' +
      '.overlay.open[id*="menu" i], [id*="menu" i].open, .side-menu.open, .drawer.open'
    );
    body.classList.toggle('spike-menu-nav-hidden', open);
    document.documentElement.classList.toggle('spike-menu-nav-hidden', open);
  }

  document.addEventListener('click', function () { queueMicrotask(syncMenuNav); }, true);
  new MutationObserver(syncMenuNav).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  window.addEventListener('online', function () { window.dispatchEvent(new CustomEvent('spike-network-status', { detail: { online: true } })); });
  window.addEventListener('offline', function () { window.dispatchEvent(new CustomEvent('spike-network-status', { detail: { online: false } })); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncMenuNav, { once: true }); else syncMenuNav();
})();
