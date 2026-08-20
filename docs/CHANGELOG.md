# Change history

This records the current prototype's completed work. The repository does not
yet use formal releases.

## Unreleased

### Workspace trust and distribution

- Added persistent exact-folder Workspace Trust with a Restricted Mode banner,
  explicit trust/revoke confirmation, and hashed canonical-path storage.
- Kept safe exploration and editing available while enforcing terminals,
  tasks, run commands, external opens, Git, formatting, and analysis inside the
  Electron IPC boundary.
- Added terminal shutdown on revocation, CSP protection, denied child windows,
  and renderer navigation restrictions.
- Added electron-builder targets for macOS DMG/ZIP, Windows NSIS/ZIP, and Linux
  AppImage/DEB with unpacked `node-pty` native assets.
- Added a Divex application icon, MIT license, local-only release output,
  cross-platform packaging commands, distribution documentation, and trust
  tests.

### Monaco editor

- Replaced Ace with Monaco 0.56 and URI-backed text models.
- Preserved multi-tab buffers, undo history, cursor and scroll view state,
  save flows, symbol navigation, Dart formatting, and Flutter diagnostics.
- Added dedicated editor and JSON worker routing without bundling unused
  CSS, HTML, or TypeScript language-service workers.
- Kept the editor lazy-loaded so map-only and Divex Mini startup stay light.
- Added tested Dart, Java, Python, SQL, JSON, YAML, and plain-text language
  mapping.

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
- Added versioned evidence to every logical edge, including provider,
  confidence, explanation, source proof, and target definition when known.
- Made routed lines keyboard- and pointer-selectable with an evidence card,
  document fingerprints, node focus, and exact-line editor navigation.
- Added evidence summaries to Inspector relationship cards and deterministic
  evidence fixtures covering imports, calls, locations, and version changes.

### Database visualization

- Added watched `.sql` project loading and SQL syntax coloring.
- Added read-only schema extraction for tables, columns, types, nullability,
  primary keys, and inline or table-level foreign keys.
- Added database, table, and column graph cards plus Reads, Writes, and
  References relationships.
- Added common SQL statement and Dart database API detection with versioned
  source evidence and exact-line navigation.
- Added a focused Data flow preset, database Inspector details, demo schema, and
  deterministic database-analysis fixtures.

### Large-project stability

- Reproduced the failure using a large Flutter application with thousands of
  symbols and relationships.
- Added protected connected-neighborhood rendering for large maps.
- Added full-map and explicit force-full overrides plus restore protection.
- Added viewport card and edge culling, viewport-sized SVG rendering, route
  limits, frame-grouped viewport updates, and non-recursive cycle analysis.
- Removed project-specific wording from the reusable protection UI.

### Source and desktop tools

- Added the original syntax-colored editor, later replaced by Monaco in this
  same development line.
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
- Split React, icons, and the editor engine into cacheable production chunks.
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
- Added exact-line source reveal in the source editor, now backed by Monaco.
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

### Editor workspace foundation

- Replaced the single replaceable editor buffer with persistent per-file editor
  documents, now implemented as Monaco models.
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
- Preserved document state through React development lifecycle verification.
