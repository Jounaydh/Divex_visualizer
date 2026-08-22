// Shared by project loading and live watching so file coverage cannot drift.
const path = require("node:path");

const supportedExtensions = new Set([
  ".cjs",
  ".cfg",
  ".css",
  ".dart",
  ".gradle",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".properties",
  ".py",
  ".pyw",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);

const ignoredDirectories = new Set([
  ".dart_tool",
  ".git",
  ".gradle",
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

function isIgnoredDirectory(name) {
  return ignoredDirectories.has(String(name).toLowerCase());
}

function isSupportedProjectFile(filePath) {
  return supportedExtensions.has(path.extname(filePath).toLowerCase());
}

module.exports = {
  ignoredDirectories,
  isIgnoredDirectory,
  isSupportedProjectFile,
  supportedExtensions,
};
