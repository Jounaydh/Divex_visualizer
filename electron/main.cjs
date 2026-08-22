const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain: electronIpcMain,
  ShareMenu,
  shell,
} = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  changeBranch,
  commitGit,
  discardChanges,
  getGitDiff,
  getGitStatus,
  initializeRepository,
  mutateAll: mutateAllGit,
  mutatePath: mutateGitPath,
  stashChanges,
  syncRepository,
} = require("./source-control/git.cjs");
const { loadProject } = require("./project/loader.cjs");
const { atomicSaveProjectFile } = require("./project/atomic-save.cjs");
const {
  clearRecovery,
  listRecoveries,
  writeRecovery,
} = require("./project/recovery.cjs");
const {
  createProjectEntry,
  duplicateProjectEntry,
  transferProjectEntry,
} = require("./project/mutations.cjs");
const {
  createProjectWatcherService,
} = require("./project/watcher.cjs");
const { createTerminalService } = require("./terminal/service.cjs");
const { createDebugService } = require("./debug/service.cjs");
const {
  createWorkspaceTrustService,
} = require("./security/workspace-trust.cjs");
const {
  createIpcAuthorization,
} = require("./security/ipc-authorization.cjs");
const {
  hardenWebContents,
  secureWebPreferences,
} = require("./security/window-policy.cjs");
const { runTool } = require("./platform/tool-runner.cjs");
const { openTerminalWindow } = require("./terminal/external-window.cjs");
const {
  listTerminalProfiles,
  publicTerminalProfile,
  resolveTerminalProfile,
} = require("./terminal/profiles.cjs");
const {
  parseWslUncPath,
  resolveMutableProjectEntry,
  resolveProjectFile,
  validateEntryName,
  validateProjectRoot,
} = require("./project/paths.cjs");
const {
  detectProjectTasks,
  runnerForFile,
} = require("./project/tasks.cjs");
const {
  getWslHome,
  getWslStatus,
  runInWsl,
} = require("./platform/wsl.cjs");

const APP_ID = "com.divex.visualizer";
const isDevelopment = !app.isPackaged && process.argv.includes("--dev");
const rendererPath = path.join(__dirname, "..", "dist", "index.html");
const RENDERER_RECOVERY_WINDOW_MS = 60_000;
const MAX_RENDERER_REPORT_LENGTH = 24_000;
app.enableSandbox();
const ipcAuthorization = createIpcAuthorization({
  isDevelopment,
  rendererPath,
});
const ipcMain = {
  handle(channel, listener) {
    return electronIpcMain.handle(channel, async (event, ...args) => {
      ipcAuthorization.assertEvent(event, channel);
      const rootPath = args[0]?.rootPath;
      if (typeof rootPath === "string") {
        ipcAuthorization.assertProject(event, rootPath);
      }
      return listener(event, ...args);
    });
  },
};
const terminalService = createTerminalService({
  onEvent(owner, terminalEvent) {
    if (owner && !owner.isDestroyed()) {
      owner.send("terminal:event", terminalEvent);
    }
  },
});
const debugService = createDebugService({
  onEvent(owner, debugEvent) {
    if (owner && !owner.isDestroyed()) {
      owner.send("debug:event", debugEvent);
    }
  },
});
const workspaceTrustService = createWorkspaceTrustService({
  storagePath: () =>
    path.join(app.getPath("userData"), "security", "workspace-trust.json"),
});
const projectWatcherService = createProjectWatcherService();
let miniWindow = null;
let miniWindowState = null;
let miniWindowStateTimer = null;

function defaultMiniWindowState() {
  return {
    width: 720,
    height: 520,
    alwaysOnTop: false,
  };
}

async function loadMiniWindowState() {
  if (miniWindowState) return miniWindowState;
  try {
    const stored = JSON.parse(
      await fs.readFile(
        path.join(app.getPath("userData"), "mini-window-state.json"),
        "utf8",
      ),
    );
    miniWindowState = {
      ...defaultMiniWindowState(),
      ...stored,
      width: Math.max(420, Number(stored.width) || 720),
      height: Math.max(320, Number(stored.height) || 520),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Divex could not load its Mini window state.", error);
    }
    miniWindowState = defaultMiniWindowState();
  }
  return miniWindowState;
}

