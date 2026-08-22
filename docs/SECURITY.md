# Security model

Divex treats the Electron main process as privileged and every renderer as
untrusted input. The application does not load remote UI content or third-party
extension code.

## Renderer containment

Every BrowserWindow uses:

- Chromium process sandboxing, also enforced globally with `app.enableSandbox()`
- context isolation
- Node.js integration disabled in the main frame and subframes
- web security enabled and insecure mixed content disabled
- webviews, experimental features, drag-to-navigate, and popup windows disabled
- page-initiated top-level and frame navigation blocked
- all Chromium permission checks and requests denied

The packaged renderer has a deny-by-default Content Security Policy:

```text
default-src 'none'; script-src 'self'; connect-src 'self'; object-src 'none';
frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Images and fonts can come only from the packaged app or `data:` URLs. Workers
can come only from the packaged app. Inline and evaluated scripts are not
allowed. Inline styles remain allowed because Ace creates runtime editor style
elements; this exception does not grant script execution. Development adds
only the local Vite HTTP/WebSocket endpoint to `connect-src`.

## IPC authorization

Every `ipcMain.handle` registration passes through one authorization wrapper
before its handler runs. A call is rejected unless:

1. its `webContents` was registered when Divex created the window;
2. it comes from that window's main frame, not an iframe;
3. the frame URL is the exact packaged `dist/index.html`, or the exact local
   Vite origin during development;
4. a supplied project root matches the project currently opened in that
   specific window; and
5. the window role is allowed to call that channel.

Divex Mini has a small allowlist covering project selection/refresh/watch,
validated external file opening, its own window state, reload, and bounded
error reporting. It cannot call write, terminal, debugger, Git, recovery,
workspace-trust, or task-execution handlers.

The preload exposes named operations rather than `ipcRenderer`, and listener
callbacks never receive Electron event objects.

## Workspace and project-script permissions

Trust is granted to one normalized absolute native or WSL root. It does not
flow to parent, sibling, or previously opened folders. Electron checks both the
window's active project and the persisted trust record before execution.

Restricted Mode still permits source inspection, maps, search, editing,
recovery, safe file management, and Git review. Trust enables:

- npm scripts and other detected project tasks;
- validated `divex.tasks.json` commands;
- active-file execution;
- build tools, analyzers, and project debuggers;
- integrated and external terminals;
- debug-tool installation; and
- external file or validated HTTP/HTTPS link launching.

These processes run with the user's operating-system account and may access
files or the network. Divex never runs a project script merely because a folder
was opened. The trust dialog shows each permission and whether it is allowed or
blocked before the user makes a decision.

## Third-party extension policy

Third-party extensions and in-renderer extensions are disabled. The main
process exposes no extension-loading IPC method, webviews and child windows are
blocked, and the extension policy fails closed if future code attempts to use
it.

Extensions must not be enabled until Divex has all of the following:

- a separate extension-host process;
- capability-scoped IPC rather than the application preload API;
- per-extension storage;
- CPU, memory, output, and execution-time limits; and
- explicit workspace permission grants.

An extension must never execute inside the renderer or Electron main process.

## Remaining release controls

The Windows package has branded executable metadata and a fail-closed signed
release command, but the current artifacts remain unsigned because the build
machine does not have a trusted code-signing certificate. Provide the
certificate through electron-builder's protected `CSC_LINK` and
`CSC_KEY_PASSWORD` environment variables and use `npm run dist:win:signed`;
the command rejects either artifact unless Authenticode reports `Valid`.

The application does not auto-update. Before a public production release, add
a trusted Windows signing certificate, protected update metadata, Electron fuse
hardening, dependency/security scanning in CI, and a documented security-
reporting route. These distribution controls are separate from the runtime
containment implemented here.
