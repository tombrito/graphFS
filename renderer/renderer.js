// Orquestrador principal - importa e coordena os módulos

import { COLORS, updateMtimeRange } from './colors.js';
import { flattenTree, layoutNodesForce } from './graph-layout.js';
import { createNode } from './nodes.js';
import { config } from './config.js';
import { createStarfield, createNebula, createEdgeParticles, animateEntrance, createAnimationLoop, resetEdgeGraphicsCache, animateOpenFeedback } from './effects.js';
import { createPixiApp, centerGraphInView, applyZoom, setupZoomControls, setupPanControls } from './pixi-app.js';
import { renderNotice, renderDetails, renderTree, setupAnimationControls } from './ui.js';

// Novos módulos extraídos
import { state, filterConfig, resetPathCaches, getPathToRoot } from './state.js';
import { deepDestroy, destroyChildren, cleanupGpuResources, startPeriodicGpuCleanup } from './memory.js';
import { filterTree } from './tree-filter.js';
import { toggleDirectory, expandPlaceholder, setupExpansionDependencies } from './node-expansion.js';

// Elementos do DOM
const pixiContainer = document.getElementById('pixi-container');
const rootPathLabel = document.getElementById('root-path');
const treeView = document.getElementById('tree-view');
const details = document.getElementById('details');
const fallbackBadge = document.getElementById('fallback-badge');
const btnScanUser = document.getElementById('btn-scan-user');
const btnScanDrive = document.getElementById('btn-scan-drive');
const scanStatus = document.getElementById('scan-status');
const maxFilesInput = document.getElementById('max-files-input');
const scanModal = document.getElementById('scan-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const btnFullscreen = document.getElementById('btn-fullscreen');

/**
 * Mostra/esconde o indicador de loading inicial
 */
function setInitialLoading(loading, message = 'Carregando...') {
  scanStatus.textContent = loading ? message : '';
  btnScanUser.disabled = loading;
  btnScanDrive.disabled = loading;
}

async function bootstrap() {
  // Configura dependências do módulo de expansão
  setupExpansionDependencies(details, renderDetails);

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
      const result = await window.graphfs.searchEngines.scanUser({ topFiles: getTopFiles() });

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

  // Double-click para abrir arquivos/diretórios
  pixiContainer.addEventListener('dblclick', async (event) => {
    event.preventDefault();
    const rect = pixiContainer.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    for (const [nodeId, container] of state.nodeGraphics) {
      const bounds = container.getBounds();
      if (
        mouseX >= bounds.x &&
        mouseX <= bounds.x + bounds.width &&
        mouseY >= bounds.y &&
        mouseY <= bounds.y + bounds.height
      ) {
        const node = container.nodeData;
        if (node.type === 'more-dirs' || node.type === 'more-files') {
          return;
        }
        if (node.path) {
          animateOpenFeedback(container);
          const result = await window.graphfs.shell.openPath(node.path);
          if (!result.success) {
            console.error('[DoubleClick] Erro ao abrir:', node.path, result.error);
          }
        }
        return;
      }
    }
  });

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
 * Aplica os filtros atuais e re-renderiza o grafo
 */
async function applyFiltersAndRender() {
  if (!state.originalTree) return;

  const filteredTree = filterTree(
    state.originalTree,
    filterConfig.timePeriod,
    filterConfig.itemsPerDir
  );
  await renderGraphFromTree(filteredTree, state.originalRootPath);
}

/**
 * Renderiza o grafo a partir de uma árvore processada
 */
async function renderGraphFromTree(tree, rootPath) {
  // Limpa containers existentes (destruindo objetos para liberar memória)
  destroyChildren(state.nodesContainer);
  destroyChildren(state.particlesContainer);
  destroyChildren(state.edgesContainer);
  state.nodeGraphics.clear();
  state.selectedNode = null;
  state.activePathEdgeIds = new Set();
  state.collapsedNodes.clear(); // Limpa nós colapsados - ficam inválidos após mudança de filtro
  resetEdgeGraphicsCache();
  resetPathCaches();

  // Limpa caches de GPU do PixiJS
  cleanupGpuResources();

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
        state.activePathEdgeIds = getPathToRoot(n, state.edgeData, state.nodesData);
        renderDetails(details, n);
      },
      expandPlaceholder,
      toggleDirectory
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
 * Renderiza o grafo a partir de um resultado de scan
 */
async function renderGraphFromScan(scanResult) {
  const { tree, rootPath } = scanResult;

  // Guarda dados originais para re-aplicar filtros depois
  state.originalTree = tree;
  state.originalRootPath = rootPath;

  // Aplica filtros e renderiza
  const filteredTree = filterTree(tree, filterConfig.timePeriod, filterConfig.itemsPerDir);
  await renderGraphFromTree(filteredTree, rootPath);
}


/**
 * Obtém o valor de topFiles do input
 */
function getTopFiles() {
  const value = parseInt(maxFilesInput?.value, 10);
  return (!isNaN(value) && value >= 10) ? value : 50;
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
    maxFilesInput.disabled = scanning;
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

  // Helper para executar scan com UI feedback
  async function performScan(scanFn, label, btn, btnResetText) {
    if (isScanning) return;

    setScanning(true, `Escaneando ${label}...`);
    fallbackBadge.hidden = true;
    btn.textContent = 'Escaneando...';

    try {
      const topFiles = getTopFiles();
      console.log(`[Scan] Iniciando scan de ${label}... (topFiles:`, topFiles, ')');
      const result = await scanFn(topFiles);
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
      btn.textContent = btnResetText;
    }
  }

  // Botão: Escanear pasta do usuário
  btnScanUser.addEventListener('click', () => performScan(
    (topFiles) => window.graphfs.searchEngines.scanUser({ topFiles }),
    'pasta do usuário',
    btnScanUser,
    'Escanear Pasta do Usuário'
  ));

  // Botão: Escanear C:
  btnScanDrive.addEventListener('click', () => performScan(
    (topFiles) => window.graphfs.searchEngines.scanDrive('C:', { topFiles }),
    'C:',
    btnScanDrive,
    'Escanear C:'
  ));
}

/**
 * Configura o modo fullscreen do grafo
 */
function setupFullscreen() {
  const updateButtonIcon = (isFullscreen) => {
    if (isFullscreen) {
      btnFullscreen.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
        </svg>
      `;
      btnFullscreen.title = 'Sair da tela cheia (ESC)';
    } else {
      btnFullscreen.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
        </svg>
      `;
      btnFullscreen.title = 'Tela cheia (ESC para sair)';
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await pixiContainer.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  // Clique no botão
  btnFullscreen.addEventListener('click', toggleFullscreen);

  // Detecta mudanças de fullscreen (incluindo ESC do browser)
  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    updateButtonIcon(isFullscreen);

    // Redimensiona o canvas do PixiJS
    if (state.app) {
      setTimeout(() => {
        const rect = pixiContainer.getBoundingClientRect();
        state.app.renderer.resize(rect.width, rect.height);
      }, 100);
    }
  });
}

/**
 * Configura o controle de caracteres máximos no label
 */
function setupLabelCharsControl() {
  const slider = document.getElementById('label-max-chars');
  const valueDisplay = document.getElementById('label-max-chars-value');

  if (!slider || !valueDisplay) return;

  // Inicializa com o valor da config
  slider.value = config.label.MAX_CHARS_NODE;
  valueDisplay.textContent = config.label.MAX_CHARS_NODE;

  slider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    valueDisplay.textContent = value;

    // Atualiza a configuração (root fica 33% maior que nodes)
    config.label.MAX_CHARS_NODE = value;
    config.label.MAX_CHARS_ROOT = Math.round(value * 1.33);

    // Recria os nós em tempo real
    recreateNodes();
  });
}

