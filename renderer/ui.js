// Funções de UI (sidebar, detalhes, árvore)

export function renderNotice(details, message) {
  const warn = document.createElement('p');
  warn.textContent = message;
  warn.style.color = '#fbbf24';
  details.innerHTML = '';
  details.appendChild(warn);
}

/**
 * Formata data de modificação de forma amigável
 */
function formatDate(timestamp) {
  if (!timestamp) return 'Desconhecida';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Formato relativo para datas recentes
  let relative = '';
  if (diffMins < 1) {
    relative = 'agora mesmo';
  } else if (diffMins < 60) {
    relative = `${diffMins} min atrás`;
  } else if (diffHours < 24) {
    relative = `${diffHours}h atrás`;
  } else if (diffDays < 7) {
    relative = `${diffDays} dia${diffDays > 1 ? 's' : ''} atrás`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    relative = `${weeks} semana${weeks > 1 ? 's' : ''} atrás`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    relative = `${months} ${months > 1 ? 'meses' : 'mês'} atrás`;
  } else {
    const years = Math.floor(diffDays / 365);
    relative = `${years} ano${years > 1 ? 's' : ''} atrás`;
  }

  // Formato absoluto
  const absolute = date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return { relative, absolute };
}

/**
 * Formata tamanho de arquivo
 */
function formatSize(bytes) {
  if (!bytes || bytes === 0) return null;

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function renderDetails(details, node) {
  details.innerHTML = '';

  // Nome do arquivo/pasta
  const title = document.createElement('h3');
  title.textContent = node.name;

  // Tipo (ARQUIVO/PASTA)
  const type = document.createElement('div');
  type.className = 'type';
  type.textContent = node.type === 'directory' ? 'PASTA' : 'ARQUIVO';

  // Caminho completo
  const pathEl = document.createElement('p');
  pathEl.className = 'path';
  pathEl.textContent = node.id;

  details.appendChild(title);
  details.appendChild(type);
  details.appendChild(pathEl);

  // Seção de metadados (data de modificação, tamanho)
  const metaSection = document.createElement('div');
  metaSection.className = 'meta-section';

  // Data de modificação
  if (node.mtime) {
    const dateInfo = formatDate(node.mtime);

    const mtimeRow = document.createElement('div');
    mtimeRow.className = 'meta-row';

    const mtimeLabel = document.createElement('span');
    mtimeLabel.className = 'meta-label';
    mtimeLabel.textContent = 'Modificado:';

    const mtimeValue = document.createElement('span');
    mtimeValue.className = 'meta-value';
    mtimeValue.innerHTML = `<strong>${dateInfo.relative}</strong>`;

    const mtimeAbsolute = document.createElement('span');
    mtimeAbsolute.className = 'meta-absolute';
    mtimeAbsolute.textContent = dateInfo.absolute;

    mtimeRow.appendChild(mtimeLabel);
    mtimeRow.appendChild(mtimeValue);
    metaSection.appendChild(mtimeRow);
    metaSection.appendChild(mtimeAbsolute);
  }

  // Tamanho (apenas para arquivos)
  if (node.type === 'file' && node.size) {
    const sizeFormatted = formatSize(node.size);
    if (sizeFormatted) {
      const sizeRow = document.createElement('div');
      sizeRow.className = 'meta-row';

      const sizeLabel = document.createElement('span');
      sizeLabel.className = 'meta-label';
      sizeLabel.textContent = 'Tamanho:';

      const sizeValue = document.createElement('span');
      sizeValue.className = 'meta-value';
      sizeValue.textContent = sizeFormatted;

      sizeRow.appendChild(sizeLabel);
      sizeRow.appendChild(sizeValue);
      metaSection.appendChild(sizeRow);
    }
  }

  details.appendChild(metaSection);

  // Contagem de conteúdo para diretórios
  if (node.type === 'directory') {
    const totalDirs = node.totalDirsCount || 0;
    const totalFiles = node.totalFilesCount || 0;

    if (totalDirs > 0 || totalFiles > 0) {
      const contentSection = document.createElement('div');
      contentSection.className = 'meta-section';

      // Total de pastas
      if (totalDirs > 0) {
        const dirsRow = document.createElement('div');
        dirsRow.className = 'meta-row';

        const dirsLabel = document.createElement('span');
        dirsLabel.className = 'meta-label';
        dirsLabel.textContent = 'Pastas:';

        const dirsValue = document.createElement('span');
        dirsValue.className = 'meta-value';
        dirsValue.textContent = totalDirs;

        dirsRow.appendChild(dirsLabel);
        dirsRow.appendChild(dirsValue);
        contentSection.appendChild(dirsRow);
      }

      // Total de arquivos
      if (totalFiles > 0) {
        const filesRow = document.createElement('div');
        filesRow.className = 'meta-row';

        const filesLabel = document.createElement('span');
        filesLabel.className = 'meta-label';
        filesLabel.textContent = 'Arquivos:';

        const filesValue = document.createElement('span');
        filesValue.className = 'meta-value';
        filesValue.textContent = totalFiles;

        filesRow.appendChild(filesLabel);
        filesRow.appendChild(filesValue);
        contentSection.appendChild(filesRow);
      }

      details.appendChild(contentSection);
    }
  }
}

export function renderTree(treeView, node) {
  const lines = [];
  buildTreeLines(node, '', true, lines);
  treeView.innerHTML = lines.join('\n');
}

function buildTreeLines(node, prefix, isLast, lines) {
  const connector = prefix ? (isLast ? '└─ ' : '├─ ') : '';
  const line = `${prefix}${connector}<span class="${node.type === 'directory' ? 'tree-dir' : 'tree-file'}">${node.name}</span>`;
  lines.push(line);

  if (node.children && node.children.length > 0) {
    const nextPrefix = prefix + (isLast ? '   ' : '│  ');
    node.children.forEach((child, index) => {
      buildTreeLines(child, nextPrefix, index === node.children.length - 1, lines);
    });
  }
}

export function setupAnimationControls(state) {
  const bgToggle = document.getElementById('toggle-bg-anim');
  const lineToggle = document.getElementById('toggle-line-anim');

  if (bgToggle) {
    bgToggle.addEventListener('change', (e) => {
      state.bgAnimEnabled = e.target.checked;
      // Mostrar/ocultar fundo animado
      state.starsContainer.visible = state.bgAnimEnabled;
      state.nebulaContainer.visible = state.bgAnimEnabled;
    });
  }

  if (lineToggle) {
    lineToggle.addEventListener('change', (e) => {
      state.lineAnimEnabled = e.target.checked;
      // Mostrar/ocultar partículas
      state.particlesContainer.visible = state.lineAnimEnabled;
    });
  }
}