async function persistMiniWindowState() {
  if (!miniWindowState) return;
  try {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(
      path.join(app.getPath("userData"), "mini-window-state.json"),
      JSON.stringify(miniWindowState, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("Divex could not save its Mini window state.", error);
  }
}

function scheduleMiniWindowStateSave(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  miniWindowState = {
    ...defaultMiniWindowState(),
    ...miniWindowState,
    ...bounds,
    alwaysOnTop: window.isAlwaysOnTop(),
  };
  clearTimeout(miniWindowStateTimer);
  miniWindowStateTimer = setTimeout(() => {
    miniWindowStateTimer = null;
    void persistMiniWindowState();
  }, 180);
}

function clippedReportValue(value) {
  return typeof value === "string"
    ? value.slice(0, MAX_RENDERER_REPORT_LENGTH)
    : undefined;
}

async function appendRendererDiagnostic(entry) {
  try {
    const logDirectory = path.join(app.getPath("userData"), "logs");
    await fs.mkdir(logDirectory, { recursive: true });
    await fs.appendFile(
      path.join(logDirectory, "renderer-errors.jsonl"),
      `${JSON.stringify({
        ...entry,
        recordedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        platform: process.platform,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    console.error("Divex could not write its renderer diagnostic.", error);
  }
}

function sanitizeRendererReport(report) {
  return {
    kind: "renderer-error",
    source: clippedReportValue(report?.source) ?? "unknown",
    message:
      clippedReportValue(report?.message) ?? "Unknown renderer error",
    stack: clippedReportValue(report?.stack),
    componentStack: clippedReportValue(report?.componentStack),
    feature: clippedReportValue(report?.feature),
    route: clippedReportValue(report?.route),
    occurredAt: clippedReportValue(report?.occurredAt),
  };
}

function toolError(error, fallback) {
  const stdout = typeof error?.stdout === "string" ? error.stdout : "";
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const message =
    error?.code === "ENOENT"
      ? fallback
      : [stdout, stderr, error?.message].filter(Boolean).join("\n");
  return { success: false, output: message || fallback };
}

function loadRenderer(window, safeMode = false, rendererQuery = {}) {
  const query = {
    ...rendererQuery,
    ...(safeMode ? { safeMode: "1" } : {}),
  };
  if (isDevelopment) {
    const url = new URL("http://localhost:5173");
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return window.loadURL(url.toString());
  }
  return window.loadFile(rendererPath, {
    query,
  });
}

function attachRendererRecovery(window, rendererQuery = {}) {
  let recentCrashes = [];
  let unresponsiveDialogOpen = false;

  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || window.isDestroyed()) return;

    const now = Date.now();
    recentCrashes = recentCrashes.filter(
      (timestamp) => now - timestamp < RENDERER_RECOVERY_WINDOW_MS,
    );
    recentCrashes.push(now);
    void appendRendererDiagnostic({
      kind: "render-process-gone",
      reason: details.reason,
      exitCode: details.exitCode,
      crashCount: recentCrashes.length,
    });

    if (recentCrashes.length === 1) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          void loadRenderer(window, true, rendererQuery);
        }
      }, 300);
      return;
    }

    void dialog
      .showMessageBox(window, {
        type: "warning",
        title: "Divex renderer stopped",
        message: "The visual workspace stopped more than once.",
        detail:
          "Reloading in safe mode starts with the 2D map and large-project protection. Your project files are not changed.",
        buttons: ["Reload in safe mode", "Close window"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (window.isDestroyed()) return;
        if (response === 0) {
          void loadRenderer(window, true, rendererQuery);
        }
        else window.close();
      });
  });

  window.on("unresponsive", () => {
    if (unresponsiveDialogOpen || window.isDestroyed()) return;
    unresponsiveDialogOpen = true;
    void appendRendererDiagnostic({ kind: "renderer-unresponsive" });
    void dialog
      .showMessageBox(window, {
        type: "warning",
        title: "Divex is taking longer than expected",
        message: "The visual workspace is not responding.",
        detail:
          "You can keep waiting for a large layout or recover with the protected 2D workspace.",
        buttons: ["Keep waiting", "Reload in safe mode"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        unresponsiveDialogOpen = false;
        if (response === 1 && !window.isDestroyed()) {
          void loadRenderer(window, true, rendererQuery);
        }
      });
  });

  window.on("responsive", () => {
    unresponsiveDialogOpen = false;
  });
}

function createWindow() {
  const platformTitleBar =
    process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 18, y: 16 },
        }
      : {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#141519",
            symbolColor: "#d7d9df",
            height: 52,
          },
        };
  const window = new BrowserWindow({
    width: 1510,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#101114",
    autoHideMenuBar: true,
    ...platformTitleBar,
    webPreferences: secureWebPreferences(path.join(__dirname, "preload.cjs")),
  });

  ipcAuthorization.register(window.webContents, "main");
  hardenWebContents(window.webContents);
  attachRendererRecovery(window);
  const terminalOwner = window.webContents;
  terminalOwner.once("destroyed", () => {
    terminalService.closeOwnerSessions(terminalOwner);
    debugService.closeOwnerSessions(terminalOwner);
  });
  void loadRenderer(window);
}

async function createMiniWindow(rootPath) {
  const resolvedRoot =
    typeof rootPath === "string" && path.isAbsolute(rootPath)
      ? path.resolve(rootPath)
      : "";
  const rendererQuery = {
    mode: "mini",
    rootPath: resolvedRoot,
  };
  if (miniWindow && !miniWindow.isDestroyed()) {
    if (resolvedRoot) {
      ipcAuthorization.setProject(miniWindow.webContents, resolvedRoot);
    }
    await loadRenderer(miniWindow, false, rendererQuery);
    miniWindow.show();
    miniWindow.focus();
    return miniWindow;
  }

  const state = await loadMiniWindowState();
  const platformTitleBar =
    process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 13 },
        }
      : {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#141519",
            symbolColor: "#d7d9df",
            height: 46,
          },
        };
  miniWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(Number.isFinite(state.x) && Number.isFinite(state.y)
      ? { x: state.x, y: state.y }
      : {}),
    minWidth: 420,
    minHeight: 320,
    backgroundColor: "#101114",
    title: "Divex Mini",
    autoHideMenuBar: true,
    ...platformTitleBar,
    show: false,
    webPreferences: secureWebPreferences(path.join(__dirname, "preload.cjs")),
  });
  ipcAuthorization.register(miniWindow.webContents, "mini");
  if (resolvedRoot) {
    ipcAuthorization.setProject(miniWindow.webContents, resolvedRoot);
  }
  hardenWebContents(miniWindow.webContents);
  miniWindow.setAlwaysOnTop(Boolean(state.alwaysOnTop), "floating");
  attachRendererRecovery(miniWindow, rendererQuery);
  miniWindow.on("move", () => scheduleMiniWindowStateSave(miniWindow));
  miniWindow.on("resize", () => scheduleMiniWindowStateSave(miniWindow));
  miniWindow.on("close", () => {
    scheduleMiniWindowStateSave(miniWindow);
    void persistMiniWindowState();
  });
  miniWindow.on("closed", () => {
    miniWindow = null;
  });
  miniWindow.once("ready-to-show", () => {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.show();
  });
  await loadRenderer(miniWindow, false, rendererQuery);
  return miniWindow;
}

ipcMain.handle("app:report-renderer-error", async (_event, report) => {
  await appendRendererDiagnostic(sanitizeRendererReport(report));
  return { success: true };
});

ipcMain.handle("app:reload-renderer", async (event, args) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return;
  const currentUrl = new URL(window.webContents.getURL());
  const rendererQuery =
    currentUrl.searchParams.get("mode") === "mini"
      ? {
          mode: "mini",
          rootPath: currentUrl.searchParams.get("rootPath") ?? "",
        }
      : {};
  await loadRenderer(window, Boolean(args?.safeMode), rendererQuery);
});

ipcMain.handle("app:open-mini-window", async (_event, args) => {
  try {
    await createMiniWindow(args?.rootPath);
    return { success: true, output: "Divex Mini opened." };
  } catch (error) {
    return toolError(error, "Divex Mini could not be opened.");
  }
});

ipcMain.handle("app:get-mini-window-state", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return {
    success: true,
    output: "Mini window state loaded.",
    alwaysOnTop: Boolean(window?.isAlwaysOnTop()),
  };
});

ipcMain.handle("app:set-mini-always-on-top", async (event, args) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return { success: false, output: "The Mini window is not available." };
  }
  const alwaysOnTop = Boolean(args?.alwaysOnTop);
  window.setAlwaysOnTop(alwaysOnTop, "floating");
  scheduleMiniWindowStateSave(window);
  return {
    success: true,
    output: alwaysOnTop
      ? "Divex Mini will stay above other windows."
      : "Always-on-top turned off.",
    alwaysOnTop,
  };
});

function projectProgressReporter(event) {
  return (progress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send("project:load-progress", progress);
    }
  };
}

async function loadOpenedProject(event, rootPath) {
  const project = await loadProject(rootPath, projectProgressReporter(event));
  if (project.files.length === 0) {
    throw new Error("No supported source files were found in that folder.");
  }
  ipcAuthorization.setProject(event.sender, project.rootPath);
  return project;
}

ipcMain.handle("app:wsl-status", async () => getWslStatus());

ipcMain.handle("workspace-trust:get", async (_event, args) => {
  try {
    return {
      success: true,
      output: "Workspace trust loaded.",
      status: await workspaceTrustService.getStatus(args?.rootPath),
    };
  } catch (error) {
    return toolError(error, "Workspace trust could not be loaded.");
  }
});

ipcMain.handle("workspace-trust:set", async (event, args) => {
  try {
    const status = await workspaceTrustService.setTrusted(
      args?.rootPath,
      Boolean(args?.trusted),
    );
    if (!status.trusted) {
      terminalService.closeOwnerSessions(event.sender);
      debugService.closeOwnerSessions(event.sender);
    }
    return {
      success: true,
      output: status.trusted
        ? "Workspace trusted. Project execution is enabled."
        : "Workspace opened in Restricted Mode.",
      status,
    };
  } catch (error) {
    return toolError(error, "Workspace trust could not be changed.");
  }
});

ipcMain.handle("project:choose", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(owner, {
    title: "Open a project in Divex",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return loadOpenedProject(event, result.filePaths[0]);
});

ipcMain.handle("project:choose-wsl", async (event) => {
  const status = await getWslStatus();
  if (!status.available) throw new Error(status.output);
  const distributions = status.distributions
    .filter((item) => !item.system)
    .sort((left, right) => {
      if (left.name === status.defaultDistribution) return -1;
      if (right.name === status.defaultDistribution) return 1;
      return left.name.localeCompare(right.name);
    });
  const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  let distribution = distributions[0]?.name;
  if (distributions.length > 1) {
    const buttons = [...distributions.map((item) => item.name), "Cancel"];
    const selection = await dialog.showMessageBox(owner, {
      type: "question",
      title: "Open a WSL project",
      message: "Choose a Linux distribution",
      detail:
        "Divex will open and edit the project directly in its Linux filesystem.",
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      noLink: true,
    });
    if (selection.response === buttons.length - 1) return null;
    distribution = distributions[selection.response]?.name;
  }
  if (!distribution) throw new Error("No WSL distribution was selected.");

  const home = await getWslHome(distribution);
  const result = await dialog.showOpenDialog(owner, {
    title: `Open a ${distribution} project in Divex`,
    defaultPath: home.windowsPath,
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selected = parseWslUncPath(result.filePaths[0]);
  if (
    !selected ||
    selected.distribution.toLowerCase() !== distribution.toLowerCase()
  ) {
    throw new Error(
      `Choose a folder inside the ${distribution} Linux filesystem.`,
    );
  }
  return loadOpenedProject(event, result.filePaths[0]);
});

ipcMain.handle("project:refresh", async (event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a project folder before refreshing.");
    }
    return {
      success: true,
      output: "Project refreshed.",
      project: await loadProject(
        path.resolve(args.rootPath),
        projectProgressReporter(event),
      ),
    };
  } catch (error) {
    return toolError(error, "The project could not be refreshed.");
  }
});

ipcMain.handle("project:watch", async (event, args) => {
  try {
    if (!path.isAbsolute(args?.rootPath)) {
      throw new Error("Open a project folder before watching it.");
    }
    const rootPath = projectWatcherService.start(
      event.sender,
      path.resolve(args.rootPath),
    );
    return {
      success: true,
      output: "Live project watching started.",
      rootPath,
    };
  } catch (error) {
    return toolError(error, "Live project watching could not be started.");
  }
});

ipcMain.handle("project:unwatch", async (event) => {
  projectWatcherService.stop(event.sender);
  return { success: true, output: "Live project watching stopped." };
});

ipcMain.handle("project:create-entry", async (event, args) => {
  try {
    const resolvedRoot = validateProjectRoot(
      args?.rootPath,
      "Open a project folder before creating an item.",
    );
    const result = await createProjectEntry({
      rootPath: resolvedRoot,
      parentPath: args?.parentPath,
      entryKind: args?.entryKind,
      name: args?.name,
    });
    if (result.conflict) {
      return {
        success: false,
        conflict: true,
        output: result.output,
        suggestedName: result.suggestedName,
      };
    }
    return {
      success: true,
      output: result.output,
      entryPath: result.entryPath,
      project: await loadProject(
        resolvedRoot,
        projectProgressReporter(event),
      ),
    };
  } catch (error) {
    return toolError(error, "The project item could not be created.");
  }
});

ipcMain.handle("project:duplicate-entry", async (event, args) => {
  try {
    const result = await duplicateProjectEntry({
      rootPath: args?.rootPath,
      sourcePath: args?.sourcePath,
      sourceKind: args?.sourceKind,
    });
    return {
      success: true,
      output: result.output,
      entryPath: result.entryPath,
      project: await loadProject(
        validateProjectRoot(args.rootPath),
        projectProgressReporter(event),
      ),
    };
  } catch (error) {
    return toolError(error, "The project item could not be duplicated.");
  }
});

ipcMain.handle("project:rename-entry", async (event, args) => {
  try {
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    const nextName = validateEntryName(args.newName);
    const nextEntry = path.join(path.dirname(resolvedEntry), nextName);
    resolveProjectFile(
      resolvedRoot,
      path.relative(resolvedRoot, nextEntry),
    );
    try {
      await fs.access(nextEntry);
      throw new Error(`“${nextName}” already exists in this folder.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.rename(resolvedEntry, nextEntry);
    return {
      success: true,
      output: `Renamed to ${nextName}.`,
      project: await loadProject(
        resolvedRoot,
        projectProgressReporter(event),
      ),
      entryPath: path
        .relative(resolvedRoot, nextEntry)
        .split(path.sep)
        .join("/"),
    };
  } catch (error) {
    return toolError(error, "The item could not be renamed.");
  }
});

ipcMain.handle("project:delete-entry", async (event, args) => {
  try {
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    const wslEntry = parseWslUncPath(resolvedEntry);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "warning",
      title: "Delete project item",
      message: wslEntry
        ? `Permanently delete “${path.basename(resolvedEntry)}”?`
        : `Move “${path.basename(resolvedEntry)}” to the Trash?`,
      detail: wslEntry
        ? args.entryKind === "folder"
          ? "WSL folders do not use the Windows Trash. This folder and everything inside it cannot be recovered by Divex."
          : "WSL files do not use the Windows Trash. This file cannot be recovered by Divex."
        : args.entryKind === "folder"
          ? "The folder and everything inside it will be moved to the Trash."
          : "The file will be moved to the Trash.",
      buttons: ["Cancel", wslEntry ? "Delete permanently" : "Move to Trash"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const confirmation = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options);
    if (confirmation.response !== 1) {
      return {
        success: false,
        cancelled: true,
        output: "Delete cancelled.",
      };
    }
    if (wslEntry) {
      await fs.rm(resolvedEntry, {
        recursive: args.entryKind === "folder",
        force: false,
      });
    } else {
      await shell.trashItem(resolvedEntry);
    }
    return {
      success: true,
      output: wslEntry
        ? `Permanently deleted ${path.basename(resolvedEntry)} from WSL.`
        : `Moved ${path.basename(resolvedEntry)} to the Trash.`,
      project: await loadProject(
        resolvedRoot,
        projectProgressReporter(event),
      ),
    };
  } catch (error) {
    return toolError(error, "The item could not be moved to the Trash.");
  }
});

ipcMain.handle("project:reveal-entry", async (_event, args) => {
  try {
    const { resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    shell.showItemInFolder(resolvedEntry);
    return { success: true, output: "Item revealed." };
  } catch (error) {
    return toolError(error, "The item could not be revealed.");
  }
});

ipcMain.handle("project:copy-entry-path", async (_event, args) => {
  try {
    const { resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    const wslEntry = parseWslUncPath(resolvedEntry);
    clipboard.writeText(
      args.relative
        ? args.entryPath
        : wslEntry?.linuxPath ?? resolvedEntry,
    );
    return {
      success: true,
      output: args.relative
        ? "Relative path copied."
        : wslEntry
          ? "Linux path copied."
          : "Path copied.",
    };
  } catch (error) {
    return toolError(error, "The path could not be copied.");
  }
});

ipcMain.handle("project:open-entry", async (_event, args) => {
  try {
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const errorMessage = await shell.openPath(resolvedEntry);
    if (errorMessage) throw new Error(errorMessage);
    return { success: true, output: "Opened in the default application." };
  } catch (error) {
    return toolError(error, "The item could not be opened.");
  }
});

ipcMain.handle("project:open-terminal", async (_event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a project folder before launching a terminal.");
    }
    const resolvedRoot = path.resolve(args.rootPath);
    await workspaceTrustService.requireTrusted(resolvedRoot);
    let directory = resolvedRoot;
    if (args.entryPath) {
      const { resolvedEntry } = resolveMutableProjectEntry(
        resolvedRoot,
        args.entryPath,
      );
      directory =
        args.entryKind === "folder"
          ? resolvedEntry
          : path.dirname(resolvedEntry);
    }
    const profile = await resolveTerminalProfile(resolvedRoot, args?.profileId);
    await openTerminalWindow(directory, undefined, profile);
    return { success: true, output: "Terminal opened." };
  } catch (error) {
    return toolError(error, "A terminal could not be opened here.");
  }
});

ipcMain.handle("project:list-tasks", async (_event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a project folder to discover tasks.");
    }
    const resolvedRoot = path.resolve(args.rootPath);
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const tasks = await detectProjectTasks(resolvedRoot);
    return {
      success: true,
      output: `${tasks.length} tasks found.`,
      tasks: tasks.map(({ id, label, group, source, detail, problemMatcher }) => ({
        id,
        label,
        group,
        source,
        detail,
        problemMatcher,
      })),
    };
  } catch (error) {
    return toolError(error, "Project tasks could not be discovered.");
  }
});

