# graphFS (MVP)

Ferramenta inicial para explorar o sistema de arquivos com uma visão priorizada, pensando no grafo descrito no backlog. O objetivo deste MVP é facilitar a navegação por pastas mostrando apenas os itens mais relevantes e oferecendo busca incremental.

## Instalação

1. Garanta o Python 3.11+ instalado.
2. Crie um ambiente virtual (opcional, mas recomendado):

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\\Scripts\\activate   # Windows
```

3. Instale o pacote em modo desenvolvimento:

```bash
pip install -e .
```

## Uso rápido

### Listagem priorizada

Mostra top arquivos e pastas de um diretório, com opção de expandir toda a listagem ordenada por score:

```bash
graphfs list /caminho/para/pasta --top-files 5 --top-dirs 3 --expand-all
```

Você pode fornecer um mapa de frequências (JSON com `"caminho absoluto": contagem`) para ponderar o score:

```bash
graphfs list /caminho/para/pasta --frequency-map frequencias.json
```

### Busca incremental

Busca por nome (case-insensitive) em toda a árvore a partir da raiz informada:

```bash
graphfs search /caminho/para/pasta palavra --limit 20
```

## Como funciona o score

O score de cada item combina dois fatores:
- **Recência**: arquivos mais recentes recebem pontuação maior (baseada na idade em dias).
- **Frequência**: contagem opcional lida de um JSON externo; valores maiores elevam o score via `log1p`.

## Próximos passos sugeridos
- Renderizar nós do grafo a partir das listas priorizadas.
- Integrar contadores de frequência reais (telemetria ou histórico de acesso).
- Implementar painel com busca incremental e opção de expandir tudo conforme descrito no backlog.
