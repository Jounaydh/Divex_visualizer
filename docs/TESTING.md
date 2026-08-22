# Testing guide

## Automated validation

Run the complete local gate before committing:

```bash
npm run check
```

This runs containment tests, strict TypeScript validation, and a production
Vite build. It also runs the seven-language integration verification.
For faster iteration:

```bash
npm run typecheck
npm run test
npm run build
```

On Windows with WSL installed, also run:

```powershell
npm run test:windows
npm run test:wsl
```

The native Windows smoke test uses a disposable project to verify loading,
task detection, Git status, atomic editing, file watching, the real integrated
terminal, and a Python debug session with a breakpoint, call stack, scopes,
variables, and Continue. It also confirms this checkout is on the intended
Windows branch. Install `debugpy` first if the app has not already offered to
set it up: `py -3 -m pip install --user debugpy`.

The WSL smoke test verifies a real temporary Linux project: loading, Python
task discovery, Linux Git, file editing, and live change detection. It removes
only its validated `/tmp/divex-wsl-smoke.*` directory afterward.

Also verify:

```bash
git diff --check
npm ls --depth=0
```

`git diff --check` finds whitespace errors. `npm ls --depth=0` should not show
unused top-level packages.

## Build-output checks

After `npm run build`:

- `dist/index.html` should load the normal entry and stable vendor chunks.
- The logic-map feature should be emitted as a dynamic chunk.
- `MiniApp` should be emitted as a small dynamic chunk and should not include
  Ace, Xterm, or source-control code.
- The editor UI and `editor-engine` should be emitted as dynamic chunks.
- The production HTML should not preload the editor engine.
- No chunk should unexpectedly absorb all Ace modes or retired 3D libraries.

Ace is intentionally large but optional. A warning about the editor engine is
acceptable while its raw chunk remains lazy.

## Desktop smoke test

Start the development application:

```bash
npm run dev
```

Check:

1. The built-in Flutter project appears without an error.
2. **File → Open Folder…** opens the native picker.
   On Windows, **File → Open WSL Folder…** should also open the detected Linux
   distribution and show its WSL label on the selected project.
4. A file selection opens its inspector details and symbol list.
5. The 2D map is the default tab.
6. Double-clicking map folders/files expands or collapses their children.
7. The 2D map pans horizontally and vertically, zooms, and focuses selection.
8. Every direction option produces an organized layout.
9. Free positioning moves a card and reset restores automatic placement.
10. The Logic map tab displays its loading state once, then the workflow.
11. Relationship filters and both presets update the map.
12. Focus-selected-links fades unrelated content.
13. The logic controls can stay open while the canvas is moved above, below,
    left, or right.
14. **View source code** opens the syntax-colored editor.
15. Editing then saving changes the file and clears the dirty state.
16. Dart format and Flutter analyze return a useful success or failure message.
17. Fullscreen enters and exits without losing map state.
18. Reloading or switching back to the demo does not leave stale selection.
19. The loading overlay moves from folder scanning to file reading and then
    background analysis.
20. A second refresh reports cached files and rereads only modified sources.
21. `Command/Ctrl+P` opens files and reveals the selected source.
22. Symbol and text results open the expected one-based editor line.
23. Back and forward move between map/editor locations without duplicating
    history.
24. Find References shows incoming calls/imports for a selected symbol or file.
25. The command palette can switch maps and modes and refresh the project.
26. `Control+Shift+G` opens Source Control for a local Git project.
27. Working, staged, untracked, and conflicted files appear in the correct
    groups.
28. A working or staged diff opens without blocking the desktop window.
29. Per-file and all-file stage/unstage actions refresh the visible status.
30. A commit is disabled without both staged changes and a non-empty message.
31. `Command/Ctrl+Enter` creates a commit when those conditions are satisfied.
32. Loading the demo or a non-repository shows a useful empty state.
33. `Control+Backtick` opens a shell inside the docked terminal.
34. Typed commands produce output and a new prompt without launching another
    application.
35. Creating multiple sessions preserves each tab's output and working state.
36. Hiding and reopening the dock preserves running sessions.
37. Resizing the dock updates Xterm and the PTY without malformed output.
38. A detected task streams output and records its exit code.
39. `Command/Ctrl+Shift+B` starts the detected build task in a terminal tab.
40. Restart reruns the active task/file definition and termination stops it.
41. Changing projects or closing the renderer terminates owned sessions.
42. **New Terminal Window** still opens the operating-system fallback.
43. Open two source files and confirm both appear as editor tabs.
44. Edit the first file, switch tabs, then return and confirm its text, cursor,
    scroll position, and undo history remain intact.
45. Return to a map, reopen source view, and confirm open tabs and unsaved
    buffers remain.
46. Close a dirty tab and test Cancel, Don't save, and Save and close.
47. Save all writes every dirty open document and clears all dirty markers.
48. Clicking an Explorer file while source view is active opens another tab
    instead of returning to the map.
49. Find, replace, undo, redo, breadcrumbs, and symbol navigation operate on
    the active document.
