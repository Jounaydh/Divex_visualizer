import {
  Focus,
  Minus,
  Move,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyzedProject,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../../types";
import { buildVisualGraph } from "./buildVisualGraph";
import {
  createTwoDEdgePath,
  createTwoDLayout,
  measureTwoDStage,
  mergeTwoDPositions,
  TWO_D_NODE_HEIGHT,
  TWO_D_NODE_WIDTH,
} from "./twoDLayout";
import { WorkflowNode } from "../../components/WorkflowNode";
import { useAnchoredZoom } from "../viewport/useAnchoredZoom";

interface TwoDVisualizerProps {
  project: AnalyzedProject;
  expandedFolders: Set<string>;
  expandedFiles: Set<string>;
  selectedId: string | null;
  zoom: number;
  direction: WorkflowDirection;
  freePositioning: boolean;
  customPositions: Readonly<Record<string, WorkflowPosition>>;
  onZoomChange: (zoom: number) => void;
  onCustomPositionsChange: (
    positions: Record<string, WorkflowPosition>,
  ) => void;
  onSelectNode: (node: VisualNode) => void;
  onToggleFolder: (id: string) => void;
  onToggleFile: (id: string) => void;
  autoFocusOnLayout?: boolean;
}

const DEFAULT_ZOOM = 1.4;
const MIN_MANUAL_ZOOM = 0.55;
const MAX_ZOOM = 1.8;

export function TwoDVisualizer({
  project,
  expandedFolders,
  expandedFiles,
  selectedId,
  zoom,
  direction,
  freePositioning,
  customPositions,
  onZoomChange,
  onCustomPositionsChange,
  onSelectNode,
  onToggleFolder,
  onToggleFile,
  autoFocusOnLayout = true,
}: TwoDVisualizerProps) {
  const [isPanning, setIsPanning] = useState(false);
  const graph = useMemo(
    () => buildVisualGraph(project, expandedFolders, expandedFiles),
    [project, expandedFolders, expandedFiles],
  );
  const customPositionsRef = useRef(customPositions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<ReadonlyMap<string, WorkflowPosition>>(
    new Map(),
  );
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  useEffect(() => {
    customPositionsRef.current = customPositions;
  }, [customPositions]);

  const automaticLayout = useMemo(
    () => createTwoDLayout(graph.nodes, direction),
    [direction, graph.nodes],
  );
  const positions = useMemo(
    () =>
      mergeTwoDPositions(
        graph.nodes,
        automaticLayout.positions,
        customPositions,
      ),
    [automaticLayout.positions, customPositions, graph.nodes],
  );
  const stage = useMemo(
    () => measureTwoDStage(automaticLayout, positions),
    [automaticLayout, positions],
  );
  const {
    zoomRef,
    changeZoom,
    changeZoomByStep,
    handleControlWheel,
  } = useAnchoredZoom({
    scrollRef,
    zoom,
    minZoom: MIN_MANUAL_ZOOM,
    maxZoom: MAX_ZOOM,
    onZoomChange,
  });
  positionsRef.current = positions;

  const focusNode = useCallback(
    (nodeId: string, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;
      const position = positionsRef.current.get(nodeId);
      if (!container || !position) return;
      const currentZoom = zoomRef.current;
      container.scrollTo({
        left:
          (position.x + TWO_D_NODE_WIDTH / 2) * currentZoom -
          container.clientWidth / 2,
        top:
          (position.y + TWO_D_NODE_HEIGHT / 2) * currentZoom -
          container.clientHeight / 2,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    if (!autoFocusOnLayout) return;
    const frame = window.requestAnimationFrame(() => {
      focusNode(selectedId ?? "project");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    direction,
    autoFocusOnLayout,
    focusNode,
    selectedId,
    automaticLayout.height,
    automaticLayout.width,
  ]);

  useEffect(() => {
    if (autoFocusOnLayout || !selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      focusNode(selectedId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusOnLayout, direction, focusNode, selectedId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (handleControlWheel(event)) return;

      if (event.shiftKey && Math.abs(event.deltaX) < 0.01) {
        event.preventDefault();
        const distance =
          event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
            ? event.deltaY
            : event.deltaY * 16;
        container.scrollBy({ left: distance, behavior: "auto" });
      }
      // Let the browser handle ordinary wheel and trackpad gestures natively.
      // This preserves vertical scrolling and simultaneous two-axis movement.
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleControlWheel]);

  const updateCustomPosition = (
    nodeId: string,
    position: WorkflowPosition,
  ) => {
    const nextPositions = {
      ...customPositionsRef.current,
      [nodeId]: position,
    };
    customPositionsRef.current = nextPositions;
    onCustomPositionsChange(nextPositions);
  };

  return (
    <div
      className={`two-d-view ${freePositioning ? "free-positioning" : ""}`}
    >
      <div
        className={`two-d-scroll ${isPanning ? "panning" : ""}`}
        ref={scrollRef}
        tabIndex={0}
        aria-label="Scrollable 2D flow"
        onKeyDown={(event) => {
          const container = event.currentTarget;
          const distance = event.shiftKey ? 120 : 52;
          if (event.key === "ArrowUp") container.scrollTop -= distance;
          else if (event.key === "ArrowDown") container.scrollTop += distance;
          else if (event.key === "ArrowLeft") container.scrollLeft -= distance;
          else if (event.key === "ArrowRight") container.scrollLeft += distance;
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          ) {
            return;
          }
          panStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsPanning(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const pan = panStateRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          event.currentTarget.scrollLeft =
            pan.scrollLeft - (event.clientX - pan.startX);
          event.currentTarget.scrollTop =
            pan.scrollTop - (event.clientY - pan.startY);
        }}
        onPointerUp={(event) => {
          if (panStateRef.current?.pointerId !== event.pointerId) return;
          panStateRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsPanning(false);
        }}
        onPointerCancel={(event) => {
          if (panStateRef.current?.pointerId !== event.pointerId) return;
          panStateRef.current = null;
          setIsPanning(false);
        }}
      >
        <div
          className="two-d-zoom-space"
          style={{
            width: stage.width * zoom,
            height: stage.height * zoom,
          }}
        >
          <div
            className="two-d-stage"
            style={{
              width: stage.width,
              height: stage.height,
              transform: `scale(${zoom})`,
            }}
          >
            <svg className="two-d-lines" aria-hidden="true">
              {graph.edges.map((edge) => {
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
            {graph.nodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const toggle =
                node.kind === "folder"
                  ? () => onToggleFolder(node.id)
                  : node.kind === "file"
                    ? () => onToggleFile(node.id)
                    : undefined;

              return (
                <WorkflowNode
                  key={node.id}
                  node={node}
                  position={position}
                  zoom={zoom}
                  selected={selectedId === node.id}
                  freePositioning={freePositioning}
                  onMove={updateCustomPosition}
                  onSelect={onSelectNode}
                  onToggle={toggle}
                />
              );
            })}
          </div>
        </div>
      </div>
      {freePositioning && (
        <div className="positioning-hint">
          <Move size={14} />
          Free positioning on
          <span>Drag cards to arrange</span>
        </div>
      )}
      <div className="two-d-zoom-controls">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => changeZoomByStep(-1)}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="zoom-value"
          aria-label="Reset zoom"
          onClick={() => changeZoom(DEFAULT_ZOOM)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => changeZoomByStep(1)}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          aria-label="Focus selected item"
          onClick={() => focusNode(selectedId ?? "project")}
        >
          <Focus size={14} />
        </button>
      </div>
    </div>
  );
}
