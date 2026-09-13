const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('paperReader', {
  getUpdates: () => ipcRenderer.invoke('updates:get'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  setAutomaticUpdates: value => ipcRenderer.invoke('updates:automatic', value),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdates: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('updates:state', listener); return () => ipcRenderer.removeListener('updates:state', listener); },
  openPdf: () => ipcRenderer.invoke('reader:open'),
  savePdf: value => ipcRenderer.invoke('reader:save', value),
  saveBundle: value => ipcRenderer.invoke('reader:save-bundle', value),
  getFocus: () => ipcRenderer.invoke('reader:focus-get'),
  saveFocus: value => ipcRenderer.invoke('reader:focus-save', value),
  focusContext: id => ipcRenderer.send('reader:focus-context', id),
  focusReply: value => ipcRenderer.invoke('reader:focus-reply', value),
  onFocusReminder: callback => { const listener = (_event, token) => callback(token); ipcRenderer.on('reader:focus-reminder', listener); return () => ipcRenderer.removeListener('reader:focus-reminder', listener); },
  onFocusCancel: callback => { const listener = (_event, token) => callback(token); ipcRenderer.on('reader:focus-cancel', listener); return () => ipcRenderer.removeListener('reader:focus-cancel', listener); },
  ask: value => ipcRenderer.invoke('reader:ask', value),
  getConnection: () => ipcRenderer.invoke('reader:connection'),
  saveConnection: value => ipcRenderer.invoke('reader:connection-save', value),
  clearConnection: () => ipcRenderer.invoke('reader:connection-clear'),
  cancel: id => ipcRenderer.send('reader:cancel', id),
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
