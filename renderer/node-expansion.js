// Funções de expansão/colapso de nós do grafo

import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';
import { state, resetPathCaches, getPathToRoot } from './state.js';
import { deepDestroy } from './memory.js';
import { updateMtimeRange } from './colors.js';
import { createNode, updateLabelPosition } from './nodes.js';
import { createEdgeParticles, resetEdgeGraphicsCache } from './effects.js';
import { relayoutHierarchical, calculateTextCenter } from './graph-layout.js';
import { config, getDisplayName, getNodeRadius } from './config.js';

// Expõe PIXI para debug no console
if (typeof window !== 'undefined') {
  window.PIXI = PIXI;
}

// Referência para o elemento details (será definido externamente)
let detailsElement = null;
let renderDetailsCallback = null;

/**
 * Configura as dependências externas do módulo
 */
export function setupExpansionDependencies(details, renderDetailsFn) {
  detailsElement = details;
  renderDetailsCallback = renderDetailsFn;
}

/**
 * Toggle expand/collapse de um diretório (comportamento de mind map)
 * Se expandido: esconde todos os descendentes
 * Se colapsado: restaura os descendentes
 */
export function toggleDirectory(dirNode) {
  if (!dirNode || dirNode.type !== 'directory') return;

  const isCollapsed = state.collapsedNodes.has(dirNode.id);

  if (isCollapsed) {
    expandDirectory(dirNode);
  } else {
    collapseDirectory(dirNode);
  }
}

/**
 * Colapsa um diretório, escondendo todos os seus descendentes
 */
export function collapseDirectory(dirNode) {

  // Encontra todos os descendentes (nós cujo caminho até root passa por dirNode)
  const descendants = [];
  const descendantEdges = [];

  // Cache para lookup O(1) - constrói mapa de parentId -> filhos
  const childrenByParent = new Map();
  state.nodesData.forEach(node => {
    if (node.parentId) {
      if (!childrenByParent.has(node.parentId)) {
        childrenByParent.set(node.parentId, []);
      }
      childrenByParent.get(node.parentId).push(node);
    }
  });

  // Cache de edges por target
  const edgeByTarget = new Map();
  state.edgeData.forEach(e => edgeByTarget.set(e.target, e));

  // Set para evitar processar o mesmo nó duas vezes (proteção contra loops)
  const visited = new Set();

  function collectDescendants(parentId) {
    const children = childrenByParent.get(parentId);
    if (!children) return;

    for (const node of children) {
      if (node.id !== dirNode.id && !visited.has(node.id)) {
        visited.add(node.id);
        descendants.push(node);
        // Coleta a edge que conecta ao pai (usando cache)
        const edge = edgeByTarget.get(node.id);
        if (edge) {
          descendantEdges.push(edge);
        }
        // Recursivamente coleta filhos
        collectDescendants(node.id);
      }
    }
  }

  collectDescendants(dirNode.id);

  if (descendants.length === 0) return;

  // Guarda os descendentes para restaurar depois
  state.collapsedNodes.set(dirNode.id, {
    descendants: descendants.map(n => ({ ...n })),
    edges: descendantEdges.map(e => ({ ...e, particles: [] }))
  });

  // Remove os containers visuais dos descendentes
  descendants.forEach(node => {
    const container = state.nodeGraphics.get(node.id);
    if (container) {
      deepDestroy(container);
      state.nodeGraphics.delete(node.id);
    }
  });

  // Remove partículas das edges
  descendantEdges.forEach(edge => {
    if (edge.particles) {
      edge.particles.forEach(particle => {
        if (particle.parent) particle.parent.removeChild(particle);
        particle.destroy();
      });
      edge.particles = [];
    }
  });

  // Remove dos arrays de dados - usa Set para O(n) em vez de O(n²)
  const descendantIds = new Set(descendants.map(n => n.id));
  const edgeTargets = new Set(descendantEdges.map(e => e.target));

  state.nodesData = state.nodesData.filter(n => !descendantIds.has(n.id));
  state.edgeData = state.edgeData.filter(e => !edgeTargets.has(e.target));

  // Marca o nó como colapsado (para indicador visual)
  dirNode.isCollapsed = true;

  // Atualiza o container visual do diretório para mostrar indicador de colapsado
  const container = state.nodeGraphics.get(dirNode.id);
  if (container && container._label) {
    container._label.text = '▸ ' + dirNode.name;
  }

  // Limpa caches
  resetEdgeGraphicsCache();
  resetPathCaches();
}

/**
 * Expande um diretório colapsado, restaurando seus descendentes
 */
