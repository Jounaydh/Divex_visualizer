import type { VisualEdge, VisualNode } from "../../types";
import type {
  LogicalEdgeKind,
  LogicalWorkflowGraph,
} from "./buildLogicalWorkflowGraph";

export const EXECUTION_EDGE_KINDS: LogicalEdgeKind[] = [
  "starts",
  "calls",
  "creates",
];

export const LARGE_GRAPH_NODE_THRESHOLD = 450;
export const LARGE_GRAPH_EDGE_THRESHOLD = 900;
export const UNSAFE_FULL_GRAPH_NODE_THRESHOLD = 1200;
export const UNSAFE_FULL_GRAPH_EDGE_THRESHOLD = 3000;
export const PERFORMANCE_NODE_BUDGET = 180;
export const PERFORMANCE_EDGE_BUDGET = 320;
export const MAX_VIEWPORT_EDGES = 420;
export const VIEWPORT_OVERSCAN = 420;
export const FREE_PAN_PADDING = 1200;

export const edgeRenderPriority: Record<LogicalEdgeKind, number> = {
  starts: 0,
  calls: 1,
  creates: 2,
  extends: 3,
  implements: 3,
  defines: 4,
  imports: 5,
  uses: 6,
  contains: 7,
};

export interface LogicalViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FilteredLogicalGraph {
  nodes: VisualNode[];
  edges: VisualEdge[];
}

export function profileLogicalOperation<T>(
  label: string,
  operation: () => T,
) {
  const startedAt = performance.now();
  try {
    return operation();
  } finally {
    const duration = performance.now() - startedAt;
    if (import.meta.env.DEV && duration >= 50) {
      console.warn(
        `[Divex:logic-map] ${label} occupied the renderer for ${duration.toFixed(1)} ms.`,
      );
    }
  }
}

export function filterLogicalWorkflowGraph(
  graph: LogicalWorkflowGraph,
  visibleKinds: ReadonlySet<LogicalEdgeKind>,
  selectedId: string | null,
): FilteredLogicalGraph {
  const edges = graph.edges.filter((edge) => visibleKinds.has(edge.kind));
  const endpointIds = new Set(["project"]);
  edges.forEach((edge) => {
    endpointIds.add(edge.source);
    endpointIds.add(edge.target);
  });
  if (selectedId) endpointIds.add(selectedId);
  return {
    nodes: graph.nodes.filter((node) => endpointIds.has(node.id)),
    edges,
  };
}

export function isLargeLogicalGraph(graph: FilteredLogicalGraph) {
  return (
    graph.nodes.length > LARGE_GRAPH_NODE_THRESHOLD ||
    graph.edges.length > LARGE_GRAPH_EDGE_THRESHOLD
  );
}

export function isUnsafeFullLogicalGraph(graph: FilteredLogicalGraph) {
  return (
    graph.nodes.length > UNSAFE_FULL_GRAPH_NODE_THRESHOLD ||
    graph.edges.length > UNSAFE_FULL_GRAPH_EDGE_THRESHOLD
  );
}

export function scopeLogicalWorkflowGraph(
  graph: FilteredLogicalGraph,
  selectedId: string | null,
): FilteredLogicalGraph {
  const allowedNodeIds = new Set(graph.nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  [...graph.edges]
    .sort(
      (left, right) =>
        edgeRenderPriority[left.kind] - edgeRenderPriority[right.kind],
    )
    .forEach((edge) => {
      const sourceLinks = adjacency.get(edge.source) ?? [];
      sourceLinks.push(edge.target);
      adjacency.set(edge.source, sourceLinks);
      const targetLinks = adjacency.get(edge.target) ?? [];
      targetLinks.push(edge.source);
      adjacency.set(edge.target, targetLinks);
    });

  const includedIds = new Set<string>();
  const queue = [selectedId, "project"].filter(
    (id): id is string => Boolean(id && allowedNodeIds.has(id)),
  );
  let cursor = 0;
  while (
    cursor < queue.length &&
    includedIds.size < PERFORMANCE_NODE_BUDGET
  ) {
    const nodeId = queue[cursor];
    cursor += 1;
    if (includedIds.has(nodeId)) continue;
    includedIds.add(nodeId);
    (adjacency.get(nodeId) ?? []).forEach((neighborId) => {
      if (
        !includedIds.has(neighborId) &&
        queue.length < PERFORMANCE_NODE_BUDGET * 3
      ) {
        queue.push(neighborId);
      }
    });
  }

  const edges = [...graph.edges]
    .filter(
      (edge) =>
        includedIds.has(edge.source) && includedIds.has(edge.target),
    )
    .sort(
      (left, right) =>
        edgeRenderPriority[left.kind] - edgeRenderPriority[right.kind],
    )
    .slice(0, PERFORMANCE_EDGE_BUDGET);
  const connectedIds = new Set(["project"]);
  if (selectedId) connectedIds.add(selectedId);
  edges.forEach((edge) => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });

  return {
    nodes: graph.nodes.filter((node) => connectedIds.has(node.id)),
    edges,
  };
}