ipcMain.handle("project:run-task", async (_event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a project folder before running a task.");
    }
    const resolvedRoot = path.resolve(args.rootPath);
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const tasks = await detectProjectTasks(resolvedRoot);
    const task = tasks.find((candidate) => candidate.id === args.taskId);
    if (!task) throw new Error("That task is no longer available.");
    const profile = await resolveTerminalProfile(resolvedRoot, args?.profileId);
    const taskDirectory = task.cwd ? path.resolve(resolvedRoot, task.cwd) : resolvedRoot;
    await openTerminalWindow(taskDirectory, task, profile);
    return {
      success: true,
      output: `Started ${task.label} in Terminal.`,
    };
  } catch (error) {
    return toolError(error, "The task could not be started.");
  }
});

ipcMain.handle("project:run-file", async (_event, args) => {
  try {
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const runner = runnerForFile(resolvedRoot, resolvedEntry);
    if (!runner) {
      throw new Error(
        "Run Active File supports Dart, Python, Java, JavaScript, and TypeScript.",
      );
    }
    await openTerminalWindow(resolvedRoot, runner);
    return {
      success: true,
      output: `Started ${path.basename(resolvedEntry)} in Terminal.`,
    };
  } catch (error) {
    return toolError(error, "The active file could not be started.");
  }
});

