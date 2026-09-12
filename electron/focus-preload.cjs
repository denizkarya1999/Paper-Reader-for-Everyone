const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusCat', {
  action: action => ipcRenderer.send('cat:action', action),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('cat:state', listener); return () => ipcRenderer.removeListener('cat:state', listener); },
  ready: () => ipcRenderer.send('cat:ready'),
});
