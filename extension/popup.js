// Reads and writes the settings shared with every tab's content script.
'use strict';

const DEFAULTS = {
  enabled: true, scale: 1,
  friend: false, ignore: false, watch: true, follow: false, shy: true,
};
const FLAGS = ['enabled', 'friend', 'shy', 'watch', 'follow', 'ignore'];

chrome.storage.sync.get(DEFAULTS, cfg => {
  for (const key of FLAGS) document.getElementById(key).checked = !!cfg[key];
  document.getElementById('scale').value = String(cfg.scale);
  refresh();
});

for (const key of FLAGS) {
  document.getElementById(key).addEventListener('change', e => {
    chrome.storage.sync.set({ [key]: e.target.checked });
    refresh();
  });
}
document.getElementById('scale').addEventListener('change', e => {
  chrome.storage.sync.set({ scale: Number(e.target.value) });
});

// "Ignore the cursor" wins over watching and following, so grey those out.
function refresh() {
  const ignoring = document.getElementById('ignore').checked;
  for (const key of ['watch', 'follow', 'shy']) {
    document.getElementById(key).disabled = ignoring;
    document.getElementById(key).parentElement.style.opacity = ignoring ? 0.45 : 1;
  }
}
