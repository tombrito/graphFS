import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';

const pixiContainer = document.getElementById('pixi-container');
const rootPathLabel = document.getElementById('root-path');
const treeView = document.getElementById('tree-view');
const details = document.getElementById('details');
const fallbackBadge = document.getElementById('fallback-badge');

let app;
let graphContainer;
let edgeLayer;
let currentZoom = 0.6;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
let selectedNode = null;
let nodeGraphics = new Map();

// Paleta de cores moderna
const COLORS = {
  background: 0x0a0e17,
  rootNode: 0x8b5cf6,      // Roxo vibrante
  directory: 0x3b82f6,      // Azul
  file: 0x10b981,           // Verde esmeralda
  edge: 0x334155,           // Cinza azulado
  edgeHighlight: 0x6366f1,  // Indigo
  glow: 0x8b5cf6,
  text: 0xe2e8f0,
  textMuted: 0x94a3b8
};

async function bootstrap() {
  const { tree, rootPath, fallbackUsed, error } = await window.graphfs.getFilesystemTree();
  rootPathLabel.textContent = rootPath;
  if (fallbackUsed) {
    fallbackBadge.hidden = false;
    if (error) {
      renderNotice(`Usando dados de demonstração porque não foi possível ler ${rootPath}: ${error}`);
    }
  }

  const nodes = [];
  const edges = [];
  flattenTree(tree, null, 0, nodes, edges);
  layoutNodesRadial(tree, nodes);
  await buildPixiApp(nodes, edges);
  setupZoomControls();
  setupPanControls();
  renderTree(tree);
}

function renderNotice(message) {
  const warn = document.createElement('p');
  warn.textContent = message;
  warn.style.color = '#fbbf24';
  details.innerHTML = '';
  details.appendChild(warn);
}

function flattenTree(node, parentId, depth, nodes, edges) {
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
    collapsed: node.collapsed || false
  };
  nodes.push(current);

  if (parentId) {
    edges.push({ source: parentId, target: current.id });
  }

  if (node.children) {
    node.children.forEach((child) => flattenTree(child, current.id, depth + 1, nodes, edges));
  }
}

// Layout radial recursivo - raiz no centro, filhos em círculos
function layoutNodesRadial(tree, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Raiz no centro
  const root = nodeMap.get(tree.path);
  root.x = 0;
  root.y = 0;

  // Função recursiva para posicionar filhos
  function positionChildren(parentNode, treeNode, startAngle, endAngle, radius) {
    if (!treeNode.children || treeNode.children.length === 0) return;

    const children = treeNode.children;
    const angleSpan = endAngle - startAngle;
    const angleStep = angleSpan / children.length;

    children.forEach((childTree, index) => {
      const childNode = nodeMap.get(childTree.path);
      const angle = startAngle + angleStep * (index + 0.5);

      // Posição do filho
      childNode.x = parentNode.x + Math.cos(angle) * radius;
      childNode.y = parentNode.y + Math.sin(angle) * radius;
      childNode.angle = angle;

      // Calcular raio para próximo nível baseado na quantidade de descendentes
      const descendantCount = countDescendants(childTree);
      const nextRadius = Math.max(80, Math.min(200, 60 + descendantCount * 8));

      // Span angular para os filhos deste nó
      const childAngleSpan = Math.min(angleStep * 0.9, Math.PI * 0.8);
      const childStartAngle = angle - childAngleSpan / 2;
      const childEndAngle = angle + childAngleSpan / 2;

      positionChildren(childNode, childTree, childStartAngle, childEndAngle, nextRadius);
    });
  }

  // Começar layout com raio inicial
  const initialRadius = 150;
  positionChildren(root, tree, 0, Math.PI * 2, initialRadius);
}

function countDescendants(node) {
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

async function buildPixiApp(nodes, edges) {
  app = new PIXI.Application();
  const { width, height } = pixiContainer.getBoundingClientRect();
  await app.init({
    width: Math.max(width, 600),
    height: Math.max(height, 400),
    background: COLORS.background,
    antialias: true,
    resolution: window.devicePixelRatio || 1
  });

  pixiContainer.innerHTML = '';
  pixiContainer.appendChild(app.canvas);

  graphContainer = new PIXI.Container();
  app.stage.addChild(graphContainer);

  // Camada de edges (conexões)
  edgeLayer = new PIXI.Graphics();
  drawEdges(edges, nodes);
  graphContainer.addChild(edgeLayer);

  // Criar nodes
  nodes.forEach((node) => {
    const nodeContainer = createNode(node, nodes);
    graphContainer.addChild(nodeContainer);
    nodeGraphics.set(node.id, nodeContainer);
  });

  centerGraphInView();
  applyZoom(currentZoom, new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2));

  // Animação de entrada
  animateEntrance(nodes);
}

