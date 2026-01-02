const { app, BrowserWindow, ipcMain, shell, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const readline = require('readline');
const { searchEngineManager } = require('./search-engines');

// Path to context menu executable (Windows only)
const CONTEXT_MENU_EXE = path.join(__dirname, 'bin', 'context-menu.exe');

// Persistent context menu process
let contextMenuProcess = null;
let contextMenuReady = false;
let waitingQueue = [];   // Requests waiting for server to be ready
let pendingQueue = [];   // Requests sent, waiting for response

/**
 * Start the persistent context menu server process
 */
function startContextMenuServer() {
  if (process.platform !== 'win32') return;
  if (contextMenuProcess) return;  // Already running
  if (!fs.existsSync(CONTEXT_MENU_EXE)) {
    console.warn('[ContextMenu] Executable not found:', CONTEXT_MENU_EXE);
    return;
  }

  contextMenuProcess = spawn(CONTEXT_MENU_EXE, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: false
  });

  // Read responses line by line
  const rl = readline.createInterface({ input: contextMenuProcess.stdout });

  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);

      if (response.ready) {
        contextMenuReady = true;
        console.log('[ContextMenu] Server ready');
        // Process any waiting requests
        while (waitingQueue.length > 0) {
          const req = waitingQueue.shift();
          pendingQueue.push(req);
          contextMenuProcess.stdin.write(req.command + '\n');
        }
        return;
      }

      if (response.pong) {
        return;
      }

      // Handle result/error responses
      if (pendingQueue.length > 0) {
        const { resolve } = pendingQueue.shift();
        if (response.error) {
          resolve({ success: false, error: response.error });
        } else {
          resolve({ success: true, commandId: response.result });
        }
      }
    } catch (e) {
      console.error('[ContextMenu] Parse error:', e.message);
    }
  });

  contextMenuProcess.stderr.on('data', (data) => {
    // Ignore stderr (shell extension noise)
  });

  contextMenuProcess.on('close', (code) => {
    console.log('[ContextMenu] Server exited with code:', code);
    contextMenuProcess = null;
    contextMenuReady = false;

    // Reject any pending requests
    while (pendingQueue.length > 0) {
      const { resolve } = pendingQueue.shift();
      resolve({ success: false, error: 'Context menu server exited' });
    }
    while (waitingQueue.length > 0) {
      const { resolve } = waitingQueue.shift();
      resolve({ success: false, error: 'Context menu server exited' });
    }
  });

  contextMenuProcess.on('error', (err) => {
    console.error('[ContextMenu] Server error:', err.message);
  });
}

/**
 * Send a command to the context menu server
 */
function sendContextMenuCommand(command, resolve) {
  if (!contextMenuProcess) {
    waitingQueue.push({ command, resolve });
    startContextMenuServer();
    return;
  }

  if (!contextMenuReady) {
    waitingQueue.push({ command, resolve });
    return;
  }

  pendingQueue.push({ command, resolve });
  contextMenuProcess.stdin.write(command + '\n');
}

/**
 * Stop the context menu server
 */
function stopContextMenuServer() {
  if (contextMenuProcess) {
    contextMenuProcess.stdin.write('quit\n');
    contextMenuProcess = null;
    contextMenuReady = false;
  }
}

// Arquivo para persistir o último scan
let LAST_SCAN_FILE;

/**
 * Salva o último scan no disco
 */
function saveLastScan(scanData) {
  try {
    fs.writeFileSync(LAST_SCAN_FILE, JSON.stringify(scanData, null, 2), 'utf-8');
    console.log('[Persist] Scan salvo em:', LAST_SCAN_FILE);
    return true;
  } catch (error) {
    console.error('[Persist] Erro ao salvar scan:', error.message);
    return false;
  }
}

/**
 * Carrega o último scan do disco
 */
