# Windows changes since the last Mac/V2 feature sync

## Scope and baseline

This report documents the work performed after commit `839b2fe65ce344128e0a1556a8f18603b01be805`
(`Align Windows workspace with Mac V2 maps`, 2026-08-15). That commit is the
last explicit Mac-to-Windows feature synchronization in this branch.

The comparison used for this report is:

```text
baseline: 839b2fe (Mac/V2 map alignment)
current branch: agent/windows-compatibility
committed post-baseline change: 3a5b318 (anchored Windows zoom)
plus: the completed but currently uncommitted 0.8.0 working tree
```

At the time this report was written, 45 tracked paths differed from the
baseline and 80 additional non-ignored paths had been added. Generated output
under `dist/` and `release/` is intentionally ignored by Git, so it is covered
in the packaging section even though it is not part of the source diff.

The following work is **not** counted as post-sync work because it was already
present at or before the baseline:

- removal of the experimental 3D viewer;
- the Mac/V2 Project and Logic map composition;
- the original fullscreen, direction, free-positioning, and workflow controls;
- the crash-containment merge and Divex Mini companion; and
- the first versions of the editor, source-control sidebar, integrated
  terminal, navigation, and multi-language adapters.

Everything below describes additions, hardening, restructuring, or fixes made
after that point.

## Summary of post-sync work

| Area | Result | Primary implementation |
| --- | --- | --- |
| Map zoom | Controlled 10-point Ctrl+wheel zoom that remains anchored under the pointer | [`useAnchoredZoom.ts`](../src/features/viewport/useAnchoredZoom.ts) |
| Project services | Electron code split into focused project, platform, Git, terminal, debug, and security services | [`electron/`](../electron/) |
| Python and TypeScript | Tested Python project behavior and full TypeScript/TSX scanning, symbols, imports, tasks, and editor integration | [`src/analysis/languages/`](../src/analysis/languages/) |
| WSL | Native opening and Linux-aware files, tools, Git, tasks, terminals, debugging, saving, and refresh | [`wsl.cjs`](../electron/platform/wsl.cjs) |
| File management | Create, duplicate, rename, delete, copy, move, paste, drag/drop, and conflict-safe naming | [`mutations.cjs`](../electron/project/mutations.cjs) |
| Git and settings | Branches, sync, stash, safe discard, and persistent per-project behavior | [`git.cjs`](../electron/source-control/git.cjs), [`project-settings/`](../src/features/project-settings/) |
| Dependable editing | Atomic saves and disk-backed recovery of unsaved buffers | [`atomic-save.cjs`](../electron/project/atomic-save.cjs), [`recovery.cjs`](../electron/project/recovery.cjs) |
| Debugging | Python and Dart/Flutter breakpoints, stepping, call stacks, scopes, and variables | [`debug/service.cjs`](../electron/debug/service.cjs), [`debugger/`](../src/features/debugger/) |
| Workspace trust | First-open trust choice and Electron-enforced Restricted Mode | [`workspace-trust.cjs`](../electron/security/workspace-trust.cjs) |
| Terminal and tasks | Shell profiles, external matching terminals, splits, search, links, custom tasks, and problem matching | [`electron/terminal/`](../electron/terminal/), [`terminal/`](../src/features/terminal/) |
| Editor workspace | Split groups, minimap, diff, preview/pinned tabs, recent files, diagnostics, and external-change conflicts | [`CodeEditor.tsx`](../src/features/editor/CodeEditor.tsx) |
| Security | Strict CSP, Chromium sandboxing, navigation/permission denial, IPC validation, and extension isolation policy | [`electron/security/`](../electron/security/), [`contentSecurityPolicy.ts`](../src/config/contentSecurityPolicy.ts) |
| Windows UI | Full-window layout repair with trust and terminal rows kept separate | [`styles.css`](../src/styles.css), [`appShellLayout.test.ts`](../src/app/appShellLayout.test.ts) |
| Windows release | Branded 0.8.0 installer and portable build, publisher metadata, checksums, and signature verification | [`package.json`](../package.json), [`icon.svg`](../build/icon.svg) |

## 1. Map zoom correction

### User-visible behavior

- `Ctrl` plus the mouse wheel now changes zoom in controlled 10-percentage-
  point steps instead of jumping through most of the zoom range.
- The content location beneath the pointer stays beneath the pointer while
  zooming.
- Toolbar zoom uses the center of the visible viewport as its anchor.
- Zooming no longer drifts toward the bottom-right because the map's scroll
  surface is no longer animated at the same time as the zoom transform.
- The same behavior is used by both Project and Logic maps.

### Files

- Shared zoom math, wheel grouping, clamping, anchor preservation, and viewport
  correction: [`src/features/viewport/useAnchoredZoom.ts`](../src/features/viewport/useAnchoredZoom.ts)
