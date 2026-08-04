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
- Supports Dart, Java, Python, YAML, JSON, Gradle, and properties file modes
  where Ace provides them.
- Saves through validated Electron IPC.
- Formats Dart files with the locally installed Dart SDK.
- Runs `flutter analyze --no-pub` for an opened Flutter project and shows the
  command result.
- Is code-split with the Ace engine so users who only explore maps do not pay
  the editor startup cost.

## Tasks and terminal commands

- Detects npm scripts and common Flutter, Maven, Gradle, Python, and Java tasks.
- Runs a selected task, the detected build task, or a supported active file.
- Opens the operating system terminal at the project or selected directory.
- Shows task results in the app.

These commands are an early IDE bridge. A persistent integrated terminal,
process supervisor, debugger, and test explorer remain roadmap work.

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
