import type {
  AnalyzedFile,
  AnalyzedProject,
  FolderNode,
  ProjectPayload,
} from "../types";
import { extractDartRelationships } from "./languages/dart";
import {
  analyzeFilesWithLanguages,
  projectLanguageSummary,
  sourceLanguagesForKinds,
} from "./languages/registry";

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
  const files: AnalyzedFile[] = analyzeFilesWithLanguages(
    payload.name,
    payload.files,
  ).map((file) => ({
    ...file,
    id: `file:${file.path}`,
    name: file.path.split("/").at(-1) ?? file.path,
    lineCount: file.content.split(/\r?\n/).length,
  }));
  const languages = sourceLanguagesForKinds(
    files.map((file) => file.kind),
  );
  const isFlutterProject = files.some(
    (file) =>
      file.name === "pubspec.yaml" &&
      /^\s*flutter\s*:/m.test(file.content),
  );

  const relationships = extractDartRelationships(files);
  const importRelationshipCount = files.reduce(
    (total, file) => total + file.imports.length,
    0,
  );

  return {
    name: payload.name,
    rootPath: payload.rootPath,
    root: buildFolderTree(files, payload.name),
    files,
    languages,
    languageSummary: projectLanguageSummary(
      languages,
      isFlutterProject,
    ),
    relationships,
    relationshipCount: importRelationshipCount + relationships.length,
  };
}
