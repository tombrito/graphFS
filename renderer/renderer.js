import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';

const pixiContainer = document.getElementById('pixi-container');
const rootPathLabel = document.getElementById('root-path');
const treeView = document.getElementById('tree-view');
const details = document.getElementById('details');
const fallbackBadge = document.getElementById('fallback-badge');

let app;
let currentZoom = 0.85;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
let selectedNode = null;

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
  layoutNodes(nodes);
  await buildPixiApp(nodes, edges);
  setupZoomControls();
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
    parentId
  };
  nodes.push(current);

  if (parentId) {
    edges.push({ source: parentId, target: current.id });
  }

  if (node.children) {
    node.children.forEach((child) => flattenTree(child, current.id, depth + 1, nodes, edges));
  }
}

function layoutNodes(nodes) {
  const levelOffsets = new Map();
  nodes.forEach((node) => {
    const count = levelOffsets.get(node.depth) || 0;
    levelOffsets.set(node.depth, count + 1);
    node.x = 140 + node.depth * 180;
    node.y = 60 + count * 80;
  });
}

async function buildPixiApp(nodes, edges) {
  app = new PIXI.Application();
  const { width, height } = pixiContainer.getBoundingClientRect();
  await app.init({
    width: Math.max(width, 600),
    height: Math.max(height, 400),
    background: '#0b1220',
    antialias: true,
    resolution: window.devicePixelRatio || 1
  });

  pixiContainer.innerHTML = '';
  pixiContainer.appendChild(app.canvas);

  const edgeLayer = new PIXI.Graphics();
  edgeLayer.lineStyle({ width: 1, color: 0x1f2937 });
  edges.forEach((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (source && target) {
      edgeLayer.moveTo(source.x, source.y);
      edgeLayer.lineTo(target.x, target.y);
    }
  });
  app.stage.addChild(edgeLayer);

  nodes.forEach((node) => {
    const circle = new PIXI.Graphics();
    const color = node.type === 'directory' ? 0x38bdf8 : 0x60a5fa;
    circle.beginFill(color, 0.9);
    circle.drawCircle(0, 0, 16);
    circle.endFill();
    circle.x = node.x;
    circle.y = node.y;
    circle.eventMode = 'static';
    circle.cursor = 'pointer';
    circle.nodeId = node.id;

    circle.on('pointertap', () => {
      const current = nodes.find((n) => n.id === node.id);
      selectedNode = current;
      renderDetails(current);
    });

    const label = new PIXI.Text({
      text: node.name,
      style: {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: '#e5e7eb'
      }
    });
    label.x = node.x + 20;
    label.y = node.y - 8;

    app.stage.addChild(circle);
    app.stage.addChild(label);
  });

  applyZoom(currentZoom, new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2));
}

function applyZoom(targetZoom, anchor) {
  if (!app) return;

  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
  const zoomAnchor = anchor ?? new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
  const worldPosition = app.stage.toLocal(zoomAnchor);

  app.stage.scale.set(clampedZoom);
  const newScreenPosition = app.stage.toGlobal(worldPosition);
  app.stage.position.x += zoomAnchor.x - newScreenPosition.x;
  app.stage.position.y += zoomAnchor.y - newScreenPosition.y;
  currentZoom = clampedZoom;
}

function setupZoomControls() {
  pixiContainer.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const rect = pixiContainer.getBoundingClientRect();
      const pointer = new PIXI.Point(event.clientX - rect.left, event.clientY - rect.top);
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * 0.12;
      applyZoom(currentZoom * factor, pointer);
    },
    { passive: false }
  );
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

