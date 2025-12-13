const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('graphfs', {
  // API original (legado)
  getFilesystemTree: () => ipcRenderer.invoke('fs-tree'),

  // APIs de persistência
  scan: {
    // Carrega o último scan salvo
    loadLast: () => ipcRenderer.invoke('scan:load-last'),

    // Salva o scan atual
    save: (scanData) => ipcRenderer.invoke('scan:save', scanData)
  },

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
