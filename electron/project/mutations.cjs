const fs = require("node:fs/promises");
const path = require("node:path");
const {
  isContainedPath,
  resolveMutableProjectEntry,
  resolveProjectFile,
  validateEntryName,
  validateProjectRoot,
} = require("./paths.cjs");

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function relativeProjectPath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).split(path.sep).join("/");
}

async function resolveProjectDirectory(rootPath, relativePath = "") {
  const resolvedRoot = validateProjectRoot(rootPath);
  const directory = relativePath
    ? resolveProjectFile(resolvedRoot, relativePath)
    : resolvedRoot;
  const stats = await fs.stat(directory);
  if (!stats.isDirectory()) throw new Error("Choose a project folder.");
  return { resolvedRoot, directory };
}

function splitEntryName(sourceName, entryKind) {
  const extension = entryKind === "file" ? path.extname(sourceName) : "";
  return {
    extension,
    baseName: extension ? sourceName.slice(0, -extension.length) : sourceName,
  };
}

async function uniqueDestination(
  destinationDirectory,
  sourceName,
  entryKind,
  firstSuffix = " copy",
) {
  const { baseName, extension } = splitEntryName(sourceName, entryKind);
  let index = 1;
  let candidate = path.join(destinationDirectory, sourceName);
  while (await pathExists(candidate)) {
    const suffix = index === 1 ? firstSuffix : `${firstSuffix} ${index}`;
    candidate = path.join(
      destinationDirectory,
      `${baseName}${suffix}${extension}`,
    );
    index += 1;
  }
  return candidate;
}

async function uniqueNumberedDestination(
  destinationDirectory,
  sourceName,
  entryKind,
) {
  const { baseName, extension } = splitEntryName(sourceName, entryKind);
  let index = 2;
  let candidate = path.join(destinationDirectory, sourceName);
  while (await pathExists(candidate)) {
    candidate = path.join(
      destinationDirectory,
      `${baseName} ${index}${extension}`,
    );
    index += 1;
  }
  return candidate;
}

async function createProjectEntry({
  rootPath,
  parentPath = "",
  entryKind,
  name,
}) {
  if (entryKind !== "file" && entryKind !== "folder") {
    throw new Error("Choose whether to create a file or folder.");
  }
  const { resolvedRoot, directory } = await resolveProjectDirectory(
    rootPath,
    parentPath,
  );
  const nextName = validateEntryName(name);
  const entryPath = path.join(directory, nextName);
  resolveProjectFile(resolvedRoot, relativeProjectPath(resolvedRoot, entryPath));
  if (await pathExists(entryPath)) {
    return {
      conflict: true,
      output: `“${nextName}” already exists in this folder.`,
      suggestedName: path.basename(
        await uniqueNumberedDestination(directory, nextName, entryKind),
      ),
    };
  }
  if (entryKind === "folder") await fs.mkdir(entryPath);
  else await fs.writeFile(entryPath, "", "utf8");
  return {
    conflict: false,
    entryPath: relativeProjectPath(resolvedRoot, entryPath),
    output: `Created ${entryKind} ${nextName}.`,
  };
}

async function duplicateProjectEntry({ rootPath, sourcePath, sourceKind }) {
  if (sourceKind !== "file" && sourceKind !== "folder") {
    throw new Error("Choose a file or folder to duplicate.");
  }
  const { resolvedRoot, resolvedEntry } = resolveMutableProjectEntry(
    rootPath,
    sourcePath,
  );
  const destinationEntry = await uniqueDestination(
    path.dirname(resolvedEntry),
    path.basename(resolvedEntry),
    sourceKind,
  );
  resolveProjectFile(
    resolvedRoot,
    relativeProjectPath(resolvedRoot, destinationEntry),
  );
  await fs.cp(resolvedEntry, destinationEntry, {
    recursive: sourceKind === "folder",
    errorOnExist: true,
  });
  return {
    entryPath: relativeProjectPath(resolvedRoot, destinationEntry),
    output: `Duplicated as ${path.basename(destinationEntry)}.`,
  };
}

async function transferProjectEntry({
  rootPath,
  sourcePath,
  sourceKind,
  targetPath = "",
  targetKind = "folder",
  mode,
  destinationName,
}) {
  if (sourceKind !== "file" && sourceKind !== "folder") {
    throw new Error("Choose a file or folder to transfer.");
  }
  const { resolvedRoot, resolvedEntry: sourceEntry } =
    resolveMutableProjectEntry(rootPath, sourcePath);
  const target = targetPath
    ? resolveMutableProjectEntry(resolvedRoot, targetPath).resolvedEntry
    : resolvedRoot;
  const destinationDirectory =
    targetKind === "folder" ? target : path.dirname(target);

  if (!isContainedPath(resolvedRoot, destinationDirectory)) {
    throw new Error("The destination is outside the opened project.");
  }
  if (
    sourceKind === "folder" &&
    isContainedPath(sourceEntry, destinationDirectory)
  ) {
    throw new Error("A folder cannot be moved or copied inside itself.");
  }

  const requestedName = destinationName
    ? validateEntryName(destinationName)
    : path.basename(sourceEntry);
  let destinationEntry = path.join(destinationDirectory, requestedName);
  resolveProjectFile(
    resolvedRoot,
    relativeProjectPath(resolvedRoot, destinationEntry),
  );

  if (mode === "copy") {
    if (await pathExists(destinationEntry)) {
      destinationEntry = await uniqueDestination(
        destinationDirectory,
        requestedName,
        sourceKind,
      );
    }
    await fs.cp(sourceEntry, destinationEntry, {
      recursive: sourceKind === "folder",
      errorOnExist: true,
    });
  } else if (mode === "cut" || mode === "move") {
    if (destinationEntry === sourceEntry) {
      return {
        unchanged: true,
        entryPath: relativeProjectPath(resolvedRoot, sourceEntry),
        output: "The item is already in this folder.",
      };
    }
    if (await pathExists(destinationEntry)) {
      return {
        conflict: true,
        output: `“${requestedName}” already exists in the destination.`,
        suggestedName: path.basename(
          await uniqueNumberedDestination(
            destinationDirectory,
            requestedName,
            sourceKind,
          ),
        ),
      };
    }
    await fs.rename(sourceEntry, destinationEntry);
  } else {
    throw new Error("Choose a supported file transfer operation.");
  }

  return {
    conflict: false,
    entryPath: relativeProjectPath(resolvedRoot, destinationEntry),
    output: `${mode === "copy" ? "Copied" : "Moved"} ${path.basename(destinationEntry)}.`,
  };
}

module.exports = {
  createProjectEntry,
  duplicateProjectEntry,
  pathExists,
  relativeProjectPath,
  resolveProjectDirectory,
  transferProjectEntry,
  uniqueDestination,
  uniqueNumberedDestination,
};