/**
 * Configura os controles de filtro (período de tempo e itens por pasta)
 */
function setupFilterControls() {
  const timeFilterContainer = document.getElementById('time-filter');
  const itemsSlider = document.getElementById('items-per-dir');
  const itemsValue = document.getElementById('items-per-dir-value');

  if (!timeFilterContainer || !itemsSlider || !itemsValue) return;

  // Inicializa valores
  itemsSlider.value = filterConfig.itemsPerDir;
  itemsValue.textContent = filterConfig.itemsPerDir;

  // Botões de período de tempo
  timeFilterContainer.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    // Atualiza visual dos botões
    timeFilterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Atualiza filtro e re-renderiza
    const period = parseInt(button.dataset.period, 10);
    filterConfig.timePeriod = period;
    applyFiltersAndRender();
  });

  // Slider de itens por pasta
  itemsSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    itemsValue.textContent = value;
    filterConfig.itemsPerDir = value;
    applyFiltersAndRender();
  });
}

/**
 * Recria os nós visuais com a configuração atual
 */
function recreateNodes() {
  if (state.nodesData.length === 0) return;

  // Limpa nós existentes (destruindo para liberar memória)
  destroyChildren(state.nodesContainer);
  state.nodeGraphics.clear();

  // Limpa caches de GPU do PixiJS
  cleanupGpuResources();

  // Recria todos os nós
  state.nodesData.forEach((node) => {
    const nodeContainer = createNode(
      node,
      state.nodesData,
      state.nodeGraphics,
      () => state.selectedNode,
      (n) => {
        state.selectedNode = n;
        state.activePathEdgeIds = getPathToRoot(n, state.edgeData, state.nodesData);
        renderDetails(details, n);
      },
      expandPlaceholder,
      toggleDirectory
    );
    state.nodesContainer.addChild(nodeContainer);
    state.nodeGraphics.set(node.id, nodeContainer);
  });
}

bootstrap();
setupScanButtons();
setupFullscreen();
setupLabelCharsControl();
setupFilterControls();

// Monitor de memória na UI
const memoryBadge = document.getElementById('memory-badge');

async function updateMemoryDisplay() {
  if (!memoryBadge) return;
  try {
    const usage = await window.graphfs.getMemoryUsage();
    const totalMB = usage.total / 1024 / 1024;
    memoryBadge.textContent = `${totalMB.toFixed(0)} MB`;
    if (totalMB > 800) {
      memoryBadge.classList.add('warning');
    } else {
      memoryBadge.classList.remove('warning');
    }
  } catch (e) {
    memoryBadge.textContent = '-- MB';
  }
}

setInterval(updateMemoryDisplay, 5000);
updateMemoryDisplay();

// Limpeza periódica de GPU para sessões longas
startPeriodicGpuCleanup(60000);