export function expandDirectory(dirNode) {
  const saved = state.collapsedNodes.get(dirNode.id);
  if (!saved) return;

  const { descendants, edges } = saved;

  // Restaura os nós nos dados
  state.nodesData.push(...descendants);
  state.edgeData.push(...edges);

  // Recalcula mtime range
  updateMtimeRange(state.nodesData);

  // Cria partículas para as edges
  const nodesById = new Map(state.nodesData.map(n => [n.id, n]));
  edges.forEach(edge => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source && target) {
      createEdgeParticles(edge, source, target, state.particlesContainer);
    }
  });

  // Cria containers visuais para os nós restaurados
  descendants.forEach(node => {
    // Verifica se já existe (evita duplicatas)
    if (state.nodeGraphics.has(node.id)) return;

    const nodeContainer = createNode(
      node,
      state.nodesData,
      state.nodeGraphics,
      () => state.selectedNode,
      (n) => {
        state.selectedNode = n;
        state.activePathEdgeIds = getPathToRoot(n, state.edgeData, state.nodesData);
        if (renderDetailsCallback && detailsElement) {
          renderDetailsCallback(detailsElement, n);
        }
      },
      expandPlaceholder,
      toggleDirectory
    );
    state.nodesContainer.addChild(nodeContainer);
    state.nodeGraphics.set(node.id, nodeContainer);

    // Anima entrada
    nodeContainer.alpha = 0;
    nodeContainer.scale.set(0.5);
  });

  // Animação de entrada
  let progress = 0;
  const animateIn = () => {
    progress += 0.08;
    if (progress >= 1) {
      descendants.forEach(node => {
        const container = state.nodeGraphics.get(node.id);
        if (container) {
          container.alpha = 1;
          container.scale.set(1);
        }
      });
      return;
    }
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    descendants.forEach(node => {
      const container = state.nodeGraphics.get(node.id);
      if (container) {
        container.alpha = easeProgress;
        container.scale.set(0.5 + easeProgress * 0.5);
      }
    });
    requestAnimationFrame(animateIn);
  };
  requestAnimationFrame(animateIn);

  // Remove do mapa de colapsados
  state.collapsedNodes.delete(dirNode.id);
  dirNode.isCollapsed = false;

  // Restaura label do diretório
  const container = state.nodeGraphics.get(dirNode.id);
  if (container && container._label) {
    container._label.text = dirNode.name;
  }

  // Limpa caches
  resetEdgeGraphicsCache();
  resetPathCaches();
}

/**
 * Expande um nó placeholder (+x arquivos/pastas) para mostrar os itens ocultos
 * Os novos nós aparecem com estilo muted (menos destaque)
 * Diretórios são expandidos recursivamente até os arquivos recentes
 */
