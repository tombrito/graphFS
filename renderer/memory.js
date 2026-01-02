// Funções de gerenciamento de memória para PixiJS

import { state } from './state.js';

/**
 * Destrói um objeto PixiJS e todos os seus filhos recursivamente
 */
export function deepDestroy(obj) {
  if (!obj) return;

  // Primeiro destrói os filhos recursivamente
  if (obj.children) {
    while (obj.children.length > 0) {
      deepDestroy(obj.children[0]);
    }
  }

  // Remove event listeners
  if (obj.removeAllListeners) {
    obj.removeAllListeners();
  }

  // Limpa referências customizadas
  obj.nodeData = null;
  obj._outerGlow = null;
  obj._innerGlow = null;
  obj._body = null;
  obj._ring = null;
  obj._label = null;

  // Remove do pai
  if (obj.parent) {
    obj.parent.removeChild(obj);
  }

  // Destrói o objeto (texturas incluídas para Text)
  if (obj.destroy) {
    obj.destroy({ children: false, texture: true, baseTexture: false });
  }
}

/**
 * Remove e destrói todos os filhos de um container PixiJS para liberar memória
 */
export function destroyChildren(container) {
  while (container.children.length > 0) {
    deepDestroy(container.children[0]);
  }
}

/**
 * Limpa caches de GPU do PixiJS para liberar memória
 */
export function cleanupGpuResources() {
  if (!state.app?.renderer) return;

  const renderer = state.app.renderer;

  // Limpa cache de texturas
  if (renderer.textureGC) {
    renderer.textureGC.run();
  }

  // Limpa contextos de Graphics (o principal vilão!)
  if (renderer.graphicsContext) {
    // Força limpeza do cache de contextos
    if (renderer.graphicsContext._gpuContextHash) {
      renderer.graphicsContext._gpuContextHash = {};
    }
  }

  // Reset geral do renderer
  if (renderer.reset) {
    renderer.reset();
  }
}

/**
 * Inicia a limpeza periódica de GPU para sessões longas
 */
export function startPeriodicGpuCleanup(intervalMs = 60000) {
  setInterval(() => {
    if (state.app?.renderer?.textureGC) {
      state.app.renderer.textureGC.run();
    }
  }, intervalMs);
}
