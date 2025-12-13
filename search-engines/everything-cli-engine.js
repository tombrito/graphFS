/**
 * Motor de busca usando Everything CLI (es.exe).
 * Alternativa mais simples que não requer ffi-napi.
 * Requer es.exe (Everything Command-line Interface) no PATH ou em bin/.
 *
 * Foco: retornar arquivos mais recentemente modificados para exibição no grafo.
 */
const { BaseSearchEngine } = require('./base-search-engine');
const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Diretório de logs
const LOGS_DIR = path.join(__dirname, '..', 'logs');

/**
 * Cria um arquivo de log para esta execução
 */
function createLogger() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOGS_DIR, `scan-${timestamp}.log`);
  const lines = [];

  return {
    log: (message) => {
      const line = `[${new Date().toISOString()}] ${message}`;
      lines.push(line);
      console.log(line);
    },
    save: () => {
      fs.writeFileSync(logFile, lines.join('\n'), 'utf-8');
      console.log(`[Log] Salvo em: ${logFile}`);
    },
    getPath: () => logFile
  };
}

// Caminhos comuns do Everything
const EVERYTHING_PATHS = [
  path.join(__dirname, '..', 'bin', 'Everything.exe'),
  path.join(__dirname, '..', 'bin', 'everything.exe'),
  'C:\\Program Files\\Everything\\Everything.exe',
  'C:\\Program Files (x86)\\Everything\\Everything.exe'
];

class EverythingCliEngine extends BaseSearchEngine {
  constructor() {
    super('Everything-CLI');
    this.esPath = null;
    this.currentProcess = null;
    this.everythingStarted = false;
  }