export function expandPlaceholder(placeholderNode) {
  if (!placeholderNode || !placeholderNode.hiddenItems || placeholderNode.hiddenItems.length === 0) {
    return;
  }

  const hiddenItems = placeholderNode.hiddenItems;
  const parentId = placeholderNode.parentId;
  const placeholderDepth = placeholderNode.depth;

  // Encontra o container visual do placeholder
  const placeholderContainer = state.nodeGraphics.get(placeholderNode.id);
  if (!placeholderContainer) return;

  // Posição base: perto do placeholder
  const baseX = placeholderNode.x;
  const baseY = placeholderNode.y;

  // Cria os novos nós
  const newNodes = [];
  const newEdges = [];

  // Função recursiva para processar um item e seus children
  function processItemRecursively(item, parentNodeId, depth, parentX, parentY, angleOffset, radiusBase, recursionDepth = 0) {
    const angle = angleOffset;
    const radius = radiusBase;

    const calculatedX = parentX + Math.cos(angle) * radius;
    const calculatedY = parentY + Math.sin(angle) * radius;

    const newNode = {
      id: item.path,
      path: item.path,
      name: item.name,
      type: item.type,
      depth: depth,
      parentId: parentNodeId,
      mtime: item.mtime,
      childCount: item.children ? item.children.length : 0,
      hiddenFilesCount: 0,
      hiddenDirsCount: 0,
      totalFilesCount: 0,
      totalDirsCount: 0,
      isExpandedItem: true,
      x: calculatedX,
      y: calculatedY,
      labelAngle: angle
    };

    newNodes.push(newNode);

    const newEdge = {
      source: parentNodeId,
      target: newNode.id,
      particles: [],
      edgeId: `${parentNodeId}-${newNode.id}`
    };
    newEdges.push(newEdge);

    // Se é um diretório com children, processa recursivamente
    if (item.type === 'directory' && item.children && item.children.length > 0) {
      const childCount = item.children.length;
      item.children.forEach((child, childIndex) => {
        // Distribui os filhos em arco a partir do diretório pai
        const childAngle = angle + ((childIndex / Math.max(childCount - 1, 1)) - 0.5) * (Math.PI / 2);
        const childRadius = 70 + (childIndex % 2) * 20;
        processItemRecursively(child, newNode.id, depth + 1, newNode.x, newNode.y, childAngle, childRadius, recursionDepth + 1);
      });
    }
  }

  hiddenItems.forEach((item, index) => {
    // Distribui os nós em semicírculo a partir do placeholder
    const angle = (index / Math.max(hiddenItems.length - 1, 1)) * Math.PI - Math.PI / 2;
    const radius = 80 + (index % 3) * 30; // Espaçamento variado

    processItemRecursively(item, parentId, placeholderDepth, baseX, baseY, angle, radius);
  });

  // Adiciona aos dados globais
  state.nodesData.push(...newNodes);
  state.edgeData.push(...newEdges);

  // Recalcula mtime range para cores corretas
  updateMtimeRange(state.nodesData);

  // Cria partículas para as novas edges
  // Usa Map temporário para lookup O(1) em vez de .find() O(n)
  const nodesById = new Map(state.nodesData.map(n => [n.id, n]));
  newEdges.forEach(edge => {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source && target) {
      createEdgeParticles(edge, source, target, state.particlesContainer);
    }
  });

  // Cria os containers visuais para os novos nós
  newNodes.forEach(node => {
    const nodeContainer = createNode(
      node,
      state.nodesData,
      state.nodeGraphics,
      () => state.selectedNode,
      (n) => {
        state.selectedNode = n;
        state.activePathEdgeIds = getPathToRoot(n, state.edgeData, state.nodesData);
        if (renderDetailsCallback && detailsElement) {
          renderDetailsCallback(detailsElement, n);
        }
      },
      expandPlaceholder,
      toggleDirectory
    );
    state.nodesContainer.addChild(nodeContainer);
    state.nodeGraphics.set(node.id, nodeContainer);

    // Anima a entrada dos novos nós
    nodeContainer.alpha = 0;
    nodeContainer.scale.set(0.5);
  });

  // Animação de entrada suave
  let progress = 0;
  const animateIn = () => {
    progress += 0.05;
    if (progress >= 1) {
      newNodes.forEach(node => {
        const container = state.nodeGraphics.get(node.id);
        if (container) {
          container.alpha = 1;
          container.scale.set(1);
        }
      });
      return;
    }

    const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
    newNodes.forEach(node => {
      const container = state.nodeGraphics.get(node.id);
      if (container) {
        container.alpha = easeProgress;
        container.scale.set(0.5 + easeProgress * 0.5);
      }
    });

    requestAnimationFrame(animateIn);
  };
  requestAnimationFrame(animateIn);

  // Remove o placeholder
  deepDestroy(placeholderContainer);
  state.nodeGraphics.delete(placeholderNode.id);

  // Remove o placeholder dos dados
  const placeholderIndex = state.nodesData.findIndex(n => n.id === placeholderNode.id);
  if (placeholderIndex !== -1) {
    state.nodesData.splice(placeholderIndex, 1);
  }

  // Remove a edge do placeholder e suas partículas
  const placeholderEdgeIndex = state.edgeData.findIndex(e => e.target === placeholderNode.id);
  if (placeholderEdgeIndex !== -1) {
    const placeholderEdge = state.edgeData[placeholderEdgeIndex];
    // Destrói as partículas da edge do placeholder
    if (placeholderEdge.particles) {
      placeholderEdge.particles.forEach(particle => {
        if (particle.parent) {
          particle.parent.removeChild(particle);
        }
        particle.destroy();
      });
      placeholderEdge.particles = [];
    }
    state.edgeData.splice(placeholderEdgeIndex, 1);
  }

  // Limpa caches de lookup
  resetPathCaches();

  // Reseta cache de gráficos de edges para redesenhar com as novas edges
  resetEdgeGraphicsCache();

  // Recalcula o layout para evitar sobreposições
  relayoutAfterExpansion();
}

/**
 * Recalcula o layout do grafo após uma expansão para evitar sobreposições.
 * Usa layout hierárquico em setores e anima os nós para as novas posições.
 */
export function relayoutAfterExpansion() {
  const nodes = state.nodesData;
  const edges = state.edgeData;

  if (nodes.length === 0) return;

  // Usa o novo layout hierárquico em setores
  relayoutHierarchical(nodes, edges);

  // Anima os containers visuais para as novas posições
  animateNodesToNewPositions();
}

