# Divex Visualizer

Divex Visualizer is a desktop-first code exploration tool that turns a project
into an interactive 3D dependency space and a conventional 2D workflow. Its
first analyzer targets Dart and Flutter, while its internal project and graph
models are intentionally language-neutral.

## Current prototype

- VS Code-style project explorer
- Native desktop folder picker
- Rotatable, zoomable, and pannable WebGL visualization
- Camera-facing 2D folder, file, and symbol controls inside the 3D space
- Expandable and collapsible folder groups
- File-to-file import relationships
- File drill-down into Flutter widgets, classes, functions, and methods
- Direct source-code inspection
- Guided and advanced inspection modes
- 2D workflow with four flow directions and optional free positioning
- Fullscreen viewing for both 2D and 3D
- Built-in Flutter demonstration project

## Windows support

The packaged application runs on 64-bit Windows 10 or 11. End users do not
need Node.js; the installer and portable executable include the Electron
runtime.

Development and packaging requirements:

- Node.js 22.12 or newer (the current LTS release is recommended)
- npm, which is included with Node.js
- Optional: the Flutter SDK if you want to use **Format** or
  **Flutter Analyze**

The application itself uses Electron, React, and TypeScript, so it does not
need a language rewrite for Windows. Project paths, Windows window controls,
keyboard shortcuts, and the `.bat` launchers supplied by the Windows Flutter
SDK are handled by the desktop process.

To enable the optional Flutter tools, add the Flutter SDK's `bin` directory to
your Windows user `PATH`, open a new PowerShell window, and verify:

```powershell
flutter --version
dart --version
```

## Run locally

From PowerShell in the project directory:

```powershell
npm ci
npm run dev
```

`npm run dev` starts the renderer and opens the Electron desktop window.

To build the renderer and run it without the development server:

```powershell
npm start
```

Validation commands:

```powershell
npm run typecheck
npm run build
```

## Build for Windows

Create both an assisted installer and a no-install portable executable:

```powershell
npm run dist:win
```

The files are written to `release`:

- `Divex Visualizer-Setup-<version>-x64.exe`
- `Divex Visualizer-Portable-<version>-x64.exe`

For a faster unpacked build that is useful for testing:

```powershell
npm run pack:win
```

Local builds are unsigned. Windows SmartScreen can therefore warn when someone
downloads the executable on another PC. A public release should be signed with
a trusted Windows code-signing certificate.

## Analyzer architecture

Every language add-on will convert its source files into the same internal
project graph:

```text
Language adapter
  -> files, symbols, dependencies, and relationships
  -> shared Divex graph
  -> 2D and 3D renderers
  -> guided or advanced explanation layer
```

Planned analyzer sequence:

1. Dart and Flutter — current foundation
2. Java
3. Python
4. JavaScript and TypeScript
5. Additional languages as independent adapters

Future graph providers can add database schemas, tables, fields, foreign keys,
ORM models, and code-to-database data flow without replacing the renderer.
Local AI explanations are planned as a later, optional layer over the trusted
parser output.

## Source layout

The renderer is organized by responsibility instead of keeping the full
application flow in one component:

```text
src/
  App.tsx                         project and view orchestration
  analysis/                       language-neutral project analysis
  components/
    shell/                        title bar and project sidebar
    visualizer/
      VisualizerToolbar.tsx       view selection and workflow settings
      two-d/                      2D canvas, nodes, connections, navigation
      three-d/                    3D scene, nodes, geometry, gestures
  hooks/
    useElementFullscreen.ts       fullscreen lifecycle
    useGraphExpansion.ts          2D/3D expansion rules
  visualization/
    buildVisualGraph.ts           shared visual graph construction
    twoDLayout.ts                 pure 2D layout and edge-routing math
  styles/
    visualizer-toolbar.css        toolbar and View menu
    two-d-visualizer.css          2D workflow canvas
```

The main data flow is:

```text
Project files
  -> analyzeProject
  -> shared project model
  -> expansion state
  -> buildVisualGraph
  -> 2D layout or 3D scene
```

Pure graph and layout code stays outside React components, while pointer,
keyboard, camera, and fullscreen behavior is kept in focused hooks.