ipcMain.handle("terminal:create", async (event, args) => {
  try {
    const resolvedRoot = await workspaceTrustService.requireTrusted(
      args?.rootPath,
    );
    const profile = await resolveTerminalProfile(resolvedRoot, args?.profileId);
    return terminalService.create(
      {
        rootPath: resolvedRoot,
        cwd: args?.cwd,
        executable: profile.executable,
        args: profile.args,
        cols: args?.cols,
        rows: args?.rows,
        title: args?.title || profile.label,
        profileId: profile.id,
        kind: "shell",
      },
      event.sender,
    );
  } catch (error) {
    return toolError(error, "The terminal could not be started.");
  }
});

ipcMain.handle("terminal:list-profiles", async (_event, args) => {
  try {
    const resolvedRoot = await workspaceTrustService.requireTrusted(args?.rootPath);
    const profiles = await listTerminalProfiles(resolvedRoot);
    return {
      success: true,
      output: `${profiles.length} terminal profiles available.`,
      profiles: profiles.map(publicTerminalProfile),
    };
  } catch (error) {
    return toolError(error, "Terminal profiles could not be loaded.");
  }
});

ipcMain.handle("terminal:open-link", async (_event, args) => {
  try {
    await workspaceTrustService.requireTrusted(args?.rootPath);
    const target = new URL(args?.url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Only HTTP and HTTPS terminal links can be opened.");
    }
    await shell.openExternal(target.toString());
    return { success: true, output: "Link opened in the default browser." };
  } catch (error) {
    return toolError(error, "The terminal link could not be opened.");
  }
});