- Project-map integration: [`src/features/project-map/TwoDVisualizer.tsx`](../src/features/project-map/TwoDVisualizer.tsx)
- Logic-map integration: [`src/features/logic-map/LogicalWorkflowVisualizer.tsx`](../src/features/logic-map/LogicalWorkflowVisualizer.tsx)
- Removal of the conflicting scroll-surface transition:
  [`src/styles.css`](../src/styles.css)
- Regression coverage for wheel deltas, anchor calculations, bounds, and
  viewport changes: [`src/features/viewport/useAnchoredZoom.test.ts`](../src/features/viewport/useAnchoredZoom.test.ts)

This is the only post-baseline feature already committed separately, as
`3a5b318` (`Fix anchored map zoom on Windows`).

## 2. Electron and source-tree organization

The original desktop services were large flat files directly under
`electron/`. They were separated by ownership so file operations, WSL routing,
Git, terminal processes, debugging, and security no longer accumulate inside
the desktop entrypoint.

### Old paths removed

- `electron/git-service.cjs` and `electron/git-service.test.ts`
- `electron/project-loader.cjs` and `electron/project-loader.test.ts`
- `electron/project-watcher.cjs` and `electron/project-watcher.test.ts`
- `electron/terminal-service.cjs` and `electron/terminal-service.test.ts`
- `electron/tool-runner.cjs`

### New service ownership

- Project loading, paths, file policy, tasks, safe mutations, atomic saves,
  recovery, and watching: [`electron/project/`](../electron/project/)
- Windows command discovery and WSL routing:
  [`electron/platform/`](../electron/platform/)
- Git operations: [`electron/source-control/`](../electron/source-control/)
- Integrated and external terminal behavior:
  [`electron/terminal/`](../electron/terminal/)
- Debug Adapter Protocol sessions: [`electron/debug/`](../electron/debug/)
- Workspace and renderer security: [`electron/security/`](../electron/security/)

[`electron/main.cjs`](../electron/main.cjs) remains the composition root for
windows, dialogs, lifecycle, and IPC registration. Reusable behavior now lives
in the directories above. [`electron/preload.cjs`](../electron/preload.cjs)
exposes only named operations and typed event listeners to the renderer.

Renderer ownership was also made clearer:

- [`src/App.tsx`](../src/App.tsx) coordinates project, view, trust, terminal,
  Git, debugger, editor, and settings lifecycles.
- [`src/types.ts`](../src/types.ts) contains the shared project, desktop, Git,
  terminal, debug, recovery, trust, and file-operation contracts.
- Feature-specific UI is kept under [`src/features/`](../src/features/).
- The practical reading order and ownership table are in
  [`docs/CODEBASE_GUIDE.md`](CODEBASE_GUIDE.md).

## 3. Project loading, supported-file policy, and live refresh

- A single supported-file/ignored-directory policy now drives both project
  loading and watching, avoiding mismatched file visibility.
- Loading keeps the metadata-first scan, file-size and file-count limits,
  bounded parallel reads, and the three-project in-memory content cache.
- Project payloads now retain empty directories so the Explorer does not lose
  folders that contain no supported files.
- Native Windows projects use recursive filesystem events; WSL projects use a
  bounded snapshot poll because Windows does not provide the same recursive
  events for `\\wsl.localhost` trees.
- Save and mutation operations trigger project refreshes through the same
  loader instead of assembling partial renderer state independently.

### Files

- Supported extensions and ignored folders:
  [`electron/project/file-policy.cjs`](../electron/project/file-policy.cjs)
- Metadata scan, cache, progress, and payload construction:
  [`electron/project/loader.cjs`](../electron/project/loader.cjs)
- Native watcher and WSL polling snapshots:
  [`electron/project/watcher.cjs`](../electron/project/watcher.cjs)
- Native/WSL root parsing and path containment:
  [`electron/project/paths.cjs`](../electron/project/paths.cjs)
- Application refresh ownership:
  [`src/features/project-settings/useProjectLiveRefresh.ts`](../src/features/project-settings/useProjectLiveRefresh.ts)
- Desktop wiring and progress IPC: [`electron/main.cjs`](../electron/main.cjs)
- Tests: [`loader.test.ts`](../electron/project/loader.test.ts),
  [`watcher.test.ts`](../electron/project/watcher.test.ts), and
  [`paths.test.ts`](../electron/project/paths.test.ts)

## 4. Python hardening and TypeScript support

### Python

Python analysis existed in the synchronized feature line, but the post-sync
work made it dependable as a Windows/WSL project type:

- `.py` and `.pyw` project scanning and editing are verified.
- Classes, functions, async functions, methods, module variables, and local
  imports are covered by focused tests.
- Python project/config files such as `pyproject.toml`, `requirements.txt`,
  `setup.py`, `Pipfile`, TOML, INI, CFG, and requirements text are recognized.
- Standard Python projects receive a compile-check task; test layouts receive
  a pytest task.
- Native Windows execution uses the Windows Python path while WSL execution
  uses `python3` and Linux paths.
