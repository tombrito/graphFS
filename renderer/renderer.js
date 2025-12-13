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
const btnScanUser = document.getElementById('btn-scan-user');
const btnScanDrive = document.getElementById('btn-scan-drive');
const scanStatus = document.getElementById('scan-status');
const scanModal = document.getElementById('scan-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

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

/**
 * Atualiza o grafo com uma nova árvore de arquivos.
 * Limpa o grafo existente e renderiza a nova árvore.
 */
async function updateGraph(tree, rootPath) {
  // Limpa o grafo existente
  state.nodesContainer.removeChildren();
  state.particlesContainer.removeChildren();
  state.edgesContainer.removeChildren();
  state.nodeGraphics.clear();
  state.selectedNode = null;

  // Processa nova árvore
  const nodes = [];
  const edges = [];
  flattenTree(tree, null, 0, nodes, edges);
  layoutNodesRadial(tree, nodes);
  updateMtimeRange(nodes);

  state.nodesData = nodes;
  state.edgeData = edges;

  // Atualiza UI
  rootPathLabel.textContent = rootPath;
  renderTree(treeView, tree);
  details.innerHTML = '<p>Selecione um item no grafo para ver detalhes.</p>';

  // Cria edges e partículas
  edges.forEach((edge) => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (source && target) {
      createEdgeParticles(edge, source, target, state.particlesContainer);
    }
  });

  // Cria nodes
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

/**
 * Configura os botões de scan
 */
function setupScanButtons() {
  let isScanning = false;

  const setScanning = (scanning, message = '') => {
    isScanning = scanning;
    btnScanUser.disabled = scanning;
    btnScanDrive.disabled = scanning;
    scanStatus.textContent = message;
    scanStatus.className = 'scan-status';
  };

  const showModal = (title, content, isError = false) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modalBody.className = isError ? 'modal-body-error' : 'modal-body-success';
    scanModal.hidden = false;
  };

  const hideModal = () => {
    scanModal.hidden = true;
  };

  // Fechar modal ao clicar no botão ou fora
  modalClose.addEventListener('click', hideModal);
  scanModal.addEventListener('click', (e) => {
    if (e.target === scanModal) hideModal();
  });

  // Botão: Escanear pasta do usuário
  btnScanUser.addEventListener('click', async () => {
    if (isScanning) return;

    setScanning(true, 'Escaneando pasta do usuário...');
    fallbackBadge.hidden = true;
    btnScanUser.textContent = 'Escaneando...';

    try {
      console.log('[Scan] Iniciando scan da pasta do usuário...');
      const result = await window.graphfs.searchEngines.scanUser();
      console.log('[Scan] Resultado:', result);

      if (result.success) {
        await updateGraph(result.tree, result.rootPath);
        const totalItems = result.stats?.totalItems || 0;
        showModal(
          'Scan Concluído',
          `<p class="stat-label">Itens encontrados</p>
           <p class="stat">${totalItems}</p>
           <p class="path">${result.rootPath}</p>`,
          false
        );
      } else {
        showModal('Erro no Scan', `<p>${result.error || 'Erro desconhecido'}</p>`, true);
        console.error('[Scan] Erro:', result.error);
      }
    } catch (error) {
      showModal('Erro no Scan', `<p>${error.message}</p>`, true);
      console.error('[Scan] Exceção:', error);
    } finally {
      setScanning(false, '');
      btnScanUser.textContent = 'Escanear Pasta do Usuário';
    }
  });

  // Botão: Escanear C:
  btnScanDrive.addEventListener('click', async () => {
    if (isScanning) return;

    setScanning(true, 'Escaneando C:...');
    fallbackBadge.hidden = true;
    btnScanDrive.textContent = 'Escaneando...';

    try {
      console.log('[Scan] Iniciando scan de C:...');
      const result = await window.graphfs.searchEngines.scanDrive('C:');
      console.log('[Scan] Resultado:', result);

      if (result.success) {
        await updateGraph(result.tree, result.rootPath);
        const totalItems = result.stats?.totalItems || 0;
        showModal(
          'Scan Concluído',
          `<p class="stat-label">Itens encontrados</p>
           <p class="stat">${totalItems}</p>
           <p class="path">${result.rootPath}</p>`,
          false
        );
      } else {
        showModal('Erro no Scan', `<p>${result.error || 'Erro desconhecido'}</p>`, true);
        console.error('[Scan] Erro:', result.error);
      }
    } catch (error) {
      showModal('Erro no Scan', `<p>${error.message}</p>`, true);
      console.error('[Scan] Exceção:', error);
    } finally {
      setScanning(false, '');
      btnScanDrive.textContent = 'Escanear C:';
    }
  });
}

bootstrap();
setupScanButtons();
