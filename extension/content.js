// Makes a see-through, click-through overlay for her to live on, then hands it to deer.js
// (which runs next in this same isolated world). She starts paused until settings.js has read
// your preferences, so she never flickers onto a page you've turned her off for.
(() => {
  'use strict';
  if (window.top !== window) return;                 // top-level page only, not every iframe

  const overlay = document.createElement('div');
  overlay.id = 'deer-friend-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:2147483646',
    'display:none', 'border:0', 'margin:0', 'padding:0', 'background:none',
  ].join(';');

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated';
  overlay.appendChild(canvas);
  document.documentElement.appendChild(overlay);

  window.DEER_EXTENSION = true;
  window.DEER_CANVAS = canvas;
  window.DEER_START_PAUSED = true;
  window.DEER_OVERLAY = overlay;
})();
