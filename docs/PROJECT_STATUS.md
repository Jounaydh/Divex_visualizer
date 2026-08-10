# Project status

## Implemented

- Electron desktop shell with context isolation and a narrow preload bridge
- Native folder picker and supported-file scanning
- Project explorer with common desktop file actions
- Metadata-first scanning, bounded parallel reads, cached refreshes, streamed
  progress, and cancelable worker analysis
- Quick file/symbol/text/command navigation, definitions, references, exact-line
  editor reveal, and back/forward history
- Local Git branch/status, diff previews, staging, and commits
- Dart and Flutter lightweight static analysis
- 2D expandable project structure map
- Logical code workflow with nine relationship categories
- Selection inspector, symbol list, guided mode, and advanced mode
- Map directions, zoom, fullscreen, free positioning, and two-axis panning
- Large-graph protected mode, explicit full-map override, and viewport culling
- Lazy logic-map and source-editor loading
- Feature-level error boundaries, local diagnostics, safe-mode reload, and
  repeated-crash-loop protection
- Multi-document Ace editing, persistent tab buffers, save/save-all, Dart
  format, Flutter analysis annotations, outline, and preferences
- Multi-session integrated PTY terminal with task/file runs, restart,
  termination, resize, and exit state
- Feature-oriented source structure and engineering documentation

## Partial

| Area | Current state | Needed for IDE quality |
| --- | --- | --- |
| Dart semantics | Lightweight static extraction with inferred links | Dart language server/analyzer evidence and source ranges |
| Java and Python | Files can be scanned, displayed, edited, and run in supported cases | Dedicated analyzers followed by LSP integrations |
| Editor | Multi-document Ace sessions, tabs, persistent buffers/undo, symbols, settings, and Flutter annotations | Splits, LSP completion/signatures, workspace diagnostics panel, recovery journals, and diff editors |
| Navigation | In-memory search across loaded files and inferred semantic references | Persistent index, LSP definitions/references, recent locations across sessions |
| Terminal | Interactive PTY tabs, detected tasks, active-file runs, and process lifecycle controls | Shell profiles, links/search, task problem matchers, persistent reconnection, and richer process supervision |
| Source control | Local status, diffs, staging, and commits | File watching, branch operations, pull/push, merge UI, and credential handling |
| Project loading | Up to 2,000 supported files, cached contents loaded after metadata scan and analyzed in a worker | Filesystem watchers, on-demand editor content, persistent index |
| Logic map | Static/inferred semantic relationships | LSP call hierarchy, runtime overlay, source evidence, saved group layouts |
| Packaging | Development and renderer production builds | Signed installers, notarization, auto-update, crash recovery |

## Planned

- Java and Python language packs
- JavaScript and TypeScript support
- Monaco or Theia-based IDE-quality editor
- Language Server Protocol client
- Debugger and test explorer
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
- The project cache is in memory and is cleared when the Electron process exits.
- Automated coverage includes containment, loading, and navigation but not the
  analyzer, layout engine, or full Electron workflows.
- Terminal splitting and task configuration menu items remain roadmap
  placeholders.
- The Ask Divex button is intentionally disabled; AI is not implemented.

## Next recommended milestone

Add deterministic automated tests for Dart analysis and logical graph scoping,
then introduce a document service boundary. Those two steps reduce regression
risk before replacing the editor or adding language servers.
