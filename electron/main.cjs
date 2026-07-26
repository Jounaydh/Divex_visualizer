const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { runTool } = require("./tool-runner.cjs");

const APP_ID = "com.divex.visualizer";
const isDevelopment = !app.isPackaged && process.argv.includes("--dev");
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
  const pathFromRoot = path.relative(resolvedRoot, resolvedFile);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(pathFromRoot)
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
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "EACCES" || error?.code === "EPERM") return;
      throw error;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name.toLowerCase())) {
          await visit(absolutePath);
        }
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!supportedExtensions.has(extension)) continue;
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.size > MAX_FILE_SIZE) continue;
        const content = await fs.readFile(absolutePath, "utf8");
        files.push({
          path: path.relative(rootPath, absolutePath).split(path.sep).join("/"),
          content,
        });
      } catch (error) {
        if (error?.code !== "EACCES" && error?.code !== "EPERM") throw error;
      }
    }
  }

  await visit(rootPath);
  return files;
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
  const files = await readProjectFiles(rootPath);
  if (files.length === 0) {
    throw new Error("No supported source files were found in that folder.");
  }

  return {
    name: path.basename(rootPath),
    rootPath,
    files,
  };
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
  let temporaryDirectory;
  try {
    const filePath = resolveProjectFile(args.rootPath, args.filePath);
    if (path.extname(filePath).toLowerCase() !== ".dart") {
      return { success: false, output: "Dart formatting requires a .dart file." };
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
    await fs.writeFile(filePath, content, "utf8");
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

ipcMain.handle("project:analyze-flutter", async (_event, args) => {
  try {
    const result = await runTool(
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
