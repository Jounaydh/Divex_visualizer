# Development guide

This guide covers local setup, common edit locations, and project conventions.
Read [Architecture](ARCHITECTURE.md) for system boundaries and
[Performance](PERFORMANCE.md) before changing large-map behavior.

## Quick start

Requirements:

- Node.js 22.12 or newer
- npm
- Flutter and Dart only for local Flutter commands

```bash
npm install
npm run dev
```

Commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and the Electron desktop window |
| `npm run typecheck` | Run strict TypeScript validation |
| `npm run test` | Run automated Vitest checks once |
| `npm run test:watch` | Keep Vitest running during development |
| `npm run build` | Type-check and build production renderer assets |
| `npm run check` | Run the complete pre-commit validation gate |
| `npm run preview` | Preview the production renderer in a browser |
| `npm run desktop` | Open Electron against the existing renderer URL/build |

## Directory map

```text
.
├── electron/
│   ├── main.cjs                    Native window, project files, tasks, IPC
│   ├── git-service.cjs             Constrained local Git operations
│   ├── project-loader.cjs          Cached metadata-first project loading
│   ├── terminal-service.cjs        Managed pseudoterminal sessions
│   └── preload.cjs                 Safe window.divex API
├── src/
│   ├── analysis/
│   │   ├── analysis.worker.ts      Background analysis entry point
│   │   ├── analyzeProject.ts       Shared analysis pipeline
│   │   ├── useAnalyzedProject.ts   Worker lifecycle and cancellation
│   │   └── languages/dart.ts       Dart and Flutter extraction
│   ├── app/
│   │   ├── AppHeader.tsx
│   │   ├── crashReporting.ts
│   │   ├── ProjectSidebar.tsx
│   │   ├── VisualizerToolbar.tsx
│   │   ├── VisualizerWorkspace.tsx
│   │   ├── WorkspaceResizer.tsx
│   │   ├── expansion.ts
│   │   └── useElementFullscreen.ts
│   ├── components/
│   │   ├── BrandMark.tsx
│   │   ├── FeatureErrorBoundary.tsx
│   │   └── WorkflowNode.tsx
│   ├── features/
│   │   ├── editor/
│   │   │   ├── CodeEditor.tsx
│   │   │   └── flutterDiagnostics.ts
│   │   ├── explorer/FileExplorer.tsx
│   │   ├── inspector/InspectorPanel.tsx
│   │   ├── navigation/
│   │   │   ├── NavigationPalette.tsx
│   │   │   ├── navigationIndex.ts
│   │   │   └── useNavigationHistory.ts
│   │   ├── source-control/
│   │   │   └── SourceControlPanel.tsx
│   │   ├── terminal/
│   │   │   ├── TerminalDock.tsx
│   │   │   └── useIntegratedTerminal.ts
│   │   ├── logic-map/
│   │   │   ├── LogicalFilterPanel.tsx
│   │   │   ├── LogicalWorkflowVisualizer.tsx
│   │   │   ├── buildLogicalWorkflowGraph.ts
│   │   │   ├── logicalWorkflowLayout.ts
│   │   │   └── logicalWorkflowPerformance.ts
│   │   └── project-map/
│   │       ├── TwoDVisualizer.tsx
│   │       ├── buildVisualGraph.ts
│   │       └── twoDLayout.ts
│   ├── config/ui.ts
│   ├── data/sampleProject.ts
│   ├── App.tsx
│   ├── styles.css
│   └── types.ts
├── docs/
├── package.json
└── vite.config.ts
```

## Where to make changes

| Change | Primary location |
| --- | --- |
| Cross-feature state or project lifecycle | `src/App.tsx` |
| Header, sidebar, view toolbar, or workspace composition | `src/app/` |
| Dart extraction | `src/analysis/languages/dart.ts` |
| Analysis orchestration or extension recognition | `src/analysis/analyzeProject.ts` |
| Scan limits, file caching, or read concurrency | `electron/project-loader.cjs` |
| Analysis worker lifecycle | `src/analysis/useAnalyzedProject.ts` |
| Project graph meaning | `src/features/project-map/buildVisualGraph.ts` |
| Project graph layout/routes | `src/features/project-map/twoDLayout.ts` |
| Project map interaction/rendering | `src/features/project-map/TwoDVisualizer.tsx` |
| Logical relationship meaning | `src/features/logic-map/buildLogicalWorkflowGraph.ts` |
| Logical layout/routes | `src/features/logic-map/logicalWorkflowLayout.ts` |
| Large-map limits/scoping | `src/features/logic-map/logicalWorkflowPerformance.ts` |
| Logical controls | `src/features/logic-map/LogicalFilterPanel.tsx` |
| Logical viewport/rendering | `src/features/logic-map/LogicalWorkflowVisualizer.tsx` |
| Editor sessions, tabs, actions, and preferences | `src/features/editor/CodeEditor.tsx` |
| Flutter analyzer output parsing | `src/features/editor/flutterDiagnostics.ts` |
| Search results, definitions, or references | `src/features/navigation/navigationIndex.ts` |
| Command palette UI | `src/features/navigation/NavigationPalette.tsx` |
| Back/forward behavior | `src/features/navigation/useNavigationHistory.ts` |
| Git status, diff, staging, or commits | `electron/git-service.cjs` |
| Source Control UI | `src/features/source-control/SourceControlPanel.tsx` |
| PTY lifecycle, ownership, or limits | `electron/terminal-service.cjs` |
| Terminal sessions and streamed output | `src/features/terminal/useIntegratedTerminal.ts` |
| Xterm dock, tabs, resize, or task picker | `src/features/terminal/TerminalDock.tsx` |
| Detected task definitions | `detectProjectTasks` in `electron/main.cjs` |
| Native filesystem/process behavior | `electron/main.cjs` |
| Safe renderer API | `electron/preload.cjs` and `src/types.ts` |
| Visual styling | `src/styles.css` |