function loadLastScan() {
  try {
    if (fs.existsSync(LAST_SCAN_FILE)) {
      const data = fs.readFileSync(LAST_SCAN_FILE, 'utf-8');
      const scanData = JSON.parse(data);
      console.log('[Persist] Scan carregado de:', LAST_SCAN_FILE);
      return scanData;
    }
  } catch (error) {
    console.error('[Persist] Erro ao carregar scan:', error.message);
  }
  return null;
}

// Global reference to main window (needed for context menu HWND)
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  // Inicializa o caminho do arquivo de persistência (precisa esperar app.ready)
  LAST_SCAN_FILE = path.join(app.getPath('userData'), 'last-scan.json');

  // Inicia o Everything proativamente (se disponível) para estar pronto quando o usuário fizer scan
  // Isso evita o erro "Everything IPC window not found" nos primeiros cliques
  console.log('[Startup] Verificando e iniciando Everything...');
  try {
    const engine = searchEngineManager.getCurrentEngine();
    if (engine) {
      const status = await engine.isAvailable();
      if (status.available) {
        console.log('[Startup] Everything está pronto:', status.message);
      } else {
        console.warn('[Startup] Everything não disponível:', status.message);
      }
    }
  } catch (error) {
    console.error('[Startup] Erro ao iniciar Everything:', error.message);
  }

  // Start context menu server early for faster first response
  startContextMenuServer();

  // Handler para memória total de todos os processos
  ipcMain.handle('system:memory-usage', async () => {
    const metrics = await app.getAppMetrics();
    let totalMemory = 0;
    for (const proc of metrics) {
      totalMemory += proc.memory.workingSetSize;
    }
    return {
      total: totalMemory * 1024,
      processCount: metrics.length
    };
  });

  // === Handlers de persistência ===

  // Carrega o último scan salvo
  ipcMain.handle('scan:load-last', () => {
    const lastScan = loadLastScan();
    if (lastScan) {
      return { success: true, ...lastScan };
    }
    return { success: false, message: 'Nenhum scan anterior encontrado' };
  });

  // Salva o scan atual
  ipcMain.handle('scan:save', (event, scanData) => {
    const success = saveLastScan(scanData);
    return { success };
  });

  // === Novos handlers para search engines ===

  // Lista motores de busca disponíveis
  ipcMain.handle('search-engines:list', async () => {
    try {
      const engines = await searchEngineManager.listEngines();
      return { success: true, engines };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Escaneia um diretório usando o motor de busca
  ipcMain.handle('search-engines:scan', async (event, rootPath, options = {}) => {
    try {
      const result = await searchEngineManager.scan(rootPath, options);
      const scanResult = {
        success: true,
        tree: result.tree,
        rootPath: rootPath,
        stats: result.stats,
        fallbackUsed: false,
        timestamp: Date.now()
      };
      // Salva automaticamente após scan bem-sucedido
      saveLastScan(scanResult);
      return scanResult;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rootPath: rootPath
      };
    }
  });

  // Escaneia o diretório do usuário
  ipcMain.handle('search-engines:scan-user', async (event, options = {}) => {
    const userDir = os.homedir();
    try {
      const result = await searchEngineManager.scan(userDir, options);
      const scanResult = {
        success: true,
        tree: result.tree,
        rootPath: userDir,
        stats: result.stats,
        fallbackUsed: false,
        timestamp: Date.now()
      };
      // Salva automaticamente após scan bem-sucedido
      saveLastScan(scanResult);
      return scanResult;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rootPath: userDir
      };
    }
  });

  // Escaneia C:\
  ipcMain.handle('search-engines:scan-drive', async (event, drive = 'C:', options = {}) => {
    const drivePath = drive.endsWith('\\') ? drive : drive + '\\';
    try {
      const result = await searchEngineManager.scan(drivePath, options);
      const scanResult = {
        success: true,
        tree: result.tree,
        rootPath: drivePath,
        stats: result.stats,
        fallbackUsed: false,
        timestamp: Date.now()
      };
      // Salva automaticamente após scan bem-sucedido
      saveLastScan(scanResult);
      return scanResult;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        rootPath: drivePath
      };
    }
  });

  // Cancela operação em andamento
  ipcMain.handle('search-engines:cancel', () => {
    searchEngineManager.cancel();
    return { success: true };
  });

  // === Handlers para abrir arquivos/diretórios ===

  // Abre um arquivo ou diretório com o aplicativo padrão do sistema
  // Para diretórios: abre no File Explorer (Windows), Finder (macOS), ou gerenciador de arquivos (Linux)
  // Para arquivos: abre com o aplicativo associado ao tipo de arquivo
  ipcMain.handle('shell:open-path', async (event, targetPath) => {
    try {
      const result = await shell.openPath(targetPath);
      if (result) {
        // shell.openPath retorna string vazia em sucesso, ou mensagem de erro
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Mostra um arquivo/diretório no File Explorer (selecionado)
  ipcMain.handle('shell:show-item-in-folder', (event, targetPath) => {
    try {
      shell.showItemInFolder(targetPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Menu de contexto rápido (híbrido) - instantâneo com opções básicas
  ipcMain.handle('shell:show-quick-menu', async (event, filePath, isDirectory, x, y) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    const menuTemplate = [
      {
        label: 'Abrir',
        click: () => {
          shell.openPath(filePath);
        }
      },
      {
        label: 'Abrir local da pasta',
        click: () => {
          shell.showItemInFolder(filePath);
        }
      },
      { type: 'separator' },
      {
        label: 'Copiar caminho',
        click: () => {
          clipboard.writeText(filePath);
        }
      },
      {
        label: 'Copiar nome',
        click: () => {
          clipboard.writeText(path.basename(filePath));
        }
      },
      { type: 'separator' },
      {
        label: 'Excluir',
        click: async () => {
          try {
            await shell.trashItem(filePath);
            // Notify renderer that item was deleted
            win?.webContents.send('file-deleted', filePath);
          } catch (err) {
            console.error('[QuickMenu] Delete failed:', err);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Propriedades',
        click: () => {
          // Use shell context menu server to show properties
          if (process.platform === 'win32' && fs.existsSync(CONTEXT_MENU_EXE)) {
            const escapedPath = filePath.replace(/\\/g, '\\\\');
            // Send special command to open properties directly
            const command = `{"path":"${escapedPath}","x":${Math.round(x)},"y":${Math.round(y)},"verb":"properties"}`;
            sendContextMenuCommand(command, () => {});
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Menu completo do Windows...',
        click: () => {
          // Show full Windows shell context menu
          if (process.platform === 'win32' && fs.existsSync(CONTEXT_MENU_EXE)) {
            const escapedPath = filePath.replace(/\\/g, '\\\\');
            const command = `{"path":"${escapedPath}","x":${Math.round(x)},"y":${Math.round(y)}}`;
            sendContextMenuCommand(command, () => {});
          }
        }
      }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: win });  // Uses current mouse position

    return { success: true };
  });

  // Mostra o menu de contexto nativo do Windows para um arquivo/pasta (full shell menu)
  ipcMain.handle('shell:show-context-menu', async (event, filePath, x, y) => {
    // Only available on Windows
    if (process.platform !== 'win32') {
      return { success: false, error: 'Context menu only available on Windows' };
    }

    // Check if executable exists
    if (!fs.existsSync(CONTEXT_MENU_EXE)) {
      return {
        success: false,
        error: 'context-menu.exe not found. Please run: npm run build-context-menu'
      };
    }

    try {
      // Escape backslashes for JSON
      const escapedPath = filePath.replace(/\\/g, '\\\\');
      const command = `{"path":"${escapedPath}","x":${Math.round(x)},"y":${Math.round(y)}}`;

      return new Promise((resolve) => {
        sendContextMenuCommand(command, resolve);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopContextMenuServer();
});
