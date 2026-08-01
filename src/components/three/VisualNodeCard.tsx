import { Html } from "@react-three/drei";
import type { VisualNode } from "../../types";

interface VisualNodeCardProps {
  node: VisualNode;
  selected: boolean;
  open: boolean;
  onSelect: () => void;
  onToggle?: () => void;
}

export function VisualNodeCard({
  node,
  selected,
  open,
  onSelect,
  onToggle,
}: VisualNodeCardProps) {
  const expandable = node.kind === "folder" || node.kind === "file";
  const firstLetter =
    node.label.replace(/^[^a-zA-Z0-9]+/, "").charAt(0).toUpperCase() || "•";

  return (
    <Html
      position={node.position}
      center
      transform
      sprite
      distanceFactor={11}
      zIndexRange={[40, 0]}
    >
      <button
        type="button"
        aria-label={`${node.kind} ${node.label}`}
        className={`visual-node node-${node.kind} ${
          selected ? "selected" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onSelect();
          if (expandable) onToggle?.();
        }}
      >
        <span className="node-letter">{firstLetter}</span>
        <span className="node-tooltip">
          <strong>{node.label}</strong>
          <small>{node.subtitle}</small>
        </span>
        {expandable && (
          <span className="node-expansion-state" aria-hidden="true">
            {open ? "−" : "+"}
          </span>
        )}
      </button>
    </Html>
  );
}
