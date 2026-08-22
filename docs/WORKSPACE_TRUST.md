# Workspace trust

Divex opens every new local or WSL folder in a non-executing state until the
user makes an explicit trust choice. Reading, searching, mapping, editing, Git
inspection, and file management remain available in Restricted Mode.

## First-open choice

The first time a folder is opened, Divex asks:

- **Open in Restricted Mode** — remember the folder as untrusted and keep code
  execution disabled.
- **Trust Workspace** — remember the exact folder and enable execution.

The decision is stored outside the repository in the Divex user-data security
directory. It is keyed by the normalized absolute native or WSL root path, so
trusting one project does not trust its parent, sibling, or another distribution.

Use the project menu's **Workspace trust…** action to review or revoke the
decision. Revoking trust closes terminals and debugger sessions owned by the
current Divex window.

The dialog lists each affected permission before the decision. It explicitly
states that project commands run with the current operating-system account and
may access user files or the network. Trust never causes a script to run merely
because the folder opened.

## Restricted Mode

Restricted Mode disables:

- integrated and external terminals
- detected task discovery and execution
- Run Active File and external file launching
- Flutter project analysis
- Python, Dart, and Flutter debugging
- Python debug-adapter installation

Safe source operations remain available:

- project maps and static analysis
- source reading, editing, saving, and recovery
- Explorer create, rename, copy, move, and delete actions
- text, file, symbol, definition, and reference navigation
- Git status and review workflows

## Enforcement boundary

Disabled buttons are only the visible layer. Electron independently reads the
persisted trust decision before starting a terminal, task, project file,
analysis command, debugger, external application, or adapter setup. Renderer
state cannot grant execution permission by altering an IPC argument.

Electron also binds privileged IPC to the exact active project root for the
requesting window. A renderer cannot reuse a trusted path from another Divex
window or ask a handler to operate on an unrelated folder.

Trust records contain only the normalized workspace path, the boolean decision,
and its timestamp. Project files are never copied into the trust store.

Third-party extensions remain blocked regardless of workspace trust. They will
require a separate isolated extension host and their own permission model before
they can be enabled.
