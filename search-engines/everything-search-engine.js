/**
 * Motor de busca usando Everything (voidtools).
 * Requer Everything instalado e rodando no Windows.
 * Usa a SDK DLL do Everything para consultas rápidas.
 */
const { BaseSearchEngine } = require('./base-search-engine');
const path = require('path');
const fs = require('fs');

// Constantes da Everything SDK
const EVERYTHING_OK = 0;
const EVERYTHING_ERROR_MEMORY = 1;
const EVERYTHING_ERROR_IPC = 2;
const EVERYTHING_ERROR_REGISTERCLASSEX = 3;
const EVERYTHING_ERROR_CREATEWINDOW = 4;
const EVERYTHING_ERROR_CREATETHREAD = 5;
const EVERYTHING_ERROR_INVALIDINDEX = 6;
const EVERYTHING_ERROR_INVALIDCALL = 7;

const EVERYTHING_REQUEST_FILE_NAME = 0x00000001;
const EVERYTHING_REQUEST_PATH = 0x00000002;
const EVERYTHING_REQUEST_SIZE = 0x00000010;
const EVERYTHING_REQUEST_DATE_MODIFIED = 0x00000040;

// Constante para conversão FILETIME -> Unix timestamp
// FILETIME: 100-nanosegundos desde 1/1/1601
// Unix: milissegundos desde 1/1/1970
// Diferença: 116444736000000000 (em 100ns)
const FILETIME_EPOCH_DIFF = BigInt('116444736000000000');

class EverythingSearchEngine extends BaseSearchEngine {
  constructor() {
    super('Everything');
    this.dll = null;
    this.ref = null; // ref-napi module
    this.initialized = false;
    this.cancelled = false;
  }

  /**
   * Converte FILETIME (Windows) para Unix timestamp (ms)
   */
  _filetimeToUnix(ftBuffer) {
    try {
      const filetime = ftBuffer.readBigUInt64LE(0);
      if (filetime === BigInt(0)) return Date.now(); // Fallback se não disponível
      const unixMs = (filetime - FILETIME_EPOCH_DIFF) / BigInt(10000);
      return Number(unixMs);
    } catch {
      return Date.now();
    }
  }

