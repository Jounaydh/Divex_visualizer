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
│   │   │                         View toolbar and optional editor
│   │   └── expansion.ts         Explorer path expansion helpers
│   ├── components/
│   │   ├── CodeEditor.tsx       Ace editor and Flutter actions
│   │   ├── FileExplorer.tsx     Sidebar folder tree
│   │   ├── InspectorPanel.tsx   Selection and relationship explanations
│   │   ├── LogicalWorkflowVisualizer.tsx
│   │   │                         Semantic workflow and relationship filters
│   │   └── TwoDVisualizer.tsx   2D workflow layout and navigation
│   ├── config/
│   │   └── ui.ts                Shared UI defaults
│   ├── data/
│   │   └── sampleProject.ts     Built-in Flutter demonstration project
│   ├── visualization/
│   │   ├── buildVisualGraph.ts  Project structure graph
│   │   ├── buildLogicalWorkflowGraph.ts
│   │   │                         Semantic graph and external dependencies
│   │   ├── logicalWorkflowLayout.ts
│   │   │                         Layered logical graph layout and routing
│   │   └── twoDLayout.ts        Project map layout and routing
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
4. `buildVisualGraph` converts the analyzed project into the expandable project
   map.
5. `buildLogicalWorkflowGraph` converts semantic relationships into the logic
   map, including external packages and APIs.
6. `InspectorPanel` reads the same analyzed project to explain outgoing and
   incoming relationships.

The important boundary is that analyzers produce project data and visualizers
consume graph data. A language adapter should not contain rendering code.

## Application state

`src/App.tsx` owns cross-feature state:

- the active project payload
- selected node
- expanded folder and file IDs
- current project or logic map
- guided or advanced mode
- editor visibility
- independent zoom and custom positions for both maps

The components in `src/app/` render the major shell regions. They receive
explicit props and do not duplicate the project model.

The project map permits multiple open folders and files. The logic map always
shows detected code parts so filtering a relationship never silently changes
the analyzed model.

## Production build strategy

The Vite configuration keeps startup light and gives the optional editor a
stable chunk:

- the normal 2D workspace is part of the initial experience
- Ace and `CodeEditor` load only after opening source code
- React and icon dependencies have cacheable vendor chunks
- generated files are grouped under `dist/assets/entry`,
  `dist/assets/chunks`, and `dist/assets/css`

The editor chunk is not preloaded by the production HTML, so low-spec systems
do not pay its parsing or execution cost until source view is requested.

After changing imports, inspect `dist/index.html` after a build. It should not
preload `editor-engine`.

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

Project structure graph behavior belongs in:

```text
src/visualization/buildVisualGraph.ts
```

2D-only layout, panning, zooming, and focus behavior belongs in:

```text
src/components/TwoDVisualizer.tsx
```

Logical relationship graph construction belongs in:

```text
src/visualization/buildLogicalWorkflowGraph.ts
```

Logical layout, routing, filters, panning, and zooming belong in:

```text
src/visualization/logicalWorkflowLayout.ts
src/components/LogicalWorkflowVisualizer.tsx
```

This separation prevents a visual styling change from becoming mixed with
graph-generation or parser logic.

## Large logic maps

The logic map has several safeguards for large repositories:

- its default large-map mode keeps a connected working set centered on the
  selected item, while preserving the analyzed graph in memory
- **Load full map** is available directly for moderate maps, while very large
  maps require an explicit **Force full map** override
- forced full maps still keep their SVG and mounted elements viewport-sized
- cards and SVG paths outside the current viewport are not mounted
- edge routing indexes node obstacles by depth instead of scanning the entire
  map for every possible route
- strongly connected components use iterative traversal, so deep call chains
  cannot overflow the JavaScript call stack

The thresholds and working-set budgets are defined near the top of
`LogicalWorkflowVisualizer.tsx`. Increase them only after profiling both the
layout time and the number of mounted DOM/SVG elements. Do not remove viewport
culling or the hard full-map guard when changing those limits.

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

- Dart analysis is currently a lightweight static source parser. Relationships
  marked `inferred` can be ambiguous; the IDE roadmap replaces this source of
  truth with the Dart language server and analyzer APIs.
- Java and Python are recognized file kinds but do not yet have full adapters.
- `npm run build` creates the renderer used by Electron; it does not create an
  installer or signed desktop package.
- The AI explanation feature is a planned extension and is currently disabled.
