// Funções de layout do grafo

import { config, getDisplayName } from './config.js';

/**
 * Calcula o peso (número de descendentes) de cada nó na árvore.
 * Usado para distribuir espaço angular proporcionalmente.
 */
function calculateSubtreeWeights(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const childrenMap = new Map();

  // Constrói mapa de filhos
  nodes.forEach(n => {
    if (n.parentId) {
      if (!childrenMap.has(n.parentId)) {
        childrenMap.set(n.parentId, []);
      }
      childrenMap.get(n.parentId).push(n);
    }
  });

  // Calcula peso recursivamente (bottom-up)
  function getWeight(nodeId) {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      return 1; // Folhas têm peso 1
    }
    let weight = 1; // Conta o próprio nó
    children.forEach(child => {
      weight += getWeight(child.id);
    });
    return weight;
  }

  // Armazena pesos em cada nó
  const weights = new Map();
  nodes.forEach(n => {
    weights.set(n.id, getWeight(n.id));
  });

  return { weights, childrenMap };
}

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
    hiddenItems: node.hiddenItems || null, // Dados dos itens ocultos para expansão
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
 * Layout hierárquico em setores.
 * Cada nó pai distribui seus filhos em um arco angular proporcional ao peso da subárvore.
 * Isso evita cruzamentos de edges dentro da mesma hierarquia.
 */
export function layoutNodesForce(tree, nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Calcula pesos das subárvores
  const { weights, childrenMap } = calculateSubtreeWeights(nodes);

  // Configurar root
  const root = nodeMap.get(tree.path);
  root.x = 0;
  root.y = 0;

  // Parâmetros do layout (de config.js)
  const { BASE_RADIUS, RADIUS_DECAY, MIN_RADIUS, MIN_ANGLE_GAP, ANGLE_PER_WEIGHT } = config.layout;

  /**
   * Posiciona recursivamente os filhos de um nó dentro de um setor angular.
   * @param {string} parentId - ID do nó pai
   * @param {number} startAngle - Ângulo inicial do setor (radianos)
   * @param {number} endAngle - Ângulo final do setor (radianos)
   * @param {number} depth - Profundidade atual
   */
  function positionChildren(parentId, startAngle, endAngle, depth) {
    const children = childrenMap.get(parentId) || [];
    if (children.length === 0) return;

    const parent = nodeMap.get(parentId);
    const availableAngle = endAngle - startAngle;

    // Calcula peso total dos filhos
    const totalWeight = children.reduce((sum, child) => sum + weights.get(child.id), 0);

    // Calcula o ângulo "ideal" baseado no peso (não precisa usar todo o espaço disponível)
    const idealAngle = totalWeight * ANGLE_PER_WEIGHT;

    // Usa o menor entre o disponível e o ideal (nunca excede o disponível)
    const usedAngle = Math.min(availableAngle, idealAngle);

    // Centraliza os filhos dentro do setor disponível
    const centerAngle = (startAngle + endAngle) / 2;
    const actualStartAngle = centerAngle - usedAngle / 2;

    // Distribui o espaço angular proporcionalmente ao peso
    let currentAngle = actualStartAngle;

    children.forEach(child => {
      const childWeight = weights.get(child.id);
      // Proporção do arco baseada no peso
      const angleShare = (childWeight / totalWeight) * usedAngle;

      // Ângulo central do filho
      const childAngle = currentAngle + angleShare / 2;

      // Calcula distância pai→filho com decaimento (diminui a cada nível)
      const radius = Math.max(BASE_RADIUS * Math.pow(RADIUS_DECAY, depth - 1), MIN_RADIUS);

      // Posição do filho (relativa ao pai, não ao centro)
      child.x = parent.x + Math.cos(childAngle) * radius;
      child.y = parent.y + Math.sin(childAngle) * radius;

      // Guarda o setor para os descendentes (usa o espaço proporcional ao peso)
      const childStartAngle = currentAngle + MIN_ANGLE_GAP / 2;
      const childEndAngle = currentAngle + angleShare - MIN_ANGLE_GAP / 2;

      // Recursivamente posiciona os filhos deste nó
      positionChildren(child.id, childStartAngle, childEndAngle, depth + 1);

      currentAngle += angleShare;
    });
  }

  // Inicia o layout a partir do root, usando 360° completos
  positionChildren(root.id, 0, 2 * Math.PI, 1);

  // Calcular ângulo do label ANTES da colisão (necessário para posicionar elipses)
  nodes.forEach(n => {
    if (n.depth === 0) {
      n.labelAngle = Math.PI / 2;
    } else {
      n.labelAngle = Math.atan2(n.y, n.x);
    }
    n.angle = n.labelAngle;
  });

  // Aplica colisão usando elipses centradas no texto
  applyCollisionForces(nodes, nodeMap);

  // Recalcula ângulos após colisão (posições podem ter mudado)
  nodes.forEach(n => {
    if (n.depth === 0) {
      n.labelAngle = Math.PI / 2;
    } else {
      n.labelAngle = Math.atan2(n.y, n.x);
    }
    n.angle = n.labelAngle;
  });
}

