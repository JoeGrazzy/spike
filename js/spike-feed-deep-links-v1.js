/* SPIKE Feed deep links — opens the existing Discover experience when routed from room navigation. */
(() => {
  'use strict';
  if (!/^#discover(?:$|[/?])/.test(window.location.hash || '')) return;
  const activate = () => {
    const discover = document.querySelector('#spikeBottomNav [data-spike-nav="discover"]');
    if (discover) discover.click();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(activate), { once: true });
  else requestAnimationFrame(activate);
})();
