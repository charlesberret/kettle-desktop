// Desktop v2 bridge. The sitting UI lives in app/ and talks to core over HTTP;
// it never loads core static/index.html.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kettle', {
  pickFolder: () => ipcRenderer.invoke('kettle:pick-folder'),
  getCoreUrl: () => ipcRenderer.invoke('kettle:get-core-url'),
});

// Legacy shim for any residual pywebview-era callers.
contextBridge.exposeInMainWorld('pywebview', {
  api: {
    pick_folder: () => ipcRenderer.invoke('kettle:pick-folder'),
  },
});
