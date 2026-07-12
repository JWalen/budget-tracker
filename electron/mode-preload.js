'use strict';
// Minimal, safe bridge for the first-run setup window. Exposes only what the
// chooser needs: read this machine's LAN addresses (to suggest a client URL and
// to show the server address), and submit the chosen mode back to the main
// process. No Node APIs are exposed to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  getLanAddresses: () => ipcRenderer.invoke('setup:lan'),
  getCurrent: () => ipcRenderer.invoke('setup:current'),
  // Probe a candidate server URL so the client can validate before committing.
  probe: (url) => ipcRenderer.invoke('setup:probe', url),
  choose: (choice) => ipcRenderer.invoke('setup:choose', choice),
});