- `debugpy` can be installed through the debugger setup action and is used for
  native and WSL debugging.

Primary references are [`python.ts`](../src/analysis/languages/python.ts),
[`python.test.ts`](../src/analysis/languages/python.test.ts),
[`file-policy.cjs`](../electron/project/file-policy.cjs),
[`tasks.cjs`](../electron/project/tasks.cjs), and
[`debug/service.cjs`](../electron/debug/service.cjs).

### TypeScript and TSX

Full lightweight TypeScript support was added after the baseline:

- `.ts`, `.tsx`, `.mts`, `.cts`, and `.d.ts` files are scanned, watched,
  labeled, syntax-highlighted, editable, and included in maps.
- Analysis extracts classes, interfaces, type aliases, enums, namespaces,
  constructors, functions, methods, typed variables, and TSX components.
- Local import resolution handles type-only imports, exports, dynamic imports,
  extensionless paths, `index` files, mixed JavaScript/TypeScript projects, and
  triple-slash references.
- A project containing `tsconfig.json` gets a TypeScript compile-check task.
- `.ts`, `.mts`, and `.cts` active files can use Node.js 22's erasable
  TypeScript execution; `.tsx` is not falsely offered as directly executable.
- Compiler output is converted into clickable terminal Problems.

Implementation: [`typescript.ts`](../src/analysis/languages/typescript.ts),
[`registry.ts`](../src/analysis/languages/registry.ts),
[`metadata.ts`](../src/analysis/languages/metadata.ts),
[`javascript.ts`](../src/analysis/languages/javascript.ts),
[`analyzeProject.ts`](../src/analysis/analyzeProject.ts),
[`tasks.cjs`](../electron/project/tasks.cjs), and
[`problemMatchers.ts`](../src/features/terminal/problemMatchers.ts).

Verification: [`typescript.test.ts`](../src/analysis/languages/typescript.test.ts)
and [`scripts/verify-language-support.cjs`](../scripts/verify-language-support.cjs).
The supported-language contract is documented in
[`docs/LANGUAGE_SUPPORT.md`](LANGUAGE_SUPPORT.md).

## 5. WSL support outside the terminal

WSL support was expanded from a shell option into a project-wide environment:

- Installed distributions and the default distribution are discovered.
- A dedicated WSL folder picker opens Linux project paths through a validated
  `\\wsl.localhost\\Distribution\\...` path.
- Project roots retain distribution and Linux-path metadata.
- Git, detected tasks, active-file execution, formatting, analysis, terminals,
  debugging, saving, and file management execute against the Linux project.
- Windows-hosted Electron never substitutes Windows toolchains into a WSL
  project.
- WSL live refresh uses bounded polling and keeps empty-folder changes.

### Files

- Distribution discovery, command execution, path conversion, and WSL command
  definitions: [`electron/platform/wsl.cjs`](../electron/platform/wsl.cjs)
- Root and UNC-path parsing: [`electron/project/paths.cjs`](../electron/project/paths.cjs)
- Environment-aware project tasks: [`electron/project/tasks.cjs`](../electron/project/tasks.cjs)
- Native/WSL Git dispatch: [`electron/source-control/git.cjs`](../electron/source-control/git.cjs)
- Native/WSL terminal dispatch: [`electron/terminal/service.cjs`](../electron/terminal/service.cjs)
- WSL profiles and external terminals:
  [`profiles.cjs`](../electron/terminal/profiles.cjs) and
  [`external-window.cjs`](../electron/terminal/external-window.cjs)
- Native/WSL debugger translation: [`electron/debug/service.cjs`](../electron/debug/service.cjs)
- Folder picker and IPC integration: [`electron/main.cjs`](../electron/main.cjs)
- Tests: [`wsl.test.ts`](../electron/platform/wsl.test.ts),
  [`paths.test.ts`](../electron/project/paths.test.ts),
  [`tasks.test.ts`](../electron/project/tasks.test.ts), and
  [`scripts/smoke-wsl.cjs`](../scripts/smoke-wsl.cjs)
- Usage and limitations: [`docs/WSL.md`](WSL.md)

## 6. Complete Explorer file management

The Explorer now has one contained file-operation service shared by native and
WSL projects.

### User-visible changes

- Create files and folders from the toolbar or context menu.
- Duplicate files and folders with deterministic `copy`, `copy 2`, and later
  suggested names.
- Cut, copy, paste, rename, delete, and refresh.
- Drag files/folders into another folder or back to project-root space.
- Prevent a folder from being moved into itself or one of its descendants.
- Never overwrite an existing destination silently; conflicts return a safe
  suggested name.
- Preserve empty folders and refresh the maps after filesystem changes.
- Keep reveal, external open, share, terminal-open, and path-copy actions.
- Provide focused keyboard shortcuts while Explorer rows are active.

### Files

- Root-contained mutation and conflict rules:
  [`electron/project/mutations.cjs`](../electron/project/mutations.cjs)
