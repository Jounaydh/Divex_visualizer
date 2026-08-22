# Performance and large logic maps

Divex must remain usable on the target baseline of a 2019 MacBook while still
allowing stronger computers to display an entire highly connected graph.

## Why large maps previously failed

A repository can create far more relationships than files. The Kader Flutter
project used during development produced approximately 2,294 logical nodes and
8,634 edges when every detected relationship was enabled.

The original full-map path attempted to:

- lay out every card in one synchronous renderer update
- calculate many routes against every possible obstacle
- mount thousands of React elements and SVG paths
- create an SVG surface as large as the complete graph

That combination can exhaust renderer memory, block the UI thread, or make the
Electron window appear to crash. It is application behavior, not simply a weak
laptop.

## Current protection model

The policy lives in
`src/features/logic-map/logicalWorkflowPerformance.ts`.

| Setting | Current value | Purpose |
| --- | ---: | --- |
| Large node threshold | 450 | Enable connected working-set mode |
| Large edge threshold | 900 | Enable connected working-set mode |
| Very large node threshold | 1,200 | Label the explicit override as force-full |
| Very large edge threshold | 3,000 | Label the explicit override as force-full |
| Working-set node budget | 180 | Maximum nearby nodes in protected mode |
| Working-set edge budget | 320 | Maximum nearby edges in protected mode |
| Viewport edge cap | 420 | Maximum simultaneously mounted SVG paths |
| Viewport overscan | 420 graph pixels | Prevent pop-in near the viewport |
| Free pan padding | 1,200 graph pixels | Blank movement room on every side |

A map enters protected mode when either large threshold is crossed. It keeps a
relationship-prioritized, connected neighborhood around the selected node and
project root. Selecting another card recalculates that neighborhood.

The user can still choose **Load full map** or **Force full map**. Full-map mode
does not remove viewport culling; it changes the analyzed/layout scope, not the
number of elements mounted at one instant.

## Rendering safeguards

- The SVG is positioned around the visible graph region rather than covering
  the full stage.
- Nodes outside the viewport plus overscan are not mounted.
- Edges outside the viewport plus overscan are not mounted.
- Rendered edges are sorted by semantic priority and capped.
- Viewport updates are grouped into `requestAnimationFrame`.
- Logic-map loading is deferred until that tab is opened.
- Ace and the editor UI are deferred until source view is opened.
- Large-map scaling uses CSS `zoom` so the scrollable dimensions remain
  consistent with the visible scale.
- Development builds warn when graph construction, layout, or routing blocks
  the renderer for 50 milliseconds or longer.

## Project-loading safeguards

- Folder scanning and file reads use asynchronous Electron main-process I/O.
- The loader separates path discovery from content loading.
- Metadata checks and file reads use at most 16 concurrent operations.
- Unchanged files are reused from an in-memory cache keyed by path, size, and
  modification time.
- Only the three most recently loaded project roots retain cached contents.
- A changed payload is analyzed in a Web Worker rather than the renderer.
- Switching projects or changing the payload terminates stale analysis work.
- Individual files that disappear during a scan are skipped instead of failing
  the complete project load.

### Kader loading smoke measurement

On the development Mac used on August 4, 2026, the Kader workspace produced
194 supported source/configuration files after ignored directories were
removed. Observed loading times were:

- first metadata scan and content read: approximately 123–170 ms
- unchanged cached refresh: approximately 43–76 ms with zero file rereads
- background analysis: approximately 229 ms for 5,708 semantic relationships

These are smoke-test observations rather than release performance guarantees.
The important behavior is that the analysis interval runs in a worker and does
not occupy the renderer thread.

## Failure recovery

A thrown map-rendering error is contained inside the canvas and does not remove
the explorer or inspector. Retrying the logic map remounts it with its internal
full-map override cleared, which restores protected mode.

If the complete Electron renderer process terminates, the desktop shell reloads
once in safe mode. Repeated termination inside one minute stops automatic
recovery and asks the user whether to reload or close. Unresponsive-renderer
events similarly offer waiting or safe reload instead of silently killing the
window.

Diagnostics are stored locally as bounded line-delimited JSON. They contain
application/platform metadata and error stacks but do not include project file
contents.

## Layout safeguards

- Strongly connected components use iterative traversal instead of recursive
  traversal, avoiding call-stack overflow on deep graphs.
- Nodes are placed in semantic layers.
- Barycentric sweeps reduce crossings between adjacent layers.
- Routing uses indexed obstacle bands and reusable channels rather than testing
  every node for every possible segment.
- Routes are orthogonal and offset so parallel connections remain readable.

## Rules for changing limits

Do not raise a limit solely because one high-end computer can display the
result. Test the target baseline and record:

- graph node and edge counts
- graph build time
- layout time
- route time
- maximum mounted card and path counts
- longest renderer task
- interaction frame rate and memory

Keep protected mode as the default for large repositories. The full-map button
is an informed user override, not a replacement for safeguards.

## Profiling checklist

1. Build production assets with `npm run build`.
2. Open the same large repository in a packaged-like Electron session.
3. Record the execution-flow preset before enabling every relationship.
4. Compare protected and full-map modes.
5. Pan to the center and far edges of the stage.
6. Select several distant symbols and measure refocus/re-layout.
7. Open and close the filter panel while moving freely in both axes.
8. Check that mounted `.workflow-node` and `.logical-edge` counts remain close
   to viewport limits.
9. Inspect the Electron renderer process for memory growth after repeated tab
   switches.

## Future performance work

A full IDE should move persistent indexing and large-graph layout to utility
processes and load editor contents on demand instead of returning every
supported file after the scan. Background analysis and cached refreshes are now
implemented, but on-demand document storage remains tracked in the
[IDE roadmap](IDE_ROADMAP.md).
