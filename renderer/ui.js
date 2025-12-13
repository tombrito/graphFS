// Funções de UI (sidebar, detalhes, árvore)

export function renderNotice(details, message) {
  const warn = document.createElement('p');
  warn.textContent = message;
  warn.style.color = '#fbbf24';
  details.innerHTML = '';
  details.appendChild(warn);
}

export function renderDetails(details, node) {
  details.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = node.name;
  const type = document.createElement('div');
  type.className = 'type';
  type.textContent = node.type === 'directory' ? 'PASTA' : 'ARQUIVO';
  const path = document.createElement('p');
  path.className = 'path';
  path.textContent = node.id;

  details.appendChild(title);
  details.appendChild(type);
  details.appendChild(path);

  if (node.type === 'directory') {
    const hiddenDirs = node.hiddenDirsCount || 0;
    const hiddenFiles = node.hiddenFilesCount || 0;

    if (node.collapsed && (hiddenDirs > 0 || hiddenFiles > 0)) {
      const collapsedInfo = document.createElement('p');
      collapsedInfo.style.color = '#c9a227';
      collapsedInfo.style.fontSize = '12px';
      collapsedInfo.style.marginTop = '8px';
      const parts = [];
      if (hiddenDirs > 0) parts.push(`${hiddenDirs} pastas`);
      if (hiddenFiles > 0) parts.push(`${hiddenFiles} arquivos`);
      collapsedInfo.textContent = `Contém: ${parts.join(', ')}`;
      details.appendChild(collapsedInfo);
    } else if (hiddenFiles > 0) {
      const hiddenInfo = document.createElement('p');
      hiddenInfo.style.color = '#6488a8';
      hiddenInfo.style.fontSize = '12px';
      hiddenInfo.style.marginTop = '8px';
      hiddenInfo.textContent = `+${hiddenFiles} arquivos ocultos (${node.totalFilesCount} total)`;
      details.appendChild(hiddenInfo);
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
