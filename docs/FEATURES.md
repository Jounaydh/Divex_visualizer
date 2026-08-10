# Current feature inventory

This document records what the Divex prototype does now. Features described as
planned are kept in [Project status](PROJECT_STATUS.md) and the
[IDE roadmap](IDE_ROADMAP.md).

## Desktop workspace

- Runs as an Electron desktop application with an Apple-like grayscale visual
  system.
- Opens a local folder through the native operating-system picker.
- Includes the same open-folder action in the header File menu, project menu,
  and sidebar.
- Loads a built-in Flutter project when no local project is required.
- Keeps the browser renderer isolated from Node.js and exposes filesystem and
  process operations through a narrow preload API.

## Project explorer

- Shows folders and supported files in a collapsible tree on the right side of
  the visual workspace.
- Selects folders, files, and code symbols without requiring coding knowledge.
- Displays project totals for files, relationships, and symbols.
- Offers context actions for refresh, rename, delete, absolute or relative path
  copying, reveal in the operating system, external open, terminal open, share,
  cut, copy, and paste where the host supports them.
- Ignores generated or dependency-heavy folders such as `.git`, `.dart_tool`,
  `build`, `dist`, and `node_modules`.

## Project loading

- Scans folders and supported-file metadata before reading source contents.
- Skips symbolic links, oversized files, hidden folders, generated output, and
  dependency directories.
- Checks metadata and reads source with a bounded 16-operation concurrency
  limit instead of one serial file at a time.
- Keeps an in-memory least-recently-used cache for three projects.
- Reuses unchanged file contents when path, size, and modification time match.
- Reads only new or changed supported files during refresh and file operations.
- Emits scanning and reading progress with completed and total counts.
- Moves project parsing and graph analysis into a dedicated Web Worker.
- Cancels a stale analysis worker when another project version arrives.
- Keeps the last valid analyzed graph if background analysis fails and offers
  retry or demo-project recovery.

## Divex Mini companion

- Opens from **File → Open Divex Mini** after a local project is loaded.
- Runs in a separate resizable window with only the 2D Flow and Logic maps.
- Starts at 720 × 520 and supports a 420 × 320 minimum layout.
- Watches supported project files and debounces filesystem changes.
- Uses the project loader cache so refreshes reread only new or modified files.
- Rebuilds analysis in the existing cancelable background worker while keeping
  the last valid map visible.
- Preserves the active map viewport during live project revisions instead of
  forcing the project root back to the center.
- Can pause updates, accumulate changed paths, and process them after resume.
- Searches files and code symbols from the compact title bar.
- Keeps a compact View menu for map direction, free positioning, and layout
  reset controls.
- Opens the selected file in its operating-system-associated editor.
- Persists map choice, live-update preference, window bounds, and
  always-on-top state.
- Keeps protected logic-map rendering enabled for large repositories.

## IDE navigation

- Adds a centered project-search control to the desktop title bar.
- Opens files by fuzzy name or path with `Command/Ctrl+P`.
- Opens the command palette with `Command/Ctrl+Shift+P`.
- Searches classes, widgets, functions, methods, and signatures with
  `Command/Ctrl+Shift+O`.
- Searches text across every loaded project file with
  `Command/Ctrl+Shift+F`.
- Opens file, symbol, text, and reference results directly in the source editor
  at the exact line.
- Resolves the selected file or symbol to its definition.
- Finds incoming semantic relationships and importing files for the selected
  node.
- Keeps up to 100 distinct map/editor locations and navigates backward or
  forward with title-bar buttons or `Option/Alt+Left/Right`.
- Includes commands for project refresh/open, map switching, source view,
  guided/advanced mode, and free positioning.
- Uses keyboard result selection, Enter to open, and Escape to close.

## Git source control

- Switches the left sidebar between Explorer and Source Control.
- Opens Source Control with `Control+Shift+G` or the command palette.
- Detects the current branch, detached HEAD state, and upstream ahead/behind
  counts.
- Separates staged changes from working-tree and untracked changes.
- Opens a changed source file directly in the Divex editor.
- Previews staged and unstaged unified diffs without launching an external
  process window.
- Stages or unstages one file or all changes in the opened project.
- Creates a commit from staged changes with `Command/Ctrl+Enter`.
- Refreshes when the project changes, when the window regains focus, or when
  the user requests it.
- Constrains file actions to paths inside the opened project and executes fixed
  Git argument arrays rather than renderer-provided shell commands.
- Does not expose discard, force, reset-hard, push, or credential operations.

## 2D project map

- Is the default and prioritized visualization.
- Arranges the project from top to bottom by default, with bottom-up,
  left-to-right, and right-to-left alternatives.
- Treats folders and files as expandable containers; double-clicking opens or
  closes their children.
- Allows multiple branches to remain open in the 2D view.
- Shows containment with solid white lines and imports with thinner gray dashed
  lines.
- Repositions nodes with smooth movement when branches open and keeps the
  selected item in view.
- Supports independent zoom, reset/focus controls, trackpad or wheel movement,
  keyboard arrow movement, click-drag panning, and optional free card
  positioning.

## Logical workflow map

- Replaces the earlier experimental 3D view with a second 2D graph focused on
  code meaning rather than folder shape.
- Builds cards for the project, files, functions, methods, constructors,
  classes, widgets, external packages, and inferred external APIs.
- Displays labeled, directed relationships:
  - starts
  - calls
  - creates
  - defines
  - extends
  - implements
  - uses
  - imports
  - contains
