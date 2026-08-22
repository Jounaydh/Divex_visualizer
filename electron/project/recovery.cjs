const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { resolveProjectFile, validateProjectRoot } = require("./paths.cjs");

const MAX_RECOVERY_CONTENT_BYTES = 4 * 1024 * 1024;
const recoveryOperations = new Map();

function enqueueRecoveryOperation(key, operation) {
  const previous = recoveryOperations.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  recoveryOperations.set(key, next);
  return next.finally(() => {
    if (recoveryOperations.get(key) === next) recoveryOperations.delete(key);
  });
}

function recoveryId(rootPath, filePath) {
  return createHash("sha256")
    .update(`${rootPath}\0${filePath}`)
    .digest("hex");
}

function projectRecoveryDirectory(baseDirectory, rootPath) {
  const projectId = createHash("sha256").update(rootPath).digest("hex");
  return path.join(baseDirectory, projectId);
}

function validateRecoveryInput(rootPath, filePath, content) {
  const resolvedRoot = validateProjectRoot(rootPath);
  if (typeof filePath !== "string" || !filePath) {
    throw new Error("Choose a project file to recover.");
  }
  resolveProjectFile(resolvedRoot, filePath);
  if (typeof content !== "string") {
    throw new Error("Recovery content must be text.");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_RECOVERY_CONTENT_BYTES) {
    throw new Error("Recovery content is larger than 4 MB.");
  }
  return resolvedRoot;
}

async function writeRecovery(baseDirectory, args) {
  const rootPath = validateRecoveryInput(
    args?.rootPath,
    args?.filePath,
    args?.content,
  );
  const directory = projectRecoveryDirectory(baseDirectory, rootPath);
  const destination = path.join(directory, `${recoveryId(rootPath, args.filePath)}.json`);
  const entry = {
    version: 1,
    rootPath,
    filePath: args.filePath.split(path.sep).join("/"),
    content: args.content,
    updatedAt: new Date().toISOString(),
  };
  return enqueueRecoveryOperation(destination, async () => {
    const temporary = `${destination}.${process.pid}-${randomUUID()}.tmp`;
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(temporary, JSON.stringify(entry), {
        encoding: "utf8",
        flag: "wx",
      });
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return entry;
  });
}

async function listRecoveries(baseDirectory, inputRootPath) {
  const rootPath = validateProjectRoot(inputRootPath);
  const directory = projectRecoveryDirectory(baseDirectory, rootPath);
  let names;
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const entry = JSON.parse(
            await fs.readFile(path.join(directory, name), "utf8"),
          );
          if (
            entry?.version !== 1 ||
            entry.rootPath !== rootPath ||
            typeof entry.filePath !== "string" ||
            typeof entry.content !== "string" ||
            typeof entry.updatedAt !== "string"
          ) {
            return null;
          }
          resolveProjectFile(rootPath, entry.filePath);
          return entry;
        } catch {
          return null;
        }
      }),
  );
  return entries
    .filter(Boolean)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function clearRecovery(baseDirectory, inputRootPath, filePath) {
  const rootPath = validateProjectRoot(inputRootPath);
  resolveProjectFile(rootPath, filePath);
  const destination = path.join(
    projectRecoveryDirectory(baseDirectory, rootPath),
    `${recoveryId(rootPath, filePath)}.json`,
  );
  await enqueueRecoveryOperation(destination, () =>
    fs.rm(destination, { force: true }),
  );
}

module.exports = {
  clearRecovery,
  listRecoveries,
  recoveryId,
  writeRecovery,
};
