const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    loadData: () => ipcRenderer.invoke('db:load'),
    saveData: (data) => ipcRenderer.invoke('db:save', data),
    printToPDF: (filenamePrefix, options) => ipcRenderer.invoke('print-to-pdf', filenamePrefix, options),
    getMac: () => ipcRenderer.invoke('get-mac')
});
