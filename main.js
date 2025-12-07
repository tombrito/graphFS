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

function buildTree(targetPath) {
  const stats = fs.statSync(targetPath);
  const node = {
    name: path.basename(targetPath) || targetPath,
    path: targetPath,
    type: stats.isDirectory() ? 'directory' : 'file'
  };

  if (!stats.isDirectory()) {
    return node;
  }

  const children = fs.readdirSync(targetPath, { withFileTypes: true });
  node.children = children.map((entry) =>
    buildTree(path.join(targetPath, entry.name))
  );
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
  const root = {
    name: 'C:/tmp (demo)'.replace(/\\/g, '/'),
    path: 'C:/tmp',
    type: 'directory',
    children: []
  };

  const subfolders = [
    { name: 'logs', files: ['app.log', 'events.log'] },
    { name: 'reports', files: ['2024-summary.pdf', 'draft.docx'] },
    { name: 'scratch', files: ['notes.txt', 'ideas.md'] }
  ];

  root.children = subfolders.map(({ name, files }) => ({
    name,
    path: `C:/tmp/${name}`,
    type: 'directory',
    children: files.map((file) => ({
      name: file,
      path: `C:/tmp/${name}/${file}`,
      type: 'file'
    }))
  }));

  root.children.push({
    name: 'readme.txt',
    path: 'C:/tmp/readme.txt',
    type: 'file'
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
