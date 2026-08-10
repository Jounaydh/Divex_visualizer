import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

interface WorkspaceResizerProps {
  className: string;
  label: string;
  value: number;
  min: number;
  max: number;
  panelSide: "before" | "after";
  onChange: (value: number) => void;
  onReset: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startValue: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function WorkspaceResizer({
  className,
  label,
  value,
  min,
  max,
  panelSide,
  onChange,
  onReset,
}: WorkspaceResizerProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const stopDragging = (event?: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      event &&
      event.pointerId !== drag.pointerId
    ) {
      return;
    }
    dragRef.current = null;
    if (
      event?.currentTarget.hasPointerCapture(drag.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    setDragging(false);
    document.documentElement.classList.remove("is-resizing-workspace");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Home") {
      onChange(min);
    } else if (event.key === "End") {
      onChange(max);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const step = event.shiftKey ? 32 : 8;
      const screenDirection = event.key === "ArrowRight" ? 1 : -1;
      const panelDirection = panelSide === "before" ? 1 : -1;
      onChange(
        clamp(value + step * screenDirection * panelDirection, min, max),
      );
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <div
      className={`workspace-resizer ${className} ${
        dragging ? "is-dragging" : ""
      }`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startValue: value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        document.documentElement.classList.add("is-resizing-workspace");
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const screenDelta = event.clientX - drag.startX;
        const panelDelta = panelSide === "before" ? screenDelta : -screenDelta;
        onChange(clamp(drag.startValue + panelDelta, min, max));
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onLostPointerCapture={() => {
        if (!dragRef.current) return;
        dragRef.current = null;
        setDragging(false);
        document.documentElement.classList.remove("is-resizing-workspace");
      }}
    />
  );
}
