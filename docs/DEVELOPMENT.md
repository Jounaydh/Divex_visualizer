# Divex Visualizer development guide

This guide explains how the application is organized, how data moves through
it, and where to make common changes. Divex is currently a desktop-first React
renderer hosted by Electron.

## Quick start

Requirements:

- Node.js 20 or newer
- npm
- Flutter and Dart only when using the local format and analysis commands

Install and run the desktop application:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run build
npm run check
npm run preview
```

`npm run check` is the preferred validation command before committing. It runs
strict TypeScript checks and creates a production renderer build.

## Directory map

```text
.
├── electron/
│   ├── main.cjs                 Electron window, folder scanning, IPC tools
│   └── preload.cjs              Safe renderer API exposed through window.divex
├── src/
│   ├── analysis/
│   │   ├── analyzeProject.ts    Language-neutral analysis pipeline
│   │   └── languages/
│   │       └── dart.ts          Dart imports and symbol extraction
│   ├── app/
│   │   ├── AppHeader.tsx        Desktop header and File menu
│   │   ├── ProjectSidebar.tsx   Project switcher, explorer, project totals
│   │   ├── VisualizerWorkspace.tsx
│   │   │                         View toolbar and lazy-loaded heavy features
│   │   └── expansion.ts         2D/3D expansion and layer helpers
│   ├── components/
│   │   ├── three/               Small reusable parts of the 3D renderer
│   │   ├── CodeEditor.tsx       Ace editor and Flutter actions
│   │   ├── FileExplorer.tsx     Sidebar folder tree
│   │   ├── InspectorPanel.tsx   Selection, imports, and symbols
│   │   ├── ThreeVisualizer.tsx  3D scene state and navigation
│   │   └── TwoDVisualizer.tsx   2D workflow layout and navigation
│   ├── config/
│   │   └── ui.ts                Shared UI defaults
│   ├── data/
│   │   └── sampleProject.ts     Built-in Flutter demonstration project
│   ├── visualization/
│   │   └── buildVisualGraph.ts  Shared graph creation and layout
│   ├── App.tsx                  Application state and feature orchestration
│   ├── styles.css               Styles grouped by feature comments
│   └── types.ts                 Shared project, graph, and Electron API types
├── vite.config.ts               Renderer build and chunk strategy
└── package.json                 Development and validation scripts
```

## Runtime data flow

1. Electron scans a selected folder and returns a `ProjectPayload`.
2. `analyzeProject` converts raw files into an `AnalyzedProject`.
3. A language adapter extracts symbols, imports, and resolved relationships.
4. `buildVisualGraph` converts the analyzed project into visible nodes and
   edges according to the currently expanded folders and files.
5. The 2D and 3D renderers apply their own layout and interaction behavior to
   that shared graph.
6. `InspectorPanel` reads the same analyzed project to explain outgoing and
   incoming relationships.

The important boundary is that analyzers produce project data and visualizers
consume graph data. A language adapter should not contain rendering code.

## Application state

`src/App.tsx` owns cross-feature state:

- the active project payload
- selected node
- expanded folder and file IDs
- current 2D or 3D view
- guided or advanced mode
- editor visibility
- camera reset and 2D zoom values

The components in `src/app/` render the major shell regions. They receive
explicit props and do not duplicate the project model.

Expansion differs by view:

- 2D permits multiple open items and uses free expansion.
- 3D permits one open item per depth layer.
- `src/app/expansion.ts` is the single place for ID and layer calculations.

## Production build strategy

The Vite configuration keeps startup light and gives large optional engines
stable chunks:

- the normal 2D workspace is part of the initial experience
- Ace and `CodeEditor` load only after opening source code
- Three.js, React Three Fiber, Drei, and `ThreeVisualizer` load only after
  opening the 3D map
- React and icon dependencies have cacheable vendor chunks
- generated files are grouped under `dist/assets/entry`,
  `dist/assets/chunks`, and `dist/assets/css`

The large editor and 3D chunks are intentional. They are not preloaded by the
production HTML, so low-spec systems do not pay their parsing or execution cost
until those features are requested.

After changing imports, inspect `dist/index.html` after a build. It should not
preload `editor-engine` or `visualizer-3d-engine`.

## Adding a language analyzer

Each language should have a focused adapter under
`src/analysis/languages/`. An adapter is responsible for:

1. recognizing imports or dependencies
2. extracting supported symbols
3. resolving project-local dependency paths
4. returning the shared types from `src/types.ts`

Then update:

- `extensionKind` in `src/analysis/analyzeProject.ts`
- the analyzer dispatch in `analyzeProject`
- `supportedExtensions` in `electron/main.cjs`
- Ace mode imports and `aceModeForExtension` in `CodeEditor.tsx`
- the sample project or tests used to verify the adapter

Avoid adding language-specific conditions to either visualizer.

## Editing the visualizers

Shared graph behavior belongs in:

```text
src/visualization/buildVisualGraph.ts
```

2D-only layout, panning, zooming, and focus behavior belongs in:

```text
src/components/TwoDVisualizer.tsx
```

3D camera and gesture behavior belongs in:

```text
src/components/ThreeVisualizer.tsx
```

Reusable 3D node presentation, edge routing, and constants belong in:

```text
src/components/three/
```

This separation prevents a visual styling change from becoming mixed with
graph-generation or parser logic.

## Electron boundary

The browser renderer never receives unrestricted Node.js access.
`electron/preload.cjs` exposes a narrow `window.divex` API, and the matching
TypeScript declaration lives in `src/types.ts`.

When adding a desktop command:

1. implement and validate it in `electron/main.cjs`
2. expose it in `electron/preload.cjs`
3. add its TypeScript signature to `Window.divex`
4. handle failures as user-facing `ProjectToolResult` values

Project file paths must continue to pass through `resolveProjectFile` before
any write operation.

## Current boundaries

- Dart analysis is a lightweight source parser, not a complete Dart analyzer.
- Java and Python are recognized file kinds but do not yet have full adapters.
- `npm run build` creates the renderer used by Electron; it does not create an
  installer or signed desktop package.
- The AI explanation feature is a planned extension and is currently disabled.
