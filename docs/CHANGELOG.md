# Change history

This records the current prototype's completed work. The repository does not
yet use formal releases.

## 0.8.0 — 2026-08-19

For the baseline, implementation files, tests, generated packages, and current
handoff status, see the detailed
[Windows changes since the Mac/V2 sync](WINDOWS_CHANGES_SINCE_MAC_SYNC.md).

### Windows UI reliability

- Corrected the application-shell grid rows so the workspace fills the full
  Electron window instead of collapsing into the upper portion of the screen.
- Kept the workspace-trust banner and terminal dock in their own rows so either
  feature can open without shrinking or overlapping the main workbench.
- Added a layout regression test and visually checked the maps, fullscreen
  mode, editor tools, side panels, and maximized Windows layout.

### Final security hardening

- Added a deny-by-default production Content Security Policy with self-only
  scripts, connections, and workers and no inline/evaluated scripts.
- Enforced the Chromium sandbox globally and per window, retained context
  isolation, and disabled renderer/subframe Node.js, webviews, experimental
  features, insecure content, browser permissions, popups, and page navigation.
- Routed every IPC handler through registered-window, main-frame, renderer-URL,
  window-role, and active-project-root authorization.
- Limited Divex Mini to the small IPC allowlist required by its companion view.
- Expanded workspace trust with exact project-script permission and risk
  details, including user-account filesystem/network access and no auto-run.
- Added a fail-closed extension policy that keeps third-party and in-process
  extensions disabled until a capability-scoped separate host exists.
- Added focused CSP, window policy, IPC authorization, extension policy, trust
  service, and trust-dialog tests.

### Advanced editor workspace

- Added two independently focused editor groups that share each file's Ace
  session, breakpoints, annotations, buffer, and undo history.
- Added toggleable clickable minimaps and an embedded side-by-side comparison
  against the active file's saved or externally changed version.
- Added preview tabs, explicit/double-click pinning, a bounded recently closed
  menu, and `Command/Ctrl+Shift+T` restoration.
- Added a workspace diagnostics panel for analyzer results and unresolved
  external file changes with exact-line navigation.
- Added three-way external-change detection that preserves dirty buffers and
  blocks overwrite until the user keeps the local buffer or reloads disk.
- Added focused tests for preview replacement, recent-file history, diff rows,
  and external-conflict classification.

### TypeScript and TSX support

- Added `.ts`, `.tsx`, `.mts`, `.cts`, and declaration-file scanning, watching,
  editor modes, project settings, language summaries, and map integration.
- Added lightweight TypeScript extraction for classes, interfaces, types,
  enums, namespaces, constructors, typed functions/methods/variables, and TSX
  components, with local mixed JavaScript/TypeScript import resolution.
- Added detected `tsconfig.json` checking, terminal problem matching, and
  Node.js 22 active-file execution for erasable TypeScript syntax.

### Improved terminals and tasks

- Added installed PowerShell, Windows PowerShell, Command Prompt, Git Bash, and
  WSL shell profiles shared by integrated and external terminals.
- Added split panes, scrollback search, safe clickable web links, and per-root
  profile memory.
- Added validated `divex.tasks.json` custom tasks with integrated/external run
  actions and bounded executable-plus-argument definitions.
- Added incremental task problem matching and clickable source locations for
  Dart, Python, TypeScript, Java, GCC, and common compiler output.

### Workspace trust

- Added a remembered per-folder trust decision with an explicit first-open
  choice between Trust Workspace and Restricted Mode.
- Added a Restricted Mode banner, trust-management dialog, project-menu action,
  command-palette action, and trust revocation.
- Disabled terminals, task discovery/execution, active-file runs, external file
  launches, Flutter analysis, debugger launches, and adapter installation for
  untrusted native and WSL folders.
- Enforced trust inside Electron and stopped owned terminal/debug sessions when
  trust is revoked.
- Added persistence, malformed-store, prompt, banner, and restricted Explorer
  tests.

### Debugger integration

- Added a managed Debug Adapter Protocol client with framed messaging,
  timeouts, session ownership, and native/WSL source-path translation.
- Added Python `debugpy` and Dart/Flutter adapter launches without exposing
  arbitrary executables or launch configurations to the renderer.
- Added persistent editor-gutter breakpoints, current-line decoration,
  continue/pause/stop, and step over/into/out controls.
- Added variables, nested values, scopes, call stacks, source navigation, and
  a bounded Debug Console.
- Added explicit one-click Python adapter setup and focused protocol/UI tests.

### Source organization

- Split editor recovery lifecycle, recovery UI, language helpers, and document
  contracts out of the editor coordinator into focused modules.
- Moved project live-refresh ownership into the project-settings feature.
- Centralized cross-platform Explorer filename rules and added focused tests.
- Corrected and expanded the documented directory map and code ownership guide.

