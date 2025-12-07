from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from .models import DirectoryView, NodeInfo


def _score_entry(path: Path, frequency_map: Dict[Path, int] | None) -> Tuple[float, float, int]:
    """
    Calcula uma pontuação composta por recência e frequência.

    - Recência: baseia-se na idade em dias (quanto mais recente, maior a pontuação).
    - Frequência: contador opcional por caminho completo.
    """

    stat = path.stat()
    modified_at = stat.st_mtime
    age_days = max((time.time() - modified_at) / 86_400, 0.0)
    recency_score = 1 / (1 + age_days)

    frequency_score = 0.0
    if frequency_map:
        frequency_score = frequency_map.get(path.resolve(), 0)

    score = recency_score + math.log1p(frequency_score)
    return score, modified_at, stat.st_size


def _list_dir(path: Path) -> Iterable[Path]:
    return sorted(path.iterdir(), key=lambda p: p.name.lower())


def scan_directory(
    root: Path,
    *,
    top_files: int = 5,
    top_dirs: int = 3,
    frequency_map: Dict[Path, int] | None = None,
) -> DirectoryView:
    """Varre apenas o primeiro nível de uma pasta e retorna listas priorizadas."""

    if not root.exists():
        raise FileNotFoundError(f"Pasta não encontrada: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Caminho não é uma pasta: {root}")

    file_nodes: List[NodeInfo] = []
    dir_nodes: List[NodeInfo] = []
    all_nodes: List[NodeInfo] = []

    for entry in _list_dir(root):
        score, modified_at, size = _score_entry(entry, frequency_map)
        node = NodeInfo(
            path=entry,
            score=score,
            kind="dir" if entry.is_dir() else "file",
            modified_at=modified_at,
            size=size,
        )
        all_nodes.append(node)
        if entry.is_dir():
            dir_nodes.append(node)
        else:
            file_nodes.append(node)

    file_nodes.sort(key=lambda n: n.score, reverse=True)
    dir_nodes.sort(key=lambda n: n.score, reverse=True)
    all_nodes.sort(key=lambda n: n.score, reverse=True)

    return DirectoryView(
        root=root.resolve(),
        top_files=file_nodes[:top_files],
        top_dirs=dir_nodes[:top_dirs],
        all_entries=all_nodes,
    )


def search_directory(root: Path, query: str, *, limit: int = 30) -> List[NodeInfo]:
    """Busca incremental por nome de arquivo ou pasta, retornando os melhores matches."""

    query_lower = query.lower().strip()
    if not query_lower:
        return []

    results: List[NodeInfo] = []
    for path in root.rglob("*"):
        if query_lower in path.name.lower():
            score, modified_at, size = _score_entry(path, frequency_map=None)
            results.append(
                NodeInfo(
                    path=path,
                    score=score,
                    kind="dir" if path.is_dir() else "file",
                    modified_at=modified_at,
                    size=size,
                )
            )
    results.sort(key=lambda n: n.score, reverse=True)
    return results[:limit]
