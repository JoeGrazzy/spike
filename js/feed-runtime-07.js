/* SPIKE feed boot loader — lifecycle is owned by the shared loader controller. */
(() => {
  const loader = document.getElementById("spike-feed-loader");
  if (!loader) return;
  const core = window.SpikeLoader;
  if (!core || typeof core.register !== "function") {
    // Fail safely if the shared runtime is unavailable; preserve a manual retry.
    const retry = document.getElementById("spikeFeedRetry");
    retry?.addEventListener("click", () => window.location.reload());
    window.SPIKE_HIDE_FEED_LOADER = () => {
      loader.classList.add("is-hidden");
      window.setTimeout(() => loader.remove(), 320);
    };
    return;
  }
  const controller = core.register(loader, {
    minVisibleMs: 1600,
    stallMs: 9000,
    retry: "reload",
    hideClass: "is-hidden",
    retryElement: document.getElementById("spikeFeedRetry"),
    stallMessage: "This is taking longer than usual. Check your connection."
  });
  window.SPIKE_HIDE_FEED_LOADER = () => controller.hide();
})();
