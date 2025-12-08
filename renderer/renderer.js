import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';

const pixiContainer = document.getElementById('pixi-container');
const rootPathLabel = document.getElementById('root-path');
const treeView = document.getElementById('tree-view');
const details = document.getElementById('details');
const fallbackBadge = document.getElementById('fallback-badge');

let app;
let worldContainer;
let starsContainer;
let nebulaContainer;
let edgesContainer;
let particlesContainer;
let nodesContainer;

let currentZoom = 0.6;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
let selectedNode = null;
let nodeGraphics = new Map();
let edgeData = [];
let nodesData = [];
let time = 0;

// Paleta de cores estilo constellation (dourado sobre preto)
const COLORS = {
  background: 0x000008,
  rootNode: 0xc9b77d,
  directory: 0x6488a8,
  file: 0x8b9a6b,
  edge: 0xc9b77d,
  edgeGlow: 0xf4e4bc,
  glow: 0xc9b77d,
  text: 0xc9b77d,
  textMuted: 0x7a6f50,
  nebula: [0x1a0a2e, 0x0a1628, 0x16213e, 0x0f3460]
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

  nodesData = nodes;
  edgeData = edges;

  await buildPixiApp(nodes, edges);
  setupZoomControls();
  setupPanControls();
  renderTree(tree);

  // Iniciar loop de animação
  app.ticker.add(animate);
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
    edges.push({ source: parentId, target: current.id, particles: [] });
  }

  if (node.children) {
    node.children.forEach((child) => flattenTree(child, current.id, depth + 1, nodes, edges));
  }
}

function layoutNodesRadial(tree, nodes) {
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

function countDescendants(node) {
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

// ============================================
// STARFIELD - Estrelas que piscam
// ============================================
function createStarfield() {
  const width = app.screen.width;
  const height = app.screen.height;

  // Estrelas pequenas e fracas
  for (let i = 0; i < 300; i++) {
    const star = new PIXI.Graphics();
    const size = Math.random() * 1.5 + 0.5;
    const brightness = Math.random() * 0.4 + 0.1;

    star.beginFill(0xffffff, brightness);
    star.drawCircle(0, 0, size);
    star.endFill();

    star.x = Math.random() * width * 3 - width;
    star.y = Math.random() * height * 3 - height;
    star._baseAlpha = brightness;
    star._twinkleSpeed = Math.random() * 2 + 1;
    star._twinkleOffset = Math.random() * Math.PI * 2;

    starsContainer.addChild(star);
  }

  // Estrelas maiores e mais brilhantes (douradas)
  for (let i = 0; i < 40; i++) {
    const star = new PIXI.Graphics();
    const size = Math.random() * 2 + 1;

    // Glow dourado
    star.beginFill(COLORS.edge, 0.1);
    star.drawCircle(0, 0, size * 4);
    star.endFill();

    // Centro branco
    star.beginFill(0xffffff, 0.9);
    star.drawCircle(0, 0, size);
    star.endFill();

    star.x = Math.random() * width * 3 - width;
    star.y = Math.random() * height * 3 - height;
    star._baseAlpha = 0.9;
    star._twinkleSpeed = Math.random() * 3 + 0.5;
    star._twinkleOffset = Math.random() * Math.PI * 2;

    starsContainer.addChild(star);
  }
}

// ============================================
// NEBULA - Nuvens coloridas
// ============================================
function createNebula() {
  const nebula = new PIXI.Graphics();
  const width = app.screen.width;
  const height = app.screen.height;

  for (let i = 0; i < 6; i++) {
    const color = COLORS.nebula[Math.floor(Math.random() * COLORS.nebula.length)];
    const x = Math.random() * width * 2 - width * 0.5;
    const y = Math.random() * height * 2 - height * 0.5;
    const radius = Math.random() * 250 + 150;

    nebula.beginFill(color, 0.25);
    nebula.drawCircle(x, y, radius);
    nebula.endFill();
  }

  // Aplicar blur para suavizar
  nebula.filters = [new PIXI.BlurFilter({ strength: 50 })];
  nebulaContainer.addChild(nebula);
}

// ============================================
// PARTÍCULAS NAS CONEXÕES
// ============================================
function createEdgeParticles(edge, source, target) {
  const particleCount = 2;

  for (let i = 0; i < particleCount; i++) {
    const particle = new PIXI.Graphics();
    particle.beginFill(COLORS.edge, 0.8);
    particle.drawCircle(0, 0, 2);
    particle.endFill();

    particle._progress = i / particleCount;
    particle._speed = 0.003 + Math.random() * 0.002;
    particle._sourceId = source.id;
    particle._targetId = target.id;

    particlesContainer.addChild(particle);
    edge.particles.push(particle);
  }
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

  // Criar containers em ordem de camadas
  worldContainer = new PIXI.Container();
  starsContainer = new PIXI.Container();
  nebulaContainer = new PIXI.Container();
  edgesContainer = new PIXI.Container();
  particlesContainer = new PIXI.Container();
  nodesContainer = new PIXI.Container();

  app.stage.addChild(worldContainer);
  worldContainer.addChild(starsContainer);
  worldContainer.addChild(nebulaContainer);
  worldContainer.addChild(edgesContainer);
  worldContainer.addChild(particlesContainer);
  worldContainer.addChild(nodesContainer);

  // Criar efeitos de fundo
  createStarfield();
  createNebula();

  // Criar edges e partículas
  edges.forEach((edge) => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (source && target) {
      createEdgeParticles(edge, source, target);
    }
  });

  // Criar nodes
  nodes.forEach((node) => {
    const nodeContainer = createNode(node, nodes);
    nodesContainer.addChild(nodeContainer);
    nodeGraphics.set(node.id, nodeContainer);
  });

  centerGraphInView();
  applyZoom(currentZoom, new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2));

  animateEntrance(nodes);
}