ipcMain.handle("terminal:run-task", async (event, args) => {
  try {
    if (!path.isAbsolute(args?.rootPath)) {
      throw new Error("Open a project folder before running a task.");
    }
    const resolvedRoot = path.resolve(args.rootPath);
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const tasks = await detectProjectTasks(resolvedRoot);
    const task = tasks.find((candidate) => candidate.id === args.taskId);
    if (!task) throw new Error("That task is no longer available.");
    return terminalService.create(
      {
        rootPath: resolvedRoot,
        cwd: task.cwd,
        executable: task.executable,
        args: task.args,
        cols: args?.cols,
        rows: args?.rows,
        title: task.label,
        kind: "task",
        taskId: task.id,
        problemMatcher: task.problemMatcher,
      },
      event.sender,
    );
  } catch (error) {
    return toolError(error, "The task could not be started.");
  }
});

ipcMain.handle("terminal:run-file", async (event, args) => {
  try {
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args?.rootPath,
      args?.entryPath,
    );
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const runner = runnerForFile(resolvedRoot, resolvedEntry);
    if (!runner) {
      throw new Error(
        "Run Active File supports Dart, Python, Java, JavaScript, and TypeScript.",
      );
    }
    return terminalService.create(
      {
        rootPath: resolvedRoot,
        executable: runner.executable,
        args: runner.args,
        cols: args?.cols,
        rows: args?.rows,
        title: path.basename(resolvedEntry),
        kind: "file",
        filePath: args.entryPath,
      },
      event.sender,
    );
  } catch (error) {
    return toolError(error, "The active file could not be started.");
  }
});