function drawEdges(edges, nodes) {
  edgeLayer.clear();

  edges.forEach((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (source && target) {
      // Curva bezier suave
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;

      // Ponto de controle perpendicular à linha
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curvature = dist * 0.15;

      // Perpendicular
      const perpX = -dy / dist * curvature;
      const perpY = dx / dist * curvature;

      const ctrlX = midX + perpX;
      const ctrlY = midY + perpY;

      // Gradiente na linha (simular com alpha)
      edgeLayer.moveTo(source.x, source.y);
      edgeLayer.lineStyle({
        width: 2,
        color: COLORS.edge,
        alpha: 0.6,
        cap: 'round'
      });
      edgeLayer.quadraticCurveTo(ctrlX, ctrlY, target.x, target.y);
    }
  });
}

function createFolderIcon(color, isRoot) {
  const icon = new PIXI.Graphics();
  const scale = isRoot ? 1.2 : 0.8;

  // Desenhar pasta com aba
  icon.lineStyle({ width: 1.5, color: color, alpha: 1 });
  icon.beginFill(color, 0.3);

  // Corpo da pasta
  icon.drawRoundedRect(-8 * scale, -4 * scale, 16 * scale, 10 * scale, 1.5 * scale);

  // Aba da pasta (superior esquerda)
  icon.endFill();
  icon.beginFill(color, 0.5);
  icon.drawRoundedRect(-8 * scale, -6 * scale, 8 * scale, 3 * scale, 1 * scale);
  icon.endFill();

  return icon;
}

function createFileIcon(color, isRoot) {
  const icon = new PIXI.Graphics();
  const scale = isRoot ? 1.0 : 0.7;

  // Desenhar documento com canto dobrado
  icon.lineStyle({ width: 1.5, color: color, alpha: 1 });
  icon.beginFill(color, 0.3);

  // Corpo do documento
  const width = 10 * scale;
  const height = 12 * scale;
  const foldSize = 3 * scale;

  icon.moveTo(-width/2, -height/2);
  icon.lineTo(width/2 - foldSize, -height/2);
  icon.lineTo(width/2, -height/2 + foldSize);
  icon.lineTo(width/2, height/2);
  icon.lineTo(-width/2, height/2);
  icon.lineTo(-width/2, -height/2);
  icon.endFill();

  // Canto dobrado
  icon.lineStyle({ width: 1.5, color: color, alpha: 1 });
  icon.beginFill(color, 0.6);
  icon.moveTo(width/2 - foldSize, -height/2);
  icon.lineTo(width/2 - foldSize, -height/2 + foldSize);
  icon.lineTo(width/2, -height/2 + foldSize);
  icon.lineTo(width/2 - foldSize, -height/2);
  icon.endFill();

  // Linhas do texto (detalhes)
  icon.lineStyle({ width: 1, color: color, alpha: 0.5 });
  const lineY1 = -height/2 + 5 * scale;
  const lineY2 = -height/2 + 7.5 * scale;
  icon.moveTo(-width/2 + 2 * scale, lineY1);
  icon.lineTo(width/2 - 2 * scale, lineY1);
  icon.moveTo(-width/2 + 2 * scale, lineY2);
  icon.lineTo(width/2 - 2 * scale, lineY2);

  return icon;
}