// ============================================
// LOOP DE ANIMAÇÃO
// ============================================
function animate(ticker) {
  time += ticker.deltaTime * 0.016;

  // Animar estrelas (twinkle)
  starsContainer.children.forEach(star => {
    if (star._twinkleSpeed) {
      star.alpha = star._baseAlpha * (0.5 + 0.5 * Math.sin(time * star._twinkleSpeed + star._twinkleOffset));
    }
  });

  // Desenhar edges
  drawEdges();

  // Animar partículas nas conexões
  edgeData.forEach(edge => {
    const source = nodesData.find(n => n.id === edge.source);
    const target = nodesData.find(n => n.id === edge.target);

    if (source && target && edge.particles) {
      edge.particles.forEach(particle => {
        particle._progress += particle._speed;
        if (particle._progress > 1) particle._progress = 0;

        // Interpolar posição
        particle.x = source.x + (target.x - source.x) * particle._progress;
        particle.y = source.y + (target.y - source.y) * particle._progress;

        // Fade in/out nas pontas
        const fadeZone = 0.15;
        if (particle._progress < fadeZone) {
          particle.alpha = particle._progress / fadeZone;
        } else if (particle._progress > 1 - fadeZone) {
          particle.alpha = (1 - particle._progress) / fadeZone;
        } else {
          particle.alpha = 0.8;
        }
      });
    }
  });

  // Pulso suave nos nós
  nodeGraphics.forEach((container, id) => {
    const node = nodesData.find(n => n.id === id);
    if (node && container.children[0]) {
      const glow = container.children[0];
      const pulse = Math.sin(time * 2 + node.x * 0.01) * 0.3 + 0.7;
      if (glow.visible) {
        glow.alpha = 0.15 * pulse;
      }
    }
  });
}

function drawEdges() {
  // Limpar container de edges
  edgesContainer.removeChildren();

  const edgeGraphics = new PIXI.Graphics();

  edgeData.forEach((edge) => {
    const source = nodesData.find((n) => n.id === edge.source);
    const target = nodesData.find((n) => n.id === edge.target);

    if (source && target) {
      // Glow externo
      edgeGraphics.setStrokeStyle({
        width: 4,
        color: COLORS.edge,
        alpha: 0.12,
        cap: 'round'
      });
      edgeGraphics.moveTo(source.x, source.y);
      edgeGraphics.lineTo(target.x, target.y);
      edgeGraphics.stroke();

      // Linha principal
      edgeGraphics.setStrokeStyle({
        width: 1.5,
        color: COLORS.edge,
        alpha: 0.5,
        cap: 'round'
      });
      edgeGraphics.moveTo(source.x, source.y);
      edgeGraphics.lineTo(target.x, target.y);
      edgeGraphics.stroke();
    }
  });

  edgesContainer.addChild(edgeGraphics);
}

