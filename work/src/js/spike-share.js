/* SPIKE Share Engine — external sharing for posts, media, text and profiles. */
(() => {
  'use strict';

  const SHARE_PAGE = 'share.html';
  const MAX_TEXT = 360;

  const clean = (v, fallback = '') => String(v ?? fallback).replace(/\s+/g, ' ').trim();
  const short = (v, max = MAX_TEXT) => {
    const s = clean(v);
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
  };

  function shareUrl(url) {
    try {
      const u = new URL(url || location.href, location.href);
      if (u.origin !== location.origin) return u.href;
      const target = `${u.pathname}${u.search}${u.hash}`;
      if (/\bshare\.html$/i.test(u.pathname)) return u.href;
      return new URL(`${SHARE_PAGE}?target=${encodeURIComponent(target)}`, location.origin).href;
    } catch (_) {
      return url || location.href;
    }
  }


  async function prepare({ title = 'SPIKE', text = '', url = location.href } = {}) {
    return Object.freeze({
      title: clean(title, 'SPIKE'),
      text: short(text || 'Shared from SPIKE', 420),
      url: shareUrl(url),
    });
  }

  async function sharePrepared(prepared) {
    const payload = prepared || {};
    const shareTitle = clean(payload.title, 'SPIKE');
    const shareText = short(payload.text || 'Shared from SPIKE', 420);
    const shareUrl = payload.url || location.href;
    const textWithUrl = `${shareText}\n\nView this Signal on SPIKE: ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: textWithUrl });
        return { method: 'link', url: shareUrl };
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        console.warn('[SPIKE SHARE] device sharing failed', e);
      }
    }

    try {
      await navigator.clipboard?.writeText(shareUrl);
      return { method: 'copied-link', url: shareUrl };
    } catch (_) {
      return { method: 'none', url: shareUrl };
    }
  }

  async function share({ title = 'SPIKE', text = '', url = location.href } = {}) {
    const prepared = await prepare({ title, text, url });
    return sharePrepared(prepared);
  }

  window.SPIKEShare = Object.freeze({ share, prepare, sharePrepared, shareUrl });
})();