/**
 * Calcula o raio efetivo de uma elipse na direção de um ângulo.
 */
function getEllipseRadius(semiMajor, semiMinor, ellipseAngle, directionAngle) {
  const relativeAngle = directionAngle - ellipseAngle;
  const cosA = Math.cos(relativeAngle);
  const sinA = Math.sin(relativeAngle);
  return (semiMajor * semiMinor) / Math.sqrt(
    Math.pow(semiMinor * cosA, 2) + Math.pow(semiMajor * sinA, 2)
  );
}

/**
 * Calcula a posição do centro do texto baseado no ângulo e anchor.
 * Replica a lógica de nodes.js para posicionamento correto.
 *
 * Em nodes.js, o pivot é calculado como:
 *   pivot.x = (label.width + padding.x * 2) * anchorX - padding.x
 *   pivot.y = (label.height + padding.y * 2) * anchorY - padding.y
 *
 * Isso causa um offset adicional no centro real do texto.
 *
 * Exportada para uso em debug (showEllipses).
 */
export function calculateTextCenter(labelAngle, labelDistance, textWidth, textHeight, isRoot, padding) {
  if (isRoot) {
    // Root: label embaixo, centrado horizontalmente
    // anchorY = 0, então pivot.y = -padding.y
    // Centro real: labelDistance - (-padding.y) + height/2 = labelDistance + padding.y + height/2
    return {
      x: 0,
      y: labelDistance + padding.y + textHeight / 2
    };
  }

  // Posição do ponto de ancoragem (onde o texto "se conecta")
  const anchorX = Math.cos(labelAngle) * labelDistance;
  const anchorY = Math.sin(labelAngle) * labelDistance;

  // Normaliza o ângulo para determinar o quadrante
  const normalizedAngle = ((labelAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  let centerX, centerY;

  if (normalizedAngle < Math.PI / 4 || normalizedAngle > Math.PI * 7 / 4) {
    // Direita: anchorX=0, anchorY=0.5
    // pivot.x = -padding.x, pivot.y = height/2
    // Centro real X: anchorX - (-padding.x) + width/2 = anchorX + padding.x + width/2
    // Centro real Y: anchorY - height/2 + height/2 = anchorY
    centerX = anchorX + padding.x + textWidth / 2;
    centerY = anchorY;
  } else if (normalizedAngle < Math.PI * 3 / 4) {
    // Baixo: anchorX=0.5, anchorY=0
    // pivot.x = width/2, pivot.y = -padding.y
    // Centro real X: anchorX - width/2 + width/2 = anchorX
    // Centro real Y: anchorY - (-padding.y) + height/2 = anchorY + padding.y + height/2
    centerX = anchorX;
    centerY = anchorY + padding.y + textHeight / 2;
  } else if (normalizedAngle < Math.PI * 5 / 4) {
    // Esquerda: anchorX=1, anchorY=0.5
    // pivot.x = width + padding.x, pivot.y = height/2
    // Centro real X: anchorX - (width + padding.x) + width/2 = anchorX - width/2 - padding.x
    // Centro real Y: anchorY - height/2 + height/2 = anchorY
    centerX = anchorX - padding.x - textWidth / 2;
    centerY = anchorY;
  } else {
    // Cima: anchorX=0.5, anchorY=1
    // pivot.x = width/2, pivot.y = height + padding.y
    // Centro real X: anchorX - width/2 + width/2 = anchorX
    // Centro real Y: anchorY - (height + padding.y) + height/2 = anchorY - height/2 - padding.y
    centerX = anchorX;
    centerY = anchorY - padding.y - textHeight / 2;
  }

  return { x: centerX, y: centerY };
}

/**
 * Aplica forças de colisão usando elipses posicionadas sobre o texto real.
 */
function applyCollisionForces(nodes, nodeMap) {
  const { BASE_RADIUS, CHAR_WIDTH, TEXT_WEIGHT, ITERATIONS, STRENGTH } = config.collision;
  const { DISTANCE: LABEL_DISTANCE, PADDING } = config.label;
  const nodeSize = config.nodeSize;
  const TEXT_HEIGHT = 14;  // Altura aproximada do texto em pixels

  // Pré-calcula as dimensões fixas da elipse para cada nó (tamanho não muda)
  const ellipseDimensions = new Map();
  nodes.forEach(n => {
    const isRoot = n.depth === 0;
    // Usa getDisplayName para garantir mesmo truncamento que nodes.js
    const displayName = getDisplayName(n);
    const textLength = displayName.length;
    const textWidth = textLength * CHAR_WIDTH;
    const semiMinor = BASE_RADIUS;
    const semiMajor = BASE_RADIUS + textWidth * TEXT_WEIGHT;

    const nodeRadius = isRoot ? nodeSize.ROOT :
                       (n.type === 'directory' ? nodeSize.DIRECTORY : nodeSize.FILE);
    const labelDistance = nodeRadius + LABEL_DISTANCE;

    ellipseDimensions.set(n.id, {
      semiMajor,
      semiMinor,
      textWidth,
      labelDistance,
      isRoot
    });
  });

  // Função para calcular a posição atual da elipse (recalcula a cada uso)
  function getEllipsePosition(node) {
    const dims = ellipseDimensions.get(node.id);
    // Recalcula o labelAngle baseado na posição atual do nó
    const labelAngle = node.depth === 0 ? Math.PI / 2 : Math.atan2(node.y, node.x);
    const textCenter = calculateTextCenter(labelAngle, dims.labelDistance, dims.textWidth, TEXT_HEIGHT, dims.isRoot, PADDING);
    return {
      x: node.x + textCenter.x,
      y: node.y + textCenter.y,
      semiMajor: dims.semiMajor,
      semiMinor: dims.semiMinor
    };
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 1 - iter / ITERATIONS;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        // Recalcula posição da elipse a cada iteração (considera movimento do nó)
        const ellipseA = getEllipsePosition(a);
        const ellipseB = getEllipsePosition(b);

        const dx = ellipseB.x - ellipseA.x;
        const dy = ellipseB.y - ellipseA.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Ângulo da linha entre os centros das elipses
        const angle = Math.atan2(dy, dx);

        // Raio efetivo de cada elipse na direção do outro (elipses são horizontais, angle=0)
        const radiusA = getEllipseRadius(ellipseA.semiMajor, ellipseA.semiMinor, 0, angle);
        const radiusB = getEllipseRadius(ellipseB.semiMajor, ellipseB.semiMinor, 0, angle + Math.PI);

        const minDist = radiusA + radiusB;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2 * STRENGTH * alpha;
          const fx = (dx / dist) * overlap;
          const fy = (dy / dist) * overlap;

          // Não move o root
          if (a.depth !== 0) { a.x -= fx; a.y -= fy; }
          if (b.depth !== 0) { b.x += fx; b.y += fy; }
        }
      }
    }
  }
}

