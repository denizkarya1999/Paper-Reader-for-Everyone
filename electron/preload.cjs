const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('paperReader', {
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
