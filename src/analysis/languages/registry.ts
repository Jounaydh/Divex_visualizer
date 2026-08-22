import type {
  FileKind,
  ProjectFile,
  SourceLanguage,
} from "../../types";
import { cssAdapter } from "./css";
import {
  extractDartImportLinks,
  extractDartSymbols,
  resolveDartImport,
} from "./dart";
import { htmlAdapter } from "./html";
import { buildJavaTypeIndex, javaAdapter } from "./java";
import { javascriptAdapter } from "./javascript";
import { typescriptAdapter } from "./typescript";
import {
  fileKindForExtension,
  isSourceLanguage,
  languageLabelForKind,
} from "./metadata";
import { pythonAdapter } from "./python";
import {
  createAnalysisContext,
  normalizeProjectPath,
  type LanguageAdapter,
} from "./shared";

const dartAdapter: LanguageAdapter = {
  extensions: ["dart"],
  kind: "dart",
  analyze(path, content, context) {
    const extractedImportLinks = extractDartImportLinks(content);
    const imports = extractedImportLinks.map((link) => link.value);
    const importLinks = extractedImportLinks.map((link) => ({
      ...link,
      targetPath:
        resolveDartImport(
          path,
          link.value,
          context.projectName,
          context.knownPaths,
        ) ?? undefined,
    }));
    return {
      imports,
      importLinks,
      resolvedImports: [
        ...new Set(
          importLinks
            .map((link) => link.targetPath)
            .filter((value): value is string => Boolean(value)),
        ),
      ],
      symbols: extractDartSymbols(path, content),
    };
  },
};

const ADAPTERS: LanguageAdapter[] = [
  dartAdapter,
  pythonAdapter,
  javaAdapter,
  javascriptAdapter,
  typescriptAdapter,
  htmlAdapter,
  cssAdapter,
];

const ADAPTER_BY_EXTENSION = new Map(
  ADAPTERS.flatMap((adapter) =>
    adapter.extensions.map(
      (extension) => [extension, adapter] as const,
    ),
  ),
);

export function extensionForPath(path: string) {
  const name = normalizeProjectPath(path).split("/").at(-1) ?? "";
  return name.includes(".")
    ? (name.split(".").at(-1) ?? "").toLowerCase()
    : "";
}

export function analyzeFilesWithLanguages(
  projectName: string,
  files: ProjectFile[],
) {
  const normalizedFiles = files.map((file) => ({
    ...file,
    path: normalizeProjectPath(file.path),
  }));
  const context = createAnalysisContext(
    projectName,
    normalizedFiles,
    buildJavaTypeIndex(normalizedFiles),
  );

  return normalizedFiles.map((file) => {
    const extension = extensionForPath(file.path);
    const adapter = ADAPTER_BY_EXTENSION.get(extension);
    const kind = adapter?.kind ?? fileKindForExtension(extension);
    const analysis = adapter?.analyze(file.path, file.content, context) ?? {
      imports: [],
      importLinks: [],
      resolvedImports: [],
      symbols: [],
    };
    return {
      ...file,
      extension,
      kind,
      ...analysis,
    };
  });
}

export function sourceLanguagesForKinds(kinds: FileKind[]) {
  const counts = new Map<SourceLanguage, number>();
  for (const kind of kinds) {
    if (!isSourceLanguage(kind)) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(
      ([leftKind, leftCount], [rightKind, rightCount]) =>
        rightCount - leftCount ||
        languageLabelForKind(leftKind).localeCompare(
          languageLabelForKind(rightKind),
        ),
    )
    .map(([kind]) => kind);
}

export function projectLanguageSummary(
  languages: SourceLanguage[],
  isFlutterProject: boolean,
) {
  if (languages.length === 0) return "Code";
  if (languages.length === 1) {
    if (languages[0] === "dart" && isFlutterProject) {
      return "Flutter / Dart";
    }
    return languageLabelForKind(languages[0]);
  }
  if (languages.length === 2) {
    return languages.map((kind) => languageLabelForKind(kind)).join(" + ");
  }
  return `${languages.length}-language`;
}
