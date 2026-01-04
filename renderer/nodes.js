import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';
import { COLORS } from './colors.js';
import { config, getDisplayName } from './config.js';

export function createFolderIcon(color, isRoot) {
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

export function createFileIcon(color, isRoot) {
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

export function createMoreIcon(color) {
  const icon = new PIXI.Graphics();
  const dotRadius = 1.5;
  const spacing = 4;

  // Três pontinhos horizontais
  icon.beginFill(color, 0.8);
  icon.drawCircle(-spacing, 0, dotRadius);
  icon.drawCircle(0, 0, dotRadius);
  icon.drawCircle(spacing, 0, dotRadius);
  icon.endFill();

  return icon;
}

export function createBadge(count) {
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
    },
    resolution: 3
  });
  text.anchor.set(0.5);
  badge.addChild(text);

  return badge;
}

// truncateName movido para config.js como função compartilhada

/**
 * Atualiza a posição do label dentro do container baseado no novo labelAngle.
 * Deve ser chamado sempre que node.labelAngle mudar (ex: após relayout).
 */
export function updateLabelPosition(container, node) {
  const labelContainer = container._label;
  if (!labelContainer) return;

  const isRoot = node.depth === 0;
  const isMoreNode = node.type === 'more-dirs' || node.type === 'more-files';
  const isDirectory = node.type === 'directory';

  const baseRadius = isRoot ? config.nodeSize.ROOT :
                     (isDirectory ? config.nodeSize.DIRECTORY :
                     (isMoreNode ? config.nodeSize.MORE : config.nodeSize.FILE));

  const labelDistance = baseRadius + config.label.DISTANCE;
  const padding = config.label.PADDING;

  // Pega as dimensões do texto atual
  const labelText = labelContainer.children[1]; // O texto é o segundo filho (após o bg)
  if (!labelText) return;

  let anchorX = 0.5, anchorY = 0.5;

  if (isRoot) {
    anchorX = 0.5;
    anchorY = 0;
    labelContainer.x = 0;
    labelContainer.y = labelDistance;
  } else {
    const labelAngle = node.labelAngle !== undefined ? node.labelAngle : Math.PI / 2;
    const normalizedAngle = ((labelAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    labelContainer.x = Math.cos(labelAngle) * labelDistance;
    labelContainer.y = Math.sin(labelAngle) * labelDistance;

    if (normalizedAngle < Math.PI / 4 || normalizedAngle > Math.PI * 7 / 4) {
      anchorX = 0; anchorY = 0.5;
    } else if (normalizedAngle < Math.PI * 3 / 4) {
      anchorX = 0.5; anchorY = 0;
    } else if (normalizedAngle < Math.PI * 5 / 4) {
      anchorX = 1; anchorY = 0.5;
    } else {
      anchorX = 0.5; anchorY = 1;
    }
  }

  // Atualiza o pivot
  labelContainer.pivot.x = (labelText.width + padding.x * 2) * anchorX - padding.x;
  labelContainer.pivot.y = (labelText.height + padding.y * 2) * anchorY - padding.y;
}

export function createNode(node, allNodes, nodeGraphics, selectedNode, renderDetails, onExpandPlaceholder = null, onToggleDirectory = null) {
  const container = new PIXI.Container();
  container.x = node.x;
  container.y = node.y;
  container.nodeData = node;

  const isRoot = node.depth === 0;
  const isDirectory = node.type === 'directory';
  const isMoreDirs = node.type === 'more-dirs';
  const isMoreFiles = node.type === 'more-files';
  const isMoreNode = isMoreDirs || isMoreFiles;
  const isExpandedItem = node.isExpandedItem === true; // Nó que veio de expansão (estilo muted)

  const baseRadius = isRoot ? config.nodeSize.ROOT :
                     (isDirectory ? config.nodeSize.DIRECTORY :
                     (isMoreNode ? config.nodeSize.MORE : config.nodeSize.FILE));
  const color = isRoot ? COLORS.rootNode :
                (isDirectory ? COLORS.directory :
                (isMoreDirs ? COLORS.moreDirs :
                (isMoreFiles ? COLORS.moreFiles : COLORS.file)));

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
  if (isMoreNode || isExpandedItem) {
    // Nós "more" e nós expandidos são mais discretos e vazados
    body.beginFill(color, isExpandedItem ? 0.25 : 0.15);
    body.drawCircle(0, 0, baseRadius);
    body.endFill();
    // Nós expandidos tem um leve brilho central
    if (isExpandedItem) {
      body.beginFill(0xffffff, 0.1);
      body.drawCircle(0, 0, baseRadius * 0.4);
      body.endFill();
    }
  } else {
    body.beginFill(color, 0.5);
    body.drawCircle(0, 0, baseRadius);
    body.endFill();
    body.beginFill(0xffffff, 0.15);
    body.drawCircle(0, -baseRadius * 0.2, baseRadius * 0.7);
    body.endFill();
    body.beginFill(0xffffff, 0.6);
    body.drawCircle(0, 0, baseRadius * 0.25);
    body.endFill();
  }
  container.addChild(body);
  container._body = body;

  // Anel (borda pontilhada para nós "more", semi-transparente para expandidos)
  const ring = new PIXI.Graphics();
  if (isMoreNode) {
    // Borda pontilhada para nós "more"
    ring.setStrokeStyle({ width: 1.5, color: color, alpha: 0.5 });
    const steps = 12;
    for (let i = 0; i < steps; i += 2) {
      const angle1 = (i / steps) * Math.PI * 2;
      const angle2 = ((i + 1) / steps) * Math.PI * 2;
      const radius = baseRadius + 2;
      ring.moveTo(Math.cos(angle1) * radius, Math.sin(angle1) * radius);
      ring.lineTo(Math.cos(angle2) * radius, Math.sin(angle2) * radius);
    }
    ring.stroke();
  } else if (isExpandedItem) {
    // Borda semi-transparente para nós expandidos
    ring.setStrokeStyle({ width: 1, color: color, alpha: 0.4 });
    ring.drawCircle(0, 0, baseRadius + 2);
    ring.stroke();
  } else {
    ring.setStrokeStyle({ width: 1.5, color: COLORS.edge, alpha: 0.6 });
    ring.drawCircle(0, 0, baseRadius + 2);
    ring.stroke();
  }
  container.addChild(ring);
  container._ring = ring;

  // Ícone
  const iconGraphic = isMoreNode ? createMoreIcon(color) :
                      (isDirectory ? createFolderIcon(color, isRoot) : createFileIcon(color, isRoot));
  container.addChild(iconGraphic);

  // Label - posicionado para fora do centro do grafo
  const labelContainer = new PIXI.Container();

  const isMutedStyle = isMoreNode || isExpandedItem;
  const label = new PIXI.Text({
    text: getDisplayName(node),  // Usa função compartilhada para truncamento consistente
    style: {
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontSize: isRoot ? 14 : (isMutedStyle ? 10 : 11),
      fill: isMutedStyle ? COLORS.textMuted : COLORS.text,
      align: 'center',
      fontStyle: isMutedStyle ? 'italic' : 'normal'
    },
    resolution: 3
  });

  // Fundo escuro para legibilidade
  const padding = config.label.PADDING;  // Usa config para consistência com colisão
  const labelBg = new PIXI.Graphics();
  labelBg.beginFill(0x0a0a12, 0.85);
  labelBg.drawRoundedRect(
    -padding.x,
    -padding.y,
    label.width + padding.x * 2,
    label.height + padding.y * 2,
    3
  );
  labelBg.endFill();

  labelContainer.addChild(labelBg);
  labelContainer.addChild(label);

  // Posicionar label baseado no ângulo do nó (aponta para fora do grafo)
  const labelDistance = baseRadius + config.label.DISTANCE;
  let anchorX = 0.5, anchorY = 0.5;

  if (isRoot) {
    // Root: label embaixo
    anchorX = 0.5;
    anchorY = 0;
    labelContainer.x = 0;
    labelContainer.y = labelDistance;
  } else {
    // Outros nós: label na direção oposta ao centro
    const labelAngle = node.labelAngle !== undefined ? node.labelAngle : Math.PI / 2;

    // Normalizar o ângulo para determinar a posição do texto
    const normalizedAngle = ((labelAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Posicionar o label na direção do ângulo
    labelContainer.x = Math.cos(labelAngle) * labelDistance;
    labelContainer.y = Math.sin(labelAngle) * labelDistance;

    // Ajustar o anchor baseado no quadrante para evitar sobreposição com o nó
    // Ângulo 0 = direita, PI/2 = baixo, PI = esquerda, 3PI/2 = cima
    if (normalizedAngle < Math.PI / 4 || normalizedAngle > Math.PI * 7 / 4) {
      // Direita: anchor na esquerda do texto
      anchorX = 0;
      anchorY = 0.5;
    } else if (normalizedAngle < Math.PI * 3 / 4) {
      // Baixo: anchor no topo do texto
      anchorX = 0.5;
      anchorY = 0;
    } else if (normalizedAngle < Math.PI * 5 / 4) {
      // Esquerda: anchor na direita do texto
      anchorX = 1;
      anchorY = 0.5;
    } else {
      // Cima: anchor na base do texto
      anchorX = 0.5;
      anchorY = 1;
    }
  }

  // Aplicar anchor manualmente ao container (pivot)
  labelContainer.pivot.x = (label.width + padding.x * 2) * anchorX - padding.x;
  labelContainer.pivot.y = (label.height + padding.y * 2) * anchorY - padding.y;

  labelContainer.alpha = isMutedStyle ? 0.6 : 0.8;
  container.addChild(labelContainer);
  container._label = labelContainer;

  // Badge com contagem real de arquivos do diretório
  const realFileCount = node.totalFilesCount || 0;
  if (isDirectory && realFileCount > 0) {
    const badge = createBadge(realFileCount);
    badge.x = baseRadius - 5;
    badge.y = -baseRadius + 5;
    container.addChild(badge);
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
    const currentSelected = selectedNode();
    if (!isRoot && currentSelected?.id !== node.id) {
      container._outerGlow.visible = false;
    }
    if (currentSelected?.id !== node.id) {
      container.scale.set(1);
      container._label.alpha = 0.8;
      container._ring.alpha = 0.6;
    }
  });

  container.on('pointertap', (event) => {
    // Ignore right-click (handled separately for context menu)
    if (event.button === 2) return;

    // Se é um nó placeholder com itens ocultos e temos callback, expande ao clicar
    if (isMoreNode && node.hiddenItems && node.hiddenItems.length > 0 && onExpandPlaceholder) {
      onExpandPlaceholder(node);
      return;
    }

    const currentSelected = selectedNode();
    if (currentSelected && nodeGraphics.has(currentSelected.id)) {
      const prevContainer = nodeGraphics.get(currentSelected.id);
      const prevIsRoot = currentSelected.depth === 0;
      prevContainer.scale.set(1);
      prevContainer._outerGlow.visible = prevIsRoot;
      prevContainer._ring.alpha = 0.6;
    }

    // Seleciona o nó e anima o caminho
    renderDetails(node);
    container.scale.set(1.1);
    container._outerGlow.visible = true;
    container._ring.alpha = 1;

    // Se é um diretório (não root), faz toggle de expand/collapse
    if (isDirectory && !isRoot && onToggleDirectory) {
      onToggleDirectory(node);
    }
  });

  // Right-click context menu (hybrid quick menu)
  container.on('pointerdown', async (event) => {
    // Only handle right-click (button 2)
    if (event.button !== 2) return;

    // Only for real files/directories, not placeholder nodes
    if (isMoreNode) return;

    // Get coordinates from the native event
    const nativeEvent = event.nativeEvent || event.data?.originalEvent;
    if (!nativeEvent) return;

    // Use client coordinates for Electron menu, screen coordinates for shell menu
    const clientX = nativeEvent.clientX;
    const clientY = nativeEvent.clientY;
    const screenX = nativeEvent.screenX;
    const screenY = nativeEvent.screenY;

    // Use quick hybrid menu (instant) - passes screen coords for "full menu" option
    if (window.graphfs?.shell?.showQuickMenu) {
      try {
        await window.graphfs.shell.showQuickMenu(node.path, isDirectory, screenX, screenY);
      } catch (err) {
        console.error('[ContextMenu] Failed:', err);
      }
    }
  });

  return container;
}
