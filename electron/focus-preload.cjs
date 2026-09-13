const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusCat', {
  action: action => ipcRenderer.send('cat:action', action),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('cat:state', listener); return () => ipcRenderer.removeListener('cat:state', listener); },
  ready: () => ipcRenderer.send('cat:ready'),
});

contextBridge.exposeInMainWorld('paperSpeech', {
  start: value => ipcRenderer.invoke('speech:start', value),
  next: id => ipcRenderer.invoke('speech:next', id),
  stop: id => ipcRenderer.invoke('speech:stop', id),
  pause: () => ipcRenderer.invoke('speech:pause'),
  phase: value => ipcRenderer.send('speech:phase', value),
  getState: () => ipcRenderer.invoke('speech:state'),
  onState: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('speech:state', listener); return () => ipcRenderer.removeListener('speech:state', listener); },
});