ipcMain.handle("terminal:list", async (event) => ({
  success: true,
  output: "Terminal sessions loaded.",
  sessions: terminalService.list(event.sender),
}));

ipcMain.handle("terminal:write", async (event, args) =>
  terminalService.write(args?.sessionId, args?.data, event.sender),
);

ipcMain.handle("terminal:resize", async (event, args) =>
  terminalService.resize(
    args?.sessionId,
    args?.cols,
    args?.rows,
    event.sender,
  ),
);

ipcMain.handle("terminal:close", async (event, args) =>
  terminalService.close(args?.sessionId, event.sender),
);

ipcMain.handle("terminal:close-all", async (event) => {
  terminalService.closeOwnerSessions(event.sender);
  return { success: true, output: "All terminal sessions closed." };
});

ipcMain.handle("debug:start", async (event, args) => {
  try {
    await workspaceTrustService.requireTrusted(args?.rootPath);
    return debugService.start(args, event.sender);
  } catch (error) {
    return toolError(error, "The debugger could not be started.");
  }
});

ipcMain.handle("debug:set-breakpoints", async (event, args) =>
  debugService.setBreakpoints(args, event.sender),
);

ipcMain.handle("debug:stack", async (event, args) =>
  debugService.stack(args, event.sender),
);

ipcMain.handle("debug:scopes", async (event, args) =>
  debugService.scopes(args, event.sender),
);