function createFolderIcon(color, isRoot) {
  const icon = new PIXI.Graphics();
  const scale = isRoot ? 1.2 : 0.8;

  icon.setStrokeStyle({ width: 1.5, color: color, alpha: 1 });
  icon.beginFill(color, 0.3);
  icon.drawRoundedRect(-8 * scale, -4 * scale, 16 * scale, 10 * scale, 1.5 * scale);
  icon.endFill();

  icon.beginFill(color, 0.5);
  icon.drawRoundedRect(-8 * scale, -6 * scale, 8 * scale, 3 * scale, 1 * scale);
  icon.endFill();

  return icon;
}

function createFileIcon(color, isRoot) {
  const icon = new PIXI.Graphics();
  const scale = isRoot ? 1.0 : 0.7;

  const width = 10 * scale;
  const height = 12 * scale;
  const foldSize = 3 * scale;

  icon.setStrokeStyle({ width: 1.5, color: color, alpha: 1 });
  icon.beginFill(color, 0.3);
  icon.moveTo(-width/2, -height/2);
  icon.lineTo(width/2 - foldSize, -height/2);
  icon.lineTo(width/2, -height/2 + foldSize);
  icon.lineTo(width/2, height/2);
  icon.lineTo(-width/2, height/2);
  icon.lineTo(-width/2, -height/2);
  icon.fill();

  // Canto dobrado
  icon.beginFill(color, 0.6);
  icon.moveTo(width/2 - foldSize, -height/2);
  icon.lineTo(width/2 - foldSize, -height/2 + foldSize);
  icon.lineTo(width/2, -height/2 + foldSize);
  icon.lineTo(width/2 - foldSize, -height/2);
  icon.fill();

  // Linhas do texto
  icon.setStrokeStyle({ width: 1, color: color, alpha: 0.5 });
  const lineY1 = -height/2 + 5 * scale;
  const lineY2 = -height/2 + 7.5 * scale;
  icon.moveTo(-width/2 + 2 * scale, lineY1);
  icon.lineTo(width/2 - 2 * scale, lineY1);
  icon.stroke();
  icon.moveTo(-width/2 + 2 * scale, lineY2);
  icon.lineTo(width/2 - 2 * scale, lineY2);
  icon.stroke();

  return icon;
}

