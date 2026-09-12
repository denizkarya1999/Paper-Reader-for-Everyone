const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('paperReader', {
  openPdf: () => ipcRenderer.invoke('reader:open'),
  savePdf: value => ipcRenderer.invoke('reader:save', value),
  ask: value => ipcRenderer.invoke('reader:ask', value),
  getConnection: () => ipcRenderer.invoke('reader:connection'),
  saveConnection: value => ipcRenderer.invoke('reader:connection-save', value),
  clearConnection: () => ipcRenderer.invoke('reader:connection-clear'),
  cancel: id => ipcRenderer.send('reader:cancel', id),
});
