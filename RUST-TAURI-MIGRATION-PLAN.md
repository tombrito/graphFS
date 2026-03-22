# Plano de Migracao para Rust + Tauri

## Objetivo

Migrar o GraphFS de `Electron + Node.js` para `Tauri + Rust`, mantendo o renderer web atual com `PixiJS`, para reduzir uso de memoria, melhorar tempo de inicializacao e preparar uma base mais adequada para integracoes nativas no Windows.

O foco nao e reescrever tudo. O foco e:

- trocar o shell desktop pesado (`Electron`) por um shell leve (`Tauri`);
- mover o backend de sistema para `Rust`;
- preservar ao maximo o renderer atual;
- fazer a migracao de forma incremental, com entregas validaveis.

## Estado Atual

Hoje o projeto esta organizado assim:

- `main.js`: processo principal do Electron, IPC, shell e bootstrap;
- `preload.js`: ponte segura para o renderer;
- `renderer/`: UI e grafo com `PixiJS`;
- `search-engines/`: integracao com `Everything`;
- `bin/context-menu.exe`: integracao nativa com menu de contexto do Windows;
- persistencia local simples em JSON (`last-scan.json`).

Pontos importantes do estado atual:

- a busca rapida ja depende de um componente nativo externo (`Everything` / `es.exe`);
- o renderer ja usa GPU via `PixiJS`, entao nao ha motivo forte para reescrever a visualizacao em outra stack;
- o maior ganho de leveza vem da troca de `Electron`, nao da troca de JavaScript no renderer;
- parte da integracao Windows ja esta em executavel nativo, o que facilita a transicao para Rust.

## Arquitetura Alvo

### Shell

- `Tauri` como app desktop principal.
- Uma janela principal carregando o frontend atual.

### Frontend

- Manter `renderer/` como app web.
- Continuar usando `PixiJS`.
- Substituir chamadas `window.graphfs.*` por um adapter compativel com `Tauri`.

### Backend

- `Rust` para comandos do app, filesystem, processos, dialogos e persistencia.
- `tauri::command` para expor APIs ao frontend.
- `serde` para serializacao.
- `tokio` apenas se houver necessidade real de tarefas async mais pesadas.

### Integracao Windows

- Fase inicial: continuar usando `es.exe` e `context-menu.exe` como sidecars/processos externos.
- Fase posterior: avaliar portar `context-menu.exe` para Rust ou manter como utilitario isolado.

## Principios da Migracao

- Nao reescrever o renderer sem necessidade.
- Migrar primeiro as bordas do sistema, depois otimizar.
- Manter o app funcional em todas as fases.
- Evitar big bang rewrite.
- Validar consumo de memoria, startup e fluidez a cada etapa.

## Automacao Segura

Objetivo: usar automacao onde a mudanca e mecanica e repetitiva, sem tentar automatizar a parte arquitetural mais sensivel.

Ferramentas recomendadas:

- `jscodeshift` para codemods AST em JavaScript;
- `ast-grep` para busca e rewrite estrutural em JS e Rust;
- `cargo fix` para ajustes automaticos na parte Rust depois que ela existir.

O que e seguro automatizar neste projeto:

- substituir acessos diretos a `window.graphfs.*` por chamadas a um adapter unico;
- reescrever imports para apontar para um modulo `renderer/platform/*`;
- gerar wrappers de API no frontend com a mesma assinatura atual;
- localizar todos os `ipcMain.handle(...)` e extrair um inventario de comandos a portar;
- localizar todos os `ipcRenderer.invoke(...)` e mapear seus nomes para comandos Tauri equivalentes;
- aplicar renames mecanicos de funcoes, arquivos e imports;
- criar checklists de cobertura entre:
  - comandos existentes no Electron;
  - comandos novos em Tauri;
  - callsites no frontend.

O que nao deve ser automatizado sem revisao manual:

- conversao de `main.js` para Rust;
- logica de lifecycle do app;
- gerenciamento de processo do `Everything`;
- cancelamento de scans em andamento;
- integracao com `context-menu.exe`;
- montagem da arvore retornada ao frontend;
- qualquer mudanca que altere contrato de dados.

Automacao recomendada por fase:

### Fase 0

- script para inventariar:
  - usos de `window.graphfs`;
  - `ipcRenderer.invoke`;
  - `ipcMain.handle`;
  - funcoes exportadas de backend.

### Fase 1

- codemod para trocar `window.graphfs.*` por `platformApi.*`;
- codemod para inserir import do adapter onde necessario;
- regra estrutural para bloquear novos usos diretos de `window.graphfs`.

### Fase 2

- scaffolding automatico de `src-tauri/`;
- geracao de arquivos-base:
  - `src-tauri/src/main.rs`;
  - `src-tauri/src/lib.rs`;
  - `src-tauri/src/commands/mod.rs`.

### Fase 3

