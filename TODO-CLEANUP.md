# GraphFS - Cleanup e Refactoring Pendentes

## Bugs / Código Sem Efeito

### 1. Evento `file-deleted` não funciona
- **Arquivo:** `main.js:390`
- **Problema:** `win?.webContents.send('file-deleted', filePath)` envia evento mas ninguém escuta
- **Impacto:** Quando usuário exclui arquivo pelo menu "Excluir", o nó permanece no grafo
- **Solução:** Adicionar listener no preload.js e handler no renderer para remover o nó

---

## Dead Code (Código Sobrando)

### 2. API `showContextMenu` não usada
- **Arquivo:** `preload.js:46`
- **Problema:** `showContextMenu` exposto mas nunca chamado no renderer
- **Contexto:** Substituído por `showQuickMenu` (menu híbrido)
- **Solução:** Remover a linha

### 3. Handler `shell:show-context-menu` não usado
- **Arquivo:** `main.js:429-455`
- **Problema:** Handler IPC nunca chamado (showQuickMenu usa `sendContextMenuCommand` diretamente)
- **Solução:** Remover o handler (~26 linhas)

---

## Refactoring

### 4. Console.log excessivos (~50+)
- **Arquivos:** Vários (main.js, renderer.js, search-engines/*.js)
- **Sugestão:** Criar flag DEBUG ou remover logs não críticos
- **Prioridade:** Média

---

## Futuro (Baixa Prioridade)

### 5. Suporte Linux/macOS
- **Arquivo:** `search-engines/search-engine-manager.js:27-28`
- **TODOs:**
  - Linux: mlocate, plocate
  - macOS: mdfind (Spotlight)
