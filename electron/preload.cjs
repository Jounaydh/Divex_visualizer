const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("divex", {
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  refreshProject: (args) => ipcRenderer.invoke("project:refresh", args),
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
  shareProjectEntry: (args) =>
    ipcRenderer.invoke("project:share-entry", args),
  pasteProjectEntry: (args) =>
    ipcRenderer.invoke("project:paste-entry", args),
  saveProjectFile: (args) => ipcRenderer.invoke("project:save-file", args),
  formatDartFile: (args) => ipcRenderer.invoke("project:format-dart", args),
  analyzeFlutter: (args) => ipcRenderer.invoke("project:analyze-flutter", args),
  reportRendererError: (report) =>
    ipcRenderer.invoke("app:report-renderer-error", report),
  reloadRenderer: (args) =>
    ipcRenderer.invoke("app:reload-renderer", args),
  platform: process.platform,
});
