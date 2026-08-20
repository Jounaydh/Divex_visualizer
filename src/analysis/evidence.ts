import type {
  AnalyzedFile,
  EvidenceLocation,
  SourceRange,
} from "../types";

export function contentVersion(content: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function lineRange(
  content: string,
  line: number,
  startColumn = 1,
  endColumn?: number,
): SourceRange {
  const lineContent = content.split("\n")[Math.max(0, line - 1)] ?? "";
  return {
    startLine: Math.max(1, line),
    startColumn: Math.max(1, startColumn),
    endLine: Math.max(1, line),
    endColumn: Math.max(startColumn, endColumn ?? lineContent.length + 1),
  };
}

export function fileLocation(
  file: AnalyzedFile,
  range?: SourceRange,
  symbolId?: string,
): EvidenceLocation {
  return {
    uri: file.path,
    range,
    symbolId,
    documentVersion: file.documentVersion,
  };
}

export function workspaceLocation(rootPath: string): EvidenceLocation {
  return { uri: rootPath ? `workspace:${rootPath}` : "workspace:demo" };
}
