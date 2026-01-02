# GraphFS - Cleanup e Refactoring Pendentes

## ~~Bugs Críticos~~ (Verificado - Falso Positivo)

### ~~1. renderDetails() com parâmetro errado~~ FALSO POSITIVO
- **Arquivo:** `renderer/nodes.js:339`
- **Análise:** O `renderDetails` passado para `createNode` é um callback wrapper que já tem o elemento DOM via closure. Está correto.

## ~~Código Morto Removido~~ ✓

### ~~2. Handler fs-tree não utilizado (legado)~~ REMOVIDO
- Handler, funções e constantes legadas removidos de main.js e preload.js

### ~~3. Chamada duplicada de startContextMenuServer()~~ REMOVIDO
- Removida chamada redundante

## Refactoring

### 4. Handlers de scan duplicados
- **Arquivo:** `renderer/renderer.js:531-602`
- **Problema:** `btnScanUser` e `btnScanDrive` têm lógica quase idêntica
- **Sugestão:** Extrair para `performScan(scanFn, label)`
- **Status:** PENDENTE

### 5. Console.log excessivos (~50+)
- **Arquivos:** Vários (main.js, renderer.js, search-engines/*.js)
- **Sugestão:** Criar flag DEBUG ou remover logs não críticos
- **Status:** PENDENTE

## TODOs no Código

### 6. mtime fictício no Everything engine
- **Arquivo:** `search-engines/everything-search-engine.js:203`
- **Problema:** Usa `Date.now()` ao invés da data real do arquivo
- **Status:** PENDENTE

### 7. Suporte Linux/macOS
- **Arquivo:** `search-engines/search-engine-manager.js:27-28`
- **TODOs:**
  - Linux: mlocate, plocate
  - macOS: mdfind (Spotlight)
- **Status:** PLANEJADO (não urgente)
