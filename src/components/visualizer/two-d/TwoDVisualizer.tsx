import { Focus, Minus, Move, Plus } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type {
  AnalyzedProject,
  VisualNode,
  WorkflowDirection,
  WorkflowPosition,
} from "../../../types";
import { buildVisualGraph } from "../../../visualization/buildVisualGraph";
import {
  createTwoDLayout,
  measureTwoDStage,
  mergeTwoDPositions,
} from "../../../visualization/twoDLayout";
import { WorkflowConnections } from "./WorkflowConnections";
import { WorkflowNode } from "./WorkflowNode";
import {
  clampTwoDZoom,
  DEFAULT_TWO_D_ZOOM,
  useTwoDViewport,
} from "./useTwoDViewport";

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
}

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
}: TwoDVisualizerProps) {
  const graph = useMemo(
    () => buildVisualGraph(project, expandedFolders, expandedFiles),
    [project, expandedFolders, expandedFiles],
  );
  const customPositionsRef = useRef(customPositions);

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
    scrollRef,
    isPanning,
    focusNode,
    handleKeyDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useTwoDViewport({
    positions,
    zoom,
    selectedId,
    layoutWidth: automaticLayout.width,
    layoutHeight: automaticLayout.height,
    direction,
    onZoomChange,
  });

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
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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
            <WorkflowConnections
              edges={graph.edges}
              positions={positions}
              direction={direction}
            />
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
          onClick={() => onZoomChange(clampTwoDZoom(zoom - 0.1))}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="zoom-value"
          aria-label="Reset zoom"
          onClick={() => onZoomChange(DEFAULT_TWO_D_ZOOM)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => onZoomChange(clampTwoDZoom(zoom + 0.1))}
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