ipcMain.handle("debug:variables", async (event, args) =>
  debugService.variables(args, event.sender),
);

ipcMain.handle("debug:control", async (event, args) =>
  debugService.control(args, event.sender),
);

ipcMain.handle("debug:disconnect", async (event, args) =>
  debugService.disconnect(args?.sessionId, event.sender),
);

ipcMain.handle("debug:install-python-adapter", async (_event, args) => {
  try {
    await workspaceTrustService.requireTrusted(args?.rootPath);
    return debugService.installPythonAdapter(args?.rootPath);
  } catch (error) {
    return toolError(error, "Python debugger setup is disabled in Restricted Mode.");
  }
});

ipcMain.handle("project:share-entry", async (event, args) => {
  try {
    if (process.platform !== "darwin") {
      throw new Error("Native sharing is currently available on macOS.");
    }
    const { resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const shareMenu = new ShareMenu({ filePaths: [resolvedEntry] });
    shareMenu.popup({ window: owner });
    return { success: true, output: "Share menu opened." };
  } catch (error) {
    return toolError(error, "The Share menu could not be opened.");
  }
});

ipcMain.handle("project:paste-entry", async (event, args) => {
  try {
    const resolvedRoot = validateProjectRoot(args?.rootPath);
    const result = await transferProjectEntry({
      rootPath: resolvedRoot,
      sourcePath: args?.sourcePath,
      sourceKind: args?.sourceKind,
      targetPath: args?.targetPath,
      targetKind: args?.targetKind,
      mode: args?.mode,
      destinationName: args?.destinationName,
    });
    if (result.conflict) {
      return {
        success: false,
        conflict: true,
        output: result.output,
        suggestedName: result.suggestedName,
      };
    }
    if (result.unchanged) {
      return {
        success: false,
        unchanged: true,
        output: result.output,
        entryPath: result.entryPath,
      };
    }
    return {
      success: true,
      output: result.output,
      project: await loadProject(
        resolvedRoot,
        projectProgressReporter(event),
      ),
      entryPath: result.entryPath,
    };
  } catch (error) {
    return toolError(error, "The item could not be pasted.");
  }
});

ipcMain.handle("project:save-file", async (_event, args) => {
  try {
    await atomicSaveProjectFile(args.rootPath, args.filePath, args.content);
    return { success: true, output: "Saved successfully." };
  } catch (error) {
    return toolError(error, "The file could not be saved.");
  }
});

ipcMain.handle("project:format-dart", async (_event, args) => {
  let temporaryDirectory;
  try {
    const filePath = resolveProjectFile(args.rootPath, args.filePath);
    if (path.extname(filePath).toLowerCase() !== ".dart") {
      return { success: false, output: "Dart formatting requires a .dart file." };
    }
    const wslFile = parseWslUncPath(filePath);
    if (wslFile) {
      temporaryDirectory = await fs.mkdtemp(
        path.join(path.dirname(filePath), ".divex-format-"),
      );
      const temporaryFile = path.join(temporaryDirectory, "input.dart");
      await fs.writeFile(temporaryFile, args.content, "utf8");
      const wslTemporaryFile = parseWslUncPath(temporaryFile);
      if (!wslTemporaryFile) throw new Error("The WSL format path is invalid.");
      const result = await runInWsl(
        args.rootPath,
        "dart",
        ["format", wslTemporaryFile.linuxPath],
        { cwdPath: args.rootPath, timeout: 30_000 },
      );
      const content = await fs.readFile(temporaryFile, "utf8");
      await atomicSaveProjectFile(args.rootPath, args.filePath, content);
      return {
        success: true,
        output: result.stdout || "Dart formatting completed in WSL.",
        content,
      };
    }
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "divex-format-"),
    );
    const temporaryFile = path.join(temporaryDirectory, "input.dart");
    await fs.writeFile(temporaryFile, args.content, "utf8");
    const result = await runTool("dart", ["format", "input.dart"], {
      cwd: temporaryDirectory,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30000,
    });
    const content = await fs.readFile(temporaryFile, "utf8");
    await atomicSaveProjectFile(args.rootPath, args.filePath, content);
    return {
      success: true,
      output: result.stdout || "Dart formatting completed.",
      content,
    };
  } catch (error) {
    return toolError(
      error,
      "The Dart SDK was not found. Install Flutter or add dart to PATH.",
    );
  } finally {
    if (temporaryDirectory) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
});

