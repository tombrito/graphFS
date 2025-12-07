from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from .scanner import scan_directory, search_directory


def _load_frequency_map(path: Path | None) -> Dict[Path, int] | None:
    if not path:
        return None
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    return {Path(key).resolve(): int(value) for key, value in data.items()}


def _format_node(node) -> str:
    timestamp = node.modified_at
    return f"{node.kind.upper():4} | score={node.score:.3f} | {node.path}"


def run_list(args: argparse.Namespace) -> None:
    root = Path(args.root)
    freq_map = _load_frequency_map(Path(args.frequency_map) if args.frequency_map else None)
    view = scan_directory(
        root,
        top_files=args.top_files,
        top_dirs=args.top_dirs,
        frequency_map=freq_map,
    )

    print(f"Raiz: {view.root}")
    print("Top arquivos:")
    for node in view.top_files:
        print(f"  - {_format_node(node)}")
    print("Top pastas:")
    for node in view.top_dirs:
        print(f"  - {_format_node(node)}")

    if args.expand_all:
        print("\nListagem completa (ordenada por score):")
        for node in view.all_entries:
            print(f"  - {_format_node(node)}")


def run_search(args: argparse.Namespace) -> None:
    root = Path(args.root)
    results = search_directory(root, args.query, limit=args.limit)
    print(f"Resultados para '{args.query}' em {root}:")
    for node in results:
        print(f"  - {_format_node(node)}")


# create parser
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Ferramenta mínima para priorizar visualização de pastas: top N arquivos, "
            "top M pastas e busca incremental"
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="Mostra pastas e arquivos priorizados")
    list_parser.add_argument("root", help="Caminho da pasta a ser analisada")
    list_parser.add_argument("--top-files", type=int, default=5, help="Quantidade de arquivos mais relevantes")
    list_parser.add_argument("--top-dirs", type=int, default=3, help="Quantidade de pastas mais relevantes")
    list_parser.add_argument(
        "--frequency-map",
        type=str,
        help="JSON opcional com contadores de acesso por caminho (chave = caminho absoluto)",
    )
    list_parser.add_argument(
        "--expand-all",
        action="store_true",
        help="Mostra listagem completa ordenada por score",
    )
    list_parser.set_defaults(func=run_list)

    search_parser = subparsers.add_parser("search", help="Busca incremental por nome")
    search_parser.add_argument("root", help="Caminho da pasta a ser analisada")
    search_parser.add_argument("query", help="Texto a ser buscado")
    search_parser.add_argument("--limit", type=int, default=30, help="Limite de resultados")
    search_parser.set_defaults(func=run_search)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
