// Orquestrador principal - importa e coordena os módulos

import { COLORS, updateMtimeRange } from './colors.js';
import { flattenTree, layoutNodesRadial } from './graph-layout.js';
import { createNode } from './nodes.js';
import { createStarfield, createNebula, createEdgeParticles, animateEntrance, createAnimationLoop } from './effects.js';
import { createPixiApp, centerGraphInView, applyZoom, setupZoomControls, setupPanControls } from './pixi-app.js';
import { renderNotice, renderDetails, renderTree, setupAnimationControls } from './ui.js';

// Elementos do DOM
const pixiContainer = document.getElementById('pixi-container');
const rootPathLabel = document.getElementById('root-path');
const treeView = document.getElementById('tree-view');
const details = document.getElementById('details');
const fallbackBadge = document.getElementById('fallback-badge');

// Estado global da aplicação
const state = {
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
  time: 0,
  bgAnimEnabled: true,
  lineAnimEnabled: true
};

async function bootstrap() {
  const { tree, rootPath, fallbackUsed, error } = await window.graphfs.getFilesystemTree();
  rootPathLabel.textContent = rootPath;

  if (fallbackUsed) {
    fallbackBadge.hidden = false;
    if (error) {
      renderNotice(details, `Usando dados de demonstração porque não foi possível ler ${rootPath}: ${error}`);
    }
  }

  const nodes = [];
  const edges = [];
  flattenTree(tree, null, 0, nodes, edges);
  layoutNodesRadial(tree, nodes);

  // Calcular min/max mtime para normalização
  updateMtimeRange(nodes);

  state.nodesData = nodes;
  state.edgeData = edges;

  await buildPixiApp(nodes, edges);
  setupZoomControls(
    pixiContainer,
    state.app,
    state.worldContainer,
    () => state.currentZoom,
    (z) => { state.currentZoom = z; }
  );
  setupPanControls(pixiContainer, state.worldContainer);
  renderTree(treeView, tree);

  // Iniciar loop de animação
  state.app.ticker.add(createAnimationLoop(state));

  // Setup controles de animação
  setupAnimationControls(state);
}

async function buildPixiApp(nodes, edges) {
  const pixiSetup = await createPixiApp(pixiContainer);

  state.app = pixiSetup.app;
  state.worldContainer = pixiSetup.worldContainer;
  state.starsContainer = pixiSetup.starsContainer;
  state.nebulaContainer = pixiSetup.nebulaContainer;
  state.edgesContainer = pixiSetup.edgesContainer;
  state.particlesContainer = pixiSetup.particlesContainer;
  state.nodesContainer = pixiSetup.nodesContainer;

  // Criar efeitos de fundo
  createStarfield(state.app, state.starsContainer);
  createNebula(state.app, state.nebulaContainer);

  // Criar edges e partículas
  edges.forEach((edge) => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (source && target) {
      createEdgeParticles(edge, source, target, state.particlesContainer);
    }
  });

  // Criar nodes
  nodes.forEach((node) => {
    const nodeContainer = createNode(
      node,
      nodes,
      state.nodeGraphics,
      () => state.selectedNode,
      (n) => {
        state.selectedNode = n;
        renderDetails(details, n);
      }
    );
    state.nodesContainer.addChild(nodeContainer);
    state.nodeGraphics.set(node.id, nodeContainer);
  });

  centerGraphInView(state.app, state.worldContainer, state.nodesContainer);
  state.currentZoom = applyZoom(
    state.app,
    state.worldContainer,
    state.currentZoom,
    null,
    state.currentZoom
  );

  animateEntrance(nodes, state.nodeGraphics);
}

bootstrap();
