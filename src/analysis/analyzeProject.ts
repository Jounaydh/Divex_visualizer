import type {
  AnalyzedFile,
  AnalyzedProject,
  CodeSymbol,
  FileKind,
  FolderNode,
  ProjectPayload,
} from "../types";

const extensionKind: Record<string, FileKind> = {
  dart: "dart",
  java: "java",
  py: "python",
  yaml: "config",
  yml: "config",
  json: "config",
};

const describeSymbol = (kind: CodeSymbol["kind"], name: string) => {
  const noun = kind === "widget" ? "Flutter widget" : kind;
  return `${name} is a ${noun} defined in this file. Select it to inspect its code and relationships.`;
};

function extractDartSymbols(path: string, content: string): CodeSymbol[] {
  if (!path.endsWith(".dart")) return [];

  const symbols: CodeSymbol[] = [];
  const lines = content.split("\n");
  const classPattern =
    /^\s*(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$<>, ]*))?/;
  const functionPattern =
    /^\s*(?:Future<[^>]+>|Future<void>|void|Widget|String|int|double|bool|List<[^>]+>|Map<[^>]+>|[A-Z][\w<>?, ]+)\s+([a-zA-Z_$][\w$]*)\s*\(([^;]*)\)\s*(?:async\s*)?(?:\{|=>)/;

  lines.forEach((line, index) => {
    const classMatch = line.match(classPattern);
    if (classMatch) {
      const widget = /(?:StatelessWidget|StatefulWidget)/.test(classMatch[2] ?? "");
      const kind: CodeSymbol["kind"] = widget ? "widget" : "class";
      symbols.push({
        id: `${path}:symbol:${classMatch[1]}:${index + 1}`,
        name: classMatch[1],
        kind,
        signature: line.trim().replace(/\s*\{$/, ""),
        line: index + 1,
        description: describeSymbol(kind, classMatch[1]),
      });
      return;
    }

    const functionMatch = line.match(functionPattern);
    if (functionMatch && !["if", "for", "while", "switch"].includes(functionMatch[1])) {
      const name = functionMatch[1];
      const indent = line.length - line.trimStart().length;
      const kind: CodeSymbol["kind"] = indent > 0 ? "method" : "function";
      symbols.push({
        id: `${path}:symbol:${name}:${index + 1}`,
        name,
        kind,
        signature: line.trim().replace(/\s*(?:async\s*)?\{.*$/, ""),
        line: index + 1,
        description: describeSymbol(kind, name),
      });
    }
  });

  return symbols;
}

function resolveDartImport(
  sourcePath: string,
  importValue: string,
  projectName: string,
  knownPaths: Set<string>,
) {
  if (importValue.startsWith("dart:") || importValue.startsWith("package:flutter")) {
    return null;
  }

  if (importValue.startsWith(`package:${projectName}/`)) {
    const candidate = `lib/${importValue.slice(projectName.length + 9)}`;
    return knownPaths.has(candidate) ? candidate : null;
  }

  if (importValue.startsWith("package:")) return null;

  const sourceParts = sourcePath.split("/");
  sourceParts.pop();
  for (const part of importValue.split("/")) {
    if (part === "..") sourceParts.pop();
    else if (part !== ".") sourceParts.push(part);
  }
  const resolved = sourceParts.join("/");
  return knownPaths.has(resolved) ? resolved : null;
}

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
      ? [...file.content.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map(
          (match) => match[1],
        )
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