- Root/symlink containment helpers:
  [`electron/project/paths.cjs`](../electron/project/paths.cjs)
- Cross-platform name validation:
  [`src/features/explorer/explorerNames.ts`](../src/features/explorer/explorerNames.ts)
- Toolbar, context menus, keyboard handling, clipboard state, and drag/drop:
  [`src/features/explorer/FileExplorer.tsx`](../src/features/explorer/FileExplorer.tsx)
- Application-level mutation results and project replacement:
  [`src/App.tsx`](../src/App.tsx)
- Desktop endpoints: [`electron/main.cjs`](../electron/main.cjs) and
  [`electron/preload.cjs`](../electron/preload.cjs)
- Tests: [`mutations.test.ts`](../electron/project/mutations.test.ts),
  [`FileExplorer.test.tsx`](../src/features/explorer/FileExplorer.test.tsx),
  and [`explorerNames.test.ts`](../src/features/explorer/explorerNames.test.ts)
- Behavior reference: [`docs/FILE_MANAGEMENT.md`](FILE_MANAGEMENT.md)

## 7. Git workflow and project settings

### Git changes

- Initialize a repository.
- Create and switch branches with validated branch names.
- Fetch, fast-forward-only pull, and non-force push.
- Set the first push's upstream without allowing a forced push.
- Stash tracked and untracked work and restore it.
- Discard one file or all working-tree changes only after confirmation.
- Keep staged content intact during working-tree discard.
- Refresh project contents after branch, pull, stash-pop, or discard operations.
- Preserve the earlier status, grouped changes, diffs, stage/unstage, and commit
  workflow.

Implementation is in [`electron/source-control/git.cjs`](../electron/source-control/git.cjs),
[`src/features/source-control/SourceControlPanel.tsx`](../src/features/source-control/SourceControlPanel.tsx),
and [`src/App.tsx`](../src/App.tsx). Tests are in
[`electron/source-control/git.test.ts`](../electron/source-control/git.test.ts)
and [`SourceControlPanel.test.tsx`](../src/features/source-control/SourceControlPanel.test.tsx).

### Project settings

Per-project settings now remember:

- default Project, Logic, or Source view;
- workflow direction;
- default extension for newly created files;
- native and WSL live-refresh preference;
- Source Control refresh-on-focus behavior; and
- whether destructive Git discard requires confirmation.

Settings are normalized and keyed by exact project root. They do not leak
between unrelated folders. See
[`projectSettings.ts`](../src/features/project-settings/projectSettings.ts),
[`ProjectSettingsDialog.tsx`](../src/features/project-settings/ProjectSettingsDialog.tsx),
[`useProjectLiveRefresh.ts`](../src/features/project-settings/useProjectLiveRefresh.ts),
and their tests in [`src/features/project-settings/`](../src/features/project-settings/).

The combined behavior is documented in
[`docs/GIT_AND_PROJECT_SETTINGS.md`](GIT_AND_PROJECT_SETTINGS.md).

## 8. Recovery and dependable editing

Saving and unsaved-buffer protection now have trusted desktop boundaries.

### Atomic saves

- The root and relative path are validated before writing.
- Symlink escapes are rejected.
- Content is written to a same-directory temporary file, flushed, and then
  atomically replaces the destination.
- Temporary artifacts are cleaned after success or failure.
- Native and WSL Dart formatting use a temporary copy and return through the
  same atomic save operation.

Implementation and tests:
[`electron/project/atomic-save.cjs`](../electron/project/atomic-save.cjs) and
[`atomic-save.test.ts`](../electron/project/atomic-save.test.ts).

### Recovery journals

- Dirty editor documents are written to disk-backed, per-project recovery
  journals after a bounded delay.
- Hidden-window and close paths flush dirty buffers.
- On the next open, recoverable files can be restored or discarded
  individually or together.
- A successful save removes that file's journal.
- A failed save keeps the editor dirty and keeps the recovery snapshot.
- Recovery data never silently replaces the source file.

Desktop storage is implemented by
[`electron/project/recovery.cjs`](../electron/project/recovery.cjs). Renderer
lifecycle and UI are in
[`useEditorRecovery.ts`](../src/features/editor/useEditorRecovery.ts) and
[`EditorRecoveryDialog.tsx`](../src/features/editor/EditorRecoveryDialog.tsx).
The coordinating editor is [`CodeEditor.tsx`](../src/features/editor/CodeEditor.tsx).
Tests are in [`recovery.test.ts`](../electron/project/recovery.test.ts), and the
full failure/restore model is in
[`docs/EDITING_AND_RECOVERY.md`](EDITING_AND_RECOVERY.md).

## 9. Debugger integration

Divex now has a constrained Debug Adapter Protocol client instead of launching
arbitrary debug configurations from the renderer.

### Capabilities

