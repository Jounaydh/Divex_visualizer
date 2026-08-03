import type {
  AnalyzedProject,
  LogicalRelationKind,
  VisualEdge,
  VisualNode,
} from "../types";

export type LogicalEdgeKind = VisualEdge["kind"];

export interface LogicalWorkflowGraph {
  nodes: VisualNode[];
  edges: VisualEdge[];
  counts: Record<LogicalEdgeKind, number>;
}

export const LOGICAL_EDGE_KINDS: LogicalEdgeKind[] = [
  "starts",
  "defines",
  "contains",
  "imports",
  "calls",
  "creates",
  "extends",
  "implements",
  "uses",
];

export const LOGICAL_EDGE_LABELS: Record<LogicalEdgeKind, string> = {
  starts: "Starts",
  defines: "Defines",
  contains: "Contains",
  imports: "Imports",
  calls: "Calls",
  creates: "Creates",
  extends: "Extends",
  implements: "Implements",
  uses: "Uses",
};

const externalPackageId = (importValue: string) =>
  `external-package:${importValue}`;

const externalPackageLabel = (importValue: string) => {
  if (importValue.startsWith("package:")) {
    return importValue.slice("package:".length).split("/")[0];
  }
  if (importValue.startsWith("dart:")) return importValue;
  return importValue.split("/").at(-1) ?? importValue;
};

export function buildLogicalWorkflowGraph(
  project: AnalyzedProject,
): LogicalWorkflowGraph {
  const nodes: VisualNode[] = [
    {
      id: "project",
      label: project.name,
      subtitle: "Application start",
      kind: "project",
      position: [0, 0, 0],
      itemCount: project.files.length,
    },
  ];
  const edges: VisualEdge[] = [];
  const nodeIds = new Set(["project"]);
  const edgeIds = new Set<string>();
  const fileByPath = new Map(
    project.files.map((file) => [file.path, file]),
  );

  const addNode = (node: VisualNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const addEdge = (edge: VisualEdge) => {
    if (edgeIds.has(edge.id)) return;
    edgeIds.add(edge.id);
    edges.push(edge);
  };

  project.files.forEach((file) => {
    addNode({
      id: file.id,
      label: file.name,
      subtitle: file.path,
      kind: "file",
      path: file.path,
      parentId: "project",
      position: [0, 0, 0],
      itemCount: file.symbols.length,
    });
    addEdge({
      id: `logic:contains:project:${file.id}`,
      source: "project",
      target: file.id,
      kind: "contains",
      label: "contains",
      explanation: `${project.name} contains ${file.path}.`,
    });

    file.symbols.forEach((symbol) => {
      addNode({
        id: symbol.id,
        label: symbol.name,
        subtitle: `${symbol.kind} · ${file.name}:${symbol.line}`,
        kind: symbol.kind,
        path: file.path,
        parentId: symbol.parentSymbolId ?? file.id,
        position: [0, 0, 0],
      });
      addEdge({
        id: `logic:defines:${symbol.parentSymbolId ?? file.id}:${symbol.id}`,
        source: symbol.parentSymbolId ?? file.id,
        target: symbol.id,
        kind: "defines",
        label: "defines",
        explanation: symbol.parentSymbolId
          ? `The containing class defines ${symbol.name}.`
          : `${file.name} defines ${symbol.name}.`,
      });
      if (symbol.name === "main" && symbol.kind === "function") {
        addEdge({
          id: `logic:starts:${symbol.id}`,
          source: "project",
          target: symbol.id,
          kind: "starts",
          label: "starts here",
          explanation: `${symbol.name} is an entry point where this application starts.`,
          confidence: "exact",
        });
      }
    });

    file.importLinks.forEach(({ value: importValue, targetPath: resolvedPath }) => {
      const resolvedFile = resolvedPath
        ? fileByPath.get(resolvedPath)
        : undefined;
      let targetId = resolvedFile?.id;

      if (!targetId) {
        targetId = externalPackageId(importValue);
        addNode({
          id: targetId,
          label: externalPackageLabel(importValue),
          subtitle: "External dependency",
          kind: "external",
          path: importValue,
          parentId: "project",
          position: [0, 0, 0],
        });
      }

      addEdge({
        id: `logic:imports:${file.id}:${targetId}`,
        source: file.id,
        target: targetId,
        kind: "imports",
        label: "imports",
        explanation: `${file.name} imports ${externalPackageLabel(importValue)} so it can use code from it.`,
        confidence: "exact",
      });
    });
  });

  project.relationships.forEach((relationship) => {
    if (!nodeIds.has(relationship.targetId)) {
      const packageId = relationship.targetPath
        ? externalPackageId(relationship.targetPath)
        : undefined;
      if (packageId && !nodeIds.has(packageId)) {
        addNode({
          id: packageId,
          label: externalPackageLabel(relationship.targetPath ?? ""),
          subtitle: "External dependency",
          kind: "external",
          path: relationship.targetPath,
          parentId: "project",
          position: [0, 0, 0],
        });
      }
      addNode({
        id: relationship.targetId,
        label: relationship.targetName,
        subtitle: relationship.targetPath
          ? `External API · ${externalPackageLabel(relationship.targetPath)}`
          : "External or inferred API",
        kind: "external",
        path: relationship.targetPath,
        parentId: packageId,
        position: [0, 0, 0],
      });
      if (packageId) {
        addEdge({
          id: `logic:contains:${packageId}:${relationship.targetId}`,
          source: packageId,
          target: relationship.targetId,
          kind: "contains",
          label: "provides",
          explanation: `${externalPackageLabel(relationship.targetPath ?? "")} provides ${relationship.targetName}.`,
        });
      }
    }

    addEdge({
      id: relationship.id,
      source: relationship.sourceId,
      target: relationship.targetId,
      kind: relationship.kind,
      label: LOGICAL_EDGE_LABELS[relationship.kind].toLowerCase(),
      explanation: relationship.explanation,
      confidence: relationship.confidence,
    });
  });

  const counts = Object.fromEntries(
    LOGICAL_EDGE_KINDS.map((kind) => [kind, 0]),
  ) as Record<LogicalEdgeKind, number>;
  edges.forEach((edge) => {
    counts[edge.kind] += 1;
  });

  return { nodes, edges, counts };
}

export function logicalRelationDescription(kind: LogicalRelationKind) {
  const descriptions: Record<LogicalRelationKind, string> = {
    starts: "Shows the application entry point.",
    defines: "Shows where a function, class, method, or API is declared.",
    imports: "Shows which files or packages make code available.",
    calls: "Shows one function or method running another.",
    creates: "Shows where an object or widget is constructed.",
    extends: "Shows inherited class behavior.",
    implements: "Shows a class contract that must be fulfilled.",
    uses: "Shows a type or code part referenced by another.",
  };
  return descriptions[kind];
}
