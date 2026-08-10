const { watch } = require("node:fs");
const path = require("node:path");

const DEFAULT_DEBOUNCE_MS = 240;
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

function normalizeRelativePath(filename) {
  if (typeof filename !== "string" && !Buffer.isBuffer(filename)) return "";
  return String(filename).split(path.sep).join("/");
}

function shouldRefreshProject(relativePath) {
  if (!relativePath) return true;
  const segments = relativePath.split("/");
  if (segments.some((segment) => ignoredDirectories.has(segment))) {
    return false;
  }
  return supportedExtensions.has(path.extname(relativePath).toLowerCase());
}

function createProjectWatcherService({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  createWatcher = watch,
} = {}) {
  const sessions = new Map();

  function stop(owner) {
    const session = sessions.get(owner);
    if (!session) return;
    clearTimeout(session.timer);
    session.watcher.close();
    owner.removeListener("destroyed", session.onDestroyed);
    sessions.delete(owner);
  }

  function start(owner, rootPath) {
    stop(owner);
    const resolvedRoot = path.resolve(rootPath);
    const changedPaths = new Set();
    const emitChanges = () => {
      const session = sessions.get(owner);
      if (!session || owner.isDestroyed()) return;
      session.timer = null;
      const paths = [...changedPaths].sort();
      changedPaths.clear();
      owner.send("project:changed", {
        rootPath: resolvedRoot,
        paths,
        changedAt: new Date().toISOString(),
      });
    };
    const watcher = createWatcher(
      resolvedRoot,
      { recursive: true, persistent: false },
      (_eventType, filename) => {
        const relativePath = normalizeRelativePath(filename);
        if (!shouldRefreshProject(relativePath)) return;
        if (relativePath) changedPaths.add(relativePath);
        const session = sessions.get(owner);
        if (!session) return;
        clearTimeout(session.timer);
        session.timer = setTimeout(emitChanges, debounceMs);
      },
    );
    watcher.on("error", (error) => {
      if (owner.isDestroyed()) return;
      owner.send("project:watch-error", {
        rootPath: resolvedRoot,
        message: error?.message || "Project watching stopped.",
      });
      stop(owner);
    });
    const onDestroyed = () => stop(owner);
    sessions.set(owner, {
      rootPath: resolvedRoot,
      watcher,
      timer: null,
      onDestroyed,
    });
    owner.once("destroyed", onDestroyed);
    return resolvedRoot;
  }

  function stopAll() {
    [...sessions.keys()].forEach(stop);
  }

  return {
    start,
    stop,
    stopAll,
    watchedRoot(owner) {
      return sessions.get(owner)?.rootPath ?? null;
    },
  };
}

module.exports = {
  createProjectWatcherService,
  shouldRefreshProject,
};