  /**
   * Encontra o executável Everything.exe
   */
  _findEverythingExe() {
    for (const p of EVERYTHING_PATHS) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Verifica se o Everything está rodando
   */
  _isEverythingRunning() {
    try {
      const result = execSync('tasklist /FI "IMAGENAME eq Everything.exe" /NH', {
        encoding: 'utf-8',
        windowsHide: true
      });
      return result.toLowerCase().includes('everything.exe');
    } catch (e) {
      return false;
    }
  }

  /**
   * Inicia o Everything em background
   */
  async _startEverything() {
    if (this._isEverythingRunning()) {
      return true;
    }

    const everythingPath = this._findEverythingExe();
    if (!everythingPath) {
      return false;
    }

    console.log('[Everything] Iniciando Everything em background...');

    return new Promise((resolve) => {
      // Inicia Everything com -startup para rodar em background (minimizado na bandeja)
      const proc = spawn(everythingPath, ['-startup'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });

      proc.unref();

      // Aguarda um pouco para o Everything iniciar e indexar
      setTimeout(() => {
        const running = this._isEverythingRunning();
        if (running) {
          console.log('[Everything] Everything iniciado com sucesso!');
          this.everythingStarted = true;
        }
        resolve(running);
      }, 2000);
    });
  }

  /**
   * Encontra o executável es.exe
   */
  _findEsExe() {
    if (this.esPath) return this.esPath;

    const possiblePaths = [
      path.join(__dirname, '..', 'bin', 'es.exe'),
      'C:\\Program Files\\Everything\\es.exe',
      'C:\\Program Files (x86)\\Everything\\es.exe',
      'es.exe' // Se estiver no PATH
    ];

    for (const p of possiblePaths) {
      try {
        if (p === 'es.exe') {
          // Tenta executar para ver se está no PATH
          execSync('es.exe -get-everything-version', { stdio: 'pipe' });
          this.esPath = p;
          return p;
        } else if (fs.existsSync(p)) {
          this.esPath = p;
          return p;
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  async isAvailable() {
    const esPath = this._findEsExe();

    if (!esPath) {
      return {
        available: false,
        message: 'es.exe (Everything CLI) não encontrado. Baixe em voidtools.com/downloads/#cli e coloque em bin/ ou no PATH do sistema.'
      };
    }

    // Primeiro, verifica se o Everything está rodando
    if (!this._isEverythingRunning()) {
      // Tenta iniciar automaticamente
      console.log('[Everything] Everything não está rodando. Tentando iniciar...');
      const started = await this._startEverything();

      if (!started) {
        const everythingPath = this._findEverythingExe();
        if (!everythingPath) {
          return {
            available: false,
            message: 'Everything não está instalado. Instale em voidtools.com e tente novamente.'
          };
        }
        return {
          available: false,
          message: 'Não foi possível iniciar o Everything automaticamente. Inicie manualmente.'
        };
      }

      // Aguarda mais um pouco para garantir que o IPC está pronto
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      // Verifica se o Everything está respondendo
      const result = execSync(`"${esPath}" -get-everything-version`, {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true
      });

      if (result.includes('Everything') || result.match(/\d+\.\d+/)) {
        return {
          available: true,
          message: `Everything CLI disponível: ${result.trim()}`
        };
      }
    } catch (error) {
      // Se ainda falhar, pode ser que o Everything precise de mais tempo
      if (error.message.includes('IPC') || error.status === 1) {
        // Tenta mais uma vez após aguardar
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const result = execSync(`"${esPath}" -get-everything-version`, {
            encoding: 'utf-8',
            timeout: 5000,
            windowsHide: true
          });

          if (result.includes('Everything') || result.match(/\d+\.\d+/)) {
            return {
              available: true,
              message: `Everything CLI disponível: ${result.trim()}`
            };
          }
        } catch (e) {
          return {
            available: false,
            message: 'Everything iniciou mas ainda não está pronto. Aguarde alguns segundos e tente novamente.'
          };
        }
      }

      return {
        available: false,
        message: `Erro ao verificar Everything: ${error.message}`
      };
    }

    return {
      available: false,
      message: 'Não foi possível verificar o status do Everything.'
    };
  }

  async scan(rootPath, options = {}) {
    const {
      maxDepth = 2,
      topFilesPerDir = 3,
      topDirsPerDir = 3,
      onProgress = null
    } = options;

    // Cria logger para esta execução
    this.logger = createLogger();
    this.logger.log(`=== Iniciando scan ===`);
    this.logger.log(`Root path: ${rootPath}`);
    this.logger.log(`Options: maxDepth=${maxDepth}, topFilesPerDir=${topFilesPerDir}, topDirsPerDir=${topDirsPerDir}`);

    const available = await this.isAvailable();
    if (!available.available) {
      this.logger.log(`ERROR: Everything não disponível - ${available.message}`);
      this.logger.save();
      throw new Error(available.message);
    }
    this.logger.log(`Everything disponível: ${available.message}`);

    const normalizedRoot = path.resolve(rootPath);
    this.logger.log(`Root normalizado: ${normalizedRoot}`);

    if (onProgress) {
      onProgress({ phase: 'scanning', message: 'Consultando Everything...' });
    }

    // Busca arquivos e pastas ordenados por data de modificação (mais recentes primeiro)
    const items = await this._queryRecentItems(normalizedRoot, topFilesPerDir, topDirsPerDir, maxDepth);

    this.logger.log(`Total de itens encontrados: ${items.length}`);

    if (onProgress) {
      onProgress({ phase: 'building-tree', total: items.length, current: 0 });
    }

    // Constrói a árvore a partir dos itens mais recentes
    const tree = this._buildTreeFromRecentItems(
      normalizedRoot,
      items,
      maxDepth,
      topFilesPerDir,
      topDirsPerDir
    );

    this.logger.log(`=== Scan concluído ===`);
    this.logger.save();

    return {
      tree,
      stats: {
        totalItems: items.length,
        engine: 'Everything-CLI'
      }
    };
  }

  /**
   * Busca os itens mais recentes no Everything para cada nível de profundidade.
   * Retorna uma lista de itens já ordenados por mtime.
   */
  async _queryRecentItems(rootPath, topFilesPerDir, topDirsPerDir, maxDepth) {
    const esPath = this._findEsExe();
    const allItems = [];

    this.logger.log(`Buscando itens em: ${rootPath}`);

    // Busca pastas diretamente sob rootPath (profundidade 1)
    this.logger.log(`Buscando pastas nível 1...`);
    const dirsLevel1 = await this._runEsQuery(esPath, rootPath, true, topDirsPerDir * 10);
    this.logger.log(`Pastas nível 1 encontradas: ${dirsLevel1.length}`);
    dirsLevel1.forEach(d => this.logger.log(`  [DIR] ${d.path} (mtime: ${new Date(d.mtime).toISOString()})`));

    this.logger.log(`Buscando arquivos nível 1...`);
    const filesLevel1 = await this._runEsQuery(esPath, rootPath, false, topFilesPerDir * 10);
    this.logger.log(`Arquivos nível 1 encontrados: ${filesLevel1.length}`);
    filesLevel1.forEach(f => this.logger.log(`  [FILE] ${f.path} (mtime: ${new Date(f.mtime).toISOString()})`));

    // Adiciona itens do nível 1
    allItems.push(...dirsLevel1);
    allItems.push(...filesLevel1);

    // Para cada diretório no nível 1, busca seus filhos (nível 2)
    if (maxDepth >= 2) {
      const topDirsLevel1 = dirsLevel1
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, topDirsPerDir);

      this.logger.log(`Top ${topDirsPerDir} pastas para expandir nível 2:`);
      topDirsLevel1.forEach(d => this.logger.log(`  -> ${d.path}`));

      for (const dir of topDirsLevel1) {
        this.logger.log(`Buscando dentro de: ${dir.path}`);

        const subDirs = await this._runEsQuery(esPath, dir.path, true, topDirsPerDir * 5);
        const subFiles = await this._runEsQuery(esPath, dir.path, false, topFilesPerDir * 5);

        this.logger.log(`  Subpastas: ${subDirs.length}, Arquivos: ${subFiles.length}`);

        allItems.push(...subDirs.map(item => ({ ...item, parentPath: dir.path })));
        allItems.push(...subFiles.map(item => ({ ...item, parentPath: dir.path })));
      }
    }

    return allItems;
  }

  /**
   * Executa uma query no Everything CLI para buscar itens diretos de um diretório
   */
  _runEsQuery(esPath, searchPath, foldersOnly, maxResults) {
    return new Promise((resolve, reject) => {
      const items = [];

      // Usa regex para filtrar apenas itens diretos (sem subpastas)
      // Formato: "path\" + qualquer coisa que NÃO contenha mais barras
      const escapedPath = searchPath.replace(/\\/g, '\\\\');
      const typeFilter = foldersOnly ? 'folder:' : 'file:';

      // Query: busca tudo que começa com o path e filtra por tipo
      // wfn: (whole filename) regex para garantir que é filho direto
      const query = `"${searchPath}\\*" ${typeFilter}`;

      const args = [
        '-r', `^${escapedPath}\\\\[^\\\\]+$`,  // regex: path\algo (sem mais barras)
        typeFilter,
        '-n', String(maxResults),
        '-sort', 'dm',
        '-sort-descending'
      ];

      if (this.logger) {
        this.logger.log(`Query: es.exe ${args.join(' ')}`);
      }

      this.currentProcess = spawn(esPath, args, {
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      this.currentProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      this.currentProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;

        if (stderr && this.logger) {
          this.logger.log(`stderr: ${stderr}`);
        }

        // Parse dos resultados
        const lines = stdout.trim().split('\n').filter(line => line.trim());

        if (this.logger) {
          this.logger.log(`Resultados brutos: ${lines.length} linhas`);
        }

        for (const line of lines) {
          const fullPath = line.trim();
          if (!fullPath) continue;

          // Verifica se é filho direto do searchPath
          const parentDir = path.dirname(fullPath);
          if (parentDir.toLowerCase() !== searchPath.toLowerCase()) {
            continue;
          }

          let mtime = Date.now();
          let size = 0;

          try {
            const stats = fs.statSync(fullPath);
            mtime = stats.mtimeMs;
            size = stats.size;
          } catch (e) {
            // Ignora itens que não conseguimos acessar
            continue;
          }

          const name = path.basename(fullPath);

          items.push({
            name,
            path: fullPath,
            type: foldersOnly ? 'directory' : 'file',
            mtime,
            size,
            parentPath: searchPath
          });
        }

        resolve(items);
      });

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        reject(error);
      });
    });
  }

  /**
   * Constrói uma árvore hierárquica a partir dos itens mais recentes.
   * Os itens já vêm ordenados por mtime do Everything.
   */
  _buildTreeFromRecentItems(rootPath, items, maxDepth, topFilesPerDir, topDirsPerDir) {
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

    // Ordena cada grupo por mtime (mais recentes primeiro)
    for (const [, group] of itemsByParent) {
      group.dirs.sort((a, b) => b.mtime - a.mtime);
      group.files.sort((a, b) => b.mtime - a.mtime);
    }

    // Função recursiva para construir a árvore
    const buildNode = (nodePath, currentDepth) => {
      const name = path.basename(nodePath) || nodePath;
      const normalizedPath = nodePath.toLowerCase();
      const children = itemsByParent.get(normalizedPath) || { dirs: [], files: [] };

      // Obtém mtime do diretório
      let nodeMtime = Date.now();
      try {
        nodeMtime = fs.statSync(nodePath).mtimeMs;
      } catch (e) {
        // Mantém Date.now()
      }

      const node = {
        name: name,
        path: nodePath,
        type: 'directory',
        mtime: nodeMtime,
        children: []
      };

      if (currentDepth >= maxDepth) {
        node.collapsed = true;
        node.hiddenDirsCount = children.dirs.length;
        node.hiddenFilesCount = children.files.length;
        node.totalFilesCount = children.files.length;
        return node;
      }

      // Top diretórios mais recentes
      const topDirs = children.dirs.slice(0, topDirsPerDir);
      const hiddenDirCount = children.dirs.length - topDirs.length;

      // Adiciona diretórios recursivamente
      for (const dir of topDirs) {
        node.children.push(buildNode(dir.path, currentDepth + 1));
      }

      // Placeholder para diretórios ocultos
      if (hiddenDirCount > 0) {
        node.children.push({
          name: `... +${hiddenDirCount} ${hiddenDirCount === 1 ? 'pasta' : 'pastas'}`,
          path: `${nodePath}/__more_dirs__`,
          type: 'more-dirs',
          hiddenCount: hiddenDirCount,
          mtime: 0
        });
      }

      // Top arquivos mais recentes
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
        node.children.push({
          name: `... +${hiddenFileCount} ${hiddenFileCount === 1 ? 'arquivo' : 'arquivos'}`,
          path: `${nodePath}/__more_files__`,
          type: 'more-files',
          hiddenCount: hiddenFileCount,
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

    return new Promise((resolve, reject) => {
      const esPath = this._findEsExe();
      const results = [];

      let searchQuery = query;
      if (searchPath) {
        searchQuery = `"${searchPath}\\" ${query}`;
      }

      const args = [
        searchQuery,
        '-n', maxResults.toString(),
        '-sort', 'date-modified',
        '-sort-descending'
      ];

      const proc = spawn(esPath, args, {
        shell: true,
        windowsHide: true
      });

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', () => {
        const lines = stdout.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
          const fullPath = line.trim();
          if (!fullPath) continue;

          let isDirectory = false;
          let mtime = Date.now();

          try {
            const stats = fs.statSync(fullPath);
            isDirectory = stats.isDirectory();
            mtime = stats.mtimeMs;
          } catch (e) {
            isDirectory = false;
          }

          results.push({
            name: path.basename(fullPath),
            path: fullPath,
            type: isDirectory ? 'directory' : 'file',
            mtime
          });
        }

        resolve(results);
      });

      proc.on('error', reject);
    });
  }

  cancel() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }
}

module.exports = { EverythingCliEngine };