function createNode(node, allNodes) {
  const container = new PIXI.Container();
  container.x = node.x;
  container.y = node.y;
  container.nodeData = node;

  const isRoot = node.depth === 0;
  const isDirectory = node.type === 'directory';
  const baseRadius = isRoot ? 35 : (isDirectory ? 22 : 14);
  const color = isRoot ? COLORS.rootNode : (isDirectory ? COLORS.directory : COLORS.file);

  // Glow externo
  const outerGlow = new PIXI.Graphics();
  outerGlow.beginFill(color, 0.15);
  outerGlow.drawCircle(0, 0, baseRadius * 2.5);
  outerGlow.endFill();
  outerGlow.visible = isRoot;
  container.addChild(outerGlow);
  container._outerGlow = outerGlow;

  // Glow interno
  const innerGlow = new PIXI.Graphics();
  innerGlow.beginFill(color, 0.25);
  innerGlow.drawCircle(0, 0, baseRadius * 1.5);
  innerGlow.endFill();
  container.addChild(innerGlow);
  container._innerGlow = innerGlow;

  // Círculo principal
  const body = new PIXI.Graphics();
  body.beginFill(color, 0.5);
  body.drawCircle(0, 0, baseRadius);
  body.endFill();
  body.beginFill(0xffffff, 0.15);
  body.drawCircle(0, -baseRadius * 0.2, baseRadius * 0.7);
  body.endFill();
  body.beginFill(0xffffff, 0.6);
  body.drawCircle(0, 0, baseRadius * 0.25);
  body.endFill();
  container.addChild(body);
  container._body = body;

  // Anel dourado
  const ring = new PIXI.Graphics();
  ring.setStrokeStyle({ width: 1.5, color: COLORS.edge, alpha: 0.6 });
  ring.drawCircle(0, 0, baseRadius + 2);
  ring.stroke();
  container.addChild(ring);
  container._ring = ring;

  // Ícone
  const iconGraphic = isDirectory ? createFolderIcon(color, isRoot) : createFileIcon(color, isRoot);
  container.addChild(iconGraphic);

  // Label
  const label = new PIXI.Text({
    text: truncateName(node.name, isRoot ? 20 : 15),
    style: {
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontSize: isRoot ? 14 : 11,
      fill: COLORS.text,
      align: 'center'
    }
  });
  label.anchor.set(0.5, 0);
  label.y = baseRadius + 10;
  label.alpha = 0.8;
  container.addChild(label);
  container._label = label;

  // Badges
  if (isDirectory && node.childCount > 0) {
    const badge = createBadge(node.childCount);
    badge.x = baseRadius - 5;
    badge.y = -baseRadius + 5;
    container.addChild(badge);
  }

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

  container.on('pointerover', () => {
    container._outerGlow.visible = true;
    container._outerGlow.alpha = 0.4;
    container.scale.set(1.1);
    container._label.alpha = 1;
    container._ring.alpha = 1;
  });

  container.on('pointerout', () => {
    if (!isRoot && selectedNode?.id !== node.id) {
      container._outerGlow.visible = false;
    }
    if (selectedNode?.id !== node.id) {
      container.scale.set(1);
      container._label.alpha = 0.8;
      container._ring.alpha = 0.6;
    }
  });

  container.on('pointertap', () => {
    if (selectedNode && nodeGraphics.has(selectedNode.id)) {
      const prevContainer = nodeGraphics.get(selectedNode.id);
      const prevIsRoot = selectedNode.depth === 0;
      prevContainer.scale.set(1);
      prevContainer._outerGlow.visible = prevIsRoot;
      prevContainer._ring.alpha = 0.6;
    }

    selectedNode = node;
    container.scale.set(1.1);
    container._outerGlow.visible = true;
    container._ring.alpha = 1;
    renderDetails(node);
  });

  return container;
}

function createBadge(count) {
  const badge = new PIXI.Container();

  const bg = new PIXI.Graphics();
  bg.beginFill(0x1a1a2e, 0.9);
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
  const bgColor = isCollapsed ? 0xc9a227 : COLORS.directory;

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
  if (!app || !worldContainer) return;

  const bounds = nodesContainer.getBounds();
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  const targetX = app.renderer.width / 2;
  const targetY = app.renderer.height / 2;

  worldContainer.position.x += targetX - contentCenterX;
  worldContainer.position.y += targetY - contentCenterY;
}

function applyZoom(targetZoom, anchor) {
  if (!app || !worldContainer) return;

  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
  const zoomAnchor = anchor ?? new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
  const worldPosition = worldContainer.toLocal(zoomAnchor);

  worldContainer.scale.set(clampedZoom);
  const newScreenPosition = worldContainer.toGlobal(worldPosition);
  worldContainer.position.x += zoomAnchor.x - newScreenPosition.x;
  worldContainer.position.y += zoomAnchor.y - newScreenPosition.y;

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

    worldContainer.position.x += dx;
    worldContainer.position.y += dy;

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
  type.textContent = node.type === 'directory' ? 'PASTA' : 'ARQUIVO';
  const path = document.createElement('p');
  path.className = 'path';
  path.textContent = node.id;

  details.appendChild(title);
  details.appendChild(type);
  details.appendChild(path);

  if (node.type === 'directory') {
    const hiddenDirs = node.hiddenDirsCount || 0;
    const hiddenFiles = node.hiddenFilesCount || 0;

    if (node.collapsed && (hiddenDirs > 0 || hiddenFiles > 0)) {
      const collapsedInfo = document.createElement('p');
      collapsedInfo.style.color = '#c9a227';
      collapsedInfo.style.fontSize = '12px';
      collapsedInfo.style.marginTop = '8px';
      const parts = [];
      if (hiddenDirs > 0) parts.push(`${hiddenDirs} pastas`);
      if (hiddenFiles > 0) parts.push(`${hiddenFiles} arquivos`);
      collapsedInfo.textContent = `Contém: ${parts.join(', ')}`;
      details.appendChild(collapsedInfo);
    } else if (hiddenFiles > 0) {
      const hiddenInfo = document.createElement('p');
      hiddenInfo.style.color = '#6488a8';
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
