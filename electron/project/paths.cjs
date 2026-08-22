// Keep path validation and WSL path translation at one trusted boundary.
const path = require("node:path");

const WSL_UNC_PATTERN = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)(?:\\(.*))?$/i;

function isContainedPath(rootPath, candidatePath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedCandidate = path.resolve(candidatePath);
  const left = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;
  const right = process.platform === "win32" ? normalizedCandidate.toLowerCase() : normalizedCandidate;
  return left === right || right.startsWith(`${left}${path.sep}`);
}

function validateProjectRoot(rootPath, message = "Open a project folder first.") {
  if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) {
    throw new Error(message);
  }
  return path.resolve(rootPath);
}

function resolveProjectFile(rootPath, relativePath) {
  const resolvedRoot = validateProjectRoot(rootPath);
  const resolvedFile = path.resolve(resolvedRoot, relativePath);
  if (!isContainedPath(resolvedRoot, resolvedFile)) {
    throw new Error("The requested file is outside the opened project.");
  }
  return resolvedFile;
}

function resolveMutableProjectEntry(rootPath, relativePath) {
  const resolvedRoot = validateProjectRoot(
    rootPath,
    "Open a project folder before changing files.",
  );
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("A project file or folder is required.");
  }
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
  if (
    /[<>:"|?*\u0000-\u001f]/.test(nextName) ||
    /[. ]$/.test(nextName) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(nextName)
  ) {
    throw new Error("Enter a name that is valid on Windows.");
  }
  return nextName;
}

function parseWslUncPath(inputPath) {
  if (typeof inputPath !== "string") return null;
  const match = inputPath.replaceAll("/", "\\").match(WSL_UNC_PATTERN);
  if (!match) return null;
  const distribution = match[1];
  const remainder = (match[2] ?? "").replaceAll("\\", "/");
  return {
    distribution,
    linuxPath: remainder ? `/${remainder}` : "/",
  };
}

function toWslUncPath(distribution, linuxPath) {
  if (typeof distribution !== "string" || !distribution.trim()) {
    throw new Error("A WSL distribution is required.");
  }
  if (typeof linuxPath !== "string" || !linuxPath.startsWith("/")) {
    throw new Error("An absolute Linux path is required.");
  }
  const remainder = linuxPath.replace(/^\/+/, "").replaceAll("/", "\\");
  return `\\\\wsl.localhost\\${distribution}${remainder ? `\\${remainder}` : ""}`;
}

function projectEnvironment(rootPath) {
  const wsl = parseWslUncPath(rootPath);
  if (wsl) return { kind: "wsl", ...wsl };
  return { kind: "native", platform: process.platform };
}

module.exports = {
  isContainedPath,
  parseWslUncPath,
  projectEnvironment,
  resolveMutableProjectEntry,
  resolveProjectFile,
  toWslUncPath,
  validateEntryName,
  validateProjectRoot,
};
