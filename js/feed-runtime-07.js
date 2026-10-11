
/* SPIKE feed loader adapter — delegates lifecycle and retry ownership to shared core. */
(() => {
  const loader = document.getElementById("spike-feed-loader");
  if (!loader) return;
  const core = window.SpikeLoader;
  if (!core) {
    // Defensive fallback for a misconfigured deployment; preserve functional boot.
    let hidden = false;
    window.SPIKE_HIDE_FEED_LOADER = () => {
      if (hidden) return;
      hidden = true;
      loader.classList.add("is-hidden");
      window.setTimeout(() => loader.remove(), 380);
    };
    document.getElementById("spikeFeedRetry")?.addEventListener("click", () => window.location.reload());
    return;
  }
  const controller = core.register(loader, {
    minVisibleMs: 1600,
    stallMs: 9000,
    retry: "reload",
    retryElement: document.getElementById("spikeFeedRetry"),
    stallMessage: "This is taking longer than usual. Check your connection."
  });
  window.SPIKE_HIDE_FEED_LOADER = () => controller.hide();
  window.SPIKE_SHOW_FEED_LOADER = () => controller.show();
})();

