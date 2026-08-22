# Project status

## Implemented

- Electron desktop shell with context isolation and a narrow preload bridge
- Native folder picker and supported-file scanning
- Native and WSL project opening with environment-aware paths and execution
- Complete native/WSL Explorer file management with create, duplicate, rename,
  conflict-safe copy/move, drag-and-drop, deletion, shortcuts, and empty folders
- Metadata-first scanning, bounded parallel reads, cached refreshes, streamed
  progress, and cancelable worker analysis
- Quick file/symbol/text/command navigation, definitions, references, exact-line
  editor reveal, and back/forward history
- Local Git initialization, branches, diffs, staging, commits, stash, guarded
  discard, fetch, fast-forward pull, and safe push
- Persistent per-project workspace/Git settings and native/WSL live refresh
- Dart/Flutter, Python, Java, TypeScript/TSX, HTML, JavaScript, and CSS lightweight analysis
- 2D expandable project structure map
- Logical code workflow with nine relationship categories
- Selection inspector, symbol list, guided mode, and advanced mode
- Map directions, zoom, fullscreen, free positioning, and two-axis panning
- Large-graph protected mode, explicit full-map override, and viewport culling
- Lazy logic-map and source-editor loading
- Feature-level error boundaries, local diagnostics, safe-mode reload, and
  repeated-crash-loop protection
- Multi-document Ace editing with two editor groups, minimaps, pinned/preview
  tabs, recently closed files, embedded diffs, workspace diagnostics,
  external-change conflict protection, save/save-all, Dart format, outline,
  and preferences
- Crash-safe editor journals, startup restore/discard workflow, failed-save
  preservation, and atomic root-contained native/WSL saves
- Profile-aware integrated/external terminals with tabs, split panes, search,
  web links, custom/detected task runs, clickable problems, restart,
  termination, resize, and exit state
- Managed Python and Dart/Flutter debugging with breakpoints, stepping,
  variables, call stacks, source navigation, and native/WSL execution
- Persistent first-open workspace trust and Electron-enforced Restricted Mode
  for terminals, tasks, scripts, analysis tools, and debugging
- Global/per-window renderer sandboxing, deny-by-default CSP, blocked browser
  permissions/navigation/webviews, and sender/frame/role/project-scoped IPC
- Explicit project-script risk/permission details and a fail-closed policy that
  disables third-party extensions until an isolated extension host exists
- Windows NSIS and portable packaging while retaining the previous installer
- Feature-oriented source structure and engineering documentation
- Python compile/pytest task discovery and tested WSL project loading, saving,
  Git, execution routing, and live refresh

## Partial

| Area | Current state | Needed for IDE quality |
| --- | --- | --- |
| Dart semantics | Lightweight static extraction with inferred links | Dart language server/analyzer evidence and source ranges |
| Non-Dart languages | Dedicated lightweight symbol/dependency adapters and editor modes | LSP-backed semantics and richer call relationships |
| Editor | Multi-document Ace sessions, two groups, pinned/preview tabs, minimaps, diffs, diagnostics, conflict protection, symbols, settings, recovery journals, and atomic saves | LSP completion/signatures, semantic diagnostics, merge editing, and persistent workspace layouts |
| Navigation | In-memory search across loaded files and inferred semantic references | Persistent index, LSP definitions/references, recent locations across sessions |
| Terminal | Interactive profiles, tabs, splits, search, links, custom/detected tasks, problem matchers, active-file runs, and lifecycle controls | Persistent process reconnection and richer process supervision |
| Source control | Status, diffs, staging, commits, branches, stash, guarded discard, fetch, fast-forward pull, and push | History graph, merge/rebase UI, conflict editor, and credential onboarding |
| Project loading | Up to 2,000 supported files, cached contents loaded after metadata scan and analyzed in a worker | Filesystem watchers, on-demand editor content, persistent index |
| WSL | Project files, Linux Git/tools, paths, tasks, terminals, and polling refresh | Remote environments, per-distribution toolchains, and richer connection diagnostics |
| Logic map | Static/inferred semantic relationships | LSP call hierarchy, runtime overlay, source evidence, saved group layouts |
| Packaging | Branded Windows installer and portable builds with signature verification tooling; current artifacts are unsigned | Trusted code-signing certificate, notarization, and auto-update |

## Planned

- Monaco or Theia-based IDE-quality editor
- Language Server Protocol client
- Debugger and test explorer
- Database schemas and code-to-database relationships
- Optional local AI explanations based on trusted parser and language-service
  evidence
- Isolated extension-host process and per-extension permissions before enabling
  any third-party extension support
- Installers, updates, settings, workspace trust, and telemetry controls

## Known limitations

- The current Dart parser does not resolve every dynamic call, alias, generic,
  extension method, generated file, or framework callback.
- A forced full map can still take time to lay out; the override is intended for
  computers with enough memory and CPU.
- The initial folder scan is capped at 2,000 files and skips files larger than
  2 MiB.
- Only configured source and project-file extensions are loaded.
- WSL live refresh uses bounded polling because Windows does not expose the
  recursive watcher used for native folders.
- File contents currently live in renderer project state.
- The project cache is in memory and is cleared when the Electron process exits.
- Automated coverage includes containment, loading, and navigation but not the
  analyzer, layout engine, or full Electron workflows.
- The Ask Divex button is intentionally disabled; AI is not implemented.

## Next recommended milestone

Add deterministic automated tests for Dart analysis and logical graph scoping,
then introduce a document service boundary. Those two steps reduce regression
risk before replacing the editor or adding language servers.
