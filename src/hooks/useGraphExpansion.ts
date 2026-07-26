import { useMemo, useState } from "react";
import type { ViewMode, VisualNode } from "../types";

const folderLayer = (id: string) =>
  id
    .slice("folder:".length)
    .split("/")
    .filter(Boolean).length;

const fileLayer = (id: string) =>
  id
    .slice("file:".length)
    .split("/")
    .filter(Boolean).length;

const folderIdsForPath = (path: string) => {
  const parts = path.split("/");
  parts.pop();
  return parts.map(
    (_, index) => `folder:${parts.slice(0, index + 1).join("/")}`,
  );
};

export function useGraphExpansion(
  selectedNode: VisualNode | null,
  viewMode: ViewMode,
) {
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(["folder:lib"]),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(),
  );

  const threeDExpansion = useMemo(() => {
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
  }, [expandedFiles, expandedFolders, selectedNode]);

  const resetExpansion = (firstFolder?: string) => {
    setExpandedFolders(new Set(firstFolder ? [`folder:${firstFolder}`] : []));
    setExpandedFiles(new Set());
  };

  const revealFilePath = (path: string) => {
    const ancestorIds = folderIdsForPath(path);
    const ancestorLayers = new Set(ancestorIds.map(folderLayer));
    setExpandedFolders((current) => {
      const next = new Set(current);
      ancestorIds.forEach((id) => {
        if (viewMode === "2d") {
          next.add(id);
          return;
        }
        const layer = folderLayer(id);
        [...next].forEach((openId) => {
          if (folderLayer(openId) === layer) next.delete(openId);
        });
        next.add(id);
      });
      return next;
    });
    if (viewMode === "3d") {
      setExpandedFiles((current) => {
        const next = new Set(current);
        [...next].forEach((openId) => {
          if (ancestorLayers.has(fileLayer(openId))) next.delete(openId);
        });
        return next;
      });
    }
  };

  const toggleFolderAtLayer = (id: string) => {
    const isOpen = threeDExpansion.folders.has(id);
    const layer = folderLayer(id);
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (isOpen) {
        next.delete(id);
        return next;
      }
      [...next].forEach((openId) => {
        if (folderLayer(openId) === layer) next.delete(openId);
      });
      next.add(id);
      return next;
    });
    if (!isOpen) {
      setExpandedFiles((current) => {
        const next = new Set(current);
        [...next].forEach((openId) => {
          if (fileLayer(openId) === layer) next.delete(openId);
        });
        return next;
      });
    }
  };

  const toggleFileAtLayer = (id: string) => {
    const isOpen = threeDExpansion.files.has(id);
    const layer = fileLayer(id);
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (isOpen) {
        next.delete(id);
        return next;
      }
      [...next].forEach((openId) => {
        if (fileLayer(openId) === layer) next.delete(openId);
      });
      next.add(id);
      return next;
    });
    if (!isOpen) {
      setExpandedFolders((current) => {
        const next = new Set(current);
        [...next].forEach((openId) => {
          if (folderLayer(openId) === layer) next.delete(openId);
        });
        return next;
      });
    }
  };

  const toggleFolderFreely = (id: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFileFreely = (id: string) => {
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return {
    expandedFolders,
    expandedFiles,
    threeDExpansion,
    resetExpansion,
    revealFilePath,
    toggleFolderAtLayer,
    toggleFileAtLayer,
    toggleFolderFreely,
    toggleFileFreely,
  };
}
