# Explorer file management

Divex provides complete file and folder operations for the supported project
files shown in opened native Windows and WSL projects. The Explorer is not only
a visualization: successful changes are written to the actual opened project
and then reflected in the tree, maps, editor, navigation index, and Divex Mini.

## Available actions

| Action | Toolbar | Context menu | Shortcut | Drag |
| --- | --- | --- | --- | --- |
| New file | Yes | Yes | `Ctrl/Cmd+N` | — |
| New folder | Yes | Yes | `Ctrl/Cmd+Shift+N` | — |
| Duplicate | — | Yes | `Ctrl/Cmd+D` | — |
| Cut / copy / paste | — | Yes | `Ctrl/Cmd+X/C/V` | — |
| Move | — | Cut/paste | Cut/paste shortcuts | Drop on a folder, file, or blank space |
| Rename | — | Yes | `F2` | — |
| Delete | — | Yes | `Delete` or `Cmd+Backspace` | — |
| Refresh | Yes | Yes | — | — |

New items created from a file row use that file's parent directory. Dropping on
a file also targets its parent directory. Dropping on blank Explorer space
moves the item to the project root.

## Conflict and data-loss policy

- Create and move never replace an existing destination. Divex reports the
  collision and proposes a numbered alternative such as `main 2.py`.
- Copy and duplicate choose an unused `copy`, `copy 2`, and later name.
- A folder cannot be copied or moved into itself or one of its descendants.
- Every renderer path is resolved again inside Electron and must remain below
  the currently opened project root.
- Names use Windows-compatible rules, including reserved device names and
  invalid punctuation, so projects remain portable between Windows and WSL.
- Symbolic links and ignored dependency/build directories are not loaded into
  the Explorer.
- Native Windows deletion uses the Recycle Bin. WSL deletion is permanently
  removed only after an explicit warning because Windows cannot recycle WSL
  files.

## Implementation map

- `src/features/explorer/FileExplorer.tsx` owns the toolbar, menu, shortcuts,
  and drag/drop interaction.
- `src/App.tsx` coordinates project refresh and demo-session equivalents.
- `electron/preload.cjs` exposes narrow operation-specific IPC calls.
- `electron/project/mutations.cjs` owns validated create, duplicate, copy, and
  move behavior.
- `electron/project/paths.cjs` owns project-root containment and entry names.
- `electron/project/loader.cjs` returns supported file contents plus explicit
  folder paths so empty folders survive analysis.

Focused automated coverage lives in
`src/features/explorer/FileExplorer.test.tsx` and
`electron/project/mutations.test.ts`.