50. Font size, wrap, whitespace, and tab-size settings apply across open tabs.
51. Flutter Analyze saves dirty buffers first and adds matching gutter
    annotations and a status-bar problem count.
52. **File → Open Divex Mini** opens a separate 720 × 520 companion window.
53. Resize Mini to 420 × 320 and confirm its map tabs, search, live control,
    pin control, zoom controls, and status remain reachable.
54. Switch Mini between 2D and Logic without loading the workbench UI.
55. Save a supported source file in another editor and confirm Mini reports an
    update and refreshes the affected graph.
56. Save several files quickly and confirm they produce one debounced refresh.
57. Pause live updates, edit a file, and confirm the pending change is applied
    after Resume.
58. Search for a file and symbol, select each result, and open the selected file
    in the associated external editor.
59. Toggle always-on-top, close Mini, reopen it, and confirm its pin state,
    position, size, selected map, and live preference are restored.
60. Create a root file and a nested empty folder from the Explorer toolbar and
    context menu; both appear without reopening the project.
61. Create an item with an existing name and confirm Divex suggests a unique
    name without changing the existing item.
62. Duplicate a file twice and confirm `copy` and `copy 2` names are used.
63. Drag a file into a folder, drag it back to blank Explorer space, and confirm
    the tree and maps refresh at each destination.
64. Attempt to drag a folder into one of its descendants and confirm the move
    is blocked without data loss.
65. Verify new file, new folder, duplicate, cut, copy, paste, rename, and delete
    keyboard shortcuts on focused Explorer rows.
66. Repeat create, duplicate, move, and conflict checks in a WSL project; verify
    Linux tools see the resulting Linux paths.
67. Change Project Settings, reopen the project, and confirm its view, direction,
    new-file type, live refresh, and Git preferences persist only for that root.
68. Disable live refresh, edit externally, and confirm the workbench waits;
    enable it and confirm native or WSL edits reload automatically.
69. Create and switch branches from Source Control and confirm Explorer and
    clean editor content update to the selected branch.
70. Fetch, fast-forward pull, and push against a test remote; confirm pull does
    not create an implicit merge commit and push never forces.
71. Stash tracked and untracked work, restore it, and confirm the project model
    refreshes after both actions.
72. Cancel discard confirmation and verify no data changes. Then confirm
    per-file and all-changes discard only in a disposable repository.
73. Edit without saving, wait for **Recovery protected**, terminate Divex, and
    reopen the project; confirm the recovery dialog appears automatically.
74. Restore one buffer and save it, then restart and confirm its journal is gone.
75. Discard another recovered buffer and confirm the disk file remains unchanged.
76. Make several tabs dirty, restore all available files, and confirm every
    buffer returns as unsaved with its independent content.
77. Force a save failure and confirm the editor stays dirty and recovery remains
    protected.
78. Save native Windows and WSL files and verify no `.divex-save-*.tmp` or
    `.divex-format-*` artifacts remain.
79. Open a Python or Dart file, click its editor gutter, and confirm the
    breakpoint appears in both the gutter and Debug sidebar after a restart.
80. Press `F5`; if Python requests `debugpy`, choose the setup action and retry.
81. Pause at a breakpoint and confirm the source line opens automatically.
82. Inspect local variables, expand an object value, and switch call-stack
    frames; variables and source location must follow the selected frame.
83. Verify `F5`, `F6`, `F10`, `F11`, `Shift+F11`, and `Shift+F5` continue,
    pause, step over, step in, step out, and stop respectively.
84. Repeat a Python debug session in WSL and confirm Linux paths appear in the
    adapter while Divex still opens the matching project-relative source file.
85. Close the Electron window with a session running and confirm no adapter or
    debuggee process remains.
86. Open a local folder with no saved trust decision and confirm the first-open
    dialog requires **Trust Workspace** or **Open in Restricted Mode**.
87. Choose Restricted Mode and confirm terminals, tasks, Run Active File,
    external file launching, Flutter analysis, debugging, and adapter setup are
    disabled while reading, editing, file management, maps, and Git remain
    available.
88. Attempt the restricted execution methods through the preload API and
    confirm Electron rejects them even without relying on disabled buttons.
89. Trust the workspace from the project menu and confirm execution controls
    become available without reopening the folder.
90. Reopen the folder and confirm the trust decision is remembered only for
    that exact native or WSL root.
91. Revoke trust with a terminal or debugger running and confirm the owned
    sessions stop and Restricted Mode returns immediately.
92. Open the terminal profile menu and confirm only installed Windows shells
    appear; open each available profile inside Divex and externally.
93. Open a WSL project and confirm its distribution shell and Bash profile both
    start in the Linux project directory.
94. Split the terminal, type independently in both panes, close the split, and
    confirm neither session loses its output.
95. Use `Ctrl+F`, Enter, and Shift+Enter to move through terminal matches.
96. Open an HTTP/HTTPS terminal link and confirm it uses the default browser;
    confirm unsupported protocols are rejected.
97. Create `divex.tasks.json` from the task menu, add a valid task, save, and
    run it both inside Divex and in the selected external profile.
