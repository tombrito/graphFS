const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('graphfs', {
  // API de sistema
  getMemoryUsage: () => ipcRenderer.invoke('system:memory-usage'),

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
  },

  // APIs de shell (abrir arquivos/diretórios)
  shell: {
    // Abre um arquivo ou diretório com o aplicativo padrão do sistema
    // Diretórios: abre no File Explorer (Win), Finder (macOS), gerenciador de arquivos (Linux)
    // Arquivos: abre com o aplicativo associado
    openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),

    // Mostra o item no File Explorer (selecionado)
    showItemInFolder: (targetPath) => ipcRenderer.invoke('shell:show-item-in-folder', targetPath),

    // Mostra o menu de contexto nativo do Windows para um arquivo/pasta
    // x, y são coordenadas de tela (screenX, screenY do evento de mouse)
    showContextMenu: (filePath, x, y) => ipcRenderer.invoke('shell:show-context-menu', filePath, x, y),

    // Menu rápido híbrido - instantâneo com opções básicas + acesso ao menu completo
    showQuickMenu: (filePath, isDirectory, x, y) => ipcRenderer.invoke('shell:show-quick-menu', filePath, isDirectory, x, y)
  }
});
