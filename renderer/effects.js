import * as PIXI from '../node_modules/pixi.js/dist/pixi.mjs';
import { COLORS, getRecencyScore } from './colors.js';

// ============================================
// STARFIELD - Estrelas que piscam
// ============================================
export function createStarfield(app, starsContainer) {
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
export function createNebula(app, nebulaContainer) {
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
export function createEdgeParticles(edge, source, target, particlesContainer) {
  // Calcular recência do nó de destino
  const recency = getRecencyScore(target);

  // Mais partículas para nós mais recentes (de 1 a 5)
  const particleCount = Math.floor(1 + recency * 4);

  // Tamanho das partículas varia com recência (1.5 a 3.5)
  const particleSize = 1.5 + recency * 2;

  // Velocidade BASE reduzida (modo "calmo" por padrão)
  // Velocidade normal: 0.002 + recency * 0.006
  // Velocidade calma: 40% da normal
  const baseSpeed = (0.002 + recency * 0.006) * 0.4;

  // ID único da edge para rastrear caminho ativo
  const edgeId = `${source.id}-${target.id}`;

  for (let i = 0; i < particleCount; i++) {
    const particle = new PIXI.Graphics();

    // Cor com mais brilho para nós recentes
    const alpha = 0.6 + recency * 0.3;
    const glowColor = recency > 0.7 ? COLORS.edgeGlow : COLORS.edge;

    particle.beginFill(glowColor, alpha);
    particle.drawCircle(0, 0, particleSize);
    particle.endFill();

    particle._progress = i / particleCount;
    particle._baseSpeed = baseSpeed; // velocidade base (calma)
    particle._speed = baseSpeed + Math.random() * 0.001;
    particle._sourceId = source.id;
    particle._targetId = target.id;
    particle._edgeId = edgeId;
    particle._baseSize = particleSize;
    particle._recency = recency;

    particlesContainer.addChild(particle);
    edge.particles.push(particle);
  }

  // Armazenar recência e ID no edge para uso no drawEdges
  edge.recency = recency;
  edge.edgeId = edgeId;
}

// ============================================
// DESENHAR EDGES
// ============================================
// Reutilizar o mesmo Graphics para evitar memory leak
let cachedEdgeGraphics = null;

export function drawEdges(edgesContainer, edgeData, nodesData, activePathEdgeIds = null) {
  // Criar o Graphics apenas uma vez e reutilizar
  if (!cachedEdgeGraphics) {
    cachedEdgeGraphics = new PIXI.Graphics();
    edgesContainer.addChild(cachedEdgeGraphics);
  }

  // Limpar o graphics existente (não criar novo)
  cachedEdgeGraphics.clear();

  edgeData.forEach((edge) => {
    const source = nodesData.find((n) => n.id === edge.source);
    const target = nodesData.find((n) => n.id === edge.target);

    if (source && target) {
      const recency = edge.recency || 0.5;
      const isActivePath = activePathEdgeIds && activePathEdgeIds.has(edge.edgeId);

      // Variação da espessura com base na recência
      // No caminho ativo: linhas mais grossas
      const glowWidth = isActivePath ? 8 : (2 + recency * 2); // ativo: 8, normal: 2-4
      const lineWidth = isActivePath ? 3 : (0.8 + recency * 1); // ativo: 3, normal: 0.8-1.8

      // Variação da opacidade
      // No caminho ativo: mais opaco; normal: mais sutil
      const glowAlpha = isActivePath ? 0.35 : (0.05 + recency * 0.08); // ativo: 0.35, normal: 0.05-0.13
      const lineAlpha = isActivePath ? 0.9 : (0.25 + recency * 0.25); // ativo: 0.9, normal: 0.25-0.5

      // Cor mais brilhante para caminho ativo ou nós muito recentes
      const edgeColor = isActivePath ? COLORS.edgeGlow : (recency > 0.7 ? COLORS.edgeGlow : COLORS.edge);

      // Glow externo
      cachedEdgeGraphics.setStrokeStyle({
        width: glowWidth,
        color: edgeColor,
        alpha: glowAlpha,
        cap: 'round'
      });
      cachedEdgeGraphics.moveTo(source.x, source.y);
      cachedEdgeGraphics.lineTo(target.x, target.y);
      cachedEdgeGraphics.stroke();

      // Linha principal
      cachedEdgeGraphics.setStrokeStyle({
        width: lineWidth,
        color: edgeColor,
        alpha: lineAlpha,
        cap: 'round'
      });
      cachedEdgeGraphics.moveTo(source.x, source.y);
      cachedEdgeGraphics.lineTo(target.x, target.y);
      cachedEdgeGraphics.stroke();
    }
  });
}

// Resetar cache quando trocar de scan
export function resetEdgeGraphicsCache() {
  if (cachedEdgeGraphics) {
    cachedEdgeGraphics.destroy();
    cachedEdgeGraphics = null;
  }
}

// ============================================
// ANIMAÇÃO DE ENTRADA
// ============================================
export function animateEntrance(nodes, nodeGraphics) {
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

export function animateTo(target, props, duration) {
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

// ============================================
// FEEDBACK VISUAL DE ABERTURA (double-click)
// ============================================
export function animateOpenFeedback(container) {
  const originalScale = container.scale.x;
  const duration = 500;
  const startTime = performance.now();

  // Criar anel de ripple
  const ripple = new PIXI.Graphics();
  ripple.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 1 });
  ripple.circle(0, 0, 30);
  ripple.stroke();
  container.addChild(ripple);

  // Flash branco overlay
  const flash = new PIXI.Graphics();
  flash.beginFill(0xffffff, 0.8);
  flash.circle(0, 0, 35);
  flash.endFill();
  container.addChild(flash);

  const animate = () => {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing functions
    const easeOutBack = (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

    // Scale: bounce
    let scale;
    if (progress < 0.4) {
      scale = originalScale + (0.35 * easeOutBack(progress / 0.4));
    } else {
      scale = (originalScale + 0.35) - (0.35 * easeOutQuad((progress - 0.4) / 0.6));
    }
    container.scale.set(scale);

    // Glow: intenso no início
    const glowIntensity = 1.0 - (0.6 * easeOutQuad(progress));
    container._outerGlow.visible = true;
    container._outerGlow.alpha = glowIntensity;

    // Flash branco: desaparece rápido
    flash.alpha = Math.max(0, 1 - (progress * 4));

    // Ripple: expande e desaparece
    const rippleScale = 1 + (progress * 1.0);
    ripple.scale.set(rippleScale);
    ripple.alpha = Math.max(0, 1 - progress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      container.scale.set(originalScale);
      container._outerGlow.alpha = 0.4;
      container.removeChild(ripple);
      container.removeChild(flash);
      ripple.destroy();
      flash.destroy();
    }
  };

  requestAnimationFrame(animate);
}

// ============================================
// LOOP DE ANIMAÇÃO PRINCIPAL
// ============================================
export function createAnimationLoop(state) {
  return (ticker) => {
    state.time += ticker.deltaTime * 0.016;

    // Animar estrelas (twinkle) - apenas se habilitado
    if (state.bgAnimEnabled) {
      state.starsContainer.children.forEach(star => {
        if (star._twinkleSpeed) {
          star.alpha = star._baseAlpha * (0.5 + 0.5 * Math.sin(state.time * star._twinkleSpeed + star._twinkleOffset));
        }
      });
    }

    // Desenhar edges (passa caminho ativo para destacar)
    drawEdges(state.edgesContainer, state.edgeData, state.nodesData, state.activePathEdgeIds);

    // Animar partículas nas conexões - apenas se habilitado
    if (state.lineAnimEnabled) {
      state.edgeData.forEach(edge => {
        const source = state.nodesData.find(n => n.id === edge.source);
        const target = state.nodesData.find(n => n.id === edge.target);

        if (source && target && edge.particles) {
          // Verificar se esta edge está no caminho ativo
          const isActivePath = state.activePathEdgeIds && state.activePathEdgeIds.has(edge.edgeId);

          edge.particles.forEach(particle => {
            // Velocidade: 2.5x mais rápido se no caminho ativo
            const speedMultiplier = isActivePath ? 2.5 : 1;
            particle._progress += particle._speed * speedMultiplier;
            if (particle._progress > 1) particle._progress = 0;

            // Interpolar posição
            particle.x = source.x + (target.x - source.x) * particle._progress;
            particle.y = source.y + (target.y - source.y) * particle._progress;

            const recency = particle._recency || 0.5;

            // Fade in/out nas pontas
            const fadeZone = 0.15;
            let alpha;
            if (particle._progress < fadeZone) {
              alpha = particle._progress / fadeZone;
            } else if (particle._progress > 1 - fadeZone) {
              alpha = (1 - particle._progress) / fadeZone;
            } else {
              alpha = 1;
            }

            // Partículas mais recentes têm alpha maior
            // No caminho ativo: alpha ainda maior
            const baseAlpha = isActivePath ? 0.9 : (0.4 + recency * 0.2);
            particle.alpha = alpha * baseAlpha;

            // Escala: maior no caminho ativo
            const baseScale = isActivePath ? 1.3 : 0.8;

            // Pulso no tamanho para partículas no caminho ativo ou muito recentes
            if (isActivePath || recency > 0.6) {
              const pulseIntensity = isActivePath ? 0.4 : 0.3;
              const pulseSpeed = isActivePath ? 5 : 3;
              const sizePulse = Math.sin(state.time * pulseSpeed + particle._progress * Math.PI * 2) * pulseIntensity + 1;
              particle.scale.set(baseScale * sizePulse);
            } else {
              particle.scale.set(baseScale);
            }
          });
        }
      });
    }

    // Pulso suave nos nós (mais intenso para nós recentes)
    state.nodeGraphics.forEach((container, id) => {
      const node = state.nodesData.find(n => n.id === id);
      if (node && container.children[0]) {
        const glow = container.children[0];
        const recency = getRecencyScore(node);

        // Frequência do pulso varia com recência (mais rápido = mais recente)
        const pulseSpeed = 1.5 + recency * 1.5; // 1.5 a 3
        const pulseIntensity = 0.2 + recency * 0.3; // 0.2 a 0.5

        const pulse = Math.sin(state.time * pulseSpeed + node.x * 0.01) * pulseIntensity + (1 - pulseIntensity);

        if (glow.visible) {
          const baseAlpha = 0.1 + recency * 0.15; // 0.1 a 0.25
          glow.alpha = baseAlpha * pulse;
        }
      }
    });
  };
}