### Recovery and dependable editing

- Added disk-backed, per-project recovery journals for unsaved editor buffers.
- Added automatic recovery discovery and per-file/bulk restore or discard UI.
- Added recovery status feedback, hidden-window flushing, and failed-save
  preservation across multiple open tabs.
- Replaced direct saves with root-contained, symlink-safe, synced temporary
  writes followed by atomic replacement.
- Routed native and WSL Dart formatting through temporary copies and the atomic
  save boundary.
- Added atomic-save and recovery-storage tests.

### Git workflow and project settings

- Added repository initialization, branch creation/switching, fetch,
  fast-forward-only pull, non-force push, and tracked/untracked stashing.
- Added confirmed per-file and all-working-tree discard actions while keeping
  staged content intact.
- Added persistent project defaults for map layout, new-file type, native/WSL
  live refresh, Git focus refresh, and discard confirmation.
- Refreshes the project model after Git operations that change files.
- Added Git service, Source Control, settings storage, and settings-dialog tests.

### Complete file management

- Added Explorer toolbar and context actions for creating files and folders,
  duplicating entries, and refreshing the project.
- Added keyboard shortcuts and drag-and-drop moves between folders or back to
  the project root.
- Centralized create, duplicate, copy, and move behavior in a root-contained
  Electron service shared by native Windows and WSL projects.
- Added non-destructive conflict handling with deterministic suggested names;
  file operations never silently overwrite an existing destination.
- Preserved empty folders in project payloads and WSL watcher snapshots so
  directory-only changes remain visible and trigger refreshes.
- Added service, loader, watcher, and Explorer interaction tests.

### Codebase organization, Python, and WSL

- Organized Electron project, platform, source-control, and terminal services
  into focused directories and removed task/path/process logic from the desktop
  entrypoint.
- Centralized supported-file and ignored-directory policy for loading and live
  watching, including Python TOML/INI/CFG/text project files.
- Confirmed Python symbol/import analysis with focused tests and added detected
  compile and pytest tasks for standard Python projects.
- Added WSL distribution discovery and a dedicated WSL folder picker.
- Added environment-aware Linux paths, Git, tasks, active-file execution,
  formatting/analyzer routing, integrated terminals, and external terminals.
- Added WSL polling refresh after verifying that recursive Windows file events
  are unavailable for `\\wsl.localhost` projects.
- Added a real Ubuntu smoke test for loading, Python tasks, Linux Git, saving,
  and live refresh, plus focused WSL/path/task tests.
- Added codebase, language-support, and WSL study documentation.

### Windows V2 integration

- Made Ctrl+wheel zoom advance in controlled 10-percentage-point steps and
  preserve the pointer's map location in both Project and Logic views.
- Anchored toolbar zoom to the current viewport center and removed conflicting
  scroll-surface size animation that caused bottom-right drift.
- Integrated the complete crash-containment/IDE feature line into the Windows
  desktop branch.
- Matched the current Mac/V2 visualization workspace with focused 2D Project
  and Logic maps, removing the retired experimental 3D renderer.
- Added Dart/Flutter, Python, Java, HTML, JavaScript, and CSS adapters and Ace
  modes to the V2 worker, navigation, explorer, editor, inspector, and maps.
- Restored NSIS and portable Windows packaging, relative packaged assets,
  Windows title-bar controls, SDK command discovery, and the previous installer.
- Added Windows-portable watcher and terminal tests and removed duplicate
  pre-V2 component trees.

### Divex Mini companion

- Added a separate compact renderer containing only the 2D and Logic maps.
- Added debounced live-on-save project watching with cached changed-file reads
  and background relationship analysis.
- Added compact file/symbol search, pause/resume, always-on-top, external file
  opening, update status, and changed-path feedback.
- Kept the View menu with direction, free-positioning, and reset controls in
  the compact window.
- Persisted Mini window bounds, pin state, selected map, and live preference.
- Added a File-menu launcher and project-watcher filtering/debounce tests.

### Product foundation

- Created the Divex desktop workspace with an Apple-like grayscale interface.
- Added a VS Code-style project explorer and native folder opening.
- Added a built-in Flutter demonstration project.
- Made the 2D project map the default, prioritized visualization.

### Project map

- Added top-down, bottom-up, left-to-right, and right-to-left layouts.
- Added expandable folders, files, and symbol bubbles.
- Kept multiple branches open in the 2D view.
- Added smooth refocus, independent zoom, keyboard movement, two-axis panning,
  fullscreen, free positioning, and reset.
- Standardized containment links as white and import links as thinner gray.

### Logical workflow

- Replaced the experimental 3D visualization with a logical workflow map.
- Added starts, calls, creates, defines, extends, implements, uses, imports, and
  contains relationships.
