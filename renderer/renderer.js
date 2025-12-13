// Orquestrador principal - importa e coordena os módulos

import { COLORS, updateMtimeRange } from './colors.js';
import { flattenTree, layoutNodesForce } from './graph-layout.js';
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

/**
 * Mostra/esconde o indicador de loading inicial
 */
function setInitialLoading(loading, message = 'Carregando...') {
  scanStatus.textContent = loading ? message : '';
  btnScanUser.disabled = loading;
  btnScanDrive.disabled = loading;
}

async function bootstrap() {
  // Inicializa o PixiJS primeiro (sem dados)
  await initPixiApp();

  // Tenta carregar o último scan salvo
  console.log('[Bootstrap] Tentando carregar último scan...');
  setInitialLoading(true, 'Carregando último scan...');

  const lastScan = await window.graphfs.scan.loadLast();

  if (lastScan.success && lastScan.tree) {
    console.log('[Bootstrap] Último scan encontrado:', lastScan.rootPath);
    await renderGraphFromScan(lastScan);
    setInitialLoading(false);
  } else {
    // Não há scan anterior - faz scan automático da pasta do usuário
    console.log('[Bootstrap] Nenhum scan anterior. Iniciando scan automático...');
    setInitialLoading(true, 'Escaneando pasta do usuário...');

    try {
      const result = await window.graphfs.searchEngines.scanUser();

      if (result.success) {
        await renderGraphFromScan(result);
        console.log('[Bootstrap] Scan inicial concluído:', result.stats?.totalFiles || 0, 'arquivos');
      } else {
        console.error('[Bootstrap] Erro no scan inicial:', result.error);
        renderNotice(details, `Erro ao escanear: ${result.error}`);
      }
    } catch (error) {
      console.error('[Bootstrap] Exceção no scan inicial:', error);
      renderNotice(details, `Erro ao escanear: ${error.message}`);
    }

    setInitialLoading(false);
  }

  // Setup controles
  setupZoomControls(
    pixiContainer,
    state.app,
    state.worldContainer,
    () => state.currentZoom,
    (z) => { state.currentZoom = z; }
  );
  setupPanControls(pixiContainer, state.worldContainer);

  // Iniciar loop de animação
  state.app.ticker.add(createAnimationLoop(state));

  // Setup controles de animação
  setupAnimationControls(state);
}

/**
 * Inicializa o PixiJS (containers vazios)
 */
async function initPixiApp() {
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
}

/**
 * Renderiza o grafo a partir de um resultado de scan
 */
async function renderGraphFromScan(scanResult) {
  const { tree, rootPath } = scanResult;

  // Limpa containers existentes
  state.nodesContainer.removeChildren();
  state.particlesContainer.removeChildren();
  state.edgesContainer.removeChildren();
  state.nodeGraphics.clear();
  state.selectedNode = null;

  // Processa árvore
  const nodes = [];
  const edges = [];
  flattenTree(tree, null, 0, nodes, edges);
  layoutNodesForce(tree, nodes, edges);
  updateMtimeRange(nodes);

  state.nodesData = nodes;
  state.edgeData = edges;

  // Atualiza UI
  rootPathLabel.textContent = rootPath;
  fallbackBadge.hidden = true;
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
        await renderGraphFromScan(result);
        const totalFiles = result.stats?.totalFiles || 0;
        showModal(
          'Scan Concluído',
          `<p class="stat-label">Arquivos encontrados</p>
           <p class="stat">${totalFiles}</p>
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
        await renderGraphFromScan(result);
        const totalFiles = result.stats?.totalFiles || 0;
        showModal(
          'Scan Concluído',
          `<p class="stat-label">Arquivos encontrados</p>
           <p class="stat">${totalFiles}</p>
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
