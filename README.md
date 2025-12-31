# GraphFS

Visual exploration of file systems with focus on recent/frequent relevance. This desktop app uses Electron + PixiJS to render an interactive graph visualization of your filesystem, highlighting recently modified files and folders.

## Features

- Interactive constellation-style graph visualization
- Shows most recently modified files and folders
- Animated particles flowing along edges based on recency
- Fast file search using Everything Search Engine (Windows)
- Scan user directory or entire drives with one click

## Requirements

### Windows

- **Everything Search** (by voidtools) - Required for fast file scanning
  - Download from: https://www.voidtools.com/
  - The app will automatically start Everything in background if installed
  - Everything CLI (`es.exe`) is downloaded automatically during `npm install`

### Other platforms

Linux and macOS support is planned (using mlocate/plocate and mdfind respectively).

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/graphfs.git
cd graphfs

# Install dependencies (also downloads Everything CLI automatically)
npm install
```

### Everything Search Setup (Windows)

1. Download and install Everything from https://www.voidtools.com/
2. Run Everything at least once to build the initial index
3. GraphFS will automatically start Everything in background when needed

## Usage

```bash
npm start
```

### Scan Buttons

- **Scan User Folder** - Scans your home directory for recent files
- **Scan C:** - Scans the entire C: drive for recent files

### Controls

- **Zoom**: Ctrl + mouse wheel
- **Pan**: Middle mouse button or Shift + left click + drag
- **Select node**: Click on any node to see details

## Architecture

```
graphfs/
├── main.js                 # Electron main process
├── preload.js              # IPC bridge
├── renderer/               # Frontend (PixiJS visualization)
│   ├── index.html
│   ├── styles.css
│   ├── renderer.js         # Main orchestrator
│   ├── colors.js           # Color palette & recency scoring
│   ├── graph-layout.js     # Tree flattening & radial layout
│   ├── nodes.js            # Node creation & interactivity
│   ├── effects.js          # Animations (stars, particles)
│   ├── pixi-app.js         # PixiJS setup & controls
│   └── ui.js               # Sidebar & tree view
├── search-engines/         # Extensible search engine architecture
│   ├── base-search-engine.js       # Abstract base class
│   ├── everything-cli-engine.js    # Everything implementation
│   ├── search-engine-manager.js    # Engine manager
│   └── index.js
├── scripts/
│   └── download-everything-cli.js  # Auto-download es.exe
└── bin/
    └── es.exe              # Everything CLI (auto-downloaded)
```

### Search Engine Architecture

The search engine system is designed to be extensible:

- `BaseSearchEngine` - Abstract interface that all engines implement
- `EverythingCliEngine` - Windows implementation using Everything
- `SearchEngineManager` - Manages available engines and routing

To add support for other platforms, implement a new engine extending `BaseSearchEngine`.

## Tech Stack

- **Electron** - Desktop application framework
- **PixiJS** - WebGL-based 2D rendering
- **Everything Search** - Fast Windows file indexing (via CLI)

See [`TECH-STACK.md`](TECH-STACK.md) for the complete technical vision.

## Roadmap

See [`backlog.md`](backlog.md) for planned features and development priorities.

## License

MIT
