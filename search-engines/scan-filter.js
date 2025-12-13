/**
 * Filtro de scan baseado em padrões tipo .gitignore
 * Suporta:
 *   - Glob patterns: *.tmp, node_modules, .git
 *   - Directory patterns: .git/, node_modules/
 *   - Hidden files (dot prefix): .*
 *   - Regex patterns: regex:^\..*
 */
const fs = require('fs');
const path = require('path');

const SCANIGNORE_FILE = '.scanignore';

class ScanFilter {
  constructor() {
    this.patterns = [];
    this.regexPatterns = [];
    this.loaded = false;
  }

  /**
   * Carrega padrões do arquivo .scanignore
   * @param {string} basePath - Diretório base para procurar o .scanignore
   */
  load(basePath = null) {
    this.patterns = [];
    this.regexPatterns = [];

    // Procura .scanignore no diretório do projeto
    const possiblePaths = [
      basePath ? path.join(basePath, SCANIGNORE_FILE) : null,
      path.join(__dirname, '..', SCANIGNORE_FILE),
      path.join(process.cwd(), SCANIGNORE_FILE)
    ].filter(Boolean);

    let filePath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      console.log('[ScanFilter] Arquivo .scanignore não encontrado. Nenhum filtro aplicado.');
      this.loaded = true;
      return;
    }

    console.log(`[ScanFilter] Carregando filtros de: ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Ignora linhas vazias e comentários
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Padrão regex explícito
      if (trimmed.startsWith('regex:')) {
        const regexStr = trimmed.slice(6);
        try {
          this.regexPatterns.push(new RegExp(regexStr, 'i'));
        } catch (e) {
          console.warn(`[ScanFilter] Regex inválido ignorado: ${regexStr}`);
        }
        continue;
      }

      // Converte glob pattern para regex
      const regex = this._globToRegex(trimmed);
      if (regex) {
        this.regexPatterns.push(regex);
      }
    }

    console.log(`[ScanFilter] ${this.regexPatterns.length} padrões carregados.`);
    this.loaded = true;
  }

  /**
   * Converte um padrão glob para regex
   * @param {string} glob - Padrão glob
   * @returns {RegExp|null}
   */
  _globToRegex(glob) {
    try {
      let pattern = glob;

      // Remove barra final para normalizar
      const isDir = pattern.endsWith('/');
      if (isDir) {
        pattern = pattern.slice(0, -1);
      }

      // Escapa caracteres especiais de regex, exceto * e ?
      pattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      // Se é um padrão simples sem path separators, match em qualquer lugar
      if (!glob.includes('/') && !glob.includes('\\')) {
        // Match no nome do arquivo/pasta em qualquer nível
        pattern = `(^|[\\\\/])${pattern}$`;
      } else {
        pattern = `^${pattern}$`;
      }

      return new RegExp(pattern, 'i');
    } catch (e) {
      console.warn(`[ScanFilter] Erro ao converter glob: ${glob}`, e);
      return null;
    }
  }

  /**
   * Verifica se um caminho deve ser ignorado
   * @param {string} filePath - Caminho completo do arquivo/pasta
   * @param {string} name - Nome do arquivo/pasta (sem path)
   * @returns {boolean} - true se deve ser ignorado
   */
  shouldIgnore(filePath, name = null) {
    if (!this.loaded) {
      this.load();
    }

    if (this.regexPatterns.length === 0) {
      return false;
    }

    const itemName = name || path.basename(filePath);
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const regex of this.regexPatterns) {
      // Testa contra o nome e contra o path completo
      if (regex.test(itemName) || regex.test(normalizedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Filtra uma lista de itens, removendo os que devem ser ignorados
   * @param {Array} items - Lista de itens com propriedade 'path' e 'name'
   * @returns {Array} - Lista filtrada
   */
  filter(items) {
    if (!this.loaded) {
      this.load();
    }

    if (this.regexPatterns.length === 0) {
      return items;
    }

    return items.filter(item => !this.shouldIgnore(item.path, item.name));
  }

  /**
   * Retorna informações sobre os padrões carregados
   */
  getInfo() {
    return {
      loaded: this.loaded,
      patternCount: this.regexPatterns.length,
      patterns: this.regexPatterns.map(r => r.source)
    };
  }
}

// Instância singleton
const scanFilter = new ScanFilter();

module.exports = { ScanFilter, scanFilter };
