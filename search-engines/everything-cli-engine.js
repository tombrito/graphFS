/**
 * Motor de busca usando Everything CLI (es.exe).
 * Alternativa mais simples que não requer ffi-napi.
 * Requer es.exe (Everything Command-line Interface) no PATH ou em bin/.
 *
 * Foco: retornar arquivos mais recentemente modificados para exibição no grafo.
 */
const { BaseSearchEngine } = require('./base-search-engine');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { scanFilter } = require('./scan-filter');

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
      topFiles = 50,  // Total de arquivos mais recentes a buscar
      onProgress = null
    } = options;

    // Cria logger para esta execução
    this.logger = createLogger();
    this.logger.log(`=== Iniciando scan ===`);
    this.logger.log(`Root path: ${rootPath}`);
    this.logger.log(`Options: topFiles=${topFiles}`);

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

    // Busca os N arquivos mais recentes globalmente (sem limite de profundidade)
    const recentFiles = await this._queryTopRecentFiles(normalizedRoot, topFiles);

    this.logger.log(`Total de arquivos encontrados: ${recentFiles.length}`);

    if (onProgress) {
      onProgress({ phase: 'building-tree', total: recentFiles.length, current: 0 });
    }

    // Constrói a árvore a partir dos arquivos, criando diretórios intermediários
    const tree = this._buildTreeFromFiles(normalizedRoot, recentFiles);

    this.logger.log(`=== Scan concluído ===`);
    this.logger.save();

    return {
      tree,
      stats: {
        totalFiles: recentFiles.length,
        engine: 'Everything-CLI'
      }
    };
  }

  /**
   * Busca os N arquivos mais recentes globalmente dentro do rootPath.
   * Usa Everything para buscar sem limite de profundidade.
   */
  async _queryTopRecentFiles(rootPath, topFiles) {
    const esPath = this._findEsExe();

    // Carrega filtros do .scanignore
    scanFilter.load();
    const filterInfo = scanFilter.getInfo();
    this.logger.log(`Filtros carregados: ${filterInfo.patternCount} padrões`);

    // Obtém exclusões no formato do Everything para incluir na query
    const everythingExclusions = scanFilter.getEverythingExclusions();
    this.logger.log(`Exclusões Everything: ${everythingExclusions || '(nenhuma)'}`);

    this.logger.log(`Buscando top ${topFiles} arquivos mais recentes em: ${rootPath}`);

    // Busca arquivos dentro do rootPath, ordenados por data de modificação
    // As exclusões são aplicadas diretamente na query do Everything
    // Ainda busca um pouco mais para compensar padrões não suportados (como .*)
    const files = await this._runGlobalFileQuery(esPath, rootPath, topFiles * 2, everythingExclusions);

    const filesBeforeFilter = files.length;
    // Aplica filtro pós-query para padrões não suportados pelo Everything (como .*)
    const filteredFiles = scanFilter.filter(files);

    this.logger.log(`Arquivos encontrados: ${filesBeforeFilter}, após filtro pós-query: ${filteredFiles.length}`);

    // Pega apenas os top N após filtrar
    const topRecentFiles = filteredFiles
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, topFiles);

    topRecentFiles.forEach((f, i) => {
      this.logger.log(`  [${i + 1}] ${f.path} (mtime: ${new Date(f.mtime).toISOString()})`);
    });

    return topRecentFiles;
  }

  /**
   * Executa uma query global no Everything para buscar arquivos dentro de um path
   * (sem limite de profundidade, busca recursiva)
   * @param {string} esPath - Caminho para es.exe
   * @param {string} rootPath - Diretório raiz para buscar
   * @param {number} maxResults - Número máximo de resultados
   * @param {string} exclusions - Exclusões no formato do Everything (ex: !path:AppData !ext:log)
   */
  _runGlobalFileQuery(esPath, rootPath, maxResults, exclusions = '') {
    return new Promise((resolve, reject) => {
      const items = [];

      // Query: busca arquivos globalmente com exclusões, depois filtra por rootPath em código
      // (Filtro de path com espaços não funciona bem no Everything CLI)

      const args = [
        'file:',                      // Apenas arquivos
      ];

      // Adiciona exclusões como argumentos separados
      if (exclusions) {
        const exclusionParts = exclusions.split(' ').filter(e => e.trim());
        args.push(...exclusionParts);
      }

      // Busca mais resultados pois vamos filtrar por path depois
      args.push(
        '-n', String(maxResults * 3), // Busca mais para compensar filtro de path
        '-sort', 'dm',                // Ordena por data de modificação
        '-sort-descending'            // Mais recentes primeiro
      );

      if (this.logger) {
        this.logger.log(`Query global: es.exe ${args.join(' ')}`);
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

        const lines = stdout.trim().split('\n').filter(line => line.trim());

        if (this.logger) {
          this.logger.log(`Resultados brutos: ${lines.length} linhas`);
        }

        for (const line of lines) {
          const fullPath = line.trim();
          if (!fullPath) continue;

          // Verifica se está dentro do rootPath
          if (!fullPath.toLowerCase().startsWith(rootPath.toLowerCase())) {
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

          items.push({
            name: path.basename(fullPath),
            path: fullPath,
            type: 'file',
            mtime,
            size
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
   * Constrói uma árvore hierárquica a partir dos arquivos mais recentes.
   * Cria automaticamente os diretórios intermediários necessários.
   */
  _buildTreeFromFiles(rootPath, files) {
    // Mapa de diretórios: path -> node
    const dirNodes = new Map();

    // Obtém mtime do diretório raiz
    let rootMtime = Date.now();
    try {
      rootMtime = fs.statSync(rootPath).mtimeMs;
    } catch (e) {
      // Mantém Date.now()
    }

    // Cria o nó raiz
    const rootNode = {
      name: path.basename(rootPath) || rootPath,
      path: rootPath,
      type: 'directory',
      mtime: rootMtime,
      children: []
    };
    dirNodes.set(rootPath.toLowerCase(), rootNode);

    // Para cada arquivo, cria os diretórios intermediários necessários
    for (const file of files) {
      // Extrai o caminho relativo ao root
      const relativePath = path.relative(rootPath, file.path);
      const parts = relativePath.split(path.sep);

      // Remove o nome do arquivo (último elemento)
      const fileName = parts.pop();

      // Cria diretórios intermediários
      let currentPath = rootPath;
      let currentNode = rootNode;

      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        const normalizedPath = currentPath.toLowerCase();

        if (!dirNodes.has(normalizedPath)) {
          // Cria o nó do diretório
          let dirMtime = Date.now();
          try {
            dirMtime = fs.statSync(currentPath).mtimeMs;
          } catch (e) {
            // Mantém Date.now()
          }

          const dirNode = {
            name: part,
            path: currentPath,
            type: 'directory',
            mtime: dirMtime,
            children: []
          };

          // Adiciona como filho do diretório atual
          currentNode.children.push(dirNode);
          dirNodes.set(normalizedPath, dirNode);

          if (this.logger) {
            this.logger.log(`  Criando diretório intermediário: ${currentPath}`);
          }
        }

        currentNode = dirNodes.get(normalizedPath);
      }

      // Adiciona o arquivo como filho do último diretório
      currentNode.children.push({
        name: file.name,
        path: file.path,
        type: 'file',
        mtime: file.mtime,
        size: file.size
      });
    }

    // Ordena os filhos de cada diretório por mtime (mais recentes primeiro)
    const sortChildren = (node) => {
      if (node.children && node.children.length > 0) {
        node.children.sort((a, b) => b.mtime - a.mtime);
        for (const child of node.children) {
          if (child.type === 'directory') {
            sortChildren(child);
          }
        }
      }
    };

    sortChildren(rootNode);

    return rootNode;
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
        shell: false,
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