- Python debugging through `debugpy` on native Windows and in WSL.
- Dart or Flutter debugging through the matching SDK debug adapter.
- Persistent gutter breakpoints.
- Continue, pause, stop, step over, step into, and step out.
- Paused-line highlighting and automatic source navigation.
- Threads, call stacks, scopes, variables, and nested variable expansion.
- Bounded Debug Console output.
- One-action Python adapter setup when `debugpy` is missing.
- Session ownership and cleanup when a window closes or trust is revoked.

### Files

- DAP framing, request timeouts, adapter launch, breakpoints, stack/scopes/
  variables, stepping, and path translation:
  [`electron/debug/service.cjs`](../electron/debug/service.cjs)
- Renderer session state and API coordination:
  [`src/features/debugger/useDebugger.ts`](../src/features/debugger/useDebugger.ts)
- Debug sidebar UI: [`src/features/debugger/DebugPanel.tsx`](../src/features/debugger/DebugPanel.tsx)
- Gutter breakpoints and paused-line integration:
  [`src/features/editor/CodeEditor.tsx`](../src/features/editor/CodeEditor.tsx)
- Debug sidebar selection:
  [`src/app/ProjectSidebar.tsx`](../src/app/ProjectSidebar.tsx)
- IPC and trust enforcement: [`electron/main.cjs`](../electron/main.cjs),
  [`electron/preload.cjs`](../electron/preload.cjs), and
  [`src/types.ts`](../src/types.ts)
- Tests: [`electron/debug/service.test.ts`](../electron/debug/service.test.ts)
  and [`DebugPanel.test.tsx`](../src/features/debugger/DebugPanel.test.tsx)
- Usage: [`docs/DEBUGGING.md`](DEBUGGING.md)

## 10. Workspace trust and Restricted Mode

Every opened local or WSL folder now has an explicit, remembered trust state.

### Behavior

- The first open requires either **Trust Workspace** or **Open in Restricted
  Mode**.
- Trust applies only to the normalized exact root; it does not flow to parent,
  sibling, or previously opened projects.
- Restricted Mode still permits reading, maps, search, editing, recovery, safe
  file management, and Git inspection.
- It blocks integrated/external terminals, task discovery and execution,
  active-file execution, external file launching, analyzers, debugging, and
  debug-adapter installation.
- Trust can be granted or revoked later through the project UI and command
  palette.
- Revoking trust immediately closes that window's terminal and debugger
  sessions.
- The dialog lists each permission, its Allowed/Blocked state, and the fact
  that project scripts inherit the user's filesystem and network access.

### Files

- Persistent trust store and root normalization:
  [`electron/security/workspace-trust.cjs`](../electron/security/workspace-trust.cjs)
- Renderer hook: [`src/features/workspace-trust/useWorkspaceTrust.ts`](../src/features/workspace-trust/useWorkspaceTrust.ts)
- First-open dialog, banner, permission details, and management UI:
  [`WorkspaceTrustUI.tsx`](../src/features/workspace-trust/WorkspaceTrustUI.tsx)
- Main-process enforcement and session shutdown:
  [`electron/main.cjs`](../electron/main.cjs)
- UI integration: [`src/App.tsx`](../src/App.tsx),
  [`AppHeader.tsx`](../src/app/AppHeader.tsx), and
  [`ProjectSidebar.tsx`](../src/app/ProjectSidebar.tsx)
- Tests: [`workspace-trust.test.ts`](../electron/security/workspace-trust.test.ts)
  and [`WorkspaceTrustUI.test.tsx`](../src/features/workspace-trust/WorkspaceTrustUI.test.tsx)
- Security/usage details: [`docs/WORKSPACE_TRUST.md`](WORKSPACE_TRUST.md)

## 11. Improved terminal, tasks, and external terminal connection

### Terminal profiles

- Detects installed PowerShell, Windows PowerShell, Command Prompt, Git Bash,
  and WSL profiles.
- WSL projects receive distribution-aware default and Bash profiles.
- The same validated profile can open inside Divex or in a matching external
  terminal window.
- The selected profile is remembered per project.

Profile discovery is in [`electron/terminal/profiles.cjs`](../electron/terminal/profiles.cjs),
external launching is in
[`electron/terminal/external-window.cjs`](../electron/terminal/external-window.cjs),
and PTY ownership is in [`electron/terminal/service.cjs`](../electron/terminal/service.cjs).

### Integrated terminal improvements

- Multiple tabs plus independent split panes.
- Preserved output while tabs, splits, or the dock are hidden.
- Search with next/previous navigation.
- Safe clickable `http` and `https` links; unsupported protocols are rejected.
- Restart, terminate, resize, close, and exit-code state.
- Owned sessions are closed with their renderer window.

Renderer behavior is split between
[`TerminalDock.tsx`](../src/features/terminal/TerminalDock.tsx) and
[`useIntegratedTerminal.ts`](../src/features/terminal/useIntegratedTerminal.ts).

### Tasks and Problems