Feature-specific code belongs in its feature folder. Only move an element into
`src/components/` when more than one feature genuinely uses it.

Git changes must use fixed `execFile` argument arrays in `git-service.cjs`.
Never accept a raw Git command or shell fragment from the renderer. Validate
all file paths against the opened project and keep destructive operations out
of the renderer bridge unless they receive a dedicated recovery design.

Terminal task execution follows the same rule: the renderer sends a detected
task ID, and Electron resolves that ID to a trusted executable/argument array.
Do not add a renderer IPC that accepts an arbitrary command string. The
`postinstall` script fixes execute permission on node-pty's prebuilt macOS
helper; keep it when changing package tooling.

Ace sessions are document state, not disposable render details. When adding
editor features, preserve the rule that switching tabs calls `setSession`
instead of replacing text. Programmatic formatter/project updates must suppress
dirty tracking, and dirty buffers must not be overwritten by background
analysis refreshes.

## Adding a language analyzer

Each language adapter should:

1. recognize imports and dependencies
2. extract supported symbols and source lines
3. resolve project-local dependency paths
4. emit shared types from `src/types.ts`

Then update:

- file-kind recognition in `src/analysis/analyzeProject.ts`
- analyzer dispatch in `analyzeProject`
- `supportedExtensions` in `electron/main.cjs`
- Ace mode imports and extension mapping in the editor
- analysis fixtures and graph tests

Avoid adding language-specific parsing conditions to either map.

## Adding a desktop command

The renderer cannot call Node.js directly. For every new desktop action:

1. Validate arguments and paths in `electron/main.cjs`.
2. Keep paths inside the opened project root.
3. Expose a narrow method in `electron/preload.cjs`.
4. Add the method to the `Window.divex` declaration in `src/types.ts`.
5. Return a structured result instead of throwing raw process output into UI
   state.

Do not build shell command strings from renderer input. Prefer executable plus
argument arrays.

## Crash recovery

Place a `FeatureErrorBoundary` around any new heavy or optional renderer
feature. Give it a reset key that changes when the project or feature identity
changes, and provide at least one action that returns to a known-safe state.

Use `reportRendererError` for unexpected global renderer failures. Do not write
diagnostics directly from React; send them through the preload bridge so
Electron controls the destination and size limits. Never include project source
contents, secrets, or environment variables in a report.

## Map conventions

- Graph builders describe meaning; they do not calculate pixel positions.
- Layout modules are pure wherever practical and do not access DOM state.
- Visualizer components own gestures, viewport state, and mounted elements.
- Custom positions overlay automatic positions and remain independent per map.
- Relationship filtering derives a visual subset and never mutates the analyzed
  project.
- Large-map thresholds and budgets have one source of truth in
  `logicalWorkflowPerformance.ts`.

## Project-loading conventions

- Directory walking gathers candidates before source reads begin.
- Do not follow symbolic links during project scans.
- Keep filesystem concurrency bounded; increasing it may hurt slower disks.
- Cache validation uses relative path, byte size, and modification time.
- The cache is an optimization only and must never be the source of truth.
- Worker responses must include their request ID, and stale workers must be
  terminated during effect cleanup.
- React should continue rendering the previous valid graph until the newest
  analysis completes or the loading overlay is shown.

## Navigation conventions

- Search/index functions remain pure and return paths and one-based lines.
- A result may include a symbol ID, but the path and line remain the reliable
  editor destination.
- Commands execute application actions; they do not duplicate those actions.
- Back/forward applies stored locations without adding new history entries.
- Workspace text search operates only on files already present in the current
  analyzed project.
- Keep navigation result counts bounded before adding richer previews.

## Build strategy

The 2D project map is part of the initial renderer because it is the default
experience. The logic map and editor are dynamically imported.

Vite creates:

- a React vendor chunk
- an icon vendor chunk
- an editor-engine chunk for Ace
- dynamic feature chunks for the editor and logic map
- hashed entry, chunk, and asset paths

Do not statically import Ace or the logic renderer into application startup.
After changing imports, inspect `dist/index.html` and ensure the editor engine
is not preloaded.

## Before handing off changes

```bash
npm run check
git diff --check
npm ls --depth=0
```

Then complete the manual smoke test in [Testing](TESTING.md), including the
large-project path when changing graph construction, layout, or rendering.
