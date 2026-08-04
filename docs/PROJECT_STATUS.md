# Project status

## Implemented

- Electron desktop shell with context isolation and a narrow preload bridge
- Native folder picker and supported-file scanning
- Project explorer with common desktop file actions
- Dart and Flutter lightweight static analysis
- 2D expandable project structure map
- Logical code workflow with nine relationship categories
- Selection inspector, symbol list, guided mode, and advanced mode
- Map directions, zoom, fullscreen, free positioning, and two-axis panning
- Large-graph protected mode, explicit full-map override, and viewport culling
- Lazy logic-map and source-editor loading
- Feature-level error boundaries, local diagnostics, safe-mode reload, and
  repeated-crash-loop protection
- Ace source editing, save, Dart format, and Flutter analysis
- Project task discovery and external terminal/task launching
- Feature-oriented source structure and engineering documentation

## Partial

| Area | Current state | Needed for IDE quality |
| --- | --- | --- |
| Dart semantics | Lightweight static extraction with inferred links | Dart language server/analyzer evidence and source ranges |
| Java and Python | Files can be scanned, displayed, edited, and run in supported cases | Dedicated analyzers followed by LSP integrations |
| Editor | One Ace editor view with save and Flutter actions | Document models, tabs, splits, diagnostics, completion, undo recovery |
| Terminal | Opens an operating-system terminal and executes detected tasks | Embedded persistent terminal and process supervisor |
| Project loading | Up to 2,000 supported files, contents loaded during scan | Incremental metadata scan, watchers, on-demand content, worker indexing |
| Logic map | Static/inferred semantic relationships | LSP call hierarchy, runtime overlay, source evidence, saved group layouts |
| Packaging | Development and renderer production builds | Signed installers, notarization, auto-update, crash recovery |

## Planned

- Java and Python language packs
- JavaScript and TypeScript support
- Monaco or Theia-based IDE-quality editor
- Language Server Protocol client
- Integrated terminal, tasks, search, source control, debugger, and tests
- Database schemas and code-to-database relationships
- Optional local AI explanations based on trusted parser and language-service
  evidence
- Extension isolation and permissions
- Installers, updates, settings, workspace trust, and telemetry controls

## Known limitations

- The current Dart parser does not resolve every dynamic call, alias, generic,
  extension method, generated file, or framework callback.
- A forced full map can still take time to lay out; the override is intended for
  computers with enough memory and CPU.
- The initial folder scan is capped at 2,000 files and skips files larger than
  2 MiB.
- Only configured source and project-file extensions are loaded.
- File contents currently live in renderer project state.
- Automated coverage currently focuses only on crash-boundary recovery.
- Disabled terminal menu items are visual placeholders for roadmap work.
- The Ask Divex button is intentionally disabled; AI is not implemented.

## Next recommended milestone

Add deterministic automated tests for Dart analysis and logical graph scoping,
then introduce a document service boundary. Those two steps reduce regression
risk before replacing the editor or adding language servers.
