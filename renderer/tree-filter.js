// Funções de filtragem da árvore de arquivos

/**
 * Filtra a árvore baseado nos filtros atuais (tempo e quantidade)
 * Retorna uma nova árvore com os nós filtrados
 */
export function filterTree(tree, timePeriod, itemsPerDir) {
  const now = Date.now();
  const cutoffTime = timePeriod > 0 ? now - timePeriod : 0;

  // Cache para mtime máximo dos descendentes
  const maxMtimeCache = new Map();

  // Retorna o mtime mais recente entre o nó e seus descendentes
  // Usado para ordenar diretórios pelo conteúdo mais recente, não pelo mtime da pasta
  function getMaxDescendantMtime(node) {
    if (maxMtimeCache.has(node.path)) {
      return maxMtimeCache.get(node.path);
    }
    let maxMtime = node.mtime || 0;
    if (node.children) {
      for (const child of node.children) {
        const childMax = getMaxDescendantMtime(child);
        if (childMax > maxMtime) maxMtime = childMax;
      }
    }
    maxMtimeCache.set(node.path, maxMtime);
    return maxMtime;
  }

  // Verifica se um nó ou seus descendentes têm mtime recente
  function hasRecentDescendant(node, cutoff) {
    if (node.mtime >= cutoff) return true;
    if (!node.children) return false;
    return node.children.some(child => hasRecentDescendant(child, cutoff));
  }

  function cloneAndFilter(node, depth = 0) {
    // Clone o nó
    const filtered = { ...node };

    // Se não tem filhos, retorna o nó se passar no filtro de tempo
    if (!node.children || node.children.length === 0) {
      // Root sempre passa, arquivos/dirs precisam passar no filtro de tempo
      if (depth === 0 || timePeriod === 0 || node.mtime >= cutoffTime) {
        return filtered;
      }
      return null;
    }

    // Filtra os filhos recursivamente
    const filteredChildren = [];
    let hiddenDirs = 0;
    let hiddenFiles = 0;

    // Separa dirs e files
    const dirs = node.children.filter(c => c.type === 'directory');
    const files = node.children.filter(c => c.type === 'file');
    const placeholders = node.children.filter(c => c.type === 'more-dirs' || c.type === 'more-files');

    // Filtra dirs por tempo e limita quantidade
    // Ordena pelo mtime mais recente dos DESCENDENTES, não do diretório em si
    const dirsPassedTime = dirs.filter(d => timePeriod === 0 || hasRecentDescendant(d, cutoffTime));
    const validDirs = dirsPassedTime
      .sort((a, b) => getMaxDescendantMtime(b) - getMaxDescendantMtime(a))
      .slice(0, itemsPerDir);

    // Filtra files por tempo e limita quantidade
    const filesPassedTime = files.filter(f => timePeriod === 0 || f.mtime >= cutoffTime);
    const validFiles = filesPassedTime
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, itemsPerDir);

    // Processa dirs filtrados
    for (const dir of validDirs) {
      const filteredChild = cloneAndFilter(dir, depth + 1);
      if (filteredChild) {
        filteredChildren.push(filteredChild);
      }
    }

    // Adiciona files filtrados
    filteredChildren.push(...validFiles);

    // Calcula totais originais (para informação)
    const totalDirsInOriginal = dirs.length + (placeholders.find(p => p.type === 'more-dirs')?.hiddenDirsCount || 0);
    const totalFilesInOriginal = files.length + (placeholders.find(p => p.type === 'more-files')?.hiddenFilesCount || 0);

    // Função para filtrar children recursivamente pelo tempo E aplicar limite de itens
    function filterChildrenByTime(item) {
      if (!item.children || item.children.length === 0) {
        return { ...item };
      }

      // Separa dirs e files
      const dirs = item.children.filter(c => c.type === 'directory');
      const files = item.children.filter(c => c.type === 'file');

      // Filtra dirs por tempo e ordena por mtime descendente, limita a itemsPerDir
      const filteredDirs = dirs
        .filter(d => timePeriod === 0 || hasRecentDescendant(d, cutoffTime))
        .sort((a, b) => getMaxDescendantMtime(b) - getMaxDescendantMtime(a))
        .slice(0, itemsPerDir)
        .map(d => filterChildrenByTime(d)); // Aplica recursivamente

      // Filtra files por tempo e ordena por mtime descendente, limita a itemsPerDir
      const filteredFiles = files
        .filter(f => timePeriod === 0 || f.mtime >= cutoffTime)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, itemsPerDir)
        .map(f => ({ ...f }));

      return { ...item, children: [...filteredDirs, ...filteredFiles] };
    }

    // Coleta os dados dos itens ocultos (que passaram no filtro de tempo mas não estão no top N)
    // IMPORTANTE: Aplica filtro de tempo aos children também!
    const hiddenDirItems = dirsPassedTime
      .sort((a, b) => getMaxDescendantMtime(b) - getMaxDescendantMtime(a))
      .slice(itemsPerDir)
      .map(d => filterChildrenByTime(d));

    const hiddenFileItems = filesPassedTime
      .sort((a, b) => b.mtime - a.mtime)
      .slice(itemsPerDir);

    // Conta ocultos baseado nos itens que realmente passaram no filtro
    hiddenDirs = hiddenDirItems.length;
    hiddenFiles = hiddenFileItems.length;

    // Adiciona placeholders se necessário
    if (hiddenDirs > 0) {
      filteredChildren.push({
        name: `... +${hiddenDirs} pastas`,
        path: `${node.path}/__more_dirs__`,
        type: 'more-dirs',
        mtime: 0,
        hiddenDirsCount: hiddenDirs,
        totalDirsCount: totalDirsInOriginal,
        hiddenItems: hiddenDirItems
      });
    }

    if (hiddenFiles > 0) {
      filteredChildren.push({
        name: `... +${hiddenFiles} arquivos`,
        path: `${node.path}/__more_files__`,
        type: 'more-files',
        mtime: 0,
        hiddenFilesCount: hiddenFiles,
        totalFilesCount: totalFilesInOriginal,
        hiddenItems: hiddenFileItems
      });
    }

    filtered.children = filteredChildren;
    filtered.hiddenDirsCount = hiddenDirs;
    filtered.hiddenFilesCount = hiddenFiles;
    filtered.totalDirsCount = totalDirsInOriginal;
    filtered.totalFilesCount = totalFilesInOriginal;

    return filtered;
  }

  return cloneAndFilter(tree);
}
