import type {
  AnalyzedFile,
  AnalyzedProject,
  CodeSymbol,
  EvidenceLocation,
  LogicalRelationKind,
  VisualEdge,
  VisualNode,
} from "../../types";
import {
  fileLocation,
  lineRange,
  workspaceLocation,
} from "../../analysis/evidence";

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
  "reads",
  "writes",
  "references",
];

export const DATABASE_EDGE_KINDS: LogicalEdgeKind[] = [
  "reads",
  "writes",
  "references",
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
  reads: "Reads",
  writes: "Writes",
  references: "References",
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

const symbolLocation = (
  file: AnalyzedFile,
  symbol: CodeSymbol,
): EvidenceLocation =>
  fileLocation(
    file,
    {
      startLine: symbol.line,
      startColumn: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
    },
    symbol.id,
  );

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
  const databaseId = "database:project";
  const databaseTables = project.files.flatMap((file) =>
    file.symbols
      .filter((symbol) => symbol.kind === "table")
      .map((symbol) => ({ file, symbol })),
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

  if (databaseTables.length > 0) {
    addNode({
      id: databaseId,
      label: `${project.name} database`,
      subtitle: `${databaseTables.length} discovered ${databaseTables.length === 1 ? "table" : "tables"}`,
      kind: "database",
      parentId: "project",
      position: [0, 0, 0],
      itemCount: databaseTables.length,
    });
    addEdge({
      id: `logic:contains:project:${databaseId}`,
      source: "project",
      target: databaseId,
      kind: "contains",
      label: "contains database",
      explanation: `${project.name} contains a database schema discovered from SQL files.`,
      confidence: "exact",
      evidence: {
        provider: "workspace-index",
        confidence: "exact",
        source: workspaceLocation(project.rootPath),
        target: { uri: `database:${project.name}` },
        detail: "One or more SQL table declarations were discovered in the opened workspace.",
      },
    });
  }

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
      confidence: "exact",
      evidence: {
        provider: "workspace-index",
        confidence: "exact",
        source: workspaceLocation(project.rootPath),
        target: fileLocation(file, lineRange(file.content, 1)),
        detail: "The file was discovered inside the opened workspace during the project scan.",
      },
    });

    file.symbols.forEach((symbol) => {
      const graphParentId =
        symbol.kind === "table"
          ? databaseId
          : symbol.parentSymbolId ?? file.id;
      addNode({
        id: symbol.id,
        label: symbol.name,
        subtitle:
          symbol.kind === "column"
            ? `${symbol.dataType ?? "column"}${symbol.primaryKey ? " · primary key" : symbol.nullable === false ? " · required" : ""}`
            : `${symbol.kind} · ${file.name}:${symbol.line}`,
        kind: symbol.kind,
        path: file.path,
        parentId: graphParentId,
        position: [0, 0, 0],
      });
      const parentSymbol = symbol.parentSymbolId
        ? file.symbols.find((candidate) => candidate.id === symbol.parentSymbolId)
        : undefined;
      const evidenceProvider = file.kind === "sql" ? "sql-schema-parser" : "dart-parser";
      addEdge({
        id: `logic:defines:${symbol.parentSymbolId ?? file.id}:${symbol.id}`,
        source: symbol.parentSymbolId ?? file.id,
        target: symbol.id,
        kind: "defines",
        label: "defines",
        explanation: symbol.parentSymbolId
          ? `The containing class defines ${symbol.name}.`
          : `${file.name} defines ${symbol.name}.`,
        confidence: "exact",
        evidence: {
          provider: evidenceProvider,
          confidence: "exact",
          source: parentSymbol
            ? symbolLocation(file, parentSymbol)
            : fileLocation(file, lineRange(file.content, 1)),
          target: symbolLocation(file, symbol),
          detail:
            file.kind === "sql"
              ? "The SQL declaration was found at this exact source range."
              : "The Dart declaration was found at this exact source range.",
        },
      });
      if (symbol.kind === "table") {
        addEdge({
          id: `logic:contains:${databaseId}:${symbol.id}`,
          source: databaseId,
          target: symbol.id,
          kind: "contains",
          label: "contains table",
          explanation: `${project.name} database contains the ${symbol.name} table.`,
          confidence: "exact",
          evidence: {
            provider: "sql-schema-parser",
            confidence: "exact",
            source: { uri: `database:${project.name}` },
            target: symbolLocation(file, symbol),
            detail: "The table was discovered from a CREATE TABLE declaration.",
          },
        });
      }
      if (symbol.name === "main" && symbol.kind === "function") {
        addEdge({
          id: `logic:starts:${symbol.id}`,
          source: "project",
          target: symbol.id,
          kind: "starts",
          label: "starts here",
          explanation: `${symbol.name} is an entry point where this application starts.`,
          confidence: "exact",
          evidence: {
            provider: "entry-point-detector",
            confidence: "exact",
            source: workspaceLocation(project.rootPath),
            target: symbolLocation(file, symbol),
            detail: "An exact top-level Dart function named main was detected.",
          },
        });
      }
    });

    file.importLinks.forEach((importLink) => {
      const {
        value: importValue,
        targetPath: resolvedPath,
        line,
        column,
        endColumn,
      } = importLink;
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
        evidence: {
          provider: "dart-import-resolver",
          confidence: "exact",
          source: fileLocation(
            file,
            lineRange(file.content, line, column, endColumn),
          ),
          target: resolvedFile
            ? fileLocation(resolvedFile, lineRange(resolvedFile.content, 1))
            : { uri: importValue },
          detail: resolvedFile
            ? "The Dart import URI resolved to a file in this workspace."
            : "The import names an SDK or package dependency outside this workspace.",
        },
      });
    });
  });

  project.relationships.forEach((relationship) => {
    if (!nodeIds.has(relationship.targetId)) {
      if (relationship.kind === "references") {
        addNode({
          id: relationship.targetId,
          label: relationship.targetName,
          subtitle: "Referenced database table · outside project schema",
          kind: "table",
          path: relationship.targetPath,
          parentId: databaseTables.length > 0 ? databaseId : "project",
          position: [0, 0, 0],
        });
      }
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
      if (!nodeIds.has(relationship.targetId)) {
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
      }
      if (packageId) {
        addEdge({
          id: `logic:contains:${packageId}:${relationship.targetId}`,
          source: packageId,
          target: relationship.targetId,
          kind: "contains",
          label: "provides",
          explanation: `${externalPackageLabel(relationship.targetPath ?? "")} provides ${relationship.targetName}.`,
          confidence: relationship.confidence,
          evidence: {
            provider: relationship.evidence.provider,
            confidence: relationship.confidence,
            source: { uri: relationship.targetPath ?? packageId },
            target: relationship.evidence.target ?? {
              uri: relationship.targetPath ?? relationship.targetName,
            },
            detail: `The external API was grouped under its providing package. ${relationship.evidence.detail}`,
          },
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
      evidence: relationship.evidence,
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
    reads: "Shows code loading records from a database table.",
    writes: "Shows code inserting, updating, or deleting database records.",
    references: "Shows a database foreign-key relationship.",
  };
  return descriptions[kind];
}