// Expõe no window para ajuste via DevTools
// Uso no console:
//   config.collision.TEXT_WEIGHT = 0.8
//   relayout()
//   showEllipses() / hideEllipses()
if (typeof window !== 'undefined') {
  window.relayout = relayoutAfterExpansion;

  // Container para debug das elipses
  let ellipseDebugContainer = null;

  window.showEllipses = function() {
    // Remove container anterior se existir
    if (ellipseDebugContainer) {
      ellipseDebugContainer.destroy({ children: true });
    }

    // Cria novo container
    ellipseDebugContainer = new PIXI.Container();
    state.nodesContainer.parent.addChild(ellipseDebugContainer);

    const { BASE_RADIUS, CHAR_WIDTH, TEXT_WEIGHT } = config.collision;
    const { DISTANCE: LABEL_DISTANCE, PADDING, TEXT_HEIGHT } = config.label;

    state.nodesData.forEach(n => {
      // Usa getDisplayName para consistência com graph-layout.js e nodes.js
      const displayName = getDisplayName(n);
      const textLength = displayName.length;
      const textWidth = textLength * CHAR_WIDTH;
      const semiMinor = BASE_RADIUS;
      const semiMajor = BASE_RADIUS + textWidth * TEXT_WEIGHT;

      const labelAngle = n.labelAngle || 0;
      const isRoot = n.depth === 0;
      const nodeRadius = getNodeRadius(n);
      const labelDistance = nodeRadius + LABEL_DISTANCE;

      // Usa calculateTextCenter de graph-layout.js (com PADDING)
      const textCenter = calculateTextCenter(labelAngle, labelDistance, textWidth, TEXT_HEIGHT, isRoot, PADDING);

      const ellipse = new PIXI.Graphics();
      ellipse.setStrokeStyle({ width: 1, color: 0x00ff00, alpha: 0.5 });

      // Desenha elipse horizontal
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const ex = Math.cos(t) * semiMajor;
        const ey = Math.sin(t) * semiMinor;
        if (i === 0) {
          ellipse.moveTo(ex, ey);
        } else {
          ellipse.lineTo(ex, ey);
        }
      }
      ellipse.stroke();

      // Posiciona no centro real do texto
      ellipse.x = n.x + textCenter.x;
      ellipse.y = n.y + textCenter.y;
      ellipseDebugContainer.addChild(ellipse);
    });

    console.log('Ellipses shown (centered on text). Use hideEllipses() to hide.');
  };

  window.hideEllipses = function() {
    if (ellipseDebugContainer) {
      ellipseDebugContainer.destroy({ children: true });
      ellipseDebugContainer = null;
      console.log('Ellipses hidden.');
    }
  };
}

// Flag para evitar animações sobrepostas
let animationInProgress = false;

/**
 * Anima suavemente todos os nós para suas novas posições calculadas.
 */
function animateNodesToNewPositions() {
  // Evita animações sobrepostas que podem causar problemas
  if (animationInProgress) return;
  animationInProgress = true;

  const nodes = state.nodesData;
  const duration = 500; // ms
  const startTime = performance.now();

  // Salva posições iniciais dos containers e labelAngles
  const startPositions = new Map();
  nodes.forEach(node => {
    const container = state.nodeGraphics.get(node.id);
    if (container) {
      startPositions.set(node.id, {
        x: container.x,
        y: container.y,
        labelAngle: container.nodeData?.labelAngle ?? node.labelAngle
      });
    }
  });

  function animate(currentTime) {
    try {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      nodes.forEach(node => {
        const container = state.nodeGraphics.get(node.id);
        const startPos = startPositions.get(node.id);
        if (container && startPos) {
          container.x = startPos.x + (node.x - startPos.x) * easeProgress;
          container.y = startPos.y + (node.y - startPos.y) * easeProgress;

          // Atualiza labelAngle no nodeData do container para a animação
          if (container.nodeData) {
            container.nodeData.labelAngle = node.labelAngle;
          }
          // Atualiza posição do label junto com o container
          updateLabelPosition(container, node);
        }
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Posição final exata
        nodes.forEach(node => {
          const container = state.nodeGraphics.get(node.id);
          if (container) {
            container.x = node.x;
            container.y = node.y;
            // Garante posição final do label
            updateLabelPosition(container, node);
          }
        });
        // Reseta cache de edges para redesenhar com novas posições
        resetEdgeGraphicsCache();

        animationInProgress = false; // Libera para próxima animação
      }
    } catch (error) {
      animationInProgress = false; // Libera mesmo em caso de erro
    }
  }

  requestAnimationFrame(animate);
}