- Opens with a simpler execution-flow preset and allows every relationship or
  any custom combination.
- Can fade unrelated cards and links around the selected item.
- Uses a layered layout with crossing reduction, cycle handling, obstacle-aware
  orthogonal routes, and separate routing channels.
- Supports all map directions, independent zoom, fullscreen, keyboard
  movement, free two-axis panning, and manual card positioning.
- Provides generous blank canvas around the generated graph so the user can
  move the code above, below, left, or right when the logic controls cover part
  of the map.

## Large-project protection

- Detects when the selected relationship set is large or extremely connected.
- Defaults to a connected working set centered on the project and current
  selection.
- Rebuilds that working set when another card is selected.
- Offers **Load full map** for large graphs and an explicit **Force full map**
  override for very large graphs.
- Offers **Restore protection** without reloading the project.
- Mounts only cards and SVG paths near the viewport, even in full-map mode.
- Caps simultaneously rendered lines and keeps the SVG surface close to the
  visible area instead of allocating a single enormous surface.
- Defers loading the entire logic-map feature until the Logic map tab is
  requested.

## Crash containment and recovery

- Contains source-editor, project-map, and logic-map render failures inside the
  visual canvas so the explorer and inspector remain usable.
- Shows a plain-language recovery screen with an incident ID and collapsible
  technical details.
- Can retry the failed feature, reset its positions and zoom, return to the 2D
  map, or reload the renderer in safe mode.
- Captures React boundary errors, global browser errors, and unhandled promise
  rejections.
- Writes bounded JSON diagnostics to the Electron user-data `logs` directory.
- Automatically reloads the first terminated renderer process in safe mode.
- Detects repeated renderer crashes within one minute and stops automatic reload
  loops by presenting an explicit reload-or-close choice.
- Detects an unresponsive renderer and lets the user keep waiting or recover in
  safe mode.
- Reports development-only warnings when logic graph construction, layout, or
  routing occupies the renderer for at least 50 milliseconds.

## Inspector and learning modes

- Explains the selected file, code symbol, or relationship in plain language.
- Shows lines, symbol counts, outgoing imports, incoming imports, and logical
  connections.
- Includes a collapsible symbol list for the active file.
- Navigates between related files and symbols from relationship cards.
- Provides Guided and Advanced modes so beginners start with a simpler
  explanation while experienced developers can inspect more detail.

## Source editor

- Opens in place of the active map from **View source code**.
- Uses the open-source Ace editor with line numbers, familiar selection
  behavior, and syntax coloring.
- Opens multiple files as tabs and keeps one Ace EditSession per document.
- Preserves each tab's text buffer, undo history, cursor, and scroll position
  while switching files.
- Keeps editor sessions mounted when returning temporarily to a visual map.
- Opens Explorer files in new editor tabs while source view is active.
- Marks unsaved tabs and reports the total number of dirty open documents.
- Protects dirty tab closure with Save and close, Don't save, and Cancel
  choices.
- Warns the desktop runtime when open buffers are dirty during a window close
  or reload.
- Saves the current document with `Command/Ctrl+S` and can save every dirty
  tab in one action.
- Adds undo, redo, find, and replace controls backed by Ace commands.
- Shows project/file breadcrumbs and the code symbol containing the cursor.
- Provides a per-file symbol outline that navigates directly to definitions.
- Supports font sizing, word wrap, whitespace visibility, and 2/4-space tab
  preferences.
- Supports Dart, Java, Python, YAML, JSON, Gradle, and properties file modes
  where Ace provides them.
- Saves through validated Electron IPC.
- Formats Dart files with the locally installed Dart SDK.
- Runs `flutter analyze --no-pub` for an opened Flutter project and shows the
  command result.
- Parses Flutter analyzer output into Ace gutter annotations for open files and
  reports the project problem count in the editor status bar.
- Is code-split with the Ace engine so users who only explore maps do not pay
  the editor startup cost.

## Integrated terminal and tasks

- Opens a docked interactive terminal with `Control+Backtick`.
- Uses Xterm.js for terminal rendering and node-pty for a real pseudoterminal.
- Supports multiple shell, task, and active-file sessions as tabs.
- Streams terminal output directly to Xterm without placing every output chunk
  in React state.
- Preserves active sessions when the panel is hidden.
- Resizes the PTY when the dock or application window changes size.
- Resizes the dock with pointer dragging, keyboard arrows, or a double-click
  reset.
- Restarts the active shell, task, or file run from its trusted definition.
- Terminates one session or closes every session.
- Shows running/exited state and task exit codes.
- Keeps an explicit operating-system terminal fallback.
- Discovers npm scripts and Flutter, Maven, Gradle, Make, Python, and Java
  project tasks.
- Runs detected tasks and supported active files inside managed terminal tabs.
- Runs build tasks with `Command/Ctrl+Shift+B`.
- Limits each Electron window to 12 terminal sessions and bounds individual
  renderer input messages.
- Owns terminal sessions by Electron renderer and kills them on renderer
  destruction, project changes, or explicit closure.

## Current analyzer coverage

Dart and Flutter analysis currently extracts:

- imports and resolved project-local imports
- classes, widgets, functions, methods, and constructors
- parent/child symbol relationships
- entry points, calls, object creation, inheritance, interfaces, and type usage
- external package and inferred API nodes

This is a lightweight static parser suitable for visualization, not a complete
Dart semantic engine. Java and Python files are visible and editable, but their
dedicated semantic relationship adapters are not implemented yet.