- Existing npm, Flutter, Dart, Python, Maven, Gradle, Make, and TypeScript tasks
  are detected from known project files.
- `divex.tasks.json` adds validated custom tasks with a bounded ID, executable,
  argument list, relative working directory, group, and problem matcher.
- Custom and detected tasks can run inside Divex or in the selected external
  profile.
- Dart, Python, TypeScript, Java, GCC, and common compiler output becomes a
  clickable Problems list without removing the original terminal output.

Task definitions are in [`electron/project/tasks.cjs`](../electron/project/tasks.cjs),
and diagnostic parsing is in
[`src/features/terminal/problemMatchers.ts`](../src/features/terminal/problemMatchers.ts).
Tests are in [`tasks.test.ts`](../electron/project/tasks.test.ts),
[`profiles.test.ts`](../electron/terminal/profiles.test.ts),
[`service.test.ts`](../electron/terminal/service.test.ts), and
[`problemMatchers.test.ts`](../src/features/terminal/problemMatchers.test.ts).
See [`docs/TERMINALS_AND_TASKS.md`](TERMINALS_AND_TASKS.md).

## 12. Advanced editor workspace

The single-group multi-tab editor was extended into a more dependable IDE-like
workspace while keeping Ace lazy-loaded.

### Added behavior

- Two independently focused editor groups.
- Shared per-file Ace sessions, undo history, dirty state, annotations, and
  breakpoints across both groups.
- Preview tabs that are replaced by the next single-clicked file until edited,
  pinned, or explicitly opened.
- Pinned tabs and double-click pinning.
- A bounded recently closed list and `Ctrl+Shift+T` restore.
- Toggleable, clickable minimaps.
- An embedded side-by-side line comparison against saved or externally changed
  disk content.
- Workspace-wide diagnostics with exact file/line navigation.
- Three-way external-change classification: unchanged local buffer, safe disk
  reload, or a true local-versus-disk conflict.
- Conflicting saves are blocked until **Keep mine** or **Reload disk** is chosen.
- Existing multi-document sessions, save-all, dirty-close protection, find,
  replace, outline, breadcrumbs, editor preferences, Flutter diagnostics, and
  source navigation are retained.

### Files

- Editor coordinator and Ace integration:
  [`src/features/editor/CodeEditor.tsx`](../src/features/editor/CodeEditor.tsx)
- Minimap: [`EditorMinimap.tsx`](../src/features/editor/EditorMinimap.tsx)
- Diff and diagnostics panels:
  [`EditorWorkbenchPanels.tsx`](../src/features/editor/EditorWorkbenchPanels.tsx)
- Document and group contracts:
  [`editorTypes.ts`](../src/features/editor/editorTypes.ts)
- Preview, recent-file, diff-row, and conflict helpers:
  [`editorWorkspace.ts`](../src/features/editor/editorWorkspace.ts)
- Language/mode helpers:
  [`editorSupport.ts`](../src/features/editor/editorSupport.ts)
- Recovery lifecycle:
  [`useEditorRecovery.ts`](../src/features/editor/useEditorRecovery.ts)
- Application/menu coordination: [`src/App.tsx`](../src/App.tsx) and
  [`src/app/AppHeader.tsx`](../src/app/AppHeader.tsx)
- Tests: [`editorWorkspace.test.ts`](../src/features/editor/editorWorkspace.test.ts)
  and [`editorSupport.test.ts`](../src/features/editor/editorSupport.test.ts)

## 13. Final security hardening

### Content Security Policy

- Production defaults to `default-src 'none'`.
- Scripts, connections, and workers are self-only.
- Objects, frames, forms, ancestors, and base-URI changes are denied.
- No `unsafe-eval` or remote production origin is allowed.
- Development adds only the local Vite HTTP/WebSocket connection.

The policy is generated by
[`src/config/contentSecurityPolicy.ts`](../src/config/contentSecurityPolicy.ts),
embedded by [`index.html`](../index.html), and checked by
[`contentSecurityPolicy.test.ts`](../src/config/contentSecurityPolicy.test.ts).

### Electron sandbox and window policy

- Chromium sandboxing is enabled globally and on each window.
- Context isolation remains enabled and Node.js remains disabled in main frames
  and subframes.
- Webviews, experimental features, insecure content, popup windows, and
  drag-to-navigate are disabled.
- Page navigation and all browser permission checks/requests are denied.

Implementation and tests:
[`electron/main.cjs`](../electron/main.cjs),
[`electron/security/window-policy.cjs`](../electron/security/window-policy.cjs),
and [`window-policy.test.ts`](../electron/security/window-policy.test.ts).

### IPC sender validation

Every handled channel is checked before its implementation runs:

1. sender belongs to a registered Divex window;
2. request came from that window's main frame;
3. renderer URL is the exact packaged entry or approved local dev origin;
4. supplied project root matches that window's active project; and
5. the window role is allowed to use the channel.

