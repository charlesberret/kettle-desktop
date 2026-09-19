// Thin shell bridge. The product sitting is core static/index.html (same-origin
// on the sidecar). This preload exposes the native folder picker the sitting
// already calls, plus optional core URL/token helpers for host chrome.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kettle', {
  pickFolder: () => ipcRenderer.invoke('kettle:pick-folder'),
  getCoreUrl: () => ipcRenderer.invoke('kettle:get-core-url'),
  getCoreToken: () => ipcRenderer.invoke('kettle:get-core-token'),
});

// Legacy shim for any residual pywebview-era callers.
contextBridge.exposeInMainWorld('pywebview', {
  api: {
    pick_folder: () => ipcRenderer.invoke('kettle:pick-folder'),
  },
});
