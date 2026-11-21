const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sorterApp', {
  show: () => ipcRenderer.send('app:show'),
  setBadge: (t) => ipcRenderer.send('app:badge', String(t || '')),
  setTooltip: (t) => ipcRenderer.send('app:tooltip', String(t || '')),
  menu: (x, y) => ipcRenderer.send('app:menu', { x, y }),
  titlebar: (o) => ipcRenderer.send('app:titlebar', o),
  isApp: true
});