Divex Mini has a small read-oriented allowlist and cannot use write, terminal,
debug, Git, recovery, trust, or task-execution channels. The preload never
exposes raw `ipcRenderer` or Electron event objects.

Implementation and tests:
[`electron/security/ipc-authorization.cjs`](../electron/security/ipc-authorization.cjs),
[`ipc-authorization.test.ts`](../electron/security/ipc-authorization.test.ts),
[`electron/main.cjs`](../electron/main.cjs), and
[`electron/preload.cjs`](../electron/preload.cjs).

### Extension isolation policy

Third-party and in-renderer extensions are deliberately disabled. The policy
fails closed until Divex has a separate extension-host process, capability-
scoped IPC, per-extension storage, resource limits, and explicit permissions.
See [`extension-policy.cjs`](../electron/security/extension-policy.cjs) and
[`extension-policy.test.ts`](../electron/security/extension-policy.test.ts).

The complete threat model and remaining distribution controls are documented
in [`docs/SECURITY.md`](SECURITY.md).

## 14. Windows UI and layout reliability

The 0.8 portable build exposed a shell-grid regression where only the upper
quarter of the app was visible. The application rows were corrected so the
workbench occupies all remaining window height:

- title bar remains in row 1;
- the optional workspace-trust banner uses row 2;
- the main workspace uses row 3; and
- terminal loading/dock uses row 4.

This prevents the trust banner and terminal from overlapping or collapsing the
Explorer, maps, editor, and inspector. The same layout works at normal and
maximized Windows sizes.

Files:

- Shell CSS and the feature-specific editor/debug/trust/terminal layouts:
  [`src/styles.css`](../src/styles.css)
- Shell composition: [`src/App.tsx`](../src/App.tsx)
- Workspace composition: [`src/app/VisualizerWorkspace.tsx`](../src/app/VisualizerWorkspace.tsx)
- Regression test: [`src/app/appShellLayout.test.ts`](../src/app/appShellLayout.test.ts)

The visual palette was intentionally left as the existing Divex design after
the temporary reference-image color experiment was reverted.

## 15. Windows packaging, metadata, icon, and release state

### Package configuration

- Version advanced to `0.8.0`.
- Product and author metadata now identify **Divex Visualizer** and
  **Jounaydh**.
- Repository and homepage metadata point to the project repository.
- The build has a dedicated Divex SVG icon and Windows trademark metadata.
- Both x64 NSIS installer and x64 portable targets are generated.
- The installer remains assisted rather than one-click, permits install-folder
  selection, and creates Desktop and Start Menu shortcuts.
- Old release files are retained instead of being deleted or overwritten.

Source configuration is in [`package.json`](../package.json), with the locked
dependency graph in [`package-lock.json`](../package-lock.json). Branding is in
[`build/icon.svg`](../build/icon.svg). Windows packaging is driven by
[`scripts/build-windows.cjs`](../scripts/build-windows.cjs).

### Current generated artifacts

Generated artifacts are ignored by [`.gitignore`](../.gitignore) and currently
exist under `release/`:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `Divex Visualizer-Setup-0.8.0-x64.exe` | 111,907,652 bytes | `9F7D4DC9DDB8F66CE30380A7AE6B50543B641ECB5A30A76A50B7F408A442E1BE` |
| `Divex Visualizer-Portable-0.8.0-x64.exe` | 111,633,585 bytes | `178F8942A24F67A3B427161B7207E82E6A5A0237AE5C683E5BC222990A0B52AD` |

The checksum manifest is
`release/Divex Visualizer-0.8.0-SHA256.txt`. Release versions 0.2.0 through
0.3.2 remain in the same directory.

### Signing and installation status

- [`scripts/verify-windows-signature.cjs`](../scripts/verify-windows-signature.cjs)
  provides a fail-closed signature check.
- `npm run dist:win:signed` rebuilds and then requires Authenticode status
  `Valid` for both artifacts.
- The current machine has no trusted code-signing certificate, so the 0.8.0
  artifacts are correctly reported as `NotSigned`. A self-signed certificate
  was not used because it would not establish publisher reputation or solve
  SmartScreen trust.
- The installed copy at
  `C:\Users\user\AppData\Local\Programs\Divex Visualizer\Divex Visualizer.exe`
  is still version 0.2.3. The final 0.8.0 installer has been built and verified,
  but replacement installation and installed-app verification have not yet
  been completed.

## 16. Tests and validation added

### Focused automated coverage

Post-sync tests cover:

- zoom anchoring: [`useAnchoredZoom.test.ts`](../src/features/viewport/useAnchoredZoom.test.ts)
- Python and TypeScript adapters:
  [`python.test.ts`](../src/analysis/languages/python.test.ts) and
  [`typescript.test.ts`](../src/analysis/languages/typescript.test.ts)
- project paths, loading, watching, tasks, mutations, atomic saves, and
  recovery: [`electron/project/`](../electron/project/)