function createNode(node, allNodes) {
  const container = new PIXI.Container();
  container.x = node.x;
  container.y = node.y;
  container.nodeData = node;

  const isRoot = node.depth === 0;
  const isDirectory = node.type === 'directory';

  // Tamanho baseado no tipo
  const baseRadius = isRoot ? 35 : (isDirectory ? 22 : 14);

  // Cor baseada no tipo
  const color = isRoot ? COLORS.rootNode : (isDirectory ? COLORS.directory : COLORS.file);

  // Glow effect (círculo maior e mais transparente)
  const glow = new PIXI.Graphics();
  glow.beginFill(color, 0.15);
  glow.drawCircle(0, 0, baseRadius + 12);
  glow.endFill();
  glow.visible = isRoot;
  container.addChild(glow);

  // Círculo externo (borda)
  const outerCircle = new PIXI.Graphics();
  outerCircle.lineStyle({ width: 2, color: color, alpha: 0.8 });
  outerCircle.drawCircle(0, 0, baseRadius);
  container.addChild(outerCircle);

  // Círculo interno (preenchimento)
  const innerCircle = new PIXI.Graphics();
  innerCircle.beginFill(color, 0.25);
  innerCircle.drawCircle(0, 0, baseRadius - 2);
  innerCircle.endFill();
  container.addChild(innerCircle);

  // Ícone no centro
  const iconGraphic = isDirectory ? createFolderIcon(color, isRoot) : createFileIcon(color, isRoot);
  container.addChild(iconGraphic);

  // Label
  const label = new PIXI.Text({
    text: truncateName(node.name, isRoot ? 20 : 15),
    style: {
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontSize: isRoot ? 14 : 11,
      fill: isRoot ? COLORS.text : COLORS.textMuted,
      fontWeight: isRoot ? 'bold' : 'normal'
    }
  });
  label.anchor.set(0.5, 0);
  label.y = baseRadius + 8;
  container.addChild(label);

  // Badge de contagem para diretórios
  if (isDirectory && node.childCount > 0) {
    const badge = createBadge(node.childCount);
    badge.x = baseRadius - 5;
    badge.y = -baseRadius + 5;
    container.addChild(badge);
  }

  // Badge para diretórios colapsados (conteúdo oculto)
  const totalHidden = (node.hiddenFilesCount || 0) + (node.hiddenDirsCount || 0);
  if (isDirectory && totalHidden > 0) {
    const hiddenBadge = createHiddenBadge(totalHidden, node.collapsed);
    hiddenBadge.x = -baseRadius + 5;
    hiddenBadge.y = -baseRadius + 5;
    container.addChild(hiddenBadge);
  }

  // Interatividade
  container.eventMode = 'static';
  container.cursor = 'pointer';

  // Hover effects
  container.on('pointerover', () => {
    glow.visible = true;
    container.scale.set(1.15);
    label.style.fill = COLORS.text;
  });

  container.on('pointerout', () => {
    if (!isRoot && selectedNode?.id !== node.id) {
      glow.visible = false;
    }
    if (selectedNode?.id !== node.id) {
      container.scale.set(1);
      label.style.fill = isRoot ? COLORS.text : COLORS.textMuted;
    }
  });

  container.on('pointertap', () => {
    // Desselecionar anterior
    if (selectedNode && nodeGraphics.has(selectedNode.id)) {
      const prevContainer = nodeGraphics.get(selectedNode.id);
      const prevIsRoot = selectedNode.depth === 0;
      prevContainer.scale.set(1);
      prevContainer.children[0].visible = prevIsRoot;
    }

    selectedNode = node;
    container.scale.set(1.15);
    glow.visible = true;
    renderDetails(node);
  });

  return container;
}

function createBadge(count) {
  const badge = new PIXI.Container();

  const bg = new PIXI.Graphics();
  bg.beginFill(0x1e293b, 0.9);
  bg.drawRoundedRect(-10, -8, 20, 16, 8);
  bg.endFill();
  badge.addChild(bg);

  const text = new PIXI.Text({
    text: count > 99 ? '99+' : String(count),
    style: {
      fontFamily: 'Arial',
      fontSize: 9,
      fill: COLORS.textMuted
    }
  });
  text.anchor.set(0.5);
  badge.addChild(text);

  return badge;
}

function createHiddenBadge(count, isCollapsed) {
  const badge = new PIXI.Container();

  // Cor diferente para colapsados (laranja) vs apenas arquivos ocultos (roxo)
  const bgColor = isCollapsed ? 0xf59e0b : 0x7c3aed;

  const bg = new PIXI.Graphics();
  bg.beginFill(bgColor, 0.9);
  bg.drawRoundedRect(-14, -8, 28, 16, 8);
  bg.endFill();
  badge.addChild(bg);

  const text = new PIXI.Text({
    text: isCollapsed ? '...' : `+${count > 99 ? '99' : count}`,
    style: {
      fontFamily: 'Arial',
      fontSize: 9,
      fill: 0xffffff,
      fontWeight: 'bold'
    }
  });
  text.anchor.set(0.5);
  badge.addChild(text);

  return badge;
}

function truncateName(name, maxLength) {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 2) + '…';
}

function animateEntrance(nodes) {
  nodes.forEach((node, index) => {
    const container = nodeGraphics.get(node.id);
    if (container) {
      container.alpha = 0;
      container.scale.set(0.5);

      // Animação escalonada
      const delay = node.depth * 80 + index * 15;
      setTimeout(() => {
        animateTo(container, { alpha: 1, scaleX: 1, scaleY: 1 }, 400);
      }, delay);
    }
  });
}

