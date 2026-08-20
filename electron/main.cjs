const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  ShareMenu,
  shell,
} = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { promisify } = require("node:util");
const {
  commitGit,
  getGitDiff,
  getGitStatus,
  mutateAll: mutateAllGit,
  mutatePath: mutateGitPath,
} = require("./git-service.cjs");
const { loadProject } = require("./project-loader.cjs");
const {
  createProjectWatcherService,
} = require("./project-watcher.cjs");
const { createTerminalService } = require("./terminal-service.cjs");
const { WorkspaceTrustStore } = require("./workspace-trust.cjs");

const execFileAsync = promisify(execFile);

const isDevelopment = !app.isPackaged;
const RENDERER_RECOVERY_WINDOW_MS = 60_000;
const MAX_RENDERER_REPORT_LENGTH = 24_000;
const terminalService = createTerminalService({
  onEvent(owner, terminalEvent) {
    if (owner && !owner.isDestroyed()) {
      owner.send("terminal:event", terminalEvent);
    }
  },
});
const projectWatcherService = createProjectWatcherService();
let miniWindow = null;
let miniWindowState = null;
let miniWindowStateTimer = null;
let workspaceTrustStore = null;

function getWorkspaceTrustStore() {
  if (!workspaceTrustStore) {
    workspaceTrustStore = new WorkspaceTrustStore({
      storePath: path.join(app.getPath("userData"), "workspace-trust.json"),
    });
  }
  return workspaceTrustStore;
}

function requireTrustedWorkspace(rootPath) {
  return getWorkspaceTrustStore().requireTrusted(rootPath);
}

function isAllowedRendererNavigation(targetUrl) {
  try {
    const target = new URL(targetUrl);
    if (isDevelopment) {
      const renderer = new URL(
        process.env.VITE_DEV_SERVER_URL || "http://localhost:5173",
      );
      return target.origin === renderer.origin;
    }
    return (
      target.protocol === "file:" &&
      path.resolve(fileURLToPath(target)) ===
        path.resolve(__dirname, "..", "dist", "index.html")
    );
  } catch {
    return false;
  }
}

function secureRendererNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === "https:" || protocol === "http:") {
        void shell.openExternal(url);
      }
    } catch {
      // Invalid and non-web URLs remain denied.
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererNavigation(url)) event.preventDefault();
  });
}

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

function resolveProjectFile(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedFile = path.resolve(resolvedRoot, relativePath);
  if (
    resolvedFile !== resolvedRoot &&
    !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("The requested file is outside the opened project.");
  }
  return resolvedFile;
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

function resolveMutableProjectEntry(rootPath, relativePath) {
  if (!path.isAbsolute(rootPath)) {
    throw new Error("Open a local project folder before changing files.");
  }
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0
  ) {
    throw new Error("A project file or folder is required.");
  }
  const resolvedRoot = path.resolve(rootPath);
  const resolvedEntry = resolveProjectFile(resolvedRoot, relativePath);
  if (resolvedEntry === resolvedRoot) {
    throw new Error("The project root cannot be renamed or deleted.");
  }
  return { resolvedRoot, resolvedEntry };
}

