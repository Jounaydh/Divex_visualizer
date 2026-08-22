# Development guide

This guide covers local setup, common edit locations, and project conventions.
Read [Architecture](ARCHITECTURE.md) for system boundaries and
[Performance](PERFORMANCE.md) before changing large-map behavior.

## Quick start

Requirements:

- Node.js 22.12 or newer
- npm
- Flutter and Dart only for local Flutter commands
- Optional WSL 2 distribution for Linux-project development on Windows

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
| `npm run test:languages` | Verify all seven language adapters together |
| `npm run test:wsl` | Run the real Windows/WSL integration smoke test |
| `npm run build` | Type-check and build production renderer assets |
| `npm run check` | Run the complete pre-commit validation gate |
| `npm run preview` | Preview the production renderer in a browser |
| `npm run desktop` | Open Electron against the existing renderer URL/build |

## Directory map

```text
.
├── electron/
│   ├── main.cjs                    Native window, project files, tasks, IPC
│   ├── preload.cjs                 Safe window.divex API
│   ├── platform/
│   │   ├── tool-runner.cjs         Native SDK command resolution
│   │   └── wsl.cjs                 WSL detection, paths, and execution
│   ├── project/
│   │   ├── atomic-save.cjs         Dependable file replacement
│   │   ├── file-policy.cjs         Scan/watch file policy
│   │   ├── loader.cjs              Cached metadata-first loading
│   │   ├── mutations.cjs           Safe create/duplicate/copy/move operations
│   │   ├── paths.cjs               Containment and WSL path conversion
│   │   ├── recovery.cjs            Editor recovery journal storage
│   │   ├── tasks.cjs               Trusted detected task definitions
│   │   └── watcher.cjs             Native watch and WSL polling
│   ├── source-control/git.cjs      Constrained native/WSL Git
│   ├── debug/service.cjs           Managed Debug Adapter Protocol client
│   ├── security/
│   │   ├── extension-policy.cjs    Fail-closed third-party extension gate
│   │   ├── ipc-authorization.cjs   Sender, frame, role, and project scope
│   │   ├── window-policy.cjs       Sandbox, navigation, and permissions
│   │   └── workspace-trust.cjs     Persistent per-root execution permission
│   └── terminal/
│       ├── service.cjs             Managed pseudoterminal sessions
│       ├── profiles.cjs            Installed shell profiles
│       └── external-window.cjs     External terminal fallback
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
│   │   │   ├── EditorMinimap.tsx
│   │   │   ├── EditorRecoveryDialog.tsx
│   │   │   ├── EditorWorkbenchPanels.tsx
│   │   │   ├── editorSupport.ts
│   │   │   ├── editorTypes.ts
│   │   │   ├── editorWorkspace.ts
│   │   │   ├── flutterDiagnostics.ts
│   │   │   └── useEditorRecovery.ts
│   │   ├── debugger/
│   │   │   ├── DebugPanel.tsx
│   │   │   └── useDebugger.ts
│   │   ├── explorer/
│   │   │   ├── FileExplorer.tsx
│   │   │   └── explorerNames.ts
│   │   ├── inspector/InspectorPanel.tsx
│   │   ├── navigation/
│   │   │   ├── NavigationPalette.tsx
│   │   │   ├── navigationIndex.ts
│   │   │   └── useNavigationHistory.ts
│   │   ├── project-settings/
│   │   │   ├── ProjectSettingsDialog.tsx
│   │   │   ├── projectSettings.ts
│   │   │   └── useProjectLiveRefresh.ts
│   │   ├── source-control/SourceControlPanel.tsx
│   │   ├── terminal/
│   │   │   ├── TerminalDock.tsx
│   │   │   └── useIntegratedTerminal.ts
│   │   ├── workspace-trust/
│   │   │   ├── WorkspaceTrustUI.tsx
│   │   │   └── useWorkspaceTrust.ts
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
| A language adapter | `src/analysis/languages/` |
| Analysis orchestration or extension recognition | `src/analysis/languages/registry.ts` and `metadata.ts` |
| Scan limits, file caching, or read concurrency | `electron/project/loader.cjs` |
| Supported files and ignored folders | `electron/project/file-policy.cjs` |
| Create, duplicate, copy, paste, or drag-move behavior | `electron/project/mutations.cjs` and `src/features/explorer/FileExplorer.tsx` |
| Atomic saves and crash recovery storage | `electron/project/atomic-save.cjs` and `electron/project/recovery.cjs` |
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
| Editor minimap, diff, diagnostics, preview/recent tab rules, and conflict detection | `src/features/editor/EditorMinimap.tsx`, `EditorWorkbenchPanels.tsx`, and `editorWorkspace.ts` |
| Editor recovery scheduling and restore UI | `src/features/editor/useEditorRecovery.ts` and `EditorRecoveryDialog.tsx` |
| Editor modes, labels, and shared types | `src/features/editor/editorSupport.ts` and `editorTypes.ts` |
| DAP process, framing, requests, and path translation | `electron/debug/service.cjs` |
| Debugger state, UI, frames, variables, and output | `src/features/debugger/` |
| Explorer filename validation | `src/features/explorer/explorerNames.ts` |
| Flutter analyzer output parsing | `src/features/editor/flutterDiagnostics.ts` |
| Search results, definitions, or references | `src/features/navigation/navigationIndex.ts` |
| Command palette UI | `src/features/navigation/NavigationPalette.tsx` |
| Back/forward behavior | `src/features/navigation/useNavigationHistory.ts` |
| Git status, branches, sync, stash, discard, or commits | `electron/source-control/git.cjs` |
| Source Control UI | `src/features/source-control/SourceControlPanel.tsx` |
| Per-project settings, dialog, and live refresh | `src/features/project-settings/` |
| PTY lifecycle, ownership, or limits | `electron/terminal/service.cjs` |
| Windows, macOS, Linux, or WSL shell profiles | `electron/terminal/profiles.cjs` |
| Terminal sessions and streamed output | `src/features/terminal/useIntegratedTerminal.ts` |
| Xterm dock, tabs, resize, or task picker | `src/features/terminal/TerminalDock.tsx` |
| Detected/custom task definitions and validation | `electron/project/tasks.cjs` |
| Terminal diagnostic extraction | `src/features/terminal/problemMatchers.ts` |
| WSL detection, Linux paths, and execution | `electron/platform/wsl.cjs` |
| Workspace trust persistence and execution checks | `electron/security/workspace-trust.cjs` and `electron/main.cjs` |
| IPC sender/frame/project authorization | `electron/security/ipc-authorization.cjs` |
| BrowserWindow sandbox, navigation, popup, webview, and permission policy | `electron/security/window-policy.cjs` |
| Renderer CSP | `src/config/contentSecurityPolicy.ts`, `vite.config.ts`, and `index.html` |
| Third-party extension gate | `electron/security/extension-policy.cjs` |
| First-open trust choice and Restricted Mode UI | `src/features/workspace-trust/` |
| Native filesystem/process behavior | `electron/main.cjs` |
| Safe renderer API | `electron/preload.cjs` and `src/types.ts` |
| Visual styling | `src/styles.css` |

Feature-specific code belongs in its feature folder. Only move an element into
`src/components/` when more than one feature genuinely uses it.

Git changes must use fixed argument arrays in `electron/source-control/git.cjs`.
Never accept a raw Git command or shell fragment from the renderer. Validate
all file paths against the opened project and keep destructive operations out
of the renderer bridge unless they receive a dedicated recovery design.

Terminal task execution follows the same rule: the renderer sends a detected
task ID, and Electron resolves that ID to a trusted executable/argument array.
Do not add a renderer IPC that accepts an arbitrary command string. The
`postinstall` script fixes execute permission on node-pty's prebuilt macOS
helper; keep it when changing package tooling.

Never register a privileged handler directly against Electron's raw `ipcMain`.
The secured wrapper in `electron/main.cjs` must authorize every call before the
handler sees it. A handler that receives `rootPath` is automatically restricted
to the project currently bound to that sender window.

Do not add `session.loadExtension`, renderer extension imports, or extension
execution to the main process. The extension policy must remain disabled until
the isolated-host requirements in [Security](SECURITY.md) are implemented and
reviewed together.

Ace sessions are document state, not disposable render details. When adding
editor features, preserve the rule that switching tabs calls `setSession`
instead of replacing text. Programmatic formatter/project updates must suppress
dirty tracking, and dirty buffers must not be overwritten by background
analysis refreshes.

Both editor groups must attach the existing per-path session. Never create a
second session for a split view. External refreshes may replace a clean session,
but a dirty three-way divergence must remain a conflict until the user keeps
the buffer or reloads disk.

## Adding a language analyzer

Each language adapter should:

1. recognize imports and dependencies
2. extract supported symbols and source lines
3. resolve project-local dependency paths
4. emit shared types from `src/types.ts`

Then update:

- file-kind recognition in `src/analysis/languages/metadata.ts`
- analyzer dispatch in `src/analysis/languages/registry.ts`
- scan coverage in `electron/project/file-policy.cjs`
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
Run `npm run test:wsl` as well when changing project paths, file policy, tasks,
Git, terminal execution, watching, or WSL integration.