function animateTo(target, props, duration) {
  const startTime = Date.now();
  const startValues = {};

  for (const key in props) {
    if (key === 'scaleX') startValues[key] = target.scale.x;
    else if (key === 'scaleY') startValues[key] = target.scale.y;
    else startValues[key] = target[key];
  }

  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing: ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);

    for (const key in props) {
      const start = startValues[key];
      const end = props[key];
      const value = start + (end - start) * eased;

      if (key === 'scaleX') target.scale.x = value;
      else if (key === 'scaleY') target.scale.y = value;
      else target[key] = value;
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function centerGraphInView() {
  if (!app || !graphContainer) return;

  const bounds = graphContainer.getBounds();
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  const targetX = app.renderer.width / 2;
  const targetY = app.renderer.height / 2;

  graphContainer.position.x += targetX - contentCenterX;
  graphContainer.position.y += targetY - contentCenterY;
}

function applyZoom(targetZoom, anchor) {
  if (!app || !graphContainer) return;

  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
  const zoomAnchor = anchor ?? new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
  const worldPosition = graphContainer.toLocal(zoomAnchor);

  graphContainer.scale.set(clampedZoom);
  const newScreenPosition = graphContainer.toGlobal(worldPosition);
  graphContainer.position.x += zoomAnchor.x - newScreenPosition.x;
  graphContainer.position.y += zoomAnchor.y - newScreenPosition.y;

  const bounds = graphContainer.getBounds();
  if (bounds.width < app.renderer.width || bounds.height < app.renderer.height) {
    centerGraphInView();
  }
  currentZoom = clampedZoom;
}

function setupZoomControls() {
  pixiContainer.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const centerPoint = new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * 0.12;
      applyZoom(currentZoom * factor, centerPoint);
    },
    { passive: false }
  );
}

function setupPanControls() {
  let isPanning = false;
  let lastPosition = { x: 0, y: 0 };

  pixiContainer.addEventListener('mousedown', (event) => {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      isPanning = true;
      lastPosition = { x: event.clientX, y: event.clientY };
      pixiContainer.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (!isPanning) return;

    const dx = event.clientX - lastPosition.x;
    const dy = event.clientY - lastPosition.y;

    graphContainer.position.x += dx;
    graphContainer.position.y += dy;

    lastPosition = { x: event.clientX, y: event.clientY };
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    pixiContainer.style.cursor = 'default';
  });
}

function renderDetails(node) {
  details.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = node.name;
  const type = document.createElement('div');
  type.className = 'type';
  type.textContent = node.type;
  const path = document.createElement('p');
  path.className = 'path';
  path.textContent = node.id;

  details.appendChild(title);
  details.appendChild(type);
  details.appendChild(path);

  // Mostrar info de conteúdo oculto para diretórios
  if (node.type === 'directory') {
    const hiddenDirs = node.hiddenDirsCount || 0;
    const hiddenFiles = node.hiddenFilesCount || 0;

    if (node.collapsed && (hiddenDirs > 0 || hiddenFiles > 0)) {
      const collapsedInfo = document.createElement('p');
      collapsedInfo.style.color = '#fbbf24';
      collapsedInfo.style.fontSize = '12px';
      collapsedInfo.style.marginTop = '8px';
      const parts = [];
      if (hiddenDirs > 0) parts.push(`${hiddenDirs} pastas`);
      if (hiddenFiles > 0) parts.push(`${hiddenFiles} arquivos`);
      collapsedInfo.textContent = `Contém: ${parts.join(', ')}`;
      details.appendChild(collapsedInfo);
    } else if (hiddenFiles > 0) {
      const hiddenInfo = document.createElement('p');
      hiddenInfo.style.color = '#a78bfa';
      hiddenInfo.style.fontSize = '12px';
      hiddenInfo.style.marginTop = '8px';
      hiddenInfo.textContent = `+${hiddenFiles} arquivos ocultos (${node.totalFilesCount} total)`;
      details.appendChild(hiddenInfo);
    }
  }
}

function renderTree(node) {
  const lines = [];
  buildTreeLines(node, '', true, lines);
  treeView.innerHTML = lines.join('\n');
}

function buildTreeLines(node, prefix, isLast, lines) {
  const connector = prefix ? (isLast ? '└─ ' : '├─ ') : '';
  const line = `${prefix}${connector}<span class="${node.type === 'directory' ? 'tree-dir' : 'tree-file'}">${node.name}</span>`;
  lines.push(line);

  if (node.children && node.children.length > 0) {
    const nextPrefix = prefix + (isLast ? '   ' : '│  ');
    node.children.forEach((child, index) => {
      buildTreeLines(child, nextPrefix, index === node.children.length - 1, lines);
    });
  }
}

bootstrap();
