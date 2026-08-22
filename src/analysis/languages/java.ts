import type { CodeSymbol, ProjectFile } from "../../types";
import {
  MAX_SYMBOLS_PER_FILE,
  canonicalKnownPath,
  createSymbol,
  findShortestPathBySuffix,
  leadingWhitespace,
  normalizeProjectPath,
  unique,
  type AnalysisContext,
  type LanguageAdapter,
} from "./shared";

const JAVA_TYPE_PATTERN =
  /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g;

export function buildJavaTypeIndex(files: ProjectFile[]) {
  const index = new Map<string, string>();
  for (const file of files) {
    const path = normalizeProjectPath(file.path);
    if (!path.toLowerCase().endsWith(".java")) continue;
    const packageName =
      file.content.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] ?? "";
    const declaredTypes = [
      ...file.content.matchAll(JAVA_TYPE_PATTERN),
    ].map((match) => match[1]);
    const fileType = path.split("/").at(-1)?.replace(/\.java$/i, "");
    if (fileType && !declaredTypes.includes(fileType)) {
      declaredTypes.push(fileType);
    }
    for (const typeName of declaredTypes) {
      const qualifiedName = packageName
        ? `${packageName}.${typeName}`
        : typeName;
      index.set(qualifiedName, path);
    }
  }
  return index;
}

function extractJavaImports(content: string) {
  return unique(
    [
      ...content.matchAll(
        /^\s*import\s+(?:static\s+)?([\w.]+)(\.\*)?\s*;/gm,
      ),
    ].map((match) => `${match[1]}${match[2] ?? ""}`),
  );
}

function resolveJavaImport(
  importValue: string,
  content: string,
  context: AnalysisContext,
) {
  const wildcard = importValue.endsWith(".*");
  const baseImport = wildcard ? importValue.slice(0, -2) : importValue;

  let typeName = baseImport;
  while (typeName.includes(".")) {
    const indexedPath = context.javaTypePaths.get(typeName);
    if (indexedPath) return [indexedPath];
    typeName = typeName.slice(0, typeName.lastIndexOf("."));
  }
  const directlyIndexed = context.javaTypePaths.get(typeName);
  if (directlyIndexed) return [directlyIndexed];

  if (wildcard) {
    const prefix = `${baseImport}.`;
    return unique(
      [...context.javaTypePaths.entries()]
        .filter(([qualifiedName]) => {
          if (!qualifiedName.startsWith(prefix)) return false;
          const remainder = qualifiedName.slice(prefix.length);
          if (remainder.includes(".")) return false;
          return new RegExp(`\\b${remainder}\\b`).test(content);
        })
        .map(([, path]) => path),
    );
  }

  const pathCandidate = `${baseImport.replaceAll(".", "/")}.java`;
  const exactPath = canonicalKnownPath(pathCandidate, context);
  if (exactPath) return [exactPath];
  const suffixPath = findShortestPathBySuffix([pathCandidate], context);
  return suffixPath ? [suffixPath] : [];
}

function javaBraceDelta(line: string) {
  const withoutStrings = line
    .replace(/"(?:\\.|[^"\\])*"/g, "")
    .replace(/'(?:\\.|[^'\\])*'/g, "")
    .replace(/\/\/.*$/, "");
  return (
    [...withoutStrings].filter((character) => character === "{").length -
    [...withoutStrings].filter((character) => character === "}").length
  );
}

function extractJavaSymbols(path: string, content: string) {
  const symbols: CodeSymbol[] = [];
  const classStack: Array<{
    bodyDepth: number;
    name: string;
  }> = [];
  let braceDepth = 0;

  content.split("\n").forEach((line, index) => {
    if (symbols.length >= MAX_SYMBOLS_PER_FILE) return;
    while (
      classStack.length > 0 &&
      braceDepth < classStack[classStack.length - 1].bodyDepth
    ) {
      classStack.pop();
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      braceDepth += javaBraceDelta(line);
      return;
    }

    const typeMatch = trimmed.match(
      /^(?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/,
    );
    if (typeMatch) {
      const kind = typeMatch[1] === "interface" ? "interface" : "class";
      symbols.push(
        createSymbol(
          path,
          typeMatch[2],
          kind,
          trimmed.replace(/\s*\{.*$/, ""),
          index + 1,
          "Java",
        ),
      );
      if (line.includes("{")) {
        classStack.push({
          bodyDepth: braceDepth + 1,
          name: typeMatch[2],
        });
      }
      braceDepth += javaBraceDelta(line);
      return;
    }

    const activeClass = classStack.at(-1);
    if (activeClass && braceDepth === activeClass.bodyDepth) {
      const constructorPattern = new RegExp(
        `^(?:(?:public|protected|private)\\s+)*${activeClass.name}\\s*\\([^;{}]*\\)\\s*(?:throws\\s+[^\\{]+)?\\{`,
      );
      const constructorMatch = trimmed.match(constructorPattern);
      if (constructorMatch) {
        symbols.push(
          createSymbol(
            path,
            activeClass.name,
            "method",
            trimmed.replace(/\s*\{.*$/, ""),
            index + 1,
            "Java",
          ),
        );
      } else {
        const methodMatch = trimmed.match(
          /^(?:(?:public|protected|private|abstract|final|static|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s+)?[\w$<>\[\],.?]+\s+([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{;]+)?[;{]/,
        );
        if (methodMatch) {
          symbols.push(
            createSymbol(
              path,
              methodMatch[1],
              "method",
              trimmed.replace(/\s*[;{].*$/, ""),
              index + 1,
              "Java",
            ),
          );
        } else {
          const fieldMatch = trimmed.match(
            /^(?:(?:public|protected|private|final|static|transient|volatile)\s+)*[\w$<>\[\],.?]+\s+([A-Za-z_$][\w$]*)\s*(?:=|;)/,
          );
          if (fieldMatch && leadingWhitespace(line) > 0) {
            symbols.push(
              createSymbol(
                path,
                fieldMatch[1],
                "variable",
                trimmed.replace(/\s*=.*$/, ""),
                index + 1,
                "Java",
              ),
            );
          }
        }
      }
    }

    braceDepth += javaBraceDelta(line);
  });

  return symbols;
}

export const javaAdapter: LanguageAdapter = {
  extensions: ["java"],
  kind: "java",
  analyze(path, content, context) {
    const imports = extractJavaImports(content);
    const resolvedByImport = imports.map((value) => ({
      value,
      targets: resolveJavaImport(value, content, context),
    }));
    return {
      imports,
      importLinks: resolvedByImport.map(({ value, targets }) => ({
        value,
        targetPath: targets[0],
      })),
      resolvedImports: unique(
        resolvedByImport.flatMap(({ targets }) => targets),
      ),
      symbols: extractJavaSymbols(path, content),
    };
  },
};
