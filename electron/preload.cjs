const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('paperReader', {
  openPdf: () => ipcRenderer.invoke('reader:open'),
  savePdf: value => ipcRenderer.invoke('reader:save', value),
  ask: value => ipcRenderer.invoke('reader:ask', value),
  cancel: id => ipcRenderer.send('reader:cancel', id),
});
