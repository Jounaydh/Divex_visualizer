import type { FileKind, SourceLanguage } from "../../types";

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  cjs: "javascript",
  css: "css",
  dart: "dart",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  py: "python",
  pyw: "python",
  gradle: "config",
  json: "config",
  properties: "config",
  yaml: "config",
  yml: "config",
};

const LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  css: "CSS",
  dart: "Dart",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  python: "Python",
};

export const SOURCE_LANGUAGES: SourceLanguage[] = [
  "dart",
  "python",
  "java",
  "javascript",
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
