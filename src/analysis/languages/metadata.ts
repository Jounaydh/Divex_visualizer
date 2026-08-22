import type { FileKind, SourceLanguage } from "../../types";

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  cjs: "javascript",
  cfg: "config",
  css: "css",
  dart: "dart",
  htm: "html",
  html: "html",
  ini: "config",
  java: "java",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  pyw: "python",
  gradle: "config",
  json: "config",
  properties: "config",
  toml: "config",
  txt: "config",
  yaml: "config",
  yml: "config",
};

const LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  css: "CSS",
  dart: "Dart",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
};

export const SOURCE_LANGUAGES: SourceLanguage[] = [
  "dart",
  "python",
  "java",
  "javascript",
  "typescript",
  "html",
  "css",
];

export function fileKindForExtension(extension: string): FileKind {
  return KIND_BY_EXTENSION[extension.toLowerCase()] ?? "unknown";
}

export function languageLabelForKind(
  kind: FileKind,
  fallbackExtension = "",
) {
  if (
    kind !== "config" &&
    kind !== "folder" &&
    kind !== "unknown"
  ) {
    return LANGUAGE_LABELS[kind];
  }
  if (kind === "config") return "Configuration";
  return fallbackExtension ? fallbackExtension.toUpperCase() : "Plain text";
}

export function isSourceLanguage(kind: FileKind): kind is SourceLanguage {
  return SOURCE_LANGUAGES.includes(kind as SourceLanguage);
}
