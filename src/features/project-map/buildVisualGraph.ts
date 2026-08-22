import type {
  AnalyzedFile,
  AnalyzedProject,
  FolderNode,
  VisualEdge,
  VisualNode,
} from "../../types";

interface VisualGraph {
  nodes: VisualNode[];
  edges: VisualEdge[];
}

const ROOT_Y = 7;
const VERTICAL_SPACING = 4.1;
const MIN_RING_RADIUS = 3.3;
const TREE_HORIZONTAL_SPACING = 3.25;

const countFolderItems = (folder: FolderNode): number =>
  folder.files.length +
  folder.folders.reduce(
    (total, child) => total + 1 + countFolderItems(child),
    0,
  );

export function buildVisualGraph(
  project: AnalyzedProject,
  expandedFolders: Set<string>,
  expandedFiles: Set<string>,
  layout: "tree" | "ring" = "tree",
): VisualGraph {
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];

  const addNode = (
    node: Omit<VisualNode, "position">,
    depth: number,
  ): VisualNode => {
    const positionedNode: VisualNode = {
      ...node,
      position: [0, ROOT_Y - depth * VERTICAL_SPACING, 0],
    };
    nodes.push(positionedNode);
    return positionedNode;
  };

  addNode(
    {
      id: "project",
      label: project.name,
      subtitle: `${project.files.length} files`,
      kind: "project",
      itemCount: project.files.length,
    },
    0,
  );

  const addFile = (
    file: AnalyzedFile,
    parentId: string,
    depth: number,
  ) => {
    addNode(
      {
        id: file.id,
        label: file.name,
        subtitle: `${file.symbols.length} symbols · ${file.lineCount} lines`,
        kind: "file",
        path: file.path,
        parentId,
      },
      depth,
    );
    edges.push({
      id: `contains:${parentId}:${file.id}`,
      source: parentId,
      target: file.id,
      kind: "contains",
    });

    if (!expandedFiles.has(file.id)) return;

    file.symbols.forEach((symbol) => {
      addNode(
        {
          id: symbol.id,
          label: symbol.name,
          subtitle: symbol.kind,
          kind: symbol.kind,
          path: file.path,
          parentId: file.id,
        },
        depth + 1,
      );
      edges.push({
        id: `contains:${file.id}:${symbol.id}`,
        source: file.id,
        target: symbol.id,
        kind: "contains",
      });
    });
  };

  const visitFolder = (
    folder: FolderNode,
    parentId: string,
    depth: number,
  ) => {
    addNode(
      {
        id: folder.id,
        label: folder.name,
        subtitle: `${countFolderItems(folder)} items`,
        kind: "folder",
        path: folder.path,
        parentId,
        itemCount: countFolderItems(folder),
      },
      depth,
    );
    edges.push({
      id: `contains:${parentId}:${folder.id}`,
      source: parentId,
      target: folder.id,
      kind: "contains",
    });

    if (!expandedFolders.has(folder.id)) return;

    folder.folders.forEach((child) =>
      visitFolder(child, folder.id, depth + 1),
    );
    folder.files.forEach((file) => addFile(file, folder.id, depth + 1));
  };

  project.root.folders.forEach((folder) =>
    visitFolder(folder, "project", 1),
  );
  project.root.files.forEach((file) => addFile(file, "project", 1));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, VisualNode[]>();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  });

  if (layout === "tree") {
    let nextLeafX = 0;
    const positionNestedBranch = (nodeId: string, depth: number): number => {
      const node = nodeById.get(nodeId);
      if (!node) return nextLeafX;
      const children = childrenByParent.get(nodeId) ?? [];
      node.position[1] = ROOT_Y - depth * VERTICAL_SPACING;
      node.position[2] = 0;

      if (children.length === 0) {
        const leafX = nextLeafX * TREE_HORIZONTAL_SPACING;
        nextLeafX += 1;
        node.position[0] = leafX;
        return leafX;
      }

      const childCenters = children.map((child) =>
        positionNestedBranch(child.id, depth + 1),
      );
      const centeredX =
        (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
      node.position[0] = centeredX;
      return centeredX;
    };

    const rootCenterX = positionNestedBranch("project", 0);
    nodes.forEach((node) => {
      node.position[0] -= rootCenterX;
    });
  } else {
    const positionNestedRing = (parentId: string) => {
      const parent = nodeById.get(parentId);
      const children = childrenByParent.get(parentId) ?? [];
      if (!parent || children.length === 0) return;

      const [centerX, centerY, centerZ] = parent.position;
      const childY = centerY - VERTICAL_SPACING;
      if (children.length === 1) {
        children[0].position = [centerX, childY, centerZ];
        positionNestedRing(children[0].id);
        return;
      }

      const radius = Math.max(MIN_RING_RADIUS, children.length * 0.9);
      const startAngle = children.length === 2 ? 0 : Math.PI / 2;
      children.forEach((child, index) => {
        const angle =
          startAngle + (index / children.length) * Math.PI * 2;
        child.position = [
          centerX + Math.cos(angle) * radius,
          childY,
          centerZ + Math.sin(angle) * radius,
        ];
        positionNestedRing(child.id);
      });
    };

    const root = nodeById.get("project");
    if (root) root.position = [0, ROOT_Y, 0];
    positionNestedRing("project");
  }

  const visibleIds = new Set(nodes.map((node) => node.id));
  const visibleEndpointForPath = (path: string) => {
    const fileId = `file:${path}`;
    if (visibleIds.has(fileId)) return fileId;

    const folders = path.split("/");
    folders.pop();
    while (folders.length > 0) {
      const folderId = `folder:${folders.join("/")}`;
      if (visibleIds.has(folderId)) return folderId;
      folders.pop();
    }
    return "project";
  };
  const visibleImportEdges = new Set<string>();

  project.files.forEach((file) => {
    file.resolvedImports.forEach((targetPath) => {
      const sourceId = visibleEndpointForPath(file.path);
      const targetId = visibleEndpointForPath(targetPath);
      if (sourceId === targetId) return;
      const edgeKey = `${sourceId}:${targetId}`;
      if (visibleImportEdges.has(edgeKey)) return;
      visibleImportEdges.add(edgeKey);
      edges.push({
        id: `imports:${edgeKey}`,
        source: sourceId,
        target: targetId,
        kind: "imports",
      });
    });
  });

  return { nodes, edges };
}