function validateEntryName(name) {
  const nextName = typeof name === "string" ? name.trim() : "";
  if (
    !nextName ||
    nextName === "." ||
    nextName === ".." ||
    path.basename(nextName) !== nextName
  ) {
    throw new Error("Enter a name without folder separators.");
  }
  return nextName;
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function uniqueCopyDestination(
  destinationDirectory,
  sourceName,
  entryKind,
) {
  const extension = entryKind === "file" ? path.extname(sourceName) : "";
  const baseName = extension
    ? sourceName.slice(0, -extension.length)
    : sourceName;
  let index = 1;
  let candidate = path.join(destinationDirectory, sourceName);
  while (await pathExists(candidate)) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    candidate = path.join(
      destinationDirectory,
      `${baseName}${suffix}${extension}`,
    );
    index += 1;
  }
  return candidate;
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function detectProjectTasks(rootPath) {
  const tasks = [];
  const packageJson = await readJsonIfPresent(
    path.join(rootPath, "package.json"),
  );
  if (packageJson?.scripts && typeof packageJson.scripts === "object") {
    Object.keys(packageJson.scripts)
      .sort()
      .forEach((scriptName) => {
        const normalizedName = scriptName.toLowerCase();
        const group =
          normalizedName === "build" || normalizedName.startsWith("build:")
            ? "build"
            : normalizedName === "test" ||
                normalizedName.startsWith("test:")
              ? "test"
              : ["start", "dev", "serve"].includes(normalizedName)
                ? "run"
                : "other";
        tasks.push({
          id: `npm:${scriptName}`,
          label: `npm: ${scriptName}`,
          group,
          executable: "npm",
          args: ["run", scriptName],
        });
      });
  }

  if (await pathExists(path.join(rootPath, "pubspec.yaml"))) {
    const buildTarget =
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : "linux";
    tasks.push(
      {
        id: "flutter:pub-get",
        label: "Flutter: Pub Get",
        group: "other",
        executable: "flutter",
        args: ["pub", "get"],
      },
      {
        id: "flutter:analyze",
        label: "Flutter: Analyze",
        group: "other",
        executable: "flutter",
        args: ["analyze"],
      },
      {
        id: "flutter:test",
        label: "Flutter: Test",
        group: "test",
        executable: "flutter",
        args: ["test"],
      },
      {
        id: "flutter:run",
        label: "Flutter: Run",
        group: "run",
        executable: "flutter",
        args: ["run"],
      },
      {
        id: `flutter:build-${buildTarget}`,
        label: `Flutter: Build ${buildTarget}`,
        group: "build",
        executable: "flutter",
        args: ["build", buildTarget],
      },
    );
  }

  if (await pathExists(path.join(rootPath, "pom.xml"))) {
    tasks.push(
      {
        id: "maven:package",
        label: "Maven: Package",
        group: "build",
        executable: "mvn",
        args: ["package"],
      },
      {
        id: "maven:test",
        label: "Maven: Test",
        group: "test",
        executable: "mvn",
        args: ["test"],
      },
      {
        id: "maven:clean",
        label: "Maven: Clean",
        group: "other",
        executable: "mvn",
        args: ["clean"],
      },
    );
  }

  const gradleWrapper =
    process.platform === "win32" ? "gradlew.bat" : "gradlew";
  const gradlePath = path.join(rootPath, gradleWrapper);
  if (
    (await pathExists(gradlePath)) ||
    (await pathExists(path.join(rootPath, "build.gradle")))
  ) {
    const executable = (await pathExists(gradlePath))
      ? gradlePath
      : "gradle";
    tasks.push(
      {
        id: "gradle:build",
        label: "Gradle: Build",
        group: "build",
        executable,
        args: ["build"],
      },
      {
        id: "gradle:test",
        label: "Gradle: Test",
        group: "test",
        executable,
        args: ["test"],
      },
    );
  }

  if (await pathExists(path.join(rootPath, "Makefile"))) {
    tasks.push({
      id: "make:default",
      label: "Make: Default",
      group: "build",
      executable: "make",
      args: [],
    });
  }

  return tasks;
}

function quotePosixArgument(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function terminalCommand(executable, args) {
  if (process.platform === "win32") {
    return [executable, ...args]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(" ");
  }
  return [executable, ...args].map(quotePosixArgument).join(" ");
}

async function openTerminalWindow(directory, command) {
  if (!command) {
    if (process.platform === "darwin") {
      await execFileAsync("open", ["-a", "Terminal", directory]);
    } else if (process.platform === "win32") {
      await execFileAsync("cmd.exe", [
        "/c",
        "start",
        "",
        "cmd.exe",
        "/K",
        "cd",
        "/d",
        directory,
      ]);
    } else {
      const terminal = spawn(
        "x-terminal-emulator",
        ["--working-directory", directory],
        { detached: true, stdio: "ignore" },
      );
      terminal.unref();
    }
    return;
  }

  if (process.platform === "darwin") {
    const shellCommand = `cd ${quotePosixArgument(directory)} && ${command}`;
    const appleScriptCommand = shellCommand
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"');
    await execFileAsync("osascript", [
      "-e",
      `tell application "Terminal" to do script "${appleScriptCommand}"`,
    ]);
  } else if (process.platform === "win32") {
    await execFileAsync("cmd.exe", [
      "/c",
      "start",
      "",
      "cmd.exe",
      "/K",
      `cd /d "${directory}" && ${command}`,
    ]);
  } else {
    const shellCommand = `cd ${quotePosixArgument(directory)} && ${command}`;
    const terminal = spawn(
      "x-terminal-emulator",
      ["-e", "bash", "-lc", shellCommand],
      { detached: true, stdio: "ignore" },
    );
    terminal.unref();
  }
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
  return window.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
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
  const window = new BrowserWindow({
    width: 1510,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#101114",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 18, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  secureRendererNavigation(window);
  attachRendererRecovery(window);
  const terminalOwner = window.webContents;
  terminalOwner.once("destroyed", () => {
    terminalService.closeOwnerSessions(terminalOwner);
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
    await loadRenderer(miniWindow, false, rendererQuery);
    miniWindow.show();
    miniWindow.focus();
    return miniWindow;
  }

  const state = await loadMiniWindowState();
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
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 14, y: 13 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  secureRendererNavigation(miniWindow);
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

ipcMain.handle("workspace:get-trust", async (_event, args) => {
  try {
    const status = await getWorkspaceTrustStore().get(args?.rootPath);
    return {
      success: true,
      output: status.trusted
        ? "This workspace is trusted."
        : "This workspace is open in Restricted Mode.",
      ...status,
    };
  } catch (error) {
    return {
      ...toolError(error, "Workspace trust could not be checked."),
      trusted: false,
    };
  }
});

ipcMain.handle("workspace:set-trust", async (event, args) => {
  try {
    const status = await getWorkspaceTrustStore().set(
      args?.rootPath,
      Boolean(args?.trusted),
    );
    if (!status.trusted) {
      terminalService.closeOwnerSessions(event.sender);
    }
    return {
      success: true,
      output: status.trusted
        ? "Workspace trusted. Project tools are enabled."
        : "Workspace trust revoked. Project tools are now restricted.",
      ...status,
    };
  } catch (error) {
    return {
      ...toolError(error, "Workspace trust could not be changed."),
      trusted: false,
    };
  }
});

function projectProgressReporter(event) {
  return (progress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send("project:load-progress", progress);
    }
  };
}

ipcMain.handle("project:choose", async (event) => {
  const result = await dialog.showOpenDialog({
    title: "Open a project in Divex",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const rootPath = result.filePaths[0];
  const project = await loadProject(
    rootPath,
    projectProgressReporter(event),
  );
  const { files } = project;
  if (files.length === 0) {
    throw new Error("No supported source files were found in that folder.");
  }

  return project;
});

ipcMain.handle("project:refresh", async (event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a local project folder before refreshing.");
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
      throw new Error("Open a local project folder before watching it.");
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
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "warning",
      title: "Delete project item",
      message: `Move “${path.basename(resolvedEntry)}” to the Trash?`,
      detail:
        args.entryKind === "folder"
          ? "The folder and everything inside it will be moved to the Trash."
          : "The file will be moved to the Trash.",
      buttons: ["Cancel", "Move to Trash"],
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
    await shell.trashItem(resolvedEntry);
    return {
      success: true,
      output: `Moved ${path.basename(resolvedEntry)} to the Trash.`,
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
    clipboard.writeText(args.relative ? args.entryPath : resolvedEntry);
    return {
      success: true,
      output: args.relative ? "Relative path copied." : "Path copied.",
    };
  } catch (error) {
    return toolError(error, "The path could not be copied.");
  }
});

ipcMain.handle("project:open-entry", async (_event, args) => {
  try {
    await requireTrustedWorkspace(args?.rootPath);
    const { resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
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
      throw new Error("Open a local project folder before launching a terminal.");
    }
    const resolvedRoot = await requireTrustedWorkspace(args.rootPath);
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
    await openTerminalWindow(directory);
    return { success: true, output: "Terminal opened." };
  } catch (error) {
    return toolError(error, "A terminal could not be opened here.");
  }
});

ipcMain.handle("project:list-tasks", async (_event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a local project folder to discover tasks.");
    }
    const tasks = await detectProjectTasks(path.resolve(args.rootPath));
    return {
      success: true,
      output: `${tasks.length} tasks found.`,
      tasks: tasks.map(({ id, label, group }) => ({ id, label, group })),
    };
  } catch (error) {
    return toolError(error, "Project tasks could not be discovered.");
  }
});

ipcMain.handle("project:run-task", async (_event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a local project folder before running a task.");
    }
    const resolvedRoot = await requireTrustedWorkspace(args.rootPath);
    const tasks = await detectProjectTasks(resolvedRoot);
    const task = tasks.find((candidate) => candidate.id === args.taskId);
    if (!task) throw new Error("That task is no longer available.");
    await openTerminalWindow(
      resolvedRoot,
      terminalCommand(task.executable, task.args),
    );
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
    await requireTrustedWorkspace(args?.rootPath);
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.entryPath,
    );
    const extension = path.extname(resolvedEntry).toLowerCase();
    const runner =
      extension === ".dart"
        ? { executable: "dart", args: ["run", resolvedEntry] }
        : extension === ".py"
          ? { executable: "python3", args: [resolvedEntry] }
          : null;
    if (!runner) {
      throw new Error("Run Active File currently supports Dart and Python.");
    }
    await openTerminalWindow(
      resolvedRoot,
      terminalCommand(runner.executable, runner.args),
    );
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
    const resolvedRoot = await requireTrustedWorkspace(args?.rootPath);
    return terminalService.create(
      {
        rootPath: resolvedRoot,
        cwd: args?.cwd,
        cols: args?.cols,
        rows: args?.rows,
        title: args?.title || "Terminal",
        kind: "shell",
      },
      event.sender,
    );
  } catch (error) {
    return toolError(error, "The terminal could not be started.");
  }
});

ipcMain.handle("terminal:run-task", async (event, args) => {
  try {
    if (!path.isAbsolute(args?.rootPath)) {
      throw new Error("Open a local project folder before running a task.");
    }
    const resolvedRoot = await requireTrustedWorkspace(args.rootPath);
    const tasks = await detectProjectTasks(resolvedRoot);
    const task = tasks.find((candidate) => candidate.id === args.taskId);
    if (!task) throw new Error("That task is no longer available.");
    return terminalService.create(
      {
        rootPath: resolvedRoot,
        executable: task.executable,
        args: task.args,
        cols: args?.cols,
        rows: args?.rows,
        title: task.label,
        kind: "task",
        taskId: task.id,
      },
      event.sender,
    );
  } catch (error) {
    return toolError(error, "The task could not be started.");
  }
});

ipcMain.handle("terminal:run-file", async (event, args) => {
  try {
    await requireTrustedWorkspace(args?.rootPath);
    const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
      args?.rootPath,
      args?.entryPath,
    );
    const extension = path.extname(resolvedEntry).toLowerCase();
    const runner =
      extension === ".dart"
        ? { executable: "dart", args: ["run", resolvedEntry] }
        : extension === ".py"
          ? { executable: "python3", args: [resolvedEntry] }
          : null;
    if (!runner) {
      throw new Error("Run Active File currently supports Dart and Python.");
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
    const { resolvedRoot, resolvedEntry: sourceEntry } =
      resolveMutableProjectEntry(args.rootPath, args.sourcePath);
    const { resolvedEntry: targetEntry } = resolveMutableProjectEntry(
      args.rootPath,
      args.targetPath,
    );
    const destinationDirectory =
      args.targetKind === "folder"
        ? targetEntry
        : path.dirname(targetEntry);

    if (
      args.sourceKind === "folder" &&
      (destinationDirectory === sourceEntry ||
        destinationDirectory.startsWith(`${sourceEntry}${path.sep}`))
    ) {
      throw new Error("A folder cannot be pasted inside itself.");
    }

    let destinationEntry = path.join(
      destinationDirectory,
      path.basename(sourceEntry),
    );
    resolveProjectFile(
      resolvedRoot,
      path.relative(resolvedRoot, destinationEntry),
    );

    if (args.mode === "copy") {
      destinationEntry = await uniqueCopyDestination(
        destinationDirectory,
        path.basename(sourceEntry),
        args.sourceKind,
      );
      await fs.cp(sourceEntry, destinationEntry, {
        recursive: args.sourceKind === "folder",
        errorOnExist: true,
      });
    } else {
      if (destinationEntry === sourceEntry) {
        throw new Error("The item is already in this folder.");
      }
      if (await pathExists(destinationEntry)) {
        throw new Error(
          `“${path.basename(destinationEntry)}” already exists here.`,
        );
      }
      await fs.rename(sourceEntry, destinationEntry);
    }

    return {
      success: true,
      output:
        args.mode === "copy"
          ? `Copied ${path.basename(destinationEntry)}.`
          : `Moved ${path.basename(destinationEntry)}.`,
      project: await loadProject(
        resolvedRoot,
        projectProgressReporter(event),
      ),
      entryPath: path
        .relative(resolvedRoot, destinationEntry)
        .split(path.sep)
        .join("/"),
    };
  } catch (error) {
    return toolError(error, "The item could not be pasted.");
  }
});

ipcMain.handle("project:save-file", async (_event, args) => {
  try {
    const filePath = resolveProjectFile(args.rootPath, args.filePath);
    await fs.writeFile(filePath, args.content, "utf8");
    return { success: true, output: "Saved successfully." };
  } catch (error) {
    return toolError(error, "The file could not be saved.");
  }
});

ipcMain.handle("project:format-dart", async (_event, args) => {
  try {
    await requireTrustedWorkspace(args?.rootPath);
    const filePath = resolveProjectFile(args.rootPath, args.filePath);
    if (path.extname(filePath).toLowerCase() !== ".dart") {
      return { success: false, output: "Dart formatting requires a .dart file." };
    }
    await fs.writeFile(filePath, args.content, "utf8");
    const result = await execFileAsync("dart", ["format", filePath], {
      cwd: path.resolve(args.rootPath),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30000,
    });
    const content = await fs.readFile(filePath, "utf8");
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
  }
});

ipcMain.handle("project:analyze-flutter", async (_event, args) => {
  try {
    const resolvedRoot = await requireTrustedWorkspace(args?.rootPath);
    const result = await execFileAsync(
      "flutter",
      ["analyze", "--no-pub"],
      {
        cwd: resolvedRoot,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120000,
      },
    );
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

ipcMain.handle("git:status", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return getGitStatus(rootPath);
  } catch (error) {
    return toolError(error, "Git status could not be loaded.");
  }
});

ipcMain.handle("git:diff", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return getGitDiff(rootPath, args?.filePath, Boolean(args?.staged));
  } catch (error) {
    return toolError(error, "The Git diff could not be loaded.");
  }
});

ipcMain.handle("git:stage", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return mutateGitPath(rootPath, args?.filePath, "stage");
  } catch (error) {
    return toolError(error, "The file could not be staged.");
  }
});

ipcMain.handle("git:unstage", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return mutateGitPath(rootPath, args?.filePath, "unstage");
  } catch (error) {
    return toolError(error, "The file could not be unstaged.");
  }
});

ipcMain.handle("git:stage-all", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return mutateAllGit(rootPath, "stage");
  } catch (error) {
    return toolError(error, "Changes could not be staged.");
  }
});

ipcMain.handle("git:unstage-all", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return mutateAllGit(rootPath, "unstage");
  } catch (error) {
    return toolError(error, "Changes could not be unstaged.");
  }
});

ipcMain.handle("git:commit", async (_event, args) => {
  try {
    const rootPath = await requireTrustedWorkspace(args?.rootPath);
    return commitGit(rootPath, args?.message);
  } catch (error) {
    return toolError(error, "The commit could not be created.");
  }
});

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
