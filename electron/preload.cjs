const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("divex", {
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  saveProjectFile: (args) => ipcRenderer.invoke("project:save-file", args),
  formatDartFile: (args) => ipcRenderer.invoke("project:format-dart", args),
  analyzeFlutter: (args) => ipcRenderer.invoke("project:analyze-flutter", args),
  platform: process.platform,
});
