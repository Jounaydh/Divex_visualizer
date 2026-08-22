# Codebase study guide

This is the shortest route to understanding Divex without reading every file.
The code is organized by ownership: Electron owns trusted desktop operations,
analysis adapters own language parsing, and renderer feature folders own UI.

## Read the application in this order

1. `src/types.ts` — shared project, graph, desktop, Git, and terminal contracts.
2. `electron/preload.cjs` — the complete renderer-to-desktop API surface.
3. `src/App.tsx` — application-level state and cross-feature coordination.
4. `src/analysis/analyzeProject.ts` — raw files to the shared analyzed model.
5. `src/analysis/languages/registry.ts` — language adapter dispatch.
6. `src/app/VisualizerWorkspace.tsx` — map/editor composition.
7. One folder under `src/features/` for the feature being changed.
8. The matching Electron service when the feature needs files or processes.

Do not start with `src/styles.css` or a visualizer component. Those make more
sense after the shared model and feature boundary are understood.

## Main data flow

```text
Native or WSL folder
  -> electron/project/loader.cjs
  -> ProjectPayload through preload
  -> background analysis worker
  -> language adapters
  -> AnalyzedProject
  -> Project map / Logic map / Inspector / Navigation / Editor
```

Saving takes the reverse route through a narrow preload method. A successful
save updates the payload and starts a fresh worker analysis. Git and terminal
state remain separate from the analyzed graph.

## Where to edit

| Goal | Start here |
| --- | --- |
| Project opening, caching, or supported files | `electron/project/` |
| WSL detection, paths, and commands | `electron/platform/wsl.cjs` |
| Git behavior | `electron/source-control/git.cjs` |
| PTY sessions or external terminals | `electron/terminal/` |
| Workspace trust persistence and enforcement | `electron/security/workspace-trust.cjs`, `electron/main.cjs` |
| First-open trust dialog and Restricted Mode banner | `src/features/workspace-trust/` |
| Python, Dart, Java, web parsing | `src/analysis/languages/` |
| Application menus and shared state | `src/App.tsx`, then `src/app/` |
| Project map | `src/features/project-map/` |
| Logic map | `src/features/logic-map/` |
| Editor tabs and commands | `src/features/editor/CodeEditor.tsx` |
| Editor recovery | `src/features/editor/useEditorRecovery.ts`, `EditorRecoveryDialog.tsx` |
| Debug adapters and DAP protocol | `electron/debug/service.cjs` |
| Debugger UI and session state | `src/features/debugger/` |
| Explorer UI, shortcuts, and name rules | `src/features/explorer/` |
| Root-contained Explorer file operations | `electron/project/mutations.cjs` |
| Search and navigation | `src/features/navigation/` |
| Source-control UI | `src/features/source-control/` |
| Project-specific preferences and live refresh | `src/features/project-settings/` |
| Terminal UI | `src/features/terminal/` |
| Divex Mini | `src/mini/` |
| Shared colors and layout styling | the named sections in `src/styles.css` |

## Boundary rules

- React never receives unrestricted Node.js access.
- Desktop methods validate the project root and keep file paths inside it.
- The renderer sends task IDs, never arbitrary command strings.
- Every process-launching IPC route verifies the persisted per-root trust
  decision; a renderer flag cannot grant execution permission.
- Language adapters return shared types and never render UI.
- Graph builders define meaning; layout modules calculate positions; visualizer
  components own interaction and DOM rendering.
- WSL projects keep Linux execution inside their selected distribution while
  Windows hosts Electron and accesses files through a WSL UNC path.

## How to make a safe change

1. Find the owning folder using the table above.
2. Read its tests and public types before changing implementation.
3. Keep new behavior inside that owner unless another feature truly shares it.
4. Add or update a focused test.
5. Run `npm run check`.
6. For WSL changes, also run `npm run test:wsl` on Windows.
7. Update the relevant focused document, not every document.

## Intentionally large files

- `src/App.tsx` is the cross-feature composition root. Feature-specific logic
  should move out; shared selection and workspace lifecycle remain here.
- `src/styles.css` is one generated production entry but is divided by labeled
  feature sections. Keep selectors in the matching section.
- `electron/main.cjs` owns windows, dialogs, IPC registration, and crash
  recovery. Reusable filesystem, task, WSL, Git, and terminal logic belongs in
  the service directories beside it.

See [Architecture](ARCHITECTURE.md) for detailed runtime reasoning and
[Development](DEVELOPMENT.md) for commands and extension procedures.
