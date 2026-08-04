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

The repository now contains initial component tests for crash containment but
does not yet have analyzer, layout, or Electron integration coverage.
Highest-priority additions are:

- fixtures for Dart symbols, imports, calls, and type relationships
- deterministic layout and routing tests
- protected-mode scoping and limit tests
- Electron path-validation and file-action tests
- Playwright Electron smoke tests for both maps and the editor
