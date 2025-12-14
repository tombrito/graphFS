const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { searchEngineManager } = require('./search-engines');

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

const ROOT_PATH = process.env.GRAPHFS_ROOT || 'C:\\tmp';

function createWindow() {
  const mainWindow = new BrowserWindow({
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

const TOP_FILES_PER_DIR = 3;
const TOP_DIRS_PER_DIR = 3;
const MAX_DEPTH = 2; // 3 níveis de diretórios (root + 2 níveis de subdiretórios)

function buildTree(targetPath, currentDepth = 0) {
  const stats = fs.statSync(targetPath);
  const isDirectory = stats.isDirectory();
  const node = {
    name: path.basename(targetPath) || targetPath,
    path: targetPath,
    type: isDirectory ? 'directory' : 'file',
    mtime: stats.mtimeMs
  };

  if (!isDirectory) {
    return node;
  }

  // Se passou do limite de profundidade, não expandir filhos
  if (currentDepth >= MAX_DEPTH) {
    const children = fs.readdirSync(targetPath, { withFileTypes: true });
    const dirCount = children.filter(e => e.isDirectory()).length;
    const fileCount = children.filter(e => !e.isDirectory()).length;

    node.children = [];
    node.hiddenDirsCount = dirCount;
    node.hiddenFilesCount = fileCount;
    node.totalFilesCount = fileCount;
    node.collapsed = true;
    return node;
  }

  const children = fs.readdirSync(targetPath, { withFileTypes: true });
  const allChildren = children.map((entry) =>
    buildTree(path.join(targetPath, entry.name), currentDepth + 1)
  );

  // Separar diretórios e arquivos
  const directories = allChildren.filter(c => c.type === 'directory');
  const files = allChildren.filter(c => c.type === 'file');

  // Ordenar diretórios por data de modificação (mais recentes primeiro)
  directories.sort((a, b) => b.mtime - a.mtime);

  // Ordenar arquivos por data de modificação (mais recentes primeiro)
  files.sort((a, b) => b.mtime - a.mtime);

  // Pegar apenas os top N diretórios e arquivos mais recentes
  const topDirs = directories.slice(0, TOP_DIRS_PER_DIR);
  const topFiles = files.slice(0, TOP_FILES_PER_DIR);

  const hiddenDirCount = directories.length - topDirs.length;
  const hiddenFileCount = files.length - topFiles.length;

  // Combinar: top diretórios + top arquivos
  node.children = [...topDirs];

  // Adicionar nó "..." para diretórios ocultos
  if (hiddenDirCount > 0) {
    node.children.push({
      name: `... +${hiddenDirCount} ${hiddenDirCount === 1 ? 'pasta' : 'pastas'}`,
      path: `${targetPath}/__more_dirs__`,
      type: 'more-dirs',
      hiddenCount: hiddenDirCount,
      mtime: 0
    });
  }

  node.children.push(...topFiles);

  // Adicionar nó "..." para arquivos ocultos
  if (hiddenFileCount > 0) {
    node.children.push({
      name: `... +${hiddenFileCount} ${hiddenFileCount === 1 ? 'arquivo' : 'arquivos'}`,
      path: `${targetPath}/__more_files__`,
      type: 'more-files',
      hiddenCount: hiddenFileCount,
      mtime: 0
    });
  }

  node.hiddenDirsCount = hiddenDirCount;
  node.hiddenFilesCount = hiddenFileCount;
  node.totalFilesCount = files.length;

  return node;
}

function tryBuildRoot() {
  if (fs.existsSync(ROOT_PATH)) {
    try {
      const tree = buildTree(ROOT_PATH);
      return { tree, rootPath: ROOT_PATH, fallbackUsed: false };
    } catch (error) {
      return {
        tree: buildFallbackTree(),
        rootPath: ROOT_PATH,
        fallbackUsed: true,
        error: error.message
      };
    }
  }

  return {
    tree: buildFallbackTree(),
    rootPath: ROOT_PATH,
    fallbackUsed: true,
    error: 'Diretório de origem não encontrado.'
  };
}

function buildFallbackTree() {
  const now = Date.now();
  const root = {
    name: 'C:/tmp (demo)'.replace(/\\/g, '/'),
    path: 'C:/tmp',
    type: 'directory',
    mtime: now,
    hiddenFilesCount: 0,
    totalFilesCount: 1,
    children: []
  };

  const subfolders = [
    { name: 'logs', files: ['app.log', 'events.log', 'debug.log', 'error.log', 'access.log'] },
    { name: 'reports', files: ['2024-summary.pdf', 'draft.docx', 'notes.txt', 'backup.zip'] },
    { name: 'scratch', files: ['notes.txt', 'ideas.md'] }
  ];

  root.children = subfolders.map(({ name, files }, folderIndex) => {
    const allFiles = files.map((file, fileIndex) => ({
      name: file,
      path: `C:/tmp/${name}/${file}`,
      type: 'file',
      mtime: now - (fileIndex * 3600000) // Simular datas diferentes
    }));

    // Aplicar mesma lógica: top 3 arquivos
    const topFiles = allFiles.slice(0, TOP_FILES_PER_DIR);

    return {
      name,
      path: `C:/tmp/${name}`,
      type: 'directory',
      mtime: now - (folderIndex * 86400000),
      children: topFiles,
      hiddenFilesCount: allFiles.length - topFiles.length,
      totalFilesCount: allFiles.length
    };
  });

  root.children.push({
    name: 'readme.txt',
    path: 'C:/tmp/readme.txt',
    type: 'file',
    mtime: now
  });

  return root;
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

  // Handler original para árvore do filesystem (legado)
  ipcMain.handle('fs-tree', () => tryBuildRoot());

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
