// Paleta de cores estilo constellation (dourado sobre preto)
export const COLORS = {
  background: 0x000008,
  rootNode: 0xc9b77d,
  directory: 0x6488a8,
  file: 0x8b9a6b,
  moreDirs: 0x4a6a8a,
  moreFiles: 0x6b7a4b,
  edge: 0xc9b77d,
  edgeGlow: 0xf4e4bc,
  glow: 0xc9b77d,
  text: 0xc9b77d,
  textMuted: 0x7a6f50,
  nebula: [0x1a0a2e, 0x0a1628, 0x16213e, 0x0f3460]
};

// Armazenar min/max mtime para calcular recência
let minMtime = Infinity;
let maxMtime = -Infinity;

export function updateMtimeRange(nodes) {
  minMtime = Infinity;
  maxMtime = -Infinity;
  nodes.forEach(node => {
    if (node.mtime && node.type !== 'more-dirs' && node.type !== 'more-files') {
      minMtime = Math.min(minMtime, node.mtime);
      maxMtime = Math.max(maxMtime, node.mtime);
    }
  });
}

// Função para calcular a "recência" de um nó (0 = antigo, 1 = mais recente)
export function getRecencyScore(node) {
  if (!node.mtime || maxMtime === minMtime) return 0.5;

  // Normalizar entre 0 e 1 (1 = mais recente)
  const score = (node.mtime - minMtime) / (maxMtime - minMtime);

  // Aumentar o contraste usando uma curva exponencial
  return Math.pow(score, 0.7);
}
