// Funções de layout do grafo

export function flattenTree(node, parentId, depth, nodes, edges) {
  const current = {
    id: node.path,
    path: node.path,
    name: node.name,
    type: node.type,
    depth,
    parentId,
    childCount: node.children ? node.children.length : 0,
    hiddenFilesCount: node.hiddenFilesCount || 0,
    hiddenDirsCount: node.hiddenDirsCount || 0,
    totalFilesCount: node.totalFilesCount || 0,
    totalDirsCount: node.totalDirsCount || 0,
    collapsed: node.collapsed || false,
    mtime: node.mtime,
    size: node.size || 0
  };
  nodes.push(current);

  if (parentId) {
    edges.push({ source: parentId, target: current.id, particles: [] });
  }

  if (node.children) {
    node.children.forEach((child) => flattenTree(child, current.id, depth + 1, nodes, edges));
  }
}

/**
 * Simulação de forças simplificada (sem dependências externas).
 * Calcula posições otimizadas e congela - sem animação contínua.
 */
export function layoutNodesForce(tree, nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Configurar posições iniciais baseadas na profundidade
  const root = nodeMap.get(tree.path);
  root.x = 0;
  root.y = 0;
  root.vx = 0;
  root.vy = 0;
  root.fixed = true;

  // Posicionar inicialmente em círculos por profundidade
  const nodesByDepth = new Map();
  nodes.forEach(n => {
    n.vx = 0;
    n.vy = 0;
    if (!nodesByDepth.has(n.depth)) {
      nodesByDepth.set(n.depth, []);
    }
    nodesByDepth.get(n.depth).push(n);
  });

  nodesByDepth.forEach((depthNodes, depth) => {
    if (depth === 0) return;
    const radius = depth * 150;
    const angleStep = (2 * Math.PI) / depthNodes.length;
    depthNodes.forEach((n, i) => {
      n.x = Math.cos(angleStep * i) * radius;
      n.y = Math.sin(angleStep * i) * radius;
    });
  });

  // Parâmetros da simulação
  const REPULSION = 5000;       // Força de repulsão entre todos os nós
  const LINK_STRENGTH = 0.15;   // Força dos links
  const LINK_DISTANCE = 120;    // Distância ideal dos links
  const RADIAL_STRENGTH = 0.05; // Força radial (mantém hierarquia)
  const COLLISION_RADIUS = 50;  // Raio de colisão
  const DAMPING = 0.85;         // Amortecimento de velocidade
  const ITERATIONS = 200;       // Número de iterações

  // Executar simulação
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 1 - iter / ITERATIONS; // Decay de 1 para 0

    // 1. Força de repulsão entre todos os pares de nós
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Repulsão inversamente proporcional ao quadrado da distância
        const force = (REPULSION * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
        if (!b.fixed) { b.vx += fx; b.vy += fy; }
      }
    }

    // 2. Força dos links (atrai nós conectados)
    edges.forEach(edge => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Distância ideal baseada na profundidade
      const idealDist = LINK_DISTANCE + (target.depth || 1) * 20;
      const diff = dist - idealDist;
      const force = diff * LINK_STRENGTH * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!source.fixed) { source.vx += fx; source.vy += fy; }
      if (!target.fixed) { target.vx -= fx; target.vy -= fy; }
    });

    // 3. Força radial (mantém nós em raio proporcional à profundidade)
    nodes.forEach(n => {
      if (n.fixed || n.depth === 0) return;
      const targetRadius = n.depth * 140;
      const currentRadius = Math.sqrt(n.x * n.x + n.y * n.y) || 1;
      const diff = currentRadius - targetRadius;
      const force = diff * RADIAL_STRENGTH * alpha;
      const angle = Math.atan2(n.y, n.x);
      n.vx -= Math.cos(angle) * force;
      n.vy -= Math.sin(angle) * force;
    });

    // 4. Colisão (evita sobreposição)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = COLLISION_RADIUS * 2;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const fx = (dx / dist) * overlap * 0.5;
          const fy = (dy / dist) * overlap * 0.5;

          if (!a.fixed) { a.x -= fx; a.y -= fy; }
          if (!b.fixed) { b.x += fx; b.y += fy; }
        }
      }
    }

    // 5. Aplicar velocidades e damping
    nodes.forEach(n => {
      if (n.fixed) return;
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
    });
  }

  // Calcular ângulo do label baseado na posição final
  nodes.forEach(n => {
    if (n.depth === 0) {
      n.labelAngle = Math.PI / 2;
    } else {
      n.labelAngle = Math.atan2(n.y, n.x);
    }
    n.angle = n.labelAngle;
    // Limpar propriedades temporárias
    delete n.vx;
    delete n.vy;
    delete n.fixed;
  });
}