- geracao semiautomatica de stubs Rust a partir da lista atual de canais IPC;
- tabela de mapeamento:
  - `scan:load-last` -> `scan_load_last`;
  - `scan:save` -> `scan_save`;
  - `shell:open-path` -> `open_path`;
  - `shell:show-item-in-folder` -> `show_item_in_folder`.

### Fase 4

- extracao automatica de tipos de payload e exemplos JSON de respostas reais;
- fixtures para comparar o shape da resposta JS com a resposta Rust.

Ganhos esperados com automacao:

- menos trabalho repetitivo no frontend;
- menos dependencia de LLM para rename e plumbing;
- menor risco de esquecer callsites;
- migracao mais previsivel e auditavel.

Regra pratica:

- se a mudanca puder ser descrita como "trocar este padrao por aquele padrao", automatizar;
- se a mudanca envolver semantica de runtime, processo, estado ou contrato, implementar manualmente.

## Mapeamento de Responsabilidades

### Atual

- Electron main process: janela, IPC, shell, persistencia, scan bootstrap.
- Preload: ponte de APIs.
- Renderer: UI, layout, efeitos e interacao.

### Alvo

- Tauri: janela, lifecycle, empacotamento.
- Rust: comandos de sistema, persistencia, launcher de sidecars, integracao com Windows.
- Frontend web: continua responsavel por UI, grafo e experiencia visual.

## Plano por Fases

## Fase 0: Baseline e Preparacao

Objetivo: medir o estado atual e reduzir risco antes da troca de runtime.

Entregas:

- documentar fluxo principal do app:
  - bootstrap;
  - scan automatico;
  - scan manual;
  - abrir arquivo;
  - mostrar pasta;
  - menu de contexto;
  - persistencia do ultimo scan.
- medir baseline:
  - memoria em idle;
  - memoria apos scan;
  - tempo de startup;
  - tempo de primeiro scan;
  - FPS aproximado com grafo aberto.
- definir contrato de API entre frontend e backend.

Refatoracoes recomendadas antes da migracao:

- centralizar todas as chamadas de `window.graphfs` em um unico modulo adapter no frontend;
- separar tipos de resposta comuns:
  - `success/error`;
  - `scan result`;
  - `engine status`;
- reduzir acoplamento do renderer com detalhes de `Electron`.

Resultado esperado:

- o frontend para de depender diretamente de `preload.js`;
- a troca para Tauri passa a exigir trocar apenas o adapter.

## Fase 1: Extrair um Adapter de Plataforma no Frontend

Objetivo: criar uma camada unica de acesso a backend.

Criar algo como:

- `renderer/platform/api.js`
- `renderer/platform/electron-api.js`
- `renderer/platform/index.js`

Responsabilidades do adapter:

- `getMemoryUsage`
- `scan.loadLast`
- `scan.save`
- `searchEngines.list`
- `searchEngines.scan`
- `searchEngines.scanUser`
- `searchEngines.scanDrive`
- `searchEngines.scanDev`
- `searchEngines.pickDirectory`
- `searchEngines.cancel`
- `shell.openPath`
- `shell.showItemInFolder`
- `shell.showContextMenu`
- `shell.showQuickMenu`

Resultado esperado:

- `renderer/` nao conhece mais `window.graphfs` diretamente;
- a migracao para Tauri fica localizada.

## Fase 2: Subir um Shell Tauri Minimo

Objetivo: colocar o app para abrir via Tauri, ainda sem portar tudo.

Entregas:

- inicializar projeto Tauri no root ou em subpasta dedicada;
- apontar Tauri para servir o frontend atual;
- carregar `renderer/index.html`;
- validar build e execucao no Windows.

Estrutura alvo sugerida:

```text
graphFS/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   ├── services/
│   │   └── models/
│   └── tauri.conf.json
├── renderer/
├── search-engines/        # temporario, enquanto parte ainda estiver em JS
└── ...
```

Decisao recomendada:

- manter o frontend estatico simples no inicio;
- evitar adicionar framework frontend novo durante a migracao.

## Fase 3: Portar APIs Simples do Main para Rust

Objetivo: remover primeiro as funcoes de baixo risco e alto valor.

Migrar antes:

- carregar e salvar `last-scan.json`;
- abrir arquivo com app padrao;
- mostrar item na pasta;
- abrir seletor de diretorio;
- metrica basica de memoria do app, se ainda fizer sentido.

Comandos Rust sugeridos:

- `scan_load_last`
- `scan_save`
- `open_path`
- `show_item_in_folder`
- `pick_directory`
- `get_memory_usage`

Resultado esperado:

- `main.js` deixa de ser necessario para funcoes basicas;
- o frontend ja conversa com Tauri para tarefas simples.

## Fase 4: Portar o Orquestrador de Busca para Rust

Objetivo: mover a logica de backend que hoje esta em `search-engines/` para Rust, mantendo `Everything` como dependencia externa.

Estrutura sugerida em Rust:

- `commands/search.rs`
- `services/search_engine_manager.rs`
- `services/everything_cli.rs`
- `models/scan_result.rs`
- `models/tree.rs`

Passos:

1. Reproduzir o contrato atual de `scan`.
2. Chamar `es.exe` a partir de Rust.
3. Portar filtros e parse de resultados.
4. Reproduzir montagem da arvore retornada ao frontend.
5. Implementar cancelamento de processo em andamento.

Decisao importante:

- nao tentar trocar `Everything` nesta fase;
- apenas mover a orquestracao de `Node.js` para `Rust`.

Beneficio:

- menos processos pesados;
- menos IPC entre Chromium e Node;
- melhor controle de memoria e processo.

## Fase 5: Integracao com Menu de Contexto

Objetivo: manter a funcionalidade nativa do Windows sem travar a migracao.

Estrategia recomendada:

- curto prazo: continuar chamando `bin/context-menu.exe` a partir de Rust;
- medio prazo: decidir entre:
  - manter o binario C++ isolado;
  - portar para Rust com crates Windows;
  - encapsular como sidecar oficial do app.

Decisao pragmatica:

- nao portar essa parte para Rust no primeiro ciclo;
- primeiro garantir que Tauri + scan + shell estejam estaveis.

## Fase 6: Remover Dependencia de Electron

Objetivo: apagar de vez o runtime antigo.

Checklist:

- frontend sem uso de `preload.js`;
- todas as chamadas principais atendidas por Tauri;
- sem dependencia de `main.js`;
- scripts `npm start` e empacotamento ajustados;
- `electron` removido de dependencias.

Arquivos a aposentar ao final:

- `main.js`
- `preload.js`
- scripts de build especificos de Electron

Arquivos que permanecem:

- quase todo `renderer/`
- assets visuais
- parte da logica de layout e efeitos

## Fase 7: Otimizacoes Pos-Migracao

Objetivo: capturar ganhos reais de performance depois da troca de shell.

Frentes prioritarias:

- reduzir recriacao de objetos Pixi em rerenders completos;
- trocar lookups lineares por mapas precomputados onde ainda houver;
- diminuir custo de particulas por edge em grafos grandes;
- revisar destruicao e recreacao total de cena;
- mover preprocessamentos mais pesados para Rust, se necessario.

Importante:

- so depois da migracao faz sentido medir o que ainda e gargalo real;
- nao presumir que tudo precisa sair do JS.

## Ordem Recomendada de Execucao

1. Extrair adapter de plataforma no frontend.
2. Subir Tauri abrindo o frontend atual.
3. Portar persistencia, shell e dialogos para Rust.
4. Portar scan e gerenciamento de processos para Rust.
5. Reusar `context-menu.exe` como sidecar.
6. Remover Electron.
7. Otimizar renderer com base em profiling.

## Riscos Principais

### 1. Reescrever demais cedo

Risco:

- perder tempo reescrevendo UI e renderer sem ganho material.

Mitigacao:

- manter `PixiJS` e o layout atual.

### 2. Tentar portar integracoes Windows no primeiro passo

Risco:

- travar a migracao na parte mais sensivel do projeto.

Mitigacao:

- manter sidecars existentes inicialmente.

### 3. Quebrar contrato de dados do scan

Risco:

- frontend continuar visualmente igual, mas com bugs de arvore, expand/collapse e detalhes.

Mitigacao:

- congelar schema do resultado atual antes da migracao;
- criar fixtures de respostas reais.

### 4. Medir performance por impressao

Risco:

- trocar runtime e nao saber se realmente melhorou.

Mitigacao:

- registrar baseline e comparar depois de cada marco.

## Backlog Tecnico do Primeiro Sprint

- criar `renderer/platform/` e centralizar chamadas de backend;
- definir tipos/schema do payload de scan;
- inicializar `src-tauri/`;
- abrir `renderer/index.html` pelo Tauri;
- implementar em Rust:
  - carregar ultimo scan;
  - salvar ultimo scan;
  - abrir path;
  - mostrar item na pasta;
  - escolher diretorio;
- adaptar frontend para usar o novo bridge.

## Backlog Tecnico do Segundo Sprint

- portar `Everything CLI` para Rust;
- portar cancelamento de scan;
- portar escolha de engine;
- manter logs de scan;
- validar scan automatico no bootstrap;
- validar scan de pasta do usuario, drive e pasta custom.

## Definicao de Pronto da Migracao

A migracao sera considerada pronta quando:

- o app abrir via Tauri no Windows;
- o scan principal funcionar sem Electron;
- abrir arquivo e mostrar na pasta funcionarem;
- o menu de contexto nativo continuar operacional;
- o renderer atual permanecer funcional;
- o consumo de memoria em idle cair de forma perceptivel;
- `electron` puder ser removido do projeto.

## Recomendacao Final

A migracao correta para este projeto nao e:

- reescrever tudo em Rust;
- trocar o renderer;
- mudar o motor de busca ao mesmo tempo.

A migracao correta e:

- manter o frontend visual atual;
- trocar somente a camada desktop/backend para `Tauri + Rust`;
- preservar integracoes nativas existentes como sidecars no curto prazo;
- otimizar o renderer depois, com medicao.