- WSL routing: [`wsl.test.ts`](../electron/platform/wsl.test.ts)
- Git workflow: [`git.test.ts`](../electron/source-control/git.test.ts)
- terminal service/profiles and problem parsing:
  [`electron/terminal/`](../electron/terminal/) and
  [`problemMatchers.test.ts`](../src/features/terminal/problemMatchers.test.ts)
- debugger service and UI: [`electron/debug/service.test.ts`](../electron/debug/service.test.ts)
  and [`DebugPanel.test.tsx`](../src/features/debugger/DebugPanel.test.tsx)
- workspace trust, IPC authorization, window policy, extension policy, and CSP:
  [`electron/security/`](../electron/security/) and
  [`src/config/`](../src/config/)
- file management UI/name rules: [`src/features/explorer/`](../src/features/explorer/)
- project settings: [`src/features/project-settings/`](../src/features/project-settings/)
- editor preview/recent/diff/conflict helpers:
  [`src/features/editor/editorWorkspace.test.ts`](../src/features/editor/editorWorkspace.test.ts)
- Windows full-window shell layout:
  [`src/app/appShellLayout.test.ts`](../src/app/appShellLayout.test.ts)

### Real environment smoke tests

- [`scripts/smoke-windows-services.cjs`](../scripts/smoke-windows-services.cjs)
  creates a disposable real Windows project and verifies loading, npm/Python
  task detection, Git, atomic editing, watching, the node-pty integrated
  terminal, and a real `debugpy` session with a breakpoint, call stack, scopes,
  variables, Continue, and termination.
- [`scripts/smoke-wsl.cjs`](../scripts/smoke-wsl.cjs) creates a validated
  temporary Ubuntu project and verifies WSL loading, Python task detection,
  Linux Git, atomic editing, and polling refresh before deleting only its
  validated `/tmp/divex-wsl-smoke.*` directory.
- [`scripts/verify-language-support.cjs`](../scripts/verify-language-support.cjs)
  verifies all seven registered language adapters and local relationships.

The final validation run passed:

- 35 Vitest files and 111 tests;
- the seven-language integration check;
- strict TypeScript compilation;
- the production Vite build;
- the native Windows services smoke test;
- the Ubuntu WSL smoke test;
- dependency-tree validation;
- `git diff --check`; and
- `npm audit --omit=dev --audit-level=high` with zero reported vulnerabilities.

The detailed manual checklist is in [`docs/TESTING.md`](TESTING.md).

## 17. Documentation created or expanded

The following focused documents were added after the baseline:

- [`CODEBASE_GUIDE.md`](CODEBASE_GUIDE.md) — reading order and ownership map
- [`LANGUAGE_SUPPORT.md`](LANGUAGE_SUPPORT.md) — language behavior and adapter extension
- [`WSL.md`](WSL.md) — Windows/WSL project workflow
- [`FILE_MANAGEMENT.md`](FILE_MANAGEMENT.md) — Explorer actions and conflict rules
- [`GIT_AND_PROJECT_SETTINGS.md`](GIT_AND_PROJECT_SETTINGS.md) — Git and project preferences
- [`EDITING_AND_RECOVERY.md`](EDITING_AND_RECOVERY.md) — atomic saves and crash recovery
- [`DEBUGGING.md`](DEBUGGING.md) — debugger use and adapter setup
- [`WORKSPACE_TRUST.md`](WORKSPACE_TRUST.md) — first-open choices and Restricted Mode
- [`TERMINALS_AND_TASKS.md`](TERMINALS_AND_TASKS.md) — profiles, splits, tasks, and Problems
- [`SECURITY.md`](SECURITY.md) — CSP, sandbox, IPC, trust, and extension policy
- this report — the post-Mac-sync change audit

The existing [`ARCHITECTURE.md`](ARCHITECTURE.md),
[`DEVELOPMENT.md`](DEVELOPMENT.md), [`FEATURES.md`](FEATURES.md),
[`PROJECT_STATUS.md`](PROJECT_STATUS.md), [`TESTING.md`](TESTING.md),
[`CHANGELOG.md`](CHANGELOG.md), documentation index, and root
[`README.md`](../README.md) were expanded to match the 0.8.0 structure and
behavior.

## Current repository and release handoff

- Active local branch: `agent/windows-compatibility`
- Remote tracking branch: `origin/agent/windows-compatibility`
- The local branch was seven commits ahead of the remote before this report.
- The large 0.8.0 feature set and this documentation are still working-tree
  changes until the planned local release commit is made.
- No post-baseline 0.8.0 work described here has been pushed as part of this
  documentation task.
- The generated installer and portable executable are available locally but
  remain unsigned.
- The installed 0.2.3 application has not yet been replaced by 0.8.0.

This document is the file-level implementation record. For the shorter product
history, see [`CHANGELOG.md`](CHANGELOG.md); for current capabilities and gaps,
see [`PROJECT_STATUS.md`](PROJECT_STATUS.md).
