# Backlog

## Painel de pasta com visão priorizada
- Renderizar apenas os top N arquivos e top M subpastas de cada diretório ao abrir no grafo (score por recência e frequência).
- Incluir campo de busca incremental dentro do painel para exibir resultados além do top N como lista.
- Disponibilizar botão "Expandir tudo" que abre listagem completa com scroll, sem transformar todos os itens em nós do grafo.
- Manter o grafo como subconjunto curado: top globais, top por pasta aberta e itens selecionados/pinados.

## Fluxo padrão
- Na abertura do app, mostrar os arquivos centrais (top globais) no foco inicial.
- Ao abrir uma pasta, exibir filhos relevantes, campo de busca e opção de expandir tudo via painel.
- Garantir que navegação completa por pasta seja modo de exceção, não comportamento padrão.

## Ajustes conceituais
- Substituir a ideia de "nós apagados" por "nós inexistentes até serem relevantes" no grafo.
- Documentar claramente as regras de renderização parcial e os caminhos para acesso completo (busca, lista expandida, mini-árvore).
