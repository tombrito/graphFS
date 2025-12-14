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
    this.exclusionPatterns = [];      // Padrões originais para Everything
    this.everythingExclusions = '';   // String formatada para query do Everything
    this.loaded = false;
  }

  /**
   * Carrega padrões do arquivo .scanignore
   * @param {string} basePath - Diretório base para procurar o .scanignore
   */
  load(basePath = null) {
    this.patterns = [];
    this.regexPatterns = [];
    this.exclusionPatterns = [];
    this.everythingExclusions = '';

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
    const everythingExclusionsList = [];

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

      // Converte glob pattern para regex (para filtro pós-query)
      const regex = this._globToRegex(trimmed);
      if (regex) {
        this.regexPatterns.push(regex);
      }

      // Converte para exclusão do Everything (para filtro na query)
      const everythingExclusion = this._convertToEverythingExclusion(trimmed);
      if (everythingExclusion) {
        everythingExclusionsList.push(everythingExclusion);
        this.exclusionPatterns.push(trimmed);
      }
    }

    this.everythingExclusions = everythingExclusionsList.join(' ');

    console.log(`[ScanFilter] ${this.regexPatterns.length} padrões carregados.`);
    console.log(`[ScanFilter] ${everythingExclusionsList.length} exclusões para Everything.`);
    this.loaded = true;
  }

  /**
   * Converte um padrão do .scanignore para exclusão do Everything
   * Suporta:
   *   - Pastas simples: AppData, node_modules -> !path:AppData !path:node_modules
   *   - Extensões: *.log, *.tmp -> !ext:log !ext:tmp
   *   - Hidden (.*): tratado especialmente
   * @param {string} pattern - Padrão do .scanignore
   * @returns {string|null} - Exclusão no formato Everything ou null se não suportado
   */
  _convertToEverythingExclusion(pattern) {
    // Remove barra final para normalizar
    let p = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;

    // Padrões que começam com *. (ex: *.tmp, *.log) - usam !ext:
    if (p.startsWith('*.')) {
      const ext = p.slice(2);
      return `!ext:${ext}`;
    }

    // Padrão .* (hidden files/folders) - não suportado diretamente
    // Será tratado pelo filtro pós-query
    if (p === '.*') {
      return null;
    }

    // Padrões com wildcards complexos não são suportados
    if (p.includes('*') || p.includes('?')) {
      return null;
    }

    // Pastas/arquivos simples: AppData, node_modules, .git, etc.
    // Sintaxe do Everything: !path:nome (sem barras)
    // Padrões com espaços não funcionam bem no CLI - serão tratados pelo filtro pós-query
    if (p.includes(' ')) {
      return null;
    }
    return `!path:${p}`;
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

  /**
   * Retorna os padrões de exclusão no formato do Everything CLI.
   * Sintaxe: !path:AppData\ !path:node_modules\
   * @returns {string} - String com exclusões para adicionar à query do Everything
   */
  getEverythingExclusions() {
    if (!this.loaded) {
      this.load();
    }

    return this.everythingExclusions || '';
  }

  /**
   * Retorna os padrões originais do .scanignore (nomes simples de pastas)
   * para gerar exclusões no formato do Everything
   * @returns {string[]} - Array com nomes de pastas/arquivos a excluir
   */
  getExclusionPatterns() {
    if (!this.loaded) {
      this.load();
    }

    return this.exclusionPatterns || [];
  }
}

// Instância singleton
const scanFilter = new ScanFilter();

module.exports = { ScanFilter, scanFilter };
