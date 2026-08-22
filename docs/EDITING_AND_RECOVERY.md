# Editing and recovery

Divex protects unsaved source edits independently from normal file saves. A
dirty editor buffer is written to the Divex app-data directory after 350 ms of
inactivity and again when the window is hidden or the editor is unmounted. The
status bar reports **Protecting edits…**, **Recovery protected**, or
**Recovery unavailable**.

## Editor workspace

The source workspace supports two editor groups. Use the split button in the
toolbar or on a tab to open a document in the second group. Both groups reuse
the same per-file Ace session, so edits, breakpoints, undo history, and analyzer
annotations stay consistent rather than creating duplicate buffers.

A file opened for the first time uses the preview tab. Opening another file
replaces that preview when it is clean and unpinned. Editing, double-clicking,
or choosing the pin icon converts it into a durable tab. Closed files are kept
in a bounded recent list and can be restored from the History menu or with
`Command/Ctrl+Shift+T`.

The minimap can be toggled from editor preferences and clicked to jump through
large files. The diff button compares the active buffer with the last saved
content without leaving the editor. Workspace diagnostics combine Flutter
analyzer results and unresolved external-change warnings; choosing a problem
opens its file and exact line.

## Changes made outside Divex

Live project refresh updates clean editor buffers automatically. When a source
file changes on disk while its Divex buffer also contains unsaved edits, Divex
keeps both versions and blocks saving that document until the conflict is
resolved:

- **Compare** opens the disk and editor versions side by side.
- **Keep mine** accepts the new disk version as the comparison base but retains
  the editor buffer as unsaved, ready for an intentional save.
- **Reload disk** discards the editor buffer and loads the external version.

This guard applies to Save, Save all, formatting, and analyzer pre-save flows,
so an unattended workspace command cannot silently overwrite an external edit.

## Recovering a session

When an opened project has recovery data that differs from its disk files,
Divex opens the first affected source and shows the recovery dialog. Each entry
includes its project path and snapshot time.

- **Restore** places that snapshot into an unsaved editor buffer. It does not
  overwrite disk until Save is selected.
- **Discard** removes only the snapshot and leaves the disk file alone.
- **Restore available files** restores every entry whose source still exists.
- Missing source paths remain listed instead of being silently deleted.

A successful save clears its journal. A save failure leaves the buffer dirty
and immediately refreshes the journal.

## Dependable saves

Electron validates the project root and target, rejects symbolic-link targets,
and resolves the real parent directory. It writes new UTF-8 content into a
unique temporary file beside the destination, flushes it to storage, closes it,
and atomically renames it over the original. If writing or renaming fails, the
temporary file is removed and the original remains.

Dart formatting follows the same boundary. The formatter edits a temporary
copy; only successful formatted output reaches the atomic save operation. This
applies to native Windows and WSL projects.

## Boundaries and limits

- Journals are limited to 4 MB per buffer. Project loading already caps source
  files at 2 MB, so normal opened files remain below this limit.
- Journals live outside Git repositories and never appear as project changes.
- Recovery is not a version-control replacement; commit durable milestones.
- Normal window close still shows the operating-system unsaved-change warning.
