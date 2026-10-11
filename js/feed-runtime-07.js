
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

  // Keep the premium loader visible while startup is genuinely in progress.
  // On a stall, the text-free glowing orb becomes a retry control.
  const retry = document.getElementById("spikeFeedRetry");
  retry?.addEventListener("click", () => window.location.reload());
  window.setTimeout(() => {
    if (hidden || !loader.isConnected) return;
    const subtitle = loader.querySelector(".spike-feed-loader-subtitle");
    if (subtitle) subtitle.textContent = "This is taking longer than usual. Check your connection.";
    if (retry) retry.hidden = false;
  }, 9000);
})();
