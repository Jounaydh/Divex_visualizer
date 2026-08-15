import type {
  CodeSymbol,
  FileKind,
  ProjectFile,
  SymbolKind,
} from "../../types";

export const MAX_SYMBOLS_PER_FILE = 250;

export interface AnalysisContext {
  projectName: string;
  knownPaths: Set<string>;
  canonicalPathByLowercase: Map<string, string>;
  javaTypePaths: Map<string, string>;
}

export interface LanguageAnalysis {
  imports: string[];
  importLinks: Array<{
    value: string;
    targetPath?: string;
  }>;
  resolvedImports: string[];
  symbols: CodeSymbol[];
}

export interface LanguageAdapter {
  extensions: readonly string[];
  kind: FileKind;
  analyze: (
    path: string,
    content: string,
    context: AnalysisContext,
  ) => LanguageAnalysis;
}

export function createAnalysisContext(
  projectName: string,
  files: ProjectFile[],
  javaTypePaths = new Map<string, string>(),
): AnalysisContext {
  const normalizedPaths = files.map((file) =>
    normalizeProjectPath(file.path),
  );
  return {
    projectName,
    knownPaths: new Set(normalizedPaths),
    canonicalPathByLowercase: new Map(
      normalizedPaths.map((path) => [path.toLowerCase(), path]),
    ),
    javaTypePaths,
  };
}

export function normalizeProjectPath(input: string) {
  const normalized: string[] = [];
  for (const part of input.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.join("/");
}

export function directoryForPath(path: string) {
  const parts = normalizeProjectPath(path).split("/");
  parts.pop();
  return parts.join("/");
}

export function canonicalKnownPath(
  candidate: string,
  context: AnalysisContext,
) {
  const normalized = normalizeProjectPath(candidate);
  if (context.knownPaths.has(normalized)) return normalized;
  return context.canonicalPathByLowercase.get(normalized.toLowerCase()) ?? null;
}

function cleanSpecifier(specifier: string) {
  return specifier.trim().replace(/[?#].*$/, "");
}

function isExternalSpecifier(specifier: string) {
  return (
    !specifier ||
    specifier.startsWith("#") ||
    specifier.startsWith("data:") ||
    specifier.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(specifier)
  );
}

function candidatePaths(base: string, extensions: readonly string[]) {
  const normalizedBase = normalizeProjectPath(base);
  const candidates = [normalizedBase];
  const lastSegment = normalizedBase.split("/").at(-1) ?? "";
  if (!lastSegment.includes(".")) {
    for (const extension of extensions) {
      candidates.push(`${normalizedBase}.${extension}`);
    }
  }
  for (const extension of extensions) {
    candidates.push(`${normalizedBase}/index.${extension}`);
  }
  return candidates;
}

export function resolveProjectSpecifier(
  sourcePath: string,
  rawSpecifier: string,
  context: AnalysisContext,
  extensions: readonly string[],
  allowBare = false,
) {
  const specifier = cleanSpecifier(rawSpecifier);
  if (isExternalSpecifier(specifier)) return null;

  let base: string;
  if (specifier.startsWith("/")) {
    base = specifier.slice(1);
  } else if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    base = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    const directory = directoryForPath(sourcePath);
    base = directory ? `${directory}/${specifier}` : specifier;
  } else if (allowBare) {
    base = specifier;
  } else {
    return null;
  }

  for (const candidate of candidatePaths(base, extensions)) {
    const knownPath = canonicalKnownPath(candidate, context);
    if (knownPath) return knownPath;
  }
  return null;
}

export function findShortestPathBySuffix(
  suffixes: string[],
  context: AnalysisContext,
) {
  const lowerSuffixes = suffixes.map((suffix) =>
    normalizeProjectPath(suffix).toLowerCase(),
  );
  const matches = [...context.knownPaths].filter((path) => {
    const lowerPath = path.toLowerCase();
    return lowerSuffixes.some(
      (suffix) => lowerPath === suffix || lowerPath.endsWith(`/${suffix}`),
    );
  });
  matches.sort(
    (left, right) =>
      left.split("/").length - right.split("/").length ||
      left.localeCompare(right),
  );
  return matches[0] ?? null;
}

export function lineNumberAt(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

export function leadingWhitespace(line: string) {
  return line.length - line.trimStart().length;
}

export function createSymbol(
  path: string,
  name: string,
  kind: SymbolKind,
  signature: string,
  line: number,
  language: string,
): CodeSymbol {
  const noun =
    kind === "widget"
      ? "Flutter widget"
      : kind === "element"
        ? "HTML element"
        : kind === "selector"
          ? "CSS selector"
          : kind;
  return {
    id: `${path}:symbol:${kind}:${name}:${line}`,
    name,
    kind,
    signature,
    line,
    endLine: line,
    description: `${name} is a ${language} ${noun} defined in this file.`,
  };
}

export function unique(values: string[]) {
  return [...new Set(values)];
}

export function stripCommentsPreservingLines(
  content: string,
  pattern: RegExp,
) {
  return content.replace(pattern, (match) =>
    match.replace(/[^\r\n]/g, " "),
  );
}
