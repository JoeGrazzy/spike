/* SPIKE Unified Loader Core v1
 * One owner per operation; idempotent overlay registration; deterministic cleanup.
 * Feature code may use begin()/end() for scoped actions and register() for page overlays.
 */
(() => {
  'use strict';
  if (window.SpikeLoader?.version === 1) return;

  const active = new Map();
  const registrations = new WeakMap();
  let sequence = 0;
  const now = () => (window.performance?.now?.() ?? Date.now());

  function begin(name = 'operation', options = {}) {
    const id = `spike-load-${++sequence}`;
    const record = { id, name: String(name), startedAt: now(), ended: false, timeout: null, onTimeout: options.onTimeout };
    active.set(id, record);
    const timeoutMs = Number(options.timeoutMs);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      record.timeout = window.setTimeout(() => {
        if (record.ended) return;
        try { record.onTimeout?.({ id, name: record.name }); } catch (error) { console.error('[SPIKE loader timeout callback]', error); }
      }, timeoutMs);
    }
    let ended = false;
    return Object.freeze({
      id,
      end() {
        if (ended) return false;
        ended = true; record.ended = true;
        if (record.timeout !== null) window.clearTimeout(record.timeout);
        active.delete(id);
        return true;
      },
      get ended() { return ended; }
    });
  }

  function register(elementOrSelector, options = {}) {
    const element = typeof elementOrSelector === 'string'
      ? document.querySelector(elementOrSelector)
      : elementOrSelector;
    if (!element) return Object.freeze({ hide() { return false; }, show() { return false; }, dispose() { return false; } });
    const existing = registrations.get(element);
    if (existing) return existing.api;

    const startedAt = now();
    const minVisibleMs = Math.max(0, Number(options.minVisibleMs) || 0);
    const hideClass = options.hideClass || (element.id === 'spike-auth-loader' || element.id === 'spike-feed-loader' ? 'is-hidden' : 'hide');
    const retry = options.retryElement || (element.id === 'spike-feed-loader' ? document.getElementById('spikeFeedRetry') : null);
    let hidden = element.classList.contains(hideClass) || element.hidden;
    let disposed = false;
    let hideTimer = null;
    let removeTimer = null;
    let stallTimer = null;
    const retryHandler = typeof options.onRetry === 'function' ? options.onRetry : null;

    const hide = () => {
      if (hidden || disposed) return false;
      hidden = true;
      if (stallTimer !== null) window.clearTimeout(stallTimer);
      const wait = Math.max(0, minVisibleMs - (now() - startedAt));
      hideTimer = window.setTimeout(() => {
        if (disposed) return;
        element.classList.add(hideClass);
        element.setAttribute('aria-hidden', 'true');
        if (element.id === 'spike-feed-loader') removeTimer = window.setTimeout(() => {
          if (element.isConnected && element.classList.contains(hideClass)) element.remove();
        }, 380);
      }, wait);
      return true;
    };
    const show = () => {
      if (disposed) return false;
      hidden = false;
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      if (removeTimer !== null) window.clearTimeout(removeTimer);
      element.hidden = false;
      element.removeAttribute('aria-hidden');
      element.classList.remove(hideClass, 'hidden', 'is-hidden');
      return true;
    };
    const onRetryClick = () => {
      if (retryHandler) {
        try { retryHandler(); } catch (error) { console.error('[SPIKE loader retry]', error); }
      } else if (options.retry === 'reload') window.location.reload();
    };
    if (retry && (retryHandler || options.retry === 'reload')) retry.addEventListener('click', onRetryClick);

    const stallMs = Number(options.stallMs);
    if (Number.isFinite(stallMs) && stallMs > 0 && !hidden) {
      stallTimer = window.setTimeout(() => {
        if (hidden || disposed) return;
        const subtitle = options.subtitleElement || element.querySelector('.spike-feed-loader-subtitle');
        if (subtitle) subtitle.textContent = options.stallMessage || 'This is taking longer than usual. Check your connection.';
        if (retry) retry.hidden = false;
      }, stallMs);
    }
    const dispose = () => {
      if (disposed) return false;
      disposed = true;
      [hideTimer, removeTimer, stallTimer].forEach(timer => { if (timer !== null) window.clearTimeout(timer); });
      if (retry && (retryHandler || options.retry === 'reload')) retry.removeEventListener('click', onRetryClick);
      registrations.delete(element);
      return true;
    };
    const api = Object.freeze({ hide, show, dispose, element, get hidden() { return hidden; } });
    registrations.set(element, { api });
    return api;
  }

  function endAll() {
    for (const record of active.values()) {
      record.ended = true;
      if (record.timeout !== null) window.clearTimeout(record.timeout);
    }
    active.clear();
  }

  window.addEventListener('pagehide', endAll, { once: true });
  window.SpikeLoader = Object.freeze({ version: 1, begin, register, endAll, activeCount: () => active.size });
})();
