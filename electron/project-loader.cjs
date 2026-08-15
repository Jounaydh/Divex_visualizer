const fs = require("node:fs/promises");
const path = require("node:path");

const supportedExtensions = new Set([
  ".cjs",
  ".css",
  ".dart",
  ".htm",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".pyw",
  ".yaml",
  ".yml",
  ".json",
  ".gradle",
  ".properties",
]);
const ignoredDirectories = new Set([
  ".git",
  ".gradle",
  ".dart_tool",
  ".idea",
  ".next",
  ".pytest_cache",
  ".vscode",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "venv",
]);
const MAX_FILES = 2000;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const FILE_READ_CONCURRENCY = 16;
const MAX_CACHED_PROJECTS = 3;
const projectCaches = new Map();

function relativeProjectPath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).split(path.sep).join("/");
}

function reportProgress(onProgress, progress) {
  onProgress?.(progress);
}

async function mapWithConcurrency(items, concurrency, operation, onItem) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  async function work() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index], index);
      completed += 1;
      onItem?.(completed, items.length);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => work()));
  return results;
}

async function scanProjectMetadata(rootPath, onProgress) {
  const candidates = [];
  const directories = [rootPath];
  let cursor = 0;

  reportProgress(onProgress, {
    phase: "scanning",
    completed: 0,
    total: 0,
    message: "Scanning project folders…",
  });

  while (cursor < directories.length && candidates.length < MAX_FILES) {
    const directory = directories[cursor];
    cursor += 1;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        if (candidates.length >= MAX_FILES) return;
        if (entry.name.startsWith(".") && entry.name !== ".env") return;
        if (entry.isSymbolicLink()) return;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirectories.has(entry.name.toLowerCase())) {
            directories.push(absolutePath);
          }
          return;
        }
        if (!entry.isFile()) return;
        const extension = path.extname(entry.name).toLowerCase();
        if (!supportedExtensions.has(extension)) return;
        candidates.push({
          absolutePath,
          path: relativeProjectPath(rootPath, absolutePath),
        });
      });

    if (cursor % 20 === 0 || cursor === directories.length) {
      reportProgress(onProgress, {
        phase: "scanning",
        completed: cursor,
        total: directories.length,
        message: `Scanning folders… ${candidates.length} supported files found`,
      });
    }
  }

  const metadata = await mapWithConcurrency(
    candidates,
    FILE_READ_CONCURRENCY,
    async (candidate) => {
      try {
        const stats = await fs.stat(candidate.absolutePath);
        if (!stats.isFile() || stats.size > MAX_FILE_SIZE) return null;
        return {
          ...candidate,
          size: stats.size,
          mtimeMs: stats.mtimeMs,
        };
      } catch {
        return null;
      }
    },
    (completed, total) => {
      if (completed % 50 === 0 || completed === total) {
        reportProgress(onProgress, {
          phase: "scanning",
          completed,
          total,
          message: `Checking source files… ${completed} of ${total}`,
        });
      }
    },
  );

  return metadata.filter(Boolean);
}

function cachedProject(rootPath) {
  const cached = projectCaches.get(rootPath);
  if (cached) {
    projectCaches.delete(rootPath);
    projectCaches.set(rootPath, cached);
  }
  return cached ?? new Map();
}

function storeProjectCache(rootPath, cache) {
  projectCaches.delete(rootPath);
  projectCaches.set(rootPath, cache);
  while (projectCaches.size > MAX_CACHED_PROJECTS) {
    const oldestKey = projectCaches.keys().next().value;
    if (oldestKey === undefined) break;
    projectCaches.delete(oldestKey);
  }
}

async function readProjectFiles(rootPath, onProgress) {
  const metadata = await scanProjectMetadata(rootPath, onProgress);
  const previousCache = cachedProject(rootPath);
  const nextCache = new Map();
  let cachedFiles = 0;
  let readFiles = 0;

  reportProgress(onProgress, {
    phase: "reading",
    completed: 0,
    total: metadata.length,
    message: `Loading ${metadata.length} source files…`,
  });

  const files = await mapWithConcurrency(
    metadata,
    FILE_READ_CONCURRENCY,
    async (file) => {
      try {
        const cached = previousCache.get(file.path);
        let content;
        if (
          cached &&
          cached.size === file.size &&
          cached.mtimeMs === file.mtimeMs
        ) {
          content = cached.content;
          cachedFiles += 1;
        } else {
          content = await fs.readFile(file.absolutePath, "utf8");
          readFiles += 1;
        }
        nextCache.set(file.path, {
          size: file.size,
          mtimeMs: file.mtimeMs,
          content,
        });
        return { path: file.path, content };
      } catch {
        return null;
      }
    },
    (completed, total) => {
      if (completed % 25 === 0 || completed === total) {
        reportProgress(onProgress, {
          phase: "reading",
          completed,
          total,
          message: `Loading source files… ${completed} of ${total}`,
        });
      }
    },
  );

  storeProjectCache(rootPath, nextCache);
  return { files: files.filter(Boolean), cachedFiles, readFiles };
}

async function loadProject(rootPath, onProgress) {
  const resolvedRoot = path.resolve(rootPath);
  const startedAt = performance.now();
  const { files, cachedFiles, readFiles } = await readProjectFiles(
    resolvedRoot,
    onProgress,
  );
  return {
    name: path.basename(resolvedRoot),
    rootPath: resolvedRoot,
    files,
    loadSummary: {
      totalFiles: files.length,
      cachedFiles,
      readFiles,
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}

module.exports = {
  loadProject,
};
