const { watch } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  isIgnoredDirectory,
  isSupportedProjectFile,
} = require("./file-policy.cjs");
const { parseWslUncPath } = require("./paths.cjs");

const DEFAULT_DEBOUNCE_MS = 240;
const DEFAULT_WSL_POLL_INTERVAL_MS = 900;
const MAX_WATCHED_FILES = 2_000;
const MAX_WATCHED_FOLDERS = 2_000;

function normalizeRelativePath(filename) {
  if (typeof filename !== "string" && !Buffer.isBuffer(filename)) return "";
  return String(filename).split(path.sep).join("/");
}

function shouldRefreshProject(relativePath) {
  if (!relativePath) return true;
  const segments = relativePath.split("/");
  if (segments.some((segment) => isIgnoredDirectory(segment))) return false;
  return (
    isSupportedProjectFile(relativePath) ||
    path.extname(relativePath) === ""
  );
}

async function projectSnapshot(rootPath) {
  const snapshot = new Map();
  const directories = [rootPath];
  let cursor = 0;
  let watchedFiles = 0;
  let watchedFolders = 0;
  while (
    cursor < directories.length &&
    watchedFiles < MAX_WATCHED_FILES &&
    watchedFolders < MAX_WATCHED_FOLDERS
  ) {
    const directory = directories[cursor++];
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          !isIgnoredDirectory(entry.name) &&
          watchedFolders < MAX_WATCHED_FOLDERS
        ) {
          directories.push(absolutePath);
          try {
            const stats = await fs.stat(absolutePath);
            const relativePath = normalizeRelativePath(
              path.relative(rootPath, absolutePath),
            );
            snapshot.set(`${relativePath}/`, `folder:${stats.mtimeMs}`);
            watchedFolders += 1;
          } catch {
            // A removed folder is reported by comparing the next snapshot.
          }
        }
        continue;
      }
      if (!entry.isFile() || !isSupportedProjectFile(entry.name)) continue;
      if (watchedFiles >= MAX_WATCHED_FILES) continue;
      try {
        const stats = await fs.stat(absolutePath);
        const relativePath = normalizeRelativePath(
          path.relative(rootPath, absolutePath),
        );
        snapshot.set(relativePath, `${stats.size}:${stats.mtimeMs}`);
        watchedFiles += 1;
      } catch {
        // A file can disappear between readdir and stat; the next poll handles it.
      }
    }
  }
  return snapshot;
}

function changedSnapshotPaths(previous, next) {
  const changed = new Set();
  for (const [filePath, signature] of next) {
    if (previous.get(filePath) !== signature) changed.add(filePath);
  }
  for (const filePath of previous.keys()) {
    if (!next.has(filePath)) changed.add(filePath);
  }
  return [...changed];
}

function createProjectWatcherService({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  wslPollIntervalMs = DEFAULT_WSL_POLL_INTERVAL_MS,
  createWatcher = watch,
} = {}) {
  const sessions = new Map();

  function stop(owner) {
    const session = sessions.get(owner);
    if (!session) return;
    clearTimeout(session.timer);
    clearInterval(session.pollTimer);
    session.watcher?.close();
    owner.removeListener("destroyed", session.onDestroyed);
    sessions.delete(owner);
  }

  function reportError(owner, rootPath, error) {
    if (owner.isDestroyed()) return;
    owner.send("project:watch-error", {
      rootPath,
      message: error?.message || "Project watching stopped.",
    });
    stop(owner);
  }

  function start(owner, rootPath) {
    stop(owner);
    const resolvedRoot = path.resolve(rootPath);
    const changedPaths = new Set();
    const onDestroyed = () => stop(owner);
    const session = {
      rootPath: resolvedRoot,
      watcher: null,
      pollTimer: null,
      timer: null,
      snapshot: null,
      polling: false,
      onDestroyed,
    };
    sessions.set(owner, session);
    owner.once("destroyed", onDestroyed);

    const emitChanges = () => {
      const current = sessions.get(owner);
      if (!current || owner.isDestroyed()) return;
      current.timer = null;
      const paths = [...changedPaths].sort();
      changedPaths.clear();
      if (paths.length === 0) return;
      owner.send("project:changed", {
        rootPath: resolvedRoot,
        paths,
        changedAt: new Date().toISOString(),
      });
    };
    const queueChanges = (paths) => {
      if (sessions.get(owner) !== session || paths.length === 0) return;
      paths.forEach((filePath) => {
        if (filePath) changedPaths.add(filePath);
      });
      clearTimeout(session.timer);
      session.timer = setTimeout(emitChanges, debounceMs);
    };

    if (parseWslUncPath(resolvedRoot)) {
      const poll = async () => {
        if (session.polling || sessions.get(owner) !== session) return;
        session.polling = true;
        try {
          const next = await projectSnapshot(resolvedRoot);
          if (session.snapshot) {
            queueChanges(changedSnapshotPaths(session.snapshot, next));
          }
          session.snapshot = next;
        } catch (error) {
          reportError(owner, resolvedRoot, error);
        } finally {
          session.polling = false;
        }
      };
      void poll().then(() => {
        if (sessions.get(owner) === session) {
          session.pollTimer = setInterval(() => void poll(), wslPollIntervalMs);
        }
      });
      return resolvedRoot;
    }

    try {
      session.watcher = createWatcher(
        resolvedRoot,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          const relativePath = normalizeRelativePath(filename);
          if (!shouldRefreshProject(relativePath)) return;
          queueChanges(relativePath ? [relativePath] : []);
        },
      );
      session.watcher.on("error", (error) =>
        reportError(owner, resolvedRoot, error),
      );
    } catch (error) {
      reportError(owner, resolvedRoot, error);
    }
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
  changedSnapshotPaths,
  createProjectWatcherService,
  projectSnapshot,
  shouldRefreshProject,
};
