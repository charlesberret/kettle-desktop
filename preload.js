// Mirror pywebview's API surface so the existing frontend (static/index.html) keeps
// calling `window.pywebview.api.pick_folder()` with zero changes. When we eventually
// retire pywebview entirely, the frontend can migrate to a cleaner `window.setsweep.*`
// — but this shim buys a zero-touch transition.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pywebview', {
  api: {
    pick_folder: () => ipcRenderer.invoke('setsweep:pick-folder'),
  },
});
