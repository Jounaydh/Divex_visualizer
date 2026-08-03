# Divex Visualizer

Divex Visualizer is a desktop-first code exploration tool that turns a project
into a conventional project map and a logical code workflow. Its first analyzer
targets Dart and Flutter, while its internal project and graph models are
intentionally language-neutral.

## Current prototype

- VS Code-style project explorer
- Native desktop folder picker
- Expandable and collapsible folder groups
- File-to-file import relationships
- File drill-down into Flutter widgets, classes, functions, and methods
- Logical workflow for entry points, calls, object creation, inheritance,
  interfaces, type usage, and internal or external imports
- Relationship filters, labeled directional links, selection focus, panning,
  zooming, and free card positioning
- Direct source-code inspection
- Guided and advanced inspection modes
- Built-in Flutter demonstration project

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts the renderer and opens the Electron desktop window.

Validation commands:

```bash
npm run typecheck
npm run build
```

## Documentation

- [Development and architecture guide](docs/DEVELOPMENT.md)
- [Full IDE roadmap](docs/IDE_ROADMAP.md)
- `src/app/` contains the application shell and view orchestration.
- `src/analysis/languages/` is the extension point for language analyzers.
- `src/visualization/` contains the project and logical graph builders.

## Analyzer architecture

Every language add-on will convert its source files into the same internal
project graph:

```text
Language adapter
  -> files, symbols, dependencies, and relationships
  -> shared Divex graph
  -> project map and logical workflow renderers
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
