const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('graphfs', {
  // API original
  getFilesystemTree: () => ipcRenderer.invoke('fs-tree'),

  // APIs de search engines
  searchEngines: {
    // Lista motores de busca disponíveis
    list: () => ipcRenderer.invoke('search-engines:list'),

    // Escaneia um diretório específico
    scan: (rootPath, options) => ipcRenderer.invoke('search-engines:scan', rootPath, options),

    // Escaneia o diretório do usuário (HOME)
    scanUser: (options) => ipcRenderer.invoke('search-engines:scan-user', options),

    // Escaneia um drive (default: C:)
    scanDrive: (drive, options) => ipcRenderer.invoke('search-engines:scan-drive', drive, options),

    // Cancela operação em andamento
    cancel: () => ipcRenderer.invoke('search-engines:cancel')
  }
});
