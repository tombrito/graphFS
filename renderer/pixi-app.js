import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';
import { COLORS } from './colors.js';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

export async function createPixiApp(pixiContainer) {
  const app = new PIXI.Application();
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
  const worldContainer = new PIXI.Container();
  const starsContainer = new PIXI.Container();
  const nebulaContainer = new PIXI.Container();
  const edgesContainer = new PIXI.Container();
  const particlesContainer = new PIXI.Container();
  const nodesContainer = new PIXI.Container();

  app.stage.addChild(worldContainer);
  worldContainer.addChild(starsContainer);
  worldContainer.addChild(nebulaContainer);
  worldContainer.addChild(edgesContainer);
  worldContainer.addChild(particlesContainer);
  worldContainer.addChild(nodesContainer);

  return {
    app,
    worldContainer,
    starsContainer,
    nebulaContainer,
    edgesContainer,
    particlesContainer,
    nodesContainer
  };
}

export function centerGraphInView(app, worldContainer, nodesContainer) {
  if (!app || !worldContainer) return;

  const bounds = nodesContainer.getBounds();
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  const targetX = app.renderer.width / 2;
  const targetY = app.renderer.height / 2;

  worldContainer.position.x += targetX - contentCenterX;
  worldContainer.position.y += targetY - contentCenterY;
}

export function applyZoom(app, worldContainer, targetZoom, anchor, currentZoom) {
  if (!app || !worldContainer) return currentZoom;

  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
  const zoomAnchor = anchor ?? new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
  const worldPosition = worldContainer.toLocal(zoomAnchor);

  worldContainer.scale.set(clampedZoom);
  const newScreenPosition = worldContainer.toGlobal(worldPosition);
  worldContainer.position.x += zoomAnchor.x - newScreenPosition.x;
  worldContainer.position.y += zoomAnchor.y - newScreenPosition.y;

  return clampedZoom;
}

export function setupZoomControls(pixiContainer, app, worldContainer, getZoom, setZoom) {
  pixiContainer.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const centerPoint = new PIXI.Point(app.renderer.width / 2, app.renderer.height / 2);
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = 1 + direction * 0.12;
      const newZoom = applyZoom(app, worldContainer, getZoom() * factor, centerPoint, getZoom());
      setZoom(newZoom);
    },
    { passive: false }
  );
}

export function setupPanControls(pixiContainer, worldContainer) {
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
