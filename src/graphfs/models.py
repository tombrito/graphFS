from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional


@dataclass(slots=True)
class NodeInfo:
    """Representa um arquivo ou diretório com metadados relevantes."""

    path: Path
    score: float
    kind: str
    modified_at: float
    size: int = 0
    children: List["NodeInfo"] = field(default_factory=list)

    def label(self) -> str:
        return self.path.name or str(self.path)


@dataclass(slots=True)
class DirectoryView:
    """Coleção de nós priorizados e listagens completas."""

    root: Path
    top_files: List[NodeInfo]
    top_dirs: List[NodeInfo]
    all_entries: List[NodeInfo]

    def as_dict(self) -> dict:
        return {
            "root": str(self.root),
            "top_files": [node.label() for node in self.top_files],
            "top_dirs": [node.label() for node in self.top_dirs],
            "all_entries": [node.label() for node in self.all_entries],
        }
