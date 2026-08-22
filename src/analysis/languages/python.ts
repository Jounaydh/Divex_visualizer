import type { CodeSymbol } from "../../types";
import {
  MAX_SYMBOLS_PER_FILE,
  canonicalKnownPath,
  createSymbol,
  directoryForPath,
  findShortestPathBySuffix,
  leadingWhitespace,
  normalizeProjectPath,
  unique,
  type AnalysisContext,
  type LanguageAdapter,
} from "./shared";

function extractPythonImports(content: string) {
  const imports: string[] = [];
  for (const line of content.split("\n")) {
    const importMatch = line.match(/^\s*import\s+(.+?)(?:\s+#.*)?$/);
    if (importMatch) {
      for (const entry of importMatch[1].split(",")) {
        const moduleName = entry.trim().split(/\s+as\s+/)[0];
        if (moduleName) imports.push(moduleName);
      }
      continue;
    }
    const fromMatch = line.match(
      /^\s*from\s+([.\w]+)\s+import\s+[\w*(]/,
    );
    if (fromMatch) imports.push(fromMatch[1]);
  }
  return unique(imports);
}

function resolvePythonImport(
  sourcePath: string,
  moduleName: string,
  context: AnalysisContext,
) {
  let modulePath: string;
  if (moduleName.startsWith(".")) {
    const relativeMatch = moduleName.match(/^(\.+)(.*)$/);
    if (!relativeMatch) return null;
    const directoryParts = directoryForPath(sourcePath)
      .split("/")
      .filter(Boolean);
    for (let level = 1; level < relativeMatch[1].length; level += 1) {
      directoryParts.pop();
    }
    const remainder = relativeMatch[2].replaceAll(".", "/");
    modulePath = normalizeProjectPath(
      [...directoryParts, remainder].filter(Boolean).join("/"),
    );
  } else {
    modulePath = moduleName.replaceAll(".", "/");
  }

  const candidates = [`${modulePath}.py`, `${modulePath}/__init__.py`];
  for (const candidate of candidates) {
    const knownPath = canonicalKnownPath(candidate, context);
    if (knownPath) return knownPath;
  }

  const projectModule = context.projectName
    .replaceAll("-", "_")
    .replaceAll(" ", "_")
    .toLowerCase();
  const lowerModulePath = modulePath.toLowerCase();
  if (lowerModulePath.startsWith(`${projectModule}/`)) {
    const withoutProject = modulePath.slice(projectModule.length + 1);
    const projectCandidate = findShortestPathBySuffix(
      [`${withoutProject}.py`, `${withoutProject}/__init__.py`],
      context,
    );
    if (projectCandidate) return projectCandidate;
  }

  return findShortestPathBySuffix(candidates, context);
}

function extractPythonSymbols(path: string, content: string) {
  const symbols: CodeSymbol[] = [];
  const activeClassIndents: number[] = [];

  content.split("\n").forEach((line, index) => {
    if (symbols.length >= MAX_SYMBOLS_PER_FILE) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const indent = leadingWhitespace(line);
    while (
      activeClassIndents.length > 0 &&
      indent <= activeClassIndents[activeClassIndents.length - 1]
    ) {
      activeClassIndents.pop();
    }

    const classMatch = trimmed.match(
      /^class\s+([A-Za-z_]\w*)(?:\s*\([^)]*\))?\s*:/,
    );
    if (classMatch) {
      symbols.push(
        createSymbol(
          path,
          classMatch[1],
          "class",
          trimmed,
          index + 1,
          "Python",
        ),
      );
      activeClassIndents.push(indent);
      return;
    }

    const functionMatch = trimmed.match(
      /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:/,
    );
    if (functionMatch) {
      const kind =
        activeClassIndents.length > 0 ? "method" : "function";
      symbols.push(
        createSymbol(
          path,
          functionMatch[1],
          kind,
          trimmed,
          index + 1,
          "Python",
        ),
      );
      return;
    }

    const variableMatch =
      indent === 0
        ? trimmed.match(/^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/)
        : null;
    if (variableMatch) {
      symbols.push(
        createSymbol(
          path,
          variableMatch[1],
          "variable",
          trimmed,
          index + 1,
          "Python",
        ),
      );
    }
  });

  return symbols;
}

export const pythonAdapter: LanguageAdapter = {
  extensions: ["py", "pyw"],
  kind: "python",
  analyze(path, content, context) {
    const imports = extractPythonImports(content);
    const importLinks = imports.map((value) => ({
      value,
      targetPath:
        resolvePythonImport(path, value, context) ?? undefined,
    }));
    return {
      imports,
      importLinks,
      resolvedImports: unique(
        importLinks
          .map((link) => link.targetPath)
          .filter((value): value is string => Boolean(value)),
      ),
      symbols: extractPythonSymbols(path, content),
    };
  },
};
