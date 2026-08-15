# Divex Visualizer

Divex Visualizer is a beginner-friendly desktop code explorer. It turns a
project into an interactive structure map and a logical workflow so people can
see where code lives, what it contains, and how its parts connect.

The current prototype is built with Electron, React, TypeScript, and Vite.
Shared language adapters analyze Dart/Flutter, Python, Java, HTML, JavaScript,
and CSS, while the richer logical call graph currently remains Dart-focused.

## What works today

- Native folder opening and a VS Code-style project explorer
- Metadata-first project scanning, cached refreshes, bounded parallel reads,
  background analysis, and visible loading progress
- Quick file, symbol, workspace-text, command, definition, and reference
  navigation with back/forward history
- Local Git status, branch tracking, diff preview, staging, and commits from a
  dedicated Source Control sidebar
- File actions including refresh, rename, delete, copy, paste, reveal, share,
  open externally, and open in a terminal
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
- Lazy-loaded multi-document Ace workspace with tabs, independent undo/buffers,
  breadcrumbs, symbols, settings, save-all, Dart format, and analyzer problems
- Lazy-loaded docked Xterm terminal with multiple interactive PTY sessions,
  resizing, restart, termination, and an external-terminal fallback
- Detected Flutter, npm, Maven, Gradle, Python, and Java tasks that run inside
  managed terminal tabs with live output and exit status
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

```bash
npm install
npm run dev
```

Validation:

```bash
npm run check
```

`npm run check` runs unit tests, six-language adapter verification, strict
TypeScript validation, and a production renderer build.

Windows packages:

```bash
npm run pack:win
npm run dist:win
```

Existing installers are retained in `release/`. New builds use version 0.3.2
and do not overwrite earlier packages.

## Project structure

```text
electron/                    Desktop window, filesystem, tasks, and safe IPC
src/
├── analysis/                Language-neutral analysis and language adapters
├── app/                     Workbench shell and cross-feature composition
├── components/              Small shared presentation components
├── config/                  Shared configuration
├── data/                    Built-in demonstration project
├── mini/                    Lightweight live companion-window renderer
├── features/
│   ├── editor/              Source editor and Flutter actions
│   ├── explorer/            Project file tree
│   ├── inspector/           Selection and relationship details
│   ├── logic-map/           Semantic graph, layout, controls, and safeguards
│   ├── navigation/          File, symbol, text, command, and history navigation
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
- [Development guide](docs/DEVELOPMENT.md)
- [Performance and large maps](docs/PERFORMANCE.md)
- [Testing guide](docs/TESTING.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Change history](docs/CHANGELOG.md)
- [Full IDE roadmap](docs/IDE_ROADMAP.md)

## Language support

Every analyzer converts its source into the shared Divex project graph:

1. Dart and Flutter
2. Python
3. Java
4. JavaScript
5. HTML
6. CSS

Ace syntax highlighting and local dependency mapping cover all six adapters.
The Logic map adds deeper call, creation, inheritance, interface, and type-use
relationships for Dart.

Database providers will later add schemas, tables, columns, foreign keys, ORM
models, and code-to-database data flow to the same graph. A future local AI
layer may explain trusted analysis results, but it should never replace the
parser, compiler, or language service.
