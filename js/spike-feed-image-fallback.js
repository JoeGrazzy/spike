/* Safe, one-shot fallback for transformed Cloudinary Feed thumbnails.
 * Keeps the protected Feed runtime untouched and never changes stored URLs.
 */
(() => {
  'use strict';
  function originalCloudinaryImageUrl(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      if (url.protocol !== 'https:' || !/(^|\.)cloudinary\.com$/i.test(url.hostname)) return '';
      const marker = '/image/upload/';
      const index = url.pathname.indexOf(marker);
      if (index < 0) return '';
      const tailStart = index + marker.length;
      const parts = url.pathname.slice(tailStart).split('/');
      // Cloudinary may chain transformations in one segment or across consecutive
      // segments. Strip only segments made entirely of recognizable transform tokens;
      // stop at the first version, folder, or asset segment.
      const isTransformSegment = segment => {
        if (!segment) return false;
        const tokens = segment.split(',');
        return tokens.every(token => /^(?:f_(?:auto|gif)|q_[^/]+|w_\d+|h_\d+|c_[a-z]+|dpr_[^/]+|fl_[a-z]+)$/i.test(token));
      };
      let count = 0;
      while (count < parts.length && isTransformSegment(parts[count])) count++;
      if (!count) return '';
      url.pathname = url.pathname.slice(0, tailStart) + parts.slice(count).join('/');
      return url.href;
    } catch (_) { return ''; }
  }
  function fallback(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.spikeOriginalFallbackAttempted === '1') return false;
    const original = originalCloudinaryImageUrl(img.currentSrc || img.src);
    if (!original || original === img.src) return false;
    img.dataset.spikeOriginalFallbackAttempted = '1';
    img.src = original;
    return true;
  }
  document.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('#posts .post-media')) return;
    fallback(img);
  }, true);
  window.SPIKEFeedImageFallback = Object.freeze({ originalCloudinaryImageUrl });
})();
