import {
  Braces,
  FileCode2,
  Folder,
  Layers3,
} from "lucide-react";
import { useRef, useState } from "react";
import type { VisualNode, WorkflowPosition } from "../types";

interface WorkflowNodeProps {
  node: VisualNode;
  position: WorkflowPosition;
  zoom: number;
  selected: boolean;
  freePositioning: boolean;
  onMove: (nodeId: string, position: WorkflowPosition) => void;
  onSelect: (node: VisualNode) => void;
  onToggle?: () => void;
}

interface NodeDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: WorkflowPosition;
  moved: boolean;
}

function NodeIcon({ node }: { node: VisualNode }) {
  if (node.kind === "project") return <Layers3 size={15} />;
  if (node.kind === "folder") return <Folder size={15} />;
  if (node.kind === "file") return <FileCode2 size={15} />;
  return <Braces size={15} />;
}

export function WorkflowNode({
  node,
  position,
  zoom,
  selected,
  freePositioning,
  onMove,
  onSelect,
  onToggle,
}: WorkflowNodeProps) {
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<NodeDragState | null>(null);
  const suppressClickRef = useRef(false);

  return (
    <button
      type="button"
      className={`two-d-node node-${node.kind} ${
        selected ? "selected" : ""
      } ${dragging ? "dragging" : ""}`}
      style={{ left: position.x, top: position.y }}
      title={
        freePositioning
          ? "Drag to reposition. Use arrow keys for precise movement."
          : undefined
      }
      onPointerDown={(event) => {
        if (!freePositioning || event.button !== 0) return;
        dragStateRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startPosition: position,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        event.stopPropagation();
      }}
      onPointerMove={(event) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = (event.clientX - drag.startX) / zoom;
        const deltaY = (event.clientY - drag.startY) / zoom;
        if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;

        drag.moved = true;
        onMove(node.id, {
          x: Math.max(20, drag.startPosition.x + deltaX),
          y: Math.max(20, drag.startPosition.y + deltaY),
        });
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        suppressClickRef.current = drag.moved;
        dragStateRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
        event.stopPropagation();
      }}
      onPointerCancel={() => {
        dragStateRef.current = null;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        if (!freePositioning) return;
        const step = event.shiftKey ? 24 : 8;
        let x = position.x;
        let y = position.y;
        if (event.key === "ArrowUp") y -= step;
        else if (event.key === "ArrowDown") y += step;
        else if (event.key === "ArrowLeft") x -= step;
        else if (event.key === "ArrowRight") x += step;
        else return;

        onMove(node.id, {
          x: Math.max(20, x),
          y: Math.max(20, y),
        });
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onSelect(node);
      }}
      onDoubleClick={onToggle}
    >
      <NodeIcon node={node} />
      <span>
        <strong>{node.label}</strong>
        <small>{node.subtitle}</small>
      </span>
    </button>
  );
}
