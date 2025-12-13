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

export function layoutNodesRadial(tree, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const root = nodeMap.get(tree.path);
  root.x = 0;
  root.y = 0;

  function positionChildren(parentNode, treeNode, startAngle, endAngle, radius) {
    if (!treeNode.children || treeNode.children.length === 0) return;

    const children = treeNode.children;
    const angleSpan = endAngle - startAngle;
    const angleStep = angleSpan / children.length;

    children.forEach((childTree, index) => {
      const childNode = nodeMap.get(childTree.path);
      const angle = startAngle + angleStep * (index + 0.5);

      childNode.x = parentNode.x + Math.cos(angle) * radius;
      childNode.y = parentNode.y + Math.sin(angle) * radius;
      childNode.angle = angle;

      const descendantCount = countDescendants(childTree);
      const nextRadius = Math.max(80, Math.min(200, 60 + descendantCount * 8));

      const childAngleSpan = Math.min(angleStep * 0.9, Math.PI * 0.8);
      const childStartAngle = angle - childAngleSpan / 2;
      const childEndAngle = angle + childAngleSpan / 2;

      positionChildren(childNode, childTree, childStartAngle, childEndAngle, nextRadius);
    });
  }

  const initialRadius = 150;
  positionChildren(root, tree, 0, Math.PI * 2, initialRadius);
}

export function countDescendants(node) {
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
