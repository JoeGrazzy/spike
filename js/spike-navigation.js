/* SPIKE Navigation Restoration V1
 * BFCache-first lifecycle + lightweight scroll restoration for normal back/forward loads.
 * Feed uses its own structured snapshot in feed.html; this module intentionally skips feed scroll.
 */
(() => {
  'use strict';

  const NAV = window.SPIKENavigation = window.SPIKENavigation || {};
  const VERSION = 1;
  const KEY = 'spike.navigation.state.v1';
  const TTL = 30 * 60 * 1000;
  const navigation = (() => {
    try { return performance.getEntriesByType?.('navigation')?.[0] || null; } catch (_) { return null; }
  })();
  const navType = navigation?.type || 'navigate';
  const isBackForward = navType === 'back_forward';
  const isReload = navType === 'reload';
  const isFeed = /(^|\/)feed\.html$/i.test(location.pathname);
  const FEED_RETURN_INTENT_KEY = 'spike.feed.return.intent.v1';

  function readMap() {
    try {
      const raw = sessionStorage.getItem(KEY);
      const value = raw ? JSON.parse(raw) : {};
      return value && typeof value === 'object' ? value : {};
    } catch (_) { return {}; }
  }

  function writeMap(map) {
    try { sessionStorage.setItem(KEY, JSON.stringify(map)); } catch (_) {}
  }

  function routeKey() {
    return `${location.pathname}${location.search}`;
  }

  function capture() {
    if (isFeed) return;
    try {
      const map = readMap();
      map[routeKey()] = { v: VERSION, at: Date.now(), y: Math.max(0, window.scrollY || window.pageYOffset || 0) };
      const entries = Object.entries(map)
        .filter(([, item]) => item && item.v === VERSION && Date.now() - Number(item.at || 0) <= TTL)
        .slice(-30);
      writeMap(Object.fromEntries(entries));
    } catch (_) {}
  }

  function restore() {
    if (!isBackForward || isFeed) return;
    try {
      const item = readMap()[routeKey()];
      if (!item || item.v !== VERSION || Date.now() - Number(item.at || 0) > TTL) return;
      const y = Math.max(0, Number(item.y) || 0);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { window.scrollTo({ top: y, left: 0, behavior: 'auto' }); }
        catch (_) { window.scrollTo(0, y); }
      }));
    } catch (_) {}
  }

  if (isReload) {
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }

  window.addEventListener('pagehide', capture, { capture: true });
  window.addEventListener('pageshow', event => {
    NAV.isBFCacheRestore = !!event.persisted;
    // A persisted pageshow is a real BFCache restore. Do not rebuild, reload, or
    // overwrite page state; the browser has already preserved the document.
    if (event.persisted) return;
    restore();
  }, { passive: true });

  NAV.version = VERSION;
  NAV.navigationType = navType;
  NAV.isBackForward = isBackForward;
  function markFeedReturnIntent() {
    try {
      sessionStorage.setItem(FEED_RETURN_INTENT_KEY, JSON.stringify({ v: 1, at: Date.now() }));
    } catch (_) {}
  }

  if (!isFeed) {
    window.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!target) return;
      try {
        const url = new URL(target.href, location.href);
        if (url.origin === location.origin && /(^|\/)feed\.html$/i.test(url.pathname)) {
          markFeedReturnIntent();
        }
      } catch (_) {}
    }, { capture: true, passive: true });
  }

  NAV.isBFCacheRestore = false;
  NAV.capture = capture;
  NAV.restore = restore;
  NAV.markFeedReturnIntent = markFeedReturnIntent;
})();