/**
 * Recalcula o layout hierárquico em setores para um conjunto de nós existente.
 * Usado após expansão de nós para manter a estrutura sem cruzamentos.
 */
export function relayoutHierarchical(nodes, edges) {
  if (nodes.length === 0) return;

  const root = nodes.find(n => n.depth === 0);
  if (!root) return;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const { weights, childrenMap } = calculateSubtreeWeights(nodes);

  // Parâmetros do layout (de config.js)
  const { BASE_RADIUS, RADIUS_DECAY, MIN_RADIUS, MIN_ANGLE_GAP, ANGLE_PER_WEIGHT } = config.layout;

  // Reset root position
  root.x = 0;
  root.y = 0;

  function positionChildren(parentId, startAngle, endAngle, depth) {
    const children = childrenMap.get(parentId) || [];
    if (children.length === 0) return;

    const parent = nodeMap.get(parentId);
    const availableAngle = endAngle - startAngle;
    const totalWeight = children.reduce((sum, child) => sum + weights.get(child.id), 0);

    // Calcula o ângulo "ideal" baseado no peso
    const idealAngle = totalWeight * ANGLE_PER_WEIGHT;
    const usedAngle = Math.min(availableAngle, idealAngle);

    // Centraliza os filhos dentro do setor disponível
    const centerAngle = (startAngle + endAngle) / 2;
    const actualStartAngle = centerAngle - usedAngle / 2;

    let currentAngle = actualStartAngle;

    children.forEach(child => {
      const childWeight = weights.get(child.id);
      const angleShare = (childWeight / totalWeight) * usedAngle;
      const childAngle = currentAngle + angleShare / 2;
      const radius = Math.max(BASE_RADIUS * Math.pow(RADIUS_DECAY, depth - 1), MIN_RADIUS);

      child.x = parent.x + Math.cos(childAngle) * radius;
      child.y = parent.y + Math.sin(childAngle) * radius;

      const childStartAngle = currentAngle + MIN_ANGLE_GAP / 2;
      const childEndAngle = currentAngle + angleShare - MIN_ANGLE_GAP / 2;

      positionChildren(child.id, childStartAngle, childEndAngle, depth + 1);
      currentAngle += angleShare;
    });
  }

  positionChildren(root.id, 0, 2 * Math.PI, 1);
  applyCollisionForces(nodes, nodeMap);

  // Atualiza ângulos dos labels
  nodes.forEach(n => {
    if (n.depth === 0) {
      n.labelAngle = Math.PI / 2;
    } else {
      n.labelAngle = Math.atan2(n.y, n.x);
    }
    n.angle = n.labelAngle;
  });
}