ipcMain.handle("editor:list-recovery", async (_event, args) => {
  try {
    const entries = await listRecoveries(
      path.join(app.getPath("userData"), "editor-recovery"),
      args?.rootPath,
    );
    return {
      success: true,
      output: entries.length
        ? `Found ${entries.length} recoverable editor buffer${entries.length === 1 ? "" : "s"}.`
        : "No editor recovery data found.",
      entries,
    };
  } catch (error) {
    return { ...toolError(error, "Editor recovery data could not be loaded."), entries: [] };
  }
});

ipcMain.handle("editor:write-recovery", async (_event, args) => {
  try {
    const entry = await writeRecovery(
      path.join(app.getPath("userData"), "editor-recovery"),
      args,
    );
    return { success: true, output: "Recovery snapshot saved.", entry };
  } catch (error) {
    return toolError(error, "The recovery snapshot could not be saved.");
  }
});

ipcMain.handle("editor:clear-recovery", async (_event, args) => {
  try {
    await clearRecovery(
      path.join(app.getPath("userData"), "editor-recovery"),
      args?.rootPath,
      args?.filePath,
    );
    return { success: true, output: "Recovery snapshot cleared." };
  } catch (error) {
    return toolError(error, "The recovery snapshot could not be cleared.");
  }
});

ipcMain.handle("project:analyze-flutter", async (_event, args) => {
  try {
    const resolvedRoot = validateProjectRoot(args.rootPath);
    await workspaceTrustService.requireTrusted(resolvedRoot);
    const result = parseWslUncPath(resolvedRoot)
      ? await runInWsl(
          resolvedRoot,
          "flutter",
          ["analyze", "--no-pub"],
          { maxBuffer: 8 * 1024 * 1024, timeout: 120_000 },
        )
      : await runTool("flutter", ["analyze", "--no-pub"], {
          cwd: resolvedRoot,
          maxBuffer: 8 * 1024 * 1024,
          timeout: 120_000,
        });
    return {
      success: true,
      output: result.stdout || "No Flutter analysis issues found.",
    };
  } catch (error) {
    return toolError(
      error,
      "The Flutter SDK was not found. Install Flutter or add it to PATH.",
    );
  }
});

ipcMain.handle("git:status", async (_event, args) =>
  getGitStatus(args?.rootPath),
);

ipcMain.handle("git:diff", async (_event, args) =>
  getGitDiff(args?.rootPath, args?.filePath, Boolean(args?.staged)),
);

ipcMain.handle("git:stage", async (_event, args) =>
  mutateGitPath(args?.rootPath, args?.filePath, "stage"),
);

ipcMain.handle("git:unstage", async (_event, args) =>
  mutateGitPath(args?.rootPath, args?.filePath, "unstage"),
);

ipcMain.handle("git:stage-all", async (_event, args) =>
  mutateAllGit(args?.rootPath, "stage"),
);

ipcMain.handle("git:unstage-all", async (_event, args) =>
  mutateAllGit(args?.rootPath, "unstage"),
);

ipcMain.handle("git:commit", async (_event, args) =>
  commitGit(args?.rootPath, args?.message),
);

ipcMain.handle("git:initialize", async (_event, args) =>
  initializeRepository(args?.rootPath),
);

ipcMain.handle("git:change-branch", async (_event, args) =>
  changeBranch(args?.rootPath, args?.branch, Boolean(args?.create)),
);

ipcMain.handle("git:sync", async (_event, args) =>
  syncRepository(args?.rootPath, args?.action),
);

ipcMain.handle("git:stash", async (_event, args) =>
  stashChanges(args?.rootPath, args?.action),
);

ipcMain.handle("git:discard", async (_event, args) =>
  discardChanges(args?.rootPath, args?.filePath),
);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  projectWatcherService.stopAll();
  clearTimeout(miniWindowStateTimer);
  void persistMiniWindowState();
});
