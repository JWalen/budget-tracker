'use strict';
// Minimal, safe bridge for the main app window. Exposes only an update check that
// runs in the Electron main process (Chromium's network stack) — reliable even
// when the bundled backend's Node networking stalls (e.g. IPv6 to api.github.com).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('budgetDesktop', {
  isDesktop: true,
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
});
