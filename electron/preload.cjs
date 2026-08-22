const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("divex", {
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  chooseWslProject: () => ipcRenderer.invoke("project:choose-wsl"),
  getWslStatus: () => ipcRenderer.invoke("app:wsl-status"),
  getWorkspaceTrust: (args) => ipcRenderer.invoke("workspace-trust:get", args),
  setWorkspaceTrust: (args) => ipcRenderer.invoke("workspace-trust:set", args),
  onProjectLoadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("project:load-progress", listener);
    return () => ipcRenderer.removeListener("project:load-progress", listener);
  },
  refreshProject: (args) => ipcRenderer.invoke("project:refresh", args),
  watchProject: (args) => ipcRenderer.invoke("project:watch", args),
  stopWatchingProject: () => ipcRenderer.invoke("project:unwatch"),
  onProjectChanged: (callback) => {
    const listener = (_event, change) => callback(change);
    ipcRenderer.on("project:changed", listener);
    return () => ipcRenderer.removeListener("project:changed", listener);
  },
  onProjectWatchError: (callback) => {
    const listener = (_event, error) => callback(error);
    ipcRenderer.on("project:watch-error", listener);
    return () => ipcRenderer.removeListener("project:watch-error", listener);
  },
  renameProjectEntry: (args) =>
    ipcRenderer.invoke("project:rename-entry", args),
  createProjectEntry: (args) =>
    ipcRenderer.invoke("project:create-entry", args),
  duplicateProjectEntry: (args) =>
    ipcRenderer.invoke("project:duplicate-entry", args),
  deleteProjectEntry: (args) =>
    ipcRenderer.invoke("project:delete-entry", args),
  revealProjectEntry: (args) =>
    ipcRenderer.invoke("project:reveal-entry", args),
  copyProjectEntryPath: (args) =>
    ipcRenderer.invoke("project:copy-entry-path", args),
  openProjectEntry: (args) =>
    ipcRenderer.invoke("project:open-entry", args),
  openProjectTerminal: (args) =>
    ipcRenderer.invoke("project:open-terminal", args),
  listTerminalProfiles: (args) =>
    ipcRenderer.invoke("terminal:list-profiles", args),
  openTerminalLink: (args) => ipcRenderer.invoke("terminal:open-link", args),
  listProjectTasks: (args) =>
    ipcRenderer.invoke("project:list-tasks", args),
  runProjectTask: (args) =>
    ipcRenderer.invoke("project:run-task", args),
  runProjectFile: (args) =>
    ipcRenderer.invoke("project:run-file", args),
  createTerminal: (args) => ipcRenderer.invoke("terminal:create", args),
  runTaskInTerminal: (args) =>
    ipcRenderer.invoke("terminal:run-task", args),
  runFileInTerminal: (args) =>
    ipcRenderer.invoke("terminal:run-file", args),
  listTerminalSessions: () => ipcRenderer.invoke("terminal:list"),
  writeTerminal: (args) => ipcRenderer.invoke("terminal:write", args),
  resizeTerminal: (args) => ipcRenderer.invoke("terminal:resize", args),
  closeTerminal: (args) => ipcRenderer.invoke("terminal:close", args),
  closeAllTerminals: () => ipcRenderer.invoke("terminal:close-all"),
  onTerminalEvent: (callback) => {
    const listener = (_event, terminalEvent) => callback(terminalEvent);
    ipcRenderer.on("terminal:event", listener);
    return () => ipcRenderer.removeListener("terminal:event", listener);
  },
  startDebugSession: (args) => ipcRenderer.invoke("debug:start", args),
  setDebugBreakpoints: (args) =>
    ipcRenderer.invoke("debug:set-breakpoints", args),
  getDebugStack: (args) => ipcRenderer.invoke("debug:stack", args),
  getDebugScopes: (args) => ipcRenderer.invoke("debug:scopes", args),
  getDebugVariables: (args) => ipcRenderer.invoke("debug:variables", args),
  controlDebugSession: (args) => ipcRenderer.invoke("debug:control", args),
  stopDebugSession: (args) => ipcRenderer.invoke("debug:disconnect", args),
  installPythonDebugAdapter: (args) =>
    ipcRenderer.invoke("debug:install-python-adapter", args),
  onDebugEvent: (callback) => {
    const listener = (_event, debugEvent) => callback(debugEvent);
    ipcRenderer.on("debug:event", listener);
    return () => ipcRenderer.removeListener("debug:event", listener);
  },
  shareProjectEntry: (args) =>
    ipcRenderer.invoke("project:share-entry", args),
  pasteProjectEntry: (args) =>
    ipcRenderer.invoke("project:paste-entry", args),
  saveProjectFile: (args) => ipcRenderer.invoke("project:save-file", args),
  listEditorRecoveries: (args) => ipcRenderer.invoke("editor:list-recovery", args),
  writeEditorRecovery: (args) => ipcRenderer.invoke("editor:write-recovery", args),
  clearEditorRecovery: (args) => ipcRenderer.invoke("editor:clear-recovery", args),
  formatDartFile: (args) => ipcRenderer.invoke("project:format-dart", args),
  analyzeFlutter: (args) => ipcRenderer.invoke("project:analyze-flutter", args),
  getGitStatus: (args) => ipcRenderer.invoke("git:status", args),
  getGitDiff: (args) => ipcRenderer.invoke("git:diff", args),
  stageGitFile: (args) => ipcRenderer.invoke("git:stage", args),
  unstageGitFile: (args) => ipcRenderer.invoke("git:unstage", args),
  stageAllGitChanges: (args) => ipcRenderer.invoke("git:stage-all", args),
  unstageAllGitChanges: (args) =>
    ipcRenderer.invoke("git:unstage-all", args),
  commitGitChanges: (args) => ipcRenderer.invoke("git:commit", args),
  initializeGitRepository: (args) => ipcRenderer.invoke("git:initialize", args),
  changeGitBranch: (args) => ipcRenderer.invoke("git:change-branch", args),
  syncGitRepository: (args) => ipcRenderer.invoke("git:sync", args),
  stashGitChanges: (args) => ipcRenderer.invoke("git:stash", args),
  discardGitChanges: (args) => ipcRenderer.invoke("git:discard", args),
  reportRendererError: (report) =>
    ipcRenderer.invoke("app:report-renderer-error", report),
  reloadRenderer: (args) =>
    ipcRenderer.invoke("app:reload-renderer", args),
  openMiniWindow: (args) =>
    ipcRenderer.invoke("app:open-mini-window", args),
  getMiniWindowState: () =>
    ipcRenderer.invoke("app:get-mini-window-state"),
  setMiniAlwaysOnTop: (args) =>
    ipcRenderer.invoke("app:set-mini-always-on-top", args),
  getWorkspaceTrust: (args) =>
    ipcRenderer.invoke("workspace:get-trust", args),
  setWorkspaceTrust: (args) =>
    ipcRenderer.invoke("workspace:set-trust", args),
  platform: process.platform,
});
