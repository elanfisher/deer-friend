// Applies your saved settings to the fawn on this page, and keeps her in sync when you change
// them in the popup (chrome.storage fires in every tab).
(() => {
  'use strict';
  if (!window.DEER_OVERLAY || !window.deerDesktop) return;

  const DEFAULTS = {
    enabled: true, scale: 1,
    friend: false, ignore: false, watch: true, follow: false, shy: true,
  };

  function apply(cfg) {
    const deer = window.deerDesktop;
    window.DEER_OVERLAY.style.display = cfg.enabled ? 'block' : 'none';
    deer.setScale(cfg.scale);
    deer.setOptions({
      friend: cfg.friend, ignore: cfg.ignore, watch: cfg.watch, follow: cfg.follow, shy: cfg.shy,
    });
    deer.setPaused(!cfg.enabled);   // paused = no animation frames at all
  }

  chrome.storage.sync.get(DEFAULTS, apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get(DEFAULTS, apply);
  });
})();
