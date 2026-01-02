# GraphFS - TODO

## Urgente

- [ ] **Expand/collapse para todos os diretórios (não só os expandidos)**
  - Atualmente só funciona para nós que vieram de expansão de placeholder
  - Para nós normais, os filhos podem ter sido filtrados (limite de 3 por pasta)
  - Solução: manter referência à árvore original mesmo após filtro
  - Ou: ao colapsar, buscar filhos na árvore original, não só nos visíveis

- [ ] **Revisar estrutura de arquivos para reduzir consumo de tokens**
  - Arquivos muito grandes (renderer.js ~1100 linhas) dificultam edições com IA
  - Considerar dividir em módulos menores:
    - `renderer.js` -> separar em `state.js`, `filters.js`, `expand-collapse.js`, etc.
    - Cada arquivo idealmente < 300 linhas
  - Benefícios: menos tokens por operação, edições mais precisas, melhor manutenibilidade

---

## Bugs / Código Sem Efeito

### Evento `file-deleted` não funciona
- **Arquivo:** `main.js:390`
- **Problema:** `win?.webContents.send('file-deleted', filePath)` envia evento mas ninguém escuta
- **Impacto:** Quando usuário exclui arquivo pelo menu "Excluir", o nó permanece no grafo
- **Solução:** Adicionar listener no preload.js e handler no renderer para remover o nó

---

## Dead Code (Código Sobrando)

### API `showContextMenu` não usada
- **Arquivo:** `preload.js:46`
- **Problema:** `showContextMenu` exposto mas nunca chamado no renderer
- **Contexto:** Substituído por `showQuickMenu` (menu híbrido)
- **Solução:** Remover a linha

### Handler `shell:show-context-menu` não usado
- **Arquivo:** `main.js:430-456`
- **Problema:** Handler IPC nunca chamado (showQuickMenu usa `sendContextMenuCommand` diretamente)
- **Solução:** Remover o handler (~26 linhas)

---

## Refactoring

### Console.log excessivos (~50+)
- **Arquivos:** Vários (main.js, renderer.js, search-engines/*.js)
- **Sugestão:** Criar flag DEBUG ou remover logs não críticos
- **Prioridade:** Média

---

## Pendente (Baixa Prioridade)

- [ ] Melhorias de performance no layout force-directed
- [ ] Considerar Web Workers para cálculos pesados

### Suporte Linux/macOS
- **Arquivo:** `search-engines/search-engine-manager.js:27-28`
- **TODOs:**
  - Linux: mlocate, plocate
  - macOS: mdfind (Spotlight)

---

## Resolvidos

### mtime fictício no Everything engine
- **Arquivo:** `search-engines/everything-search-engine.js`
- **Corrigido:** Agora usa `Everything_GetResultDateModified` (DLL) e `fs.statSync` (CLI)

### Bug do filtro de tempo (mais arquivos em 1W que 1M)
- **Arquivo:** `renderer/renderer.js` - função `filterTree()`
- **Problema:** Diretórios eram ordenados pelo mtime do próprio diretório, não pelo conteúdo
- **Corrigido:** Adicionada função `getMaxDescendantMtime()` que ordena pelo mtime mais recente dos descendentes
