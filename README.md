# Divex Visualizer

Divex Visualizer is a beginner-friendly desktop code explorer. It turns a
project into an interactive structure map and a logical workflow so people can
see where code lives, what it contains, and how its parts connect.

The current prototype is built with Electron, React, TypeScript, and Vite.
Shared language adapters analyze Dart/Flutter, Python, Java, TypeScript/TSX,
JavaScript, HTML, and CSS, while the richer logical call graph currently
remains Dart-focused.

## What works today

- Native folder opening and a VS Code-style project explorer
- Direct WSL project opening on Windows, including Linux paths, Git, tasks,
  editing, analysis, and live refresh
- Metadata-first project scanning, cached refreshes, bounded parallel reads,
  background analysis, and visible loading progress
- Quick file, symbol, workspace-text, command, definition, and reference
  navigation with back/forward history
- Local Git status, branch creation/switching, diff preview, staging, commits,
  stash, guarded discard, fetch, fast-forward pull, and non-force push from a
  dedicated Source Control sidebar
- Persistent per-project workspace and Git settings, including live refresh,
  default map layout, new-file type, and destructive-action confirmation
- Complete Explorer file management: create files/folders, duplicate, rename,
  delete, cut/copy/paste, drag-and-drop moves, refresh, reveal, share, external
  open, terminal open, and path copying
- Expandable 2D project map for folders, files, symbols, and imports
- Logical workflow map for starts, calls, object creation, definitions,
  inheritance, interfaces, type usage, containment, and imports
- Guided and advanced inspection modes with incoming and outgoing links
- Direction controls, fullscreen, free positioning, independent zoom, keyboard
  scrolling, and free two-axis canvas panning
- Protected rendering for highly connected repositories, with an explicit
  full-map override for capable computers
- Crash boundaries for each visual feature, safe-mode renderer recovery, and
  persistent local diagnostics
- Lazy-loaded multi-document Ace workspace with split panes, minimaps, pinned
  and preview tabs, recently closed files, side-by-side diffs, workspace
  diagnostics, external-change conflict protection, atomic disk writes, and
  crash-recovery journals for unsaved buffers
- Lazy-loaded docked Xterm terminal with Windows/WSL shell profiles, tabs,
  splits, output search, clickable links, restart, termination, and matching
  external-terminal launches
- Managed Python and Dart/Flutter debugging with persistent breakpoints,
  stepping, variables, call stacks, source navigation, and native/WSL adapters
- First-open workspace trust with a remembered Restricted Mode that blocks
  terminals, tasks, project execution, analysis commands, and debugging
- Sandboxed, context-isolated renderers with a deny-by-default CSP, blocked
  navigation/browser permissions, sender/frame/project-scoped IPC, and a
  fail-closed third-party extension policy
- Detected and validated custom project tasks that run inside Divex or the
  selected external terminal, with live output, exit status, and clickable
  build problems
- A built-in Flutter demonstration project
- A lightweight Divex Mini companion window with only the 2D and Logic maps,
  live-on-save project watching, search, always-on-top, and external file open
- Windows NSIS and portable packaging with relative packaged assets,
  native title-bar controls, SDK command discovery, and bundled PTY support

See [Features](docs/FEATURES.md) for the complete behavior inventory and
[Project status](docs/PROJECT_STATUS.md) for implemented, partial, and planned
work.

## Run locally

Requirements:

- Node.js 22.12 or newer
- npm
- Flutter and Dart on `PATH` for Flutter-specific commands
- Optional: WSL 2 with an installed distribution for Linux projects on Windows

```bash
npm install
npm run dev
```

Validation:

```bash
npm run check
```

`npm run check` runs unit tests, seven-language adapter verification, strict
TypeScript validation, and a production renderer build.

On this Windows PC, the real WSL integration can also be checked with:

```powershell
npm run test:wsl
```

Windows packages:

```bash
npm run pack:win
npm run dist:win
```

