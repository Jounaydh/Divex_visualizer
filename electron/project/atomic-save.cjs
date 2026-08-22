const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  isContainedPath,
  resolveProjectFile,
  validateProjectRoot,
} = require("./paths.cjs");

async function atomicSaveProjectFile(rootPath, relativePath, content) {
  const resolvedRoot = validateProjectRoot(rootPath);
  const requestedFile = resolveProjectFile(resolvedRoot, relativePath);
  if (typeof content !== "string") throw new Error("File content must be text.");

  const [realRoot, realParent, fileStats] = await Promise.all([
    fs.realpath(resolvedRoot),
    fs.realpath(path.dirname(requestedFile)),
    fs.lstat(requestedFile),
  ]);
  if (!isContainedPath(realRoot, realParent)) {
    throw new Error("The save destination is outside the opened project.");
  }
  if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
    throw new Error("Only regular project files can be saved.");
  }

  const filePath = path.join(realParent, path.basename(requestedFile));
  const temporaryPath = path.join(
    realParent,
    `.${path.basename(filePath)}.divex-save-${process.pid}-${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx", fileStats.mode);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, filePath);
    return filePath;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

module.exports = { atomicSaveProjectFile };
