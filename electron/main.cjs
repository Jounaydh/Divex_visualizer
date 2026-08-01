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
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const isDevelopment = !app.isPackaged;
const supportedExtensions = new Set([
  ".dart",
  ".java",
  ".py",
  ".yaml",
  ".yml",
  ".json",
  ".gradle",
  ".properties",
]);
const ignoredDirectories = new Set([
  ".git",
  ".dart_tool",
  ".idea",
  ".vscode",
  "build",
  "dist",
  "node_modules",
]);
const MAX_FILES = 2000;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

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

async function readProjectFiles(rootPath) {
  const files = [];

  async function visit(directory) {
    if (files.length >= MAX_FILES) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(absolutePath);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!supportedExtensions.has(extension)) continue;
      const stats = await fs.stat(absolutePath);
      if (stats.size > MAX_FILE_SIZE) continue;
      const content = await fs.readFile(absolutePath, "utf8");
      files.push({
        path: path.relative(rootPath, absolutePath).split(path.sep).join("/"),
        content,
      });
    }
  }

  await visit(rootPath);
  return files;
}

async function loadProject(rootPath) {
  const files = await readProjectFiles(rootPath);
  return {
    name: path.basename(rootPath),
    rootPath,
    files,
  };
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

  if (isDevelopment) {
    window.loadURL("http://localhost:5173");
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("project:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open a project in Divex",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const rootPath = result.filePaths[0];
  const project = await loadProject(rootPath);
  const { files } = project;
  if (files.length === 0) {
    throw new Error("No supported source files were found in that folder.");
  }

  return project;
});

ipcMain.handle("project:refresh", async (_event, args) => {
  try {
    if (!path.isAbsolute(args.rootPath)) {
      throw new Error("Open a local project folder before refreshing.");
    }
    return {
      success: true,
      output: "Project refreshed.",
      project: await loadProject(path.resolve(args.rootPath)),
    };
  } catch (error) {
    return toolError(error, "The project could not be refreshed.");
  }
});

ipcMain.handle("project:rename-entry", async (_event, args) => {
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
      project: await loadProject(resolvedRoot),
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
      project: await loadProject(resolvedRoot),
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
    const resolvedRoot = path.resolve(args.rootPath);
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
    const resolvedRoot = path.resolve(args.rootPath);
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

ipcMain.handle("project:paste-entry", async (_event, args) => {
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
      project: await loadProject(resolvedRoot),
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
    const result = await execFileAsync(
      "flutter",
      ["analyze", "--no-pub"],
      {
        cwd: path.resolve(args.rootPath),
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