  /**
   * Carrega a DLL do Everything SDK
   */
  async _loadDll() {
    if (this.dll) return true;

    try {
      // Tenta carregar ffi-napi dinamicamente
      let ffi;
      try {
        ffi = require('ffi-napi');
        this.ref = require('ref-napi');
      } catch (e) {
        console.error('ffi-napi não encontrado. Execute: npm install ffi-napi ref-napi');
        return false;
      }

      // Caminho padrão da DLL do Everything
      const dllPaths = [
        'C:\\Program Files\\Everything\\Everything64.dll',
        'C:\\Program Files (x86)\\Everything\\Everything32.dll',
        'Everything64.dll', // Se estiver no PATH
        'Everything32.dll'
      ];

      let dllPath = null;
      for (const p of dllPaths) {
        if (fs.existsSync(p)) {
          dllPath = p;
          break;
        }
      }

      // Se não encontrar a DLL instalada, usa uma cópia local se existir
      const localDll = path.join(__dirname, '..', 'bin', 'Everything64.dll');
      if (!dllPath && fs.existsSync(localDll)) {
        dllPath = localDll;
      }

      if (!dllPath) {
        console.error('DLL do Everything não encontrada');
        return false;
      }

      // Define as funções da DLL
      this.dll = ffi.Library(dllPath, {
        'Everything_SetSearchW': ['void', ['string']],
        'Everything_SetRequestFlags': ['void', ['uint32']],
        'Everything_SetSort': ['void', ['uint32']],
        'Everything_SetMax': ['void', ['uint32']],
        'Everything_QueryW': ['bool', ['bool']],
        'Everything_GetNumResults': ['uint32', []],
        'Everything_GetLastError': ['uint32', []],
        'Everything_GetResultPathW': ['string', ['uint32']],
        'Everything_GetResultFileNameW': ['string', ['uint32']],
        'Everything_IsVolumeResult': ['bool', ['uint32']],
        'Everything_IsFolderResult': ['bool', ['uint32']],
        'Everything_IsFileResult': ['bool', ['uint32']],
        'Everything_GetResultDateModified': ['bool', ['uint32', 'pointer']],
        'Everything_GetResultSize': ['bool', ['uint32', 'pointer']],
        'Everything_Reset': ['void', []],
        'Everything_CleanUp': ['void', []]
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Erro ao carregar DLL do Everything:', error);
      return false;
    }
  }

  async isAvailable() {
    // Verifica se o Everything está rodando via IPC
    try {
      const loaded = await this._loadDll();
      if (!loaded) {
        return {
          available: false,
          message: 'DLL do Everything não encontrada. Instale o Everything (voidtools.com) ou execute npm install ffi-napi ref-napi'
        };
      }

      // Tenta uma query simples para verificar se o serviço está rodando
      this.dll.Everything_SetSearchW('');
      this.dll.Everything_QueryW(true);
      const error = this.dll.Everything_GetLastError();

      if (error === EVERYTHING_ERROR_IPC) {
        return {
          available: false,
          message: 'Everything não está rodando. Inicie o Everything antes de usar esta funcionalidade.'
        };
      }

      return {
        available: true,
        message: 'Everything está disponível e pronto para uso.'
      };
    } catch (error) {
      return {
        available: false,
        message: `Erro ao verificar Everything: ${error.message}`
      };
    }
  }

  async scan(rootPath, options = {}) {
    const {
      maxDepth = 2,
      topFilesPerDir = 3,
      topDirsPerDir = 3,
      onProgress = null
    } = options;

    this.cancelled = false;

    const available = await this.isAvailable();
    if (!available.available) {
      throw new Error(available.message);
    }

    // Normaliza o caminho
    const normalizedRoot = path.resolve(rootPath).replace(/\\/g, '\\');

    // Busca todos os arquivos e pastas sob o rootPath
    const query = `"${normalizedRoot}\\"`;

    this.dll.Everything_Reset();
    this.dll.Everything_SetSearchW(query);
    this.dll.Everything_SetRequestFlags(
      EVERYTHING_REQUEST_FILE_NAME |
      EVERYTHING_REQUEST_PATH |
      EVERYTHING_REQUEST_DATE_MODIFIED
    );
    this.dll.Everything_SetMax(100000); // Limite de resultados
    this.dll.Everything_QueryW(true);

    const error = this.dll.Everything_GetLastError();
    if (error !== EVERYTHING_OK) {
      throw new Error(`Erro na busca do Everything: código ${error}`);
    }

    const numResults = this.dll.Everything_GetNumResults();

    if (onProgress) {
      onProgress({ phase: 'scanning', total: numResults, current: 0 });
    }

    // Coleta todos os resultados
    const items = [];
    const ftBuffer = Buffer.alloc(8); // Buffer reutilizável para FILETIME (8 bytes)

    for (let i = 0; i < numResults; i++) {
      if (this.cancelled) {
        throw new Error('Operação cancelada');
      }

      const itemPath = this.dll.Everything_GetResultPathW(i);
      const itemName = this.dll.Everything_GetResultFileNameW(i);
      const isFolder = this.dll.Everything_IsFolderResult(i);

      const fullPath = path.join(itemPath, itemName);

      // Calcula profundidade relativa ao root
      const relativePath = path.relative(normalizedRoot, fullPath);
      const depth = relativePath ? relativePath.split(path.sep).length : 0;

      // Extrai data de modificação real do Everything
      let mtime = Date.now();
      if (this.dll.Everything_GetResultDateModified(i, ftBuffer)) {
        mtime = this._filetimeToUnix(ftBuffer);
      }

      items.push({
        name: itemName,
        path: fullPath,
        type: isFolder ? 'directory' : 'file',
        mtime,
        depth,
        parentPath: itemPath
      });

      if (onProgress && i % 1000 === 0) {
        onProgress({ phase: 'scanning', total: numResults, current: i });
      }
    }

    if (onProgress) {
      onProgress({ phase: 'building-tree', total: items.length, current: 0 });
    }

    // Constrói a árvore a partir dos itens flat
    const tree = this._buildTreeFromItems(
      normalizedRoot,
      items,
      maxDepth,
      topFilesPerDir,
      topDirsPerDir
    );

    return {
      tree,
      stats: {
        totalItems: numResults,
        engine: 'Everything'
      }
    };
  }

  /**
   * Constrói uma árvore hierárquica a partir de uma lista flat de itens.
   */
  _buildTreeFromItems(rootPath, items, maxDepth, topFilesPerDir, topDirsPerDir) {
    // Agrupa itens por diretório pai
    const itemsByParent = new Map();

    for (const item of items) {
      const parentKey = item.parentPath.toLowerCase();
      if (!itemsByParent.has(parentKey)) {
        itemsByParent.set(parentKey, { dirs: [], files: [] });
      }
      const group = itemsByParent.get(parentKey);
      if (item.type === 'directory') {
        group.dirs.push(item);
      } else {
        group.files.push(item);
      }
    }

    // Função recursiva para construir a árvore
    const buildNode = (nodePath, currentDepth) => {
      const name = path.basename(nodePath) || nodePath;
      const normalizedPath = nodePath.toLowerCase();
      const children = itemsByParent.get(normalizedPath) || { dirs: [], files: [] };

      // Ordena por mtime (mais recentes primeiro)
      children.dirs.sort((a, b) => b.mtime - a.mtime);
      children.files.sort((a, b) => b.mtime - a.mtime);

      const node = {
        name: name,
        path: nodePath,
        type: 'directory',
        mtime: Date.now(),
        children: []
      };

      if (currentDepth >= maxDepth) {
        node.collapsed = true;
        node.hiddenDirsCount = children.dirs.length;
        node.hiddenFilesCount = children.files.length;
        node.totalFilesCount = children.files.length;
        return node;
      }

      // Top diretórios
      const topDirs = children.dirs.slice(0, topDirsPerDir);
      const hiddenDirCount = children.dirs.length - topDirs.length;

      // Adiciona diretórios recursivamente
      for (const dir of topDirs) {
        node.children.push(buildNode(dir.path, currentDepth + 1));
      }

      // Placeholder para diretórios ocultos
      if (hiddenDirCount > 0) {
        // Guarda os dados dos diretórios ocultos para expansão posterior
        const hiddenDirs = children.dirs.slice(topDirsPerDir);
        node.children.push({
          name: `... +${hiddenDirCount} ${hiddenDirCount === 1 ? 'pasta' : 'pastas'}`,
          path: `${nodePath}/__more_dirs__`,
          type: 'more-dirs',
          hiddenCount: hiddenDirCount,
          hiddenItems: hiddenDirs.map(dir => ({
            name: path.basename(dir.path),
            path: dir.path,
            type: 'directory',
            mtime: dir.mtime,
            children: [] // Será populado se necessário
          })),
          mtime: 0
        });
      }

      // Top arquivos
      const topFiles = children.files.slice(0, topFilesPerDir);
      const hiddenFileCount = children.files.length - topFiles.length;

      for (const file of topFiles) {
        node.children.push({
          name: file.name,
          path: file.path,
          type: 'file',
          mtime: file.mtime
        });
      }

      // Placeholder para arquivos ocultos
      if (hiddenFileCount > 0) {
        // Guarda os dados dos arquivos ocultos para expansão posterior
        const hiddenFiles = children.files.slice(topFilesPerDir);
        node.children.push({
          name: `... +${hiddenFileCount} ${hiddenFileCount === 1 ? 'arquivo' : 'arquivos'}`,
          path: `${nodePath}/__more_files__`,
          type: 'more-files',
          hiddenCount: hiddenFileCount,
          hiddenItems: hiddenFiles.map(file => ({
            name: file.name,
            path: file.path,
            type: 'file',
            mtime: file.mtime
          })),
          mtime: 0
        });
      }

      node.hiddenDirsCount = hiddenDirCount;
      node.hiddenFilesCount = hiddenFileCount;
      node.totalFilesCount = children.files.length;

      return node;
    };

    return buildNode(rootPath, 0);
  }

  async search(query, options = {}) {
    const { path: searchPath, maxResults = 1000 } = options;

    const available = await this.isAvailable();
    if (!available.available) {
      throw new Error(available.message);
    }

    let searchQuery = query;
    if (searchPath) {
      searchQuery = `"${searchPath}\\" ${query}`;
    }

    this.dll.Everything_Reset();
    this.dll.Everything_SetSearchW(searchQuery);
    this.dll.Everything_SetRequestFlags(
      EVERYTHING_REQUEST_FILE_NAME |
      EVERYTHING_REQUEST_PATH |
      EVERYTHING_REQUEST_DATE_MODIFIED
    );
    this.dll.Everything_SetMax(maxResults);
    this.dll.Everything_QueryW(true);

    const error = this.dll.Everything_GetLastError();
    if (error !== EVERYTHING_OK) {
      throw new Error(`Erro na busca do Everything: código ${error}`);
    }

    const numResults = this.dll.Everything_GetNumResults();
    const results = [];

    for (let i = 0; i < numResults; i++) {
      const itemPath = this.dll.Everything_GetResultPathW(i);
      const itemName = this.dll.Everything_GetResultFileNameW(i);
      const isFolder = this.dll.Everything_IsFolderResult(i);

      results.push({
        name: itemName,
        path: path.join(itemPath, itemName),
        type: isFolder ? 'directory' : 'file',
        mtime: Date.now()
      });
    }

    return results;
  }

  cancel() {
    this.cancelled = true;
  }
}

module.exports = { EverythingSearchEngine };
