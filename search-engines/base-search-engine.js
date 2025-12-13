/**
 * Interface base para motores de busca de arquivos.
 * Cada motor de busca (Everything, mlocate, etc.) deve implementar esta interface.
 */
class BaseSearchEngine {
  constructor(name) {
    if (new.target === BaseSearchEngine) {
      throw new Error('BaseSearchEngine é uma classe abstrata e não pode ser instanciada diretamente');
    }
    this.name = name;
  }

  /**
   * Verifica se o motor de busca está disponível no sistema.
   * @returns {Promise<{available: boolean, message: string}>}
   */
  async isAvailable() {
    throw new Error('Método isAvailable() deve ser implementado');
  }

  /**
   * Escaneia um diretório e retorna a árvore de arquivos.
   * @param {string} rootPath - Caminho raiz para escanear
   * @param {Object} options - Opções de escaneamento
   * @param {number} options.maxDepth - Profundidade máxima (default: 2)
   * @param {number} options.topFilesPerDir - Máx arquivos por diretório (default: 3)
   * @param {number} options.topDirsPerDir - Máx pastas por diretório (default: 3)
   * @param {function} options.onProgress - Callback de progresso (opcional)
   * @returns {Promise<{tree: Object, stats: Object}>}
   */
  async scan(rootPath, options = {}) {
    throw new Error('Método scan() deve ser implementado');
  }

  /**
   * Busca arquivos por nome/pattern.
   * @param {string} query - Query de busca
   * @param {Object} options - Opções de busca
   * @param {string} options.path - Limitar busca a um caminho específico
   * @param {number} options.maxResults - Número máximo de resultados
   * @returns {Promise<Array<{path: string, name: string, type: string, mtime: number}>>}
   */
  async search(query, options = {}) {
    throw new Error('Método search() deve ser implementado');
  }

  /**
   * Cancela uma operação em andamento.
   */
  cancel() {
    // Implementação opcional - pode ser sobrescrita
  }
}

module.exports = { BaseSearchEngine };
