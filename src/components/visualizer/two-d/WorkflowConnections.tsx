import type {
  VisualEdge,
  WorkflowDirection,
  WorkflowPosition,
} from "../../../types";
import { createTwoDEdgePath } from "../../../visualization/twoDLayout";

interface WorkflowConnectionsProps {
  edges: VisualEdge[];
  positions: ReadonlyMap<string, WorkflowPosition>;
  direction: WorkflowDirection;
}

export function WorkflowConnections({
  edges,
  positions,
  direction,
}: WorkflowConnectionsProps) {
  return (
    <svg className="two-d-lines" aria-hidden="true">
      {edges.map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) return null;

        return (
          <path
            key={edge.id}
            d={createTwoDEdgePath(
              source,
              target,
              direction,
              edge.kind === "imports",
            )}
            className={edge.kind === "imports" ? "import-link" : ""}
          />
        );
      })}
    </svg>
  );
}
