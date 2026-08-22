# WSL support on Windows

Divex can open a project directly from a WSL distribution. This is project
support, not merely a WSL terminal profile: loading, editing, saving, watching,
analysis, maps, navigation, Git, tasks, active-file execution, and Divex Mini
all understand the Linux project environment.

## Open a WSL project

1. Start Divex on Windows.
2. Choose **File → Open WSL Folder…**.
3. Select a distribution if more than one user distribution is installed.
4. Choose a folder inside the Linux home directory.

The project switcher identifies the active environment, for example
`Python project · WSL Ubuntu`.

## What runs where

| Operation | Runtime |
| --- | --- |
| Electron, React UI, maps, editor | Windows |
| File loading and saving | Windows Node.js through `\\wsl.localhost` |
| Analysis adapters | Divex background worker on Windows |
| Git commands | Linux Git inside the selected WSL distribution |
| Detected tasks and active files | Linux tools inside WSL |
| Integrated or external project shell | Selected WSL distribution |
| Live project watching | Bounded WSL filesystem polling |

Linux paths stay Linux paths when passed to Linux tools. Absolute path copy in
the Explorer copies `/home/...` for a WSL project instead of the Windows UNC
transport path.

Explorer creation, duplication, rename, cut/copy/paste, and drag-and-drop use
the same root-contained mutation service as native Windows projects. Name
conflicts are resolved without overwriting existing Linux files, and empty
Linux folders remain visible in the tree and WSL refresh snapshots.

Source Control uses Linux Git for branch, stash, discard, fetch, pull, and push
operations. Project Settings can enable workbench live refresh and Git
refresh-on-focus separately for each WSL project.

Editor recovery journals remain in the Windows Divex app-data directory, while
WSL saves use a synced temporary file beside the Linux destination and atomic
replacement. Dart formatting works on a temporary Linux copy before replacing
the real source, so a formatter failure does not overwrite the open file.

Windows cannot place WSL files in its Recycle Bin. Divex therefore labels WSL
deletion as permanent, explains that it cannot be recovered, and requires an
explicit confirmation before using the already root-contained file path.

## Requirements

- Windows 10 or 11 with WSL 2
- at least one user distribution such as Ubuntu
- development tools installed inside that distribution for the tasks you run
- Node.js 22 and project-local TypeScript inside the distribution when running
  or checking TypeScript projects

Check the machine:

```powershell
wsl --status
wsl --list --verbose
```

Divex ignores infrastructure distributions such as `docker-desktop` when it
offers project distributions.

## WSL file watching

Windows does not provide the recursive `fs.watch` behavior Divex uses for
native folders on `\\wsl.localhost`. Divex therefore snapshots supported WSL
files on a bounded interval and emits only added, deleted, or changed paths.
The same ignored-directory and 2,000-file policies apply to native and WSL
projects. This keeps Divex Mini live without scanning dependency directories.

## Verification

The normal cross-platform gate does not require WSL:

```powershell
npm run check
```

On a Windows machine with WSL, run the real integration smoke test:

```powershell
npm run test:wsl
```

It creates a validated temporary project under `/tmp`, verifies project
loading, Python task discovery, Linux Git, saving, and live watching, and then
removes only that temporary directory.

## Troubleshooting

### WSL is installed but the menu is unavailable

Run `wsl --list --verbose`. A user distribution must exist; Docker's internal
distribution is not treated as a workspace.

### A task says its command was not found

Install the tool inside the selected Linux distribution. Windows `PATH` is not
used for Linux project tasks. For Python, verify `python3 --version` inside WSL.

### A project is slow to scan

Keep repositories inside the Linux filesystem rather than mounting a large
Windows dependency tree through `/mnt/c`. Ensure generated folders use one of
the ignored names documented in [Performance](PERFORMANCE.md).

### Git works in Windows but not in the WSL project

Run `git --version` and configure Git identity inside that distribution. Divex
deliberately uses Linux Git so ownership, permissions, line endings, and hooks
match command-line work in WSL.

## Security model

Distribution names come only from `wsl.exe --list`. Project choices must remain
inside the selected distribution. Commands use executable/argument arrays and
fixed WSL flags; renderer code cannot submit arbitrary Linux shell text.