98. Add an invalid group, absolute `cwd`, or duplicate custom task ID and
    confirm task loading reports the configuration error without executing it.
99. Run a task that prints file/line diagnostics and confirm Problems opens the
    matching source line while the original terminal output remains intact.
100. Switch the workspace to Restricted Mode and confirm profiles, custom task
     discovery, integrated runs, external runs, and terminal links are blocked.
101. Open `.ts`, `.tsx`, `.mts`, `.cts`, and `.d.ts` files and confirm they are
     scanned, labeled TypeScript, syntax highlighted, watched, and editable.
102. Confirm interfaces, type aliases, enums, namespaces, constructors, typed
     functions, methods, variables, and TSX components appear in maps, outline,
     navigation, and the Inspector.
103. Resolve local type-only, mixed JS/TS, extensionless, and `index.ts` imports
     and confirm external package imports remain external.
104. Open a project containing `tsconfig.json`, run **TypeScript: Check**, and
     confirm compiler diagnostics appear as clickable terminal Problems.
105. Run an erasable `.ts` active file with Node.js 22 and confirm `.tsx` is not
     incorrectly offered as a directly executable file.
106. Single-click several Explorer files and confirm one clean preview tab is
     replaced; edit or pin one and confirm it remains open.
107. Close files, reopen one from History, then use `Command/Ctrl+Shift+T` for
     the next and confirm their editor buffers open normally.
108. Split the editor, choose different files in each group, and confirm focus,
     save, undo, breakpoints, cursor movement, and minimap navigation target the
     intended group.
109. Toggle the minimap, open the diff panel, and confirm the active buffer is
     compared with its last saved content without changing either version.
110. Edit a file in Divex and externally before saving. Confirm the disk version
     appears in Compare, Save is blocked, Keep mine preserves the local buffer,
     and Reload disk replaces it only after an explicit choice.
111. Run Flutter Analyze and confirm every parsed result appears in Workspace
     diagnostics and opens the matching file and line.
112. Inspect `dist/index.html` and confirm its CSP has `default-src 'none'`,
     `script-src 'self'`, no `unsafe-eval`, and no production network origin.
113. Open the workspace-trust dialog in restricted and trusted states. Confirm
     every permission is labeled Allowed or Blocked, scripts describe inherited
     user/network access, and extensions remain blocked in both states.
114. Attempt page navigation, a popup, a webview, and a browser permission from
     a disposable development fixture; each must be denied.
115. From IPC security tests, verify unregistered windows, subframes, remote
     URLs, another window's project root, and Mini-only forbidden channels are
     rejected before their handler executes.
116. Confirm the packaged workbench and Mini still load with sandboxing enabled
     and that Mini can refresh/watch its bound project but cannot create a
     terminal or invoke a write handler.

## Crash-containment checks

The automated boundary tests deliberately throw a child render error and verify
that:

- the crash is replaced by the containment screen
- technical details and safe reload remain accessible
- a recovery action clears the boundary before remounting the feature

For a manual Electron test:

1. Trigger a development-only renderer exception.
2. Confirm the active canvas is replaced while the rest of the workspace stays
   mounted.
3. Confirm retry and feature reset remount the active view.
4. Confirm safe reload opens the 2D map with a recovery notice.
5. Inspect the Electron user-data `logs/renderer-errors.jsonl` file.
6. Simulate renderer termination twice and confirm the second failure does not
   enter an automatic reload loop.

## Large-repository stress test

Use a Flutter application with thousands of symbols and relationships.

1. Open the project and switch to Logic map.
2. Confirm protected mode is enabled when the threshold is crossed.
3. Confirm the UI remains responsive while panning and selecting cards.
4. Select a distant file or symbol and confirm the working set rebuilds around
   it.
5. Enable every relationship and inspect the displayed totals.
6. Use **Force full map** only after the protected path passes.
7. Confirm off-screen cards and lines are not mounted.
8. Pan through the full stage and confirm routes do not produce an enormous,
   warped SVG surface.
9. Restore protection and confirm the map contracts without reopening the
   project.

The test should be repeated on the supported baseline hardware, not only a
developer workstation.

## Test gaps

The repository tests crash containment, loader filtering/progress/cache reuse,
changed-file reads, navigation search, definition/reference lookup, history,
Git porcelain parsing, Git path containment, and stage/unstage state
transitions, plus PTY directory containment, ownership, stream, resize, exit,
and termination behavior, project-watcher filtering and debouncing, plus
Flutter analyzer diagnostic parsing, editor preview/recent tab rules, diff-row
construction, external-conflict classification, CSP construction, sandboxed
window policy, IPC sender/frame/project authorization, extension denial, and
workspace permission details. It does not yet have analyzer, layout, or full
Electron integration coverage.
Highest-priority additions are:

- fixtures for Dart symbols, imports, calls, and type relationships
- deterministic layout and routing tests
- protected-mode scoping and limit tests
- Electron path-validation and file-action tests
- Playwright Electron smoke tests for both maps and the editor
