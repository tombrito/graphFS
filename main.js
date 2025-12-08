const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT_PATH = process.env.GRAPHFS_ROOT || 'C:\\tmp';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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

app.whenReady().then(() => {
  ipcMain.handle('fs-tree', () => tryBuildRoot());
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
