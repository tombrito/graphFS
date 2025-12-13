/**
 * Gerenciador de motores de busca.
 * Permite registrar múltiplos motores e selecionar o mais adequado.
 */
const { EverythingCliEngine } = require('./everything-cli-engine');

class SearchEngineManager {
  constructor() {
    this.engines = new Map();
    this.defaultEngine = null;
    this.currentEngine = null;

    // Registra motores de busca padrão
    this._registerDefaultEngines();
  }

  /**
   * Registra os motores de busca padrão baseado no sistema operacional.
   */
  _registerDefaultEngines() {
    // Windows: Everything CLI
    if (process.platform === 'win32') {
      this.register('everything-cli', new EverythingCliEngine());
      this.defaultEngine = 'everything-cli';
    }

    // TODO: Linux - mlocate, plocate
    // TODO: macOS - mdfind (Spotlight)
  }

  /**
   * Registra um novo motor de busca.
   * @param {string} id - Identificador único
   * @param {BaseSearchEngine} engine - Instância do motor
   */
  register(id, engine) {
    this.engines.set(id, engine);
  }

  /**
   * Remove um motor de busca registrado.
   * @param {string} id - Identificador do motor
   */
  unregister(id) {
    this.engines.delete(id);
    if (this.currentEngine === id) {
      this.currentEngine = null;
    }
  }

  /**
   * Lista todos os motores de busca registrados.
   * @returns {Array<{id: string, name: string, available: boolean}>}
   */
  async listEngines() {
    const result = [];

    for (const [id, engine] of this.engines) {
      const status = await engine.isAvailable();
      result.push({
        id,
        name: engine.name,
        available: status.available,
        message: status.message
      });
    }

    return result;
  }

  /**
   * Obtém um motor de busca pelo ID.
   * @param {string} id - Identificador do motor
   * @returns {BaseSearchEngine|null}
   */
  getEngine(id) {
    return this.engines.get(id) || null;
  }

  /**
   * Define o motor de busca ativo.
   * @param {string} id - Identificador do motor
   */
  setCurrentEngine(id) {
    if (!this.engines.has(id)) {
      throw new Error(`Motor de busca '${id}' não encontrado`);
    }
    this.currentEngine = id;
  }

  /**
   * Obtém o motor de busca ativo ou o padrão.
   * @returns {BaseSearchEngine|null}
   */
  getCurrentEngine() {
    const engineId = this.currentEngine || this.defaultEngine;
    return engineId ? this.engines.get(engineId) : null;
  }

  /**
   * Detecta e retorna o primeiro motor de busca disponível.
   * @returns {Promise<{id: string, engine: BaseSearchEngine}|null>}
   */
  async detectAvailableEngine() {
    for (const [id, engine] of this.engines) {
      const status = await engine.isAvailable();
      if (status.available) {
        return { id, engine };
      }
    }
    return null;
  }

  /**
   * Escaneia um diretório usando o motor ativo.
   * @param {string} rootPath - Caminho raiz
   * @param {Object} options - Opções de escaneamento
   * @returns {Promise<{tree: Object, stats: Object}>}
   */
  async scan(rootPath, options = {}) {
    const engine = this.getCurrentEngine();

    if (!engine) {
      throw new Error('Nenhum motor de busca disponível');
    }

    const status = await engine.isAvailable();
    if (!status.available) {
      throw new Error(status.message);
    }

    return engine.scan(rootPath, options);
  }

  /**
   * Busca arquivos usando o motor ativo.
   * @param {string} query - Query de busca
   * @param {Object} options - Opções de busca
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    const engine = this.getCurrentEngine();

    if (!engine) {
      throw new Error('Nenhum motor de busca disponível');
    }

    return engine.search(query, options);
  }

  /**
   * Cancela operação em andamento.
   */
  cancel() {
    const engine = this.getCurrentEngine();
    if (engine) {
      engine.cancel();
    }
  }
}

// Singleton para uso global
const searchEngineManager = new SearchEngineManager();

module.exports = { SearchEngineManager, searchEngineManager };
