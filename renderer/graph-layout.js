// Funções de layout do grafo

export function flattenTree(node, parentId, depth, nodes, edges) {
  const current = {
    id: node.path,
    name: node.name,
    type: node.type,
    depth,
    parentId,
    childCount: node.children ? node.children.length : 0,
    hiddenFilesCount: node.hiddenFilesCount || 0,
    hiddenDirsCount: node.hiddenDirsCount || 0,
    totalFilesCount: node.totalFilesCount || 0,
    collapsed: node.collapsed || false,
    mtime: node.mtime
  };
  nodes.push(current);

  if (parentId) {
    edges.push({ source: parentId, target: current.id, particles: [] });
  }

  if (node.children) {
    node.children.forEach((child) => flattenTree(child, current.id, depth + 1, nodes, edges));
  }
}

// Constantes para espaçamento mínimo entre nós
const MIN_NODE_SPACING = 80; // Espaçamento mínimo entre centros de nós
const MIN_ARC_LENGTH = 60;   // Comprimento mínimo do arco entre nós adjacentes

export function layoutNodesRadial(tree, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const root = nodeMap.get(tree.path);
  root.x = 0;
  root.y = 0;
  root.labelAngle = Math.PI / 2; // Label para baixo

  function positionChildren(parentNode, treeNode, startAngle, endAngle, baseRadius) {
    if (!treeNode.children || treeNode.children.length === 0) return;

    const children = treeNode.children;
    const childCount = children.length;

    // Calcular o raio necessário para manter espaçamento mínimo
    // Comprimento do arco = raio * ângulo
    // Para n nós em um arco, precisamos de (n) espaços de MIN_ARC_LENGTH
    const angleSpan = endAngle - startAngle;
    const requiredArcLength = childCount * MIN_ARC_LENGTH;
    const requiredRadius = requiredArcLength / angleSpan;

    // Usar o maior entre o raio base e o raio necessário
    const radius = Math.max(baseRadius, requiredRadius);

    const angleStep = angleSpan / childCount;

    children.forEach((childTree, index) => {
      const childNode = nodeMap.get(childTree.path);
      const angle = startAngle + angleStep * (index + 0.5);

      childNode.x = parentNode.x + Math.cos(angle) * radius;
      childNode.y = parentNode.y + Math.sin(angle) * radius;
      childNode.angle = angle;

      // Calcular ângulo do label baseado na posição do nó
      // Labels apontam para fora do centro do grafo
      childNode.labelAngle = angle;

      const descendantCount = countDescendants(childTree);

      // Raio do próximo nível aumenta com a quantidade de descendentes
      // e também considera a profundidade
      const depthFactor = 1 + (childNode.depth || 0) * 0.1;
      const nextBaseRadius = Math.max(100, Math.min(250, 80 + descendantCount * 12)) * depthFactor;

      // Limitar o span angular dos filhos para evitar sobreposição
      // Quanto mais filhos, menor o span individual
      const maxChildSpan = Math.min(angleStep * 0.85, Math.PI * 0.6);
      const childAngleSpan = maxChildSpan;
      const childStartAngle = angle - childAngleSpan / 2;
      const childEndAngle = angle + childAngleSpan / 2;

      positionChildren(childNode, childTree, childStartAngle, childEndAngle, nextBaseRadius);
    });
  }

  const initialRadius = 180;
  positionChildren(root, tree, 0, Math.PI * 2, initialRadius);
}

export function countDescendants(node) {
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
