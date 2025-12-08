# GraphFS

Exploração visual de sistemas de arquivos com foco em relevância recente/frequente. Este repositório inicia a base do app desktop que usará Electron + PixiJS para renderizar o grafo e SQLite para persistir dados locais.

## Stack recomendada

A visão completa da stack tecnológica está documentada em [`TECH-STACK.md`](TECH-STACK.md). Ela cobre escolhas para aplicação desktop, renderização do grafo, banco local, backend interno e integração com Windows via COM.

## Estado atual

O código Python do MVP foi removido. O repositório agora está pronto para receber a implementação em JavaScript/Electron descrita na stack recomendada.

## Próximos passos

Consulte o [`backlog.md`](backlog.md) para priorizar o desenvolvimento das features de painel de pasta, fluxo padrão e ajustes conceituais do grafo.

## Como rodar o MVP de visualização

1. Instale dependências com `npm install` (Electron + PixiJS).
2. (Opcional) Ajuste o caminho de origem definindo `GRAPHFS_ROOT` (por padrão `C:\\tmp`).
3. Execute `npm start` para abrir a janela Electron e ver o grafo com os arquivos do diretório alvo.

Comandos correspondentes:

```bash
npm install
# Opcional, altere o diretório alvo (exemplo em Windows)
set GRAPHFS_ROOT=C:\tmp
npm start
```

A UI mostra o grafo à esquerda (nós de pastas/arquivos com linhas de hierarquia) e, à direita, detalhes do nó selecionado e uma árvore textual completa.
