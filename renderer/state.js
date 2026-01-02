// Estado global centralizado da aplicação

// Configuração de filtros
export const filterConfig = {
  timePeriod: 0,       // 0 = ALL, ou milissegundos (3600000 = 1H, etc.)
  itemsPerDir: 3       // Quantidade de itens por pasta (1-10)
};

// Estado global da aplicação
export const state = {
  app: null,
  worldContainer: null,
  starsContainer: null,
  nebulaContainer: null,
  edgesContainer: null,
  particlesContainer: null,
  nodesContainer: null,
  currentZoom: 0.6,
  selectedNode: null,
  nodeGraphics: new Map(),
  edgeData: [],
  nodesData: [],
  // Dados originais (sem filtro) para re-aplicar filtros
  originalTree: null,
  originalRootPath: null,
  time: 0,
  bgAnimEnabled: true,
  lineAnimEnabled: true,
  activePathEdgeIds: new Set(), // IDs das edges no caminho do nó selecionado até a raiz
  collapsedNodes: new Map() // Map de nodeId -> { descendants: [], edges: [] } para nós colapsados
};

// Cache de lookup para evitar .find() repetitivo
export const pathCache = {
  nodesCache: null,
  nodesCacheSource: null,
  edgesCache: null,
  edgesCacheSource: null
};

/**
 * Reseta os caches de path lookup
 */
export function resetPathCaches() {
  pathCache.nodesCache = null;
  pathCache.nodesCacheSource = null;
  pathCache.edgesCache = null;
  pathCache.edgesCacheSource = null;
}

/**
 * Calcula o caminho de um nó até a raiz e retorna os IDs das edges
 */
export function getPathToRoot(node, edges, nodes) {
  // Rebuild caches if source arrays changed
  if (pathCache.nodesCacheSource !== nodes) {
    pathCache.nodesCache = new Map();
    nodes.forEach(n => pathCache.nodesCache.set(n.id, n));
    pathCache.nodesCacheSource = nodes;
  }
  if (pathCache.edgesCacheSource !== edges) {
    pathCache.edgesCache = new Map();
    edges.forEach(e => pathCache.edgesCache.set(e.target, e));
    pathCache.edgesCacheSource = edges;
  }

  const pathEdgeIds = new Set();
  let currentNode = node;

  while (currentNode && currentNode.depth > 0) {
    // Encontrar a edge que conecta este nó ao seu pai (via cache)
    const parentEdge = pathCache.edgesCache.get(currentNode.id);
    if (parentEdge) {
      // Usa edgeId pré-computado se existir, senão cria
      pathEdgeIds.add(parentEdge.edgeId || `${parentEdge.source}-${parentEdge.target}`);
      currentNode = pathCache.nodesCache.get(parentEdge.source);
    } else {
      break;
    }
  }

  return pathEdgeIds;
}