- Added execution and all-relationship presets, per-kind filters, directed
  labels, and selected-link focus.
- Added layered graph placement, crossing reduction, cycle handling, and
  obstacle-aware orthogonal routing.
- Added free vertical and horizontal canvas movement around the complete map.

### Large-project stability

- Reproduced the failure using a large Flutter application with thousands of
  symbols and relationships.
- Added protected connected-neighborhood rendering for large maps.
- Added full-map and explicit force-full overrides plus restore protection.
- Added viewport card and edge culling, viewport-sized SVG rendering, route
  limits, frame-grouped viewport updates, and non-recursive cycle analysis.
- Removed project-specific wording from the reusable protection UI.

### Source and desktop tools

- Integrated the open-source Ace editor with syntax coloring.
- Added file saving, Dart formatting, and Flutter analysis.
- Added symbol navigation in the inspector.
- Added common explorer file operations.
- Added task discovery and commands for Flutter, npm, Maven, Gradle, Python,
  and Java projects.

### Organization and build

- Reorganized large UI areas into `src/features/`.
- Separated logical graph construction, layout, performance policy, controls,
  and rendering.
- Kept shared components small and cross-feature.
- Lazy-loaded both the logic map and source editor.
- Split React, icons, and the Ace engine into cacheable production chunks.
- Added architecture, feature, performance, testing, status, history, and IDE
  roadmap documentation.

### Crash containment

- Added application and feature-level React error boundaries.
- Added retry, map reset, 2D fallback, and safe-mode recovery controls.
- Added global browser and unhandled-promise reporting through validated IPC.
- Added bounded JSONL diagnostics in the Electron user-data logs directory.
- Added automatic first-crash recovery and repeated-crash-loop prevention.
- Added unresponsive-renderer recovery choices.
- Added slow logic-map operation warnings in development.
- Added Vitest and Testing Library with initial containment tests.

### Project loading

- Split project loading into a dedicated Electron module.
- Added metadata-first discovery and bounded parallel metadata/content work.
- Added a three-project LRU source-content cache.
- Changed refreshes to reread only new or modified supported files.
- Added live scanning and reading progress through the preload bridge.
- Moved project analysis to a cancelable Web Worker.
- Added safe retry behavior that preserves the last valid analyzed graph.
- Added loader tests for ignored folders, progress, cache reuse, and changed
  files.
- Verified Kader loading with 194 supported files, zero rereads on cached
  refresh, and 5,708 relationships analyzed in the background worker.

### IDE navigation

- Added a unified project navigation and command palette.
- Added fuzzy file and symbol lookup plus workspace text search.
- Added selected-definition and incoming-reference navigation.
- Added exact-line source reveal in the Ace editor.
- Added title-bar back and forward controls with bounded location history.
- Added keyboard shortcuts for files, commands, symbols, text, and history.
- Added navigation index and history tests.

### Git source control

- Added a Source Control sidebar with branch and upstream status.
- Added staged, working, untracked, and conflict-aware change lists.
- Added bounded staged/working diff previews and editor file opening.
- Added per-file and all-file stage/unstage actions.
- Added commit-message validation and commits for staged changes.
- Added a constrained Electron Git service with root/path validation, fixed
  argument arrays, command limits, and structured errors.
- Added Git parsing, containment, diff, staging, and unstaging tests.

### Integrated terminal and tasks

- Added a lazy Xterm.js dock backed by owned node-pty sessions.
- Added multiple shell, task, and active-file terminal tabs.
- Added direct streamed output, ANSI rendering, interactive input, scrollback,
  fitting, and resizable panel height.
- Added task selection, build shortcut, restart, terminate, close-all, and exit
  status controls.
- Routed detected tasks and supported active files into the integrated terminal
  while preserving an external-terminal fallback.
- Added strict project-directory containment, input/session limits, renderer
  ownership, and automatic session cleanup.
- Added terminal service tests and native runtime validation.
- Added a clean-install helper for node-pty's macOS spawn-helper permission.

### Editor workspace upgrade

- Replaced the single replaceable editor buffer with persistent per-file Ace
  EditSessions.
- Added multi-file tabs with independent buffers, undo, cursor, and scroll
  state.
- Preserved editor sessions while moving between source view and visual maps.
- Added dirty indicators, save-all, before-unload protection, and a safe dirty
  tab close dialog.
- Added undo, redo, find, replace, breadcrumbs, current-symbol context, and a
  navigable file outline.
- Added font size, word-wrap, whitespace, and tab-size preferences.
- Kept Explorer file selection inside the editor while source view is active.
- Added Flutter analyzer diagnostic parsing, gutter annotations, problem
  counts, and parser tests.
- Fixed destroyed Ace session reuse exposed by React development lifecycle
  verification.
