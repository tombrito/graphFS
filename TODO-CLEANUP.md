# GraphFS - Cleanup e Refactoring Pendentes

## Refactoring

### 1. Console.log excessivos (~50+)
- **Arquivos:** Vários (main.js, renderer.js, search-engines/*.js)
- **Sugestão:** Criar flag DEBUG ou remover logs não críticos

## TODOs no Código

### 2. mtime fictício no Everything engine
- **Arquivo:** `search-engines/everything-search-engine.js:203`
- **Problema:** Usa `Date.now()` ao invés da data real do arquivo

### 3. Suporte Linux/macOS
- **Arquivo:** `search-engines/search-engine-manager.js:27-28`
- **TODOs:**
  - Linux: mlocate, plocate
  - macOS: mdfind (Spotlight)
- **Prioridade:** Baixa
