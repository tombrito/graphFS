const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('graphfs', {
  getFilesystemTree: () => ipcRenderer.invoke('fs-tree')
});
