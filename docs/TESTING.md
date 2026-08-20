# Testing guide

## Automated validation

Run the complete local gate before committing:

```bash
npm run check
```

This runs containment tests, strict TypeScript validation, and a production
Vite build.
For faster iteration:

```bash
npm run typecheck
npm run test
npm run build
```

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
  Monaco, Xterm, or source-control code.
- The editor UI and `editor-engine` should be emitted as dynamic chunks.
- The production HTML should not preload the editor engine.
- No initial chunk should unexpectedly absorb Monaco or retired 3D libraries.

Monaco is intentionally large but optional. A warning about the editor engine is
acceptable while its raw chunk remains lazy.

## Desktop smoke test

Start the development application:

```bash
npm run dev
```

Check:

1. The built-in Flutter project appears without an error.
2. **File → Open Folder…** opens the native picker.
3. Explorer folders expand and collapse.
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
51. Flutter Analyze saves dirty buffers first and adds matching Monaco markers
    and a status-bar problem count.
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

## Workspace-trust checks

1. Open a folder that has never been trusted and confirm the Restricted Mode
   banner appears.
2. Confirm maps, search, source viewing/editing, reveal, copy, and Mini work.
3. Confirm terminal, task, active-file run, external open, Git, Dart format, and
   Flutter analysis controls are unavailable.
4. Invoke a protected preload method from DevTools and confirm Electron still
   returns a Restricted Mode error.
5. Trust the folder from the banner or File menu, accept the warning, and
   confirm protected tools become available.
6. Restart Divex and confirm trust persists for that exact folder.
7. Open a sibling or child folder and confirm it remains restricted.
8. Revoke trust while a terminal is running and confirm the session closes and
   protected tools become unavailable immediately.

## Packaged-application checks

Run `npm run package` for an unpacked current-platform smoke test. Before a
public release, run the native installer command on each target OS and follow
the complete checklist in [Distribution](DISTRIBUTION.md). Confirm the app icon,
editor, maps, Mini, terminal native binary, trust persistence, and uninstall
behavior from an installed build.

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

The repository tests crash containment, versioned relationship evidence,
SQL tables/columns/keys, foreign-key resolution, Dart database access links,
loader filtering/progress/cache reuse,
changed-file reads, navigation search, definition/reference lookup, history,
Git porcelain parsing, Git path containment, and stage/unstage state
transitions, plus PTY directory containment, ownership, stream, resize, exit,
and termination behavior, project-watcher filtering and debouncing, Flutter
analyzer diagnostic parsing, exact-folder trust persistence/privacy, and
restricted Source Control behavior. It does not yet have broad analyzer,
  layout, or full Electron integration coverage.
Highest-priority additions are:

- fixtures for Dart symbols, imports, calls, and type relationships
- deterministic layout and routing tests
- protected-mode scoping and limit tests
- Electron path-validation and file-action tests
- Playwright Electron smoke tests for both maps and the editor
- dialect fixtures for PostgreSQL schemas, SQLite migrations, MySQL quoting,
  database views, and ORM-generated SQL
