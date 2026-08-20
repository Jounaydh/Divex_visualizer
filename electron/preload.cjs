const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("divex", {
  chooseProject: () => ipcRenderer.invoke("project:choose"),
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
  shareProjectEntry: (args) =>
    ipcRenderer.invoke("project:share-entry", args),
  pasteProjectEntry: (args) =>
    ipcRenderer.invoke("project:paste-entry", args),
  saveProjectFile: (args) => ipcRenderer.invoke("project:save-file", args),
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
