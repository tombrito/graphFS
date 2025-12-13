/**
 * Módulo de motores de busca para GraphFS.
 *
 * Arquitetura extensível que permite adicionar novos motores de busca
 * para diferentes sistemas operacionais.
 *
 * Motores disponíveis:
 * - Everything CLI (Windows): Usa es.exe para buscas rápidas
 *
 * Motores planejados:
 * - mlocate/plocate (Linux)
 * - mdfind/Spotlight (macOS)
 */

const { BaseSearchEngine } = require('./base-search-engine');
const { EverythingCliEngine } = require('./everything-cli-engine');
const { SearchEngineManager, searchEngineManager } = require('./search-engine-manager');
const { ScanFilter, scanFilter } = require('./scan-filter');

module.exports = {
  // Classes base
  BaseSearchEngine,

  // Implementações
  EverythingCliEngine,

  // Gerenciador
  SearchEngineManager,
  searchEngineManager, // Singleton

  // Filtros
  ScanFilter,
  scanFilter // Singleton
};
