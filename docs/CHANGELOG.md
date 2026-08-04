# Change history

This records the current prototype's completed work. The repository does not
yet use formal releases.

## Unreleased

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