Existing installers are retained in `release/`. New builds use version 0.8.0
and do not overwrite earlier packages.

The Windows executable and installer use the Divex application icon and
publisher metadata from `build/icon.svg` and `package.json`. For a public
signed build, provide a trusted certificate through electron-builder's
`CSC_LINK` and `CSC_KEY_PASSWORD` environment variables, then run:

```powershell
npm run dist:win:signed
```

That command fails closed unless both generated executables have a valid
Authenticode signature. A self-signed certificate does not establish public
publisher reputation and should not be used to bypass SmartScreen.

## Project structure

```text
electron/                    Desktop process and safe IPC
├── debug/                  Managed Debug Adapter Protocol sessions
├── security/               Persistent workspace trust decisions
├── platform/               Windows SDK and WSL integration
├── project/                Paths, loading, mutations, watching, policy, tasks
├── source-control/         Trusted native/WSL Git service
└── terminal/               Integrated and external terminal processes
src/
├── analysis/                Language-neutral analysis and language adapters
├── app/                     Workbench shell and cross-feature composition
├── components/              Small shared presentation components
├── config/                  Shared configuration
├── data/                    Built-in demonstration project
├── mini/                    Lightweight live companion-window renderer
├── features/
│   ├── editor/              Source editor and Flutter actions
│   ├── debugger/            Breakpoints, runtime state, stacks, and variables
│   ├── workspace-trust/     Restricted Mode state, prompt, and controls
│   ├── explorer/            Project file tree
│   ├── inspector/           Selection and relationship details
│   ├── logic-map/           Semantic graph, layout, controls, and safeguards
│   ├── navigation/          File, symbol, text, command, and history navigation
│   ├── project-settings/    Persistent per-project behavior and settings UI
│   ├── source-control/      Local Git status, diffs, staging, and commits
│   ├── terminal/            Interactive sessions and detected task UI
│   └── project-map/         Structure graph, layout, and interaction
├── App.tsx                  Application-level state and desktop coordination
├── styles.css               Shared visual system, grouped by UI region
└── types.ts                 Shared renderer, graph, project, and IPC types
docs/                        Architecture, features, performance, and roadmap
```

Feature code owns feature-specific behavior. `src/components/` is deliberately
limited to UI elements shared by multiple features.

## Documentation

- [Documentation index](docs/README.md)
- [Features](docs/FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Codebase study guide](docs/CODEBASE_GUIDE.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Language support](docs/LANGUAGE_SUPPORT.md)
- [WSL support](docs/WSL.md)
- [Git workflow and project settings](docs/GIT_AND_PROJECT_SETTINGS.md)
- [Editing and recovery](docs/EDITING_AND_RECOVERY.md)
- [Debugging](docs/DEBUGGING.md)
- [Workspace trust](docs/WORKSPACE_TRUST.md)
- [Security model](docs/SECURITY.md)
- [Terminals and tasks](docs/TERMINALS_AND_TASKS.md)
- [Performance and large maps](docs/PERFORMANCE.md)
- [Testing guide](docs/TESTING.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Change history](docs/CHANGELOG.md)
- [Windows changes since the Mac/V2 sync](docs/WINDOWS_CHANGES_SINCE_MAC_SYNC.md)
- [Full IDE roadmap](docs/IDE_ROADMAP.md)

## Language support

Every analyzer converts its source into the shared Divex project graph:

1. Dart and Flutter
2. Python
3. Java
4. JavaScript
5. TypeScript and TSX
6. HTML
7. CSS

Ace syntax highlighting and local dependency mapping cover all seven adapters.
The Logic map adds deeper call, creation, inheritance, interface, and type-use
relationships for Dart.

Database providers will later add schemas, tables, columns, foreign keys, ORM
models, and code-to-database data flow to the same graph. A future local AI
layer may explain trusted analysis results, but it should never replace the
parser, compiler, or language service.
