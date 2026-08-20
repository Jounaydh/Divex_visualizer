import type {
  AnalyzedFile,
  AnalyzedProject,
  FileKind,
  FolderNode,
  ProjectPayload,
} from "../types";
import {
  extractDartImportLinks,
  extractDartRelationships,
  extractDartSymbols,
  resolveDartImport,
} from "./languages/dart";
import { contentVersion } from "./evidence";
import {
  extractDatabaseAccessRelationships,
  extractSqlSchema,
  resolveSqlForeignKeys,
  type SqlFileAnalysis,
} from "./languages/sql";

const extensionKind: Record<string, FileKind> = {
  dart: "dart",
  java: "java",
  py: "python",
  sql: "sql",
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
  const sqlAnalysisByPath = new Map<string, SqlFileAnalysis>();
  const files: AnalyzedFile[] = payload.files.map((file) => {
    const name = file.path.split("/").at(-1) ?? file.path;
    const extension = name.includes(".") ? name.split(".").at(-1) ?? "" : "";
    const extractedImportLinks = file.path.endsWith(".dart")
      ? extractDartImportLinks(file.content)
      : [];
    const imports = extractedImportLinks.map((link) => link.value);
    const importLinks = extractedImportLinks.map((link) => ({
      ...link,
      targetPath:
        resolveDartImport(file.path, link.value, payload.name, knownPaths) ??
        undefined,
    }));
    const resolvedImports = importLinks
      .map((link) => link.targetPath)
      .filter((value): value is string => Boolean(value));
    const sqlAnalysis = extractSqlSchema(file.path, file.content);
    if (file.path.toLowerCase().endsWith(".sql")) {
      sqlAnalysisByPath.set(file.path, sqlAnalysis);
    }

    return {
      ...file,
      id: `file:${file.path}`,
      name,
      extension,
      kind: extensionKind[extension] ?? "unknown",
      imports,
      importLinks,
      resolvedImports,
      symbols: file.path.endsWith(".dart")
        ? extractDartSymbols(file.path, file.content)
        : sqlAnalysis.symbols,
      lineCount: file.content.split("\n").length,
      documentVersion: contentVersion(file.content),
    };
  });

  const relationships = [
    ...extractDartRelationships(files),
    ...resolveSqlForeignKeys(files, sqlAnalysisByPath),
    ...extractDatabaseAccessRelationships(files),
  ];
  const importRelationshipCount = files.reduce(
    (total, file) => total + file.imports.length,
    0,
  );

  return {
    name: payload.name,
    rootPath: payload.rootPath,
    root: buildFolderTree(files, payload.name),
    files,
    relationships,
    relationshipCount: importRelationshipCount + relationships.length,
    documentVersion: contentVersion(
      files.map((file) => `${file.path}:${file.documentVersion}`).join("\n"),
    ),
  };
}
