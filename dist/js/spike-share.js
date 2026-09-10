/* SPIKE Share Engine — branded external sharing for images, video previews, text and profiles. */
(() => {
  'use strict';

  const LOGO_URL = new URL('assets/icon/logo.png', document.baseURI).href;
  const SHARE_PAGE = 'share.html';
  const BRAND = 'SPIKE';
  const MAX_TEXT = 360;

  const clean = (v, fallback = '') => String(v ?? fallback).replace(/\s+/g, ' ').trim();
  const short = (v, max = MAX_TEXT) => {
    const s = clean(v);
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
  };

  function canvasRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function fitText(ctx, text, maxWidth, font, maxLines = 6) {
    ctx.font = font;
    const words = short(text, 700).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else if (line) { lines.push(line); line = word; }
      else lines.push(word);
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, '').slice(0, 48).trimEnd()}…`;
    }
    return lines;
  }

  async function loadImage(src, timeout = 4500) {
    if (!src) return null;
    return new Promise(resolve => {
      const img = new Image();
      let done = false;
      const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => finish(null), timeout);
      img.crossOrigin = 'anonymous';
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      img.src = src;
    });
  }

  async function loadVideoFrame(src, timeout = 5000) {
    if (!src) return null;
    return new Promise(resolve => {
      const video = document.createElement('video');
      let done = false;
      const finish = value => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          if (!value) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {} }
          resolve(value);
        }
      };
      const timer = setTimeout(() => finish(null), timeout);
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.addEventListener('loadeddata', () => {
        try { video.currentTime = Math.min(0.15, Number.isFinite(video.duration) ? video.duration / 10 : 0.15); }
        catch (_) { try { resolve(video); } catch (_) { finish(null); } }
      }, { once: true });
      video.addEventListener('seeked', () => finish(video), { once: true });
      video.addEventListener('error', () => finish(null), { once: true });
      video.src = src;
      video.load();
    });
  }

  async function logo() { return loadImage(LOGO_URL, 3500); }

  function drawImageCover(ctx, source, x, y, w, h) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return false;
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  function drawBackdrop(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#111827');
    g.addColorStop(0.55, '#230914');
    g.addColorStop(1, '#05070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    for (let i = 0; i < 12; i++) {
      const x = (i * 173) % w;
      const y = (i * 97) % h;
      ctx.beginPath(); ctx.arc(x, y, 70 + (i % 4) * 18, 0, Math.PI * 2); ctx.fill();
    }
  }

  async function makeCard({ title = 'A Signal from SPIKE', text = '', author = '', mediaUrl = '', mediaType = '', kind = 'signal' } = {}) {
    const W = 1080, H = 1350, pad = 72, footerH = 190;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { alpha: false });
    drawBackdrop(ctx, W, H);

    const source = mediaUrl && mediaType === 'video'
      ? await loadVideoFrame(mediaUrl)
      : mediaUrl ? await loadImage(mediaUrl) : null;

    const mediaH = source ? H - footerH - 170 : 0;
    if (source && drawImageCover(ctx, source, 0, 0, W, mediaH)) {
      const shade = ctx.createLinearGradient(0, mediaH - 240, 0, mediaH);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,.72)');
      ctx.fillStyle = shade; ctx.fillRect(0, mediaH - 240, W, 240);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.20)';
      ctx.fillRect(pad, pad, W - pad * 2, H - footerH - pad * 2);
      ctx.fillStyle = '#fff';
      ctx.font = '700 42px system-ui, sans-serif';
      ctx.fillText(kind === 'profile' ? 'SPIKE PROFILE' : kind === 'room' ? 'SPIKE ROOM' : 'SPIKE SIGNAL', pad, 150);
    }

    const l = await logo();
    if (l) {
      const size = 118;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 22;
      ctx.drawImage(l, pad, Math.max(28, mediaH - 150), size, size);
      ctx.restore();
    }

    ctx.fillStyle = '#fff';
    ctx.font = '800 46px system-ui, sans-serif';
    const titleY = source ? mediaH - 42 : 245;
    ctx.fillText(short(title, 72), pad, titleY);

    if (!source) {
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.font = '500 38px system-ui, sans-serif';
      const lines = fitText(ctx, text, W - pad * 2, '500 38px system-ui, sans-serif', 7);
      let y = 330;
      for (const line of lines) { ctx.fillText(line, pad, y); y += 56; }
    }

    ctx.fillStyle = 'rgba(0,0,0,.66)';
    ctx.fillRect(0, H - footerH, W, footerH);
    ctx.fillStyle = '#fff';
    ctx.font = '900 42px system-ui, sans-serif';
    ctx.fillText(BRAND, pad, H - 112);
    ctx.fillStyle = 'rgba(255,255,255,.76)';
    ctx.font = '500 28px system-ui, sans-serif';
    ctx.fillText(short(author ? `@${String(author).replace(/^@/, '')}` : 'Shared from SPIKE', 42), pad, H - 66);
    return c;
  }

  function canvasBlob(canvas, type = 'image/jpeg', quality = .91) {
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create share image')), type, quality));
  }


  function brandedShareUrl(url) {
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

  function mediaForPost(post) {
    const items = Array.isArray(post?.mediaItems) && post.mediaItems.length
      ? post.mediaItems
      : (post?.mediaUrl ? [{ url: post.mediaUrl, type: post.mediaType || 'image', originalUrl: post.mediaOriginalUrl }] : []);
    const first = items[0] || null;
    return {
      mediaUrl: first?.url || post?.mediaUrl || '',
      mediaType: first?.type || post?.mediaType || '',
    };
  }

  async function prepare({ title = 'SPIKE', text = '', url = location.href, mediaUrl = '', mediaType = '', author = '', kind = 'signal', fileName = 'spike-share.jpg', preferCard = true } = {}) {
    const shareTitle = clean(title, 'SPIKE');
    const shareText = short(text || `Shared from SPIKE`, 420);
    const shareUrl = brandedShareUrl(url);
    let cardFile = null;
    let card = null;

    if (preferCard) {
      try {
        card = await makeCard({ title: shareTitle, text: shareText, mediaUrl, mediaType, author, kind });
        const blob = await canvasBlob(card);
        cardFile = new File([blob], fileName, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
      } catch (e) {
        // Remote media can block canvas export when CORS is unavailable. Preserve
        // the branded experience by generating a text-only card instead.
        try {
          card = await makeCard({ title: shareTitle, text: shareText, author, kind });
          const blob = await canvasBlob(card);
          cardFile = new File([blob], fileName, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
        } catch (fallbackError) {
          console.warn('[SPIKE SHARE] branded card unavailable', fallbackError || e);
        }
      }
    }

    return Object.freeze({ title: shareTitle, text: shareText, url: shareUrl, file: cardFile, card });
  }

  async function sharePrepared(prepared) {
    const payload = prepared || {};
    const shareTitle = clean(payload.title, 'SPIKE');
    const shareText = short(payload.text || `Shared from SPIKE`, 420);
    const shareUrl = payload.url || location.href;
    const cardFile = payload.file || null;

    if (navigator.share) {
      // IMPORTANT: when sharing the branded card, do NOT put the canonical URL
      // in the Web Share `url` field. Some Android share targets (notably social
      // apps) prioritize that field and drop the image attachment, producing
      // the generic link preview seen in the old flow. Put the link in `text`
      // instead so the actual SPIKE-branded image remains the primary payload.
      if (cardFile) {
        const fileSupported = !navigator.canShare || (() => {
          try { return navigator.canShare({ files: [cardFile] }); } catch (_) { return false; }
        })();
        if (fileSupported) {
          const brandedText = `${shareText}\n\nView this Signal on SPIKE: ${shareUrl}`;
          try {
            await navigator.share({
              title: shareTitle,
              text: brandedText,
              files: [cardFile]
            });
            return { method: 'branded-file', file: cardFile, url: shareUrl };
          } catch (e) {
            if (e?.name === 'AbortError') throw e;
            console.warn('[SPIKE SHARE] branded file share failed; trying file-only payload', e);
          }
          // A few Android targets reject the title/text combination with an
          // image. Retry with the minimum valid file payload before falling
          // back to a link-only share.
          try {
            await navigator.share({ files: [cardFile] });
            return { method: 'branded-file-only', file: cardFile, url: shareUrl };
          } catch (e) {
            if (e?.name === 'AbortError') throw e;
            console.warn('[SPIKE SHARE] file-only share failed; trying link', e);
          }
        }
      }

      try {
        await navigator.share({ title: shareTitle, text: `${shareText}\n\nView this Signal on SPIKE: ${shareUrl}` });
        return { method: 'link', url: shareUrl };
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        console.warn('[SPIKE SHARE] link share failed', e);
      }
    }

    try {
      await navigator.clipboard?.writeText(shareUrl);
      return { method: 'copied-link', file: cardFile, url: shareUrl };
    } catch (_) {
      return { method: 'none', file: cardFile, url: shareUrl };
    }
  }

  async function share({ title = 'SPIKE', text = '', url = location.href, mediaUrl = '', mediaType = '', author = '', kind = 'signal', fileName = 'spike-share.jpg', preferCard = true } = {}) {
    const prepared = await prepare({ title, text, url, mediaUrl, mediaType, author, kind, fileName, preferCard });
    return sharePrepared(prepared);
  }

  window.SPIKEShare = Object.freeze({ share, prepare, sharePrepared, makeCard, mediaForPost, LOGO_URL, brandedShareUrl });
})();
