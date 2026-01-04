// Configurações globais do renderer
// Exposto em window.config para ajustes via DevTools

export const config = {
  // Layout do grafo
  layout: {
    BASE_RADIUS: 120,       // Distância base pai-filho (primeiro nível)
    RADIUS_DECAY: 0.85,     // Decaimento por nível
    MIN_RADIUS: 80,         // Distância mínima pai-filho
    MIN_ANGLE_GAP: 0.05,    // Gap entre setores (radianos)
    ANGLE_PER_WEIGHT: 0.25  // Espaço angular por peso
  },

  // Colisão (elipses)
  collision: {
    BASE_RADIUS: 15,        // Raio base do nó
    CHAR_WIDTH: 5,          // Largura estimada por caractere
    TEXT_WEIGHT: 0.6,       // Peso do texto na repulsão
    ITERATIONS: 100,        // Iterações da simulação
    STRENGTH: 0.4           // Força de repulsão
  },

  // Posicionamento do texto (usado em nodes.js e colisão)
  label: {
    DISTANCE: 12,           // Distância do texto ao nó (além do baseRadius)
    MAX_CHARS_ROOT: 40,     // Máximo de caracteres no root
    MAX_CHARS_NODE: 30,     // Máximo de caracteres nos outros nós
    PADDING: { x: 4, y: 2 } // Padding do background do texto
  },

  // Tamanho dos nós (raio)
  nodeSize: {
    ROOT: 18,
    DIRECTORY: 11,
    MORE: 9,
    FILE: 7
  }
};

/**
 * Trunca o nome preservando a extensão do arquivo quando possível.
 * Usado por nodes.js e graph-layout.js para manter consistência.
 */
export function truncateName(name, maxLength) {
  if (!name || name.length <= maxLength) return name || '';

  // Verificar se tem extensão (arquivo)
  const lastDotIndex = name.lastIndexOf('.');

  // Se tem extensão e não é um arquivo oculto (que começa com .)
  if (lastDotIndex > 0) {
    const extension = name.substring(lastDotIndex); // inclui o ponto
    const baseName = name.substring(0, lastDotIndex);

    // Calcular espaço disponível para o nome base
    // maxLength - extensão.length - 1 (para o …)
    const availableForBase = maxLength - extension.length - 1;

    if (availableForBase > 0) {
      return baseName.substring(0, availableForBase) + '…' + extension;
    }
  }

  // Fallback: comportamento original (para diretórios ou nomes sem extensão)
  return name.substring(0, maxLength - 1) + '…';
}

/**
 * Retorna o nome de exibição para um nó, aplicando truncamento conforme config.
 * Centraliza a lógica para nodes.js e graph-layout.js usarem o mesmo valor.
 */
export function getDisplayName(node) {
  const name = node.name || '';
  const isRoot = node.depth === 0;
  const isMoreNode = node.type === 'more-dirs' || node.type === 'more-files';

  // Nós "more" não são truncados
  if (isMoreNode) {
    return name;
  }

  const maxChars = isRoot ? config.label.MAX_CHARS_ROOT : config.label.MAX_CHARS_NODE;
  return truncateName(name, maxChars);
}

// Expõe no window para debug
if (typeof window !== 'undefined') {
  window.config = config;
}
