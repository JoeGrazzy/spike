
/* SPIKE feed boot loader — never owns or replaces feed application logic. */
(() => {
  const loader = document.getElementById("spike-feed-loader");
  if (!loader) return;
  let hidden = false;
  const startedAt = performance.now();
  const MIN_LOADER_MS = 1600;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    const elapsed = performance.now() - startedAt;
    const wait = Math.max(0, MIN_LOADER_MS - elapsed);
    window.setTimeout(() => {
      loader.classList.add("is-hidden");
      window.setTimeout(() => loader.remove(), 320);
    }, wait);
  };

  window.SPIKE_HIDE_FEED_LOADER = hide;
  window.setTimeout(hide, 9000);
})();
