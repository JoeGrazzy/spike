/* One pre-paint theme bootstrap shared by all SPIKE application pages. */
(() => {
  try {
    const key = 'spike-theme-choice-v3';
    const versionKey = 'spike-theme-version';
    const prior = localStorage.getItem(key);
    let choice = Number.parseInt(prior || '1', 10);

    if (localStorage.getItem(versionKey) !== '5') {
      if (prior !== null) {
        if (!Number.isInteger(choice) || choice < 1 || choice > 5) choice = 1;
        localStorage.setItem(key, String(choice));
      }
      localStorage.setItem(versionKey, '5');
      localStorage.removeItem('spike-theme-2-mode');
    }

    if (!Number.isInteger(choice) || choice < 1 || choice > 5) choice = 1;
    const theme = ({ 1: 'dark', 2: 'light', 3: 'dark', 4: 'light', 5: 'dark' })[choice];
    const root = document.documentElement;
    root.dataset.spikeStyle = String(choice);
    root.dataset.theme = theme;
    root.dataset.spikeThemeMode = theme;
    root.dataset.spikeThemeId = String(choice);
    root.dataset.spikeThemeVersion = '5';
    root.style.colorScheme = theme;
  } catch (_) {
    /* Theme storage may be unavailable in restricted browser contexts. */
  }
})();
