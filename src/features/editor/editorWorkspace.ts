import type { EditorDocument } from "./editorTypes";

export interface DiffRow {
  line: number;
  left: string;
  right: string;
  changed: boolean;
}

export function buildSideBySideDiff(leftContent: string, rightContent: string) {
  const left = leftContent.split(/\r?\n/);
  const right = rightContent.split(/\r?\n/);
  const length = Math.max(left.length, right.length);
  return Array.from({ length }, (_, index): DiffRow => ({
    line: index + 1,
    left: left[index] ?? "",
    right: right[index] ?? "",
    changed: left[index] !== right[index],
  }));
}

export function hasExternalConflict(document: EditorDocument, diskContent: string) {
  return document.dirty &&
    document.savedContent !== diskContent &&
    document.session.getValue() !== diskContent;
}

export function replacePreviewTab(
  tabs: string[],
  nextPath: string,
  previewPath: string | null,
  pinnedPaths: ReadonlySet<string>,
  previewDirty: boolean,
) {
  if (tabs.includes(nextPath)) return tabs;
  if (previewPath && !pinnedPaths.has(previewPath) && !previewDirty) {
    const index = tabs.indexOf(previewPath);
    if (index >= 0) {
      const next = [...tabs];
      next[index] = nextPath;
      return next;
    }
  }
  return [...tabs, nextPath];
}

export function addRecentlyClosed(paths: string[], path: string, limit = 10) {
  return [path, ...paths.filter((candidate) => candidate !== path)].slice(0, limit);
}
