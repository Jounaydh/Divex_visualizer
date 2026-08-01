import type { VisualNode } from "../types";

export interface ThreeDExpansion {
  folders: Set<string>;
  files: Set<string>;
}

export const folderIdsForPath = (path: string) => {
  const parts = path.split("/");
  parts.pop();
  return parts.map(
    (_, index) => `folder:${parts.slice(0, index + 1).join("/")}`,
  );
};

export const folderLayer = (id: string) =>
  id
    .slice("folder:".length)
    .split("/")
    .filter(Boolean).length;

export const fileLayer = (id: string) =>
  id
    .slice("file:".length)
    .split("/")
    .filter(Boolean).length;

export function buildThreeDExpansion(
  expandedFolders: Set<string>,
  expandedFiles: Set<string>,
  selectedNode: VisualNode | null,
): ThreeDExpansion {
  const choices = new Map<
    number,
    { id: string; kind: "folder" | "file" }
  >();

  expandedFolders.forEach((id) =>
    choices.set(folderLayer(id), { id, kind: "folder" }),
  );
  expandedFiles.forEach((id) =>
    choices.set(fileLayer(id), { id, kind: "file" }),
  );

  if (
    selectedNode?.kind === "folder" &&
    expandedFolders.has(selectedNode.id)
  ) {
    choices.set(folderLayer(selectedNode.id), {
      id: selectedNode.id,
      kind: "folder",
    });
  } else if (
    selectedNode?.kind === "file" &&
    expandedFiles.has(selectedNode.id)
  ) {
    choices.set(fileLayer(selectedNode.id), {
      id: selectedNode.id,
      kind: "file",
    });
  }

  const folders = new Set<string>();
  const files = new Set<string>();
  choices.forEach((choice) => {
    if (choice.kind === "folder") folders.add(choice.id);
    else files.add(choice.id);
  });
  return { folders, files };
}
