# Divex Visualizer

Divex Visualizer is a beginner-friendly desktop code explorer. It turns a
project into an interactive structure map and a logical workflow so people can
see where code lives, what it contains, and how its parts connect.

The current prototype is built with Electron, React, TypeScript, and Vite. Dart
and Flutter are the first fully analyzed language family; Java and Python files
can be opened but still need dedicated semantic analyzers.

## What works today

- Native folder opening and a VS Code-style project explorer
- Persistent per-folder Workspace Trust with Restricted Mode enforced by the
  renderer and Electron IPC boundary
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
- Selectable relationship lines with provider, confidence, exact source and
  target ranges, document fingerprints, and direct source-line navigation
- Guided and advanced inspection modes with incoming and outgoing links
- Direction controls, fullscreen, free positioning, independent zoom, keyboard
  scrolling, and free two-axis canvas panning
- Protected rendering for highly connected repositories, with an explicit
  full-map override for capable computers
- Crash boundaries for each visual feature, safe-mode renderer recovery, and
  persistent local diagnostics
- Lazy-loaded multi-document Monaco workspace with URI-backed models, independent
  undo/view state, tabs, breadcrumbs, symbols, save-all, and analyzer problems
- Lazy-loaded docked Xterm terminal with multiple interactive PTY sessions,
  resizing, restart, termination, and an external-terminal fallback
- Detected Flutter, npm, Maven, Gradle, Python, and Java tasks that run inside
  managed terminal tabs with live output and exit status
- A built-in Flutter demonstration project
- A lightweight Divex Mini companion window with only the 2D and Logic maps,
  live-on-save project watching, search, always-on-top, and external file open
- Read-only SQL database discovery with tables, columns, primary keys, foreign
  keys, and evidence-backed code-to-table reads and writes

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

`npm run check` runs strict TypeScript validation and creates a production
renderer build.

Create an unpacked desktop application with `npm run package`. Installer
commands and signing requirements are documented in
[Distribution](docs/DISTRIBUTION.md).

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
- [Distribution](docs/DISTRIBUTION.md)
- [Performance and large maps](docs/PERFORMANCE.md)
- [Testing guide](docs/TESTING.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Change history](docs/CHANGELOG.md)
- [Full IDE roadmap](docs/IDE_ROADMAP.md)

## Language and data-provider direction

Every analyzer should convert its source into the shared Divex project and
semantic graph. The intended order is:

1. Dart and Flutter — current foundation
2. Java
3. Python
4. JavaScript and TypeScript
5. Additional languages as independent adapters

The first database provider now analyzes SQL schemas and common SQL/Dart data
access without credentials or live database writes. Later providers can add
read-only live connections, ORM models, migrations, indexes, and observed data
flow to the same graph. A future local AI layer may explain trusted analysis
results, but it should never replace the parser, compiler, or language service.
