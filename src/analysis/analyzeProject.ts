import type {
  AnalyzedFile,
  AnalyzedProject,
  FileKind,
  FolderNode,
  ProjectPayload,
} from "../types";
import {
  extractDartImports,
  extractDartSymbols,
  resolveDartImport,
} from "./languages/dart";

const extensionKind: Record<string, FileKind> = {
  dart: "dart",
  java: "java",
  py: "python",
  yaml: "config",
  yml: "config",
  json: "config",
};

function buildFolderTree(files: AnalyzedFile[], projectName: string): FolderNode {
  const root: FolderNode = {
    id: "folder:",
    name: projectName,
    path: "",
    folders: [],
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop();
    if (!fileName) continue;
    let current = root;
    let currentPath = "";

    for (const segment of parts) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folder = current.folders.find((item) => item.name === segment);
      if (!folder) {
        folder = {
          id: `folder:${currentPath}`,
          name: segment,
          path: currentPath,
          folders: [],
          files: [],
        };
        current.folders.push(folder);
      }
      current = folder;
    }
    current.files.push(file);
  }

  const sortFolder = (folder: FolderNode) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.files.sort((a, b) => a.name.localeCompare(b.name));
    folder.folders.forEach(sortFolder);
  };
  sortFolder(root);
  return root;
}

export function analyzeProject(payload: ProjectPayload): AnalyzedProject {
  const knownPaths = new Set(payload.files.map((file) => file.path));
  const files: AnalyzedFile[] = payload.files.map((file) => {
    const name = file.path.split("/").at(-1) ?? file.path;
    const extension = name.includes(".") ? name.split(".").at(-1) ?? "" : "";
    const imports = file.path.endsWith(".dart")
      ? extractDartImports(file.content)
      : [];
    const resolvedImports = imports
      .map((value) =>
        resolveDartImport(file.path, value, payload.name, knownPaths),
      )
      .filter((value): value is string => Boolean(value));

    return {
      ...file,
      id: `file:${file.path}`,
      name,
      extension,
      kind: extensionKind[extension] ?? "unknown",
      imports,
      resolvedImports,
      symbols: extractDartSymbols(file.path, file.content),
      lineCount: file.content.split("\n").length,
    };
  });

  return {
    name: payload.name,
    rootPath: payload.rootPath,
    root: buildFolderTree(files, payload.name),
    files,
    relationshipCount: files.reduce(
      (total, file) => total + file.resolvedImports.length,
      0,
    ),
  };
}
