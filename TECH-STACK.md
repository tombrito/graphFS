# Stack Tecnológica do GraphFS

## 1. Plataforma de Aplicação — Electron
- App desktop com tecnologias web.
- Acesso a APIs do Windows (menus nativos, abrir arquivo, abrir pasta).
- Permite usar Node.js e DOM ao mesmo tempo e integrar módulos nativos (COM).
- Alternativa leve: **Tauri**, mas mais trabalhosa para menu nativo. Electron permanece como opção principal.

## 2. Renderização — PixiJS (WebGL / Canvas)
- Usado para grafo visual, animações e destaques por recência/frequência (efeito Spotify) e clusters.
- Performance superior a DOM/SVG e mais simples que WebGPU ou ThreeJS.

## 3. Banco de Dados Local — SQLite (via Node SQLite3 ou better-sqlite3)
- Armazena frequência de acesso, última abertura, relações entre arquivos e dados de workspace.
- Persistência robusta, zero servidor e portável, com suporte a queries locais.

## 4. Backend Interno (Processo Main do Electron) — Node.js
- Acesso ao filesystem, watchers de arquivos, integração com banco de dados.
- Exposição de APIs internas ao Renderer via IPC.

## 5. Integração com Windows (Essencial)
- **COM — IContextMenu (via Node Addon em C++)** para menu nativo ao clicar com o botão direito e ações padrão do Explorer (Renomear, Propriedades, Copiar, etc.).
- APIs do Electron: `shell.openPath(path)` e `shell.showItemInFolder(path)`.

## 6. UX / UI Auxiliar — HTML + CSS
- Sidebar, top bar com seleção de workspace, painel de pasta (top N + busca interna + botão "Expandir tudo").
- Opcional: TailwindCSS para acelerar prototipagem.

## 7. Gerenciamento e Build — NPM ou PNPM
- Gerencia dependências.
- **Electron Forge** ou **Vite + Electron Builder** para empacotar/rodar/compilar o app.

## 8. Código compartilhado — JavaScript (100%)
- Backend, frontend, scoring e lógica de layout em JavaScript.
- TypeScript permanece como opção futura para maior segurança.

## 9. Bibliotecas auxiliares
- **D3-Force** (caso queira força de grafo mais refinada).
- **better-sqlite3** (driver mais rápido que sqlite3 padrão).
- **electron-store** para configs pequenas.
- **electron-context-menu** (útil para menus custom; menu nativo requer COM).

## Resumo simplificado
| Componente               | Tecnologia                           |
| ------------------------ | ------------------------------------ |
| App desktop              | **Electron**                         |
| Visual principal (grafo) | **PixiJS**                           |
| BD local                 | **SQLite**                           |
| Backend                  | **Node.js**                          |
| Menu nativo do Windows   | **C++ addon (IContextMenu via COM)** |
| UI auxiliar              | **HTML/CSS**                         |
| Build                    | **Electron Forge**                   |

Esta combinação oferece performance adequada para grafo animado, acesso completo ao Windows Explorer, desenvolvimento ágil em JavaScript, persistência robusta e caminho para multiplataforma no futuro.
