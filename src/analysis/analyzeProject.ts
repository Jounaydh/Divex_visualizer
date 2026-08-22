import type {
  AnalyzedFile,
  AnalyzedProject,
  FolderNode,
  ProjectPayload,
} from "../types";
import { extractDartRelationships } from "./languages/dart";
import { contentVersion } from "./evidence";
import {
  extractDatabaseAccessRelationships,
  extractSqlSchema,
  resolveSqlForeignKeys,
  type SqlFileAnalysis,
} from "./languages/sql";
import {
  analyzeFilesWithLanguages,
  projectLanguageSummary,
  sourceLanguagesForKinds,
} from "./languages/registry";

function buildFolderTree(
  files: AnalyzedFile[],
  projectName: string,
  projectFolders: string[] = [],
): FolderNode {
  const root: FolderNode = {
    id: "folder:",
    name: projectName,
    path: "",
    folders: [],
    files: [],
  };

  const ensureFolderPath = (folderPath: string) => {
    const parts = folderPath.split("/").filter(Boolean);
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
    return current;
  };

  projectFolders.forEach(ensureFolderPath);

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop();
    if (!fileName) continue;
    const current = ensureFolderPath(parts.join("/"));
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
  const sqlAnalysisByPath = new Map<string, SqlFileAnalysis>();
  const files: AnalyzedFile[] = analyzeFilesWithLanguages(
    payload.name,
    payload.files,
  ).map((file) => {
    const sqlAnalysis = extractSqlSchema(file.path, file.content);
    const isSql = file.path.toLowerCase().endsWith(".sql");
    if (isSql) sqlAnalysisByPath.set(file.path, sqlAnalysis);
    return {
      ...file,
      id: `file:${file.path}`,
      name: file.path.split("/").at(-1) ?? file.path,
      kind: isSql ? "sql" : file.kind,
      symbols: isSql ? sqlAnalysis.symbols : file.symbols,
      lineCount: file.content.split(/\r?\n/).length,
      documentVersion: contentVersion(file.content),
    };
  });
  const languages = sourceLanguagesForKinds(
    files.map((file) => file.kind),
  );
  const isFlutterProject = files.some(
    (file) =>
      file.name === "pubspec.yaml" &&
      /^\s*flutter\s*:/m.test(file.content),
  );

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
    environment: payload.environment,
    root: buildFolderTree(files, payload.name, payload.folders),
    files,
    languages,
    languageSummary: projectLanguageSummary(
      languages,
      isFlutterProject,
    ),
    relationships,
    relationshipCount: importRelationshipCount + relationships.length,
    documentVersion: contentVersion(
      files.map((file) => `${file.path}:${file.documentVersion}`).join("\n"),
    ),
  };
}
